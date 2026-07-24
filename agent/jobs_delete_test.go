package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDeleteJobRemovesMemoryAndFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "job1.png")
	if err := os.WriteFile(path, []byte("png"), 0o600); err != nil {
		t.Fatal(err)
	}

	a := NewAgent(Config{}, "test")
	a.jobs = []Job{
		{ID: "job-1", Path: path, State: JobReady},
		{ID: "job-2", State: JobReceiving},
	}

	if err := a.DeleteJob("job-1"); err != nil {
		t.Fatalf("DeleteJob: %v", err)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("expected file removed, stat err=%v", err)
	}
	if len(a.Jobs()) != 1 || a.Jobs()[0].ID != "job-2" {
		t.Fatalf("jobs after delete: %+v", a.Jobs())
	}
	if err := a.DeleteJob("missing"); err == nil {
		t.Fatal("expected not found")
	}
}

func TestDeleteJobsBulk(t *testing.T) {
	dir := t.TempDir()
	p1 := filepath.Join(dir, "a.png")
	p2 := filepath.Join(dir, "b.png")
	_ = os.WriteFile(p1, []byte("a"), 0o600)
	_ = os.WriteFile(p2, []byte("b"), 0o600)

	a := NewAgent(Config{}, "test")
	a.jobs = []Job{
		{ID: "a", Path: p1},
		{ID: "b", Path: p2},
		{ID: "c"},
	}

	n, err := a.DeleteJobs([]string{"a", "missing", "a", "c"})
	if err != nil {
		t.Fatal(err)
	}
	if n != 2 {
		t.Fatalf("deleted=%d want 2", n)
	}
	jobs := a.Jobs()
	if len(jobs) != 1 || jobs[0].ID != "b" {
		t.Fatalf("jobs: %+v", jobs)
	}
	if _, err := os.Stat(p1); !os.IsNotExist(err) {
		t.Fatal("p1 should be gone")
	}
	if _, err := os.Stat(p2); err != nil {
		t.Fatal("p2 should remain")
	}
}
