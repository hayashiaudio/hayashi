import { useState, useEffect, useRef } from 'react';
import { SignedIn, SignedOut, SignInButton, UserButton, useUser } from '@clerk/clerk-react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PluginLibrary } from './PluginLibrary';
import { PluginPreview } from './PluginPreview';
import { BuildQueuePanel } from './BuildQueuePanel';
import { CommandPalette } from './CommandPalette';
import { MidiConnectModal } from './modals/MidiConnectModal';
import { BtConnectModal } from './modals/BtConnectModal';
import { UsbConnectModal } from './modals/UsbConnectModal';
import { parseCommand } from '@/lib/commandParser';
import { createPlugin, iteratePlugin, listPluginThreads, pollPluginUntilReady } from '@/lib/faustGenerator';
import { listBuilds } from '@/lib/api';
import { useClerkToken } from '@/hooks/useClerkToken';
import { useAudioAnalysis } from '@/hooks/useAudioAnalysis';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Terminal, Sparkles, Lock, Crown } from 'lucide-react';
import { usePluginStore } from '@/stores/pluginStore';
import { useBuildStore } from '@/stores/buildStore';
import { useSessionStore } from '@/stores/sessionStore';
import { useProjectStore } from '@/stores/projectStore';
import {
  HeroDitheringActions,
  HeroDitheringContainer,
  HeroDitheringContent,
  HeroDitheringDescription,
  HeroDitheringHeading,
  HeroDitheringMobileVisual,
  HeroDitheringRoot,
  HeroDitheringVisual,
} from '@/components/ui/hero-dithering';
import { buildPluginPath, parsePluginRoute, type PluginRoute } from '@/lib/pluginRoutes';
import type { PluginVersion, PluginParam } from '@/stores/pluginStore';

const C = {
  void: '#0a0a0a',
  panel: '#111111',
  border: 'rgba(255,255,255,0.06)',
  text: '#e5e5e5',
  textMuted: '#737373',
  accent: '#ff8c61',
  cyan: '#5ac8fa',
} as const;

const GENERATION_PROGRESS_STAGES = [
  '> temporal workflow accepted. waiting for worker pickup...',
  '> worker is running candidate generation...',
  '> compile checks are in progress...',
  '> audio/quality evaluation is still running...',
  '> finalizing the selected candidate...',
] as const;

function compactPromptLabel(value: string) {
  return value.trim().slice(0, 56) || 'New plugin';
}

function getDiscordUserId(user: unknown): string | null {
  const externalAccounts = (user as { externalAccounts?: Array<{ provider?: string; providerUserId?: string }> } | null)?.externalAccounts ?? [];
  const account = externalAccounts.find((item) => item.provider === 'discord' || item.provider === 'oauth_discord');
  return account?.providerUserId ?? null;
}

function isBackgroundGenerationTimeout(error: unknown) {
  return error instanceof Error && error.message.includes('Temporal workflow may still complete in the background');
}

function GenerationFocusCard({
  plugin,
  refining,
}: {
  plugin: { name: string; prompt: string; type: string; status: 'generating' | 'ready' | 'error' };
  refining: boolean;
}) {
  return (
    <div className="w-full max-w-2xl mx-auto mb-8 px-4 animate-slide-up">
      <div
        className="rounded-[28px] border overflow-hidden"
        style={{
          borderColor: C.border,
          background:
            'radial-gradient(circle at top left, rgba(255,140,97,0.16), transparent 28%), linear-gradient(180deg, #121212 0%, #0b0b0b 100%)',
          boxShadow: '0 30px 80px rgba(0,0,0,0.35)',
        }}
      >
        <div className="px-6 py-5 border-b flex items-center justify-between gap-3" style={{ borderColor: C.border }}>
          <div className="min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-[10px] uppercase tracking-[0.28em] text-[#ff8c61] font-bold">
                {refining ? 'Refining Patch' : 'Generating Patch'}
              </span>
              <Badge variant="outline" className="h-5 text-[10px] border-[#525252] text-[#737373] rounded-full capitalize">
                {plugin.type}
              </Badge>
            </div>
            <h2 className="text-xl font-bold text-[#f3f3f3] truncate">{plugin.name}</h2>
            <p className="text-xs font-mono text-[#737373] mt-2 max-w-xl">{plugin.prompt}</p>
          </div>
          <div className="flex items-center gap-2 rounded-full px-3 py-1.5 border" style={{ borderColor: 'rgba(255,140,97,0.22)' }}>
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#ff8c61] animate-pulse" />
            <span className="text-[11px] font-bold tracking-[0.12em] text-[#ffb193] uppercase">Engine Working</span>
          </div>
        </div>

        <div className="grid gap-4 px-6 py-6 md:grid-cols-[1.4fr_0.9fr]">
          <div className="rounded-2xl border p-4" style={{ borderColor: C.border, background: 'rgba(255,255,255,0.02)' }}>
            <div className="text-[10px] uppercase tracking-[0.24em] text-[#525252] font-bold mb-3">Pipeline</div>
            <div className="space-y-3">
              {[
                'Queue workflow on Temporal',
                'Generate multiple candidate specs',
                'Compile and evaluate winning patch',
                'Load preview and controls',
              ].map((item, index) => (
                <div key={item} className="flex items-center gap-3">
                  <div
                    className="h-7 w-7 rounded-full border flex items-center justify-center text-[10px] font-bold"
                    style={{
                      borderColor: index < 2 ? 'rgba(255,140,97,0.28)' : C.border,
                      color: index < 2 ? '#ff8c61' : '#737373',
                      background: index < 2 ? 'rgba(255,140,97,0.08)' : 'transparent',
                    }}
                  >
                    {index + 1}
                  </div>
                  <span className="text-sm text-[#d4d4d4]">{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border p-4" style={{ borderColor: C.border, background: '#0a0a0a' }}>
            <div className="text-[10px] uppercase tracking-[0.24em] text-[#525252] font-bold mb-3">When Ready</div>
            <div className="space-y-3 text-sm text-[#9b9b9b]">
              <p>The full preview UI stays hidden until the winning version is finished.</p>
              <p>Once generation completes, controls, waveform preview, export, and refine all fade in together.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PluginGenerator() {
  const [prompt, setPrompt] = useState('');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [midiOpen, setMidiOpen] = useState(false);
  const [btOpen, setBtOpen] = useState(false);
  const [usbOpen, setUsbOpen] = useState(false);
  const sessionLocked = useSessionStore((s) => s.locked);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [refiningId, setRefiningId] = useState<string | null>(null);
  const [streamText, setStreamText] = useState('');
  const [route, setRoute] = useState<PluginRoute>(() => parsePluginRoute(window.location.pathname));
  const progressTimerRef = useRef<number | null>(null);
  const { selectedStyle, setSelectedStyle, addPlugin, updatePluginStatus, activePluginId, setActivePlugin, setPlugins } = usePluginStore();
  const builds = useBuildStore((s) => s.builds);
  const setBuilds = useBuildStore((s) => s.setBuilds);
  const showToast = useProjectStore((s) => s.showToast);
  const activePlugin = usePluginStore((s) => s.plugins.find((p) => p.id === s.activePluginId));

  const { getToken } = useClerkToken();
  const { user } = useUser();
  const analysis = useAudioAnalysis(true);
  const discordUserId = getDiscordUserId(user);

  const appendStreamLine = (line: string) => {
    setStreamText((prev) => `${prev}${prev.endsWith('\n') || prev.length === 0 ? '' : '\n'}${line}\n`);
  };

  const navigateToPath = (path: string, replace = false) => {
    if (replace) {
      window.history.replaceState({}, '', path);
    } else {
      window.history.pushState({}, '', path);
    }
    setRoute(parsePluginRoute(path));
  };

  const navigateHome = () => navigateToPath('/');
  const navigateToPricing = () => {
    const base = '/pricing';
    const next = user?.id ? `${base}?userId=${encodeURIComponent(user.id)}` : base;
    window.location.href = next;
  };
  const navigateToSupport = () => {
    const params = new URLSearchParams();
    if (discordUserId) params.set('userId', discordUserId);
    const query = params.toString();
    window.location.href = query ? `/chat?${query}` : '/chat';
  };

  const navigateToPlugin = (pluginId: string, pluginName: string, replace = false) => {
    navigateToPath(buildPluginPath(pluginId, pluginName), replace);
  };

  const stopProgressUpdates = () => {
    if (progressTimerRef.current) {
      window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  };

  const startProgressUpdates = (mode: 'generate' | 'refine') => {
    stopProgressUpdates();
    let stageIndex = 0;
    let waitingLogged = false;
    const stages = mode === 'generate'
      ? GENERATION_PROGRESS_STAGES
      : [
          '> temporal refinement workflow accepted. waiting for worker pickup...',
          '> worker is applying instruction deltas...',
          '> compile checks are in progress...',
          '> validating the revised patch...',
          '> finalizing the next version...',
        ] as const;

    progressTimerRef.current = window.setInterval(() => {
      if (stageIndex >= stages.length) {
        if (!waitingLogged) {
          appendStreamLine('> waiting for Temporal to return the completed version...');
          waitingLogged = true;
        }
        stopProgressUpdates();
        return;
      }
      appendStreamLine(stages[stageIndex]);
      stageIndex += 1;
    }, 4500);
  };

  useEffect(() => () => stopProgressUpdates(), []);

  useEffect(() => {
    const handlePopState = () => setRoute(parsePluginRoute(window.location.pathname));
    const handlePluginNavigate = (event: Event) => {
      const customEvent = event as CustomEvent<{ pluginId?: string }>;
      const pluginId = customEvent.detail?.pluginId;
      if (!pluginId) return;
      const plugin = usePluginStore.getState().plugins.find((item) => item.id === pluginId);
      if (!plugin) return;
      navigateToPlugin(plugin.id, plugin.name);
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('hayashi:navigate-plugin', handlePluginNavigate as EventListener);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('hayashi:navigate-plugin', handlePluginNavigate as EventListener);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const token = await getToken();
      if (!token) return;

      try {
        const threads = await listPluginThreads(token);
        if (cancelled) return;

        setPlugins(
          threads.map((thread) => ({
            id: thread.id,
            name: thread.name,
            prompt: thread.messages.find((message) => message.role === 'user')?.content ?? thread.versions[0]?.prompt ?? thread.name,
            status: 'ready' as const,
            type: thread.type as 'synth' | 'effect' | 'percussion',
            params: thread.versions[0]?.params.map((param) => ({
              ...param,
              value: typeof param.value === 'number' ? param.value : param.min,
            })) ?? [],
            faustCode: thread.versions[0]?.faustCode ?? '',
            wasmUrl: null,
            createdAt: thread.createdAt,
            uiSpec: thread.versions[0]?.uiSpec,
            versions: thread.versions.map((version) => ({
              id: version.id,
              versionNumber: version.versionNumber,
              prompt: version.prompt,
              faustCode: version.faustCode,
              params: version.params.map((param) => ({
                ...param,
                value: typeof param.value === 'number' ? param.value : param.min,
              })),
              qualityLabels: version.qualityLabels ?? [],
              createdAt: version.createdAt,
              uiSpec: version.uiSpec,
            })),
            messages: thread.messages,
            currentVersionId: thread.versions[0]?.id ?? null,
          }))
        );
      } catch (err) {
        console.error('[Hayashi] Failed to load plugin threads:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [getToken, setPlugins]);

  useEffect(() => {
    let cancelled = false;
    let intervalId: number | null = null;

    const refreshBuilds = async () => {
      const token = await getToken();
      if (!token) return;
      try {
        const nextBuilds = await listBuilds(token);
        if (!cancelled) setBuilds(nextBuilds);
      } catch (err) {
        console.error('[Hayashi] Failed to load builds:', err);
      }
    };

    void refreshBuilds();
    intervalId = window.setInterval(() => {
      void refreshBuilds();
    }, 2500);

    return () => {
      cancelled = true;
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [getToken, setBuilds]);

  useEffect(() => {
    if (route.kind !== 'plugin' || !route.pluginId) return;
    const plugin = usePluginStore.getState().plugins.find((item) => item.id === route.pluginId);
    if (!plugin) return;
    if (activePluginId !== plugin.id) {
      setActivePlugin(plugin.id);
    }
    const canonicalPath = buildPluginPath(plugin.id, plugin.name);
    if (window.location.pathname !== canonicalPath) {
      navigateToPath(canonicalPath, true);
    }
  }, [route, activePluginId, setActivePlugin, usePluginStore]);

  const handleSubmit = async () => {
    if (generatingId) return;

    const parsed = parseCommand(prompt);
    if (parsed.command === 'connect' && parsed.target) {
      if (parsed.target === 'midi') setMidiOpen(true);
      if (parsed.target === 'bluetooth') setBtOpen(true);
      if (parsed.target === 'usb') setUsbOpen(true);
      setPrompt('');
      return;
    }

    if (!prompt.trim()) return;
    const token = await getToken();
    if (!token) {
      alert('Please sign in to generate plugins');
      return;
    }

    const id = `plugin-${Date.now()}`;
    addPlugin({
      id,
      name: compactPromptLabel(prompt),
      prompt: prompt.trim(),
      status: 'generating',
      type: 'synth',
      params: [],
      faustCode: '',
      wasmUrl: null,
      createdAt: Date.now(),
      versions: [],
      messages: [],
      currentVersionId: null,
    });
    setActivePlugin(id);
    navigateToPlugin(id, compactPromptLabel(prompt));
    setPrompt('');
    setGeneratingId(id);
    setStreamText(`> prompt: "${prompt.trim()}"\n> creating plugin row...\n`);

    try {
      const result = await createPlugin(token, prompt.trim());

      // If Temporal is running generation async, poll until the version appears
      if (result.status === 'generating') {
        appendStreamLine(`> queued on Temporal as ${result.pluginId}`);
        startProgressUpdates('generate');
        const thread = await pollPluginUntilReady(getToken, result.pluginId, {
          maxAttempts: 300,
          minVersionCount: 1,
          minVersionNumber: 1,
          onHeartbeat: (attempt, thread) => {
            if (attempt > 0 && attempt % 30 === 0 && thread?.generationStatus !== 'failed') {
              appendStreamLine('> still running. checking Temporal workflow status...');
            }
          },
        });
        stopProgressUpdates();
        const latestVersion = thread.versions[0];
        if (!latestVersion) throw new Error('Generation completed but no version was found');

        const version: PluginVersion = {
          id: latestVersion.id,
          versionNumber: latestVersion.versionNumber,
          prompt: prompt.trim(),
          faustCode: latestVersion.faustCode,
          params: latestVersion.params,
          qualityLabels: [],
          createdAt: Date.now(),
          uiSpec: latestVersion.uiSpec,
          features: {
            centroid: analysis.centroid,
            rms: analysis.rms,
            zcr: analysis.zcr,
            peakDb: analysis.peakDb,
          },
        };
        appendStreamLine('> worker completed successfully.');
        setStreamText((prev) => `${prev}> generated Faust code:\n\n${latestVersion.faustCode}\n\n> preview ready.\n`);
        usePluginStore.setState((s) => ({
          plugins: s.plugins.map((p) =>
            p.id === id ? {
              ...p,
              faustCode: latestVersion.faustCode,
              name: thread.name.slice(0, 24),
              type: thread.type as 'synth' | 'effect' | 'percussion',
              params: latestVersion.params,
              uiSpec: latestVersion.uiSpec,
              status: 'ready' as const,
              versions: [version],
              currentVersionId: version.id,
              messages: [
                { id: `msg-${Date.now()}-user`, role: 'user' as const, content: prompt.trim(), createdAt: Date.now() },
                { id: `msg-${Date.now()}-assistant`, role: 'assistant' as const, content: latestVersion.faustCode, versionId: version.id, createdAt: Date.now() },
              ],
            } : p
          ),
        }));
      } else {
        // Inline (blocking) generation — result is already complete
        appendStreamLine('> running inline generation...');
        const version: PluginVersion = {
          id: result.versionId!,
          versionNumber: 1,
          prompt: prompt.trim(),
          faustCode: result.faustCode!,
          params: result.params!,
          qualityLabels: [],
          createdAt: Date.now(),
          uiSpec: result.uiSpec,
          features: {
            centroid: analysis.centroid,
            rms: analysis.rms,
            zcr: analysis.zcr,
            peakDb: analysis.peakDb,
          },
        };
        setStreamText((prev) => `${prev}> generated Faust code:\n\n${result.faustCode}\n\n> preview ready.\n`);
        usePluginStore.setState((s) => ({
          plugins: s.plugins.map((p) =>
            p.id === id ? {
              ...p,
              faustCode: result.faustCode!,
              name: result.name!.slice(0, 24),
              type: result.type! as 'synth' | 'effect' | 'percussion',
              params: result.params!,
              uiSpec: result.uiSpec,
              status: 'ready' as const,
              versions: [version],
              currentVersionId: version.id,
              messages: [
                { id: `msg-${Date.now()}-user`, role: 'user' as const, content: prompt.trim(), createdAt: Date.now() },
                { id: `msg-${Date.now()}-assistant`, role: 'assistant' as const, content: result.faustCode!, versionId: version.id, createdAt: Date.now() },
              ],
            } : p
          ),
        }));
      }
    } catch (err) {
      stopProgressUpdates();
      const message = err instanceof Error ? err.message : 'Generation failed';
      if (isBackgroundGenerationTimeout(err)) {
        appendStreamLine('> still running after the live polling window. it may finish in the background.');
        showToast(message, 'info');
      } else {
        updatePluginStatus(id, 'error');
        appendStreamLine('> error: generation failed');
        showToast(message, 'error');
        alert(message);
      }
      console.error('[Hayashi] Generation failed:', err);
    } finally {
      stopProgressUpdates();
      setGeneratingId(null);
    }
  };

  const handleRefine = async (instruction: string) => {
    const plugin = usePluginStore.getState().plugins.find((p) => p.id === activePluginId);
    const token = await getToken();
    if (!plugin || !token) return;

    setRefiningId(plugin.id);
    appendStreamLine(`> refine: "${instruction}"`);
    appendStreamLine('> preparing next version...');

    try {
      const result = await iteratePlugin(token, plugin.id, instruction);

      let latestVersion: { id: string; versionNumber: number; faustCode: string; params: PluginParam[]; uiSpec?: PluginVersion['uiSpec'] };

      if (result.status === 'generating') {
        appendStreamLine('> queued refinement on Temporal');
        startProgressUpdates('refine');
        const currentVersionNumber = plugin.versions[0]?.versionNumber ?? 0;
        const thread = await pollPluginUntilReady(getToken, plugin.id, {
          maxAttempts: 300,
          minVersionCount: plugin.versions.length + 1,
          minVersionNumber: currentVersionNumber + 1,
          onHeartbeat: (attempt, thread) => {
            if (attempt > 0 && attempt % 30 === 0 && thread?.generationStatus !== 'failed') {
              appendStreamLine('> refinement still running. checking Temporal workflow status...');
            }
          },
        });
        stopProgressUpdates();
        const v = thread.versions[0];
        if (!v) throw new Error('Refinement completed but no version was found');
        latestVersion = v;
      } else {
        latestVersion = {
          id: result.versionId!,
          versionNumber: result.versionNumber!,
          faustCode: result.faustCode!,
          params: result.params!,
          uiSpec: result.uiSpec,
        };
      }

      const version: PluginVersion = {
        id: latestVersion.id,
        versionNumber: latestVersion.versionNumber,
        prompt: instruction,
        faustCode: latestVersion.faustCode,
        params: latestVersion.params,
        qualityLabels: [],
        createdAt: Date.now(),
        uiSpec: latestVersion.uiSpec,
        features: {
          centroid: analysis.centroid,
          rms: analysis.rms,
          zcr: analysis.zcr,
          peakDb: analysis.peakDb,
        },
      };

      usePluginStore.setState((s) => ({
        plugins: s.plugins.map((p) =>
          p.id === plugin.id
            ? {
                ...p,
                faustCode: latestVersion.faustCode,
                params: latestVersion.params,
                uiSpec: latestVersion.uiSpec,
                status: 'ready' as const,
                versions: [version, ...p.versions],
                currentVersionId: version.id,
                messages: [
                  ...p.messages,
                  { id: `msg-${Date.now()}-user`, role: 'user' as const, content: instruction, createdAt: Date.now() },
                  { id: `msg-${Date.now()}-assistant`, role: 'assistant' as const, content: latestVersion.faustCode, versionId: version.id, createdAt: Date.now() },
                ],
              }
            : p
        ),
      }));

      appendStreamLine(`> refinement complete. v${latestVersion.versionNumber} ready.`);
    } catch (err) {
      stopProgressUpdates();
      const message = err instanceof Error ? err.message : 'Iteration failed';
      if (isBackgroundGenerationTimeout(err)) {
        appendStreamLine('> refinement is still running in the background.');
        showToast(message, 'info');
      } else {
        appendStreamLine('> error: iteration failed');
        showToast(message, 'error');
        alert(message);
      }
      console.error('[Hayashi] Iteration failed:', err);
    } finally {
      stopProgressUpdates();
      setRefiningId(null);
    }
  };

  const [typedStream, setTypedStream] = useState('');
  const streamRef = useRef('');
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (streamText === streamRef.current) return;
    const full = streamText;
    const already = streamRef.current;
    let i = already.length;
    streamRef.current = full;

    function tick() {
      if (i < full.length) {
        i += 1;
        setTypedStream(full.slice(0, i));
        const variance = Math.random() * 30 - 15;
        timerRef.current = window.setTimeout(tick, Math.max(8, 18 + variance));
      }
    }
    tick();
    return () => { if (timerRef.current) window.clearTimeout(timerRef.current); };
  }, [streamText]);

  const showGenerationFocus = !!activePlugin && activePlugin.status === 'generating';
  const isHomeRoute = route.kind === 'home';
  const isPluginRoute = route.kind === 'plugin';

  return (
    <TooltipProvider delayDuration={200}>
    <div className="flex flex-col h-screen w-screen overflow-hidden" style={{ background: C.void, color: C.text, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <style>{`
        @keyframes slide-up { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes waveform-bounce { 0%,100% { transform: scaleY(0.6); } 50% { transform: scaleY(1); } }
        .animate-slide-up { animation: slide-up 0.5s cubic-bezier(0.22,1,0.36,1) forwards; }
        .hayashi-scroll::-webkit-scrollbar { width: 5px; }
        .hayashi-scroll::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 3px; }
      `}</style>

      {/* Header */}
      <header className="flex items-center h-14 px-3 sm:px-5 gap-3 sm:gap-4 flex-shrink-0 z-20" style={{ borderBottom: `1px solid ${C.border}` }}>
        <div className="flex items-center gap-2.5">
          <button type="button" className="flex items-center gap-2.5" onClick={navigateHome}>
            <img src="/hayashi-logo.png" alt="Hayashi" className="h-7 w-7 rounded object-contain" />
            <span className="text-sm font-bold tracking-[0.15em] hidden sm:inline-block">HAYASHI</span>
          </button>
          <Badge variant="outline" className="ml-2 h-5 text-[10px] border-[#ff8c61]/30 text-[#ff8c61] rounded-full">BETA</Badge>
        </div>
        <div className="flex-1" />
        <div className="hidden md:flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-8 text-xs font-medium text-[#737373] hover:text-[#e5e5e5] hover:bg-white/5 rounded-md" onClick={navigateHome}>Generate</Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs font-medium text-[#737373] hover:text-[#e5e5e5] hover:bg-white/5 rounded-md"
            onClick={() => {
              if (activePlugin) navigateToPlugin(activePlugin.id, activePlugin.name);
            }}
            disabled={!activePlugin}
          >
            Workspace
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs font-medium text-[#737373] hover:text-[#e5e5e5] hover:bg-white/5 rounded-md"
            onClick={navigateToSupport}
          >
            Support
          </Button>
        </div>
        <div className="flex-1" />
        <Button variant="outline" size="sm" className="h-8 text-[11px] border-[#d48c2e]/30 text-[#a05b1d] hover:bg-[#d48c2e]/10 rounded-md gap-1.5 px-3 bg-[#fff7e8]" onClick={navigateToPricing}>
          <Crown className="h-3.5 w-3.5" /> Upgrade
        </Button>
        <SignedIn>
          <UserButton appearance={{ elements: { userButtonAvatarBox: 'h-7 w-7' } }} />
        </SignedIn>
        <SignedOut>
          <SignInButton>
            <Button size="sm" className="h-8 text-xs font-bold rounded-md gap-1.5" style={{ background: C.accent, color: '#0a0a0a', border: 'none' }}>
              <Lock className="h-3.5 w-3.5" /> Sign In
            </Button>
          </SignInButton>
        </SignedOut>
      </header>

      {/* Body */}
      <div className="flex flex-col lg:flex-row flex-1 min-h-0 overflow-hidden">
        <PluginLibrary />
        <main className="flex-1 overflow-auto hayashi-scroll relative">
          {isHomeRoute && (
            <div className="px-4 pb-8 pt-6 sm:px-6 lg:px-8">
              <HeroDitheringRoot className="animate-slide-up">
                <HeroDitheringContainer>
                  <HeroDitheringContent>
                    <HeroDitheringHeading
                      eyebrow="Faust Plugin Lab"
                      heading={
                        <>
                          HAYASHI
                          <br />
                          ENGINE
                        </>
                      }
                      description="Describe a sound. Generate a Faust DSP DAW plugin. Preview it in the browser and export an importable bundle when it is ready."
                    />

                    <HeroDitheringDescription />

                    <HeroDitheringActions>
                      <div className="w-full max-w-3xl rounded-[28px] border border-[#183324]/14 bg-[rgba(251,249,242,0.88)] p-1 shadow-[0_24px_60px_rgba(16,38,29,0.12)] backdrop-blur-md transition-all duration-300 focus-within:border-[rgba(212,140,46,0.28)]">
                        <SignedIn>
                          <div className="flex items-start gap-3 p-4 sm:p-5">
                            <Terminal className="mt-0.5 h-5 w-5 flex-shrink-0 text-[#56763c]" />
                            <textarea
                              value={prompt}
                              onChange={(e) => setPrompt(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
                              placeholder={sessionLocked ? 'Session expired. Signing out...' : 'e.g. "warm analog pad with slow attack and chorus"'}
                              spellCheck={false}
                              disabled={sessionLocked}
                              className="flex-1 resize-none bg-transparent text-sm font-mono text-[#10261d] outline-none placeholder:text-[rgba(16,38,29,0.38)] sm:text-base"
                              style={{ caretColor: '#d48c2e', minHeight: 24, maxHeight: 120 }}
                              rows={1}
                            />
                          </div>
                          <div className="flex flex-col gap-3 border-t border-[#183324]/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full border border-[#183324]/10 bg-white/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#556b4e]">
                                Enter to generate
                              </span>
                              <span className="rounded-full border border-[#d48c2e]/14 bg-[#fbf3e7] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#a05b1d]">
                                VST3 + CLAP export
                              </span>
                            </div>
                            <Button
                              onClick={handleSubmit}
                              disabled={sessionLocked || !prompt.trim() || generatingId !== null}
                              size="sm"
                              className="h-11 self-start rounded-2xl border-0 px-5 text-xs font-bold tracking-[0.2em] text-[#0f170f] shadow-[0_18px_30px_rgba(212,140,46,0.22)] disabled:opacity-30 sm:self-auto"
                              style={{ background: 'linear-gradient(135deg, #f3a95f 0%, #d48c2e 100%)' }}
                            >
                              <Sparkles className="h-3.5 w-3.5" /> GENERATE
                            </Button>
                          </div>
                        </SignedIn>
                        <SignedOut>
                          <div className="flex items-start gap-3 p-4 sm:p-5">
                            <Terminal className="mt-0.5 h-5 w-5 flex-shrink-0 text-[#56763c]" />
                            <div className="flex-1 text-sm font-mono text-[rgba(16,38,29,0.42)] sm:text-base">
                              e.g. "warm analog pad with slow attack and chorus"
                            </div>
                          </div>
                          <div className="flex flex-col gap-3 border-t border-[#183324]/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                            <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
                              <span className="rounded-full border border-[#183324]/10 bg-white/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#556b4e]">
                                Sign in to generate
                              </span>
                              <span className="text-[11px] text-[rgba(16,38,29,0.58)]">
                                Create an account to start building custom instruments.
                              </span>
                            </div>
                            <SignInButton>
                              <Button
                                size="sm"
                                className="h-11 self-start rounded-2xl border-0 px-5 text-xs font-bold tracking-[0.2em] text-[#0f170f] shadow-[0_18px_30px_rgba(212,140,46,0.22)] sm:self-auto"
                                style={{ background: 'linear-gradient(135deg, #f3a95f 0%, #d48c2e 100%)' }}
                              >
                                <Lock className="h-3.5 w-3.5" /> Sign In
                              </Button>
                            </SignInButton>
                          </div>
                        </SignedOut>
                      </div>

                      <div className="mt-4 max-w-4xl rounded-[30px] border border-[#183324]/10 bg-[linear-gradient(180deg,rgba(255,252,245,0.78),rgba(245,239,223,0.52))] px-5 py-5 shadow-[0_18px_44px_rgba(16,38,29,0.08)]">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                          <div>
                            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#7d876d]">Supported DAWs</div>
                            <div className="mt-1 text-sm text-[#66725b]">Export importable plugin bundles for the hosts most people actually use.</div>
                          </div>
                          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9aa28c]">Built for real host workflows</div>
                        </div>
                        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-4 lg:gap-x-8">
                          {[
                            {
                              name: 'FL Studio',
                              icon: 'https://upload.wikimedia.org/wikipedia/en/6/69/FL_Studio_11_just_logo.png',
                            },
                            {
                              name: 'Ableton Live',
                              icon: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS49qJ4O94_19quKreG91qHUfI91-H7b85CSA&s',
                            },
                            {
                              name: 'Reason',
                              icon: 'https://upload.wikimedia.org/wikipedia/commons/6/67/Reason_Software_Logo.png?utm_source=commons.wikimedia.org&utm_campaign=index&utm_content=original',
                            },
                            {
                              name: 'Bitwig',
                              icon: 'https://dl.flathub.org/media/com/bitwig/BitwigStudio/eda5ca313649147ffa0a36ffb0e6bf9f/icons/128x128@2/com.bitwig.BitwigStudio.png',
                            },
                          ].map((daw) => (
                            <div key={daw.name} className="group flex items-center gap-3">
                              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-white/78 ring-1 ring-[#183324]/8 shadow-[0_10px_22px_rgba(16,38,29,0.08)] transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:scale-[1.03]">
                                <img
                                  src={daw.icon}
                                  alt={`${daw.name} icon`}
                                  className="h-8 w-8 object-contain"
                                  loading="lazy"
                                  referrerPolicy="no-referrer"
                                />
                              </div>
                              <span className="text-[14px] font-bold tracking-[-0.02em] text-[#294232]">
                                {daw.name}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <span className="mr-1 text-[10px] font-bold uppercase tracking-[0.24em] text-[#556b4e]">Preview Style</span>
                        {[
                          { id: 'disco', label: 'Disco', bpm: 123 },
                          { id: 'trap', label: 'Trap', bpm: 140 },
                          { id: 'house', label: 'House', bpm: 128 },
                          { id: 'ambient', label: 'Ambient', bpm: 90 },
                        ].map((style) => (
                          <button
                            key={style.id}
                            onClick={() => setSelectedStyle(style.id)}
                            className="rounded-full border px-3 py-2 text-[11px] font-semibold transition-all duration-200"
                            style={{
                              color: selectedStyle === style.id ? '#10261d' : 'rgba(16,38,29,0.68)',
                              borderColor: selectedStyle === style.id ? 'rgba(212,140,46,0.28)' : 'rgba(24,51,36,0.12)',
                              background: selectedStyle === style.id ? 'rgba(255,245,223,0.96)' : 'rgba(255,255,255,0.55)',
                              boxShadow: selectedStyle === style.id ? '0 12px 28px rgba(212,140,46,0.16)' : '0 8px 18px rgba(16,38,29,0.04)',
                            }}
                          >
                            {style.label} <span className="ml-1 opacity-55">{style.bpm}</span>
                          </button>
                        ))}
                      </div>
                    </HeroDitheringActions>
                  </HeroDitheringContent>

                  <HeroDitheringVisual />
                </HeroDitheringContainer>
                <HeroDitheringMobileVisual />
              </HeroDitheringRoot>
            </div>
          )}

          {isPluginRoute && (
            <div className="px-4 pt-6 sm:px-6 lg:px-8">
              <div className="mx-auto mb-6 flex max-w-6xl items-center justify-between gap-4 rounded-[24px] border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] px-4 py-3 animate-slide-up">
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#525252]">Plugin Workspace</div>
                  <div className="mt-1 text-sm text-[#d6d6d6]">
                    {activePlugin ? activePlugin.name : 'Select a plugin from the sidebar to continue.'}
                  </div>
                </div>
                <Button
                  size="sm"
                  className="h-10 rounded-xl border-0 px-4 text-xs font-bold tracking-[0.16em] text-[#0f170f]"
                  style={{ background: 'linear-gradient(135deg, #f3a95f 0%, #d48c2e 100%)' }}
                  onClick={navigateHome}
                >
                  <Sparkles className="h-3.5 w-3.5" /> NEW PROMPT
                </Button>
              </div>
            </div>
          )}

          <BuildQueuePanel builds={builds} />

          {isPluginRoute && (generatingId || streamText) && (
            <div className="w-full max-w-4xl mx-auto mb-8 px-4 sm:px-6 lg:px-8 animate-slide-up">
              <div className="rounded-2xl border overflow-hidden" style={{ borderColor: C.border, background: C.void }}>
              <div className="flex items-center gap-2 px-4 py-2 border-b" style={{ borderColor: C.border, background: C.panel }}>
                <Terminal className="h-3.5 w-3.5 text-[#525252]" />
                <span className="text-[10px] font-bold tracking-wider text-[#525252]" style={{ fontFamily: "'VT323', monospace" }}>HAYASHI ENGINE</span>
                {generatingId && <span className="ml-auto inline-block w-1.5 h-1.5 rounded-full bg-[#34c759] animate-pulse" />}
              </div>
              <div className="p-4">
                <pre className="text-[11px] font-mono leading-relaxed whitespace-pre-wrap break-words" style={{ color: '#e5e5e5', overflowWrap: 'anywhere' }}>
                  {typedStream}
                  {generatingId && <span className="inline-block w-2 h-4 align-middle bg-[#ff8c61] ml-0.5 animate-pulse" />}
                </pre>
              </div>
            </div>
            </div>
          )}

          {isPluginRoute && showGenerationFocus && (
            <GenerationFocusCard
              plugin={activePlugin}
              refining={refiningId === activePluginId}
            />
          )}

          {isPluginRoute ? (
            activePlugin ? (
              <PluginPreview onRefine={handleRefine} refining={refiningId === activePluginId} />
            ) : (
              <div className="px-4 pb-12 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-4xl rounded-[28px] border border-[rgba(255,255,255,0.06)] bg-[#111111] p-8 text-center text-[#737373]">
                  This plugin is not available in the current library.
                </div>
              </div>
            )
          ) : null}
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onSelect={(cmd, target) => {
        if (cmd === 'connect') {
          if (target === 'midi') setMidiOpen(true);
          if (target === 'bluetooth') setBtOpen(true);
          if (target === 'usb') setUsbOpen(true);
        }
      }} />
      <MidiConnectModal open={midiOpen} onClose={() => setMidiOpen(false)} />
      <BtConnectModal open={btOpen} onClose={() => setBtOpen(false)} />
      <UsbConnectModal open={usbOpen} onClose={() => setUsbOpen(false)} />
    </div>
    </TooltipProvider>
  );
}
