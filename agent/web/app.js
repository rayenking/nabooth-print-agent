(() => {
  const $ = (id) => document.getElementById(id);
  const LANG_KEY = "nabooth-print-agent-lang";

  const STRINGS = {
    id: {
      title: "Nabooth Print Agent",
      tagline: "Panel kontrol lokal · PC printer",
      statusOnline: "Online",
      statusOffline: "Offline",
      statusConnecting: "Menghubungkan…",
      statusNotConnected: "Belum terhubung",
      statusDisconnected: "Terputus",
      statusOpeningCloud: "Membuka koneksi cloud…",
      statusConnected: "Terhubung · {printer}",
      defaultPrinter: "printer default",
      updateAvailable: "Pembaruan tersedia",
      notes: "Catatan",
      howToUpdate: "Cara memperbarui",
      printer: "Printer",
      refresh: "Muat ulang",
      selectedPrinter: "Printer terpilih",
      printerHint: "Pekerjaan memakai default OS printer ini saat Anda klik Cetak.",
      printerHintNamed: "Pekerjaan memakai: {name} (default OS)",
      printerHintPick: "Pilih printer di atas sebelum menyambung.",
      connect: "Sambungkan",
      disconnect: "Putuskan",
      connectBtn: "Sambungkan",
      connectedBtn: "Terhubung",
      reconnectBtn: "Sambungkan ulang",
      username: "Username",
      password: "Password",
      rememberPassword: "Ingat password di PC ini",
      connectHint: "Kredensial dari dashboard → Print Agent (Pro).",
      jobs: "Pekerjaan",
      jobsEmpty: "Menunggu cetakan dari booth…",
      bgUpdates: "Background & pembaruan",
      on: "Nyala",
      off: "Mati",
      startAtLogin: "Mulai saat login",
      autostartHint:
        "Pasang background agar Print Agent jalan saat login. Hapus background mematikannya. Diperlukan agar pekerjaan cetak booth tetap masuk tanpa membuka Terminal.",
      checking: "Memeriksa…",
      installBackground: "Pasang background",
      removeBackground: "Hapus background",
      softwareUpdate: "Pembaruan perangkat lunak",
      checkingUpdates: "Memeriksa pembaruan…",
      checkAgain: "Periksa lagi",
      releaseNotes: "Catatan rilis",
      log: "Log",
      clear: "Hapus",
      modalUpdateTitle: "Perbarui Print Agent",
      close: "Tutup",
      closeAria: "Tutup",
      modalUpdateSummary: "Versi lebih baru tersedia.",
      modalStep1: "Unduh binary untuk PC ini (atau jalankan ulang perintah instalasi).",
      modalStep2: "Hentikan agent ini jika perlu, lalu ganti/jalankan binary baru.",
      modalStep3: "Buka http://127.0.0.1:17890 lagi.",
      installCommand: "Perintah instalasi",
      copy: "Salin",
      downloadBinary: "Unduh binary",
      downloadNamed: "Unduh {name}",
      openReleases: "Buka rilis",
      selfUpdateDisabled: "Self-update dinonaktifkan. Pembaruan manual dengan sengaja.",
      loginRequired: "Username & password wajib diisi",
      loginFailed: "Login gagal",
      loginOk: "Login berhasil",
      loginError: "Error login: {msg}",
      loggedOut: "Keluar",
      logoutDetail: "Sudah keluar",
      noPrinters: "(tidak ada printer)",
      printersLabel: "Printer: {list}",
      noPrintersFound: "Tidak ada printer",
      printersError: "Printer: {msg}",
      listPrintersError: "daftar printer: {msg}",
      printerSet: "Printer disetel: {name}",
      setPrinterError: "set printer: {msg}",
      none: "(tidak ada)",
      stateReceiving: "Menerima…",
      stateReady: "Siap cetak",
      statePrinting: "Mencetak…",
      stateDone: "Selesai",
      stateFailed: "Gagal",
      print: "Cetak…",
      open: "Buka",
      delete: "Hapus",
      deleteSelected: "Hapus terpilih",
      selectAll: "Pilih semua",
      confirmDeleteOne: "Hapus job ini?",
      confirmDeleteMany: "Hapus {n} job terpilih?",
      deletedJob: "Job {id} dihapus",
      deletedJobs: "{n} job dihapus",
      noSelection: "Tidak ada job terpilih",
      stripAlt: "Strip",
      jobPrintDialog: "Pekerjaan {id}: membuka dialog Cetak sistem…",
      jobPrintCancelled: "Pekerjaan {id}: cetak dibatalkan",
      jobError: "Pekerjaan {id}: {msg}",
      openError: "Buka: {msg}",
      deleteError: "Hapus: {msg}",
      updateCheckFailed: "Gagal memeriksa pembaruan.",
      updateCheckFailedDetail: "Pemeriksaan pembaruan gagal: {msg}",
      updateAvailableDetail: "Pembaruan tersedia: v{latest} (Anda punya v{current})",
      upToDate: "Sudah terbaru · v{current}",
      upToDateLatest: "Sudah terbaru · v{current} (terbaru v{latest})",
      modalUpdateAvailable:
        "v{latest} tersedia (Anda punya v{current}). Unduh binary atau jalankan ulang perintah instalasi.",
      modalUpdateCurrent: "Saat ini v{current}. Anda masih bisa menginstal ulang rilis terbaru secara manual.",
      autostartReadFailed: "Tidak bisa membaca status autostart.",
      autostartUnsupported: "Autostart tidak didukung di OS ini.",
      notAvailable: "Tidak tersedia",
      enabled: "Aktif",
      notInstalled: "Belum dipasang",
      method: "metode: {method}",
      backgroundRemoved: "Background / autostart dihapus",
      backgroundInstalled: "Background / autostart dipasang",
      autostartError: "autostart: {msg}",
      installCopied: "Perintah instalasi disalin",
      copyFailed: "Salin gagal — pilih perintah dan salin manual",
      statusError: "status: {msg}",
      checkingUpdatesLog: "Memeriksa pembaruan…",
      updateCheckError: "pemeriksaan pembaruan: {msg}",
      default: "default",
      dev: "(dev)",
    },
    en: {
      title: "Nabooth Print Agent",
      tagline: "Local control panel · printer PC",
      statusOnline: "Online",
      statusOffline: "Offline",
      statusConnecting: "Connecting…",
      statusNotConnected: "Not connected",
      statusDisconnected: "Disconnected",
      statusOpeningCloud: "Opening cloud connection…",
      statusConnected: "Connected · {printer}",
      defaultPrinter: "default printer",
      updateAvailable: "Update available",
      notes: "Notes",
      howToUpdate: "How to update",
      printer: "Printer",
      refresh: "Refresh",
      selectedPrinter: "Selected printer",
      printerHint: "Jobs use this printer’s OS defaults when you click Print.",
      printerHintNamed: "Jobs will use: {name} (OS defaults)",
      printerHintPick: "Pick a printer above before connecting.",
      connect: "Connect",
      disconnect: "Disconnect",
      connectBtn: "Connect",
      connectedBtn: "Connected",
      reconnectBtn: "Reconnect",
      username: "Username",
      password: "Password",
      rememberPassword: "Remember password on this PC",
      connectHint: "Credentials from dashboard → Print Agent (Pro).",
      jobs: "Jobs",
      jobsEmpty: "Waiting for booth prints…",
      bgUpdates: "Background & updates",
      on: "On",
      off: "Off",
      startAtLogin: "Start at login",
      autostartHint:
        "Install background so Print Agent starts at login. Remove background turns that off. Needed so booth print jobs still arrive without opening Terminal.",
      checking: "Checking…",
      installBackground: "Install background",
      removeBackground: "Remove background",
      softwareUpdate: "Software update",
      checkingUpdates: "Checking for updates…",
      checkAgain: "Check again",
      releaseNotes: "Release notes",
      log: "Log",
      clear: "Clear",
      modalUpdateTitle: "Update Print Agent",
      close: "Close",
      closeAria: "Close",
      modalUpdateSummary: "A newer version is available.",
      modalStep1: "Download the binary for this PC (or re-run the install command).",
      modalStep2: "Stop this agent if needed, then replace/run the new binary.",
      modalStep3: "Open http://127.0.0.1:17890 again.",
      installCommand: "Install command",
      copy: "Copy",
      downloadBinary: "Download binary",
      downloadNamed: "Download {name}",
      openReleases: "Open releases",
      selfUpdateDisabled: "Self-update is disabled. Updates are manual on purpose.",
      loginRequired: "Username & password required",
      loginFailed: "Login failed",
      loginOk: "Login OK",
      loginError: "Login error: {msg}",
      loggedOut: "Logged out",
      logoutDetail: "Logged out",
      noPrinters: "(no printers found)",
      printersLabel: "Printers: {list}",
      noPrintersFound: "No printers found",
      printersError: "Printers: {msg}",
      listPrintersError: "list printers: {msg}",
      printerSet: "Printer set: {name}",
      setPrinterError: "set printer: {msg}",
      none: "(none)",
      stateReceiving: "Receiving…",
      stateReady: "Ready to print",
      statePrinting: "Printing…",
      stateDone: "Done",
      stateFailed: "Failed",
      print: "Print…",
      open: "Open",
      delete: "Delete",
      deleteSelected: "Delete selected",
      selectAll: "Select all",
      confirmDeleteOne: "Delete this job?",
      confirmDeleteMany: "Delete {n} selected jobs?",
      deletedJob: "Deleted job {id}",
      deletedJobs: "Deleted {n} jobs",
      noSelection: "No jobs selected",
      stripAlt: "Strip",
      jobPrintDialog: "Job {id}: opening system Print dialog…",
      jobPrintCancelled: "Job {id}: print cancelled",
      jobError: "Job {id}: {msg}",
      openError: "Open: {msg}",
      deleteError: "Delete: {msg}",
      updateCheckFailed: "Could not check for updates.",
      updateCheckFailedDetail: "Update check failed: {msg}",
      updateAvailableDetail: "Update available: v{latest} (you have v{current})",
      upToDate: "Up to date · v{current}",
      upToDateLatest: "Up to date · v{current} (latest v{latest})",
      modalUpdateAvailable:
        "v{latest} is available (you have v{current}). Download the binary or re-run the install command.",
      modalUpdateCurrent: "Current v{current}. You can still reinstall the latest release manually.",
      autostartReadFailed: "Could not read autostart status.",
      autostartUnsupported: "Autostart not supported on this OS.",
      notAvailable: "Not available",
      enabled: "Enabled",
      notInstalled: "Not installed",
      method: "method: {method}",
      backgroundRemoved: "Background / autostart removed",
      backgroundInstalled: "Background / autostart installed",
      autostartError: "autostart: {msg}",
      installCopied: "Install command copied",
      copyFailed: "Copy failed — select the command and copy manually",
      statusError: "status: {msg}",
      checkingUpdatesLog: "Checking for updates…",
      updateCheckError: "update check: {msg}",
      default: "default",
      dev: "(dev)",
    },
  };

  let lang = "id";
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === "en" || saved === "id") lang = saved;
  } catch {
    /* ignore */
  }

  function t(key, vars) {
    const dict = STRINGS[lang] || STRINGS.id;
    let s = dict[key] ?? STRINGS.en[key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        s = s.replaceAll(`{${k}}`, String(v ?? ""));
      }
    }
    return s;
  }

  function applyStaticI18n() {
    document.documentElement.lang = lang;
    document.title = t("title");
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (!key) return;
      el.textContent = t(key);
    });
    document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
      const key = el.getAttribute("data-i18n-aria");
      if (key) el.setAttribute("aria-label", t(key));
    });
    document.querySelectorAll(".lang-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-lang") === lang);
    });
  }

  function setLang(next) {
    if (next !== "id" && next !== "en") return;
    lang = next;
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {
      /* ignore */
    }
    applyStaticI18n();
    if (state.lastStatus) applyStatus(state.lastStatus);
    else setStatus("off", t("statusNotConnected"));
    renderJobs(state.jobs);
    renderUpdate(state.update);
    renderAutostart(state.autostart);
    if (state.printer) {
      $("printer-hint").textContent = t("printerHintNamed", { name: state.printer });
    } else if ($("printer-hint")) {
      $("printer-hint").textContent = t("printerHint");
    }
  }

  const state = {
    online: false,
    connecting: false,
    printer: "",
    username: "",
    apiBase: "https://nabooth.id",
    remember: false,
    jobs: [],
    selected: new Set(),
    update: null,
    autostart: null,
    lastStatus: null,
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
        kind === "on"
          ? t("statusOnline")
          : kind === "wait"
            ? t("statusConnecting")
            : t("statusOffline");
    }
    if (det) det.textContent = detail || "";
  }

  function applyStatus(s) {
    if (!s) return;
    state.lastStatus = s;
    state.online = !!s.online;
    state.connecting = !!s.connecting;
    state.printer = s.printer || "";
    state.username = s.username || "";
    state.apiBase = s.apiBase || state.apiBase;
    state.remember = !!s.remember;
    if (s.version) $("version").textContent = `v${s.version}`;

    if (s.connecting) setStatus("wait", t("statusOpeningCloud"));
    else if (s.online)
      setStatus(
        "on",
        t("statusConnected", { printer: s.printer || t("defaultPrinter") })
      );
    else
      setStatus(
        "off",
        s.username ? t("statusDisconnected") : t("statusNotConnected")
      );

    if (s.username && $("username") && !$("username").value)
      $("username").value = s.username;
    if ($("api-url") && s.apiBase) $("api-url").value = s.apiBase;
    if ($("remember")) $("remember").checked = !!s.remember;

    const logout = $("btn-logout");
    const login = $("btn-login");
    if (s.online || s.hasToken) {
      logout?.classList.remove("hidden");
      if (login) login.textContent = s.online ? t("connectedBtn") : t("reconnectBtn");
      if (login) login.disabled = !!s.online;
    } else {
      logout?.classList.add("hidden");
      if (login) {
        login.textContent = t("connectBtn");
        login.disabled = false;
      }
    }

    if (Array.isArray(s.logs)) {
      const el = $("log");
      if (el && !el.textContent && s.logs.length) {
        el.textContent = s.logs
          .map((l) => {
            const tm = l.time ? new Date(l.time).toLocaleTimeString() : "";
            return `[${tm}] ${l.msg}`;
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
        opt.textContent = data.error || t("noPrinters");
        select.appendChild(opt);
        log(data.error ? t("printersError", { msg: data.error }) : t("noPrintersFound"));
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
      log(t("printersLabel", { list: list.map((p) => p.name).join(", ") }));
      if (select.value && select.value !== state.printer) {
        await savePrinter(select.value, false);
      }
    } catch (e) {
      log(t("listPrintersError", { msg: e.message || e }));
    }
  }

  async function savePrinter(name, announce = true) {
    try {
      await api("/api/printer", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      state.printer = name;
      if (announce) log(t("printerSet", { name: name || t("none") }));
      $("printer-hint").textContent = name
        ? t("printerHintNamed", { name })
        : t("printerHintPick");
    } catch (e) {
      log(t("setPrinterError", { msg: e.message || e }));
    }
  }

  function shortId(id) {
    return id && id.length > 12 ? `${id.slice(0, 8)}…` : id || "";
  }

  function stateLabel(st) {
    switch (st) {
      case "receiving":
        return t("stateReceiving");
      case "ready":
        return t("stateReady");
      case "printing":
        return t("statePrinting");
      case "done":
        return t("stateDone");
      case "failed":
        return t("stateFailed");
      default:
        return st || "—";
    }
  }

  function pruneSelection() {
    const ids = new Set(state.jobs.map((j) => j.id));
    for (const id of [...state.selected]) {
      if (!ids.has(id)) state.selected.delete(id);
    }
  }

  function updateJobsToolbar() {
    const hasJobs = state.jobs.length > 0;
    const selectedCount = state.selected.size;
    const wrap = $("jobs-select-all-wrap");
    const selectAll = $("jobs-select-all");
    const btn = $("btn-delete-selected");
    wrap?.classList.toggle("hidden", !hasJobs);
    btn?.classList.toggle("hidden", !hasJobs);
    if (btn) {
      btn.disabled = selectedCount === 0;
      btn.textContent =
        selectedCount > 0
          ? `${t("deleteSelected")} (${selectedCount})`
          : t("deleteSelected");
    }
    if (selectAll) {
      selectAll.checked = hasJobs && selectedCount === state.jobs.length;
      selectAll.indeterminate =
        selectedCount > 0 && selectedCount < state.jobs.length;
    }
  }

  function renderJobs(jobs) {
    state.jobs = jobs || [];
    pruneSelection();
    const root = $("jobs");
    const count = $("jobs-count");
    if (count) count.textContent = String(state.jobs.length);
    if (!root) return;
    root.innerHTML = "";
    if (!state.jobs.length) {
      const p = document.createElement("p");
      p.id = "jobs-empty";
      p.className = "empty";
      p.textContent = t("jobsEmpty");
      root.appendChild(p);
      updateJobsToolbar();
      return;
    }
    for (const job of state.jobs) {
      root.appendChild(jobCard(job));
    }
    updateJobsToolbar();
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
    if (state.selected.has(job.id)) card.classList.add("selected");

    const checkWrap = document.createElement("label");
    checkWrap.className = "job-check";
    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = state.selected.has(job.id);
    check.setAttribute("aria-label", t("selectAll"));
    check.addEventListener("change", () => {
      if (check.checked) state.selected.add(job.id);
      else state.selected.delete(job.id);
      card.classList.toggle("selected", check.checked);
      updateJobsToolbar();
    });
    checkWrap.appendChild(check);
    card.appendChild(checkWrap);

    if (job.path || job.state === "ready" || job.state === "done" || job.state === "printing") {
      const img = document.createElement("img");
      img.className = "job-thumb";
      img.alt = t("stripAlt");
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
      job.printer || t("default"),
      job.copies ? `×${job.copies}` : null,
      job.paperSize || null,
      job.error || null,
    ].filter(Boolean);
    detail.textContent = bits.join(" · ");
    meta.appendChild(id);
    meta.appendChild(st);
    meta.appendChild(detail);

    const actions = document.createElement("div");
    actions.className = "job-actions";
    if (job.state === "ready" || job.state === "failed" || job.state === "done") {
      const btnPrint = document.createElement("button");
      btnPrint.type = "button";
      btnPrint.className = "primary";
      btnPrint.textContent = t("print");
      btnPrint.addEventListener("click", () => void printJob(job.id));
      const btnOpen = document.createElement("button");
      btnOpen.type = "button";
      btnOpen.className = "ghost";
      btnOpen.textContent = t("open");
      btnOpen.addEventListener("click", () => void openJob(job.id));
      actions.appendChild(btnPrint);
      actions.appendChild(btnOpen);
    }
    const btnDelete = document.createElement("button");
    btnDelete.type = "button";
    btnDelete.className = "danger ghost";
    btnDelete.textContent = t("delete");
    btnDelete.addEventListener("click", () => void deleteJob(job.id));
    actions.appendChild(btnDelete);
    meta.appendChild(actions);

    card.appendChild(meta);
    return card;
  }

  async function deleteJob(id) {
    if (!window.confirm(t("confirmDeleteOne"))) return;
    try {
      const data = await api(`/api/jobs/${encodeURIComponent(id)}/delete`, {
        method: "POST",
      });
      state.selected.delete(id);
      if (Array.isArray(data.jobs)) renderJobs(data.jobs);
      else {
        state.jobs = state.jobs.filter((j) => j.id !== id);
        renderJobs(state.jobs);
      }
      log(t("deletedJob", { id: shortId(id) }));
    } catch (e) {
      log(t("deleteError", { msg: e.message || e }));
    }
  }

  async function deleteSelectedJobs() {
    const ids = [...state.selected];
    if (!ids.length) {
      log(t("noSelection"));
      return;
    }
    if (!window.confirm(t("confirmDeleteMany", { n: ids.length }))) return;
    try {
      const data = await api("/api/jobs/delete", {
        method: "POST",
        body: JSON.stringify({ ids }),
      });
      state.selected.clear();
      if (Array.isArray(data.jobs)) renderJobs(data.jobs);
      else {
        const gone = new Set(ids);
        state.jobs = state.jobs.filter((j) => !gone.has(j.id));
        renderJobs(state.jobs);
      }
      const n = typeof data.deleted === "number" ? data.deleted : ids.length;
      log(t("deletedJobs", { n }));
    } catch (e) {
      log(t("deleteError", { msg: e.message || e }));
    }
  }

  function placeholderThumb() {
    const ph = document.createElement("div");
    ph.className = "job-thumb placeholder";
    ph.textContent = "…";
    return ph;
  }

  async function printJob(id) {
    try {
      log(t("jobPrintDialog", { id: shortId(id) }));
      await api(`/api/jobs/${encodeURIComponent(id)}/print`, { method: "POST" });
    } catch (e) {
      const msg = e.message || String(e);
      if (/cancel/i.test(msg)) log(t("jobPrintCancelled", { id: shortId(id) }));
      else log(t("jobError", { id: shortId(id), msg }));
    }
  }

  async function openJob(id) {
    try {
      await api(`/api/jobs/${encodeURIComponent(id)}/open`, { method: "POST" });
    } catch (e) {
      log(t("openError", { msg: e.message || e }));
    }
  }

  async function login() {
    setLoginError(null);
    const username = $("username")?.value.trim() || "";
    const password = $("password")?.value || "";
    const remember = !!$("remember")?.checked;
    const apiBase = $("api-url")?.value.trim() || "";
    if (!username || !password) {
      setLoginError(t("loginRequired"));
      return;
    }
    const btn = $("btn-login");
    if (btn) {
      btn.disabled = true;
      btn.textContent = t("statusConnecting");
    }
    try {
      const data = await api("/api/login", {
        method: "POST",
        body: JSON.stringify({ username, password, apiBase, remember }),
      });
      applyStatus(data.status);
      log(t("loginOk"));
    } catch (e) {
      setLoginError(e.message || t("loginFailed"));
      log(t("loginError", { msg: e.message || e }));
      if (btn) {
        btn.disabled = false;
        btn.textContent = t("connectBtn");
      }
    }
  }

  async function logout() {
    try {
      await api("/api/logout", { method: "POST" });
      setStatus("off", t("logoutDetail"));
      log(t("loggedOut"));
      $("btn-logout")?.classList.add("hidden");
      const btn = $("btn-login");
      if (btn) {
        btn.disabled = false;
        btn.textContent = t("connectBtn");
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
      if (detail) detail.textContent = t("updateCheckFailed");
      banner?.classList.add("hidden");
      btn?.classList.add("hidden");
      notes?.classList.add("hidden");
      return;
    }

    const cur = info.current || "dev";
    const latest = info.latest || "—";
    if (info.error && !info.latest) {
      if (detail) detail.textContent = t("updateCheckFailedDetail", { msg: info.error });
      banner?.classList.add("hidden");
      btn?.classList.add("hidden");
      notes?.classList.add("hidden");
      return;
    }

    if (info.updateAvailable) {
      const msg = t("updateAvailableDetail", { latest, current: cur });
      if (detail) detail.textContent = msg;
      if (bannerDetail) bannerDetail.textContent = msg;
      banner?.classList.remove("hidden");
      btn?.classList.remove("hidden");
      btnNow?.classList.remove("hidden");
      if (btn) btn.textContent = t("howToUpdate");
      if (btnNow) btnNow.textContent = t("howToUpdate");
    } else {
      if (detail)
        detail.textContent =
          latest && latest !== "—"
            ? t("upToDateLatest", { current: cur, latest })
            : t("upToDate", { current: cur });
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
          ? t("modalUpdateAvailable", { latest, current: cur })
          : t("modalUpdateCurrent", { current: cur });
    }
    if (cmd) cmd.value = installCommand();
    if (dl) {
      const href = (info && info.downloadUrl) || "";
      if (href) {
        dl.href = href;
        dl.classList.remove("disabled");
        dl.setAttribute("aria-disabled", "false");
        dl.textContent = info.assetName
          ? t("downloadNamed", { name: info.assetName })
          : t("downloadBinary");
      } else {
        dl.href =
          (info && info.releaseUrl) ||
          "https://github.com/rayenking/nabooth-print-agent/releases/latest";
        dl.classList.remove("disabled");
        dl.setAttribute("aria-disabled", "false");
        dl.textContent = t("openReleases");
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
      if (detail) detail.textContent = t("autostartReadFailed");
      return;
    }
    if (!info.supported) {
      if (pill) {
        pill.className = "pill off";
        pill.textContent = "N/A";
      }
      if (detail) detail.textContent = info.detail || t("autostartUnsupported");
      if (btn) {
        btn.disabled = true;
        btn.textContent = t("notAvailable");
      }
      return;
    }
    if (pill) {
      pill.className = `pill ${info.enabled ? "on" : "off"}`;
      pill.textContent = info.enabled ? t("on") : t("off");
    }
    const bits = [];
    if (info.detail) bits.push(info.detail);
    if (info.method) bits.push(t("method", { method: info.method }));
    if (info.path) bits.push(info.path);
    if (detail)
      detail.textContent =
        bits.join(" · ") || (info.enabled ? t("enabled") : t("notInstalled"));
    if (btn) {
      btn.disabled = false;
      btn.textContent = info.enabled ? t("removeBackground") : t("installBackground");
      btn.className = info.enabled ? "ghost" : "primary";
    }
  }

  async function loadUpdate(announce) {
    try {
      if (announce) log(t("checkingUpdatesLog"));
      const info = await api("/api/update");
      renderUpdate(info);
    } catch (e) {
      renderUpdate(null);
      if (announce) log(t("updateCheckError", { msg: e.message || e }));
    }
  }

  async function loadAutostart() {
    try {
      const info = await api("/api/autostart");
      renderAutostart(info);
    } catch {
      renderAutostart(null);
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
        log(t("backgroundRemoved"));
      } else {
        const info = await api("/api/autostart", { method: "POST" });
        renderAutostart(info);
        log(t("backgroundInstalled"));
      }
    } catch (e) {
      log(t("autostartError", { msg: e.message || e }));
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
      log(t("installCopied"));
    } catch {
      if (input) {
        input.focus();
        input.select();
      }
      log(t("copyFailed"));
    }
  }

  async function boot() {
    applyStaticI18n();

    document.querySelectorAll(".lang-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const next = btn.getAttribute("data-lang");
        if (next) setLang(next);
      });
    });

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
      log(t("statusError", { msg: e.message || e }));
    }
    try {
      const data = await api("/api/jobs");
      renderJobs(data.jobs || []);
    } catch {
      /* ignore */
    }
    await Promise.allSettled([
      loadPrinters(),
      loadUpdate(false),
      loadAutostart(),
    ]);
    connectEvents();

    setInterval(() => void loadUpdate(false), 45 * 60 * 1000);
    window.addEventListener("focus", () => void loadUpdate(false));
    $("btn-delete-selected")?.addEventListener("click", () => void deleteSelectedJobs());
    $("jobs-select-all")?.addEventListener("change", (e) => {
      const on = !!e.target.checked;
      state.selected = on ? new Set(state.jobs.map((j) => j.id)) : new Set();
      renderJobs(state.jobs);
    });
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
