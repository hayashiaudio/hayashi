import { useEffect, useState } from 'react';
import { Download, ArrowLeft, FileMusic, AlertCircle, Check } from 'lucide-react';

const COLORS = {
  cream: '#f5f0e8',
  creamDark: '#e8e0d4',
  forest: '#0d2818',
  forestLight: '#1a3a2a',
  orange: '#e8843c',
  sage: '#8fb359',
  muted: '#555555',
};

export function DownloadPage() {
  const [status, setStatus] = useState<'loading' | 'downloading' | 'done' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const params = new URLSearchParams(window.location.search);
  const assetId = params.get('asset');
  const tigrisUrl = params.get('url');
  const filename = params.get('filename') ?? 'hayashi-export';

  const assetUrl = tigrisUrl
    ? `${tigrisUrl}?response-content-disposition=${encodeURIComponent(`attachment; filename="${filename}"`)}`
    : `${window.location.origin}/assets/${assetId}?download=1&filename=${encodeURIComponent(filename)}`;

  useEffect(() => {
    if (!assetId && !tigrisUrl) {
      setStatus('error');
      setErrorMsg('No asset specified.');
      return;
    }

    setStatus('downloading');

    // Trigger the browser download via a hidden iframe so the page stays visible
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = assetUrl;
    document.body.appendChild(iframe);

    const cleanup = () => {
      try {
        document.body.removeChild(iframe);
      } catch {
        // no-op
      }
    };

    // After a short delay, show the done state
    const timer = window.setTimeout(() => {
      setStatus('done');
      cleanup();
    }, 2500);

    return () => {
      window.clearTimeout(timer);
      cleanup();
    };
  }, [assetUrl, assetId, tigrisUrl]);

  const handleManualDownload = () => {
    window.location.href = assetUrl;
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{
        background: COLORS.cream,
        fontFamily: "var(--hayashi-font-body, 'Iowan Old Style', Georgia, serif)",
      }}
    >
      <div
        className="w-full max-w-md p-8 rounded-2xl text-center"
        style={{
          background: '#ffffff',
          border: '1px solid rgba(13,40,24,0.08)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.06)',
        }}
      >
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-5"
          style={{ background: `${COLORS.sage}15`, color: COLORS.sage }}
        >
          <FileMusic size={22} />
        </div>

        <h1
          className="mb-2"
          style={{
            fontFamily: "var(--hayashi-font-display, 'Avenir Next', sans-serif)",
            fontSize: '1.4rem',
            fontWeight: 600,
            color: COLORS.forest,
            letterSpacing: '-0.02em',
          }}
        >
          Your export is ready
        </h1>

        <p
          className="mb-6"
          style={{
            fontSize: '0.95rem',
            color: COLORS.muted,
            lineHeight: 1.5,
          }}
        >
          {filename}
        </p>

        {status === 'loading' && (
          <div className="flex items-center justify-center gap-2 text-sm" style={{ color: COLORS.muted }}>
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            Preparing download…
          </div>
        )}

        {status === 'downloading' && (
          <div className="flex items-center justify-center gap-2 text-sm" style={{ color: COLORS.muted }}>
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            Downloading…
          </div>
        )}

        {status === 'done' && (
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-2 text-sm" style={{ color: COLORS.sage }}>
              <Check size={16} />
              Download started
            </div>
            <button
              onClick={handleManualDownload}
              className="group inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 hover:scale-[1.03] active:scale-[0.98]"
              style={{
                background: COLORS.forest,
                color: COLORS.cream,
              }}
            >
              <Download size={16} />
              Download again
            </button>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-2 text-sm" style={{ color: '#b8563d' }}>
              <AlertCircle size={16} />
              {errorMsg ?? 'Something went wrong.'}
            </div>
            {(assetId || tigrisUrl) && (
              <button
                onClick={handleManualDownload}
                className="group inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 hover:scale-[1.03] active:scale-[0.98]"
                style={{
                  background: COLORS.forest,
                  color: COLORS.cream,
                }}
              >
                <Download size={16} />
                Try downloading
              </button>
            )}
          </div>
        )}
      </div>

      <button
        onClick={() => window.close()}
        className="mt-6 inline-flex items-center gap-1.5 text-xs font-medium transition-colors hover:opacity-70"
        style={{ color: COLORS.muted }}
      >
        <ArrowLeft size={14} />
        Close this tab
      </button>
    </div>
  );
}
