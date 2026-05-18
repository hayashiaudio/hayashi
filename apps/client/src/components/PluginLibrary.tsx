import { usePluginStore } from '@/stores/pluginStore';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { ChevronRight, LifeBuoy } from 'lucide-react';

const C = {
  border: 'rgba(255,255,255,0.06)',
  accent: '#ff8c61',
  text: '#e5e5e5',
  textMuted: '#737373',
  textDim: '#525252',
  void: '#0a0a0a',
} as const;

function clampLines(lines: number) {
  return {
    display: '-webkit-box',
    WebkitLineClamp: lines,
    WebkitBoxOrient: 'vertical' as const,
    overflow: 'hidden',
  };
}

export interface SupportArchiveItem {
  id: string;
  title: string;
  status: 'open' | 'blocked' | 'closed';
  contextSummary: string | null;
  updatedAt: number;
}

interface PluginLibraryProps {
  supportArchive?: {
    threads: SupportArchiveItem[];
    activeThreadId: string | null;
    loading: boolean;
    onSelect: (threadId: string) => void;
  };
}

export function PluginLibrary({ supportArchive }: PluginLibraryProps) {
  const { plugins, activePluginId } = usePluginStore();

  const recentPrompts = plugins
    .flatMap((p) => p.messages.filter((m) => m.role === 'user').map((m) => m.content))
    .slice(0, 5);

  if (supportArchive) {
    return (
      <aside
        className="w-full lg:w-[320px] xl:w-[348px] flex flex-col flex-shrink-0"
        style={{
          borderRight: `1px solid ${C.border}`,
          borderBottom: `1px solid ${C.border}`,
          background: '#111111',
        }}
      >
        <div className="px-4 sm:px-5 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <LifeBuoy className="h-4 w-4 text-[#ff8c61]" />
            <span className="text-[11px] sm:text-[12px] font-bold tracking-[0.16em] text-[#8a8a8a]">SUPPORT ARCHIVE</span>
          </div>
          <Badge variant="outline" className="h-8 min-w-[2.5rem] px-3 text-[11px] border-[#525252] text-[#a8a8a8] rounded-full">
            {supportArchive.threads.length}
          </Badge>
        </div>
        <Separator className="bg-[rgba(255,255,255,0.06)]" />
        <ScrollArea className="flex-1 hayashi-scroll max-h-[38vh] lg:max-h-none">
          <div className="p-3 sm:p-4 space-y-3">
            {supportArchive.threads.map((thread) => (
              <Card
                key={thread.id}
                className="rounded-[20px] border shadow-none cursor-pointer transition-all duration-200 hover:border-[rgba(255,140,97,0.20)]"
                style={{
                  borderColor: supportArchive.activeThreadId === thread.id ? 'rgba(255,140,97,0.34)' : 'rgba(255,255,255,0.08)',
                  background: supportArchive.activeThreadId === thread.id
                    ? 'linear-gradient(180deg, rgba(255,140,97,0.14), rgba(255,140,97,0.06))'
                    : 'linear-gradient(180deg, rgba(255,255,255,0.02), rgba(10,10,10,0.92))',
                  boxShadow: supportArchive.activeThreadId === thread.id ? '0 18px 42px rgba(0,0,0,0.24)' : 'none',
                }}
                onClick={() => supportArchive.onSelect(thread.id)}
              >
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-mono font-bold text-[12px] leading-snug text-[#f1ece4]" style={{ overflowWrap: 'anywhere', ...clampLines(2) }}>
                        {thread.title}
                      </div>
                      <div className="text-[11px] text-[#8a8a8a] mt-1.5 leading-snug break-words" style={{ overflowWrap: 'anywhere', ...clampLines(3) }}>
                        {thread.contextSummary ?? 'No context summary yet.'}
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className="h-5 px-2 text-[9px] rounded-full border-[#ff8c61]/20 bg-transparent text-[#ffb08f]"
                    >
                      {thread.status}
                    </Badge>
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.14em] text-[#6f6f6f]">
                    {new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(thread.updatedAt)}
                  </div>
                </CardContent>
              </Card>
            ))}
            {!supportArchive.threads.length && !supportArchive.loading && (
              <div className="text-[11px] text-[#525252] text-center py-10">No support threads yet. Start one from the composer.</div>
            )}
          </div>
        </ScrollArea>
        <div className="px-4 sm:px-5 py-4 border-t hidden lg:block" style={{ borderColor: C.border }}>
          <span className="text-[10px] font-bold tracking-[0.14em] text-[#525252] block mb-3">THREAD CONTEXT</span>
          <div className="text-[10px] leading-5 text-[#686868]">
            Open a thread to review its running context summary and continue the mirrored Discord conversation.
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside
      className="w-full lg:w-[320px] xl:w-[348px] flex flex-col flex-shrink-0"
      style={{
        borderRight: `1px solid ${C.border}`,
        borderBottom: `1px solid ${C.border}`,
        background: '#111111',
      }}
    >
      <div className="px-4 sm:px-5 py-4 flex items-center justify-between gap-3">
        <span className="text-[11px] sm:text-[12px] font-bold tracking-[0.16em] text-[#737373]">YOUR PLUGINS</span>
        <Badge variant="outline" className="h-8 min-w-[2.5rem] px-3 text-[11px] border-[#525252] text-[#a8a8a8] rounded-full">
          {plugins.length}
        </Badge>
      </div>
      <Separator className="bg-[rgba(255,255,255,0.06)]" />
      <ScrollArea className="flex-1 hayashi-scroll max-h-[38vh] lg:max-h-none">
        <div className="p-3 sm:p-4 space-y-3">
          {plugins.map((plugin) => (
            <Card
              key={plugin.id}
              className="rounded-[20px] border shadow-none cursor-pointer transition-all duration-200 hover:border-[rgba(255,140,97,0.20)]"
              style={{
                borderColor: activePluginId === plugin.id ? 'rgba(255,140,97,0.34)' : 'rgba(255,255,255,0.08)',
                background: activePluginId === plugin.id
                  ? 'linear-gradient(180deg, rgba(255,140,97,0.14), rgba(255,140,97,0.06))'
                  : 'linear-gradient(180deg, rgba(255,255,255,0.02), rgba(10,10,10,0.92))',
                boxShadow: activePluginId === plugin.id ? '0 18px 42px rgba(0,0,0,0.24)' : 'none',
              }}
              onClick={() => window.dispatchEvent(new CustomEvent('hayashi:navigate-plugin', { detail: { pluginId: plugin.id } }))}
            >
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div
                      className="font-mono text-[12px] sm:text-[13px] font-bold text-[#f1ece4] leading-snug break-words"
                      style={{ overflowWrap: 'anywhere', ...clampLines(2) }}
                    >
                      {plugin.name}
                    </div>
                    <div
                      className="text-[11px] text-[#6f6f6f] mt-1.5 leading-snug break-words"
                      style={{ overflowWrap: 'anywhere', ...clampLines(2) }}
                    >
                      {plugin.prompt}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0 pt-0.5">
                    {plugin.status === 'generating' ? (
                      <>
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#f5a623] animate-pulse" />
                        <span className="text-[10px] text-[#8a8a8a]">Generating</span>
                      </>
                    ) : (
                      <>
                        <Badge variant="outline" className="h-5 px-2 text-[9px] border-[#34c759]/30 text-[#34c759] rounded-full flex-shrink-0">Ready</Badge>
                        {plugin.versions.length > 1 && (
                          <Badge variant="outline" className="h-5 px-2 text-[9px] border-[#ff8c61]/30 text-[#ffb08f] rounded-full">v{plugin.versions.length}</Badge>
                        )}
                      </>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-1">
                  {plugin.params.slice(0, 3).map((p) => (
                    <span key={p.name} className="text-[10px] font-mono text-[#686868]">
                      {p.name} {p.value.toFixed(1)}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
          {plugins.length === 0 && (
            <div className="text-[11px] text-[#525252] text-center py-10">No plugins yet. Generate one above.</div>
          )}
        </div>
      </ScrollArea>
      <div className="px-4 sm:px-5 py-4 border-t hidden lg:block" style={{ borderColor: C.border }}>
        <span className="text-[10px] font-bold tracking-[0.14em] text-[#525252] block mb-3">RECENT PROMPTS</span>
        <div className="space-y-2">
          {recentPrompts.length > 0 ? (
            recentPrompts.map((line, i) => (
              <div key={i} className="flex items-start gap-1.5 text-[10px] text-[#616161] font-mono leading-snug">
                <ChevronRight className="h-3 w-3 mt-0.5 flex-shrink-0 text-[#5ac8fa]" />
                <span className="break-words" style={{ overflowWrap: 'anywhere', ...clampLines(2) }}>{line}</span>
              </div>
            ))
          ) : (
            <div className="text-[10px] text-[#525252]">No prompts yet.</div>
          )}
        </div>
      </div>
    </aside>
  );
}
