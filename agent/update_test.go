package main

import "testing"

func TestIsNewer(t *testing.T) {
	cases := []struct {
		cur, latest string
		want        bool
	}{
		{"dev", "0.1.0", true},
		{"0.1.0", "0.1.0", false},
		{"0.1.0", "v0.1.1", true},
		{"v0.2.0", "0.1.9", false},
		{"0.1.0", "0.2.0", true},
		{"1.0.0", "1.0.0-rc.1", false}, // pre-release stripped → equal core
		{"0.0.0-abc", "0.1.0", true},
		{"0.1.0", "not-a-version", false},
	}
	for _, tc := range cases {
		got := isNewer(tc.cur, tc.latest)
		if got != tc.want {
			t.Fatalf("isNewer(%q, %q)=%v want %v", tc.cur, tc.latest, got, tc.want)
		}
	}
}

func TestAllowedDownloadURL(t *testing.T) {
	ok := "https://github.com/rayenking/nabooth-print-agent/releases/download/v0.1.0/nabooth-print-agent-darwin-arm64"
	if !allowedDownloadURL(ok) {
		t.Fatal("expected release URL allowed")
	}
	if allowedDownloadURL("https://evil.example/x") {
		t.Fatal("expected foreign host rejected")
	}
	if allowedDownloadURL("https://github.com/other/repo/releases/download/v1/x") {
		t.Fatal("expected other repo rejected")
	}
}

func TestAssetNameForRuntime(t *testing.T) {
	name := assetNameForRuntime()
	if name == "" || !containsAll(name, "nabooth-print-agent-") {
		t.Fatalf("unexpected asset name %q", name)
	}
}

func containsAll(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || len(sub) == 0 ||
		(len(s) > 0 && (func() bool {
			for i := 0; i+len(sub) <= len(s); i++ {
				if s[i:i+len(sub)] == sub {
					return true
				}
			}
			return false
		})()))
}
