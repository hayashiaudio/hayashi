import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Play,
  Download,
  Terminal,
  ChevronRight,
  Wand2,
  Code2,
  Sparkles,
  Share2,
  Copy,
  Check,
} from "lucide-react";

/* ───────────────────────────────────────────
   Hayashi — Prompt-to-Plugin Engine Mockup
   v0-style centered prompt with terminal soul.
   Dark void aesthetic. Plugin/instrument focused.
   ─────────────────────────────────────────── */

const C = {
  void: "#0a0a0a",
  panel: "#111111",
  panelHover: "#1a1a1a",
  border: "rgba(255,255,255,0.06)",
  borderHover: "rgba(255,255,255,0.10)",
  text: "#e5e5e5",
  textMuted: "#737373",
  textDim: "#525252",
  accent: "#ff8c61",
  accentDim: "rgba(255,140,97,0.15)",
  amber: "#f5a623",
  amberDim: "rgba(245,166,35,0.15)",
  cyan: "#5ac8fa",
  cyanDim: "rgba(90,200,250,0.15)",
  green: "#34c759",
  red: "#ff3b30",
} as const;

const GENERATED_PLUGINS = [
  {
    id: "p1",
    name: "Wobbly FM Bass",
    prompt: 'fm bass, "aggressive", low-pass 400hz',
    status: "ready" as const,
    type: "synth",
    params: [
      { name: "CUTOFF", value: 400, min: 20, max: 20000 },
      { name: "DRIVE", value: 0.6, min: 0, max: 1 },
      { name: "DETUNE", value: 0.12, min: 0, max: 1 },
    ],
    waveform: [14, 38, 22, 46, 18, 52, 28, 40, 16, 48, 24, 36, 12, 44, 20, 50, 30, 42],
  },
  {
    id: "p2",
    name: "Glitch Hats",
    prompt: "hi-hat, granular, metallic",
    status: "ready" as const,
    type: "percussion",
    params: [
      { name: "DECAY", value: 0.15, min: 0, max: 2 },
      { name: "SPREAD", value: 0.4, min: 0, max: 1 },
      { name: "RATE", value: 0.8, min: 0.1, max: 4 },
    ],
    waveform: [8, 28, 14, 36, 10, 32, 16, 24, 12, 30, 18, 22, 10, 34, 14, 26, 12, 20],
  },
  {
    id: "p3",
    name: "Ethereal Pad",
    prompt: "supersaw pad, reverb 8s, slow attack",
    status: "generating" as const,
    type: "synth",
    params: [
      { name: "ATTACK", value: 2.5, min: 0, max: 5 },
      { name: "WIDTH", value: 0.9, min: 0, max: 1 },
      { name: "DRY/WET", value: 0.7, min: 0, max: 1 },
    ],
    waveform: [12, 20, 16, 24, 14, 22, 18, 20, 16, 24, 14, 22, 18, 20, 16, 24, 14, 22],
  },
];

const HISTORY = [
  '> generate "warm analog brass with slow filter sweep"',
  '> generate "plucky 8-bit arpeggio, bright"',
  '> generate "sub bass, clean, mono"',
];

function formatParamValue(v: number, min: number, max: number) {
  if (max <= 1 && min >= 0) return `${Math.round(v * 100)}%`;
  if (max > 1000) return `${Math.round(v)}Hz`;
  return v.toFixed(2);
}

export default function StudioMockup() {
  const [prompt, setPrompt] = useState("");
  const [activePluginId, setActivePluginId] = useState<string | null>("p1");
  const [copied, setCopied] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState("disco");

  const activePlugin = GENERATED_PLUGINS.find((p) => p.id === activePluginId);

  const handleGenerate = () => {
    if (!prompt.trim()) return;
    setPrompt("");
  };

  const handleCopyPrompt = () => {
    if (!activePlugin) return;
    navigator.clipboard.writeText(activePlugin.prompt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className="flex flex-col h-screen w-screen overflow-hidden"
        style={{
          background: C.void,
          color: C.text,
          fontFamily: "'DM Sans', 'SF Pro Display', system-ui, sans-serif",
        }}
      >
        <style>{`
          @keyframes pulse-dot {
            0%, 100% { opacity: 0.4; transform: scale(1); }
            50% { opacity: 1; transform: scale(1.2); }
          }
          @keyframes slide-up {
            from { opacity: 0; transform: translateY(12px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes waveform-bounce {
            0%, 100% { transform: scaleY(0.6); }
            50% { transform: scaleY(1); }
          }
          .animate-slide-up {
            animation: slide-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) forwards;
          }
          .hayashi-scroll::-webkit-scrollbar { width: 5px; height: 5px; }
          .hayashi-scroll::-webkit-scrollbar-track { background: transparent; }
          .hayashi-scroll::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 3px; }
          .hayashi-scroll::-webkit-scrollbar-thumb:hover { background: ${C.borderHover}; }
        `}</style>

        {/* ═══ HEADER ═══ */}
        <header
          className="flex items-center h-14 px-5 gap-4 flex-shrink-0 z-20"
          style={{ borderBottom: `1px solid ${C.border}` }}
        >
          <div className="flex items-center gap-2.5">
            <img
              src="/hayashi-logo.png"
              alt="Hayashi"
              className="h-7 w-7 rounded object-contain"
            />
            <span
              className="text-sm font-bold tracking-[0.15em] hidden sm:inline-block"
              style={{ color: C.text }}
            >
              HAYASHI
            </span>
            <Badge
              variant="outline"
              className="ml-2 h-5 text-[10px] font-bold tracking-wider border-[#ff8c61]/30 text-[#ff8c61] rounded-full"
            >
              BETA
            </Badge>
          </div>

          <div className="flex-1" />

          {/* Center nav */}
          <div className="hidden md:flex items-center gap-1">
            {["Library", "Generate", "Export"].map((item) => (
              <Button
                key={item}
                variant="ghost"
                size="sm"
                className="h-8 text-xs font-medium text-[#737373] hover:text-[#e5e5e5] hover:bg-white/5 rounded-md"
              >
                {item}
              </Button>
            ))}
          </div>

          <div className="flex-1" />

          {/* User */}
          <div className="flex items-center gap-3">
            <div
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border"
              style={{ borderColor: C.border, background: C.panel }}
            >
              <Avatar className="h-6 w-6 ring-1 ring-white/20">
                <AvatarFallback className="text-[10px] font-bold bg-[#ff8c61] text-white">
                  DB
                </AvatarFallback>
              </Avatar>
              <div className="hidden sm:flex flex-col leading-none">
                <span className="text-[11px] font-semibold text-[#e5e5e5]">
                  djbohrman
                </span>
                <span className="text-[9px] text-[#737373] flex items-center gap-1 mt-0.5">
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full"
                    style={{ background: C.green }}
                  />
                  Pro Plan
                </span>
              </div>
            </div>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-[11px] font-bold tracking-wider rounded-md gap-1.5 border-[#ff8c61]/30 text-[#ff8c61] hover:bg-[#ff8c61]/10 hover:text-[#ff8c61]"
                >
                  <Share2 className="h-3.5 w-3.5" />
                  SHARE
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Share Plugin</TooltipContent>
            </Tooltip>
          </div>
        </header>

        {/* ═══ MAIN BODY ═══ */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* LEFT: Plugin Library */}
          <aside
            className="w-[280px] flex flex-col flex-shrink-0"
            style={{
              borderRight: `1px solid ${C.border}`,
              background: C.panel,
            }}
          >
            <div className="px-4 py-3 flex items-center justify-between">
              <span className="text-[11px] font-bold tracking-[0.12em] text-[#737373]">
                YOUR PLUGINS
              </span>
              <Badge
                variant="outline"
                className="h-5 text-[10px] border-[#525252] text-[#737373] rounded-full"
              >
                {GENERATED_PLUGINS.length}
              </Badge>
            </div>

            <Separator className="bg-[rgba(255,255,255,0.06)]" />

            <ScrollArea className="flex-1 hayashi-scroll">
              <div className="p-3 space-y-2">
                {GENERATED_PLUGINS.map((plugin) => (
                  <Card
                    key={plugin.id}
                    className="rounded-lg border shadow-none cursor-pointer transition-all duration-200 hover:border-[rgba(255,140,97,0.20)]"
                    style={{
                      borderColor:
                        activePluginId === plugin.id
                          ? "rgba(255,140,97,0.30)"
                          : C.border,
                      background:
                        activePluginId === plugin.id
                          ? "rgba(255,140,97,0.06)"
                          : C.void,
                    }}
                    onClick={() => setActivePluginId(plugin.id)}
                  >
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-mono text-[11px] font-bold text-[#e5e5e5] truncate">
                            {plugin.name}
                          </div>
                          <div className="text-[10px] text-[#525252] truncate mt-0.5">
                            {plugin.prompt}
                          </div>
                        </div>
                        {plugin.status === "generating" ? (
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <span
                              className="inline-block w-1.5 h-1.5 rounded-full"
                              style={{
                                background: C.amber,
                                animation: "pulse-dot 1.5s ease-in-out infinite",
                              }}
                            />
                            <span className="text-[9px] text-[#737373]">
                              Generating
                            </span>
                          </div>
                        ) : (
                          <Badge
                            variant="outline"
                            className="h-4 text-[9px] border-[#34c759]/30 text-[#34c759] rounded-sm flex-shrink-0"
                          >
                            Ready
                          </Badge>
                        )}
                      </div>

                      {/* Mini waveform */}
                      <div className="flex items-end gap-[2px] h-6">
                        {plugin.waveform.slice(0, 24).map((h, idx) => (
                          <div
                            key={idx}
                            className="w-[3px] rounded-full"
                            style={{
                              height: `${h}%`,
                              background:
                                activePluginId === plugin.id
                                  ? C.accent
                                  : "#525252",
                              opacity: 0.4 + (idx % 3) * 0.2,
                              transition: "background 0.2s",
                            }}
                          />
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>

            {/* History */}
            <div
              className="px-4 py-3 border-t"
              style={{ borderColor: C.border }}
            >
              <span className="text-[10px] font-bold tracking-[0.12em] text-[#525252] block mb-2">
                RECENT PROMPTS
              </span>
              <div className="space-y-1.5">
                {HISTORY.map((line, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-1.5 text-[10px] text-[#525252] font-mono leading-snug"
                  >
                    <ChevronRight className="h-3 w-3 mt-0.5 flex-shrink-0 text-[#5ac8fa]" />
                    <span className="truncate">
                      {line.replace("> ", "")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </aside>

          {/* CENTER: Prompt + Preview */}
          <main className="flex-1 overflow-auto hayashi-scroll relative">
            {/* Centered prompt area */}
            <div className="flex flex-col items-center justify-center min-h-[50vh] px-8 pt-12 pb-8">
              {/* Hero text */}
              <div className="text-center mb-8 animate-slide-up">
                <h1
                  className="text-3xl font-bold tracking-tight mb-2"
                  style={{ color: C.text }}
                >
                  What do you want to create?
                </h1>
                <p className="text-sm" style={{ color: C.textMuted }}>
                  Describe a sound. Get a plugin. Use it anywhere.
                </p>
              </div>

              {/* Prompt box */}
              <div
                className="w-full max-w-2xl animate-slide-up rounded-2xl border p-1 transition-all duration-300 focus-within:border-[rgba(255,140,97,0.25)] focus-within:shadow-lg"
                style={{
                  borderColor: C.border,
                  background: C.panel,
                  boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
                }}
              >
                <div className="flex items-start gap-3 p-4">
                  <Terminal
                    className="h-5 w-5 mt-0.5 flex-shrink-0"
                    style={{ color: C.cyan }}
                  />
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleGenerate();
                      }
                    }}
                    placeholder='e.g. "warm analog pad with slow attack and chorus"'
                    spellCheck={false}
                    className="flex-1 bg-transparent text-sm font-mono resize-none outline-none placeholder:text-[#525252]"
                    style={{
                      color: C.text,
                      caretColor: C.accent,
                      minHeight: 24,
                      maxHeight: 120,
                    }}
                    rows={1}
                  />
                </div>

                <div
                  className="flex items-center justify-between px-4 py-2.5 border-t"
                  style={{ borderColor: C.border }}
                >
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className="h-5 text-[10px] border-[#525252] text-[#737373] rounded-md gap-1 cursor-pointer hover:border-[#737373]"
                    >
                      <Wand2 className="h-3 w-3" />
                      GPT-4o
                    </Badge>
                    <Badge
                      variant="outline"
                      className="h-5 text-[10px] border-[#525252] text-[#737373] rounded-md gap-1 cursor-pointer hover:border-[#737373]"
                    >
                      <Code2 className="h-3 w-3" />
                      Faust
                    </Badge>
                  </div>

                  <Button
                    onClick={handleGenerate}
                    disabled={!prompt.trim()}
                    size="sm"
                    className="h-8 text-xs font-bold tracking-wider rounded-lg gap-1.5 disabled:opacity-30"
                    style={{
                      background: C.accent,
                      color: "#0a0a0a",
                      border: "none",
                    }}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    GENERATE
                  </Button>
                </div>
              </div>

              {/* Style selector */}
              <div className="flex items-center justify-center gap-2 mt-4 animate-slide-up">
                <span className="text-[10px] font-bold tracking-wider text-[#525252] uppercase mr-1">
                  Preview Style
                </span>
                {[
                  { id: "disco", label: "Disco", bpm: 123, key: "C-minor" },
                  { id: "trap", label: "Trap", bpm: 140, key: "F-minor" },
                  { id: "house", label: "House", bpm: 128, key: "A-minor" },
                  { id: "ambient", label: "Ambient", bpm: 90, key: "D-minor" },
                ].map((style) => (
                  <button
                    key={style.id}
                    onClick={() => setSelectedStyle(style.id)}
                    className="px-3 py-1 rounded-full text-[11px] font-medium transition-all border hover:border-[rgba(255,140,97,0.25)]"
                    style={{
                      color:
                        selectedStyle === style.id ? C.accent : C.textMuted,
                      borderColor:
                        selectedStyle === style.id
                          ? "rgba(255,140,97,0.30)"
                          : C.border,
                      background:
                        selectedStyle === style.id
                          ? "rgba(255,140,97,0.08)"
                          : C.panel,
                    }}
                  >
                    {style.label}
                    <span className="ml-1 opacity-50">{style.bpm}</span>
                  </button>
                ))}
              </div>

              {/* Quick starters */}
              <div className="flex flex-wrap items-center justify-center gap-2 mt-5 animate-slide-up">
                {[
                  "plucky FM bass",
                  "gritty 808 kick",
                  "ethereal vocal pad",
                  "acid TB-303",
                ].map((tag) => (
                  <button
                    key={tag}
                    onClick={() => setPrompt(tag)}
                    className="px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors border hover:border-[rgba(255,255,255,0.15)]"
                    style={{
                      color: C.textMuted,
                      borderColor: C.border,
                      background: C.panel,
                    }}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            {/* Active plugin detail */}
            {activePlugin && (
              <div className="px-8 pb-12 max-w-4xl mx-auto">
                <div
                  className="rounded-2xl border p-6 animate-slide-up"
                  style={{ borderColor: C.border, background: C.panel }}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-4 mb-6">
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <h2 className="text-lg font-bold">{activePlugin.name}</h2>
                        <Badge
                          variant="outline"
                          className="h-5 text-[10px] border-[#525252] text-[#737373] rounded-full capitalize"
                        >
                          {activePlugin.type}
                        </Badge>
                      </div>
                      <p className="text-xs text-[#525252] font-mono">
                        {activePlugin.prompt}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-[11px] border-[#525252] text-[#737373] hover:text-[#e5e5e5] rounded-md gap-1.5"
                        onClick={handleCopyPrompt}
                      >
                        {copied ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        {copied ? "Copied" : "Copy"}
                      </Button>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-[11px] border-[#ff8c61]/30 text-[#ff8c61] hover:bg-[#ff8c61]/10 rounded-md gap-1.5"
                          >
                            <Code2 className="h-3.5 w-3.5" />
                            FAUST
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">View Source</TooltipContent>
                      </Tooltip>

                      <Button
                        size="sm"
                        className="h-8 text-[11px] font-bold rounded-md gap-1.5"
                        style={{ background: C.accent, color: C.void }}
                      >
                        <Download className="h-3.5 w-3.5" />
                        EXPORT
                      </Button>
                    </div>
                  </div>

                  {/* Waveform visualization */}
                  <div
                    className="rounded-xl p-6 mb-6 flex items-center justify-center"
                    style={{ background: C.void, border: `1px solid ${C.border}` }}
                  >
                    <div className="flex items-end gap-[3px] h-20">
                      {activePlugin.waveform.map((h, i) => (
                        <div
                          key={i}
                          className="w-[4px] rounded-full"
                          style={{
                            height: `${h}%`,
                            background: C.accent,
                            opacity: 0.3 + (i % 3) * 0.15,
                            animation:
                              activePlugin.status === "generating"
                                ? `waveform-bounce ${0.8 + (i % 4) * 0.2}s ease-in-out infinite`
                                : "none",
                            animationDelay: `${i * 0.05}s`,
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Params */}
                  <div className="grid grid-cols-3 gap-4">
                    {activePlugin.params.map((param) => {
                      const pct =
                        ((param.value - param.min) / (param.max - param.min)) *
                        100;
                      return (
                        <div
                          key={param.name}
                          className="rounded-xl p-4 border"
                          style={{ borderColor: C.border, background: C.void }}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-[10px] font-bold tracking-wider text-[#737373]">
                              {param.name}
                            </span>
                            <span className="text-[10px] font-mono text-[#e5e5e5]">
                              {formatParamValue(
                                param.value,
                                param.min,
                                param.max
                              )}
                            </span>
                          </div>

                          {/* Fake slider track */}
                          <div className="relative h-1.5 rounded-full bg-[#1a1a1a] overflow-hidden">
                            <div
                              className="absolute top-0 left-0 bottom-0 rounded-full"
                              style={{
                                width: `${pct}%`,
                                background: C.accent,
                                opacity: 0.6,
                              }}
                            />
                          </div>

                          {/* Knob */}
                          <div className="flex justify-center mt-3">
                            <div
                              className="relative rounded-full"
                              style={{
                                width: 36,
                                height: 36,
                                border: `2px solid rgba(255,140,97,0.25)`,
                              }}
                            >
                              <div
                                className="absolute top-1/2 left-1/2 w-0.5 h-3"
                                style={{
                                  background: C.accent,
                                  transform: `translate(-50%, -100%) rotate(${pct * 2.7 - 135}deg)`,
                                  transformOrigin: "bottom center",
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Play button overlay */}
                  <div className="flex justify-center mt-6">
                    <Button
                      size="lg"
                      className="rounded-full h-12 px-8 gap-2 text-sm font-bold"
                      style={{ background: C.accent, color: C.void }}
                    >
                      <Play className="h-5 w-5 fill-current" />
                      PREVIEW
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
