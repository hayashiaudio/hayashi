import { useEffect, useState } from 'react';
import {
  Users,
  AudioWaveform,
  ArrowRight,
  MessageCircle,
  Download,
  Music,
  FileMusic,
  Zap,
  Headphones,
  Radio,
} from 'lucide-react';

/* ─── CSS animations ─── */
const marketingStyles = `
@keyframes float-leaf {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  33% { transform: translateY(-14px) rotate(3deg); }
  66% { transform: translateY(8px) rotate(-2deg); }
}
@keyframes drift-slow {
  0%, 100% { transform: translate(0, 0) rotate(0deg); }
  50% { transform: translate(10px, -12px) rotate(2deg); }
}
@keyframes fade-up {
  from { opacity: 0; transform: translateY(30px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes pulse-glow {
  0%, 100% { filter: drop-shadow(0 0 20px rgba(255,140,97,0.12)); }
  50% { filter: drop-shadow(0 0 40px rgba(255,140,97,0.30)); }
}
@keyframes dot-breathe {
  0%, 100% { opacity: 0.25; }
  50% { opacity: 0.6; }
}
@keyframes spin-slow {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.hayashi-reveal {
  animation: fade-up 0.9s cubic-bezier(0.22, 1, 0.36, 1) forwards;
  opacity: 0;
}
.hayashi-reveal-d1 { animation-delay: 0.1s; }
.hayashi-reveal-d2 { animation-delay: 0.25s; }
.hayashi-reveal-d3 { animation-delay: 0.4s; }
.hayashi-reveal-d4 { animation-delay: 0.55s; }
.hayashi-reveal-d5 { animation-delay: 0.7s; }
.hayashi-reveal-d6 { animation-delay: 0.9s; }
`;

const THEME = {
  cream: '#faf8f5',
  creamDark: '#f0eeeb',
  void: '#0f0f1a',
  voidLight: '#1a1a2e',
  coral: '#ff8c61',
  coralDark: '#e87a52',
  violet: '#7b61ff',
  sage: '#8fbc8f',
  stone: '#6b6b7b',
  muted: '#4a4a5a',
  blush: '#ffe8e0',
  sky: '#e0f0ff',
};

function OrganicBlob({ className, fill }: { className?: string; fill?: string }) {
  return (
    <svg viewBox="0 0 200 200" className={className} style={{ position: 'absolute' }}>
      <path
        fill={fill ?? THEME.coral}
        d="M44.7,-76.4C58.9,-69.2,71.8,-59.1,81.6,-46.6C91.4,-34.1,98.1,-19.2,95.8,-4.9C93.5,9.3,82.2,22.9,71.1,34.3C60,45.7,49.1,54.9,37.4,62.3C25.7,69.7,13.2,75.3,0.1,75.1C-13,74.9,-25.9,68.9,-37.6,61.2C-49.3,53.5,-59.8,44.1,-68.3,32.6C-76.8,21.1,-83.3,7.5,-81.8,-5.4C-80.3,-18.3,-70.8,-30.5,-60.2,-40.1C-49.6,-49.7,-37.9,-56.7,-25.8,-65.4C-13.7,-74.1,-1.2,-84.5,10.5,-84.2C22.2,-83.9,30.5,-83.6,44.7,-76.4Z"
        transform="translate(100 100)"
        opacity={0.12}
      />
    </svg>
  );
}

function WaveformDecoration() {
  const heights = [14, 28, 10, 38, 20, 46, 24, 34, 12, 40, 18, 32, 10, 44, 16];
  return (
    <div className="flex items-end gap-[3px] h-16">
      {heights.map((h, i) => (
        <div
          key={i}
          className="w-[3px] rounded-full"
          style={{
            height: `${h}%`,
            background: THEME.coral,
            opacity: 0.15 + (i % 3) * 0.1,
            animation: `dot-breathe ${2 + (i % 3) * 0.5}s ease-in-out infinite ${i * 0.1}s`,
          }}
        />
      ))}
    </div>
  );
}

function NoteCluster({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} fill="none">
      <circle cx="20" cy="30" r="8" fill={THEME.coral} opacity={0.2} />
      <rect x="45" y="20" width="12" height="12" rx="3" fill={THEME.violet} opacity={0.15} />
      <circle cx="90" cy="40" r="10" fill={THEME.sage} opacity={0.15} />
      <rect x="25" y="65" width="10" height="10" rx="2" fill={THEME.violet} opacity={0.12} transform="rotate(15 30 70)" />
      <circle cx="75" cy="80" r="14" fill={THEME.coral} opacity={0.1} />
      <rect x="55" y="55" width="8" height="8" rx="2" fill={THEME.sage} opacity={0.18} transform="rotate(-10 59 59)" />
    </svg>
  );
}

export function MarketingPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleAddToDiscord = () => {
    const discordOAuth = `https://discord.com/oauth2/authorize?client_id=${import.meta.env.VITE_DISCORD_CLIENT_ID ?? '1502419256946724966'}&scope=applications.commands`;
    window.open(discordOAuth, '_blank');
  };

  const features = [
    {
      icon: <Users size={22} />,
      title: 'Collaborate in real time',
      description:
        'Jam together in a Discord voice channel. Every loop, pattern, and arrangement change syncs instantly.',
      color: THEME.violet,
    },
    {
      icon: <AudioWaveform size={22} />,
      title: 'Handpicked sounds',
      description:
        'Curated samples, drum kits, and synth patches designed for quick ideation — no sample hunting.',
      color: THEME.coral,
    },
    {
      icon: <Zap size={22} />,
      title: 'Social rituals',
      description:
        'Beat battles, listening sessions, and collaborative albums. Your server becomes the studio lounge.',
      color: THEME.sage,
    },
    {
      icon: <Download size={22} />,
      title: 'Export to your DAW',
      description:
        'Bounce stems, MIDI, and project data. Open in Ableton, Logic, FL Studio, or any serious tool.',
      color: THEME.void,
    },
  ];

  const exportFormats = [
    { name: 'WAV Stems', status: 'Ready', icon: <Music size={16} /> },
    { name: 'MIDI File', status: 'Soon', icon: <FileMusic size={16} /> },
    { name: 'Ableton Live', status: 'Soon', icon: <ArrowRight size={16} /> },
    { name: 'REAPER', status: 'Soon', icon: <ArrowRight size={16} /> },
    { name: 'Project JSON', status: 'Ready', icon: <Download size={16} /> },
  ];

  return (
    <>
      <style>{marketingStyles}</style>

      {/* ═══ HERO ═══ */}
      <div
        className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden px-6 py-20 lg:py-0"
        style={{
          background: THEME.cream,
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        {/* ambient orbs */}
        <div
          className="absolute top-0 left-0 w-[700px] h-[700px] rounded-full pointer-events-none"
          style={{
            background: `radial-gradient(circle, ${THEME.blush}40 0%, transparent 65%)`,
            filter: 'blur(80px)',
            transform: 'translate(-40%, -40%)',
          }}
        />
        <div
          className="absolute bottom-0 right-0 w-[600px] h-[600px] rounded-full pointer-events-none"
          style={{
            background: `radial-gradient(circle, ${THEME.sky}50 0%, transparent 65%)`,
            filter: 'blur(80px)',
            transform: 'translate(30%, 30%)',
          }}
        />
        <div
          className="absolute top-1/3 right-[15%] w-[300px] h-[300px] rounded-full pointer-events-none"
          style={{
            background: `radial-gradient(circle, ${THEME.coral}15 0%, transparent 70%)`,
            filter: 'blur(60px)',
          }}
        />

        {/* floating blobs */}
        <OrganicBlob
          className="w-[400px] h-[400px] -top-10 -right-20 opacity-50 pointer-events-none"
          fill={THEME.coral}
        />
        <OrganicBlob
          className="w-[300px] h-[300px] bottom-20 left-10 opacity-40 pointer-events-none"
          fill={THEME.violet}
        />

        {/* floating decorative shapes */}
        <div
          className="absolute top-[18%] left-[12%] w-10 h-10 rounded-xl opacity-20 pointer-events-none"
          style={{
            background: THEME.coral,
            animation: 'drift-slow 9s ease-in-out infinite',
          }}
        />
        <div
          className="absolute bottom-[22%] right-[18%] w-8 h-8 rounded-full opacity-15 pointer-events-none"
          style={{
            background: THEME.violet,
            animation: 'drift-slow 11s ease-in-out infinite 2s',
          }}
        />
        <div
          className="absolute top-[35%] right-[25%] w-6 h-6 rounded-lg opacity-15 pointer-events-none"
          style={{
            background: THEME.sage,
            animation: 'float-leaf 7s ease-in-out infinite 1s',
            transform: 'rotate(20deg)',
          }}
        />

        {/* waveform side decoration */}
        <div className="absolute right-8 top-1/2 -translate-y-1/2 opacity-30 pointer-events-none hidden xl:block">
          <WaveformDecoration />
        </div>

        {/* hero content */}
        <div className="relative z-10 max-w-4xl mx-auto text-center">
          {/* nav pills */}
          <div
            className={`hayashi-reveal hayashi-reveal-d1 inline-flex items-center gap-2 mb-10 ${mounted ? '' : 'opacity-0'}`}
          >
            {['Sketch', 'Share', 'Finish'].map((word, i) => (
              <span key={word}>
                {i > 0 && (
                  <span className="mx-1.5" style={{ color: THEME.stone, opacity: 0.4 }}>&bull;</span>
                )}
                <span
                  className="px-3.5 py-1.5 rounded-full text-[11px] font-bold tracking-[0.15em] uppercase"
                  style={{
                    background: THEME.creamDark,
                    color: THEME.void,
                  }}
                >
                  {word}
                </span>
              </span>
            ))}
          </div>

          {/* main headline */}
          <h1
            className={`hayashi-reveal hayashi-reveal-d2 mb-6 ${mounted ? '' : 'opacity-0'}`}
            style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: 'clamp(3rem, 7vw, 6.5rem)',
              fontWeight: 700,
              letterSpacing: '-0.03em',
              lineHeight: 1.05,
              color: THEME.void,
            }}
          >
            Sketch in Discord.
            <br />
            <em
              style={{
                fontStyle: 'italic',
                color: THEME.coral,
                fontWeight: 500,
              }}
            >
              Finish in your DAW.
            </em>
          </h1>

          {/* subheadline */}
          <p
            className={`hayashi-reveal hayashi-reveal-d3 max-w-xl mx-auto mb-10 leading-relaxed ${mounted ? '' : 'opacity-0'}`}
            style={{
              fontSize: 'clamp(1rem, 1.4vw, 1.25rem)',
              color: THEME.stone,
              lineHeight: 1.7,
            }}
          >
            Hayashi is the collaborative sketchpad for music makers. Start ideas
            together in a Discord voice channel, then export stems and MIDI to
            Ableton, Logic, or any DAW.
          </p>

          {/* CTA */}
          <div className={`hayashi-reveal hayashi-reveal-d4 ${mounted ? '' : 'opacity-0'}`}>
            <button
              onClick={handleAddToDiscord}
              className="group inline-flex items-center gap-3 px-8 py-4 rounded-xl text-sm font-semibold transition-all duration-300 hover:scale-[1.03] active:scale-[0.98]"
              style={{
                background: THEME.coral,
                color: '#ffffff',
                boxShadow: '0 8px 32px rgba(255,140,97,0.35)',
              }}
            >
              <MessageCircle size={18} />
              Add Hayashi to your server
              <ArrowRight
                size={16}
                className="transition-transform duration-300 group-hover:translate-x-1"
              />
            </button>
          </div>

          {/* social proof / trust bar */}
          <div
            className={`hayashi-reveal hayashi-reveal-d5 mt-16 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 ${mounted ? '' : 'opacity-0'}`}
            style={{ color: THEME.stone, opacity: 0.6, fontSize: '0.8rem', fontWeight: 500 }}
          >
            <span className="flex items-center gap-1.5">
              <Headphones size={14} /> Discord Native
            </span>
            <span className="flex items-center gap-1.5">
              <Radio size={14} /> Real-time Sync
            </span>
            <span className="flex items-center gap-1.5">
              <Zap size={14} /> Zero Setup
            </span>
          </div>
        </div>
      </div>

      {/* ═══ FEATURES GRID ═══ */}
      <div
        className="relative px-8 py-24 lg:px-16 xl:px-24"
        style={{ background: THEME.void }}
      >
        <div
          className="absolute -top-px left-0 right-0 h-20 pointer-events-none"
          style={{
            background: `linear-gradient(to bottom, ${THEME.cream}, transparent)`,
          }}
        />

        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2
              className="mb-3"
              style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: 'clamp(1.8rem, 3.5vw, 2.8rem)',
                fontWeight: 600,
                color: THEME.cream,
                letterSpacing: '-0.02em',
              }}
            >
              Everything you need to start an idea
            </h2>
            <p
              style={{
                fontSize: '1.05rem',
                color: 'rgba(250,248,245,0.5)',
                maxWidth: 520,
                margin: '0 auto',
                lineHeight: 1.6,
              }}
            >
              Built for the messy, joyful, collaborative part of music making
              that DAWs were never designed for.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((f, i) => (
              <div
                key={f.title}
                className="group relative p-7 rounded-2xl transition-all duration-500 hover:-translate-y-2"
                style={{
                  background: 'rgba(250,248,245,0.04)',
                  border: '1px solid rgba(250,248,245,0.08)',
                  animation: mounted
                    ? `fade-up 0.8s ${0.8 + i * 0.12}s cubic-bezier(0.22, 1, 0.36, 1) forwards`
                    : undefined,
                  opacity: mounted ? undefined : 0,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(250,248,245,0.08)';
                  e.currentTarget.style.borderColor = 'rgba(250,248,245,0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(250,248,245,0.04)';
                  e.currentTarget.style.borderColor = 'rgba(250,248,245,0.08)';
                }}
              >
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center mb-5 transition-transform duration-500 group-hover:scale-110"
                  style={{ background: `${f.color}20`, color: f.color }}
                >
                  {f.icon}
                </div>
                <h3
                  className="mb-2 text-base font-semibold"
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    color: THEME.cream,
                  }}
                >
                  {f.title}
                </h3>
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: 'rgba(250,248,245,0.5)' }}
                >
                  {f.description}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div
          className="absolute bottom-8 left-8 pointer-events-none"
          style={{ animation: 'float-leaf 6s ease-in-out infinite', color: THEME.coral }}
        >
          <NoteCluster className="w-20 h-20 opacity-30" />
        </div>
      </div>

      {/* ═══ ALTERNATING CONTENT SECTIONS ═══ */}
      <div style={{ background: THEME.cream }}>
        {/* Section 1: Collaboration */}
        <div className="relative px-8 py-24 lg:px-16 xl:px-24 overflow-hidden">
          <OrganicBlob
            className="w-[500px] h-[500px] -top-40 -right-40 opacity-40 pointer-events-none"
            fill={THEME.blush}
          />
          <div className="relative z-10 max-w-6xl mx-auto flex flex-col lg:flex-row items-center gap-16">
            <div className="lg:w-1/2 space-y-6">
              <div
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold tracking-widest uppercase"
                style={{ background: THEME.blush, color: THEME.coral }}
              >
                <Users size={14} />
                Collaboration
              </div>
              <h2
                style={{
                  fontFamily: "'Playfair Display', serif",
                  fontSize: 'clamp(1.8rem, 3vw, 2.6rem)',
                  fontWeight: 600,
                  color: THEME.void,
                  letterSpacing: '-0.02em',
                  lineHeight: 1.15,
                }}
              >
                Jam together without the friction
              </h2>
              <p
                className="leading-relaxed"
                style={{ color: THEME.stone, fontSize: '1.05rem', lineHeight: 1.7 }}
              >
                No screen shares, no export-and-send, no "wait, which version?"
                Hayashi lives inside your Discord voice channel. Everyone sees the
                same canvas, hears the same loop, and builds the same idea — in
                real time, with zero latency.
              </p>
            </div>
            <div className="lg:w-1/2 flex items-center justify-center">
              <div
                className="relative w-full max-w-sm aspect-square rounded-3xl flex items-center justify-center"
                style={{
                  background: `linear-gradient(135deg, ${THEME.blush}, ${THEME.sky})`,
                  boxShadow: '0 20px 60px rgba(255,140,97,0.10)',
                }}
              >
                <NoteCluster className="w-48 h-48" />
                <div
                  className="absolute -bottom-4 -right-4 w-24 h-24 rounded-2xl flex items-center justify-center"
                  style={{
                    background: THEME.coral,
                    boxShadow: '0 12px 32px rgba(255,140,97,0.3)',
                  }}
                >
                  <Users size={32} className="text-white" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Sounds */}
        <div className="relative px-8 py-24 lg:px-16 xl:px-24 overflow-hidden">
          <OrganicBlob
            className="w-[500px] h-[500px] -bottom-40 -left-40 opacity-40 pointer-events-none"
            fill={THEME.sky}
          />
          <div className="relative z-10 max-w-6xl mx-auto flex flex-col lg:flex-row-reverse items-center gap-16">
            <div className="lg:w-1/2 space-y-6">
              <div
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold tracking-widest uppercase"
                style={{ background: THEME.sky, color: THEME.violet }}
              >
                <AudioWaveform size={14} />
                Sound Library
              </div>
              <h2
                style={{
                  fontFamily: "'Playfair Display', serif",
                  fontSize: 'clamp(1.8rem, 3vw, 2.6rem)',
                  fontWeight: 600,
                  color: THEME.void,
                  letterSpacing: '-0.02em',
                  lineHeight: 1.15,
                }}
              >
                Sounds that spark ideas
              </h2>
              <p
                className="leading-relaxed"
                style={{ color: THEME.stone, fontSize: '1.05rem', lineHeight: 1.7 }}
              >
                A curated collection of samples, drum kits, and synth patches
                designed to get you out of your head and into the loop. No
                browsing, no purchasing — just sounds that work, ready when you
                are.
              </p>
            </div>
            <div className="lg:w-1/2 flex items-center justify-center">
              <div
                className="relative w-full max-w-sm aspect-square rounded-3xl flex items-center justify-center"
                style={{
                  background: `linear-gradient(135deg, ${THEME.sky}, ${THEME.blush})`,
                  boxShadow: '0 20px 60px rgba(123,97,255,0.10)',
                }}
              >
                <WaveformDecoration />
                <div
                  className="absolute -top-4 -left-4 w-20 h-20 rounded-2xl flex items-center justify-center"
                  style={{
                    background: THEME.violet,
                    boxShadow: '0 12px 32px rgba(123,97,255,0.3)',
                  }}
                >
                  <AudioWaveform size={28} className="text-white" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Export */}
        <div className="relative px-8 py-24 lg:px-16 xl:px-24 overflow-hidden">
          <OrganicBlob
            className="w-[500px] h-[500px] -top-40 -right-40 opacity-30 pointer-events-none"
            fill={THEME.coral}
          />
          <div className="relative z-10 max-w-6xl mx-auto flex flex-col lg:flex-row items-center gap-16">
            <div className="lg:w-1/2 space-y-6">
              <div
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold tracking-widest uppercase"
                style={{
                  background: `${THEME.coral}15`,
                  color: THEME.coral,
                }}
              >
                <Download size={14} />
                Export
              </div>
              <h2
                style={{
                  fontFamily: "'Playfair Display', serif",
                  fontSize: 'clamp(1.8rem, 3vw, 2.6rem)',
                  fontWeight: 600,
                  color: THEME.void,
                  letterSpacing: '-0.02em',
                  lineHeight: 1.15,
                }}
              >
                Handoff without the hassle
              </h2>
              <p
                className="leading-relaxed"
                style={{ color: THEME.stone, fontSize: '1.05rem', lineHeight: 1.7 }}
              >
                When the sketch feels right, bounce it out. Hayashi exports stems,
                MIDI, and project data so you can mix, master, and release in the
                tools you already trust. The idea stays; the collaboration ends.
              </p>
            </div>
            <div className="lg:w-1/2 flex items-center justify-center">
              <div
                className="relative w-full max-w-sm aspect-square rounded-3xl flex items-center justify-center"
                style={{
                  background: `linear-gradient(135deg, ${THEME.coral}15, ${THEME.blush})`,
                  boxShadow: '0 20px 60px rgba(255,140,97,0.10)',
                }}
              >
                <div className="grid grid-cols-2 gap-4">
                  {exportFormats.slice(0, 4).map((fmt) => (
                    <div
                      key={fmt.name}
                      className="flex items-center gap-2 px-4 py-3 rounded-xl"
                      style={{
                        background: '#ffffff',
                        border: '1px solid rgba(15,15,26,0.06)',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                      }}
                    >
                      <span style={{ color: THEME.coral }}>{fmt.icon}</span>
                      <span className="text-xs font-semibold" style={{ color: THEME.void }}>
                        {fmt.name}
                      </span>
                    </div>
                  ))}
                </div>
                <div
                  className="absolute -bottom-4 -right-4 w-24 h-24 rounded-2xl flex items-center justify-center"
                  style={{
                    background: THEME.sage,
                    boxShadow: '0 12px 32px rgba(143,188,143,0.3)',
                  }}
                >
                  <Download size={28} className="text-white" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ EXPORT / DAW HANDOFF SECTION ═══ */}
      <div
        className="relative px-8 py-24 lg:px-16 xl:px-24 overflow-hidden"
        style={{ background: THEME.void }}
      >
        <div className="relative z-10 max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <div
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-6"
              style={{ background: 'rgba(250,248,245,0.08)', color: THEME.cream }}
            >
              <Download size={14} />
              <span className="text-xs font-bold tracking-widest uppercase">Handoff</span>
            </div>

            <h2
              className="mb-4"
              style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: 'clamp(1.8rem, 3.5vw, 2.8rem)',
                fontWeight: 600,
                color: THEME.cream,
                letterSpacing: '-0.02em',
              }}
            >
              Export to any DAW
            </h2>
            <p
              className="max-w-lg mx-auto"
              style={{
                fontSize: '1.05rem',
                color: 'rgba(250,248,245,0.5)',
                lineHeight: 1.6,
              }}
            >
              When the sketch is done, take it home. Hayashi exports stems,
              MIDI, and project data so you can mix, master, and release in the
              tools you already trust.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 mb-12">
            {exportFormats.map((fmt, i) => (
              <div
                key={fmt.name}
                className="group flex items-center gap-2.5 px-5 py-3 rounded-xl transition-all duration-300 hover:-translate-y-1"
                style={{
                  background: 'rgba(250,248,245,0.06)',
                  border: '1px solid rgba(250,248,245,0.08)',
                  animation: mounted
                    ? `fade-up 0.7s ${1.2 + i * 0.1}s cubic-bezier(0.22, 1, 0.36, 1) forwards`
                    : undefined,
                  opacity: mounted ? undefined : 0,
                }}
              >
                <span style={{ color: THEME.cream }}>{fmt.icon}</span>
                <span
                  className="text-sm font-semibold"
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    color: THEME.cream,
                  }}
                >
                  {fmt.name}
                </span>
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider"
                  style={{
                    background:
                      fmt.status === 'Ready'
                        ? `${THEME.sage}25`
                        : `${THEME.coral}20`,
                    color: fmt.status === 'Ready' ? THEME.sage : THEME.coral,
                  }}
                >
                  {fmt.status}
                </span>
              </div>
            ))}
          </div>

          <div
            className="text-center"
            style={{
              animation: mounted
                ? 'fade-up 0.8s 1.8s cubic-bezier(0.22, 1, 0.36, 1) forwards'
                : undefined,
              opacity: mounted ? undefined : 0,
            }}
          >
            <p
              className="text-xs font-bold tracking-widest uppercase mb-4"
              style={{ color: 'rgba(250,248,245,0.3)' }}
            >
              Works with
            </p>
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
              {[
                'Ableton Live',
                'Logic Pro',
                'FL Studio',
                'Pro Tools',
                'REAPER',
                'Studio One',
                'Bitwig',
                'Cubase',
              ].map((daw) => (
                <span
                  key={daw}
                  className="text-sm font-medium transition-colors duration-300 hover:text-white"
                  style={{ color: 'rgba(250,248,245,0.35)' }}
                >
                  {daw}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ HOW IT WORKS ═══ */}
      <div
        className="relative px-8 py-24 lg:px-16 xl:px-24 overflow-hidden"
        style={{ background: THEME.cream }}
      >
        <OrganicBlob
          className="w-[600px] h-[600px] -bottom-60 -left-40 opacity-30 pointer-events-none"
          fill={THEME.violet}
        />

        <div className="relative z-10 max-w-4xl mx-auto text-center">
          <div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-8"
            style={{ background: THEME.creamDark, color: THEME.void }}
          >
            <Zap size={14} style={{ color: THEME.coral }} />
            <span className="text-xs font-bold tracking-widest uppercase">
              Ready when you are
            </span>
          </div>

          <h2
            className="mb-6"
            style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: 'clamp(2rem, 4.5vw, 3.8rem)',
              fontWeight: 700,
              color: THEME.void,
              letterSpacing: '-0.03em',
              lineHeight: 1.1,
            }}
          >
            From voice channel to finished track
          </h2>

          <p
            className="mb-12 max-w-xl mx-auto"
            style={{
              fontSize: '1.05rem',
              color: THEME.stone,
              lineHeight: 1.7,
            }}
          >
            No downloads, no setup. Launch inside Discord, sketch with your
            crew, then hand off to your DAW when you are ready to finish.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-14 text-left">
            {[
              {
                step: '01',
                title: 'Join a voice channel',
                desc: 'Hop into any voice channel in your Discord server. Everyone hears the same audio.',
              },
              {
                step: '02',
                title: 'Sketch together',
                desc: 'Build loops, arrange clips, and tweak sounds in real time. Every cursor, every change, synced instantly.',
              },
              {
                step: '03',
                title: 'Export & finish',
                desc: 'Bounce stems and MIDI, then open in Ableton, Logic, or any DAW. The idea stays; the collaboration ends.',
              },
            ].map((s, i) => (
              <div key={s.step} className="relative">
                <div
                  className="text-5xl font-bold mb-3"
                  style={{
                    fontFamily: "'Playfair Display', serif",
                    color: 'rgba(15,15,26,0.06)',
                    lineHeight: 1,
                  }}
                >
                  {s.step}
                </div>
                <h4
                  className="text-base font-semibold mb-2"
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    color: THEME.void,
                  }}
                >
                  {s.title}
                </h4>
                <p
                  className="text-sm"
                  style={{ color: THEME.stone, lineHeight: 1.6 }}
                >
                  {s.desc}
                </p>
                {i < 2 && (
                  <div
                    className="hidden md:block absolute top-8 right-0 w-px h-12"
                    style={{ background: 'rgba(15,15,26,0.06)' }}
                  />
                )}
              </div>
            ))}
          </div>

          <button
            onClick={handleAddToDiscord}
            className="group inline-flex items-center gap-3 px-8 py-4 rounded-xl text-sm font-semibold transition-all duration-300 hover:scale-[1.03] active:scale-[0.98]"
            style={{
              background: THEME.coral,
              color: '#ffffff',
              boxShadow: '0 8px 32px rgba(255,140,97,0.35)',
            }}
          >
            <MessageCircle size={18} />
            Add Hayashi to Discord
            <ArrowRight
              size={16}
              className="transition-transform duration-300 group-hover:translate-x-1"
            />
          </button>
        </div>
      </div>

      {/* ═══ FOOTER ═══ */}
      <footer
        className="px-8 py-12 lg:px-16"
        style={{
          background: THEME.void,
          borderTop: '1px solid rgba(250,248,245,0.06)',
        }}
      >
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{
                background: `linear-gradient(135deg, ${THEME.coral}, ${THEME.violet})`,
              }}
            >
              <Music size={16} className="text-white" />
            </div>
            <span
              className="text-sm font-semibold"
              style={{ color: 'rgba(250,248,245,0.5)' }}
            >
              Hayashi
            </span>
          </div>
          <p
            className="text-xs text-center md:text-left"
            style={{ color: 'rgba(250,248,245,0.25)' }}
          >
            The collaborative sketchpad for music makers. Sketch in Discord,
            finish in your DAW.
          </p>
        </div>
      </footer>
    </>
  );
}
