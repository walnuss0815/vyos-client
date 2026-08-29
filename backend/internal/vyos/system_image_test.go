package vyos_test

import (
	"context"
	"testing"

	"github.com/walnuss0815/vyos-client/backend/internal/testutil"
	"github.com/walnuss0815/vyos-client/backend/internal/vyos"
)

// systemImageFixture mirrors the real `show system image` output shown
// in docs.vyos.io's Image Management page: the currently-running/
// default-boot image gets "Yes" in both trailing columns, every other
// installed image's row is simply shorter (no trailing columns at
// all), not padded with "No".
const systemImageFixture = `Name                     Default boot    Running
-----------------------  --------------  ---------
2025.07.16-0020-rolling  Yes             Yes
1.4.1
1.4.0`

func TestShowSystemImages(t *testing.T) {
	fake := testutil.New("test-key")
	defer fake.Close()
	c := newTestClient(t, fake)

	fake.ShowOutputs["system image"] = systemImageFixture

	got, err := c.ShowSystemImages(context.Background())
	if err != nil {
		t.Fatalf("ShowSystemImages: %v", err)
	}
	want := []vyos.SystemImage{
		{Name: "2025.07.16-0020-rolling", IsDefaultBoot: true, IsRunning: true},
		{Name: "1.4.1", IsDefaultBoot: false, IsRunning: false},
		{Name: "1.4.0", IsDefaultBoot: false, IsRunning: false},
	}
	if len(got) != len(want) {
		t.Fatalf("len(got) = %d, want %d: %+v", len(got), len(want), got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("got[%d] = %+v, want %+v", i, got[i], want[i])
		}
	}
}

func TestShowSystemImages_EmptyOutputDecodesCleanly(t *testing.T) {
	fake := testutil.New("test-key")
	defer fake.Close()
	c := newTestClient(t, fake)

	fake.ShowOutputs["system image"] = ""

	got, err := c.ShowSystemImages(context.Background())
	if err != nil {
		t.Fatalf("ShowSystemImages: %v", err)
	}
	if len(got) != 0 {
		t.Errorf("len(got) = %d, want 0", len(got))
	}
}

func TestAddSystemImage(t *testing.T) {
	fake := testutil.New("test-key")
	defer fake.Close()
	c := newTestClient(t, fake)

	url := "https://downloads.vyos.io/rolling/current/amd64/vyos-rolling-latest.iso"
	fake.SystemImageAddOutputs[url] = "Trying to fetch ISO file...\nDone.\n"

	got, err := c.AddSystemImage(context.Background(), url)
	if err != nil {
		t.Fatalf("AddSystemImage: %v", err)
	}
	if got != "Trying to fetch ISO file...\nDone.\n" {
		t.Errorf("got = %q", got)
	}
}

func TestAddSystemImage_PropagatesVyOSError(t *testing.T) {
	fake := testutil.New("test-key")
	defer fake.Close()
	c := newTestClient(t, fake)

	url := "https://example.com/bad.iso"
	fake.SystemImageAddErrors[url] = "Error: not enough free disk space"

	_, err := c.AddSystemImage(context.Background(), url)
	if err == nil {
		t.Fatal("expected an error")
	}
	apiErr, ok := err.(*vyos.APIError)
	if !ok {
		t.Fatalf("expected *vyos.APIError, got %T: %v", err, err)
	}
	if apiErr.Message != "Error: not enough free disk space" {
		t.Errorf("Message = %q", apiErr.Message)
	}
}

func TestDeleteSystemImage(t *testing.T) {
	fake := testutil.New("test-key")
	defer fake.Close()
	c := newTestClient(t, fake)

	fake.SystemImageDeleteOutputs["1.4.0"] = "Deleting the \"1.4.0\" image...\nDone\n"

	got, err := c.DeleteSystemImage(context.Background(), "1.4.0")
	if err != nil {
		t.Fatalf("DeleteSystemImage: %v", err)
	}
	if got != "Deleting the \"1.4.0\" image...\nDone\n" {
		t.Errorf("got = %q", got)
	}
}

func TestDeleteSystemImage_PropagatesVyOSError(t *testing.T) {
	fake := testutil.New("test-key")
	defer fake.Close()
	c := newTestClient(t, fake)

	fake.SystemImageDeleteErrors["2025.07.16-0020-rolling"] = "Error: cannot delete the running image"

	_, err := c.DeleteSystemImage(context.Background(), "2025.07.16-0020-rolling")
	if err == nil {
		t.Fatal("expected an error")
	}
	apiErr, ok := err.(*vyos.APIError)
	if !ok {
		t.Fatalf("expected *vyos.APIError, got %T: %v", err, err)
	}
	if apiErr.Message == "" {
		t.Error("expected a non-empty error message")
	}
}
