import { useState } from 'react';
import { useClerkToken } from '@/hooks/useClerkToken';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { runSmokeExport, type SmokeExportResult } from '@/lib/api';
import { Loader2, Zap, Hammer } from 'lucide-react';

const FORMATS = ['vst3', 'clap'] as const;
const CATEGORIES = ['parametric_eq', 'synth', 'reverb_space', 'delay_echo'] as const;

export function SmokeTestPage() {
  const { getToken, isSignedIn } = useClerkToken();
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('parametric_eq');
  const [prompt, setPrompt] = useState('warm airy vocal EQ with forward presence');
  const [pluginName, setPluginName] = useState('');
  const [format, setFormat] = useState<(typeof FORMATS)[number]>('vst3');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SmokeExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const token = await getToken();
      if (!token) {
        setError('Not signed in.');
        return;
      }
      const res = await runSmokeExport({
        token,
        category,
        prompt: prompt.trim(),
        format,
        pluginName: pluginName.trim() || undefined,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Smoke export failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e5e5e5] p-6 md:p-10">
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="flex items-center gap-3">
          <Zap className="w-6 h-6 text-[#ff8c61]" />
          <h1 className="text-2xl font-semibold tracking-tight">Smoke Test Export</h1>
          <Badge variant="outline" className="border-white/10 text-[#737373]">
            {category === 'synth'
              ? '/api/smoke/synth/export'
              : category === 'reverb_space'
                ? '/api/smoke/reverb-space/export'
                : category === 'delay_echo'
                  ? '/api/smoke/delay-echo/export'
                : '/api/smoke/parametric-eq/export'}
          </Badge>
        </div>

        {!isSignedIn && (
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm text-[#737373]">
            Sign in to run smoke tests.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <label className="text-sm text-[#737373]">Category</label>
            <div className="flex gap-2">
              {CATEGORIES.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setCategory(value);
                    setPrompt(
                      value === 'synth'
                        ? 'gliding stereo lead with vibrato and width'
                        : value === 'reverb_space'
                          ? 'dark modulated ambient reverb with bloom'
                          : value === 'delay_echo'
                            ? 'wide dark modulated delay with rhythmic repeats'
                          : 'warm airy vocal EQ with forward presence',
                    );
                  }}
                  className={
                    'flex-1 h-10 rounded-md border text-sm font-medium transition-colors ' +
                    (category === value
                      ? 'border-[#ff8c61] bg-[#ff8c61]/10 text-[#ff8c61]'
                      : 'border-white/10 bg-white/[0.03] text-[#737373] hover:border-white/20')
                  }
                >
                  {value === 'synth' ? 'Synth' : value === 'reverb_space' ? 'Reverb Space' : value === 'delay_echo' ? 'Delay Echo' : 'Parametric EQ'}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-[#737373]">Prompt</label>
            <textarea
              value={prompt}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setPrompt(e.target.value)}
              placeholder={
                category === 'synth'
                  ? 'Describe the synth you want...'
                  : category === 'reverb_space'
                    ? 'Describe the reverb you want...'
                    : category === 'delay_echo'
                      ? 'Describe the delay you want...'
                    : 'Describe the EQ you want...'
              }
              className="w-full min-h-[80px] rounded-md bg-white/[0.03] border border-white/10 px-3 py-2 text-sm text-[#e5e5e5] placeholder:text-[#525252] focus:outline-none focus:ring-2 focus:ring-[#ff8c61]/50"
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm text-[#737373]">Plugin Name (optional)</label>
              <Input
                value={pluginName}
                onChange={(e) => setPluginName(e.target.value)}
                placeholder={
                  category === 'synth'
                    ? 'SmokeStereoLead'
                    : category === 'reverb_space'
                      ? 'SmokeDarkVerb'
                      : category === 'delay_echo'
                        ? 'SmokeWideDelay'
                      : 'SmokeEqVocal'
                }
                className="bg-white/[0.03] border-white/10 text-[#e5e5e5] placeholder:text-[#525252]"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-[#737373]">Format</label>
              <div className="flex gap-2">
                {FORMATS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFormat(f)}
                    className={
                      'flex-1 h-10 rounded-md border text-sm font-medium transition-colors ' +
                      (format === f
                        ? 'border-[#ff8c61] bg-[#ff8c61]/10 text-[#ff8c61]'
                        : 'border-white/10 bg-white/[0.03] text-[#737373] hover:border-white/20')
                    }
                  >
                    {f.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading || !isSignedIn}
            className="w-full h-11 bg-[#ff8c61] hover:bg-[#e67a50] text-white font-medium"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Running optimization + export…
              </>
            ) : (
              <>
                <Hammer className="w-4 h-4 mr-2" />
                Run Smoke Export
              </>
            )}
          </Button>
        </form>

        {error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {result && (
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge className="bg-emerald-500/10 text-emerald-300 border-emerald-500/20">202 Accepted</Badge>
                <span className="text-sm text-[#737373]">{result.pluginId}</span>
              </div>
              <span className="text-xs text-[#525252]">{result.versionId}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-xs text-[#525252]">Architecture</p>
                <p className="text-sm font-medium text-[#e5e5e5]">{result.optimizer.architectureId}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-[#525252]">Score</p>
                <p className="text-sm font-medium text-[#e5e5e5]">{result.optimizer.score.toFixed(3)}</p>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-[#525252]">Build</p>
              <pre className="text-xs text-[#737373] bg-black/30 rounded-md p-3 overflow-x-auto">
                {JSON.stringify(result.build, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
