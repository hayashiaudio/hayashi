import {
  Drum,
  Flower2,
  Headphones,
  Layers3,
  Leaf,
  Play,
  Radio,
  Sparkles,
  Users,
  Waves,
} from 'lucide-react';

const palette = [
  {
    name: 'Ink Canopy',
    token: '--hayashi-ink',
    hex: '#10261d',
    use: 'Primary shell, dark panels, editorial headings',
  },
  {
    name: 'Paper Skin',
    token: '--hayashi-paper',
    hex: '#f7efd7',
    use: 'Base canvas, quiet cards, warm whitespace',
  },
  {
    name: 'Rope Ember',
    token: '--hayashi-ember',
    hex: '#ed922f',
    use: 'Calls to action, transport controls, cable emphasis',
  },
  {
    name: 'Leaf Tone',
    token: '--hayashi-leaf',
    hex: '#8fb13a',
    use: 'Status success, organic highlights, preset taxonomy',
  },
  {
    name: 'Mist Moss',
    token: '--hayashi-moss',
    hex: '#6f7b5d',
    use: 'Secondary surfaces, dividers, supporting copy',
  },
  {
    name: 'Signal Blue',
    token: '--hayashi-signal',
    hex: '#6a9bcc',
    use: 'Cool counterpoint for collaboration and network state',
  },
];

const principles = [
  {
    title: 'Instrument Before App',
    copy:
      'Every surface should feel tuned, touched, and resonant. Controls should read like instrument hardware, not generic SaaS widgets.',
    icon: Drum,
  },
  {
    title: 'Ritual Warmth',
    copy:
      'The logo suggests hand-laced craft, paper, lacquer, and living leaves. Use warmth and texture so the product feels human before it feels technical.',
    icon: Leaf,
  },
  {
    title: 'Shared Pulse',
    copy:
      'Collaboration cues should animate like tempo and breath: sequenced reveals, soft pulses, and visible handoff between players.',
    icon: Users,
  },
];

const components = [
  {
    title: 'Transport Bar',
    eyebrow: 'Primary Control',
    description:
      'The transport should feel like the lacquered rim of the drum: a carved top rail, centered motion control, and readable rhythmic telemetry instead of default DAW chrome.',
    preview: (
      <div className="hayashi-transport-shell">
        <div className="hayashi-transport-topline">
          <div className="hayashi-rhythm-chip">
            <span className="hayashi-rhythm-dot" />
            Live Room
          </div>
          <div className="hayashi-rhythm-readout">BAR 24 · 02:31</div>
        </div>
        <div className="hayashi-transport">
          <div className="hayashi-transport-cluster">
            <div className="hayashi-pill hayashi-pill-muted">128 BPM</div>
            <div className="hayashi-subpill">4/4 · D Minor</div>
          </div>
          <div className="hayashi-transport-center">
            <button className="hayashi-circle-button hayashi-circle-button-small" type="button">
              <span className="hayashi-skip-mark" />
            </button>
            <button className="hayashi-circle-button" type="button">
              <Play size={18} fill="currentColor" />
            </button>
            <button className="hayashi-circle-button hayashi-circle-button-small" type="button">
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
        <div className="hayashi-wave-shell">
          <div className="hayashi-wave-label">Master Pulse</div>
          <div className="hayashi-wave">
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>
      </div>
    ),
  },
  {
    title: 'Patch Node Card',
    eyebrow: 'Graph Language',
    description:
      'Nodes should feel built, not flat. Use port hardware, signal meters, and diagonal lacing cues so the graph reads as an instrument panel instead of a flowchart.',
    preview: (
      <div className="hayashi-node-scene">
        <div className="hayashi-node-handle hayashi-node-handle-top" />
        <div className="hayashi-node-handle hayashi-node-handle-right" />
        <div className="hayashi-node-handle hayashi-node-handle-bottom" />
        <div className="hayashi-node-handle hayashi-node-handle-left" />
        <div className="hayashi-node-lines" />
        <div className="hayashi-node-card">
          <div className="hayashi-node-top">
            <div>
              <p className="hayashi-mini-label">Sampler</p>
              <h4>Koto Grain</h4>
            </div>
            <div className="hayashi-status">
              <span className="hayashi-status-dot" />
              Live
            </div>
          </div>
          <div className="hayashi-node-meters">
            <div className="hayashi-meter-block">
              <label>Input</label>
              <div className="hayashi-meter">
                <span style={{ height: '68%' }} />
                <span style={{ height: '82%' }} />
                <span style={{ height: '58%' }} />
                <span style={{ height: '91%' }} />
                <span style={{ height: '74%' }} />
              </div>
            </div>
            <div className="hayashi-node-flower">
              <Leaf size={16} />
              Grain Bloom
            </div>
            <div className="hayashi-meter-block">
              <label>Send</label>
              <div className="hayashi-meter">
                <span style={{ height: '52%' }} />
                <span style={{ height: '71%' }} />
                <span style={{ height: '88%' }} />
                <span style={{ height: '63%' }} />
                <span style={{ height: '46%' }} />
              </div>
            </div>
          </div>
          <div className="hayashi-slider-group">
            <div>
              <div className="hayashi-slider-head">
                <label>Texture</label>
                <strong>72%</strong>
              </div>
              <div className="hayashi-slider">
                <span style={{ width: '72%' }} />
              </div>
            </div>
            <div>
              <div className="hayashi-slider-head">
                <label>Decay</label>
                <strong>54%</strong>
              </div>
              <div className="hayashi-slider">
                <span style={{ width: '54%' }} />
              </div>
            </div>
            <div>
              <div className="hayashi-slider-head">
                <label>Scatter</label>
                <strong>31%</strong>
              </div>
              <div className="hayashi-slider">
                <span style={{ width: '31%' }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
  },
  {
    title: 'Collaborator Presence Rail',
    eyebrow: 'Room Energy',
    description:
      'Presence should communicate role, energy, and listening state at a glance. The rail should feel communal and performative, more like a jam circle than a member list.',
    preview: (
      <div className="hayashi-presence-board">
        <div className="hayashi-presence-header">
          <div className="hayashi-rhythm-chip">
            <Radio size={13} />
            Room Pulse
          </div>
          <div className="hayashi-subpill">6 in grove</div>
        </div>
        <div className="hayashi-presence">
          <div className="hayashi-presence-person">
            <div className="hayashi-avatar active">JD</div>
            <div>
              <strong>JD</strong>
              <span>Driving transport</span>
            </div>
          </div>
          <div className="hayashi-presence-person">
            <div className="hayashi-avatar">MK</div>
            <div>
              <strong>MK</strong>
              <span>Patching bass bus</span>
            </div>
          </div>
          <div className="hayashi-presence-person">
            <div className="hayashi-avatar listening">AL</div>
            <div>
              <strong>AL</strong>
              <span>Listening on cue</span>
            </div>
          </div>
        </div>
        <div className="hayashi-presence-footer">
          <div className="hayashi-pill">3 shaping the loop</div>
          <div className="hayashi-presence-signal">
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="hayashi-subpill hayashi-subpill-dark">
            <Headphones size={13} />
            Everyone hears local render
          </div>
        </div>
      </div>
    ),
  },
  {
    title: 'Plan Card',
    eyebrow: 'Monetization',
    description:
      'Plans should feel like curated session formats, not abstract billing tables. Use hierarchy, a tactile recommendation frame, and dense but calm feature communication.',
    preview: (
      <div className="hayashi-plan-stack">
        <div className="hayashi-plan-card hayashi-plan-card-quiet">
          <p className="hayashi-mini-label">For solo sketching</p>
          <h4>Seed</h4>
          <p className="hayashi-plan-compact-price">$0</p>
        </div>
        <div className="hayashi-plan-card hayashi-plan-card-featured">
          <div className="hayashi-plan-badge">Recommended</div>
          <div className="hayashi-plan-head">
            <div>
              <h4>Forest Session</h4>
              <p>For shared rooms that want real momentum.</p>
            </div>
            <div className="hayashi-plan-sigil">
              <Drum size={18} />
            </div>
          </div>
          <p className="hayashi-price">$18<span>/month</span></p>
          <div className="hayashi-plan-stat-row">
            <div>
              <strong>8</strong>
              <span>live collaborators</span>
            </div>
            <div>
              <strong>24</strong>
              <span>saved scenes</span>
            </div>
            <div>
              <strong>∞</strong>
              <span>exports</span>
            </div>
          </div>
          <ul>
            <li>Expanded sample vault</li>
            <li>Export stems and scenes</li>
            <li>Session replay and collaboration history</li>
          </ul>
          <button className="hayashi-action" type="button">Start the session</button>
        </div>
      </div>
    ),
  },
];

export function BrandGuidelinesPage() {
  return (
    <main className="hayashi-brand-page">
      <section className="hayashi-hero">
        <div className="hayashi-hero-copy">
          <div className="hayashi-kicker">
            <Flower2 size={14} />
            Hayashi Brand Guidelines
          </div>
          <h1>
            A collaborative music lab with the feel of a hand-tuned instrument.
          </h1>
          <p>
            This direction uses the supplied drum mark as the system anchor. The
            product should feel ceremonial, social, and tactile: a warm paper
            workspace wrapped around live audio graphing, collaboration, and
            creative play.
          </p>

          <div className="hayashi-hero-actions">
            <button className="hayashi-action" type="button">Primary CTA</button>
            <button className="hayashi-secondary-action" type="button">Secondary CTA</button>
          </div>

          <div className="hayashi-principles">
            {principles.map(({ title, copy, icon: Icon }) => (
              <article key={title} className="hayashi-principle-card">
                <div className="hayashi-principle-icon">
                  <Icon size={18} />
                </div>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="hayashi-hero-mark">
          <div className="hayashi-mark-frame">
            <div className="hayashi-orbit hayashi-orbit-a" />
            <div className="hayashi-orbit hayashi-orbit-b" />
            <img src="/hayashi-logo.png" alt="Hayashi drum logo" />
          </div>
          <div className="hayashi-caption-card">
            <p className="hayashi-mini-label">Logo Interpretation</p>
            <p>
              Hourglass drum geometry, rope diagonals, floral centerline, and
              leaf motifs imply rhythm, craft, and growth. UI should echo those
              same diagonals, rounded rims, and botanical accents.
            </p>
          </div>
        </div>
      </section>

      <section className="hayashi-grid-section">
        <article className="hayashi-panel">
          <div className="hayashi-section-heading">
            <Sparkles size={16} />
            <div>
              <p className="hayashi-mini-label">Color System</p>
              <h2>Logo-derived palette with Anthropic-style restraint</h2>
            </div>
          </div>
          <div className="hayashi-palette-grid">
            {palette.map((swatch) => (
              <div key={swatch.name} className="hayashi-swatch-card">
                <div
                  className="hayashi-swatch"
                  style={{ backgroundColor: swatch.hex }}
                />
                <div>
                  <h3>{swatch.name}</h3>
                  <p>{swatch.hex}</p>
                  <code>{swatch.token}</code>
                </div>
                <span>{swatch.use}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="hayashi-panel">
          <div className="hayashi-section-heading">
            <Layers3 size={16} />
            <div>
              <p className="hayashi-mini-label">Typography</p>
              <h2>Use contrast between crafted display and readable editorial body</h2>
            </div>
          </div>
          <div className="hayashi-type-grid">
            <div className="hayashi-type-sample">
              <p className="hayashi-mini-label">Display / Poppins</p>
              <h3>Hayashi turns looping into a social ritual.</h3>
            </div>
            <div className="hayashi-type-sample">
              <p className="hayashi-mini-label">Body / Lora</p>
              <p>
                Favor sentence case, roomy line lengths, and a warm editorial
                cadence. The interface should sound composed rather than
                hyper-technical.
              </p>
            </div>
            <div className="hayashi-type-sample">
              <p className="hayashi-mini-label">Utility / IBM Plex Mono</p>
              <p className="hayashi-mono">
                BPM 128 / ROOM discord:oak-grove / EXPORT wav-stems
              </p>
            </div>
          </div>
        </article>
      </section>

      <section className="hayashi-panel hayashi-panel-wide">
        <div className="hayashi-section-heading">
          <Waves size={16} />
          <div>
            <p className="hayashi-mini-label">Component Examples</p>
            <h2>Key UI primitives translated from the drum mark</h2>
          </div>
        </div>
        <div className="hayashi-component-grid">
          {components.map((component) => (
            <article key={component.title} className="hayashi-component-card">
              <div className="hayashi-component-copy">
                <p className="hayashi-mini-label">{component.eyebrow}</p>
                <h3>{component.title}</h3>
                <p>{component.description}</p>
              </div>
              <div className="hayashi-component-preview">{component.preview}</div>
            </article>
          ))}
        </div>
      </section>

      <section className="hayashi-grid-section hayashi-bottom-grid">
        <article className="hayashi-panel">
          <div className="hayashi-section-heading">
            <Leaf size={16} />
            <div>
              <p className="hayashi-mini-label">Interaction Cues</p>
              <h2>Motion and detail language</h2>
            </div>
          </div>
          <ul className="hayashi-note-list">
            <li>Use slow bloom reveals and sequenced fade-ups instead of abrupt dashboard pop-ins.</li>
            <li>Let active collaborators pulse softly in ember or signal blue, never with harsh neon glows.</li>
            <li>Use diagonal cable motifs sparingly on cards, rails, and dividers to echo the rope lacing.</li>
            <li>Reserve fully dark surfaces for immersive creation modes like the patch canvas or performance view.</li>
          </ul>
        </article>

        <article className="hayashi-panel">
          <div className="hayashi-section-heading">
            <Users size={16} />
            <div>
              <p className="hayashi-mini-label">Voice and Product Framing</p>
              <h2>How the brand should speak</h2>
            </div>
          </div>
          <ul className="hayashi-note-list">
            <li>Describe sessions as rooms, circles, drops, stems, and scenes rather than workspaces and tasks.</li>
            <li>Keep copy social and invitational: make together, pass the rhythm, shape the room, catch the loop.</li>
            <li>Avoid hard-edged “pro audio workstation” language on first contact. Sell warmth and immediacy before depth.</li>
            <li>When showing plans, emphasize capacity and energy of the room rather than feature count alone.</li>
          </ul>
        </article>
      </section>
    </main>
  );
}
