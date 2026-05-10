import {
  Clock3,
  Disc3,
  Drum,
  Flag,
  GripVertical,
  Headphones,
  Mic2,
  Music2,
  Play,
  Radio,
  Sparkles,
  Trophy,
  Upload,
  Waves,
  Zap,
} from 'lucide-react';

const teams = [
  {
    name: 'Team Moss',
    status: 'On deck',
    players: ['JD', 'Mika', 'Ari'],
    accent: '#8fb13a',
    score: 142,
    mood: 'found-sound / shimmer / low-end pulse',
  },
  {
    name: 'Team Ember',
    status: 'Taking turn',
    players: ['Sora', 'Vale', 'Niko'],
    accent: '#ed922f',
    score: 176,
    mood: 'snare grit / vocal chops / bloom wash',
  },
];

const turnMoves = [
  { label: 'Add sample', detail: 'Drop any audio or found sound into a lane.', icon: Upload },
  { label: 'Effect card', detail: 'Apply one room-scale transformation.', icon: Sparkles },
  { label: 'Resample moment', detail: 'Capture the bus and commit a new phrase.', icon: Mic2 },
  { label: 'Scene switch', detail: 'Replace the next section with a new feel.', icon: Flag },
];

const samples = [
  { name: 'cedar-rim.wav', meta: '04.2s · room hit', color: '#8fb13a' },
  { name: 'night-bird-loop.wav', meta: '08.0s · field texture', color: '#6a9bcc' },
  { name: 'paper-shaker-03.wav', meta: '01.4s · transient', color: '#ed922f' },
  { name: 'crowd-breath-aif', meta: '05.1s · vocal layer', color: '#d97757' },
];

const laneCards = [
  { title: 'Sample Lane', subtitle: 'Rain Bell chopped into 1/8ths', accent: '#8fb13a', icon: Music2 },
  { title: 'Drum Lane', subtitle: 'Moss Kick + Wire Snare stack', accent: '#ed922f', icon: Drum },
  { title: 'Atmos Lane', subtitle: 'Night Air stretched through bloom', accent: '#6a9bcc', icon: Waves },
];

const audience = [
  { name: 'lina', claps: 18, color: '#8fb13a' },
  { name: 'koji', claps: 26, color: '#ed922f' },
  { name: 'tamsin', claps: 14, color: '#6a9bcc' },
  { name: 'matt', claps: 22, color: '#d97757' },
];

const presence = [
  {
    avatar: 'https://cdn.discordapp.com/embed/avatars/0.png',
    name: 'Local Dev',
    status: 'Locking Team Ember move',
    role: 'Turn captain',
    accent: '#ed922f',
  },
  {
    avatar: 'https://cdn.discordapp.com/embed/avatars/1.png',
    name: 'Mika',
    status: 'Previewing sample timing',
    role: 'Texture lane',
    accent: '#8fb13a',
  },
  {
    avatar: 'https://cdn.discordapp.com/embed/avatars/2.png',
    name: 'Ari',
    status: 'Listening for final clap window',
    role: 'Audience read',
    accent: '#6a9bcc',
  },
  {
    avatar: 'https://cdn.discordapp.com/embed/avatars/3.png',
    name: 'Sora',
    status: 'Holding scene transition',
    role: 'Round memory',
    accent: '#d97757',
  },
];

const history = [
  { round: 'Round 1', move: 'Team Moss added cedar rim and stretched it wide.' },
  { round: 'Round 2', move: 'Team Ember dropped a snare wash and filtered the bus.' },
  { round: 'Round 3', move: 'Team Moss resampled the groove into a ghost pad.' },
];

function ClapMeter({ value, color }: { value: number; color: string }) {
  const bars = Array.from({ length: 12 }, (_, index) => index < Math.round(value / 3));
  return (
    <div style={{ display: 'flex', alignItems: 'end', gap: 4, height: 34 }}>
      {bars.map((on, index) => (
        <span
          key={index}
          style={{
            width: 7,
            height: `${30 + ((index % 4) * 16)}%`,
            borderRadius: 999,
            background: on ? `linear-gradient(180deg, ${color}, rgba(16,38,29,0.94))` : 'rgba(16,38,29,0.08)',
            boxShadow: on ? `0 0 14px ${color}4d` : 'none',
            transition: 'all 180ms ease',
          }}
        />
      ))}
    </div>
  );
}

function SampleWave({ color }: { color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 34 }}>
      {Array.from({ length: 28 }, (_, index) => {
        const height = 18 + Math.abs(Math.sin(index * 1.27)) * 16;
        return (
          <span
            key={index}
            style={{
              flex: 1,
              minWidth: 1,
              height,
              borderRadius: 999,
              background: `linear-gradient(180deg, ${color}, #6f7b5d)`,
            }}
          />
        );
      })}
    </div>
  );
}

export function PerformanceWorkspaceMockupPage() {
  return (
    <main className="hayashi-mockup-page">
      <section className="hayashi-mockup-frame">
        <header className="hayashi-workspace-topbar">
          <div className="hayashi-topbar-brand">
            <div className="hayashi-mark-chip">
              <img src="/hayashi-logo.png" alt="Hayashi" />
            </div>
            <div>
              <p className="hayashi-mini-label">Discord Activity Room</p>
              <h1>Clapback Session</h1>
            </div>
          </div>

          <div className="hayashi-topbar-center">
            <div className="hayashi-rhythm-chip">
              <span className="hayashi-live-pulse" />
              Turn 4 of 5
            </div>
            <div className="hayashi-room-code">teams / audience / exportable final songs</div>
            <div className="hayashi-subpill">Theme: “make rain feel expensive”</div>
          </div>

          <div className="hayashi-topbar-actions">
            <button className="hayashi-quiet-button" type="button">
              <Radio size={14} />
              Spectators live
            </button>
            <button className="hayashi-action" type="button">
              <Play size={14} />
              Final playback queue
            </button>
          </div>
        </header>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '280px minmax(0, 1fr) 330px',
            gap: 18,
            paddingTop: 20,
          }}
        >
          <aside style={{ display: 'grid', gap: 18, minWidth: 0 }}>
            <section className="hayashi-mockup-panel hayashi-drawer-panel" style={{ display: 'grid', gap: 12 }}>
              <div className="hayashi-panel-title-row">
                <div>
                  <p className="hayashi-mini-label">Sample Crate</p>
                  <h2>Bring anything in</h2>
                </div>
                <div className="hayashi-rhythm-chip">
                  <Upload size={13} />
                  uploads open
                </div>
              </div>

              {samples.map((sample) => (
                <div key={sample.name} className="hayashi-sample-card" style={{ background: 'rgba(255,255,255,0.54)' }}>
                  <div className="hayashi-sample-wave">
                    <SampleWave color={sample.color} />
                  </div>
                  <div className="hayashi-sample-meta">
                    <div>
                      <strong>{sample.name}</strong>
                      <span>{sample.meta}</span>
                    </div>
                    <GripVertical size={14} className="hayashi-sample-drag" />
                  </div>
                </div>
              ))}

              <div
                style={{
                  padding: 14,
                  borderRadius: 28,
                  border: '1px dashed rgba(16,38,29,0.16)',
                  background: 'rgba(16,38,29,0.03)',
                  fontSize: '0.84rem',
                  color: 'rgba(16,38,29,0.72)',
                }}
              >
                Any media is fair play: samples, vocals, found sound, stems, plugins, weird artifacts.
              </div>
            </section>

            <section className="hayashi-mockup-panel" style={{ display: 'grid', gap: 12 }}>
              <div className="hayashi-panel-title-row">
                <div>
                  <p className="hayashi-mini-label">Round History</p>
                  <h2>Readable moves</h2>
                </div>
              </div>

              {history.map((item) => (
                <div
                  key={item.round}
                  style={{
                    display: 'grid',
                    gap: 6,
                    padding: 14,
                    borderRadius: 22,
                    background: 'rgba(16,38,29,0.04)',
                  }}
                >
                  <span className="hayashi-mini-label">{item.round}</span>
                  <p style={{ margin: 0, fontSize: '0.86rem', color: 'rgba(16,38,29,0.76)' }}>{item.move}</p>
                </div>
              ))}
            </section>
          </aside>

          <section style={{ display: 'grid', gap: 18, minWidth: 0 }}>
            <section
              className="hayashi-mockup-panel"
              style={{
                padding: 24,
                background:
                  'radial-gradient(circle at top left, rgba(237,146,47,0.16), transparent 24%), radial-gradient(circle at 75% 18%, rgba(106,155,204,0.12), transparent 22%), linear-gradient(180deg, rgba(252,249,239,0.95), rgba(247,244,235,0.88))',
              }}
            >
              <div className="hayashi-panel-title-row" style={{ alignItems: 'start' }}>
                <div>
                  <p className="hayashi-mini-label">Turn Board</p>
                  <h2>One move. One minute. Make the room cheer.</h2>
                </div>
                <div
                  style={{
                    display: 'grid',
                    gap: 8,
                    minWidth: 210,
                    padding: 14,
                    borderRadius: 28,
                    background: '#10261d',
                    color: '#faf9f5',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="hayashi-mini-label" style={{ color: 'rgba(247,239,215,0.58)' }}>Clock</span>
                    <Clock3 size={14} />
                  </div>
                  <strong style={{ fontFamily: 'Poppins, Arial, sans-serif', fontSize: '1.4rem', lineHeight: 1 }}>00:43</strong>
                  <span style={{ fontSize: '0.8rem', color: 'rgba(247,239,215,0.78)' }}>Team Ember is committing their turn.</span>
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.2fr 0.8fr',
                  gap: 18,
                }}
              >
                <div style={{ display: 'grid', gap: 14 }}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                      gap: 14,
                    }}
                  >
                    {teams.map((team) => (
                      <div
                        key={team.name}
                        style={{
                          display: 'grid',
                          gap: 10,
                          padding: 16,
                          borderRadius: 28,
                          background: 'rgba(255,255,255,0.54)',
                          border: '1px solid rgba(16,38,29,0.08)',
                          boxShadow: `inset 4px 0 0 ${team.accent}`,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12 }}>
                          <div>
                            <strong style={{ display: 'block', fontFamily: 'Poppins, Arial, sans-serif', fontSize: '1rem' }}>{team.name}</strong>
                            <span style={{ fontSize: '0.82rem', color: 'rgba(16,38,29,0.62)' }}>{team.players.join(' · ')}</span>
                          </div>
                          <span className="hayashi-subpill">{team.status}</span>
                        </div>
                        <p style={{ margin: 0, fontSize: '0.84rem', color: 'rgba(16,38,29,0.76)' }}>{team.mood}</p>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span className="hayashi-mini-label">clap score</span>
                          <strong style={{ fontFamily: 'Poppins, Arial, sans-serif' }}>{team.score}</strong>
                        </div>
                        <ClapMeter value={team.score / 8} color={team.accent} />
                      </div>
                    ))}
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gap: 12,
                      padding: 16,
                      borderRadius: 28,
                      background: 'rgba(16,38,29,0.04)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <p className="hayashi-mini-label">Now Building</p>
                        <h3 style={{ margin: 0, fontFamily: 'Poppins, Arial, sans-serif', fontSize: '1.05rem' }}>Team Ember final turn</h3>
                      </div>
                      <div className="hayashi-rhythm-chip">
                        <Zap size={13} />
                        pressure round
                      </div>
                    </div>

                    {laneCards.map((lane) => (
                      <div
                        key={lane.title}
                        style={{
                          display: 'grid',
                          gap: 8,
                          padding: 14,
                          borderRadius: 28,
                          background: 'rgba(255,255,255,0.58)',
                          boxShadow: `inset 3px 0 0 ${lane.accent}`,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div
                            style={{
                              display: 'grid',
                              placeItems: 'center',
                              width: 30,
                              height: 30,
                              borderRadius: 16,
                              background: `${lane.accent}22`,
                              color: '#10261d',
                              flexShrink: 0,
                            }}
                          >
                            <lane.icon size={15} />
                          </div>
                          <div>
                            <strong style={{ display: 'block', fontFamily: 'Poppins, Arial, sans-serif' }}>{lane.title}</strong>
                            <span style={{ fontSize: '0.82rem', color: 'rgba(16,38,29,0.62)' }}>{lane.subtitle}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'grid', gap: 14 }}>
                  <div
                    style={{
                      display: 'grid',
                      gap: 10,
                      padding: 16,
                      borderRadius: 28,
                      background: '#10261d',
                      color: '#faf9f5',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <p className="hayashi-mini-label" style={{ color: 'rgba(247,239,215,0.58)' }}>Allowed Move</p>
                        <h3 style={{ margin: 0, fontFamily: 'Poppins, Arial, sans-serif', fontSize: '1.02rem' }}>Choose one card</h3>
                      </div>
                      <Disc3 size={15} />
                    </div>

                    {turnMoves.map((move) => (
                      <button
                        key={move.label}
                        type="button"
                        style={{
                          display: 'grid',
                          gap: 6,
                          padding: 14,
                          borderRadius: 22,
                          background: 'rgba(247,239,215,0.08)',
                          textAlign: 'left',
                          border: '1px solid rgba(247,239,215,0.08)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <move.icon size={15} />
                          <strong style={{ fontFamily: 'Poppins, Arial, sans-serif', fontSize: '0.92rem' }}>{move.label}</strong>
                        </div>
                        <span style={{ fontSize: '0.8rem', color: 'rgba(247,239,215,0.72)' }}>{move.detail}</span>
                      </button>
                    ))}
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gap: 10,
                      padding: 16,
                      borderRadius: 28,
                      background: 'rgba(255,255,255,0.58)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <p className="hayashi-mini-label">Winning Condition</p>
                        <h3 style={{ margin: 0, fontFamily: 'Poppins, Arial, sans-serif', fontSize: '1rem' }}>Claps on final playback</h3>
                      </div>
                      <Trophy size={15} />
                    </div>
                    <p style={{ margin: 0, fontSize: '0.82rem', color: 'rgba(16,38,29,0.72)' }}>
                      The crowd decides it. Unique clappers, total clap intensity, and how long they stay through the final listen all count.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section
              className="hayashi-mockup-panel"
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1.1fr) minmax(280px, 0.9fr)',
                gap: 16,
                padding: 18,
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gap: 10,
                  padding: 16,
                  borderRadius: 28,
                  background: 'rgba(16,38,29,0.04)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p className="hayashi-mini-label">Export Artifact</p>
                    <h3 style={{ margin: 0, fontFamily: 'Poppins, Arial, sans-serif', fontSize: '1rem' }}>What survives after the room ends</h3>
                  </div>
                  <Waves size={15} />
                </div>
                <p style={{ margin: 0, fontSize: '0.84rem', color: 'rgba(16,38,29,0.74)' }}>
                  Each team exports a finished song, turn history, source crate, and winning clap graph. The music matters, but so does the story of how it got made.
                </p>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: 16,
                  borderRadius: 28,
                  background: 'linear-gradient(90deg, rgba(143,177,58,0.18), rgba(237,146,47,0.14), rgba(106,155,204,0.14))',
                }}
              >
                <div>
                  <p className="hayashi-mini-label">Audience ready</p>
                  <strong style={{ display: 'block', fontFamily: 'Poppins, Arial, sans-serif', fontSize: '1rem' }}>22 spectators waiting to clap</strong>
                </div>
                <button className="hayashi-action" type="button">
                  <Headphones size={14} />
                  Play finals
                </button>
              </div>
            </section>
          </section>

          <aside style={{ display: 'grid', gap: 18, minWidth: 0 }}>
            <section className="hayashi-mockup-panel hayashi-presence-panel">
              <div className="hayashi-panel-title-row">
                <div>
                  <p className="hayashi-mini-label">Discord Presence</p>
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
                    <Radio size={13} />
                    6 in teams
                  </div>
                  <div className="hayashi-subpill">22 watching</div>
                </div>
                <div className="hayashi-presence" style={{ maxHeight: 260 }}>
                  {presence.map((person) => (
                    <div key={person.name} className="hayashi-presence-person">
                      <img
                        className="hayashi-discord-avatar"
                        src={person.avatar}
                        alt={person.name}
                        width={32}
                        height={32}
                        style={{ boxShadow: `0 0 0 3px ${person.accent}26` }}
                      />
                      <div>
                        <strong>{person.name}</strong>
                        <span>{person.status}</span>
                        <span style={{ color: 'rgba(16,38,29,0.48)', fontSize: '0.72rem' }}>{person.role}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="hayashi-presence-footer">
                  <div className="hayashi-pill">everyone hears the same final pass</div>
                </div>
              </div>
            </section>

            <section className="hayashi-mockup-panel" style={{ display: 'grid', gap: 12 }}>
              <div className="hayashi-panel-title-row">
                <div>
                  <p className="hayashi-mini-label">Clap Meter</p>
                  <h2>Audience weight</h2>
                </div>
              </div>

              {audience.map((person) => (
                <div
                  key={person.name}
                  style={{
                    display: 'grid',
                    gap: 8,
                    padding: 14,
                    borderRadius: 28,
                    background: 'rgba(16,38,29,0.04)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontFamily: 'Poppins, Arial, sans-serif' }}>{person.name}</strong>
                    <span className="hayashi-subpill">{person.claps} claps</span>
                  </div>
                  <ClapMeter value={person.claps} color={person.color} />
                </div>
              ))}
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}
