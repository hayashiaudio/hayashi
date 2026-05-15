import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronUp, RotateCcw, User, Bot } from 'lucide-react';
import type { GeneratedPlugin } from '@/stores/pluginStore';

const C = {
  border: 'rgba(255,255,255,0.06)',
  accent: '#ff8c61',
  text: '#e5e5e5',
  textMuted: '#737373',
  textDim: '#525252',
  void: '#0a0a0a',
} as const;

interface PluginThreadProps {
  plugin: GeneratedPlugin;
  onRollback: (versionId: string) => void;
}

export function PluginThread({ plugin, onRollback }: PluginThreadProps) {
  const [expandedVersionId, setExpandedVersionId] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {plugin.messages.map((msg) => {
        const version = msg.role === 'assistant'
          ? plugin.versions.find((v) => v.id === msg.versionId)
          : null;

        return (
          <div key={msg.id} className="flex gap-3">
            <div className="flex-shrink-0 mt-0.5">
              {msg.role === 'user' ? (
                <User className="h-4 w-4 text-[#5ac8fa]" />
              ) : (
                <Bot className="h-4 w-4 text-[#ff8c61]" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              {msg.role === 'user' ? (
                <p className="text-sm text-[#e5e5e5]">{msg.content}</p>
              ) : version ? (
                <Card
                  className="rounded-lg border overflow-hidden"
                  style={{ borderColor: C.border, background: C.void }}
                >
                  <button
                    className="w-full flex items-center justify-between px-3 py-2 text-left"
                    onClick={() => setExpandedVersionId(expandedVersionId === version.id ? null : version.id)}
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="h-4 text-[9px] border-[#525252] text-[#737373] rounded-sm">
                        v{version.versionNumber}
                      </Badge>
                      <span className="text-[11px] text-[#737373] font-mono truncate">{version.prompt.slice(0, 40)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {plugin.currentVersionId === version.id && (
                        <Badge variant="outline" className="h-4 text-[9px] border-[#ff8c61]/30 text-[#ff8c61] rounded-sm">ACTIVE</Badge>
                      )}
                      {expandedVersionId === version.id ? (
                        <ChevronUp className="h-3.5 w-3.5 text-[#737373]" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 text-[#737373]" />
                      )}
                    </div>
                  </button>

                  {expandedVersionId === version.id && (
                    <div className="px-3 pb-3">
                      <pre className="text-[10px] font-mono leading-relaxed whitespace-pre-wrap overflow-auto max-h-[200px] hayashi-scroll p-2 rounded" style={{ background: C.void, color: '#e5e5e5' }}>
                        {version.faustCode}
                      </pre>
                      {version.features && (
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-[9px] font-mono text-[#525252]">
                            Centroid: {version.features.centroid.toFixed(0)}Hz · RMS: {(version.features.rms * 100).toFixed(1)}% · Peak: {version.features.peakDb.toFixed(1)}dB
                          </span>
                        </div>
                      )}
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex gap-1 flex-wrap">
                          {version.params.map((p) => (
                            <Badge key={p.name} variant="outline" className="h-4 text-[9px] border-[#525252] text-[#737373] rounded-sm">
                              {p.name}: {p.value.toFixed(2)}
                            </Badge>
                          ))}
                        </div>
                        {plugin.currentVersionId !== version.id && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-[10px] text-[#737373] hover:text-[#e5e5e5] gap-1"
                            onClick={() => onRollback(version.id)}
                          >
                            <RotateCcw className="h-3 w-3" /> Rollback
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </Card>
              ) : (
                <p className="text-sm text-[#737373]">Generated code</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
