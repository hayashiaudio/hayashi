import { usePluginStore } from '@/stores/pluginStore';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { ChevronRight } from 'lucide-react';

const C = {
  border: 'rgba(255,255,255,0.06)',
  accent: '#ff8c61',
  text: '#e5e5e5',
  textMuted: '#737373',
  textDim: '#525252',
  void: '#0a0a0a',
} as const;

export function PluginLibrary() {
  const { plugins, activePluginId, setActivePlugin } = usePluginStore();

  const recentPrompts = plugins
    .flatMap((p) => p.messages.filter((m) => m.role === 'user').map((m) => m.content))
    .slice(0, 5);

  return (
    <aside
      className="w-[280px] flex flex-col flex-shrink-0"
      style={{ borderRight: `1px solid ${C.border}`, background: '#111111' }}
    >
      <div className="px-4 py-3 flex items-center justify-between">
        <span className="text-[11px] font-bold tracking-[0.12em] text-[#737373]">YOUR PLUGINS</span>
        <Badge variant="outline" className="h-5 text-[10px] border-[#525252] text-[#737373] rounded-full">
          {plugins.length}
        </Badge>
      </div>
      <Separator className="bg-[rgba(255,255,255,0.06)]" />
      <ScrollArea className="flex-1 hayashi-scroll">
        <div className="p-3 space-y-2">
          {plugins.map((plugin) => (
            <Card
              key={plugin.id}
              className="rounded-lg border shadow-none cursor-pointer transition-all duration-200 hover:border-[rgba(255,140,97,0.20)]"
              style={{
                borderColor: activePluginId === plugin.id ? 'rgba(255,140,97,0.30)' : C.border,
                background: activePluginId === plugin.id ? 'rgba(255,140,97,0.06)' : C.void,
              }}
              onClick={() => setActivePlugin(plugin.id)}
            >
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-mono text-[11px] font-bold text-[#e5e5e5] truncate">{plugin.name}</div>
                    <div className="text-[10px] text-[#525252] truncate mt-0.5">{plugin.prompt}</div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {plugin.status === 'generating' ? (
                      <>
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#f5a623] animate-pulse" />
                        <span className="text-[9px] text-[#737373]">Generating</span>
                      </>
                    ) : (
                      <>
                        <Badge variant="outline" className="h-4 text-[9px] border-[#34c759]/30 text-[#34c759] rounded-sm flex-shrink-0">Ready</Badge>
                        {plugin.versions.length > 1 && (
                          <Badge variant="outline" className="h-4 text-[9px] border-[#ff8c61]/30 text-[#ff8c61] rounded-sm">v{plugin.versions.length}</Badge>
                        )}
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-end gap-[2px] h-6">
                  {plugin.waveform.slice(0, 24).map((h, idx) => (
                    <div
                      key={idx}
                      className="w-[3px] rounded-full"
                      style={{
                        height: `${h}%`,
                        background: activePluginId === plugin.id ? C.accent : '#525252',
                        opacity: 0.4 + (idx % 3) * 0.2,
                        transition: 'background 0.2s',
                      }}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
          {plugins.length === 0 && (
            <div className="text-[11px] text-[#525252] text-center py-8">No plugins yet. Generate one above.</div>
          )}
        </div>
      </ScrollArea>
      <div className="px-4 py-3 border-t" style={{ borderColor: C.border }}>
        <span className="text-[10px] font-bold tracking-[0.12em] text-[#525252] block mb-2">RECENT PROMPTS</span>
        <div className="space-y-1.5">
          {recentPrompts.length > 0 ? (
            recentPrompts.map((line, i) => (
              <div key={i} className="flex items-start gap-1.5 text-[10px] text-[#525252] font-mono leading-snug">
                <ChevronRight className="h-3 w-3 mt-0.5 flex-shrink-0 text-[#5ac8fa]" />
                <span className="truncate">{line}</span>
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
