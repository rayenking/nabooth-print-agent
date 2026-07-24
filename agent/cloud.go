package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const maxJobs = 24
const maxLogs = 200

// DefaultAPIBase is the production Nabooth API.
const DefaultAPIBase = "https://nabooth.id"

func normalizeAPIBase(apiBase string) string {
	apiBase = strings.TrimSpace(apiBase)
	apiBase = strings.TrimRight(apiBase, "/")
	if apiBase == "" {
		return ""
	}
	if !strings.HasPrefix(apiBase, "http://") && !strings.HasPrefix(apiBase, "https://") {
		apiBase = "https://" + apiBase
	}
	return apiBase
}

func jobsDir() (string, error) {
	dir, err := configDir()
	if err != nil {
		return "", err
	}
	path := filepath.Join(dir, "jobs")
	if err := os.MkdirAll(path, 0o700); err != nil {
		return "", err
	}
	return path, nil
}

type JobState string

const (
	JobReceiving JobState = "receiving"
	JobReady     JobState = "ready"
	JobPrinting  JobState = "printing"
	JobDone      JobState = "done"
	JobFailed    JobState = "failed"
)

// Job is a local print job entry.
type Job struct {
	ID        string    `json:"id"`
	Filename  string    `json:"filename"`
	Mime      string    `json:"mime"`
	Path      string    `json:"path,omitempty"`
	State     JobState  `json:"state"`
	Error     string    `json:"error,omitempty"`
	Printer   string    `json:"printer,omitempty"`
	Copies    int       `json:"copies"`
	PaperSize string    `json:"paperSize,omitempty"`
	CreatedAt time.Time `json:"createdAt"`
}

// LogLine is a UI log entry.
type LogLine struct {
	Time time.Time `json:"time"`
	Msg  string    `json:"msg"`
}

// Agent owns cloud WS + local job state.
type Agent struct {
	mu      sync.RWMutex
	cfg     Config
	version string

	online           bool
	connecting       bool
	ws               *websocket.Conn
	wsCancel         context.CancelFunc
	intentionalClose bool

	jobs []Job
	logs []LogLine

	// SSE subscribers
	subsMu sync.Mutex
	subs   map[chan []byte]struct{}

	httpClient *http.Client
}

func NewAgent(cfg Config, version string) *Agent {
	return &Agent{
		cfg:     cfg,
		version: version,
		jobs:    make([]Job, 0),
		logs:    make([]LogLine, 0),
		subs:    make(map[chan []byte]struct{}),
		httpClient: &http.Client{
			Timeout: 60 * time.Second,
		},
	}
}

func (a *Agent) Config() Config {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.cfg
}

func (a *Agent) Version() string { return a.version }

func (a *Agent) Status() map[string]any {
	a.mu.RLock()
	defer a.mu.RUnlock()
	logs := make([]LogLine, len(a.logs))
	copy(logs, a.logs)
	return map[string]any{
		"online":     a.online,
		"connecting": a.connecting,
		"printer":    a.cfg.Printer,
		"username":   a.cfg.Username,
		"apiBase":    a.cfg.APIBase,
		"remember":   a.cfg.Remember,
		"hasToken":   a.cfg.Token != "",
		"version":    a.version,
		"logs":       logs,
	}
}

func (a *Agent) Jobs() []Job {
	a.mu.RLock()
	defer a.mu.RUnlock()
	out := make([]Job, len(a.jobs))
	copy(out, a.jobs)
	return out
}

func (a *Agent) GetJob(id string) (Job, bool) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	for _, j := range a.jobs {
		if j.ID == id {
			return j, true
		}
	}
	return Job{}, false
}

func (a *Agent) Log(msg string) {
	a.mu.Lock()
	line := LogLine{Time: time.Now(), Msg: msg}
	a.logs = append([]LogLine{line}, a.logs...)
	if len(a.logs) > maxLogs {
		a.logs = a.logs[:maxLogs]
	}
	a.mu.Unlock()
	log.Println(msg)
	a.broadcast(map[string]any{"type": "log", "msg": msg, "time": line.Time})
}

func (a *Agent) Subscribe() chan []byte {
	ch := make(chan []byte, 16)
	a.subsMu.Lock()
	a.subs[ch] = struct{}{}
	a.subsMu.Unlock()
	return ch
}

func (a *Agent) Unsubscribe(ch chan []byte) {
	a.subsMu.Lock()
	delete(a.subs, ch)
	a.subsMu.Unlock()
	close(ch)
}

func (a *Agent) broadcast(v any) {
	data, err := json.Marshal(v)
	if err != nil {
		return
	}
	a.subsMu.Lock()
	defer a.subsMu.Unlock()
	for ch := range a.subs {
		select {
		case ch <- data:
		default:
			// drop if slow
		}
	}
}

func (a *Agent) broadcastStatus() {
	a.broadcast(map[string]any{"type": "status", "status": a.Status()})
}

func (a *Agent) setOnline(online, connecting bool) {
	a.mu.Lock()
	a.online = online
	a.connecting = connecting
	a.mu.Unlock()
	a.broadcastStatus()
}

func (a *Agent) MaybeAutoConnect() {
	cfg := a.Config()
	if cfg.Token != "" {
		a.Log("Auto-connect with saved token…")
		a.ConnectWS(cfg.Token)
		return
	}
	if cfg.Username != "" && cfg.Password != "" {
		a.Log("Auto-login with saved credentials…")
		if err := a.Login(cfg.Username, cfg.Password, cfg.APIBase, cfg.Remember); err != nil {
			a.Log("Auto-login failed: " + err.Error())
		}
	}
}

// Login authenticates against the cloud API and starts WS.
func (a *Agent) Login(username, password, apiBase string, remember bool) error {
	username = strings.TrimSpace(username)
	password = password
	if username == "" || password == "" {
		return fmt.Errorf("username & password required")
	}
	apiBase = normalizeAPIBase(apiBase)
	if apiBase == "" {
		apiBase = a.Config().APIBase
	}
	if apiBase == "" {
		apiBase = DefaultAPIBase
	}

	body, _ := json.Marshal(map[string]string{
		"username": username,
		"password": password,
	})
	req, err := http.NewRequest(http.MethodPost, apiBase+"/v1/print-agent/login", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := a.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("login request: %w", err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode != http.StatusOK {
		msg := extractAPIError(raw)
		if msg == "" {
			msg = fmt.Sprintf("login failed (%d)", resp.StatusCode)
		}
		return fmt.Errorf("%s", msg)
	}
	var out struct {
		Token  string `json:"token"`
		WSPath string `json:"wsPath"`
	}
	if err := json.Unmarshal(raw, &out); err != nil || out.Token == "" {
		return fmt.Errorf("invalid login response")
	}

	a.mu.Lock()
	a.cfg.APIBase = apiBase
	a.cfg.Username = username
	a.cfg.Token = out.Token
	a.cfg.Remember = remember
	if remember {
		a.cfg.Password = password
	} else {
		a.cfg.Password = ""
	}
	cfg := a.cfg
	a.mu.Unlock()

	if err := SaveConfig(cfg); err != nil {
		a.Log("save config: " + err.Error())
	}
	a.Log("Login OK · " + username)
	a.ConnectWS(out.Token)
	return nil
}

func extractAPIError(raw []byte) string {
	var e struct {
		Error   string `json:"error"`
		Message string `json:"message"`
		Code    string `json:"code"`
	}
	if json.Unmarshal(raw, &e) == nil {
		if e.Message != "" {
			return e.Message
		}
		if e.Error != "" {
			return e.Error
		}
	}
	s := strings.TrimSpace(string(raw))
	if len(s) > 200 {
		s = s[:200]
	}
	return s
}

func (a *Agent) Logout() {
	a.Disconnect()
	a.mu.Lock()
	a.cfg.Token = ""
	// keep username; clear password unless remember
	if !a.cfg.Remember {
		a.cfg.Password = ""
	}
	cfg := a.cfg
	a.mu.Unlock()
	_ = SaveConfig(cfg)
	a.Log("Logged out")
	a.broadcastStatus()
}

func (a *Agent) SetPrinter(name string) error {
	name = strings.TrimSpace(name)
	a.mu.Lock()
	a.cfg.Printer = name
	cfg := a.cfg
	online := a.online
	ws := a.ws
	a.mu.Unlock()
	if err := SaveConfig(cfg); err != nil {
		return err
	}
	a.Log("Printer: " + name)
	if online && ws != nil {
		_ = a.sendJSON(map[string]any{"type": "hello", "printerName": name})
	}
	a.broadcastStatus()
	return nil
}

func (a *Agent) Disconnect() {
	a.mu.Lock()
	a.intentionalClose = true
	if a.wsCancel != nil {
		a.wsCancel()
		a.wsCancel = nil
	}
	if a.ws != nil {
		_ = a.ws.Close()
		a.ws = nil
	}
	a.online = false
	a.connecting = false
	a.mu.Unlock()
	a.broadcastStatus()
}

// ConnectWS starts (or restarts) the cloud WebSocket loop.
func (a *Agent) ConnectWS(token string) {
	a.mu.Lock()
	if a.wsCancel != nil {
		a.wsCancel()
		a.wsCancel = nil
	}
	if a.ws != nil {
		_ = a.ws.Close()
		a.ws = nil
	}
	a.intentionalClose = false
	a.cfg.Token = token
	ctx, cancel := context.WithCancel(context.Background())
	a.wsCancel = cancel
	a.mu.Unlock()

	go a.wsLoop(ctx, token)
}

func (a *Agent) wsLoop(ctx context.Context, token string) {
	attempt := 0
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}
		a.mu.RLock()
		if a.intentionalClose {
			a.mu.RUnlock()
			return
		}
		apiBase := a.cfg.APIBase
		printer := a.cfg.Printer
		a.mu.RUnlock()

		a.setOnline(false, true)
		err := a.wsSession(ctx, apiBase, token, printer)
		a.setOnline(false, false)

		a.mu.RLock()
		intentional := a.intentionalClose
		a.mu.RUnlock()
		if intentional || ctx.Err() != nil {
			return
		}
		if err != nil {
			a.Log("WS: " + err.Error())
		}
		attempt++
		delay := time.Duration(1<<min(attempt-1, 4)) * time.Second
		if delay > 30*time.Second {
			delay = 30 * time.Second
		}
		a.Log(fmt.Sprintf("Reconnecting in %ds…", int(delay.Seconds())))
		select {
		case <-ctx.Done():
			return
		case <-time.After(delay):
		}

		// refresh token via password if available
		a.mu.RLock()
		user, pass, base := a.cfg.Username, a.cfg.Password, a.cfg.APIBase
		a.mu.RUnlock()
		if user != "" && pass != "" {
			if err := a.reloginOnly(user, pass, base); err == nil {
				a.mu.RLock()
				token = a.cfg.Token
				a.mu.RUnlock()
				attempt = 0
			}
		}
	}
}

func (a *Agent) reloginOnly(username, password, apiBase string) error {
	body, _ := json.Marshal(map[string]string{
		"username": username,
		"password": password,
	})
	req, err := http.NewRequest(http.MethodPost, apiBase+"/v1/print-agent/login", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := a.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("relogin %d", resp.StatusCode)
	}
	var out struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(raw, &out); err != nil || out.Token == "" {
		return fmt.Errorf("relogin bad body")
	}
	a.mu.Lock()
	a.cfg.Token = out.Token
	cfg := a.cfg
	a.mu.Unlock()
	_ = SaveConfig(cfg)
	a.Log("Session refreshed")
	return nil
}

func (a *Agent) wsSession(ctx context.Context, apiBase, token, printer string) error {
	wsURL, err := buildWSURL(apiBase, token)
	if err != nil {
		return err
	}
	a.Log("Opening WebSocket…")
	dialer := websocket.Dialer{HandshakeTimeout: 15 * time.Second}
	conn, _, err := dialer.DialContext(ctx, wsURL, nil)
	if err != nil {
		return fmt.Errorf("dial: %w", err)
	}

	a.mu.Lock()
	a.ws = conn
	a.online = true
	a.connecting = false
	a.mu.Unlock()
	a.broadcastStatus()
	a.Log("WS connected")

	_ = a.sendJSON(map[string]any{"type": "hello", "printerName": printer})

	// ping loop
	pingDone := make(chan struct{})
	go func() {
		t := time.NewTicker(15 * time.Second)
		defer t.Stop()
		defer close(pingDone)
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				a.mu.RLock()
				p := a.cfg.Printer
				a.mu.RUnlock()
				if err := a.sendJSON(map[string]any{"type": "ping", "printerName": p}); err != nil {
					return
				}
			}
		}
	}()

	// read loop
	errCh := make(chan error, 1)
	go func() {
		for {
			_, data, err := conn.ReadMessage()
			if err != nil {
				errCh <- err
				return
			}
			a.handleServerMessage(data)
		}
	}()

	select {
	case <-ctx.Done():
		_ = conn.Close()
		<-pingDone
		return nil
	case err := <-errCh:
		_ = conn.Close()
		<-pingDone
		a.mu.Lock()
		if a.ws == conn {
			a.ws = nil
			a.online = false
		}
		a.mu.Unlock()
		return err
	}
}

func buildWSURL(apiBase, token string) (string, error) {
	u, err := url.Parse(apiBase)
	if err != nil {
		return "", err
	}
	switch u.Scheme {
	case "https":
		u.Scheme = "wss"
	case "http":
		u.Scheme = "ws"
	default:
		return "", fmt.Errorf("unsupported api scheme %q", u.Scheme)
	}
	u.Path = "/v1/print-agent/ws"
	q := u.Query()
	q.Set("token", token)
	u.RawQuery = q.Encode()
	return u.String(), nil
}

func (a *Agent) sendJSON(v any) error {
	a.mu.RLock()
	ws := a.ws
	a.mu.RUnlock()
	if ws == nil {
		return fmt.Errorf("not connected")
	}
	data, err := json.Marshal(v)
	if err != nil {
		return err
	}
	return ws.WriteMessage(websocket.TextMessage, data)
}

func (a *Agent) handleServerMessage(raw []byte) {
	var msg struct {
		Type        string `json:"type"`
		JobID       string `json:"jobId"`
		DownloadURL string `json:"downloadUrl"`
		Mime        string `json:"mime"`
		Filename    string `json:"filename"`
		Copies      int    `json:"copies"`
		PaperSize   string `json:"paperSize"`
		Mode        string `json:"mode"`
	}
	if err := json.Unmarshal(raw, &msg); err != nil {
		return
	}
	if msg.Type != "print_job" || msg.JobID == "" || msg.DownloadURL == "" {
		return
	}
	go a.handlePrintJob(msg.JobID, msg.DownloadURL, msg.Mime, msg.Filename, msg.Copies, msg.PaperSize)
}

func (a *Agent) handlePrintJob(jobID, downloadURL, mime, filename string, copies int, paperSize string) {
	if copies < 1 {
		copies = 1
	}
	if filename == "" {
		filename = "nabooth-strip.png"
	}
	if mime == "" {
		mime = "image/png"
	}
	a.mu.RLock()
	printer := a.cfg.Printer
	a.mu.RUnlock()

	job := Job{
		ID:        jobID,
		Filename:  filename,
		Mime:      mime,
		State:     JobReceiving,
		Printer:   printer,
		Copies:    copies,
		PaperSize: paperSize,
		CreatedAt: time.Now(),
	}
	a.upsertJob(job)
	a.Log(fmt.Sprintf("Job %s: receiving…", shortID(jobID)))
	_ = a.sendJSON(map[string]any{
		"type":        "job_progress",
		"jobId":       jobID,
		"state":       "printing",
		"printerName": printer,
	})

	path, err := a.downloadJob(downloadURL, jobID, filename)
	if err != nil {
		job.State = JobFailed
		job.Error = err.Error()
		a.upsertJob(job)
		a.Log(fmt.Sprintf("Job %s: FAILED — %s", shortID(jobID), err.Error()))
		_ = a.sendJSON(map[string]any{
			"type":        "job_progress",
			"jobId":       jobID,
			"state":       "failed",
			"error":       err.Error(),
			"printerName": printer,
		})
		return
	}
	job.Path = path
	job.State = JobReady
	a.upsertJob(job)
	a.Log(fmt.Sprintf("Job %s: ready — click Print…", shortID(jobID)))
}

func (a *Agent) downloadJob(downloadURL, jobID, filename string) (string, error) {
	req, err := http.NewRequest(http.MethodGet, downloadURL, nil)
	if err != nil {
		return "", err
	}
	resp, err := a.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("download: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("download HTTP %d", resp.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, 32<<20))
	if err != nil {
		return "", err
	}
	if len(data) == 0 {
		return "", fmt.Errorf("empty download")
	}
	dir, err := jobsDir()
	if err != nil {
		return "", err
	}
	ext := filepath.Ext(filename)
	if ext == "" {
		ext = ".png"
	}
	path := filepath.Join(dir, fmt.Sprintf("%s%s", jobID, ext))
	if err := os.WriteFile(path, data, 0o600); err != nil {
		return "", err
	}
	return path, nil
}

func (a *Agent) upsertJob(job Job) {
	a.mu.Lock()
	found := false
	for i, j := range a.jobs {
		if j.ID == job.ID {
			a.jobs[i] = job
			found = true
			break
		}
	}
	if !found {
		a.jobs = append([]Job{job}, a.jobs...)
		if len(a.jobs) > maxJobs {
			a.jobs = a.jobs[:maxJobs]
		}
	}
	a.mu.Unlock()
	a.broadcast(map[string]any{"type": "job", "job": job})
}

func (a *Agent) broadcastJobs() {
	a.broadcast(map[string]any{"type": "jobs", "jobs": a.Jobs()})
}

// DeleteJob removes one job from memory and best-effort deletes its local file.
func (a *Agent) DeleteJob(id string) error {
	id = strings.TrimSpace(id)
	if id == "" {
		return fmt.Errorf("job not found")
	}
	a.mu.Lock()
	var path string
	found := false
	for i, j := range a.jobs {
		if j.ID == id {
			path = j.Path
			a.jobs = append(a.jobs[:i], a.jobs[i+1:]...)
			found = true
			break
		}
	}
	a.mu.Unlock()
	if !found {
		return fmt.Errorf("job not found")
	}
	if path != "" {
		_ = os.Remove(path) // best-effort; missing file is fine
	}
	a.Log(fmt.Sprintf("Job %s: deleted", shortID(id)))
	a.broadcastJobs()
	return nil
}

// DeleteJobs removes many jobs; returns how many were found and removed.
func (a *Agent) DeleteJobs(ids []string) (int, error) {
	if len(ids) == 0 {
		return 0, nil
	}
	seen := make(map[string]struct{}, len(ids))
	paths := make([]string, 0, len(ids))
	deleted := 0

	a.mu.Lock()
	for _, id := range ids {
		id = strings.TrimSpace(id)
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		for i, j := range a.jobs {
			if j.ID != id {
				continue
			}
			if j.Path != "" {
				paths = append(paths, j.Path)
			}
			a.jobs = append(a.jobs[:i], a.jobs[i+1:]...)
			deleted++
			break
		}
	}
	a.mu.Unlock()

	for _, path := range paths {
		_ = os.Remove(path)
	}
	if deleted > 0 {
		a.Log(fmt.Sprintf("Deleted %d job(s)", deleted))
		a.broadcastJobs()
	}
	return deleted, nil
}

// PrintJob opens the system print dialog for a ready job and reports progress.
func (a *Agent) PrintJob(id string) error {
	job, ok := a.GetJob(id)
	if !ok {
		return fmt.Errorf("job not found")
	}
	if job.Path == "" {
		return fmt.Errorf("job file missing")
	}
	job.State = JobPrinting
	job.Error = ""
	a.upsertJob(job)
	a.Log(fmt.Sprintf("Job %s: system Print dialog…", shortID(id)))

	err := PrintFileWithDialog(job.Path, job.Printer)
	if err != nil {
		msg := err.Error()
		if strings.Contains(strings.ToLower(msg), "cancel") {
			job.State = JobReady
			job.Error = ""
			a.upsertJob(job)
			a.Log(fmt.Sprintf("Job %s: print cancelled", shortID(id)))
			return fmt.Errorf("print cancelled")
		}
		job.State = JobFailed
		job.Error = msg
		a.upsertJob(job)
		a.Log(fmt.Sprintf("Job %s: FAILED — %s", shortID(id), msg))
		_ = a.sendJSON(map[string]any{
			"type":        "job_progress",
			"jobId":       id,
			"state":       "failed",
			"error":       msg,
			"printerName": job.Printer,
		})
		return err
	}
	job.State = JobDone
	a.upsertJob(job)
	a.Log(fmt.Sprintf("Job %s: printed", shortID(id)))
	_ = a.sendJSON(map[string]any{
		"type":        "job_progress",
		"jobId":       id,
		"state":       "done",
		"printerName": job.Printer,
	})
	return nil
}

func shortID(id string) string {
	if len(id) > 12 {
		return id[:8] + "…"
	}
	return id
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
