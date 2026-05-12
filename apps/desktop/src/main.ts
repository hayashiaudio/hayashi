import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

/* ------------------------------------------------------------------ */
/*  DOM refs                                                           */
/* ------------------------------------------------------------------ */
const statusDot = document.getElementById('status-dot')!;
const statusText = document.getElementById('status-text')!;
const authView = document.getElementById('auth-view')!;
const lockView = document.getElementById('lock-view')!;
const mainView = document.getElementById('main-view')!;
const connectDiscordBtn = document.getElementById('connect-discord-btn')!;
const upgradeBtn = document.getElementById('upgrade-btn')!;
// TODO Phase 3: const midiDeviceSelect = document.getElementById('midi-device')! as HTMLSelectElement;
const midiRate = document.getElementById('midi-rate')!;
// TODO Phase 3: const rtpmidiStatus = document.getElementById('rtpmidi-status')!;
const pairingInput = document.getElementById('pairing-input')! as HTMLInputElement;
const pairBtn = document.getElementById('pair-btn')!;
const pairedBadge = document.getElementById('paired-badge')!;
const pairedCode = document.getElementById('paired-code')!;
const disconnectBtn = document.getElementById('disconnect-btn')!;
const quitBtn = document.getElementById('quit-btn')!;

/* ------------------------------------------------------------------ */
/*  State                                                              */
/* ------------------------------------------------------------------ */
let pairedId: string | null = null;
let msgCount = 0;
let msgRateInterval: ReturnType<typeof setInterval> | null = null;

/* ------------------------------------------------------------------ */
/*  View helpers                                                       */
/* ------------------------------------------------------------------ */
function showView(view: 'auth' | 'lock' | 'main') {
  authView.classList.toggle('hidden', view !== 'auth');
  lockView.classList.toggle('hidden', view !== 'lock');
  mainView.classList.toggle('hidden', view !== 'main');
}

function setStatus(text: string, variant: 'neutral' | 'green' | 'red' | 'yellow') {
  statusText.textContent = text;
  statusDot.className = 'dot';
  if (variant !== 'neutral') statusDot.classList.add(variant);
}

/* ------------------------------------------------------------------ */
/*  Discord OAuth2                                                     */
/* ------------------------------------------------------------------ */
connectDiscordBtn.addEventListener('click', async () => {
  try {
    setStatus('Authenticating…', 'yellow');
    await invoke('discord_auth');
  } catch (e) {
    console.error('Discord auth failed:', e);
    setStatus('Auth failed', 'red');
  }
});

upgradeBtn.addEventListener('click', async () => {
  try {
    const url = await invoke<string>('get_upgrade_url');
    if (url) {
      await invoke('open_url', { url });
    }
  } catch (e) {
    console.error('Upgrade redirect failed:', e);
  }
});

/* ------------------------------------------------------------------ */
/*  Pairing                                                            */
/* ------------------------------------------------------------------ */
pairBtn.addEventListener('click', async () => {
  const code = pairingInput.value.trim();
  if (!code) return;
  try {
    await invoke('pair_session', { pairingId: code });
    pairedId = code;
    pairedCode.textContent = code;
    pairedBadge.classList.remove('hidden');
    pairingInput.value = '';
    setStatus('Paired', 'green');
  } catch (e) {
    console.error('Pair failed:', e);
    setStatus('Pair failed', 'red');
  }
});

disconnectBtn.addEventListener('click', async () => {
  try {
    await invoke('unpair_session');
  } catch {
    // ignore
  }
  pairedId = null;
  pairedBadge.classList.add('hidden');
  setStatus('Disconnected', 'neutral');
});

quitBtn.addEventListener('click', async () => {
  const win = getCurrentWindow();
  await win.close();
});

/* ------------------------------------------------------------------ */
/*  Billing check                                                      */
/* ------------------------------------------------------------------ */
async function checkBilling() {
  try {
    const ok = await invoke<boolean>('check_billing');
    if (!ok) {
      showView('lock');
      setStatus('Locked', 'red');
    } else if (pairedId) {
      showView('main');
      setStatus('Paired', 'green');
    } else {
      showView('main');
      setStatus('Waiting for pair…', 'yellow');
    }
  } catch {
    showView('auth');
    setStatus('Sign in required', 'neutral');
  }
}

/* ------------------------------------------------------------------ */
/*  MIDI device list (populated later via Tauri events)               */
/* ------------------------------------------------------------------ */
// TODO: Phase 3 — listen to midi_device_list event and populate select

/* ------------------------------------------------------------------ */
/*  Message rate ticker                                                */
/* ------------------------------------------------------------------ */
function startRateTicker() {
  if (msgRateInterval) return;
  msgRateInterval = setInterval(() => {
    midiRate.textContent = `${msgCount} msg/s`;
    msgCount = 0;
  }, 1000);
}

/* ------------------------------------------------------------------ */
/*  Lifecycle                                                          */
/* ------------------------------------------------------------------ */
async function init() {
  // Restore session if token exists
  const hasToken = await invoke<boolean>('has_discord_token');
  if (hasToken) {
    await checkBilling();
  } else {
    showView('auth');
    setStatus('Sign in required', 'neutral');
  }
  startRateTicker();

  // Poll billing every 60s
  setInterval(checkBilling, 60000);

  // Listen for WS status updates from Rust
  // TODO: wire up Tauri event listener for ws_status changes
}

init().catch(console.error);
