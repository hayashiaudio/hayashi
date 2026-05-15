import { useState, useEffect, useRef } from 'react';
import { SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/clerk-react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PluginLibrary } from './PluginLibrary';
import { PluginPreview } from './PluginPreview';
import { CommandPalette } from './CommandPalette';
import { MidiConnectModal } from './modals/MidiConnectModal';
import { BtConnectModal } from './modals/BtConnectModal';
import { UsbConnectModal } from './modals/UsbConnectModal';
import { parseCommand } from '@/lib/commandParser';
import { generateFaust } from '@/lib/faustGenerator';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Terminal, Sparkles, Wand2, Code2, Lock } from 'lucide-react';
import { usePluginStore } from '@/stores/pluginStore';

const C = {
  void: '#0a0a0a',
  panel: '#111111',
  border: 'rgba(255,255,255,0.06)',
  text: '#e5e5e5',
  textMuted: '#737373',
  accent: '#ff8c61',
  cyan: '#5ac8fa',
} as const;

export default function PluginGenerator() {
  const [prompt, setPrompt] = useState('');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [midiOpen, setMidiOpen] = useState(false);
  const [btOpen, setBtOpen] = useState(false);
  const [usbOpen, setUsbOpen] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [streamText, setStreamText] = useState('');
  const { selectedStyle, setSelectedStyle, addPlugin, updatePluginStatus } = usePluginStore();

  const handleSubmit = async () => {
    const parsed = parseCommand(prompt);
    if (parsed.command === 'connect' && parsed.target) {
      if (parsed.target === 'midi') setMidiOpen(true);
      if (parsed.target === 'bluetooth') setBtOpen(true);
      if (parsed.target === 'usb') setUsbOpen(true);
      setPrompt('');
      return;
    }

    if (!prompt.trim()) return;

    const id = `plugin-${Date.now()}`;
    addPlugin({
      id,
      name: prompt.slice(0, 24),
      prompt: prompt.trim(),
      status: 'generating',
      type: 'synth',
      params: [
        { name: 'CUTOFF', value: 400, min: 20, max: 20000 },
        { name: 'DRIVE', value: 0.6, min: 0, max: 1 },
        { name: 'DETUNE', value: 0.12, min: 0, max: 1 },
      ],
      waveform: Array.from({ length: 18 }, () => 20 + Math.random() * 60),
      faustCode: '',
      wasmUrl: null,
      createdAt: Date.now(),
    });
    setPrompt('');
    setGeneratingId(id);
    setStreamText(`> prompt: "${prompt.trim()}"\n> compiling...\n`);

    try {
      const result = await generateFaust(prompt.trim());
      setStreamText((prev) => prev + `> generating Faust code...\n\n${result.faustCode}\n\n> done.`);
      usePluginStore.setState((s) => ({
        plugins: s.plugins.map((p) =>
          p.id === id ? { ...p, faustCode: result.faustCode, name: result.prompt.slice(0, 24), status: 'ready' as const } : p
        ),
      }));
    } catch (err) {
      updatePluginStatus(id, 'error');
      setStreamText((prev) => prev + `> error: generation failed\n`);
      console.error('[Hayashi] Generation failed:', err);
    } finally {
      setGeneratingId(null);
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
      <header className="flex items-center h-14 px-5 gap-4 flex-shrink-0 z-20" style={{ borderBottom: `1px solid ${C.border}` }}>
        <div className="flex items-center gap-2.5">
          <img src="/hayashi-logo.png" alt="Hayashi" className="h-7 w-7 rounded object-contain" />
          <span className="text-sm font-bold tracking-[0.15em] hidden sm:inline-block">HAYASHI</span>
          <Badge variant="outline" className="ml-2 h-5 text-[10px] border-[#ff8c61]/30 text-[#ff8c61] rounded-full">BETA</Badge>
        </div>
        <div className="flex-1" />
        <div className="hidden md:flex items-center gap-1">
          {['Library', 'Generate', 'Export'].map((item) => (
            <Button key={item} variant="ghost" size="sm" className="h-8 text-xs font-medium text-[#737373] hover:text-[#e5e5e5] hover:bg-white/5 rounded-md">{item}</Button>
          ))}
        </div>
        <div className="flex-1" />
        <Button variant="outline" size="sm" className="h-8 text-[11px] border-[#ff8c61]/30 text-[#ff8c61] hover:bg-[#ff8c61]/10 rounded-md gap-1.5" onClick={() => setPaletteOpen(true)}>
          <Sparkles className="h-3.5 w-3.5" /> Commands
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
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <PluginLibrary />
        <main className="flex-1 overflow-auto hayashi-scroll relative">
          {/* Centered prompt */}
          <div className="flex flex-col items-center justify-center min-h-[50vh] px-8 pt-12 pb-8">
            <div className="text-center mb-8 animate-slide-up">
              <h1 className="text-3xl font-bold tracking-tight mb-2">What do you want to create?</h1>
              <p className="text-sm text-[#737373]">Describe a sound. Get a plugin. Use it anywhere.</p>
            </div>

            <div className="w-full max-w-2xl animate-slide-up rounded-2xl border p-1 transition-all duration-300 focus-within:border-[rgba(255,140,97,0.25)] focus-within:shadow-lg" style={{ borderColor: C.border, background: C.panel, boxShadow: '0 4px 24px rgba(0,0,0,0.4)' }}>
              <SignedIn>
                <div className="flex items-start gap-3 p-4">
                  <Terminal className="h-5 w-5 mt-0.5 flex-shrink-0" style={{ color: C.cyan }} />
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
                    placeholder='e.g. "warm analog pad with slow attack and chorus"'
                    spellCheck={false}
                    className="flex-1 bg-transparent text-sm font-mono resize-none outline-none placeholder:text-[#525252]"
                    style={{ color: C.text, caretColor: C.accent, minHeight: 24, maxHeight: 120 }}
                    rows={1}
                  />
                </div>
                <div className="flex items-center justify-between px-4 py-2.5 border-t" style={{ borderColor: C.border }}>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="h-5 text-[10px] border-[#525252] text-[#737373] rounded-md gap-1"><Wand2 className="h-3 w-3" /> GPT-4o</Badge>
                    <Badge variant="outline" className="h-5 text-[10px] border-[#525252] text-[#737373] rounded-md gap-1"><Code2 className="h-3 w-3" /> Faust</Badge>
                  </div>
                  <Button onClick={handleSubmit} disabled={!prompt.trim()} size="sm" className="h-8 text-xs font-bold tracking-wider rounded-lg gap-1.5 disabled:opacity-30" style={{ background: C.accent, color: '#0a0a0a', border: 'none' }}>
                    <Sparkles className="h-3.5 w-3.5" /> GENERATE
                  </Button>
                </div>
              </SignedIn>
              <SignedOut>
                <div className="flex flex-col items-center justify-center p-8 gap-4">
                  <Lock className="h-8 w-8 text-[#525252]" />
                  <div className="text-center">
                    <p className="text-sm font-medium text-[#e5e5e5]">Sign in to generate plugins</p>
                    <p className="text-xs text-[#737373] mt-1">Create an account to start building custom instruments.</p>
                  </div>
                  <SignInButton>
                    <Button size="sm" className="h-8 text-xs font-bold rounded-lg gap-1.5" style={{ background: C.accent, color: '#0a0a0a', border: 'none' }}>
                      <Sparkles className="h-3.5 w-3.5" /> Sign In to Generate
                    </Button>
                  </SignInButton>
                </div>
              </SignedOut>
            </div>

            {/* Style selector */}
            <div className="flex items-center justify-center gap-2 mt-4 animate-slide-up">
              <span className="text-[10px] font-bold tracking-wider text-[#525252] uppercase mr-1">Preview Style</span>
              {[
                { id: 'disco', label: 'Disco', bpm: 123 },
                { id: 'trap', label: 'Trap', bpm: 140 },
                { id: 'house', label: 'House', bpm: 128 },
                { id: 'ambient', label: 'Ambient', bpm: 90 },
              ].map((style) => (
                <button
                  key={style.id}
                  onClick={() => setSelectedStyle(style.id)}
                  className="px-3 py-1 rounded-full text-[11px] font-medium transition-all border hover:border-[rgba(255,140,97,0.25)]"
                  style={{
                    color: selectedStyle === style.id ? C.accent : C.textMuted,
                    borderColor: selectedStyle === style.id ? 'rgba(255,140,97,0.30)' : C.border,
                    background: selectedStyle === style.id ? 'rgba(255,140,97,0.08)' : C.panel,
                  }}
                >
                  {style.label} <span className="ml-1 opacity-50">{style.bpm}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Terminal stream output */}
          {(generatingId || streamText) && (
            <div className="w-full max-w-2xl mx-auto mb-8 animate-slide-up rounded-2xl border overflow-hidden" style={{ borderColor: C.border, background: C.void }}>
              <div className="flex items-center gap-2 px-4 py-2 border-b" style={{ borderColor: C.border, background: C.panel }}>
                <Terminal className="h-3.5 w-3.5 text-[#525252]" />
                <span className="text-[10px] font-bold tracking-wider text-[#525252]">HAYASHI ENGINE</span>
                {generatingId && <span className="ml-auto inline-block w-1.5 h-1.5 rounded-full bg-[#34c759] animate-pulse" />}
              </div>
              <div className="p-4">
                <pre className="text-[11px] font-mono leading-relaxed whitespace-pre-wrap" style={{ color: '#e5e5e5' }}>
                  {typedStream}
                  {generatingId && <span className="inline-block w-2 h-4 align-middle bg-[#ff8c61] ml-0.5 animate-pulse" />}
                </pre>
              </div>
            </div>
          )}

          {/* Active plugin detail */}
          <PluginPreview />
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
