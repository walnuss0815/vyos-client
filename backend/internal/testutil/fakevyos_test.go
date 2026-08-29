package testutil_test

import (
	"context"
	"testing"

	"github.com/walnuss0815/vyos-client/backend/internal/testutil"
	"github.com/walnuss0815/vyos-client/backend/internal/vyos"
)

// TestFakeVyOS_RequestsIsBounded guards against unbounded memory growth
// in FakeVyOS.Requests, which matters because this struct is also
// reused as a long-running process by cmd/mock-vyos for docker-compose
// local dev sessions (not just short-lived go test runs). It must
// still behave exactly like an unbounded log for the common case of
// checking the most recently made request, which is the only thing any
// existing test does with it.
func TestFakeVyOS_RequestsIsBounded(t *testing.T) {
	fake := testutil.New("test-key")
	defer fake.Close()

	c, err := vyos.New(vyos.Config{BaseURL: fake.URL(), APIKey: "test-key"})
	if err != nil {
		t.Fatalf("vyos.New: %v", err)
	}
	ctx := context.Background()

	const totalRequests = 1200 // comfortably over the 1000-entry bound
	for i := 0; i < totalRequests; i++ {
		if _, err := c.Exists(ctx, []string{"system", "host-name"}); err != nil {
			t.Fatalf("Exists request %d: %v", i, err)
		}
	}

	if len(fake.Requests) > 1000 {
		t.Errorf("len(Requests) = %d, want <= 1000", len(fake.Requests))
	}
	if len(fake.Requests) == 0 {
		t.Fatal("expected at least some requests to be retained")
	}
	last := fake.Requests[len(fake.Requests)-1]
	if last.Endpoint != "/retrieve" {
		t.Errorf("most recent recorded request endpoint = %q, want /retrieve", last.Endpoint)
	}
}
