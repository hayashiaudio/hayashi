use std::sync::mpsc::{channel, Sender};
use std::thread::{self, JoinHandle};

use crate::MidiPacket;

pub struct MidiBridgeHandle {
    ports: Vec<String>,
    _handle: Option<JoinHandle<()>>,
    _stop_tx: Option<Sender<()>>,
}

impl MidiBridgeHandle {
    pub fn new() -> Result<Self, String> {
        let input = midir::MidiInput::new("Hayashi MIDI Bridge")
            .map_err(|e| format!("midir init: {e}"))?;

        let ports: Vec<String> = input
            .ports()
            .iter()
            .map(|p| input.port_name(p).unwrap_or_else(|_| "Unknown".into()))
            .collect();

        Ok(Self {
            ports,
            _handle: None,
            _stop_tx: None,
        })
    }

    pub fn refresh_ports(&mut self) -> Vec<String> {
        if let Ok(input) = midir::MidiInput::new("Hayashi MIDI Bridge") {
            self.ports = input
                .ports()
                .iter()
                .map(|p| input.port_name(p).unwrap_or_else(|_| "Unknown".into()))
                .collect();
        }
        self.ports.clone()
    }

    pub fn ports(&self) -> &[String] {
        &self.ports
    }

    pub fn connect(
        &mut self,
        port_index: usize,
        packet_tx: std::sync::mpsc::Sender<MidiPacket>,
    ) -> Result<(), String> {
        self.disconnect();

        let input = midir::MidiInput::new("Hayashi MIDI Bridge")
            .map_err(|e| format!("midir init: {e}"))?;

        let ports = input.ports();
        let port = ports
            .get(port_index)
            .ok_or("Invalid MIDI port index")?;

        let port_name = input
            .port_name(port)
            .unwrap_or_else(|_| "Unknown".into());

        let (stop_tx, stop_rx) = channel::<()>();

        let conn = input
            .connect(
                port,
                "hayashi-midi-input",
                move |_stamp, msg, _| {
                    if let Some(pkt) = parse_midi_bytes(msg) {
                        let _ = packet_tx.send(pkt);
                    }
                },
                (),
            )
            .map_err(|e| format!("midir connect: {e}"))?;

        // Spawn a watcher thread that holds the connection alive
        // and listens for a stop signal.
        let handle = thread::spawn(move || {
            let _conn = conn;
            let _name = port_name;
            let _ = stop_rx.recv();
        });

        self._handle = Some(handle);
        self._stop_tx = Some(stop_tx);
        Ok(())
    }

    pub fn disconnect(&mut self) {
        if let Some(tx) = self._stop_tx.take() {
            let _ = tx.send(());
        }
        if let Some(h) = self._handle.take() {
            let _ = h.join();
        }
    }
}

fn parse_midi_bytes(bytes: &[u8]) -> Option<MidiPacket> {
    if bytes.is_empty() {
        return None;
    }

    let status = bytes[0];
    let msg_type = status >> 4;
    let channel = (status & 0x0F) as u8;

    match msg_type {
        0x8 => {
            // Note Off
            if bytes.len() >= 3 {
                Some(MidiPacket {
                    packet_type: "noteOff".to_string(),
                    note: Some(bytes[1]),
                    velocity: Some(bytes[2]),
                    value: None,
                    channel,
                })
            } else {
                None
            }
        }
        0x9 => {
            // Note On
            if bytes.len() >= 3 {
                Some(MidiPacket {
                    packet_type: "noteOn".to_string(),
                    note: Some(bytes[1]),
                    velocity: Some(bytes[2]),
                    value: None,
                    channel,
                })
            } else {
                None
            }
        }
        0xB => {
            // Control Change
            if bytes.len() >= 3 {
                Some(MidiPacket {
                    packet_type: "cc".to_string(),
                    note: Some(bytes[1]),
                    velocity: None,
                    value: Some(bytes[2]),
                    channel,
                })
            } else {
                None
            }
        }
        _ => None,
    }
}

pub fn list_midi_input_ports() -> Result<Vec<String>, String> {
    let input = midir::MidiInput::new("Hayashi MIDI Bridge")
        .map_err(|e| format!("midir init: {e}"))?;

    let names: Vec<String> = input
        .ports()
        .iter()
        .map(|p| input.port_name(p).unwrap_or_else(|_| "Unknown".into()))
        .collect();

    Ok(names)
}
