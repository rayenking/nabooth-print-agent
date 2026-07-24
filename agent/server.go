package main

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"net"
	"net/http"
	"os"
	"path"
	"strings"
	"time"

	"embed"
)

//go:embed web/*
var webFS embed.FS

// Server is the localhost control panel + JSON API.
type Server struct {
	agent  *Agent
	port   int
	server *http.Server
}

func NewServer(agent *Agent, port int) *Server {
	s := &Server{agent: agent, port: port}
	mux := http.NewServeMux()
	mux.HandleFunc("/api/health", s.handleHealth)
	mux.HandleFunc("/api/status", s.handleStatus)
	mux.HandleFunc("/api/printers", s.handlePrinters)
	mux.HandleFunc("/api/login", s.handleLogin)
	mux.HandleFunc("/api/logout", s.handleLogout)
	mux.HandleFunc("/api/printer", s.handlePrinter)
	mux.HandleFunc("/api/jobs", s.handleJobs)
	mux.HandleFunc("/api/jobs/", s.handleJobAction)
	mux.HandleFunc("/api/events", s.handleEvents)
	mux.HandleFunc("/api/update", s.handleUpdate)
	mux.HandleFunc("/api/autostart", s.handleAutostart)
	mux.HandleFunc("/api/uninstall", s.handleUninstall)
	mux.HandleFunc("/", s.handleStatic)

	s.server = &http.Server{
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}
	return s
}

func (s *Server) ListenAndServe() error {
	ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", s.port))
	if err != nil {
		return err
	}
	return s.server.Serve(ln)
}

func (s *Server) Close() error {
	return s.server.Close()
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]any{"ok": false, "error": msg})
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeErr(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "version": s.agent.Version()})
}

func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeErr(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	writeJSON(w, http.StatusOK, s.agent.Status())
}

func (s *Server) handlePrinters(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeErr(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	list, err := ListPrinters()
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"printers": []PrinterInfo{}, "error": err.Error()})
		return
	}
	if list == nil {
		list = []PrinterInfo{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"printers": list})
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeErr(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
		APIBase  string `json:"apiBase"`
		Remember bool   `json:"remember"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if err := s.agent.Login(body.Username, body.Password, body.APIBase, body.Remember); err != nil {
		writeErr(w, http.StatusUnauthorized, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "status": s.agent.Status()})
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeErr(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	s.agent.Logout()
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handlePrinter(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeErr(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var body struct {
		Name string `json:"name"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if err := s.agent.SetPrinter(body.Name); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "printer": body.Name})
}

func (s *Server) handleJobs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeErr(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"jobs": s.agent.Jobs()})
}

func (s *Server) handleJobAction(w http.ResponseWriter, r *http.Request) {
	// /api/jobs/{id}/print | /open | /file
	p := strings.TrimPrefix(r.URL.Path, "/api/jobs/")
	parts := strings.Split(strings.Trim(p, "/"), "/")
	if len(parts) < 2 {
		writeErr(w, http.StatusNotFound, "not found")
		return
	}
	id := parts[0]
	action := parts[1]

	switch action {
	case "print":
		if r.Method != http.MethodPost {
			writeErr(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		if err := s.agent.PrintJob(id); err != nil {
			writeErr(w, http.StatusBadRequest, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	case "open":
		if r.Method != http.MethodPost {
			writeErr(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		job, ok := s.agent.GetJob(id)
		if !ok || job.Path == "" {
			writeErr(w, http.StatusNotFound, "job file missing")
			return
		}
		if err := OpenFile(job.Path); err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	case "file":
		if r.Method != http.MethodGet {
			writeErr(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		job, ok := s.agent.GetJob(id)
		if !ok || job.Path == "" {
			writeErr(w, http.StatusNotFound, "job file missing")
			return
		}
		data, err := os.ReadFile(job.Path)
		if err != nil {
			writeErr(w, http.StatusNotFound, "job file missing")
			return
		}
		ct := job.Mime
		if ct == "" {
			ct = "image/png"
		}
		w.Header().Set("Content-Type", ct)
		w.Header().Set("Cache-Control", "no-store")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(data)
	default:
		writeErr(w, http.StatusNotFound, "not found")
	}
}

func (s *Server) handleUpdate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeErr(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	force := r.URL.Query().Get("force") == "1"
	writeJSON(w, http.StatusOK, fetchLatestRelease(force))
}

func (s *Server) handleUninstall(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, uninstallInfo())
	case http.MethodPost:
		s.agent.Log("Uninstall requested…")
		res := runUninstall()
		s.agent.Log("Uninstall: " + res.Detail)
		writeJSON(w, http.StatusOK, res)
		scheduleExit()
	default:
		writeErr(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}


func (s *Server) handleAutostart(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, autostartStatus())
	case http.MethodPost:
		st, err := installAutostart()
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{
				"ok":        false,
				"error":     err.Error(),
				"enabled":   st.Enabled,
				"supported": st.Supported,
				"method":    st.Method,
				"path":      st.Path,
				"detail":    st.Detail,
			})
			return
		}
		s.agent.Log("Background / autostart installed")
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":        true,
			"enabled":   st.Enabled,
			"supported": st.Supported,
			"method":    st.Method,
			"path":      st.Path,
			"detail":    st.Detail,
		})
	case http.MethodDelete:
		st, err := removeAutostart()
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{
				"ok":        false,
				"error":     err.Error(),
				"enabled":   st.Enabled,
				"supported": st.Supported,
				"method":    st.Method,
				"path":      st.Path,
				"detail":    st.Detail,
			})
			return
		}
		s.agent.Log("Background / autostart removed")
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":        true,
			"enabled":   st.Enabled,
			"supported": st.Supported,
			"method":    st.Method,
			"path":      st.Path,
			"detail":    st.Detail,
		})
	default:
		writeErr(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Server) handleEvents(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeErr(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeErr(w, http.StatusInternalServerError, "streaming unsupported")
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	// initial snapshot
	init, _ := json.Marshal(map[string]any{
		"type":   "hello",
		"status": s.agent.Status(),
		"jobs":   s.agent.Jobs(),
	})
	fmt.Fprintf(w, "data: %s\n\n", init)
	flusher.Flush()

	ch := s.agent.Subscribe()
	defer s.agent.Unsubscribe(ch)

	// heartbeat
	tick := time.NewTicker(20 * time.Second)
	defer tick.Stop()

	ctx := r.Context()
	for {
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
			fmt.Fprintf(w, ": ping\n\n")
			flusher.Flush()
		case data, ok := <-ch:
			if !ok {
				return
			}
			fmt.Fprintf(w, "data: %s\n\n", data)
			flusher.Flush()
		}
	}
}

func (s *Server) handleStatic(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		writeErr(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	sub, err := fs.Sub(webFS, "web")
	if err != nil {
		http.Error(w, "web missing", http.StatusInternalServerError)
		return
	}
	upath := r.URL.Path
	if upath == "/" || upath == "" {
		upath = "index.html"
	} else {
		upath = strings.TrimPrefix(path.Clean("/"+strings.TrimPrefix(upath, "/")), "/")
	}
	data, err := fs.ReadFile(sub, upath)
	if err != nil {
		data, err = fs.ReadFile(sub, "index.html")
		if err != nil {
			http.NotFound(w, r)
			return
		}
		upath = "index.html"
	}
	switch {
	case strings.HasSuffix(upath, ".html"):
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
	case strings.HasSuffix(upath, ".js"):
		w.Header().Set("Content-Type", "application/javascript; charset=utf-8")
	case strings.HasSuffix(upath, ".css"):
		w.Header().Set("Content-Type", "text/css; charset=utf-8")
	case strings.HasSuffix(upath, ".svg"):
		w.Header().Set("Content-Type", "image/svg+xml")
	}
	w.Header().Set("Cache-Control", "no-cache")
	w.WriteHeader(http.StatusOK)
	if r.Method != http.MethodHead {
		_, _ = w.Write(data)
	}
}

func decodeJSON(r *http.Request, dst any) error {
	return json.NewDecoder(http.MaxBytesReader(nil, r.Body, 1<<20)).Decode(dst)
}
