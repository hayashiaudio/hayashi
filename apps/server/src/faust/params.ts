export interface ParsedParam {
  name: string;
  value: number;
  min: number;
  max: number;
}

export function parseFaustParams(code: string): ParsedParam[] {
  const params: ParsedParam[] = [];
  const regex = /(\w+)\s*=\s*(vslider|hslider|nentry)\s*\(\s*"([^"]*)"\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/g;

  let match;
  while ((match = regex.exec(code)) !== null) {
    const varName = match[1];
    const label = match[3];
    const init = parseFloat(match[4]);
    const min = parseFloat(match[5]);
    const max = parseFloat(match[6]);
    const name = label.includes('[') ? label.split('[')[0].trim() : label;
    params.push({
      name: name || varName,
      value: init,
      min,
      max,
    });
  }

  return params;
}

export function paramsToJson(params: ParsedParam[]): string {
  return JSON.stringify(params);
}
