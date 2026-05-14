import { useState } from 'react';
import { MessageCircle, Copy, Check } from 'lucide-react';

export function LandingPage() {
  const [copied, setCopied] = useState(false);

  const chromeBg = { background: 'var(--hayashi-chrome)' } as React.CSSProperties;
  const chromeText = { color: '#1a1a1a' } as React.CSSProperties;
  const chromeMuted = { color: '#555555' } as React.CSSProperties;

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
    <div className="relative flex h-screen w-screen items-center justify-center p-6" style={chromeBg}>
      <div
        className="max-w-lg w-full p-8 text-center space-y-5"
        style={{
          background: '#ffffff',
          borderRadius: 10,
          border: '1px solid rgba(16,38,29,0.08)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.06)',
        }}
      >
        <img src="/hayashi-logo.png" alt="Hayashi" className="mx-auto h-16 w-16 rounded-2xl opacity-90" />

        <div className="space-y-1">
          <h1 className="text-2xl font-semibold" style={chromeText}>
            Oops — Wrong Neighborhood
          </h1>
          <p className="text-sm" style={chromeMuted}>
            Hayashi is a Discord Activity. It only works inside a Discord voice channel.
          </p>
        </div>

        <div
          className="rounded-lg p-4 text-left text-sm space-y-2"
          style={{ background: '#faf5eb', border: '1px solid rgba(16,38,29,0.06)' }}
        >
          <p className="font-medium" style={chromeText}>
            To use Hayashi:
          </p>
          <ol className="list-decimal list-inside space-y-1" style={chromeMuted}>
            <li>Open Discord (desktop or mobile).</li>
            <li>Join a voice channel in a server that has Hayashi installed.</li>
            <li>Click the Activities button and launch Hayashi.</li>
          </ol>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
          <button
            type="button"
            className="hayashi-action"
            onClick={handleOpenDiscord}
          >
            <MessageCircle size={15} />
            Open Discord
          </button>

          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            style={{
              background: 'transparent',
              color: '#555555',
              border: '1px solid rgba(16,38,29,0.12)',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget.style as any).background = 'rgba(16,38,29,0.04)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget.style as any).background = 'transparent';
            }}
            onClick={handleCopyLink}
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? 'Copied' : 'Copy Link'}
          </button>
        </div>

        <p className="text-xs" style={{ color: '#888888', fontFamily: 'var(--hayashi-font-mono)' }}>
          If you believe you reached this page by mistake, make sure you are accessing Hayashi through Discord.
        </p>
      </div>
    </div>
  );
}
