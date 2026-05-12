use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use tauri_plugin_shell::ShellExt;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{mpsc, Mutex};
use tokio_tungstenite::tungstenite::protocol::Message as WsMessage;

mod midi;
mod rtpmidi;

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */
const WS_PORT: u16 = 8765;
const OAUTH_PORT: u16 = 8766;
const KEYRING_SERVICE: &str = "hayashi-midi-bridge";
const KEYRING_USER: &str = "discord-token";

fn discord_client_id() -> String {
    option_env!("DISCORD_CLIENT_ID")
        .unwrap_or("")
        .to_string()
}

fn server_base_url() -> String {
    option_env!("HAYASHI_SERVER_URL")
        .unwrap_or("http://localhost:3001")
        .to_string()
}

/* ------------------------------------------------------------------ */
/*  Data types                                                         */
/* ------------------------------------------------------------------ */
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MidiPacket {
    #[serde(rename = "type")]
    packet_type: String,
    note: Option<u8>,
    velocity: Option<u8>,
    value: Option<u8>,
    channel: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
enum BridgeMessage {
    #[serde(rename = "pair")]
    Pair { pairing_id: String },
    #[serde(rename = "pair_ack")]
    PairAck { pairing_id: String },
    #[serde(rename = "pair_nak")]
    PairNak { pairing_id: String },
    #[serde(rename = "midi")]
    Midi { pairing_id: String, packet: MidiPacket },
    #[serde(rename = "ping")]
    Ping { pairing_id: String },
    #[serde(rename = "pong")]
    Pong { pairing_id: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct BillingSnapshot {
    plan: String,
}

/* ------------------------------------------------------------------ */
/*  AppState                                                           */
/* ------------------------------------------------------------------ */
type WsTx = mpsc::UnboundedSender<WsMessage>;

struct AppStateInner {
    expected_pairing_id: Option<String>,
    paired_tx: Option<WsTx>,
    discord_token: Option<String>,
    midi_tx: Option<mpsc::UnboundedSender<MidiPacket>>,
    midi_msg_count: Arc<AtomicUsize>,
    midi_bridge: Option<midi::MidiBridgeHandle>,
    rtp_listener: Option<rtpmidi::RtpMidiListener>,
}

pub struct AppState {
    inner: Mutex<AppStateInner>,
}

impl AppState {
    fn new() -> Self {
        Self {
            inner: Mutex::new(AppStateInner {
                expected_pairing_id: None,
                paired_tx: None,
                discord_token: None,
                midi_tx: None,
                midi_msg_count: Arc::new(AtomicUsize::new(0)),
                midi_bridge: None,
                rtp_listener: None,
            }),
        }
    }
}

/* ------------------------------------------------------------------ */
/*  Secure token storage (keyring)                                     */
/* ------------------------------------------------------------------ */
fn store_discord_token(token: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| format!("keyring entry: {e}"))?;
    entry
        .set_password(token)
        .map_err(|e| format!("keyring set: {e}"))
}

fn load_discord_token() -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| format!("keyring entry: {e}"))?;
    match entry.get_password() {
        Ok(t) => Ok(Some(t)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("keyring get: {e}")),
    }
}

fn clear_discord_token() -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| format!("keyring entry: {e}"))?;
    entry
        .delete_credential()
        .map_err(|e| format!("keyring delete: {e}"))
}

/* ------------------------------------------------------------------ */
/*  WebSocket server                                                     */
/* ------------------------------------------------------------------ */
async fn run_websocket_server(state: Arc<AppState>) {
    let addr = format!("127.0.0.1:{WS_PORT}");
    let listener = match TcpListener::bind(&addr).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("[WS] Failed to bind {addr}: {e}");
            return;
        }
    };
    println!("[WS] Listening on {addr}");

    while let Ok((stream, _)) = listener.accept().await {
        let state = state.clone();
        tokio::spawn(handle_ws_client(stream, state));
    }
}

async fn handle_ws_client(stream: TcpStream, state: Arc<AppState>) {
    let ws_stream = match tokio_tungstenite::accept_async(stream).await {
        Ok(ws) => ws,
        Err(e) => {
            eprintln!("[WS] Handshake failed: {e}");
            return;
        }
    };

    let (mut write, mut read) = ws_stream.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<WsMessage>();

    // Forward channel messages to the WebSocket write half
    let forward_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if write.send(msg).await.is_err() {
                break;
            }
        }
    });

    // Read messages from the client
    while let Some(Ok(msg)) = read.next().await {
        if let Ok(text) = msg.to_text() {
            let parsed: Result<BridgeMessage, _> = serde_json::from_str(text);
            match parsed {
                Ok(BridgeMessage::Pair { pairing_id }) => {
                    let mut guard = state.inner.lock().await;
                    if guard.expected_pairing_id.as_ref() == Some(&pairing_id) {
                        guard.paired_tx = Some(tx.clone());
                        let ack = serde_json::to_string(&BridgeMessage::PairAck { pairing_id })
                            .unwrap_or_default();
                        let _ = tx.send(WsMessage::Text(ack.into()));
                    } else {
                        let nak = serde_json::to_string(&BridgeMessage::PairNak { pairing_id })
                            .unwrap_or_default();
                        let _ = tx.send(WsMessage::Text(nak.into()));
                    }
                }
                Ok(BridgeMessage::Pong { .. }) => {
                    // Keepalive received
                }
                Ok(BridgeMessage::Midi { .. }) => {
                    // Web app should not send midi to server
                }
                _ => {}
            }
        }
    }

    drop(tx);
    forward_task.abort();
}

/* ------------------------------------------------------------------ */
/*  MIDI packet forwarding                                             */
/* ------------------------------------------------------------------ */
fn forward_midi_packets(
    state: Arc<AppState>,
    mut rx: mpsc::UnboundedReceiver<MidiPacket>,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        while let Some(packet) = rx.recv().await {
            let guard = state.inner.lock().await;
            if let Some(ref tx) = guard.paired_tx {
                let pairing_id = guard.expected_pairing_id.clone().unwrap_or_default();
                let msg = BridgeMessage::Midi {
                    pairing_id,
                    packet,
                };
                let json = serde_json::to_string(&msg).unwrap_or_default();
                let _ = tx.send(WsMessage::Text(json.into()));
            }
            guard.midi_msg_count.fetch_add(1, Ordering::Relaxed);
        }
    })
}

/* ------------------------------------------------------------------ */
/*  Discord OAuth2 PKCE                                                */
/* ------------------------------------------------------------------ */
fn generate_pkce_verifier() -> String {
    use rand::Rng;
    const CHARSET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    let mut rng = rand::thread_rng();
    (0..128)
        .map(|_| CHARSET[rng.gen_range(0..CHARSET.len())] as char)
        .collect()
}

fn pkce_challenge(verifier: &str) -> String {
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;
    use base64::Engine;
    use sha2::Digest;
    let hash = sha2::Sha256::digest(verifier.as_bytes());
    URL_SAFE_NO_PAD.encode(hash)
}

async fn capture_oauth_code() -> Result<String, String> {
    let listener = TcpListener::bind(format!("127.0.0.1:{OAUTH_PORT}"))
        .await
        .map_err(|e| format!("oauth listener: {e}"))?;

    let (mut stream, _) = listener
        .accept()
        .await
        .map_err(|e| format!("oauth accept: {e}"))?;

    let mut buf = vec![0u8; 4096];
    let n = stream
        .read(&mut buf)
        .await
        .map_err(|e| format!("oauth read: {e}"))?;
    let req = String::from_utf8_lossy(&buf[..n]);

    // Extract code from query string
    let code = req
        .lines()
        .next()
        .and_then(|line| {
            let path = line.split_whitespace().nth(1)?;
            let query = path.split('?').nth(1)?;
            let params: HashMap<_, _> =
                url::form_urlencoded::parse(query.as_bytes()).collect();
            params.get("code").map(|s| s.to_string())
        })
        .ok_or("missing code in oauth callback")?;

    let response = "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nConnection: close\r\n\r\n<html><body><h1>Auth complete</h1><p>You may close this window.</p></body></html>";
    let _ = stream.write_all(response.as_bytes()).await;
    let _ = stream.flush().await;

    Ok(code)
}

async fn exchange_discord_token(code: &str, verifier: &str) -> Result<String, String> {
    let client = reqwest::Client::new();
    let client_id = discord_client_id();
    if client_id.is_empty() {
        return Err("DISCORD_CLIENT_ID not set".into());
    }

    let params = [
        ("client_id", client_id.as_str()),
        ("grant_type", "authorization_code"),
        ("code", code),
        ("redirect_uri", &format!("http://localhost:{OAUTH_PORT}/oauth/callback")),
        ("code_verifier", verifier),
    ];

    let res = client
        .post("https://discord.com/api/oauth2/token")
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("token request: {e}"))?;

    if !res.status().is_success() {
        let body = res.text().await.unwrap_or_default();
        return Err(format!("discord token exchange failed: {body}"));
    }

    #[derive(Deserialize)]
    struct TokenResponse {
        access_token: String,
    }

    let token_res: TokenResponse = res
        .json()
        .await
        .map_err(|e| format!("token parse: {e}"))?;

    Ok(token_res.access_token)
}

/* ------------------------------------------------------------------ */
/*  Billing                                                            */
/* ------------------------------------------------------------------ */
async fn fetch_billing(token: &str) -> Result<BillingSnapshot, String> {
    let client = reqwest::Client::new();
    let res = client
        .post(format!("{}/billing/bootstrap", server_base_url()))
        .json(&serde_json::json!({
            "accessToken": token,
            "channelId": "midi-bridge-global"
        }))
        .send()
        .await
        .map_err(|e| format!("billing request: {e}"))?;

    if !res.status().is_success() {
        let body = res.text().await.unwrap_or_default();
        return Err(format!("billing error: {body}"));
    }

    res.json()
        .await
        .map_err(|e| format!("billing parse: {e}"))
}

/* ------------------------------------------------------------------ */
/*  Tauri commands                                                     */
/* ------------------------------------------------------------------ */
#[tauri::command]
async fn discord_auth(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let verifier = generate_pkce_verifier();
    let challenge = pkce_challenge(&verifier);
    let client_id = discord_client_id();
    if client_id.is_empty() {
        return Err("DISCORD_CLIENT_ID not set".into());
    }

    let auth_url = format!(
        "https://discord.com/oauth2/authorize?client_id={}&response_type=code&redirect_uri=http%3A%2F%2Flocalhost%3A{}%2Foauth%2Fcallback&scope=identify&code_challenge={}&code_challenge_method=S256",
        client_id, OAUTH_PORT, challenge
    );

    // Open browser
    app.shell()
        .open(&auth_url, None)
        .map_err(|e| format!("open browser: {e}"))?;

    // Capture callback
    let code = capture_oauth_code().await?;

    // Exchange for token
    let token = exchange_discord_token(&code, &verifier).await?;

    // Store token
    store_discord_token(&token)?;

    // Update state
    let mut guard = state.inner.lock().await;
    guard.discord_token = Some(token);

    Ok(())
}

#[tauri::command]
async fn has_discord_token(state: tauri::State<'_, Arc<AppState>>) -> Result<bool, String> {
    match load_discord_token()? {
        Some(token) => {
            let mut guard = state.inner.lock().await;
            guard.discord_token = Some(token);
            Ok(true)
        }
        None => Ok(false),
    }
}

#[tauri::command]
async fn check_billing(state: tauri::State<'_, Arc<AppState>>) -> Result<bool, String> {
    let token = {
        let guard = state.inner.lock().await;
        guard.discord_token.clone()
    };
    let token = match token {
        Some(t) => t,
        None => match load_discord_token()? {
            Some(t) => {
                let mut guard = state.inner.lock().await;
                guard.discord_token = Some(t.clone());
                t
            }
            None => return Ok(false),
        },
    };

    let billing = fetch_billing(&token).await?;
    Ok(billing.plan == "unlimited")
}

#[tauri::command]
async fn get_upgrade_url(state: tauri::State<'_, Arc<AppState>>) -> Result<String, String> {
    let token = {
        let guard = state.inner.lock().await;
        guard.discord_token.clone()
    };
    let token = match token {
        Some(t) => t,
        None => match load_discord_token()? {
            Some(t) => t,
            None => return Err("No token".into()),
        },
    };

    let client = reqwest::Client::new();
    let res = client
        .post(format!("{}/billing/checkout", server_base_url()))
        .json(&serde_json::json!({
            "accessToken": token,
            "channelId": "midi-bridge-global"
        }))
        .send()
        .await
        .map_err(|e| format!("checkout request: {e}"))?;

    #[derive(Deserialize)]
    struct CheckoutResponse {
        url: Option<String>,
    }

    let body: CheckoutResponse = res
        .json()
        .await
        .map_err(|e| format!("checkout parse: {e}"))?;

    Ok(body.url.unwrap_or_default())
}

#[tauri::command]
async fn open_url(app: tauri::AppHandle, url: String) -> Result<(), String> {
    app.shell()
        .open(&url, None)
        .map_err(|e| format!("open url: {e}"))
}

#[tauri::command]
async fn pair_session(
    state: tauri::State<'_, Arc<AppState>>,
    pairing_id: String,
) -> Result<(), String> {
    let mut guard = state.inner.lock().await;
    guard.expected_pairing_id = Some(pairing_id);
    Ok(())
}

#[tauri::command]
async fn unpair_session(state: tauri::State<'_, Arc<AppState>>) -> Result<(), String> {
    let mut guard = state.inner.lock().await;
    guard.expected_pairing_id = None;
    guard.paired_tx = None;
    Ok(())
}

#[tauri::command]
async fn list_midi_devices(state: tauri::State<'_, Arc<AppState>>) -> Result<Vec<String>, String> {
    let mut guard = state.inner.lock().await;
    if guard.midi_bridge.is_none() {
        guard.midi_bridge = Some(midi::MidiBridgeHandle::new()?);
    }
    let devices = guard.midi_bridge.as_mut().unwrap().refresh_ports();
    Ok(devices)
}

#[tauri::command]
async fn select_midi_device(
    state: tauri::State<'_, Arc<AppState>>,
    port_index: usize,
) -> Result<(), String> {
    let tokio_tx = {
        let mut guard = state.inner.lock().await;

        // Ensure midi_bridge exists
        if guard.midi_bridge.is_none() {
            guard.midi_bridge = Some(midi::MidiBridgeHandle::new()?);
        }

        // Ensure midi channel exists
        if guard.midi_tx.is_none() {
            let (tx, rx) = mpsc::unbounded_channel::<MidiPacket>();
            guard.midi_tx = Some(tx);
            let tokio_tx = guard.midi_tx.as_ref().unwrap().clone();
            drop(guard);
            let _ = forward_midi_packets(Arc::clone(&state), rx);
            tokio_tx
        } else {
            guard.midi_tx.as_ref().unwrap().clone()
        }
    };

    // Bridge from std::sync::mpsc to tokio channel
    let (std_tx, std_rx) = std::sync::mpsc::channel::<MidiPacket>();
    tokio::spawn(async move {
        while let Ok(pkt) = std_rx.recv() {
            let _ = tokio_tx.send(pkt);
        }
    });

    let mut guard = state.inner.lock().await;
    let bridge = guard.midi_bridge.as_mut().unwrap();
    bridge
        .connect(port_index, std_tx)
        .map_err(|e| format!("connect: {e}"))?;

    Ok(())
}

#[tauri::command]
async fn deselect_midi_device(state: tauri::State<'_, Arc<AppState>>) -> Result<(), String> {
    let mut guard = state.inner.lock().await;
    if let Some(ref mut bridge) = guard.midi_bridge {
        bridge.disconnect();
    }
    Ok(())
}

#[tauri::command]
async fn get_midi_msg_rate(state: tauri::State<'_, Arc<AppState>>) -> Result<u64, String> {
    let guard = state.inner.lock().await;
    let count = guard.midi_msg_count.swap(0, Ordering::Relaxed);
    Ok(count as u64)
}

#[tauri::command]
async fn toggle_rtp_midi(
    state: tauri::State<'_, Arc<AppState>>,
    enable: bool,
) -> Result<(), String> {
    let mut guard = state.inner.lock().await;

    if !enable {
        if let Some(ref mut listener) = guard.rtp_listener {
            listener.stop();
        }
        guard.rtp_listener = None;
        return Ok(());
    }

    // Ensure midi channel exists
    if guard.midi_tx.is_none() {
        let (tx, rx) = mpsc::unbounded_channel::<MidiPacket>();
        guard.midi_tx = Some(tx);
        drop(guard);
        let _ = forward_midi_packets(Arc::clone(&state), rx);
        let mut guard = state.inner.lock().await;
        let midi_tx = guard.midi_tx.as_ref().unwrap().clone();
        let mut listener = rtpmidi::RtpMidiListener::new();
        listener.start(midi_tx).await?;
        guard.rtp_listener = Some(listener);
    } else {
        let midi_tx = guard.midi_tx.as_ref().unwrap().clone();
        let mut listener = rtpmidi::RtpMidiListener::new();
        listener.start(midi_tx).await?;
        guard.rtp_listener = Some(listener);
    }

    Ok(())
}

/* ------------------------------------------------------------------ */
/*  Public API                                                          */
/* ------------------------------------------------------------------ */
pub fn run() {
    let state = Arc::new(AppState::new());

    // Spawn WebSocket server
    let ws_state = state.clone();
    tokio::spawn(async move {
        run_websocket_server(ws_state).await;
    });

    tauri::Builder::default()
        .manage(state)
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            discord_auth,
            has_discord_token,
            check_billing,
            get_upgrade_url,
            open_url,
            pair_session,
            unpair_session,
            list_midi_devices,
            select_midi_device,
            deselect_midi_device,
            get_midi_msg_rate,
            toggle_rtp_midi,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
