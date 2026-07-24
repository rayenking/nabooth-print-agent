(() => {
  const $ = (id) => document.getElementById(id);
  const state = {
    online: false,
    connecting: false,
    printer: "",
    username: "",
    apiBase: "https://nabooth.id",
    remember: false,
    jobs: [],
  };

  function log(msg) {
    const el = $("log");
    if (!el) return;
    const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
    el.textContent = `${line}\n${el.textContent || ""}`.slice(0, 6000);
  }

  function setLoginError(msg) {
    const el = $("login-error");
    if (!el) return;
    if (!msg) {
      el.classList.add("hidden");
      el.textContent = "";
      return;
    }
    el.classList.remove("hidden");
    el.textContent = msg;
  }

  function setStatus(kind, detail) {
    const pill = $("status-pill");
    const det = $("status-detail");
    if (pill) {
      pill.className = `pill ${kind}`;
      pill.textContent =
        kind === "on" ? "Online" : kind === "wait" ? "Connecting…" : "Offline";
    }
    if (det) det.textContent = detail || "";
  }

  function applyStatus(s) {
    if (!s) return;
    state.online = !!s.online;
    state.connecting = !!s.connecting;
    state.printer = s.printer || "";
    state.username = s.username || "";
    state.apiBase = s.apiBase || state.apiBase;
    state.remember = !!s.remember;
    if (s.version) $("version").textContent = `v${s.version}`;

    if (s.connecting) setStatus("wait", "Opening cloud connection…");
    else if (s.online)
      setStatus("on", `Connected · ${s.printer || "default printer"}`);
    else setStatus("off", s.username ? "Disconnected" : "Not connected");

    if (s.username && $("username") && !$("username").value)
      $("username").value = s.username;
    if ($("api-url") && s.apiBase) $("api-url").value = s.apiBase;
    if ($("remember")) $("remember").checked = !!s.remember;

    const logout = $("btn-logout");
    const login = $("btn-login");
    if (s.online || s.hasToken) {
      logout?.classList.remove("hidden");
      if (login) login.textContent = s.online ? "Connected" : "Reconnect";
      if (login) login.disabled = !!s.online;
    } else {
      logout?.classList.add("hidden");
      if (login) {
        login.textContent = "Connect";
        login.disabled = false;
      }
    }

    if (Array.isArray(s.logs)) {
      // only seed empty log from server snapshot
      const el = $("log");
      if (el && !el.textContent && s.logs.length) {
        el.textContent = s.logs
          .map((l) => {
            const t = l.time ? new Date(l.time).toLocaleTimeString() : "";
            return `[${t}] ${l.msg}`;
          })
          .join("\n");
      }
    }

    maybeShowDevApi();
  }

  function maybeShowDevApi() {
    const field = $("api-url-field");
    if (!field) return;
    const q = new URLSearchParams(location.search);
    const api = ($("api-url")?.value || state.apiBase || "").toLowerCase();
    const show =
      q.get("dev") === "1" ||
      api.includes("localhost") ||
      api.includes("127.0.0.1");
    field.classList.toggle("hidden", !show);
  }

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      headers: { Accept: "application/json", ...(opts.body ? { "Content-Type": "application/json" } : {}) },
      ...opts,
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { error: text };
    }
    if (!res.ok) {
      const msg = (data && (data.error || data.message)) || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data;
  }

  async function loadPrinters() {
    const select = $("printer");
    if (!select) return;
    try {
      const data = await api("/api/printers");
      const list = data.printers || [];
      const prev = select.value || state.printer;
      select.innerHTML = "";
      if (!list.length) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = data.error || "(no printers found)";
        select.appendChild(opt);
        log(data.error ? `Printers: ${data.error}` : "No printers found");
        return;
      }
      for (const p of list) {
        const opt = document.createElement("option");
        opt.value = p.name;
        opt.textContent = p.name;
        if (p.name === prev) opt.selected = true;
        select.appendChild(opt);
      }
      if (!select.value && list[0]) select.value = list[0].name;
      log(`Printers: ${list.map((p) => p.name).join(", ")}`);
      if (select.value && select.value !== state.printer) {
        await savePrinter(select.value, false);
      }
    } catch (e) {
      log(`list printers: ${e.message || e}`);
    }
  }

  async function savePrinter(name, announce = true) {
    try {
      await api("/api/printer", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      state.printer = name;
      if (announce) log(`Printer set: ${name || "(none)"}`);
      $("printer-hint").textContent = name
        ? `Jobs will use: ${name} (OS defaults)`
        : "Pick a printer above before connecting.";
    } catch (e) {
      log(`set printer: ${e.message || e}`);
    }
  }

  function shortId(id) {
    return id && id.length > 12 ? `${id.slice(0, 8)}…` : id || "";
  }

  function stateLabel(st) {
    switch (st) {
      case "receiving":
        return "Receiving…";
      case "ready":
        return "Ready to print";
      case "printing":
        return "Printing…";
      case "done":
        return "Done";
      case "failed":
        return "Failed";
      default:
        return st || "—";
    }
  }

  function renderJobs(jobs) {
    state.jobs = jobs || [];
    const root = $("jobs");
    const count = $("jobs-count");
    if (count) count.textContent = String(state.jobs.length);
    if (!root) return;
    root.innerHTML = "";
    if (!state.jobs.length) {
      const p = document.createElement("p");
      p.id = "jobs-empty";
      p.className = "empty";
      p.textContent = "Waiting for booth prints…";
      root.appendChild(p);
      return;
    }
    for (const job of state.jobs) {
      root.appendChild(jobCard(job));
    }
  }

  function upsertJob(job) {
    if (!job || !job.id) return;
    const idx = state.jobs.findIndex((j) => j.id === job.id);
    if (idx >= 0) state.jobs[idx] = job;
    else state.jobs.unshift(job);
    if (state.jobs.length > 24) state.jobs = state.jobs.slice(0, 24);
    renderJobs(state.jobs);
  }

  function jobCard(job) {
    const card = document.createElement("div");
    card.className = "job";
    card.dataset.jobId = job.id;

    if (job.path || job.state === "ready" || job.state === "done" || job.state === "printing") {
      const img = document.createElement("img");
      img.className = "job-thumb";
      img.alt = "Strip";
      img.src = `/api/jobs/${encodeURIComponent(job.id)}/file?t=${Date.now()}`;
      img.onerror = () => {
        img.replaceWith(placeholderThumb());
      };
      card.appendChild(img);
    } else {
      card.appendChild(placeholderThumb());
    }

    const meta = document.createElement("div");
    meta.className = "job-meta";
    const id = document.createElement("div");
    id.className = "id";
    id.textContent = shortId(job.id);
    const st = document.createElement("div");
    st.className = `state ${job.state || ""}`;
    st.textContent = stateLabel(job.state);
    const detail = document.createElement("p");
    detail.className = "detail";
    const bits = [
      job.printer || "default",
      job.copies ? `×${job.copies}` : null,
      job.paperSize || null,
      job.error || null,
    ].filter(Boolean);
    detail.textContent = bits.join(" · ");
    meta.appendChild(id);
    meta.appendChild(st);
    meta.appendChild(detail);

    if (job.state === "ready" || job.state === "failed" || job.state === "done") {
      const actions = document.createElement("div");
      actions.className = "job-actions";
      const btnPrint = document.createElement("button");
      btnPrint.type = "button";
      btnPrint.className = "primary";
      btnPrint.textContent = "Print…";
      btnPrint.addEventListener("click", () => void printJob(job.id));
      const btnOpen = document.createElement("button");
      btnOpen.type = "button";
      btnOpen.className = "ghost";
      btnOpen.textContent = "Open";
      btnOpen.addEventListener("click", () => void openJob(job.id));
      actions.appendChild(btnPrint);
      actions.appendChild(btnOpen);
      meta.appendChild(actions);
    }

    card.appendChild(meta);
    return card;
  }

  function placeholderThumb() {
    const ph = document.createElement("div");
    ph.className = "job-thumb placeholder";
    ph.textContent = "…";
    return ph;
  }

  async function printJob(id) {
    try {
      log(`Job ${shortId(id)}: opening system Print dialog…`);
      await api(`/api/jobs/${encodeURIComponent(id)}/print`, { method: "POST" });
    } catch (e) {
      const msg = e.message || String(e);
      if (/cancel/i.test(msg)) log(`Job ${shortId(id)}: print cancelled`);
      else log(`Job ${shortId(id)}: ${msg}`);
    }
  }

  async function openJob(id) {
    try {
      await api(`/api/jobs/${encodeURIComponent(id)}/open`, { method: "POST" });
    } catch (e) {
      log(`Open: ${e.message || e}`);
    }
  }

  async function login() {
    setLoginError(null);
    const username = $("username")?.value.trim() || "";
    const password = $("password")?.value || "";
    const remember = !!$("remember")?.checked;
    const apiBase = $("api-url")?.value.trim() || "";
    if (!username || !password) {
      setLoginError("Username & password required");
      return;
    }
    const btn = $("btn-login");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Connecting…";
    }
    try {
      const data = await api("/api/login", {
        method: "POST",
        body: JSON.stringify({ username, password, apiBase, remember }),
      });
      applyStatus(data.status);
      log("Login OK");
    } catch (e) {
      setLoginError(e.message || "Login failed");
      log(`Login error: ${e.message || e}`);
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Connect";
      }
    }
  }

  async function logout() {
    try {
      await api("/api/logout", { method: "POST" });
      setStatus("off", "Logged out");
      log("Logged out");
      $("btn-logout")?.classList.add("hidden");
      const btn = $("btn-login");
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Connect";
      }
    } catch (e) {
      log(`Logout: ${e.message || e}`);
    }
  }

  function connectEvents() {
    const es = new EventSource("/api/events");
    es.onmessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.type === "hello") {
        applyStatus(msg.status);
        renderJobs(msg.jobs || []);
        return;
      }
      if (msg.type === "status") {
        applyStatus(msg.status);
        return;
      }
      if (msg.type === "job") {
        upsertJob(msg.job);
        return;
      }
      if (msg.type === "log" && msg.msg) {
        log(msg.msg);
      }
    };
    es.onerror = () => {
      // browser auto-reconnects
    };
  }

  async function boot() {
    try {
      const health = await api("/api/health");
      if (health.version) $("version").textContent = `v${health.version}`;
    } catch {
      /* ignore */
    }
    try {
      const st = await api("/api/status");
      applyStatus(st);
    } catch (e) {
      log(`status: ${e.message || e}`);
    }
    try {
      const data = await api("/api/jobs");
      renderJobs(data.jobs || []);
    } catch {
      /* ignore */
    }
    await loadPrinters();
    connectEvents();

    $("btn-login")?.addEventListener("click", () => void login());
    $("btn-logout")?.addEventListener("click", () => void logout());
    $("btn-refresh-printers")?.addEventListener("click", () => void loadPrinters());
    $("btn-clear-log")?.addEventListener("click", () => {
      if ($("log")) $("log").textContent = "";
    });
    $("printer")?.addEventListener("change", (e) => {
      void savePrinter(e.target.value, true);
    });
    $("password")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") void login();
    });
    maybeShowDevApi();
  }

  document.addEventListener("DOMContentLoaded", () => void boot());
})();
