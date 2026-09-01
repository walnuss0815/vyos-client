package main

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/walnuss0815/vyos-client/backend/internal/api"
	"github.com/walnuss0815/vyos-client/backend/internal/auth"
	"github.com/walnuss0815/vyos-client/backend/internal/config"
	"github.com/walnuss0815/vyos-client/backend/internal/imageupdate"
	"github.com/walnuss0815/vyos-client/backend/internal/notifications"
	"github.com/walnuss0815/vyos-client/backend/internal/selfupgrade"
	"github.com/walnuss0815/vyos-client/backend/internal/vyos"
	"github.com/walnuss0815/vyos-client/backend/internal/webapp"
)

func runServer() error {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	cfg, err := config.Load(nil)
	if err != nil {
		return err
	}
	// See resolveSessionSecret's own doc comment for the three-tier
	// resolution this implements (explicit SESSION_SECRET > a secret
	// persisted under DATA_DIR > today's ephemeral-random fallback).
	// sessionSecret (not cfg.SessionSecret) is what actually gets
	// wired into auth.NewSessionManager below.
	sessionSecret, sessionSecretEphemeral, err := resolveSessionSecret(cfg)
	if err != nil {
		return fmt.Errorf("resolving session secret: %w", err)
	}
	if sessionSecretEphemeral {
		logger.Warn("SESSION_SECRET not set; a random one was generated for this run. " +
			"All sessions will be invalidated on the next restart. Set SESSION_SECRET explicitly, " +
			"or DATA_DIR to have a generated one persisted automatically, for session persistence across restarts.")
	}
	if cfg.DataDir != "" {
		logger.Info("data directory configured", "path", cfg.DataDir)
	}
	if cfg.VyOSAPIURLUsesPlainHTTP {
		logger.Warn("VYOS_API_URL uses plain http://, not https://. This is expected for local "+
			"dev against the mock-vyos fixture, but a real VyOS API only serves HTTPS - if this "+
			"is pointed at a real router, requests will fail.", "vyos_api_url", cfg.VyOSAPIURL)
	}
	if cfg.UIAdminVarsIgnored {
		logger.Warn("UI_ADMIN_USER/UI_ADMIN_PASSWORD_HASH are set but ignored because AUTH_MODE=" +
			config.AuthModeVyOSUsers + "; unset them, or set AUTH_MODE=" + config.AuthModeStatic +
			" if you intended to use the shared admin account.")
	}
	if !cfg.TLSEnabled {
		logger.Warn("TLS_ENABLED=false; serving plain HTTP. All traffic, including login " +
			"credentials and session cookies, is unencrypted on the wire. Only run this way " +
			"behind a trusted reverse proxy that terminates TLS, or on a fully isolated/trusted " +
			"network - see docs/security.md's TLS section.")
	}
	if cfg.TLSCertFilesIgnored {
		logger.Warn("TLS_CERT_FILE/TLS_KEY_FILE are set but ignored because TLS_ENABLED=false; " +
			"either unset TLS_ENABLED (or set it to true) to actually use that certificate, or " +
			"remove the cert/key vars if plain HTTP is intentional.")
	}
	if cfg.CookieSecureUnusualCombination {
		logger.Warn("COOKIE_SECURE=false while TLS_ENABLED=true; session/CSRF cookies will not " +
			"have the Secure flag despite this listener serving real HTTPS - almost certainly not " +
			"what you want. Unset COOKIE_SECURE (it already defaults to matching TLS_ENABLED) unless " +
			"this is intentional.")
	}
	if cfg.SelfUpgradeVarsIgnored {
		logger.Warn("SELF_UPGRADE_CONTAINER_NAME/SELF_UPGRADE_GITHUB_REPO are set but ignored " +
			"because SELF_UPGRADE_ENABLED is not true; set SELF_UPGRADE_ENABLED=true to actually " +
			"turn on the System > Upgrades page, or remove these vars if that's not intended.")
	}
	if cfg.SelfUpgradeEnabled {
		logger.Info("self-upgrade enabled", "container_name", cfg.SelfUpgradeContainerName, "github_repo", cfg.SelfUpgradeGitHubRepo)
	}
	logger.Info("auth mode", "mode", cfg.AuthMode)

	vyosClient, err := vyos.New(vyos.Config{
		BaseURL:            cfg.VyOSAPIURL,
		APIKey:             cfg.VyOSAPIKey,
		InsecureSkipVerify: cfg.VyOSAPIInsecureSkipVerify,
	})
	if err != nil {
		return fmt.Errorf("configuring vyos client: %w", err)
	}

	webappHandler, err := webapp.Handler()
	if err != nil {
		return fmt.Errorf("configuring webapp handler: %w", err)
	}

	// Only constructed (and only ever makes an outbound request) when
	// the operator has explicitly opted in - see
	// config.Config.SelfUpgradeEnabled's doc comment.
	var selfUpgradeGitHub *selfupgrade.Client
	if cfg.SelfUpgradeEnabled {
		selfUpgradeGitHub, err = selfupgrade.New(selfupgrade.Config{Repo: cfg.SelfUpgradeGitHubRepo})
		if err != nil {
			return fmt.Errorf("configuring self-upgrade client: %w", err)
		}
	}

	// A single LoginLimiter instance is shared between the
	// CredentialVerifier (which records failures/successes) and
	// Server.Limiter (which handleLogin consults before even
	// attempting verification). These must be the same instance, not
	// two independently-constructed limiters, or the failures
	// recorded inside Verify never affect the Allow check handleLogin
	// actually makes, silently disabling rate limiting.
	// Constructed unconditionally - it works with no DataDir at all
	// (purely in-memory, reset on restart, same as the pre-Notifications
	// behavior of having no such feature) and only persists to disk
	// when DataDir is configured. See internal/notifications.Store's
	// own doc comment.
	notificationStore, err := notifications.NewStore(notifications.Config{DataDir: cfg.DataDir})
	if err != nil {
		return fmt.Errorf("configuring notification store: %w", err)
	}

	loginLimiter := auth.NewLoginLimiter()
	// 30 commits/confirms/imports per 5 minutes per authenticated
	// user - generous enough for normal interactive use (including
	// rapid iteration while testing a change), while still bounding a
	// runaway script or compromised session's ability to hammer
	// VyOS's own commit process, which has no rate limit of its own.
	// Not yet configurable - see docs/configuration-reference.md.
	commitLimiter := auth.NewRequestLimiter(30, 5*time.Minute)
	var verifier auth.CredentialVerifier
	switch cfg.AuthMode {
	case config.AuthModeStatic:
		verifier = auth.NewStaticVerifier(cfg.UIAdminUser, cfg.UIAdminPasswordHash, loginLimiter)
	case config.AuthModeVyOSUsers:
		// vyosClient itself is reused, not a new credential - see
		// docs/security.md for why this is safe (the API key already
		// grants full config access regardless of which UI user is
		// logged in).
		verifier = auth.NewVyOSUserVerifier(vyosClient, loginLimiter)
	}

	apiServer := &api.Server{
		VyOS:     vyosClient,
		Sessions: auth.NewSessionManager(sessionSecret),
		Verifier: verifier,
		Limiter:  loginLimiter,
		Logger:   logger,
		// Defaults to matching TLSEnabled (see config.Config.CookiesSecure's
		// doc comment for why, and for the COOKIE_SECURE override that
		// lets this diverge for a TLS-terminating reverse proxy in front).
		CookiesSecure:                cfg.CookiesSecure,
		SafeApplyDefaultSeconds:      cfg.SafeApplyDefaultSeconds,
		ConfigWarningsEnabled:        cfg.ConfigWarningsEnabled,
		Version:                      version,
		SelfUpgradeEnabled:           cfg.SelfUpgradeEnabled,
		SelfUpgradeContainerName:     cfg.SelfUpgradeContainerName,
		SelfUpgradeGitHub:            selfUpgradeGitHub,
		CommitLimiter:                commitLimiter,
		ContainerUpdateChecksEnabled: cfg.ContainerUpdateChecksEnabled,
		// Unlike selfUpgradeGitHub above, this takes no per-deployment
		// configuration to build - constructed unconditionally, but
		// never actually contacts a registry unless
		// ContainerUpdateChecksEnabled is true (see
		// handleCheckContainerImageUpdate).
		ImageRegistry:      imageupdate.NewClient(imageupdate.Config{}),
		FileBrowserEnabled: cfg.FileBrowserEnabled,
		Notifications:      notificationStore,
	}

	mux := http.NewServeMux()
	apiHandler := apiServer.Routes()
	// apiHandler's own internal router (api.Server.Routes) already
	// matches "GET /healthz" itself, alongside every "POST /api/...".
	// It's mounted at both prefixes here so this outer router's table
	// stays self-documenting about which paths are backend routes at
	// all, rather than relying on a reader to know that /healthz is
	// secretly handled by the same handler as /api/.
	mux.Handle("/api/", apiHandler)
	mux.Handle("/healthz", apiHandler)
	mux.Handle("/", webappHandler)

	// Wraps EVERYTHING this process serves - the API's own JSON
	// responses and the embedded SPA's HTML/asset responses alike -
	// unlike requestLogger (applied only inside api.Server.Routes,
	// covering /api/ and /healthz), since these headers matter most
	// on the actual HTML document response, which webappHandler
	// serves directly on this outer mux.
	handler := api.SecurityHeaders(cfg.TLSEnabled)(mux)

	var tlsConfig *tls.Config
	if cfg.TLSEnabled {
		tlsConfig, err = buildTLSConfig(cfg, logger)
		if err != nil {
			return err
		}
	}

	srv := &http.Server{
		Addr:      cfg.ListenAddr,
		Handler:   handler,
		TLSConfig: tlsConfig,
		// Bounds every phase of a connection's lifecycle: a slow or
		// malicious client can't hold a connection open indefinitely
		// during header-read, response-write, or idle-keepalive.
		// ReadHeaderTimeout alone (the only one previously set) only
		// covers the first of these.
		ReadHeaderTimeout: 10 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	errCh := make(chan error, 1)
	go func() {
		scheme := "https"
		if !cfg.TLSEnabled {
			scheme = "http"
		}
		logger.Info("starting server", "addr", cfg.ListenAddr, "scheme", scheme, "vyos_api_url", cfg.VyOSAPIURL)
		if cfg.TLSEnabled {
			errCh <- srv.ListenAndServeTLS("", "")
		} else {
			errCh <- srv.ListenAndServe()
		}
	}()

	select {
	case err := <-errCh:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			return fmt.Errorf("server error: %w", err)
		}
	case <-ctx.Done():
		logger.Info("shutting down")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := srv.Shutdown(shutdownCtx); err != nil {
			return fmt.Errorf("shutdown: %w", err)
		}
	}
	return nil
}

func buildTLSConfig(cfg *config.Config, logger *slog.Logger) (*tls.Config, error) {
	if cfg.TLSCertFile != "" && cfg.TLSKeyFile != "" {
		cert, err := tls.LoadX509KeyPair(cfg.TLSCertFile, cfg.TLSKeyFile)
		if err != nil {
			return nil, fmt.Errorf("loading TLS certificate: %w", err)
		}
		return &tls.Config{Certificates: []tls.Certificate{cert}, MinVersion: tls.VersionTLS12}, nil
	}

	logger.Warn("no TLS_CERT_FILE/TLS_KEY_FILE configured; generating a self-signed certificate. " +
		"This is fine for evaluation, but browsers will show a certificate warning; mount a real certificate for production use.")
	cert, err := generateSelfSignedCert()
	if err != nil {
		return nil, fmt.Errorf("generating self-signed certificate: %w", err)
	}
	return &tls.Config{Certificates: []tls.Certificate{cert}, MinVersion: tls.VersionTLS12}, nil
}
