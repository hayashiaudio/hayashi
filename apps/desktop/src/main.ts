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
const midiDeviceSelect = document.getElementById('midi-device')! as HTMLSelectElement;
const midiRate = document.getElementById('midi-rate')!;
const rtpmidiStatus = document.getElementById('rtpmidi-status')!;
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
/*  MIDI device list                                                   */
/* ------------------------------------------------------------------ */
async function refreshMidiDevices() {
  try {
    const devices: string[] = await invoke('list_midi_devices');
    const current = midiDeviceSelect.value;
    midiDeviceSelect.innerHTML = '<option value="">None</option>';
    for (const [i, name] of devices.entries()) {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = name;
      midiDeviceSelect.appendChild(opt);
    }
    midiDeviceSelect.value = current;
  } catch (e) {
    console.error('Failed to list MIDI devices:', e);
  }
}

midiDeviceSelect.addEventListener('change', async () => {
  const idx = midiDeviceSelect.value;
  if (!idx) {
    try {
      await invoke('deselect_midi_device');
    } catch {
      // ignore
    }
    return;
  }
  try {
    await invoke('select_midi_device', { portIndex: Number(idx) });
  } catch (e) {
    console.error('Failed to select MIDI device:', e);
  }
});

/* ------------------------------------------------------------------ */
/*  RTP-MIDI toggle                                                    */
/* ------------------------------------------------------------------ */
let rtpEnabled = false;
rtpmidiStatus.addEventListener('click', async () => {
  rtpEnabled = !rtpEnabled;
  try {
    await invoke('toggle_rtp_midi', { enable: rtpEnabled });
    rtpmidiStatus.textContent = rtpEnabled ? 'Listening' : 'Off';
  } catch (e) {
    console.error('Failed to toggle RTP-MIDI:', e);
    rtpEnabled = false;
    rtpmidiStatus.textContent = 'Off';
  }
});

/* ------------------------------------------------------------------ */
/*  Message rate ticker                                                */
/* ------------------------------------------------------------------ */
function startRateTicker() {
  if (msgRateInterval) return;
  msgRateInterval = setInterval(async () => {
    try {
      const rate = await invoke<number>('get_midi_msg_rate');
      midiRate.textContent = `${rate} msg/s`;
    } catch {
      midiRate.textContent = '0 msg/s';
    }
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

  await refreshMidiDevices();
  startRateTicker();

  // Poll billing every 60s
  setInterval(checkBilling, 60000);

  // Refresh MIDI devices every 5s to detect hot-plug
  setInterval(refreshMidiDevices, 5000);
}

init().catch(console.error);
