import {
  Disc3,
  Headphones,
  Music2,
  Play,
  Plus,
  Save,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Search,
  Waves,
  ChevronRight,
  GripVertical,
} from 'lucide-react';

const browserItems = [
  { label: 'Sampler Nodes', meta: '12 instruments', accent: 'leaf', count: 12 },
  { label: 'Effect Chains', meta: 'Delay, filter, bloom', accent: 'signal', count: 8 },
  { label: 'Jam Templates', meta: 'Forest pulse, dusk house', accent: 'ember', count: 6 },
  { label: 'Reaction Drops', meta: 'Crowd FX and stingers', accent: 'moss', count: 24 },
];

const sampleCrates = [
  { name: 'cedar-rim.wav', length: '04.2s', color: '#8fb13a' },
  { name: 'night-bird-loop.wav', length: '08.0s', color: '#6a9bcc' },
  { name: 'paper-shaker-03.wav', length: '01.4s', color: '#ed922f' },
];

const sequence = [
  { label: 'KICK', steps: [true, false, false, false, true, false, false, false] },
  { label: 'SNARE', steps: [false, false, true, false, false, false, true, false] },
  { label: 'HAT', steps: [true, true, true, true, true, true, false, true] },
  { label: 'BLOOM', steps: [false, false, false, true, false, false, true, false] },
];

const nodes = [
  {
    id: 'source',
    title: 'Koto Grain',
    badge: 'Sampler',
    badgeIcon: Music2,
    dotTone: '',
    top: 94,
    left: 48,
    params: { meter: [12, 28, 18, 34, 22] },
  },
  {
    id: 'filter',
    title: 'Moss Gate',
    badge: 'Filter',
    badgeIcon: SlidersHorizontal,
    dotTone: 'signal',
    top: 126,
    left: 402,
    params: { knobs: [{ label: 'Cutoff', value: '78%' }, { label: 'Res', value: '31%' }] },
  },
  {
    id: 'seq',
    title: 'Drop Steps',
    badge: 'Sequencer',
    badgeIcon: Disc3,
    dotTone: 'leaf',
    top: 'auto',
    bottom: 66,
    left: 108,
    params: { steps: [true, false, true, false, true, true, false, false] },
  },
  {
    id: 'output',
    title: 'Forest Bus',
    badge: 'Output',
    badgeIcon: Waves,
    dotTone: '',
    top: 274,
    right: 52,
    params: { bars: [22, 36, 28, 40, 30, 18] },
  },
];

function MiniWaveform({ count = 28, width = 90, height = 18, seed = 7 }: { count?: number; width?: number; height?: number; seed?: number }) {
  const bars = [];
  for (let i = 0; i < count; i++) {
    const t = (i / count) * Math.PI * 5 + seed;
    const h = height * (0.25 + 0.75 * Math.abs(Math.sin(t) * 0.55 + Math.sin(t * 2.1) * 0.3 + Math.sin(t * 4.7) * 0.15));
    bars.push(
      <span
        key={i}
        style={{
          display: 'block',
          width: Math.max(1, Math.floor(width / count) - 1),
          height: `${h}px`,
          borderRadius: 999,
          background: 'linear-gradient(180deg, #8fb13a, #6f7b5d)',
        }}
      />
    );
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 1, height, width }}>
      {bars}
    </div>
  );
}

function MiniWaveformColored({ count = 24, height = 18, seed = 7, colorFrom = '#8fb13a', colorTo = '#6f7b5d' }: { count?: number; height?: number; seed?: number; colorFrom?: string; colorTo?: string }) {
  const bars = [];
  for (let i = 0; i < count; i++) {
    const t = (i / count) * Math.PI * 5 + seed;
    const h = height * (0.25 + 0.75 * Math.abs(Math.sin(t) * 0.55 + Math.sin(t * 2.1) * 0.3 + Math.sin(t * 4.7) * 0.15));
    bars.push(
      <span
        key={i}
        style={{
          display: 'block',
          flex: 1,
          minWidth: 1,
          height: `${h}px`,
          borderRadius: 999,
          background: `linear-gradient(180deg, ${colorFrom}, ${colorTo})`,
        }}
      />
    );
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 1, height, width: '100%' }}>
      {bars}
    </div>
  );
}

function WavePeaks({ bars = 120, height = 140, seed = 42, playhead = 0.4 }: { bars?: number; height?: number; seed?: number; playhead?: number }) {
  const peaks = [];
  for (let i = 0; i < bars; i++) {
    const t = i * 0.18 + seed;
    const amp = Math.abs(Math.sin(t) * 0.5 + Math.sin(t * 2.3) * 0.28 + Math.sin(t * 5.1) * 0.14 + Math.sin(t * 8.7) * 0.08);
    peaks.push(amp);
  }
  const maxAmp = Math.max(...peaks, 0.01);
  const norm = peaks.map((p) => p / maxAmp);
  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${bars} ${height}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="wpFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f6df9f" />
          <stop offset="50%" stopColor="#ed922f" />
          <stop offset="100%" stopColor="#8fb13a" />
        </linearGradient>
      </defs>
      {norm.map((n, i) => {
        const barW = 0.65;
        const x = i + (1 - barW) / 2;
        const h = n * height * 0.92;
        const y = (height - h) / 2;
        const afterHead = i / bars > playhead;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barW}
            height={h}
            rx={0.25}
            fill={afterHead ? 'rgba(247, 239, 215, 0.22)' : 'url(#wpFill)'}
          />
        );
      })}
      <line x1={bars * playhead} y1={0} x2={bars * playhead} y2={height} stroke="#f7efd7" strokeWidth={0.8} />
    </svg>
  );
}

function getNodeHandlePos(
  node: (typeof nodes)[number],
  handle: 'top' | 'right' | 'bottom' | 'left',
  patchW = 824,
  patchH = 490
) {
  const w = 190;
  const heights: Record<string, number> = { source: 140, filter: 120, seq: 120, output: 120 };
  const h = heights[node.id] ?? 130;

  let x: number;
  let y: number;

  const left = (node.left as number | undefined) ?? (node.right !== undefined ? patchW - node.right - w : 0);
  const top =
    typeof node.top === 'number'
      ? node.top
      : node.bottom !== undefined
        ? patchH - node.bottom - h
        : 0;

  const HANDLE_R = 5; // handle center is 5px outside the node edge

  switch (handle) {
    case 'top':
      x = left + w / 2;
      y = top - HANDLE_R;
      break;
    case 'right':
      x = left + w + HANDLE_R;
      y = top + h / 2;
      break;
    case 'bottom':
      x = left + w / 2;
      y = top + h + HANDLE_R;
      break;
    case 'left':
      x = left - HANDLE_R;
      y = top + h / 2;
      break;
  }
  return { x, y };
}

type CableConn = { fromNode: string; fromHandle: 'top' | 'right' | 'bottom' | 'left'; toNode: string; toHandle: 'top' | 'right' | 'bottom' | 'left'; color: string };
const PATCH_CABLES: CableConn[] = [
  { fromNode: 'source', fromHandle: 'right', toNode: 'filter', toHandle: 'left', color: '#ed922f' },
  { fromNode: 'filter', fromHandle: 'right', toNode: 'output', toHandle: 'left', color: '#6a9bcc' },
  { fromNode: 'seq', fromHandle: 'right', toNode: 'output', toHandle: 'bottom', color: '#8fb13a' },
];

const stageMarkers = [
  { label: 'Source', tone: 'leaf', style: { top: 56, left: 40 } },
  { label: 'Tone', tone: 'ember', style: { top: 44, left: 340 } },
  { label: 'Clock', tone: 'leaf', style: { bottom: 64, left: 116 } },
  { label: 'Bus', tone: 'signal', style: { top: 236, right: 56 } },
];

const collaborators = [
  { initials: 'JD', name: 'JD', role: 'Room host', status: 'Driving transport', tone: 'active', avatar: 'https://cdn.discordapp.com/embed/avatars/0.png' },
  { initials: 'MK', name: 'Mika', role: 'Bass patch', status: 'Routing low end', tone: 'default', avatar: 'https://cdn.discordapp.com/embed/avatars/1.png' },
  { initials: 'AL', name: 'Ari', role: 'Visual pulse', status: 'Listening on cue', tone: 'listening', avatar: 'https://cdn.discordapp.com/embed/avatars/2.png' },
  { initials: 'SK', name: 'Sora', role: 'Scene memory', status: 'Editing clips', tone: 'default', avatar: 'https://cdn.discordapp.com/embed/avatars/3.png' },
];

export function CoreWorkspaceMockupPage() {
  return (
    <main className="hayashi-mockup-page">
      <section className="hayashi-mockup-frame">
        {/* Topbar */}
        <header className="hayashi-workspace-topbar">
          <div className="hayashi-topbar-brand">
            <div className="hayashi-mark-chip">
              <img src="/hayashi-logo.png" alt="Hayashi" />
            </div>
            <div>
              <p className="hayashi-mini-label">Discord Activity Room</p>
              <h1>Oak Grove Jam</h1>
            </div>
          </div>

          <div className="hayashi-topbar-center">
            <div className="hayashi-rhythm-chip">
              <span className="hayashi-live-pulse" />
              Discord live
            </div>
            <div className="hayashi-room-code">instanceId · grove-24a</div>
            <div className="hayashi-subpill">4 friends listening locally</div>
          </div>

          <div className="hayashi-topbar-actions">
            <button className="hayashi-quiet-button" type="button">
              <Save size={14} />
              Save snapshot
            </button>
            <button className="hayashi-quiet-button" type="button">
              <Share2 size={14} />
              Invite
            </button>
            <button className="hayashi-action" type="button">
              <Waves size={14} />
              Export WAV
            </button>
          </div>
        </header>

        <div className="hayashi-workspace-main">
          {/* Left Sidebar */}
          <aside className="hayashi-workspace-left">
            <section className="hayashi-mockup-panel hayashi-drawer-panel">
              <div className="hayashi-panel-title-row">
                <div>
                  <p className="hayashi-mini-label">Patch Browser</p>
                  <h2>Build the room</h2>
                </div>
                <button className="hayashi-icon-button" type="button" aria-label="Add patch">
                  <Plus size={16} />
                </button>
              </div>

              <div className="hayashi-search-panel hayashi-search-panel-browser">
                <div className="hayashi-search-input">
                  <Search size={15} />
                  <span>warm plucked loop with leaf texture</span>
                </div>
                <div className="hayashi-search-tags">
                  <span>presets</span>
                  <span>samples</span>
                  <span>saved jams</span>
                </div>
              </div>

              <div className="hayashi-browser-list">
                {browserItems.map((item) => (
                  <article
                    key={item.label}
                    className={`hayashi-browser-item hayashi-browser-item-${item.accent}`}
                  >
                    <div className="hayashi-browser-item-meta">
                      <strong>{item.label}</strong>
                      <span>{item.meta}</span>
                    </div>
                    <div className="hayashi-browser-item-right">
                      <span className="hayashi-browser-count">{item.count}</span>
                      <ChevronRight size={14} />
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="hayashi-mockup-panel hayashi-drawer-panel">
              <div className="hayashi-panel-title-row">
                <div>
                  <p className="hayashi-mini-label">Sample Crate</p>
                  <h2>Drag sounds in</h2>
                </div>
                <div className="hayashi-subpill">R2 synced</div>
              </div>

              <div className="hayashi-sample-list">
                {sampleCrates.map((sample) => (
                  <div key={sample.name} className="hayashi-sample-card">
                    <div className="hayashi-sample-wave">
                      <MiniWaveformColored seed={sample.name.length} colorFrom={sample.color} colorTo="#6f7b5d" count={32} height={36} />
                    </div>
                    <div className="hayashi-sample-meta">
                      <div>
                        <strong>{sample.name}</strong>
                        <span>{sample.length}</span>
                      </div>
                      <GripVertical size={14} className="hayashi-sample-drag" />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </aside>

          {/* Center Stage */}
          <section className="hayashi-workspace-center">
            {/* Explainer */}
            <div className="hayashi-explainer-bar">
              <div className="hayashi-explainer-copy">
                <span className="hayashi-explainer-dot" />
                <p>
                  <strong>Shared patching:</strong> One person shapes source, another drives modulation, and the room hears a single synced graph rendered locally.
                </p>
              </div>
              <div className="hayashi-explainer-tags" aria-hidden="true">
                <span>Yjs graph</span>
                <span>Discord room</span>
                <span>Local audio</span>
              </div>
            </div>

            <div className="hayashi-mockup-panel hayashi-room-shell">
              {/* Patch Stage with SVG Cables */}
              <div className="hayashi-patch-stage">
                <div className="hayashi-signal-transport-card">
                  <div className="hayashi-transport-shell">
                    <div className="hayashi-transport-topline">
                      <div className="hayashi-transport-topline-left">
                        <div className="hayashi-rhythm-chip">
                          <span className="hayashi-rhythm-dot" />
                          Live Room
                        </div>
                      </div>
                      <div className="hayashi-transport-topline-center">
                        <span className="hayashi-wave-label">Master Pulse</span>
                        <MiniWaveform seed={11} />
                      </div>
                      <div className="hayashi-transport-topline-right">
                        <div className="hayashi-rhythm-readout">BAR 24 · 02:31</div>
                      </div>
                    </div>
                    <div className="hayashi-transport">
                      <div className="hayashi-transport-cluster">
                        <div className="hayashi-pill hayashi-pill-muted">128 BPM</div>
                        <div className="hayashi-subpill">4/4 · D Minor</div>
                      </div>
                      <div className="hayashi-transport-center">
                        <button className="hayashi-circle-button hayashi-circle-button-small" type="button" aria-label="Previous">
                          <span className="hayashi-skip-mark" />
                        </button>
                        <button className="hayashi-circle-button" type="button" aria-label="Play">
                          <Play size={18} fill="currentColor" />
                        </button>
                        <button className="hayashi-circle-button hayashi-circle-button-small" type="button" aria-label="Next">
                          <span className="hayashi-skip-mark hayashi-skip-mark-right" />
                        </button>
                      </div>
                      <div className="hayashi-transport-cluster hayashi-transport-cluster-end">
                        <div className="hayashi-pill">Scene A</div>
                        <div className="hayashi-led-stack">
                          <span />
                          <span />
                          <span />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="hayashi-patch-stage-head">
                  <div className="hayashi-patch-stage-copy">
                    <p className="hayashi-mini-label">Signal Flow</p>
                    <h2>Arrange the grove</h2>
                    <p>
                      The sampler feeds tone shaping, the sequencer clocks scene changes, and the bus glues the room into one shared loop.
                    </p>
                  </div>
                  <div className="hayashi-stage-sideband">
                    <div className="hayashi-patch-stage-stats">
                      <div>
                        <strong>4</strong>
                        <span>live nodes</span>
                      </div>
                      <div>
                        <strong>3</strong>
                        <span>active routes</span>
                      </div>
                      <div>
                        <strong>26ms</strong>
                        <span>sync drift</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="hayashi-patch-field">
                  <div className="hayashi-patch-backdrop" />
                  <div className="hayashi-patch-field-glow hayashi-patch-field-glow-source" />
                  <div className="hayashi-patch-field-glow hayashi-patch-field-glow-output" />

                  {stageMarkers.map((marker) => (
                    <div
                      key={marker.label}
                      className={`hayashi-stage-marker hayashi-stage-marker-${marker.tone}`}
                      style={marker.style}
                    >
                      {marker.label}
                    </div>
                  ))}

                  <svg
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 1, pointerEvents: 'none', overflow: 'visible' }}
                  >
                    <defs>
                      <linearGradient id="cable-ember" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#ed922f" stopOpacity="0.85" />
                        <stop offset="100%" stopColor="#d97757" stopOpacity="0.35" />
                      </linearGradient>
                      <linearGradient id="cable-signal" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#6a9bcc" stopOpacity="0.85" />
                        <stop offset="100%" stopColor="#4a7aad" stopOpacity="0.35" />
                      </linearGradient>
                      <linearGradient id="cable-leaf" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#8fb13a" stopOpacity="0.85" />
                        <stop offset="100%" stopColor="#6f9c2a" stopOpacity="0.35" />
                      </linearGradient>
                    </defs>

                    {PATCH_CABLES.map((cable) => {
                      const fromNode = nodes.find((n) => n.id === cable.fromNode)!;
                      const toNode = nodes.find((n) => n.id === cable.toNode)!;
                      const from = getNodeHandlePos(fromNode, cable.fromHandle);
                      const to = getNodeHandlePos(toNode, cable.toHandle);

                      const dist = Math.hypot(to.x - from.x, to.y - from.y);
                      const curvature = 0.5;
                      const cpOffset = Math.min(dist * curvature, 120);

                      const dir = (h: 'top' | 'right' | 'bottom' | 'left') => {
                        switch (h) {
                          case 'top': return [0, -1];
                          case 'right': return [1, 0];
                          case 'bottom': return [0, 1];
                          case 'left': return [-1, 0];
                        }
                      };
                      const [dx1, dy1] = dir(cable.fromHandle);
                      const [dx2, dy2] = dir(cable.toHandle);
                      const cp1x = from.x + dx1 * cpOffset;
                      const cp1y = from.y + dy1 * cpOffset;
                      const cp2x = to.x + dx2 * cpOffset;
                      const cp2y = to.y + dy2 * cpOffset;

                      const d = `M ${from.x.toFixed(1)} ${from.y.toFixed(1)} C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${to.x.toFixed(1)} ${to.y.toFixed(1)}`;

                      const gradId =
                        cable.color === '#ed922f' ? 'url(#cable-ember)' :
                        cable.color === '#6a9bcc' ? 'url(#cable-signal)' :
                        'url(#cable-leaf)';

                      return (
                        <g key={cable.fromNode + '-' + cable.toNode}>
                          <path d={d} fill="none" stroke={cable.color} strokeWidth={10} strokeLinecap="round" opacity={0.06} />
                          <path d={d} fill="none" stroke={cable.color} strokeWidth={4} strokeLinecap="round" opacity={0.14} />
                          <path d={d} fill="none" stroke={gradId} strokeWidth={2.2} strokeLinecap="round" />
                          <circle cx={from.x} cy={from.y} r={2.5} fill={cable.color} opacity={0.9} />
                          <circle cx={to.x} cy={to.y} r={2.5} fill={cable.color} opacity={0.9} />
                        </g>
                      );
                    })}
                  </svg>

                  {nodes.map((node) => (
                    <article
                      key={node.id}
                      className={`hayashi-patch-node hayashi-patch-node-${node.id}`}
                      style={{
                        top: node.top,
                        left: node.left,
                        right: node.right,
                        bottom: node.bottom,
                      }}
                    >
                      <div className="hayashi-node-handle hayashi-node-handle-top" />
                      <div className="hayashi-node-handle hayashi-node-handle-right" />
                      <div className="hayashi-node-handle hayashi-node-handle-bottom" />
                      <div className="hayashi-node-handle hayashi-node-handle-left" />

                      <div className="hayashi-patch-node-head">
                        <div className="hayashi-node-badge">
                          <node.badgeIcon size={14} />
                          {node.badge}
                        </div>
                        <div className={`hayashi-node-dot ${node.dotTone ? `hayashi-node-dot-${node.dotTone}` : ''}`} />
                      </div>
                      <h3>{node.title}</h3>

                      {node.params.meter && (
                        <div className="hayashi-mini-meter">
                          <MiniWaveformColored seed={7} colorFrom="#8fb13a" colorTo="#ed922f" count={20} height={28} />
                        </div>
                      )}

                      {node.params.knobs && (
                        <div className="hayashi-node-knobs">
                          {node.params.knobs.map((k) => (
                            <div key={k.label}>
                              <span>{k.label}</span>
                              <strong>{k.value}</strong>
                            </div>
                          ))}
                        </div>
                      )}

                      {node.params.steps && (
                        <div className="hayashi-step-chips">
                          {node.params.steps.map((on, i) => (
                            <span key={i} className={on ? 'on' : ''} />
                          ))}
                        </div>
                      )}

                      {node.params.bars && (
                        <div className="hayashi-output-bars">
                          <MiniWaveformColored seed={13} colorFrom="#ed922f" colorTo="#6a9bcc" count={24} height={32} />
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </div>
            </div>

            <div className="hayashi-workspace-bottom">
              {/* Sequencer with coherent track lines */}
              <section className="hayashi-mockup-panel hayashi-sequencer-panel">
                <div className="hayashi-panel-title-row">
                  <div>
                    <p className="hayashi-mini-label">Clip Sequencer</p>
                    <h2>Loop strip</h2>
                  </div>
                  <div className="hayashi-subpill">Yjs synced</div>
                </div>

                <div className="hayashi-sequencer-grid">
                  {sequence.map(({ label, steps }) => (
                    <div key={label} className="hayashi-sequencer-row">
                      <div className="hayashi-sequencer-label">{label}</div>
                      <div className="relative flex flex-1 items-center">
                        {/* Track rail */}
                        <div
                          className="absolute left-0 right-0 h-px"
                          style={{ background: 'rgba(16,38,29,0.08)' }}
                        />
                        <div className="hayashi-sequencer-steps relative">
                          {steps.map((active, index) => (
                            <span
                              key={`${label}-${index}`}
                              className={active ? 'active' : ''}
                              style={{
                                boxShadow: active
                                  ? '0 10px 20px rgba(237,146,47,0.18)'
                                  : 'none',
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="hayashi-mockup-panel hayashi-visual-panel">
                <div className="hayashi-panel-title-row">
                  <div>
                    <p className="hayashi-mini-label">Master Track</p>
                    <h2>Oak Grove Loop</h2>
                  </div>
                  <Sparkles size={16} />
                </div>
                <div className="hayashi-visual-orb hayashi-visual-waveform">
                  <WavePeaks />
                </div>
                <div className="hayashi-visual-ruler">
                  <span>0:00</span>
                  <span>0:08</span>
                  <span>0:16</span>
                  <span>0:24</span>
                  <span>0:31</span>
                </div>
              </section>
            </div>
          </section>

          {/* Right Sidebar */}
          <aside className="hayashi-workspace-right">
            <section className="hayashi-mockup-panel hayashi-presence-panel">
              <div className="hayashi-panel-title-row">
                <div>
                  <p className="hayashi-mini-label">Collaborators</p>
                  <h2>Room pulse</h2>
                </div>
                <div className="hayashi-rhythm-chip">
                  <Headphones size={13} />
                  Local render
                </div>
              </div>

              <div className="hayashi-presence-board">
                <div className="hayashi-presence-header">
                  <div className="hayashi-rhythm-chip">
                    <span className="hayashi-rhythm-dot" />
                    Room Pulse
                  </div>
                  <div className="hayashi-subpill">4 in grove</div>
                </div>
                <div className="hayashi-presence">
                  {collaborators.map((person) => (
                    <div key={person.initials} className="hayashi-presence-person">
                      <img
                        className={`hayashi-discord-avatar ${
                          person.tone === 'active'
                            ? 'active'
                            : person.tone === 'listening'
                              ? 'listening'
                              : ''
                        }`}
                        src={person.avatar}
                        alt={person.name}
                        width={40}
                        height={40}
                      />
                      <div>
                        <strong>{person.name}</strong>
                        <span>{person.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="hayashi-presence-footer">
                  <div className="hayashi-pill">4 shaping the loop</div>
                  <div className="hayashi-presence-signal">
                    <MiniWaveformColored seed={3} colorFrom="#6a9bcc" colorTo="#10261d" count={16} height={18} />
                  </div>
                  <div className="hayashi-subpill hayashi-subpill-dark">
                    <Headphones size={13} />
                    Everyone hears local render
                  </div>
                </div>
              </div>
            </section>

            <section className="hayashi-mockup-panel hayashi-inspector-panel">
              <div className="hayashi-panel-title-row">
                <div>
                  <p className="hayashi-mini-label">Focused Node</p>
                  <h2>Koto Grain</h2>
                </div>
                <div className="hayashi-status">
                  <span className="hayashi-status-dot" />
                  Live
                </div>
              </div>

              <div className="hayashi-inspector-block">
                <div className="hayashi-slider-head">
                  <label>Texture</label>
                  <strong>72%</strong>
                </div>
                <div className="hayashi-slider">
                  <span style={{ width: '72%' }} />
                </div>
              </div>

              <div className="hayashi-inspector-block">
                <div className="hayashi-slider-head">
                  <label>Decay</label>
                  <strong>54%</strong>
                </div>
                <div className="hayashi-slider">
                  <span style={{ width: '54%' }} />
                </div>
              </div>

              <div className="hayashi-inspector-block">
                <div className="hayashi-slider-head">
                  <label>Scatter</label>
                  <strong>31%</strong>
                </div>
                <div className="hayashi-slider">
                  <span style={{ width: '31%' }} />
                </div>
              </div>

            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}
