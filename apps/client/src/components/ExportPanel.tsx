import { useState, useCallback, useMemo } from 'react';
import {
  X,
  Download,
  FileMusic,
  Layers,
  Music,
  FileJson,
  Check,
  AlertCircle,
  ChevronRight,
} from 'lucide-react';
import { useProjectStore } from '@/stores/projectStore';
import { useTransport } from '@/hooks/useTransport';
import { SERVER_BASE_URL } from '@/lib/constants';
import { openExternalUrl } from '@/hooks/useDiscordSdk';
import { authorizeExport } from '@/lib/api';
import { collectProjectSnapshot } from '@/export/projectSnapshot';
import { getExportFormat, listExportFormats } from '@/export/exportRegistry';
import type { ExportFormatId, ExportProgress } from '@/export/types';

const COLORS = {
  cream: '#f5f0e8',
  forest: '#0d2818',
  forestLight: '#1a3a2a',
  orange: '#e8843c',
  sage: '#8fb359',
  muted: '#555555',
};

const FORMAT_ICONS: Record<ExportFormatId, React.ReactNode> = {
  stems: <Layers size={16} />,
  midi: <FileMusic size={16} />,
  reaper: <Music size={16} />,
  ableton: <Music size={16} />,
  json: <FileJson size={16} />,
};

function formatFilename(title: string, ext: string): string {
  const clean = title.replace(/[^a-zA-Z0-9\-_ ]/g, '').replace(/\s+/g, '-').toLowerCase();
  return `${clean || 'hayashi-project'}.${ext}`;
}

export function ExportPanel() {
  const toggleExportPanel = useProjectStore((s) => s.toggleExportPanel);
  const projectTitle = useProjectStore((s) => s.projectTitle);
  const channelId = useProjectStore((s) => s.channelId);
  const guildId = useProjectStore((s) => s.guildId);
  const accessToken = useProjectStore((s) => s.accessToken);
  const tracks = useProjectStore((s) => s.tracks);
  const setBillingSnapshot = useProjectStore((s) => s.setBillingSnapshot);
  const openPaywall = useProjectStore((s) => s.openPaywall);
  const { bpm } = useTransport();

  const [selectedFormat, setSelectedFormat] = useState<ExportFormatId>('stems');
  const [selectedTracks, setSelectedTracks] = useState<Set<string>>(new Set(Object.keys(tracks)));
  const [bitDepth, setBitDepth] = useState<16 | 24>(16);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const formats = useMemo(() => listExportFormats(), []);
  const currentFormat = useMemo(() => getExportFormat(selectedFormat), [selectedFormat]);

  const trackList = useMemo(() => Object.values(tracks), [tracks]);

  const toggleTrack = useCallback((trackId: string) => {
    setSelectedTracks((prev) => {
      const next = new Set(prev);
      if (next.has(trackId)) next.delete(trackId);
      else next.add(trackId);
      return next;
    });
  }, []);

  const handleExport = useCallback(async () => {
    if (!accessToken) {
      setError('Not authenticated with Discord.');
      return;
    }
    setExporting(true);
    setProgress({ phase: 'collecting', message: 'Collecting project data…', percent: 5 });
    setError(null);

    try {
      // Billing check
      const snapshot = await authorizeExport({ accessToken, guildId, channelId });
      setBillingSnapshot(snapshot);
      if (!snapshot.contextAccess.allowed) {
        openPaywall(
          snapshot.contextAccess.reason ?? 'export_limit',
          snapshot.contextAccess.message ?? 'Upgrade required to export.'
        );
        return;
      }

      // Check format-specific billing
      if (currentFormat.requiresBilling && snapshot.plan !== 'unlimited') {
        openPaywall('export_limit', `${currentFormat.name} export requires the Unlimited plan.`);
        return;
      }

      setProgress({ phase: 'collecting', message: 'Building project snapshot…', percent: 10 });
      const projectSnapshot = collectProjectSnapshot();

      const options = {
        format: selectedFormat,
        bitDepth,
        includeMaster: true,
        trackIds: selectedFormat === 'stems' || selectedFormat === 'reaper' || selectedFormat === 'ableton'
          ? Array.from(selectedTracks)
          : undefined,
      };

      setProgress({ phase: 'rendering', message: `Generating ${currentFormat.name}…`, percent: 25 });

      const blob = await currentFormat.generate(projectSnapshot, options);

      setProgress({ phase: 'done', message: 'Uploading for download…', percent: 100 });

      // Upload to server so we can break out of the iframe sandbox
      const uploadRes = await fetch(`${SERVER_BASE_URL}/assets/upload`, {
        method: 'POST',
        body: blob,
      });
      if (!uploadRes.ok) {
        const body = await uploadRes.text().catch(() => 'no body');
        console.error('[Hayashi] Upload failed:', uploadRes.status, uploadRes.statusText, body);
        throw new Error(`Upload failed (${uploadRes.status}): ${body.slice(0, 200)}`);
      }
      const { assetId } = (await uploadRes.json()) as { assetId: string };

      const downloadFilename = formatFilename(projectTitle, currentFormat.extension);
      const downloadUrl = `${SERVER_BASE_URL}/download?asset=${encodeURIComponent(assetId)}&filename=${encodeURIComponent(downloadFilename)}`;
      await openExternalUrl(downloadUrl);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Export failed';
      setError(msg);
      setProgress({ phase: 'error', message: msg, percent: 0 });
    } finally {
      setExporting(false);
    }
  }, [
    accessToken, bpm, channelId, currentFormat, guildId, openPaywall,
    projectTitle, selectedFormat, selectedTracks, bitDepth, setBillingSnapshot
  ]);

  return (
    <section
      className="hayashi-mockup-panel hayashi-export-panel max-w-md w-full"
      style={{ maxHeight: '85vh', overflowY: 'auto' }}
    >
      {/* Header */}
      <div className="hayashi-panel-title-row">
        <div>
          <p className="hayashi-mini-label">Export</p>
          <h2>Handoff to DAW</h2>
        </div>
        <button className="hayashi-icon-button" type="button" onClick={toggleExportPanel} aria-label="Close">
          <X size={16} />
        </button>
      </div>

      <div className="p-4 space-y-5">
        {/* Format Tabs */}
        <div className="flex flex-wrap gap-2">
          {formats.map((fmt) => {
            const active = fmt.id === selectedFormat;
            return (
              <button
                key={fmt.id}
                type="button"
                onClick={() => setSelectedFormat(fmt.id)}
                disabled={exporting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200"
                style={{
                  background: active ? COLORS.forest : 'rgba(13,40,24,0.05)',
                  color: active ? COLORS.cream : COLORS.forest,
                  border: active ? 'none' : '1px solid rgba(13,40,24,0.08)',
                }}
              >
                {FORMAT_ICONS[fmt.id]}
                {fmt.name}
                {fmt.requiresBilling && (
                  <span
                    className="ml-0.5 px-1 rounded text-[9px] uppercase tracking-wider"
                    style={{ background: active ? COLORS.orange : 'rgba(232,132,60,0.15)', color: active ? COLORS.cream : COLORS.orange }}
                  >
                    Pro
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Format Description */}
        <p className="text-xs" style={{ color: COLORS.muted }}>
          {currentFormat.description}
          {currentFormat.isZip && ' (packaged as ZIP)'}
        </p>

        {/* Stems-specific options */}
        {(selectedFormat === 'stems' || selectedFormat === 'reaper' || selectedFormat === 'ableton') && (
          <div className="space-y-3">
            {/* Bit Depth */}
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold" style={{ color: COLORS.forest }}>
                Bit depth:
              </span>
              <div className="flex gap-2">
                {[16, 24].map((bd) => (
                  <button
                    key={bd}
                    type="button"
                    onClick={() => setBitDepth(bd as 16 | 24)}
                    disabled={exporting}
                    className="px-2.5 py-1 rounded-md text-xs font-medium transition-all"
                    style={{
                      background: bitDepth === bd ? COLORS.forest : 'transparent',
                      color: bitDepth === bd ? COLORS.cream : COLORS.muted,
                      border: '1px solid rgba(13,40,24,0.12)',
                    }}
                  >
                    {bd}-bit
                  </button>
                ))}
              </div>
            </div>

            {/* Track Selection */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold" style={{ color: COLORS.forest }}>
                  Tracks to export
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const all = new Set(Object.keys(tracks));
                    setSelectedTracks(all.size === selectedTracks.size ? new Set() : all);
                  }}
                  disabled={exporting}
                  className="text-[10px] font-semibold uppercase tracking-wider transition-colors hover:opacity-70"
                  style={{ color: COLORS.sage }}
                >
                  {selectedTracks.size === trackList.length ? 'Deselect all' : 'Select all'}
                </button>
              </div>
              <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                {trackList.map((track) => (
                  <label
                    key={track.id}
                    className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors hover:bg-[rgba(13,40,24,0.03)]"
                  >
                    <div
                      className="w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors"
                      style={{
                        borderColor: selectedTracks.has(track.id) ? COLORS.forest : 'rgba(13,40,24,0.15)',
                        background: selectedTracks.has(track.id) ? COLORS.forest : 'transparent',
                      }}
                    >
                      {selectedTracks.has(track.id) && <Check size={10} style={{ color: COLORS.cream }} />}
                    </div>
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={selectedTracks.has(track.id)}
                      onChange={() => toggleTrack(track.id)}
                      disabled={exporting}
                    />
                    <span className="text-xs font-medium truncate" style={{ color: COLORS.forest }}>
                      {track.name || 'Untitled Track'}
                    </span>
                    {track.muted && (
                      <span className="text-[9px] px-1 py-0.5 rounded-full" style={{ background: 'rgba(199,91,91,0.08)', color: '#b8563d' }}>
                        Muted
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Progress */}
        {progress && progress.phase !== 'idle' && progress.phase !== 'done' && progress.phase !== 'error' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span style={{ color: COLORS.muted }}>{progress.message}</span>
              <span className="font-mono font-semibold" style={{ color: COLORS.forest }}>
                {progress.percent}%
              </span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(13,40,24,0.06)' }}>
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${progress.percent}%`,
                  background: COLORS.sage,
                }}
              />
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 rounded-lg p-3 text-sm" style={{ background: 'rgba(199,91,91,0.06)', border: '1px solid rgba(199,91,91,0.15)' }}>
            <AlertCircle size={14} className="mt-0.5 flex-shrink-0" style={{ color: '#b8563d' }} />
            <span style={{ color: '#b8563d' }}>{error}</span>
          </div>
        )}

        {/* Success state */}
        {progress?.phase === 'done' && (
          <div className="flex items-center gap-2 rounded-lg p-3 text-sm" style={{ background: 'rgba(143,179,89,0.08)', border: '1px solid rgba(143,179,89,0.2)' }}>
            <Check size={14} style={{ color: COLORS.sage }} />
            <span style={{ color: COLORS.forest }}>Downloaded {formatFilename(projectTitle, currentFormat.extension)}</span>
          </div>
        )}

        {/* Export Button */}
        <button
          className="hayashi-action w-full justify-center"
          type="button"
          onClick={handleExport}
          disabled={exporting || selectedTracks.size === 0}
          style={{
            opacity: exporting || selectedTracks.size === 0 ? 0.6 : 1,
          }}
        >
          {exporting ? (
            <>
              <Layers size={14} className="animate-pulse" />
              Exporting…
            </>
          ) : (
            <>
              <Download size={14} />
              Export {currentFormat.name}
              <ChevronRight size={14} />
            </>
          )}
        </button>
      </div>
    </section>
  );
}
