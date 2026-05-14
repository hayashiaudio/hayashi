import { useEffect, useState } from 'react';
import {
  Leaf,
  Users,
  AudioWaveform,
  ArrowRight,
  MessageCircle,
  Download,
  Music,
  FileMusic,
} from 'lucide-react';

/* ─── CSS animations injected once ─── */
const marketingStyles = `
@keyframes float-leaf {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  33% { transform: translateY(-12px) rotate(4deg); }
  66% { transform: translateY(6px) rotate(-3deg); }
}
@keyframes drift-slow {
  0%, 100% { transform: translate(0, 0) rotate(0deg); }
  50% { transform: translate(8px, -10px) rotate(2deg); }
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
  0%, 100% { filter: drop-shadow(0 0 20px rgba(232,132,60,0.15)); }
  50% { filter: drop-shadow(0 0 40px rgba(232,132,60,0.35)); }
}
@keyframes dot-breathe {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 0.7; }
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

const COLORS = {
  cream: '#f5f0e8',
  creamDark: '#e8e0d4',
  forest: '#0d2818',
  forestLight: '#1a3a2a',
  orange: '#e8843c',
  sage: '#8fb359',
  olive: '#6b8e5a',
  charcoal: '#1a1a1a',
  muted: '#555555',
  creamText: '#3d3d3d',
};

function LeafSVG({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} style={style}>
      <path
        d="M12 2C7 2 3 6 3 12c0 4 2 7 5 9 1-3 1-6 4-8 3 2 3 5 4 8 3-2 5-5 5-9 0-6-4-10-9-10z"
        fill="currentColor"
        opacity={0.85}
      />
      <path d="M12 22V12" stroke="currentColor" strokeWidth={1.2} opacity={0.6} />
    </svg>
  );
}

function OrganicBlob({ className, fill }: { className?: string; fill?: string }) {
  return (
    <svg viewBox="0 0 200 200" className={className} style={{ position: 'absolute' }}>
      <path
        fill={fill ?? COLORS.sage}
        d="M44.7,-76.4C58.9,-69.2,71.8,-59.1,81.6,-46.6C91.4,-34.1,98.1,-19.2,95.8,-4.9C93.5,9.3,82.2,22.9,71.1,34.3C60,45.7,49.1,54.9,37.4,62.3C25.7,69.7,13.2,75.3,0.1,75.1C-13,74.9,-25.9,68.9,-37.6,61.2C-49.3,53.5,-59.8,44.1,-68.3,32.6C-76.8,21.1,-83.3,7.5,-81.8,-5.4C-80.3,-18.3,-70.8,-30.5,-60.2,-40.1C-49.6,-49.7,-37.9,-56.7,-25.8,-65.4C-13.7,-74.1,-1.2,-84.5,10.5,-84.2C22.2,-83.9,30.5,-83.6,44.7,-76.4Z"
        transform="translate(100 100)"
        opacity={0.15}
      />
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
      color: COLORS.sage,
    },
    {
      icon: <AudioWaveform size={22} />,
      title: 'Handpicked sounds',
      description:
        'Curated samples, drum kits, and synth patches designed for quick ideation — no sample hunting.',
      color: COLORS.orange,
    },
    {
      icon: <Leaf size={22} />,
      title: 'Social rituals',
      description:
        'Beat battles, listening sessions, and collaborative albums. Your server becomes the studio lounge.',
      color: COLORS.olive,
    },
    {
      icon: <Download size={22} />,
      title: 'Export to your DAW',
      description:
        'Bounce stems, MIDI, and project data. Open in Ableton, Logic, FL Studio, or any serious tool.',
      color: COLORS.forest,
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

      {/* ─── HERO ─── */}
      <div
        className="relative min-h-screen flex flex-col lg:flex-row overflow-hidden"
        style={{ fontFamily: "var(--hayashi-font-body, 'Iowan Old Style', Georgia, serif)" }}
      >
        {/* Left panel: cream content */}
        <div
          className="relative z-10 flex flex-col justify-center px-8 py-16 lg:px-16 xl:px-24 lg:w-[55%]"
          style={{ background: COLORS.cream }}
        >
          <div className="absolute top-8 right-8 opacity-20 pointer-events-none">
            <DotPattern />
          </div>

          <div
            className="absolute -left-4 top-24 opacity-40 pointer-events-none"
            style={{ animation: 'float-leaf 6s ease-in-out infinite', color: COLORS.sage }}
          >
            <LeafSVG className="w-16 h-16" />
          </div>

          {/* Nav pills */}
          <div
            className={`hayashi-reveal hayashi-reveal-d1 inline-flex items-center gap-2 mb-8 ${mounted ? '' : 'opacity-0'}`}
          >
            <span
              className="px-3 py-1 rounded-full text-xs font-semibold tracking-widest uppercase"
              style={{ background: COLORS.creamDark, color: COLORS.forest }}
            >
              Sketch
            </span>
            <span style={{ color: COLORS.muted }}>&bull;</span>
            <span
              className="px-3 py-1 rounded-full text-xs font-semibold tracking-widest uppercase"
              style={{ background: COLORS.creamDark, color: COLORS.forest }}
            >
              Share
            </span>
            <span style={{ color: COLORS.muted }}>&bull;</span>
            <span
              className="px-3 py-1 rounded-full text-xs font-semibold tracking-widest uppercase"
              style={{ background: COLORS.creamDark, color: COLORS.forest }}
            >
              Finish
            </span>
          </div>

          {/* Title */}
          <h1
            className={`hayashi-reveal hayashi-reveal-d2 flex items-center gap-3 mb-4 ${mounted ? '' : 'opacity-0'}`}
            style={{
              fontFamily: "var(--hayashi-font-display, 'Avenir Next', sans-serif)",
              fontSize: 'clamp(3rem, 6vw, 5.5rem)',
              fontWeight: 700,
              letterSpacing: '-0.03em',
              lineHeight: 1.05,
              color: COLORS.forest,
            }}
          >
            Hayashi
            <LeafSVG
              className="inline-block"
              style={{
                width: 'clamp(1.5rem, 3vw, 2.8rem)',
                height: 'clamp(1.5rem, 3vw, 2.8rem)',
                color: COLORS.sage,
                flexShrink: 0,
              }}
            />
          </h1>

          {/* Tagline */}
          <p
            className={`hayashi-reveal hayashi-reveal-d3 mb-4 ${mounted ? '' : 'opacity-0'}`}
            style={{
              fontFamily: "var(--hayashi-font-display, 'Avenir Next', sans-serif)",
              fontSize: 'clamp(1.1rem, 2vw, 1.6rem)',
              fontWeight: 500,
              color: COLORS.forestLight,
              letterSpacing: '-0.01em',
            }}
          >
            Sketch in Discord. Finish in your DAW.
          </p>

          {/* Description */}
          <p
            className={`hayashi-reveal hayashi-reveal-d4 max-w-lg mb-10 leading-relaxed ${mounted ? '' : 'opacity-0'}`}
            style={{
              fontSize: 'clamp(0.95rem, 1.2vw, 1.15rem)',
              color: COLORS.muted,
              lineHeight: 1.7,
            }}
          >
            Hayashi is the collaborative sketchpad for music makers. Start ideas together in a Discord voice channel, then export stems and MIDI to Ableton, Logic, or any DAW. No DAW does collaboration well. We do.
          </p>

          {/* CTA Button */}
          <div className={`hayashi-reveal hayashi-reveal-d5 ${mounted ? '' : 'opacity-0'}`}>
            <button
              onClick={handleAddToDiscord}
              className="group inline-flex items-center gap-3 px-7 py-3.5 rounded-xl text-sm font-semibold transition-all duration-300 hover:scale-[1.03] active:scale-[0.98]"
              style={{
                background: COLORS.forest,
                color: COLORS.cream,
                boxShadow: '0 4px 24px rgba(13,40,24,0.25)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = COLORS.forestLight;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = COLORS.forest;
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

          <div
            className="absolute bottom-12 right-12 opacity-30 pointer-events-none"
            style={{ animation: 'drift-slow 8s ease-in-out infinite', color: COLORS.orange }}
          >
            <LeafSVG className="w-10 h-10" style={{ transform: 'rotate(120deg)' }} />
          </div>
        </div>

        {/* Right panel: dark forest with drum */}
        <div
          className="relative flex items-center justify-center lg:w-[45%] min-h-[40vh] lg:min-h-screen"
          style={{ background: COLORS.forest }}
        >
          <OrganicBlob
            className="w-[500px] h-[500px] -top-20 -right-20 opacity-30 pointer-events-none"
            fill={COLORS.sage}
          />
          <OrganicBlob
            className="w-[350px] h-[350px] bottom-10 left-10 opacity-20 pointer-events-none"
            fill={COLORS.orange}
          />

          <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-25 pointer-events-none hidden lg:block">
            <WaveformBars />
          </div>

          <div className="absolute top-8 right-8 opacity-15 pointer-events-none">
            <DotPattern color={COLORS.cream} />
          </div>

          <div
            className="absolute top-[15%] left-[15%] pointer-events-none"
            style={{ animation: 'float-leaf 7s ease-in-out infinite', color: COLORS.sage }}
          >
            <LeafSVG className="w-8 h-8" />
          </div>
          <div
            className="absolute bottom-[20%] right-[20%] pointer-events-none"
            style={{ animation: 'float-leaf 5s ease-in-out infinite 1s', color: COLORS.olive }}
          >
            <LeafSVG className="w-6 h-6" style={{ transform: 'rotate(60deg)' }} />
          </div>
          <div
            className="absolute top-[40%] right-[10%] pointer-events-none"
            style={{ animation: 'drift-slow 9s ease-in-out infinite 0.5s', color: COLORS.sage }}
          >
            <LeafSVG className="w-5 h-5" style={{ transform: 'rotate(-30deg)' }} />
          </div>

          <div
            className={`hayashi-reveal hayashi-reveal-d3 relative z-10 ${mounted ? '' : 'opacity-0'}`}
            style={{
              animation: mounted
                ? 'fade-up 0.9s 0.3s cubic-bezier(0.22, 1, 0.36, 1) forwards, pulse-glow 4s ease-in-out infinite 1.5s'
                : undefined,
            }}
          >
            <img
              src="/hayashi-logo.png"
              alt="Hayashi drum"
              className="w-[clamp(140px,22vw,280px)] h-auto drop-shadow-2xl"
            />
          </div>

          <div
            className="absolute inset-0 pointer-events-none flex items-center justify-center"
            style={{ opacity: 0.08 }}
          >
            <div
              className="rounded-full border-2"
              style={{
                width: 'clamp(200px, 40vw, 500px)',
                height: 'clamp(200px, 40vw, 500px)',
                borderColor: COLORS.cream,
              }}
            />
          </div>
          <div
            className="absolute inset-0 pointer-events-none flex items-center justify-center"
            style={{ opacity: 0.05 }}
          >
            <div
              className="rounded-full border-2"
              style={{
                width: 'clamp(280px, 55vw, 700px)',
                height: 'clamp(280px, 55vw, 700px)',
                borderColor: COLORS.cream,
              }}
            />
          </div>
        </div>
      </div>

      {/* ─── FEATURES SECTION ─── */}
      <div className="relative px-8 py-24 lg:px-16 xl:px-24" style={{ background: COLORS.forest }}>
        <div
          className="absolute -top-px left-0 right-0 h-16 pointer-events-none"
          style={{ background: `linear-gradient(to bottom, ${COLORS.cream}, transparent)` }}
        />

        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2
              className="mb-3"
              style={{
                fontFamily: "var(--hayashi-font-display, 'Avenir Next', sans-serif)",
                fontSize: 'clamp(1.8rem, 3.5vw, 2.8rem)',
                fontWeight: 600,
                color: COLORS.cream,
                letterSpacing: '-0.02em',
              }}
            >
              Everything you need to start an idea
            </h2>
            <p
              style={{
                fontSize: '1.05rem',
                color: 'rgba(245,240,232,0.6)',
                maxWidth: 520,
                margin: '0 auto',
                lineHeight: 1.6,
              }}
            >
              Built for the messy, joyful, collaborative part of music making that DAWs were never designed for.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((f, i) => (
              <div
                key={f.title}
                className="group relative p-7 rounded-2xl transition-all duration-500 hover:-translate-y-2"
                style={{
                  background: 'rgba(245,240,232,0.04)',
                  border: '1px solid rgba(245,240,232,0.08)',
                  animation: mounted
                    ? `fade-up 0.8s ${0.8 + i * 0.12}s cubic-bezier(0.22, 1, 0.36, 1) forwards`
                    : undefined,
                  opacity: mounted ? undefined : 0,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(245,240,232,0.08)';
                  e.currentTarget.style.borderColor = 'rgba(245,240,232,0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(245,240,232,0.04)';
                  e.currentTarget.style.borderColor = 'rgba(245,240,232,0.08)';
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
                    fontFamily: "var(--hayashi-font-display, 'Avenir Next', sans-serif)",
                    color: COLORS.cream,
                  }}
                >
                  {f.title}
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: 'rgba(245,240,232,0.55)' }}>
                  {f.description}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div
          className="absolute bottom-8 left-8 pointer-events-none"
          style={{ animation: 'float-leaf 6s ease-in-out infinite', color: COLORS.sage }}
        >
          <LeafSVG className="w-8 h-8 opacity-30" />
        </div>
      </div>

      {/* ─── EXPORT / DAW HANDOFF SECTION ─── */}
      <div
        className="relative px-8 py-24 lg:px-16 xl:px-24 overflow-hidden"
        style={{ background: COLORS.cream }}
      >
        <OrganicBlob
          className="w-[600px] h-[600px] -top-40 -left-40 opacity-[0.06] pointer-events-none"
          fill={COLORS.forest}
        />

        <div className="relative z-10 max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <div
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-6"
              style={{ background: COLORS.creamDark, color: COLORS.forest }}
            >
              <Download size={14} />
              <span className="text-xs font-semibold tracking-widest uppercase">Handoff</span>
            </div>

            <h2
              className="mb-4"
              style={{
                fontFamily: "var(--hayashi-font-display, 'Avenir Next', sans-serif)",
                fontSize: 'clamp(1.8rem, 3.5vw, 2.8rem)',
                fontWeight: 600,
                color: COLORS.forest,
                letterSpacing: '-0.02em',
              }}
            >
              Export to any DAW
            </h2>
            <p
              className="max-w-lg mx-auto"
              style={{
                fontSize: '1.05rem',
                color: COLORS.muted,
                lineHeight: 1.6,
              }}
            >
              When the sketch is done, take it home. Hayashi exports stems, MIDI, and project data so you can mix, master, and release in the tools you already trust.
            </p>
          </div>

          {/* Format badges */}
          <div className="flex flex-wrap items-center justify-center gap-4 mb-12">
            {exportFormats.map((fmt, i) => (
              <div
                key={fmt.name}
                className="group flex items-center gap-2.5 px-5 py-3 rounded-xl transition-all duration-300 hover:-translate-y-1"
                style={{
                  background: COLORS.creamDark,
                  border: '1px solid rgba(13,40,24,0.08)',
                  animation: mounted
                    ? `fade-up 0.7s ${1.2 + i * 0.1}s cubic-bezier(0.22, 1, 0.36, 1) forwards`
                    : undefined,
                  opacity: mounted ? undefined : 0,
                }}
              >
                <span style={{ color: COLORS.forest }}>{fmt.icon}</span>
                <span
                  className="text-sm font-semibold"
                  style={{
                    fontFamily: "var(--hayashi-font-display, 'Avenir Next', sans-serif)",
                    color: COLORS.forest,
                  }}
                >
                  {fmt.name}
                </span>
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider"
                  style={{
                    background: fmt.status === 'Ready' ? `${COLORS.sage}20` : `${COLORS.orange}15`,
                    color: fmt.status === 'Ready' ? COLORS.sage : COLORS.orange,
                  }}
                >
                  {fmt.status}
                </span>
              </div>
            ))}
          </div>

          {/* DAW text row */}
          <div
            className="text-center"
            style={{
              animation: mounted ? 'fade-up 0.8s 1.8s cubic-bezier(0.22, 1, 0.36, 1) forwards' : undefined,
              opacity: mounted ? undefined : 0,
            }}
          >
            <p className="text-xs font-semibold tracking-widest uppercase mb-4" style={{ color: COLORS.muted }}>
              Works with
            </p>
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
              {['Ableton Live', 'Logic Pro', 'FL Studio', 'Pro Tools', 'REAPER', 'Studio One', 'Bitwig', 'Cubase'].map(
                (daw) => (
                  <span
                    key={daw}
                    className="text-sm font-medium transition-colors duration-300 hover:text-[#0d2818]"
                    style={{ color: 'rgba(85,85,85,0.6)' }}
                  >
                    {daw}
                  </span>
                )
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─── HOW IT WORKS ─── */}
      <div
        className="relative px-8 py-24 lg:px-16 xl:px-24 overflow-hidden"
        style={{ background: COLORS.forest }}
      >
        <div className="relative z-10 max-w-4xl mx-auto text-center">
          <div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-8"
            style={{ background: 'rgba(245,240,232,0.08)', color: COLORS.cream }}
          >
            <LeafSVG className="w-4 h-4" style={{ color: COLORS.sage }} />
            <span className="text-xs font-semibold tracking-widest uppercase">
              Ready when you are
            </span>
          </div>

          <h2
            className="mb-6"
            style={{
              fontFamily: "var(--hayashi-font-display, 'Avenir Next', sans-serif)",
              fontSize: 'clamp(2rem, 4.5vw, 3.8rem)',
              fontWeight: 700,
              color: COLORS.cream,
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
              color: 'rgba(245,240,232,0.55)',
              lineHeight: 1.7,
            }}
          >
            No downloads, no setup. Launch inside Discord, sketch with your crew, then hand off to your DAW when you are ready to finish.
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
                    fontFamily: "var(--hayashi-font-display, 'Avenir Next', sans-serif)",
                    color: 'rgba(245,240,232,0.08)',
                    lineHeight: 1,
                  }}
                >
                  {s.step}
                </div>
                <h4
                  className="text-base font-semibold mb-2"
                  style={{
                    fontFamily: "var(--hayashi-font-display, 'Avenir Next', sans-serif)",
                    color: COLORS.cream,
                  }}
                >
                  {s.title}
                </h4>
                <p className="text-sm" style={{ color: 'rgba(245,240,232,0.5)', lineHeight: 1.6 }}>
                  {s.desc}
                </p>
                {i < 2 && (
                  <div
                    className="hidden md:block absolute top-8 right-0 w-px h-12"
                    style={{ background: 'rgba(245,240,232,0.08)' }}
                  />
                )}
              </div>
            ))}
          </div>

          <button
            onClick={handleAddToDiscord}
            className="group inline-flex items-center gap-3 px-8 py-4 rounded-xl text-sm font-semibold transition-all duration-300 hover:scale-[1.03] active:scale-[0.98]"
            style={{
              background: COLORS.orange,
              color: COLORS.cream,
              boxShadow: '0 4px 28px rgba(232,132,60,0.3)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#d47330';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = COLORS.orange;
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

      {/* ─── FOOTER ─── */}
      <footer
        className="px-8 py-10 lg:px-16"
        style={{ background: COLORS.forest, borderTop: `1px solid rgba(245,240,232,0.06)` }}
      >
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="/hayashi-logo.png" alt="Hayashi" className="w-8 h-8 opacity-80" />
            <span
              className="text-sm font-semibold"
              style={{ color: 'rgba(245,240,232,0.5)' }}
            >
              Hayashi
            </span>
          </div>
          <p className="text-xs" style={{ color: 'rgba(245,240,232,0.3)' }}>
            The collaborative sketchpad for music makers. Sketch in Discord, finish in your DAW.
          </p>
        </div>
      </footer>
    </>
  );
}

/* ─── Sub-components ─── */

function DotPattern({ color }: { color?: string }) {
  const dots = Array.from({ length: 25 }, (_, i) => ({
    left: `${(i % 5) * 25}%`,
    top: `${Math.floor(i / 5) * 25}%`,
    delay: `${(i * 0.15) % 2}s`,
  }));

  return (
    <div className="relative w-24 h-24">
      {dots.map((d, i) => (
        <div
          key={i}
          className="absolute w-1 h-1 rounded-full"
          style={{
            left: d.left,
            top: d.top,
            background: color ?? COLORS.forest,
            animation: `dot-breathe 3s ease-in-out infinite ${d.delay}`,
          }}
        />
      ))}
    </div>
  );
}

function WaveformBars() {
  const heights = [18, 32, 12, 42, 24, 50, 28, 38, 16, 44, 22, 36, 14, 48, 20];
  return (
    <div className="flex items-end gap-[3px] h-20">
      {heights.map((h, i) => (
        <div
          key={i}
          className="w-[3px] rounded-full"
          style={{
            height: `${h}%`,
            background: COLORS.cream,
            opacity: 0.25 + (i % 3) * 0.15,
            animation: `dot-breathe ${2 + (i % 3) * 0.5}s ease-in-out infinite ${i * 0.1}s`,
          }}
        />
      ))}
    </div>
  );
}
