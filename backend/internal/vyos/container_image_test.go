package vyos_test

import (
	"context"
	"testing"

	"github.com/walnuss0815/vyos-client/backend/internal/testutil"
	"github.com/walnuss0815/vyos-client/backend/internal/vyos"
)

func TestShowContainerImages(t *testing.T) {
	fake := testutil.New("test-key")
	defer fake.Close()
	c := newTestClient(t, fake)

	fake.ShowOutputs["container image json"] = `[
		{"Id": "abc123", "Names": ["docker.io/library/busybox:latest"], "Size": 4690894, "Containers": 0, "Created": 1778638909},
		{"Id": "def456", "RepoTags": ["docker.io/library/nginx:latest"], "Size": 12345, "Containers": 2, "Created": 1778638900}
	]`

	got, err := c.ShowContainerImages(context.Background())
	if err != nil {
		t.Fatalf("ShowContainerImages: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("len(got) = %d, want 2", len(got))
	}
	if got[0].ID != "abc123" || got[0].SizeBytes != 4690894 || got[0].Containers != 0 {
		t.Errorf("got[0] = %+v", got[0])
	}
	// "Names" (populated here, matching real podman 5.8.6 behavior for
	// a freshly-tagged image) takes priority over "RepoTags".
	if tags := got[0].Tags(); len(tags) != 1 || tags[0] != "docker.io/library/busybox:latest" {
		t.Errorf("got[0].Tags() = %v, want [docker.io/library/busybox:latest]", tags)
	}
	// The second entry only has RepoTags set - confirms the fallback.
	if tags := got[1].Tags(); len(tags) != 1 || tags[0] != "docker.io/library/nginx:latest" {
		t.Errorf("got[1].Tags() = %v, want [docker.io/library/nginx:latest]", tags)
	}
}

func TestContainerImage_TagsFallsBackToNoneWhenNeitherFieldIsSet(t *testing.T) {
	img := vyos.ContainerImage{ID: "abc123"}
	tags := img.Tags()
	if len(tags) != 1 || tags[0] != "<none>" {
		t.Errorf("Tags() = %v, want [<none>]", tags)
	}
}

func TestShowContainerImages_EmptyListDecodesCleanly(t *testing.T) {
	fake := testutil.New("test-key")
	defer fake.Close()
	c := newTestClient(t, fake)

	fake.ShowOutputs["container image json"] = ""

	got, err := c.ShowContainerImages(context.Background())
	if err != nil {
		t.Fatalf("ShowContainerImages: %v", err)
	}
	if got == nil {
		t.Error("got = nil, want non-nil empty slice")
	}
	if len(got) != 0 {
		t.Errorf("len(got) = %d, want 0", len(got))
	}
}

func TestPullContainerImage(t *testing.T) {
	fake := testutil.New("test-key")
	defer fake.Close()
	c := newTestClient(t, fake)

	fake.ContainerImageAddOutputs["docker.io/library/nginx:latest"] = "Pulling nginx...\nDone.\n"

	got, err := c.PullContainerImage(context.Background(), "docker.io/library/nginx:latest")
	if err != nil {
		t.Fatalf("PullContainerImage: %v", err)
	}
	if got != "Pulling nginx...\nDone.\n" {
		t.Errorf("got = %q", got)
	}
}

func TestPullContainerImage_PropagatesVyOSError(t *testing.T) {
	fake := testutil.New("test-key")
	defer fake.Close()
	c := newTestClient(t, fake)

	fake.ContainerImageAddErrors["nonexistent/image:tag"] = "Error: image not known"

	_, err := c.PullContainerImage(context.Background(), "nonexistent/image:tag")
	if err == nil {
		t.Fatal("expected an error")
	}
	apiErr, ok := err.(*vyos.APIError)
	if !ok {
		t.Fatalf("expected *vyos.APIError, got %T: %v", err, err)
	}
	if apiErr.Message != "Error: image not known" {
		t.Errorf("Message = %q, want %q", apiErr.Message, "Error: image not known")
	}
}

func TestDeleteContainerImage(t *testing.T) {
	fake := testutil.New("test-key")
	defer fake.Close()
	c := newTestClient(t, fake)

	fake.ContainerImageDeleteOutputs["abc123"] = ""

	_, err := c.DeleteContainerImage(context.Background(), "abc123")
	if err != nil {
		t.Fatalf("DeleteContainerImage: %v", err)
	}
}

func TestDeleteContainerImage_PropagatesInUseError(t *testing.T) {
	fake := testutil.New("test-key")
	defer fake.Close()
	c := newTestClient(t, fake)

	fake.ContainerImageDeleteErrors["abc123"] = `Cannot delete image "abc123" because it is currently being used by container "def456"!`

	_, err := c.DeleteContainerImage(context.Background(), "abc123")
	if err == nil {
		t.Fatal("expected an error")
	}
	apiErr, ok := err.(*vyos.APIError)
	if !ok {
		t.Fatalf("expected *vyos.APIError, got %T: %v", err, err)
	}
	if apiErr.Message == "" {
		t.Error("expected a non-empty error message describing the in-use conflict")
	}
}
