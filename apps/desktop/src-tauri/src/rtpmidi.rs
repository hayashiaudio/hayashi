use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::UdpSocket;
use tokio::sync::mpsc;

use crate::MidiPacket;

const RTP_MIDI_PORT: u16 = 5004;

pub struct RtpMidiListener {
    socket: Option<Arc<UdpSocket>>,
    _task: Option<tokio::task::JoinHandle<()>>,
}

impl RtpMidiListener {
    pub fn new() -> Self {
        Self {
            socket: None,
            _task: None,
        }
    }

    pub async fn start(
        &mut self,
        packet_tx: mpsc::UnboundedSender<MidiPacket>,
    ) -> Result<(), String> {
        self.stop();

        let addr: SocketAddr = format!("0.0.0.0:{RTP_MIDI_PORT}")
            .parse()
            .map_err(|e| format!("parse addr: {e}"))?;

        let socket = UdpSocket::bind(addr)
            .await
            .map_err(|e| format!("bind udp {addr}: {e}"))?;

        let socket = Arc::new(socket);
        self.socket = Some(socket.clone());

        let task = tokio::spawn(async move {
            let mut buf = vec![0u8; 2048];
            loop {
                match socket.recv_from(&mut buf).await {
                    Ok((len, _from)) => {
                        if let Some(packets) = parse_rtp_midi(&buf[..len]) {
                            for pkt in packets {
                                let _ = packet_tx.send(pkt);
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("[RTP-MIDI] recv error: {e}");
                        tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
                    }
                }
            }
        });

        self._task = Some(task);
        Ok(())
    }

    pub fn stop(&mut self) {
        if let Some(t) = self._task.take() {
            t.abort();
        }
        self.socket = None;
    }
}

/* ------------------------------------------------------------------ */
/*  Minimal RTP-MIDI parser                                            */
/* ------------------------------------------------------------------ */
fn parse_rtp_midi(data: &[u8]) -> Option<Vec<MidiPacket>> {
    if data.len() < 13 {
        return None; // Need at least RTP header (12) + flags (1)
    }

    // Minimal RTP header parsing
    let version = (data[0] >> 6) & 0x03;
    if version != 2 {
        return None;
    }

    let payload_type = data[1] & 0x7F;
    // Apple MIDI uses payload type 97 (0x61) usually, but we accept any
    let _payload_type = payload_type;

    // Skip RTP header (12 bytes)
    let mut offset = 12;

    // RTP-MIDI flags
    let flags = data[offset];
    offset += 1;

    let has_delta_time = (flags & 0x80) != 0; // Z flag
    let _has_journal = (flags & 0x40) != 0;   // J flag
    let _has_phantom = (flags & 0x20) != 0;   // P flag
    let _is_closed = (flags & 0x10) != 0;     // B flag

    // Delta-time length (if Z=1)
    if has_delta_time {
        if offset >= data.len() {
            return None;
        }
        let dt_len = data[offset] as usize;
        offset += 1;
        if dt_len > 0 {
            // Multi-byte delta-time
            offset += dt_len;
        }
        if offset >= data.len() {
            return None;
        }
    }

    // MIDI command section
    let mut packets = Vec::new();
    while offset < data.len() {
        let status = data[offset];
        let msg_type = status >> 4;
        let channel = status & 0x0F;

        match msg_type {
            0x8 => {
                // Note Off
                if offset + 3 <= data.len() {
                    packets.push(MidiPacket {
                        packet_type: "noteOff".to_string(),
                        note: Some(data[offset + 1]),
                        velocity: Some(data[offset + 2]),
                        value: None,
                        channel,
                    });
                    offset += 3;
                } else {
                    break;
                }
            }
            0x9 => {
                // Note On
                if offset + 3 <= data.len() {
                    packets.push(MidiPacket {
                        packet_type: "noteOn".to_string(),
                        note: Some(data[offset + 1]),
                        velocity: Some(data[offset + 2]),
                        value: None,
                        channel,
                    });
                    offset += 3;
                } else {
                    break;
                }
            }
            0xB => {
                // Control Change
                if offset + 3 <= data.len() {
                    packets.push(MidiPacket {
                        packet_type: "cc".to_string(),
                        note: Some(data[offset + 1]),
                        velocity: None,
                        value: Some(data[offset + 2]),
                        channel,
                    });
                    offset += 3;
                } else {
                    break;
                }
            }
            0xF => {
                // System common / real-time — skip for now
                break;
            }
            _ => {
                // Running status or unsupported — skip
                break;
            }
        }
    }

    if packets.is_empty() {
        None
    } else {
        Some(packets)
    }
}
