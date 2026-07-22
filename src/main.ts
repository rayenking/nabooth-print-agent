import { invoke } from "@tauri-apps/api/core";

type PrinterInfo = { name: string };

/**
 * Production API base (release builds always use this).
 * Must be a host with a publicly trusted TLS cert.
 * `api.nabooth.id` is origin-only + Traefik default cert → reqwest fails.
 * Apex routes `/v1/*` to the API (see nabooth deploy/k8s/ingress.yaml).
 */
const PROD_API_URL = "https://nabooth.id";
/** Local API when running `tauri dev` / Vite dev. */
const DEV_API_URL = "http://localhost:5050";
const IS_DEV = import.meta.env.DEV;

const KEYS = {
  api: "nabooth_print_api",
  user: "nabooth_print_user",
  token: "nabooth_print_token",
  pass: "nabooth_print_pass",
  remember: "nabooth_print_remember",
  printer: "nabooth_print_printer",
  mode: "nabooth_print_mode",
};

type PrintMode = "manual" | "auto";

function getPrintMode(): PrintMode {
  return "manual";
}

function setPrintMode(_mode: PrintMode) {
  localStorage.setItem(KEYS.mode, "manual");
}

let ws: WebSocket | null = null;
let token = "";
let pingTimer: number | null = null;
let reconnectTimer: number | null = null;
let reconnectAttempt = 0;
let intentionalClose = false;
let connecting = false;
let reloginInFlight: Promise<boolean> | null = null;

const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T | null;

function $input(id: string): HTMLInputElement | null {
  const el = document.getElementById(id);
  return el instanceof HTMLInputElement ? el : null;
}

function log(msg: string) {
  const el = $("log");
  if (!el) return;
  const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
  el.textContent = `${line}\n${el.textContent || ""}`.slice(0, 4000);
}

function setLoginError(msg: string | null) {
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

function setStatus(kind: "on" | "off" | "wait", detail: string) {
  const pill = $("status-pill");
  const det = $("status-detail");
  if (pill) {
    pill.className = `pill ${kind}`;
    pill.textContent =
      kind === "on" ? "Online" : kind === "wait" ? "Connecting…" : "Offline";
  }
  if (det) det.textContent = detail;
}

function apiBase(): string {
  if (!IS_DEV) return PROD_API_URL;
  const v =
    $input("api-url")?.value.trim() ||
    localStorage.getItem(KEYS.api) ||
    DEV_API_URL;
  return v.replace(/\/$/, "");
}

function wsUrl(path: string, t: string): string {
  const base = apiBase();
  const u = new URL(base);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  u.pathname = path;
  u.search = `token=${encodeURIComponent(t)}`;
  return u.toString();
}

function updateConnectedHint() {
  const el = $("connected-printer-hint");
  if (!el) return;
  const p = selectedPrinter();
  el.textContent = p
    ? `Jobs will use: ${p} (OS defaults)`
    : "Pick a printer above before connecting.";
}

async function loadPrinters() {
  const select = $("printer") as HTMLSelectElement | null;
  if (!select) return;
  try {
    const list = await invoke<PrinterInfo[]>("list_printers");
    select.innerHTML = "";
    if (!list.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "(no printers found)";
      select.appendChild(opt);
      log("No printers found");
      updateConnectedHint();
      return;
    }
    const saved = localStorage.getItem(KEYS.printer) || "";
    for (const p of list) {
      const opt = document.createElement("option");
      opt.value = p.name;
      opt.textContent = p.name;
      if (p.name === saved) opt.selected = true;
      select.appendChild(opt);
    }
    if (!select.value && list[0]) select.value = list[0].name;
    log(`Printers: ${list.map((p) => p.name).join(", ")}`);
    updateConnectedHint();
  } catch (e) {
    log(`list_printers error: ${e}`);
  }
}

function selectedPrinter(): string {
  return ($("printer") as HTMLSelectElement | null)?.value || "";
}

function clearReconnectTimer() {
  if (reconnectTimer) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function stopWs(opts?: { intentional?: boolean }) {
  intentionalClose = Boolean(opts?.intentional);
  clearReconnectTimer();
  if (pingTimer) {
    window.clearInterval(pingTimer);
    pingTimer = null;
  }
  const sock = ws;
  ws = null;
  if (sock) {
    sock.onopen = null;
    sock.onclose = null;
    sock.onerror = null;
    sock.onmessage = null;
    try {
      sock.close();
    } catch {
      /* ignore */
    }
  }
  connecting = false;
}

function scheduleReconnect(reason: string) {
  if (intentionalClose || !token) return;
  clearReconnectTimer();
  reconnectAttempt += 1;
  const delay = Math.min(30_000, 1000 * 2 ** Math.min(reconnectAttempt - 1, 4));
  setStatus("wait", `Reconnecting in ${Math.round(delay / 1000)}s…`);
  log(`WS ${reason} — reconnect #${reconnectAttempt} in ${delay}ms`);
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    void ensureConnected();
  }, delay);
}

function startWs(t: string) {
  if (!t) return;
  if (
    connecting ||
    (ws &&
      (ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING))
  ) {
    return;
  }
  intentionalClose = false;
  connecting = true;
  stopWs({ intentional: false });
  intentionalClose = false;
  connecting = true;
  setStatus("wait", "Opening WebSocket…");
  const url = wsUrl("/v1/print-agent/ws", t);
  const sock = new WebSocket(url);
  ws = sock;
  sock.onopen = () => {
    if (ws !== sock) return;
    connecting = false;
    reconnectAttempt = 0;
    setStatus("on", `Connected · ${selectedPrinter() || "default printer"}`);
    log("WS connected");
    const printer = selectedPrinter();
    sock.send(JSON.stringify({ type: "hello", printerName: printer }));
    if (pingTimer) window.clearInterval(pingTimer);
    pingTimer = window.setInterval(() => {
      if (sock.readyState === WebSocket.OPEN) {
        sock.send(
          JSON.stringify({ type: "ping", printerName: selectedPrinter() }),
        );
      }
    }, 15000);
  };
  sock.onclose = (ev) => {
    if (ws === sock) ws = null;
    connecting = false;
    if (pingTimer) {
      window.clearInterval(pingTimer);
      pingTimer = null;
    }
    if (intentionalClose) {
      setStatus("off", "Disconnected");
      log("WS closed (logout)");
      return;
    }
    setStatus("off", "Disconnected");
    log(`WS closed (code ${ev.code})`);
    if (ev.code === 1008 || ev.code === 4001 || ev.code === 4401) {
      void reloginAndReconnect("token rejected");
      return;
    }
    scheduleReconnect(`closed ${ev.code}`);
  };
  sock.onerror = () => {
    log("WS error");
  };
  sock.onmessage = (ev) => {
    void handleServerMessage(String(ev.data));
  };
}

function rememberPasswordChecked(): boolean {
  return Boolean($input("remember-password")?.checked);
}

function saveCredentials(username: string, password: string) {
  // Only persist API override in dev; release always hits PROD_API_URL.
  if (IS_DEV) localStorage.setItem(KEYS.api, apiBase());
  else localStorage.removeItem(KEYS.api);
  localStorage.setItem(KEYS.user, username);
  if (rememberPasswordChecked()) {
    localStorage.setItem(KEYS.remember, "1");
    localStorage.setItem(KEYS.pass, password);
  } else {
    localStorage.removeItem(KEYS.remember);
    localStorage.removeItem(KEYS.pass);
  }
}

async function loginWithPassword(
  username: string,
  password: string,
): Promise<boolean> {
  const body = await invoke<{ token: string }>("agent_login", {
    apiUrl: apiBase(),
    username,
    password,
  });
  token = body.token;
  localStorage.setItem(KEYS.token, token);
  saveCredentials(username, password);
  return true;
}

async function reloginAndReconnect(reason: string) {
  if (reloginInFlight) return reloginInFlight;
  reloginInFlight = (async () => {
    const username =
      $input("username")?.value.trim() ||
      localStorage.getItem(KEYS.user) ||
      "";
    const password =
      $input("password")?.value || localStorage.getItem(KEYS.pass) || "";
    if (!username || !password) {
      log(`Re-login needed (${reason}) — saved password missing`);
      token = "";
      localStorage.removeItem(KEYS.token);
      setStatus("off", "Session expired — sign in again");
      $("main-card")?.classList.add("hidden");
      $("login-card")?.classList.remove("hidden");
      setLoginError("Session expired. Enter password and Connect.");
      return false;
    }
    log(`Re-login (${reason})…`);
    setStatus("wait", "Refreshing session…");
    try {
      await loginWithPassword(username, password);
      reconnectAttempt = 0;
      startWs(token);
      return true;
    } catch (e) {
      const msg = String(e).replace(/^Error:\s*/i, "") || "Login failed";
      log(`Re-login failed: ${msg}`);
      token = "";
      localStorage.removeItem(KEYS.token);
      setStatus("off", "Session expired — sign in again");
      $("main-card")?.classList.add("hidden");
      $("login-card")?.classList.remove("hidden");
      setLoginError(msg);
      return false;
    } finally {
      reloginInFlight = null;
    }
  })();
  return reloginInFlight;
}

async function ensureConnected() {
  if (!token) return;
  if (ws?.readyState === WebSocket.OPEN) return;
  if (connecting) return;
  startWs(token);
}

type JobState = "printing" | "done" | "failed";

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

function jobCardEl(jobId: string): HTMLElement | null {
  return document.querySelector(
    `.job[data-job-id="${CSS.escape(jobId)}"]`,
  ) as HTMLElement | null;
}

function prependJobCard(jobId: string, copies: number, printer: string) {
  const list = $("jobs");
  if (!list) return;
  $("jobs-empty")?.remove();

  const card = document.createElement("div");
  card.className = "job";
  card.dataset.jobId = jobId;

  const ph = document.createElement("div");
  ph.className = "job-thumb placeholder";
  ph.dataset.role = "thumb";
  ph.textContent = "Loading…";
  card.appendChild(ph);

  const meta = document.createElement("div");
  meta.className = "job-meta";
  meta.innerHTML = `
    <div class="id">${shortId(jobId)}</div>
    <div class="state printing" data-role="state">Receiving…</div>
    <p class="detail" data-role="detail">${printer || "default"} · ×${copies}</p>
    <div class="job-actions hidden" data-role="actions">
      <button type="button" data-role="btn-print">Print…</button>
      <button type="button" class="ghost" data-role="btn-open">Open file</button>
    </div>
  `;
  card.appendChild(meta);
  list.prepend(card);

  while (list.querySelectorAll(".job").length > 12) {
    list.lastElementChild?.remove();
  }
}

function setJobReadyForManual(
  jobId: string,
  filePath: string,
  objectUrl: string,
  printer: string,
) {
  const card = jobCardEl(jobId);
  if (!card) return;
  card.dataset.filePath = filePath;
  setJobThumb(jobId, objectUrl);
  updateJobCard(jobId, "printing", `${printer || "default"} · ready — click Print…`);
  const stateEl = card.querySelector('[data-role="state"]') as HTMLElement | null;
  if (stateEl) {
    stateEl.className = "state printing";
    stateEl.textContent = "Ready to print";
  }
  const actions = card.querySelector('[data-role="actions"]') as HTMLElement | null;
  actions?.classList.remove("hidden");
  const btnPrint = card.querySelector('[data-role="btn-print"]') as HTMLButtonElement | null;
  const btnOpen = card.querySelector('[data-role="btn-open"]') as HTMLButtonElement | null;
  btnPrint?.addEventListener("click", () => {
    void runManualPrint(jobId, filePath, printer);
  });
  btnOpen?.addEventListener("click", () => {
    void invoke("open_file", { path: filePath }).catch((e) =>
      log(`Open file: ${e}`),
    );
  });
}

async function runManualPrint(jobId: string, filePath: string, printer: string) {
  updateJobCard(jobId, "printing", "System Print dialog…");
  log(`Job ${shortId(jobId)}: opening system Print dialog…`);
  try {
    await invoke("print_file_with_dialog", {
      path: filePath,
      printer: printer || null,
    });
    updateJobCard(jobId, "done", `${printer || "default"} · printed via system dialog`);
    log(`Job ${shortId(jobId)}: system print OK`);
    ws?.send(
      JSON.stringify({
        type: "job_progress",
        jobId,
        state: "done",
        printerName: printer,
      }),
    );
  } catch (e) {
    const err = String(e).replace(/^Error:\s*/i, "");
    if (err.toLowerCase().includes("cancel")) {
      updateJobCard(jobId, "printing", "Cancelled — click Print… again");
      const stateEl = jobCardEl(jobId)?.querySelector(
        '[data-role="state"]',
      ) as HTMLElement | null;
      if (stateEl) {
        stateEl.className = "state printing";
        stateEl.textContent = "Ready to print";
      }
      log(`Job ${shortId(jobId)}: print cancelled`);
      return;
    }
    updateJobCard(jobId, "failed", err);
    log(`Job ${shortId(jobId)}: FAILED — ${err}`);
    ws?.send(
      JSON.stringify({
        type: "job_progress",
        jobId,
        state: "failed",
        error: err,
        printerName: printer,
      }),
    );
  }
}

function setJobThumb(jobId: string, objectUrl: string) {
  const card = jobCardEl(jobId);
  if (!card) return;
  const old = card.querySelector('[data-role="thumb"]');
  const img = document.createElement("img");
  img.className = "job-thumb";
  img.alt = "Strip";
  img.dataset.role = "thumb";
  img.src = objectUrl;
  if (old) old.replaceWith(img);
  else card.prepend(img);
}

function updateJobCard(jobId: string, state: JobState, detail?: string) {
  const card = jobCardEl(jobId);
  if (!card) return;
  const stateEl = card.querySelector('[data-role="state"]') as HTMLElement | null;
  const detailEl = card.querySelector('[data-role="detail"]') as HTMLElement | null;
  if (stateEl) {
    stateEl.className = `state ${state}`;
    stateEl.textContent =
      state === "printing"
        ? "Printing…"
        : state === "done"
          ? "Done"
          : "Failed";
  }
  if (detailEl && detail) detailEl.textContent = detail;
}

function bytesToObjectUrl(data: number[] | Uint8Array): string {
  const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
  return URL.createObjectURL(new Blob([u8], { type: "image/png" }));
}

async function handleServerMessage(raw: string) {
  let msg: {
    type?: string;
    jobId?: string;
    downloadUrl?: string;
    copies?: number;
    mode?: string;
    paperSize?: string;
    mediaType?: string;
    scale?: string;
    orientation?: string;
    quality?: string;
  };
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  if (msg.type !== "print_job" || !msg.jobId || !msg.downloadUrl) return;
  const jobId = msg.jobId;
  const printer = selectedPrinter();
  const copies = msg.copies ?? 1;
  const paperSize = msg.paperSize || "4x6";
  const mediaType = msg.mediaType || "photo";
  const scale = msg.scale || (paperSize.includes("borderless") ? "fill" : "fit");
  const orientation = msg.orientation || "auto";
  const quality = msg.quality || "normal";

  prependJobCard(jobId, copies, printer);
  const mode: PrintMode =
    msg.mode === "auto" ? "manual" : getPrintMode();
  log(
    `Job ${shortId(jobId)}: mode=${mode} paper=${paperSize} media=${mediaType} quality=${quality} ×${copies}`,
  );

  ws?.send(
    JSON.stringify({
      type: "job_progress",
      jobId,
      state: "printing",
      printerName: printer,
    }),
  );

  try {
    const bytes = await invoke<number[]>("download_bytes", {
      url: msg.downloadUrl,
    });
    const objectUrl = bytesToObjectUrl(bytes);

    if (mode === "manual") {
      const filePath = await invoke<string>("save_print_file", { data: bytes });
      setJobReadyForManual(jobId, filePath, objectUrl, printer);
      log(
        `Job ${shortId(jobId)}: strip ready — use Print… for system dialog`,
      );
      return;
    }

    setJobThumb(jobId, objectUrl);
    updateJobCard(
      jobId,
      "printing",
      `${printer || "default"} · ${paperSize} · auto…`,
    );
    const cupsPage = await invoke<string>("print_bytes", {
      data: bytes,
      printer: printer || null,
      copies,
      paperSize,
      mediaType,
      scale,
      orientation,
      quality,
    });
    ws?.send(
      JSON.stringify({
        type: "job_progress",
        jobId,
        state: "done",
        printerName: printer,
      }),
    );
    updateJobCard(
      jobId,
      "done",
      `${printer || "default"} · ${paperSize} → ${cupsPage} · ×${copies}`,
    );
    log(`Job ${shortId(jobId)}: auto PageSize=${cupsPage}`);
  } catch (e) {
    const err = String(e).replace(/^Error:\s*/i, "");
    ws?.send(
      JSON.stringify({
        type: "job_progress",
        jobId,
        state: "failed",
        error: err,
        printerName: printer,
      }),
    );
    updateJobCard(jobId, "failed", err);
    log(`Job ${shortId(jobId)}: FAILED — ${err}`);
  }
}

async function login() {
  const username = $input("username")?.value.trim() || "";
  const password = $input("password")?.value || "";
  setLoginError(null);
  if (!username || !password) {
    setLoginError("Username & password required");
    log("Username & password required");
    return;
  }
  const btn = $("btn-login") as HTMLButtonElement | null;
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Connecting…";
  }
  log(`Connecting to ${apiBase()}…`);
  try {
    await loginWithPassword(username, password);
    setLoginError(null);
    $("login-card")?.classList.add("hidden");
    $("main-card")?.classList.remove("hidden");
    log("Login OK");
    updateConnectedHint();
    reconnectAttempt = 0;
    startWs(token);
  } catch (e) {
    const msg = String(e).replace(/^Error:\s*/i, "") || "Login failed";
    setLoginError(msg);
    log(`Login error: ${msg}`);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Connect";
    }
  }
}

function logout() {
  token = "";
  localStorage.removeItem(KEYS.token);
  stopWs({ intentional: true });
  reconnectAttempt = 0;
  setStatus("off", "Logged out");
  $("main-card")?.classList.add("hidden");
  $("login-card")?.classList.remove("hidden");
}

window.addEventListener("DOMContentLoaded", () => {
  const user = localStorage.getItem(KEYS.user);
  const remembered = localStorage.getItem(KEYS.remember) === "1";
  const savedPass = localStorage.getItem(KEYS.pass) || "";

  const apiField = $("api-url-field");
  if (IS_DEV) {
    apiField?.classList.remove("hidden");
    const apiInput = $input("api-url");
    if (apiInput) {
      apiInput.value = localStorage.getItem(KEYS.api) || DEV_API_URL;
    }
  } else {
    apiField?.classList.add("hidden");
    localStorage.removeItem(KEYS.api);
  }

  if (user && $input("username")) $input("username")!.value = user;
  const rememberEl = $input("remember-password");
  if (rememberEl) rememberEl.checked = remembered;
  if (remembered && savedPass && $input("password")) {
    $input("password")!.value = savedPass;
  }
  rememberEl?.addEventListener("change", () => {
    if (!rememberEl.checked) {
      localStorage.removeItem(KEYS.remember);
      localStorage.removeItem(KEYS.pass);
    }
  });

  $("btn-login")?.addEventListener("click", () => void login());
  $("btn-logout")?.addEventListener("click", logout);
  window.addEventListener("online", () => {
    if (token) {
      log("Network online — reconnecting…");
      reconnectAttempt = 0;
      void ensureConnected();
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && token) {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        log("App focused — checking connection…");
        void ensureConnected();
      }
    }
  });
  $("btn-refresh-printers")?.addEventListener("click", () => void loadPrinters());
  $("btn-printer-settings")?.addEventListener("click", () => {
    void (async () => {
      const p = selectedPrinter();
      try {
        await invoke("open_printer_settings", { printer: p || "" });
        log(
          p
            ? `Opened system Print dialog (${p})`
            : "Opened system Print dialog",
        );
      } catch (e) {
        log(`Print settings: ${e}`);
      }
    })();
  });
  $("btn-printer-queue")?.addEventListener("click", () => {
    void (async () => {
      const p = selectedPrinter();
      if (!p) {
        log("Select a printer first");
        return;
      }
      try {
        await invoke("open_printer_queue", { printer: p });
        log(`Opened printer queue for ${p}`);
      } catch (e) {
        log(`Printer queue: ${e}`);
      }
    })();
  });
  $("btn-test-print")?.addEventListener("click", () => {
    void (async () => {
      const p = selectedPrinter();
      if (!p) {
        log("Select a printer first");
        return;
      }
      const btn = $("btn-test-print") as HTMLButtonElement | null;
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Printing…";
      }
      const testId = `test-${Date.now()}`;
      prependJobCard(testId, 1, p);
      log(`Test print → ${p}…`);
      try {
        await invoke("test_print", { printer: p });
        updateJobCard(testId, "done", `${p} · test OK`);
        log(`Test print OK (${p})`);
      } catch (e) {
        updateJobCard(testId, "failed", String(e));
        log(`Test print failed: ${e}`);
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Test Print";
        }
      }
    })();
  });
  $("btn-clear-jobs")?.addEventListener("click", () => {
    const list = $("jobs");
    if (!list) return;
    list.innerHTML = "";
    const empty = document.createElement("p");
    empty.className = "muted small";
    empty.id = "jobs-empty";
    empty.textContent = "Strips from the booth show here when printing.";
    list.appendChild(empty);
  });
  $("printer")?.addEventListener("change", () => {
    const p = selectedPrinter();
    localStorage.setItem(KEYS.printer, p);
    updateConnectedHint();
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "hello", printerName: p }));
      setStatus("on", `Connected · ${p}`);
    }
  });

  void loadPrinters();

  const modeSel = $("print-mode") as HTMLSelectElement | null;
  if (modeSel) {
    modeSel.value = "manual";
    modeSel.disabled = false;
    setPrintMode("manual");
    modeSel.addEventListener("change", () => {
      modeSel.value = "manual";
      setPrintMode("manual");
      log("Print mode: manual (auto disabled)");
    });
  }

  const savedToken = localStorage.getItem(KEYS.token);
  if (savedToken) {
    token = savedToken;
    $("login-card")?.classList.add("hidden");
    $("main-card")?.classList.remove("hidden");
    void loadPrinters().then(() => {
      updateConnectedHint();
      startWs(token);
    });
  } else if (remembered && user && savedPass) {
    void loadPrinters().then(() => {
      void (async () => {
        log("Auto-connect with saved password…");
        try {
          await loginWithPassword(user, savedPass);
          $("login-card")?.classList.add("hidden");
          $("main-card")?.classList.remove("hidden");
          updateConnectedHint();
          startWs(token);
          log("Auto-connect OK");
        } catch (e) {
          log(`Auto-connect failed: ${e}`);
          $("login-card")?.classList.remove("hidden");
        }
      })();
    });
  }
});
