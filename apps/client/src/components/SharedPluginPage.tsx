import { useEffect, useMemo, useState } from 'react';
import { SignedIn, SignedOut, SignInButton } from '@clerk/clerk-react';
import { ArrowRight, Crown, Eye, Loader2, Lock, Sparkles } from 'lucide-react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { loadSharedPlugin, type PluginThread, type SharedPluginPayload } from '@/lib/faustGenerator';
import { PluginPreview } from './PluginPreview';
import { usePluginStore, type GeneratedPlugin } from '@/stores/pluginStore';
import {
  HeroDitheringActions,
  HeroDitheringBadges,
  HeroDitheringContainer,
  HeroDitheringContent,
  HeroDitheringDescription,
  HeroDitheringHeading,
  HeroDitheringMobileVisual,
  HeroDitheringRoot,
  HeroDitheringVisual,
} from '@/components/ui/hero-dithering';

function readSharedPluginId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('plugin');
}

function toGeneratedPlugin(thread: PluginThread): GeneratedPlugin {
  const currentVersion = thread.versions[0] ?? null;
  return {
    id: thread.id,
    name: thread.name,
    prompt: currentVersion?.prompt ?? thread.messages.at(-1)?.content ?? thread.name,
    status: 'ready',
    type: thread.type as GeneratedPlugin['type'],
    params: currentVersion?.params ?? [],
    faustCode: currentVersion?.faustCode ?? '',
    wasmUrl: null,
    createdAt: thread.createdAt,
    uiSpec: currentVersion?.uiSpec,
    versions: thread.versions.map((version) => ({
      id: version.id,
      versionNumber: version.versionNumber,
      prompt: version.prompt,
      faustCode: version.faustCode,
      params: version.params,
      qualityLabels: version.qualityLabels,
      createdAt: version.createdAt,
      uiSpec: version.uiSpec,
      features: version.features,
    })),
    messages: thread.messages,
    currentVersionId: currentVersion?.id ?? null,
    previewMode: thread.type === 'effect' ? 'loop' : 'loop',
    previewSampleName: null,
    previewSampleBuffer: null,
  };
}

function LoadingState() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4efdf] px-6 text-[#10261d]">
      <div className="rounded-[28px] border border-[#183324]/10 bg-[rgba(255,252,245,0.92)] px-8 py-7 text-center shadow-[0_24px_70px_rgba(16,38,29,0.10)]">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#d48c2e]" />
        <div className="mt-4 text-sm font-semibold uppercase tracking-[0.18em] text-[#7d876d]">Loading shared effect</div>
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4efdf] px-6 text-[#10261d]">
      <div className="max-w-lg rounded-[32px] border border-[#183324]/10 bg-[rgba(255,252,245,0.94)] p-8 shadow-[0_24px_70px_rgba(16,38,29,0.10)]">
        <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#9a6a32]">Share unavailable</div>
        <h1 className="mt-4 text-3xl font-black tracking-[-0.05em]">This effect link is not available.</h1>
        <p className="mt-3 text-sm leading-7 text-[#45604b]">{message}</p>
        <Button
          className="mt-6 rounded-full border-0 px-5 text-xs font-bold tracking-[0.18em] text-[#0f170f]"
          style={{ background: 'linear-gradient(135deg, #f3a95f 0%, #d48c2e 100%)' }}
          onClick={() => { window.location.href = '/'; }}
        >
          Back to Hayashi
        </Button>
      </div>
    </div>
  );
}

export function SharedPluginPage() {
  const [payload, setPayload] = useState<SharedPluginPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const setPlugins = usePluginStore((s) => s.setPlugins);
  const plugin = usePluginStore((s) => s.plugins.find((item) => item.id === s.activePluginId));

  const pluginId = useMemo(() => readSharedPluginId(), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!pluginId) {
        setError('Missing `plugin` query parameter.');
        setLoading(false);
        return;
      }

      try {
        const next = await loadSharedPlugin(pluginId);
        if (cancelled) return;
        setPayload(next);
        setPlugins([toGeneratedPlugin(next.plugin)]);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load shared effect');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [pluginId, setPlugins]);

  if (loading) return <LoadingState />;
  if (error || !payload || !plugin) return <ErrorState message={error ?? 'The shared effect could not be loaded.'} />;

  const ownerName = payload.owner.name || 'A Hayashi creator';
  const versionCount = payload.plugin.versions.length;
  const latestVersionNumber = payload.plugin.versions[0]?.versionNumber ?? 1;

  return (
    <TooltipProvider>
      <div className="min-h-screen overflow-x-hidden bg-[#f4efdf] text-[#10261d]">
        <div className="mx-auto max-w-[1480px] px-4 pb-16 pt-5 sm:px-6 lg:px-8 lg:pt-8">
          <div className="mb-5 flex items-center justify-between gap-3">
            <button type="button" className="flex items-center gap-2.5" onClick={() => { window.location.href = '/'; }}>
              <img src="/hayashi-logo.png" alt="Hayashi" className="h-8 w-8 rounded object-contain" />
              <span className="text-sm font-bold tracking-[0.15em] text-[#10261d]">HAYASHI</span>
            </button>
            <div className="flex items-center gap-2">
              <SignedOut>
                <SignInButton>
                  <Button
                    variant="outline"
                    className="rounded-full border-[#183324]/12 bg-white/70 px-4 text-xs font-bold tracking-[0.16em] text-[#294232]"
                  >
                    <Lock className="mr-1.5 h-3.5 w-3.5" /> Sign In
                  </Button>
                </SignInButton>
              </SignedOut>
              <SignedIn>
                <Button
                  className="rounded-full border-0 px-4 text-xs font-bold tracking-[0.16em] text-[#0f170f]"
                  style={{ background: 'linear-gradient(135deg, #f3a95f 0%, #d48c2e 100%)' }}
                  onClick={() => { window.location.href = '/'; }}
                >
                  <Crown className="mr-1.5 h-3.5 w-3.5" /> Open Workspace
                </Button>
              </SignedIn>
            </div>
          </div>

          <HeroDitheringRoot>
            <HeroDitheringContainer>
              <HeroDitheringContent>
                <HeroDitheringHeading
                  eyebrow={
                    <span className="flex items-center gap-2">
                      <Eye className="h-3.5 w-3.5" />
                      Public effect share
                    </span>
                  }
                  heading={
                    <>
                      {ownerName}
                      <br />
                      wants you to
                      <br />
                      view this effect:
                      <br />
                      <span className="text-[#49633c]">{payload.plugin.name}</span>
                    </>
                  }
                  description="This is a live public preview. You can audition the patch, inspect the generated Faust source, switch versions, and test the same playback modes the creator uses inside Hayashi."
                />

                <HeroDitheringBadges>
                  <Badge variant="outline" className="h-8 rounded-full border-[#183324]/14 bg-white/60 px-3 text-[11px] font-semibold text-[#294232]">
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Live preview
                  </Badge>
                  <Badge variant="outline" className="h-8 rounded-full border-[#183324]/14 bg-[#f3ecd7] px-3 text-[11px] font-semibold text-[#56763c] capitalize">
                    {payload.plugin.type}
                  </Badge>
                  <Badge variant="outline" className="h-8 rounded-full border-[#183324]/14 bg-white/60 px-3 text-[11px] font-semibold text-[#294232]">
                    {versionCount} version{versionCount === 1 ? '' : 's'}
                  </Badge>
                  <Badge variant="outline" className="h-8 rounded-full border-[#183324]/14 bg-white/60 px-3 text-[11px] font-semibold text-[#294232]">
                    v{latestVersionNumber} current
                  </Badge>
                </HeroDitheringBadges>

                <HeroDitheringDescription>
                  <div className="grid gap-3 text-sm text-[#38503d] sm:grid-cols-2">
                    <div className="rounded-[22px] border border-[#183324]/10 bg-[rgba(255,252,245,0.68)] p-4 shadow-[0_14px_34px_rgba(16,38,29,0.06)]">
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7d876d]">Shared by</div>
                      <div className="mt-2 text-base font-semibold text-[#10261d]">{ownerName}</div>
                    </div>
                    <div className="rounded-[22px] border border-[#183324]/10 bg-[rgba(255,252,245,0.68)] p-4 shadow-[0_14px_34px_rgba(16,38,29,0.06)]">
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7d876d]">Patch title</div>
                      <div className="mt-2 text-base font-semibold text-[#10261d]">{payload.plugin.name}</div>
                    </div>
                  </div>
                </HeroDitheringDescription>

                <HeroDitheringActions className="flex flex-wrap items-center gap-3">
                  <Button
                    className="rounded-full border-0 px-5 text-xs font-bold tracking-[0.18em] text-[#0f170f]"
                    style={{ background: 'linear-gradient(135deg, #f3a95f 0%, #d48c2e 100%)' }}
                    onClick={() => document.getElementById('shared-preview')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  >
                    Preview The Effect <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-full border-[#183324]/12 bg-white/70 px-5 text-xs font-bold tracking-[0.16em] text-[#294232]"
                    onClick={() => { window.location.href = '/'; }}
                  >
                    Open Hayashi
                  </Button>
                </HeroDitheringActions>
              </HeroDitheringContent>

              <HeroDitheringVisual
                imageSrc={payload.owner.imageUrl ?? '/hayashi-logo.png'}
                speed={0.18}
                className="[&_.absolute]:will-change-transform"
              />
            </HeroDitheringContainer>
            <HeroDitheringMobileVisual imageSrc={payload.owner.imageUrl ?? '/hayashi-logo.png'} speed={0.18} />
          </HeroDitheringRoot>

          <section id="shared-preview" className="mt-8">
            <div className="mb-4 flex items-center justify-between gap-3 px-1">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#7d876d]">Public preview</div>
                <div className="mt-1 text-sm text-[#45604b]">Audition the patch, inspect the code, and move through the current version stack.</div>
              </div>
            </div>
            <PluginPreview onRefine={() => undefined} refining={false} publicMode />
          </section>
        </div>
      </div>
    </TooltipProvider>
  );
}
