import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle2, ChevronDown, Download, Hammer, Loader2, Package2, Terminal, UploadCloud } from 'lucide-react';
import { labelForBuildTarget, type BuildRecord, type BuildLogRecord } from '@/lib/api';
import { getBuildLogs } from '@/lib/api';
import { useClerkToken } from '@/hooks/useClerkToken';

const STAGE_LABELS: Record<BuildRecord['stage'], string> = {
  queued: 'Queued',
  preparing: 'Preparing',
  dispatching: 'Dispatching',
  building_dpf: 'Building DPF',
  building_ui: 'Building UI',
  packaging: 'Packaging',
  uploading: 'Uploading',
  completed: 'Completed',
  failed: 'Failed',
};

const STAGE_PROGRESS: Record<BuildRecord['stage'], number> = {
  queued: 8,
  preparing: 18,
  dispatching: 26,
  building_dpf: 52,
  building_ui: 72,
  packaging: 86,
  uploading: 94,
  completed: 100,
  failed: 100,
};

function stageIcon(stage: BuildRecord['stage']) {
  if (stage === 'completed') return <CheckCircle2 className="h-4 w-4" />;
  if (stage === 'failed') return <AlertTriangle className="h-4 w-4" />;
  if (stage === 'uploading') return <UploadCloud className="h-4 w-4" />;
  if (stage === 'packaging') return <Package2 className="h-4 w-4" />;
  if (stage === 'building_dpf' || stage === 'building_ui') return <Hammer className="h-4 w-4" />;
  return <Loader2 className="h-4 w-4 animate-spin" />;
}

function buildTitle(build: BuildRecord) {
  const pluginName = build.pluginName?.trim() || build.pluginId;
  const version = build.versionNumber ? `v${build.versionNumber}` : build.versionId;
  return `${pluginName} · ${version} · ${labelForBuildTarget(build.target)}`;
}

function buildSecondary(build: BuildRecord) {
  return build.statusMessage || build.errorMessage || STAGE_LABELS[build.stage];
}

function logLevelColor(level: BuildLogRecord['level']) {
  if (level === 'error') return '#ff6a55';
  if (level === 'warn') return '#ffb18f';
  return '#9b958e';
}

function formatDuration(ms: number): string {
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.round((ms % 60000) / 1000);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function LogEntry({ log }: { log: BuildLogRecord }) {
  const time = new Date(log.createdAt).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return (
    <div className="flex gap-2 text-[11px] leading-snug font-mono" style={{ fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace" }}>
      <span className="shrink-0 text-[#5c5650] select-none">{time}</span>
      {log.source && (
        <span className="shrink-0 text-[#6b655f] select-none">[{log.source}]</span>
      )}
      <span className="break-words" style={{ color: logLevelColor(log.level), overflowWrap: 'anywhere' }}>
        {log.message}
      </span>
    </div>
  );
}

export function BuildQueuePanel({ builds }: { builds: BuildRecord[] }) {
  const { getToken } = useClerkToken();
  const [expandedBuilds, setExpandedBuilds] = useState<Set<string>>(new Set());
  const [buildLogs, setBuildLogs] = useState<Record<string, BuildLogRecord[]>>({});
  const logEndRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [now, setNow] = useState(Date.now());

  const activeBuilds = useMemo(
    () => builds.filter((build) => build.status === 'queued' || build.status === 'running'),
    [builds],
  );
  const recentBuilds = useMemo(
    () => builds.filter((build) => build.status === 'completed' || build.status === 'failed').slice(0, 4),
    [builds],
  );

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const ids = Array.from(expandedBuilds);
    if (ids.length === 0) return;

    let cancelled = false;

    async function fetchLogs() {
      const token = await getToken();
      for (const buildId of ids) {
        try {
          const logs = await getBuildLogs(buildId, token);
          if (cancelled) return;
          setBuildLogs((prev) => {
            const existing = prev[buildId] ?? [];
            if (existing.length === logs.length) return prev;
            return { ...prev, [buildId]: logs };
          });
        } catch (err) {
          console.warn('[Hayashi] Failed to fetch build logs:', err);
        }
      }
    }

    fetchLogs();
    const interval = setInterval(fetchLogs, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [expandedBuilds, getToken]);

  useEffect(() => {
    for (const buildId of expandedBuilds) {
      const el = logEndRefs.current[buildId];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    }
  }, [buildLogs, expandedBuilds]);

  const toggleLogs = (buildId: string) => {
    setExpandedBuilds((prev) => {
      const next = new Set(prev);
      if (next.has(buildId)) {
        next.delete(buildId);
      } else {
        next.add(buildId);
      }
      return next;
    });
  };

  const renderBuild = (build: BuildRecord) => {
    const progress = STAGE_PROGRESS[build.stage];
    const failed = build.status === 'failed';
    const completed = build.status === 'completed';
    const running = build.status === 'running';
    const isExpanded = expandedBuilds.has(build.id);
    const logs = buildLogs[build.id] ?? [];
    const showLogsButton = build.status !== 'queued';
    const lastLog = logs[logs.length - 1];
    const lastLogAgo = lastLog ? Math.max(0, now - lastLog.createdAt) : null;

    return (
      <div
        key={build.id}
        className="rounded-[22px] border px-4 py-4 sm:px-5"
        style={{
          borderColor: failed ? 'rgba(255,106,85,0.22)' : 'rgba(255,255,255,0.08)',
          background: failed ? 'rgba(64,16,12,0.72)' : 'rgba(255,255,255,0.028)',
        }}
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.18em] ${failed ? 'text-[#ff8d79]' : completed ? 'text-[#7dd3a7]' : 'text-[#ffb18f]'}`}>
                {stageIcon(build.stage)}
                {STAGE_LABELS[build.stage]}
                {running && (
                  <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-[#34c759] animate-pulse" />
                )}
              </span>
              <Badge variant="outline" className="h-5 rounded-full border-[#3a3a3a] px-2.5 text-[10px] text-[#8e8e8e]">
                {labelForBuildTarget(build.target)}
              </Badge>
              {running && lastLogAgo !== null && (
                <span className="text-[10px] text-[#5c5650]">
                  last log {formatDuration(lastLogAgo)} ago
                </span>
              )}
            </div>
            <div className="text-sm sm:text-[15px] font-semibold text-[#f2eeea] break-words" style={{ overflowWrap: 'anywhere' }}>
              {buildTitle(build)}
            </div>
            <div className={`mt-2 text-xs sm:text-[13px] ${failed ? 'text-[#ff9f8f]' : 'text-[#9b958e]'}`}>
              {buildSecondary(build)}
            </div>
            {!completed && (
              <div className="mt-3 h-2 rounded-full bg-white/5 overflow-hidden">
                <div
                  className={`h-full rounded-full ${failed ? 'bg-[#ff6a55]' : 'bg-[#ff8c61]'}`}
                  style={{ width: `${progress}%`, transition: 'width 240ms ease' }}
                />
              </div>
            )}
            {failed && build.errorMessage && (
              <div className="mt-3 rounded-xl border border-[#ff6a55]/20 bg-[#180d0b] px-3 py-2 text-[11px] leading-relaxed text-[#ffb0a3]">
                {build.errorMessage}
              </div>
            )}
            {showLogsButton && (
              <button
                onClick={() => toggleLogs(build.id)}
                className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#7d756f] hover:text-[#ff8c61] transition-colors"
              >
                <Terminal className="h-3 w-3" />
                {isExpanded ? 'Hide build logs' : 'View build logs'}
                <ChevronDown className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
              </button>
            )}
            {isExpanded && (
              <div
                className="mt-3 rounded-xl border border-[#2a2a2a] bg-[#0d0d0d] overflow-hidden"
                style={{ maxHeight: 320 }}
              >
                <div className="px-3 py-2 border-b border-[#1a1a1a] flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#5c5650]">Compiler Output</span>
                  <span className="text-[10px] text-[#3a3a3a]">{logs.length} entries</span>
                </div>
                <div className="px-3 py-2 overflow-y-auto space-y-1" style={{ maxHeight: 260 }}>
                  {logs.length === 0 ? (
                    <div className="text-[11px] text-[#3a3a3a] font-mono py-4 text-center" style={{ fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace" }}>
                      Waiting for logs...
                    </div>
                  ) : (
                    logs.map((log) => <LogEntry key={log.id} log={log} />)
                  )}
                  <div ref={(el) => { logEndRefs.current[build.id] = el; }} />
                </div>
              </div>
            )}
          </div>
          {completed && build.downloadUrl && (
            <Button
              size="sm"
              className="h-10 rounded-xl px-4 text-[11px] font-bold gap-1.5 shrink-0"
              style={{ background: '#ff8c61', color: '#0a0a0a' }}
              onClick={() => window.open(build.downloadUrl!, '_blank', 'noopener,noreferrer')}
            >
              <Download className="h-3.5 w-3.5" />
              DOWNLOAD
            </Button>
          )}
        </div>
      </div>
    );
  };

  if (activeBuilds.length === 0 && recentBuilds.length === 0) return null;

  return (
    <section className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mb-8 animate-slide-up">
      <div
        className="rounded-[28px] border px-4 py-5 sm:px-6 sm:py-6"
        style={{
          borderColor: 'rgba(255,255,255,0.08)',
          background:
            'linear-gradient(180deg, rgba(17,17,17,0.96) 0%, rgba(10,10,10,0.98) 100%), radial-gradient(circle at top right, rgba(255,140,97,0.12), transparent 34%)',
        }}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between mb-5">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#6e655f]">Build Monitor</div>
            <h3 className="mt-2 text-xl sm:text-2xl font-bold text-[#f2eeea]">Native Export Queue</h3>
          </div>
          <div className="text-xs text-[#7d756f]">
            {activeBuilds.length > 0 ? `${activeBuilds.length} active build${activeBuilds.length === 1 ? '' : 's'}` : 'No active exports'}
          </div>
        </div>

        <div className="space-y-3">
          {activeBuilds.map(renderBuild)}
          {activeBuilds.length === 0 && recentBuilds.map(renderBuild)}
        </div>
      </div>
    </section>
  );
}
