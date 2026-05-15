import { useState } from 'react';
import { MessageCircle, Copy, Check, ArrowRight, Music, Sparkles } from 'lucide-react';

export function LandingPage() {
  const [copied, setCopied] = useState(false);

  const handleOpenDiscord = () => {
    const protocolUrl = 'discord://';
    const webUrl = 'https://discord.com';

    const popup = window.open(protocolUrl, '_blank');
    if (!popup) {
      window.location.assign(webUrl);
      return;
    }

    setTimeout(() => {
      if (popup.closed) return;
      popup.close();
      window.open(webUrl, '_blank');
    }, 800);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div
      className="relative min-h-screen w-full overflow-hidden"
      style={{ background: '#faf8f5', fontFamily: "'DM Sans', sans-serif" }}
    >
      {/* ambient gradient orbs */}
      <div
        className="absolute top-0 left-0 w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(255,140,97,0.10) 0%, transparent 70%)',
          filter: 'blur(60px)',
          transform: 'translate(-30%, -30%)',
        }}
      />
      <div
        className="absolute bottom-0 right-0 w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(123,97,255,0.08) 0%, transparent 70%)',
          filter: 'blur(80px)',
          transform: 'translate(30%, 30%)',
        }}
      />
      <div
        className="absolute top-1/2 left-1/2 w-[400px] h-[400px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(143,188,143,0.08) 0%, transparent 70%)',
          filter: 'blur(60px)',
          transform: 'translate(-50%, -50%)',
        }}
      />

      {/* floating decorative shapes */}
      <div
        className="absolute top-[12%] right-[10%] w-8 h-8 rounded-lg opacity-20 pointer-events-none"
        style={{
          background: '#ff8c61',
          animation: 'hayashi-drift 8s ease-in-out infinite',
        }}
      />
      <div
        className="absolute bottom-[18%] left-[8%] w-6 h-6 rounded-full opacity-15 pointer-events-none"
        style={{
          background: '#7b61ff',
          animation: 'hayashi-drift 10s ease-in-out infinite 2s',
        }}
      />

      <div className="relative z-10 flex min-h-screen items-center justify-center p-6">
        <div className="max-w-lg w-full text-center space-y-8">
          {/* brand mark */}
          <div className="space-y-4">
            <div
              className="inline-flex items-center justify-center w-16 h-16 rounded-2xl"
              style={{
                background: 'linear-gradient(135deg, #ff8c61, #ff6b9d)',
                boxShadow: '0 8px 32px rgba(255,140,97,0.25)',
              }}
            >
              <Music size={28} className="text-white" />
            </div>
            <h1
              className="text-4xl font-bold tracking-tight"
              style={{ fontFamily: "'Playfair Display', serif", color: '#0f0f1a' }}
            >
              Oops — Wrong Neighborhood
            </h1>
            <p
              className="text-base leading-relaxed max-w-sm mx-auto"
              style={{ color: '#6b6b7b' }}
            >
              Hayashi is a Discord Activity. It only works inside a Discord voice channel.
            </p>
          </div>

          {/* instruction card */}
          <div
            className="rounded-2xl p-6 text-left space-y-4"
            style={{
              background: '#ffffff',
              border: '1px solid rgba(15,15,26,0.06)',
              boxShadow: '0 4px 24px rgba(0,0,0,0.03)',
            }}
          >
            <div className="flex items-center gap-2">
              <Sparkles size={16} style={{ color: '#ff8c61' }} />
              <span className="text-sm font-semibold" style={{ color: '#0f0f1a' }}>
                To use Hayashi
              </span>
            </div>
            <ol
              className="list-decimal list-inside space-y-2 text-sm"
              style={{ color: '#4a4a5a', lineHeight: 1.7 }}
            >
              <li>Open Discord (desktop or mobile).</li>
              <li>Join a voice channel in a server that has Hayashi installed.</li>
              <li>Click the Activities button and launch Hayashi.</li>
            </ol>
          </div>

          {/* actions */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            <button
              onClick={handleOpenDiscord}
              className="group inline-flex items-center gap-2.5 px-6 py-3 rounded-xl text-sm font-semibold text-white transition-all duration-300 hover:scale-[1.03] active:scale-[0.98]"
              style={{
                background: '#ff8c61',
                boxShadow: '0 4px 20px rgba(255,140,97,0.3)',
              }}
            >
              <MessageCircle size={16} />
              Open Discord
              <ArrowRight
                size={14}
                className="transition-transform duration-300 group-hover:translate-x-0.5"
              />
            </button>

            <button
              onClick={handleCopyLink}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium transition-all duration-200"
              style={{
                background: '#f0eeeb',
                color: '#4a4a5a',
                border: '1px solid rgba(15,15,26,0.06)',
              }}
            >
              {copied ? (
                <Check size={15} style={{ color: '#7fb069' }} />
              ) : (
                <Copy size={15} />
              )}
              {copied ? 'Copied!' : 'Copy Link'}
            </button>
          </div>

          <p className="text-xs" style={{ color: '#a0a0ad' }}>
            If you believe you reached this page by mistake, make sure you are
            accessing Hayashi through Discord.
          </p>
        </div>
      </div>

      <style>{`
        @keyframes hayashi-drift {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          33% { transform: translate(8px, -12px) rotate(4deg); }
          66% { transform: translate(-4px, 6px) rotate(-2deg); }
        }
      `}</style>
    </div>
  );
}
