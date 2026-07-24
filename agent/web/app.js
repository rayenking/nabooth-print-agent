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
    update: null,
    autostart: null,
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
      headers: {
        Accept: "application/json",
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
      },
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

  function isWindowsUA() {
    return /Win/i.test(navigator.platform || "") || /Windows/i.test(navigator.userAgent || "");
  }

  function installCommand() {
    if (isWindowsUA()) {
      return "irm https://raw.githubusercontent.com/rayenking/nabooth-print-agent/main/install.ps1 | iex";
    }
    return "curl -fsSL https://raw.githubusercontent.com/rayenking/nabooth-print-agent/main/install.sh | sh";
  }

  function openModal(name) {
    const el = $(`modal-${name}`);
    if (el) el.classList.remove("hidden");
  }

  function closeModal(name) {
    const el = $(`modal-${name}`);
    if (el) el.classList.add("hidden");
  }

  function renderUpdate(info) {
    state.update = info || null;
    const banner = $("update-banner");
    const bannerDetail = $("update-banner-detail");
    const bannerLink = $("update-release-link");
    const detail = $("update-detail");
    const btn = $("btn-update");
    const btnNow = $("btn-update-now");
    const notes = $("update-notes");

    if (!info) {
      if (detail) detail.textContent = "Could not check for updates.";
      banner?.classList.add("hidden");
      btn?.classList.add("hidden");
      notes?.classList.add("hidden");
      return;
    }

    const cur = info.current || "dev";
    const latest = info.latest || "—";
    if (info.error && !info.latest) {
      if (detail) detail.textContent = `Update check failed: ${info.error}`;
      banner?.classList.add("hidden");
      btn?.classList.add("hidden");
      notes?.classList.add("hidden");
      return;
    }

    if (info.updateAvailable) {
      const msg = `Update available: v${latest} (you have v${cur})`;
      if (detail) detail.textContent = msg;
      if (bannerDetail) bannerDetail.textContent = msg;
      banner?.classList.remove("hidden");
      btn?.classList.remove("hidden");
      btnNow?.classList.remove("hidden");
      if (btn) btn.textContent = "How to update";
      if (btnNow) btnNow.textContent = "How to update";
    } else {
      if (detail)
        detail.textContent = `Up to date · v${cur}${
          latest && latest !== "—" ? ` (latest v${latest})` : ""
        }`;
      banner?.classList.add("hidden");
      btn?.classList.add("hidden");
    }

    const url = info.releaseUrl || "";
    for (const el of [notes, bannerLink]) {
      if (!el) continue;
      if (url) {
        el.href = url;
        el.classList.remove("hidden");
      } else {
        el.classList.add("hidden");
      }
    }
  }

  function fillUpdateModal(info) {
    const summary = $("modal-update-summary");
    const cmd = $("modal-update-cmd");
    const dl = $("modal-update-download");
    const rel = $("modal-update-release");
    const cur = (info && info.current) || "dev";
    const latest = (info && info.latest) || "—";
    if (summary) {
      summary.textContent =
        info && info.updateAvailable
          ? `v${latest} is available (you have v${cur}). Download the binary or re-run the install command.`
          : `Current v${cur}. You can still reinstall the latest release manually.`;
    }
    if (cmd) cmd.value = installCommand();
    if (dl) {
      const href = (info && info.downloadUrl) || "";
      if (href) {
        dl.href = href;
        dl.classList.remove("disabled");
        dl.setAttribute("aria-disabled", "false");
        dl.textContent = info.assetName ? `Download ${info.assetName}` : "Download binary";
      } else {
        dl.href =
          (info && info.releaseUrl) ||
          "https://github.com/rayenking/nabooth-print-agent/releases/latest";
        dl.classList.remove("disabled");
        dl.setAttribute("aria-disabled", "false");
        dl.textContent = "Open releases";
      }
    }
    if (rel) {
      rel.href =
        (info && info.releaseUrl) ||
        "https://github.com/rayenking/nabooth-print-agent/releases/latest";
    }
  }

  function showUpdateModal() {
    fillUpdateModal(state.update);
    openModal("update");
  }

  function renderAutostart(info) {
    state.autostart = info || null;
    const pill = $("autostart-pill");
    const detail = $("autostart-detail");
    const btn = $("btn-autostart");
    if (!info) {
      if (detail) detail.textContent = "Could not read autostart status.";
      return;
    }
    if (!info.supported) {
      if (pill) {
        pill.className = "pill off";
        pill.textContent = "N/A";
      }
      if (detail) detail.textContent = info.detail || "Autostart not supported on this OS.";
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Not available";
      }
      return;
    }
    if (pill) {
      pill.className = `pill ${info.enabled ? "on" : "off"}`;
      pill.textContent = info.enabled ? "On" : "Off";
    }
    const bits = [];
    if (info.detail) bits.push(info.detail);
    if (info.method) bits.push(`method: ${info.method}`);
    if (info.path) bits.push(info.path);
    if (detail) detail.textContent = bits.join(" · ") || (info.enabled ? "Enabled" : "Not installed");
    if (btn) {
      btn.disabled = false;
      btn.textContent = info.enabled ? "Remove background" : "Install background";
      btn.className = info.enabled ? "ghost" : "primary";
    }
  }

  async function toggleAutostart() {
    const cur = state.autostart;
    if (!cur || !cur.supported) return;
    const btn = $("btn-autostart");
    if (btn) btn.disabled = true;
    try {
      if (cur.enabled) {
        const info = await api("/api/autostart", { method: "DELETE" });
        renderAutostart(info);
        log("Background / autostart removed");
      } else {
        const info = await api("/api/autostart", { method: "POST" });
        renderAutostart(info);
        log("Background / autostart installed");
      }
    } catch (e) {
      log(`autostart: ${e.message || e}`);
      await loadAutostart();
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function copyInstallCmd() {
    const input = $("modal-update-cmd");
    const text = input?.value || installCommand();
    try {
      await navigator.clipboard.writeText(text);
      log("Install command copied");
    } catch {
      if (input) {
        input.focus();
        input.select();
      }
      log("Copy failed — select the command and copy manually");
    }
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
    await Promise.all([loadUpdate(false), loadAutostart()]);
    connectEvents();

    setInterval(() => void loadUpdate(false), 45 * 60 * 1000);
    window.addEventListener("focus", () => void loadUpdate(false));

    $("btn-login")?.addEventListener("click", () => void login());
    $("btn-logout")?.addEventListener("click", () => void logout());
    $("btn-refresh-printers")?.addEventListener("click", () => void loadPrinters());
    $("btn-clear-log")?.addEventListener("click", () => {
      if ($("log")) $("log").textContent = "";
    });
    $("btn-update")?.addEventListener("click", () => showUpdateModal());
    $("btn-update-now")?.addEventListener("click", () => showUpdateModal());
    $("btn-check-update")?.addEventListener("click", () => void loadUpdate(true));
    $("btn-autostart")?.addEventListener("click", () => void toggleAutostart());
    $("btn-copy-install")?.addEventListener("click", () => void copyInstallCmd());
    document.querySelectorAll("[data-close]").forEach((el) => {
      el.addEventListener("click", () => closeModal(el.getAttribute("data-close")));
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeModal("update");
      }
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
