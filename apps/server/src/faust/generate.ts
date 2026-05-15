import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

const SYSTEM_PROMPT = `
You are a Faust DSP compiler. The user describes a sound. You output ONLY valid Faust code that produces that sound as a synthesizer or effect.

Rules:
- Output ONLY the Faust code. No markdown, no explanation, no backticks.
- Use standard Faust libraries: import("stdfaust.lib");
- If it's a synth, expose these parameters with exact names: freq, gain, gate (for envelope triggering).
- If it's a percussion one-shot, expose: freq, gain, trigger.
- If it's an effect, expose: mix, input gain.
- Keep the code under 40 lines.
- Ensure no feedback loops without proper delay.
- Include a simple ADSR or percussive envelope for synth sounds.
`;

export async function generateFaustFromPrompt(prompt: string): Promise<string> {
  const result = await generateText({
    model: anthropic('claude-3-sonnet-20240229'),
    system: SYSTEM_PROMPT,
    prompt,
  });

  return result.text
    .replace(/```faust\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();
}
