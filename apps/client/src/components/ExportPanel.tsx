import { useState, useCallback } from 'react';
import { exportWav } from '@/export/offlineBounce';
import { renderGraphOffline } from '@/audio/graphCompiler';
import { useProjectStore } from '@/stores/projectStore';
import { useTransport } from '@/hooks/useTransport';
import { authorizeExport } from '@/lib/api';
import { X, Waves } from 'lucide-react';

export function ExportPanel() {
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const toggleExportPanel = useProjectStore((s) => s.toggleExportPanel);
  const projectTitle = useProjectStore((s) => s.projectTitle);
  const channelId = useProjectStore((s) => s.channelId);
  const guildId = useProjectStore((s) => s.guildId);
  const accessToken = useProjectStore((s) => s.accessToken);
  const nodes = useProjectStore((s) => s.nodes);
  const edges = useProjectStore((s) => s.edges);
  const setBillingSnapshot = useProjectStore((s) => s.setBillingSnapshot);
  const openPaywall = useProjectStore((s) => s.openPaywall);
  const { bpm } = useTransport();

  const handleExport = useCallback(async () => {
    if (!accessToken) {
      setError('Not authenticated with Discord.');
      return;
    }
    setExporting(true);
    setProgress(0);
    setError(null);
    let blobUrl: string | null = null;
    try {
      const snapshot = await authorizeExport({ accessToken, guildId, channelId });
      setBillingSnapshot(snapshot);
      if (!snapshot.contextAccess.allowed) {
        openPaywall(snapshot.contextAccess.reason ?? 'export_limit', snapshot.contextAccess.message ?? 'Upgrade required to export.');
        return;
      }

      setProgress(30);
      const duration = 16;
      const seconds = (duration * 4 * 60) / bpm;
      const blob = await exportWav((ctx) => renderGraphOffline(ctx, nodes, edges), seconds);
      setProgress(80);

      blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `${projectTitle.replace(/\s+/g, '-').toLowerCase()}.wav`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setProgress(100);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Export failed';
      setError(msg);
    } finally {
      setExporting(false);
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    }
  }, [accessToken, bpm, channelId, edges, guildId, nodes, openPaywall, projectTitle, setBillingSnapshot]);

  return (
    <section className="hayashi-mockup-panel hayashi-visual-panel max-w-md w-full">
      <div className="hayashi-panel-title-row">
        <div>
          <p className="hayashi-mini-label">Export</p>
          <h2>Bounce to WAV</h2>
        </div>
        <button className="hayashi-icon-button" type="button" onClick={toggleExportPanel} aria-label="Close">
          <X size={16} />
        </button>
      </div>
      <div className="p-4 space-y-4">
        <p className="text-sm opacity-80">Renders the current scene as a stereo WAV file.</p>
        <button className="hayashi-action w-full justify-center" type="button" onClick={handleExport} disabled={exporting}>
          <Waves size={14} />
          {exporting ? `Exporting… ${progress}%` : 'Export Master Loop'}
        </button>
        {error && (
          <p className="text-sm" style={{ color: 'var(--hayashi-red)' }}>{error}</p>
        )}
      </div>
    </section>
  );
}
