export type ConnectTarget = 'midi' | 'bluetooth' | 'usb';

export interface ParsedCommand {
  command: 'connect' | 'generate' | 'export' | null;
  target: ConnectTarget | null;
  args: string[];
  raw: string;
}

export function parseCommand(input: string): ParsedCommand {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) {
    return { command: null, target: null, args: [], raw: trimmed };
  }

  const parts = trimmed.slice(1).split(/\s+/);
  const command = parts[0] as ParsedCommand['command'];
  const target = (parts[1] as ConnectTarget) ?? null;
  const args = parts.slice(2);

  return { command, target, args, raw: trimmed };
}
