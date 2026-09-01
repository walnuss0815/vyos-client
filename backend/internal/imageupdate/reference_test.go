package imageupdate

import "testing"

func TestParseReference(t *testing.T) {
	tests := []struct {
		name  string
		image string
		want  Reference
	}{
		{
			name:  "unqualified docker hub official image",
			image: "nginx:1.25.3",
			want: Reference{
				RegistryName: "docker.io",
				APIHost:      "registry-1.docker.io",
				Repository:   "library/nginx",
				Tag:          "1.25.3",
			},
		},
		{
			name:  "unqualified docker hub image with no tag defaults to latest",
			image: "nginx",
			want: Reference{
				RegistryName: "docker.io",
				APIHost:      "registry-1.docker.io",
				Repository:   "library/nginx",
				Tag:          "latest",
			},
		},
		{
			name:  "docker hub user/org image needs no library/ prefix",
			image: "someorg/someapp:1.0.0",
			want: Reference{
				RegistryName: "docker.io",
				APIHost:      "registry-1.docker.io",
				Repository:   "someorg/someapp",
				Tag:          "1.0.0",
			},
		},
		{
			name:  "explicit docker.io host behaves the same as implicit",
			image: "docker.io/library/nginx:1.25.3",
			want: Reference{
				RegistryName: "docker.io",
				APIHost:      "registry-1.docker.io",
				Repository:   "library/nginx",
				Tag:          "1.25.3",
			},
		},
		{
			name:  "ghcr.io image",
			image: "ghcr.io/walnuss0815/vyos-client:1.2.3",
			want: Reference{
				RegistryName: "ghcr.io",
				APIHost:      "ghcr.io",
				Repository:   "walnuss0815/vyos-client",
				Tag:          "1.2.3",
			},
		},
		{
			name:  "self-hosted registry with a port is not mistaken for a tag",
			image: "myregistry.example.com:5000/team/app:v1.2.3",
			want: Reference{
				RegistryName: "myregistry.example.com:5000",
				APIHost:      "myregistry.example.com:5000",
				Repository:   "team/app",
				Tag:          "v1.2.3",
			},
		},
		{
			name:  "self-hosted registry with a port and no tag",
			image: "myregistry.example.com:5000/team/app",
			want: Reference{
				RegistryName: "myregistry.example.com:5000",
				APIHost:      "myregistry.example.com:5000",
				Repository:   "team/app",
				Tag:          "latest",
			},
		},
		{
			name:  "localhost registry",
			image: "localhost/app:latest",
			want: Reference{
				RegistryName: "localhost",
				APIHost:      "localhost",
				Repository:   "app",
				Tag:          "latest",
			},
		},
		{
			name:  "digest-pinned reference has no usable tag",
			image: "nginx@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			want: Reference{
				RegistryName: "docker.io",
				APIHost:      "registry-1.docker.io",
				Repository:   "library/nginx",
				Tag:          "latest",
				HasDigest:    true,
			},
		},
		{
			name:  "tag and digest both present",
			image: "nginx:1.25.3@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			want: Reference{
				RegistryName: "docker.io",
				APIHost:      "registry-1.docker.io",
				Repository:   "library/nginx",
				Tag:          "1.25.3",
				HasDigest:    true,
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ParseReference(tt.image)
			if err != nil {
				t.Fatalf("ParseReference(%q): %v", tt.image, err)
			}
			if got != tt.want {
				t.Errorf("ParseReference(%q) = %+v, want %+v", tt.image, got, tt.want)
			}
		})
	}
}

func TestParseReference_Errors(t *testing.T) {
	for _, image := range []string{"", "   ", "@sha256:abc"} {
		if _, err := ParseReference(image); err == nil {
			t.Errorf("ParseReference(%q): expected an error, got none", image)
		}
	}
}

func TestReplaceTag(t *testing.T) {
	tests := []struct {
		image  string
		newTag string
		want   string
	}{
		{"nginx:1.25.3", "1.26.0", "nginx:1.26.0"},
		{"nginx", "1.26.0", "nginx:1.26.0"},
		{"ghcr.io/org/app:v1.0.0", "v1.1.0", "ghcr.io/org/app:v1.1.0"},
		{"myregistry.example.com:5000/team/app:1.0.0", "1.1.0", "myregistry.example.com:5000/team/app:1.1.0"},
		{"myregistry.example.com:5000/team/app", "1.1.0", "myregistry.example.com:5000/team/app:1.1.0"},
	}
	for _, tt := range tests {
		got, err := ReplaceTag(tt.image, tt.newTag)
		if err != nil {
			t.Fatalf("ReplaceTag(%q, %q): %v", tt.image, tt.newTag, err)
		}
		if got != tt.want {
			t.Errorf("ReplaceTag(%q, %q) = %q, want %q", tt.image, tt.newTag, got, tt.want)
		}
	}
}

func TestReplaceTag_RejectsDigestPinnedReference(t *testing.T) {
	if _, err := ReplaceTag("nginx@sha256:aaaa", "1.26.0"); err == nil {
		t.Error("expected an error for a digest-pinned reference")
	}
}
