import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Resvg } from '@resvg/resvg-js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadLogoBase64(): string | null {
  try {
    const logoPath = resolve(__dirname, '../../client/public/hayashi-logo.png');
    const buffer = readFileSync(logoPath);
    return `data:image/png;base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
}

let logoBase64Cache: string | null | undefined;
function getLogoBase64(): string | null {
  if (logoBase64Cache === undefined) {
    logoBase64Cache = loadLogoBase64();
  }
  return logoBase64Cache;
}

type OgMetadata = {
  title: string;
  description: string;
  url: string;
  image: string;
  secondaryImage?: string;
  imageAlt: string;
  type?: 'website' | 'article';
};

type ShareOgArgs = {
  ownerName: string;
  ownerImageUrl?: string | null;
  pluginName: string;
  pluginType: string;
  versionCount: number;
};

const SITE_NAME = 'Hayashi';
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeXml(value: string) {
  return escapeHtml(value);
}

function truncate(value: string, length: number) {
  if (value.length <= length) return value;
  return `${value.slice(0, Math.max(0, length - 1)).trimEnd()}…`;
}

function wrapWords(text: string, maxChars: number, maxLines: number) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [''];

  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars || !current) {
      current = next;
      continue;
    }
    lines.push(current);
    current = word;
    if (lines.length === maxLines - 1) break;
  }

  if (lines.length < maxLines && current) lines.push(current);
  const consumedWords = lines.join(' ').split(/\s+/).filter(Boolean).length;
  if (consumedWords < words.length && lines.length) {
    lines[lines.length - 1] = truncate(lines[lines.length - 1], Math.max(12, maxChars - 1));
  }
  return lines.slice(0, maxLines);
}

function renderTextLines(lines: string[], x: number, y: number, lineHeight: number) {
  return lines
    .map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`)
    .join('');
}

function badges(items: string[]) {
  return items.slice(0, 3).map((item, index) => {
    const x = 74 + index * 188;
    return `
      <g transform="translate(${x} 520)">
        <rect width="168" height="42" rx="21" fill="#FFFCF5" fill-opacity="0.82" stroke="#10261D" stroke-opacity="0.10" />
        <text x="84" y="27" text-anchor="middle" font-family="DM Sans, Arial, sans-serif" font-size="15" font-weight="700" letter-spacing="1.8" fill="#36543f">${escapeXml(item.toUpperCase())}</text>
      </g>
    `;
  }).join('');
}

function baseSvgFrame(content: string, opts?: { logoInOval?: boolean; avatarImage?: string | null; avatarFallbackName?: string }) {
  const logo = getLogoBase64();
  const showLogo = opts?.logoInOval && logo;
  const showAvatar = opts?.avatarImage;

  const rightVisual = showAvatar
    ? `
      <defs>
        <clipPath id="avatarClip">
          <ellipse cx="920" cy="322" rx="138" ry="124" />
        </clipPath>
      </defs>
      <image
        href="${escapeXml(opts.avatarImage!)}"
        x="770"
        y="198"
        width="300"
        height="248"
        preserveAspectRatio="xMidYMid slice"
        clip-path="url(#avatarClip)"
      />
      <ellipse cx="920" cy="322" rx="138" ry="124" fill="url(#dots)" opacity="0.14" />
      <ellipse cx="920" cy="438" rx="110" ry="18" fill="#FFFFFF" fill-opacity="0.32"/>
    `
    : showLogo
      ? `
        <image href="${escapeXml(logo)}" x="782" y="222" width="276" height="200" preserveAspectRatio="xMidYMid meet" opacity="0.95" />
        <ellipse cx="920" cy="322" rx="138" ry="124" fill="url(#dots)" opacity="0.10" />
        <ellipse cx="920" cy="438" rx="110" ry="18" fill="#FFFFFF" fill-opacity="0.32"/>
      `
      : `
        <ellipse cx="920" cy="322" rx="138" ry="124" fill="url(#dots)" />
        <circle cx="920" cy="318" r="78" fill="#0B1710" opacity="0.95"/>
        <circle cx="892" cy="295" r="20" fill="#6F9E42"/>
        <circle cx="950" cy="306" r="26" fill="#6F9E42"/>
        <rect x="858" y="372" width="124" height="18" rx="9" fill="#FFFFFF" fill-opacity="0.20"/>
        <ellipse cx="920" cy="438" rx="110" ry="18" fill="#FFFFFF" fill-opacity="0.32"/>
      `;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1200" y2="630" gradientUnits="userSpaceOnUse">
      <stop stop-color="#FBF7EB"/>
      <stop offset="0.5" stop-color="#F3EBD7"/>
      <stop offset="1" stop-color="#E4ECD8"/>
    </linearGradient>
    <radialGradient id="glow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(925 360) rotate(90) scale(250 250)">
      <stop stop-color="#8FB85A" stop-opacity="0.30"/>
      <stop offset="1" stop-color="#8FB85A" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="ovalBg" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(928 355) rotate(90) scale(200 170)">
      <stop stop-color="#FFFDF7"/>
      <stop offset="0.68" stop-color="#F3EAD9"/>
      <stop offset="1" stop-color="#DBE6CB"/>
    </radialGradient>
    <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
      <path d="M32 0H0V32" fill="none" stroke="#10261D" stroke-opacity="0.05" stroke-width="1"/>
    </pattern>
    <pattern id="dots" width="12" height="12" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="1.8" fill="#143122" />
      <circle cx="8" cy="6" r="1.4" fill="#6F9E42" />
      <circle cx="6" cy="10" r="1.2" fill="#143122" opacity="0.65" />
    </pattern>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="30" stdDeviation="30" flood-color="#10261D" flood-opacity="0.14"/>
    </filter>
  </defs>
  <rect width="1200" height="630" rx="0" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#grid)" opacity="0.9"/>
  <circle cx="1060" cy="96" r="52" fill="#FFFFFF" fill-opacity="0.42" stroke="#10261D" stroke-opacity="0.08"/>
  <circle cx="804" cy="566" r="28" fill="#FFF8E9" fill-opacity="0.82" stroke="#D48C2E" stroke-opacity="0.18"/>
  <circle cx="926" cy="360" r="248" fill="url(#glow)"/>
  <g filter="url(#shadow)">
    <rect x="710" y="112" width="420" height="420" rx="210" fill="url(#ovalBg)" stroke="#10261D" stroke-opacity="0.12"/>
    <rect x="738" y="140" width="364" height="364" rx="182" fill="#FFFFFF" fill-opacity="0.56" stroke="#10261D" stroke-opacity="0.10"/>
    ${rightVisual}
  </g>
  ${content}
</svg>`;
}

export function buildHomeMetadata(origin: string): OgMetadata {
  return {
    title: 'Hayashi — Prompt to plugin export',
    description: 'Turn prompts into playable Faust effects and synths, preview them in the browser, and export importable DAW plugin bundles.',
    url: `${origin}/`,
    image: `${origin}/og/home.png`,
    secondaryImage: `${origin}/og/home.svg`,
    imageAlt: 'Hayashi home card with parchment grid background, oversized editorial typography, and a dithered oval visual.',
    type: 'website',
  };
}

export function buildShareMetadata(origin: string, pluginId: string, args: ShareOgArgs): OgMetadata {
  const ownerName = truncate(args.ownerName, 42);
  const pluginName = truncate(args.pluginName, 88);
  const label = args.pluginType.toLowerCase() === 'effect' ? 'effect' : args.pluginType.toLowerCase();
  return {
    title: truncate(`${pluginName} — Hayashi share`, 60),
    description: truncate(`Preview ${pluginName}, a shared ${label} patch by ${ownerName}. Listen live, inspect the Faust, and open it in Hayashi.`, 160),
    url: `${origin}/share?plugin=${encodeURIComponent(pluginId)}`,
    image: `${origin}/og/share/${encodeURIComponent(pluginId)}.png`,
    secondaryImage: `${origin}/og/share/${encodeURIComponent(pluginId)}.svg`,
    imageAlt: `Public Hayashi share card for ${pluginName} by ${ownerName}.`,
    type: 'article',
  };
}

export function injectMetadata(html: string, metadata: OgMetadata) {
  const metaBlock = `
    <title>${escapeHtml(metadata.title)}</title>
    <meta name="description" content="${escapeHtml(metadata.description)}" />
    <meta name="theme-color" content="#f4efdf" />
    <meta property="og:site_name" content="${SITE_NAME}" />
    <meta property="og:type" content="${metadata.type ?? 'website'}" />
    <meta property="og:title" content="${escapeHtml(metadata.title)}" />
    <meta property="og:description" content="${escapeHtml(metadata.description)}" />
    <meta property="og:url" content="${escapeHtml(metadata.url)}" />
    <meta property="og:image" content="${escapeHtml(metadata.image)}" />
    <meta property="og:image:secure_url" content="${escapeHtml(metadata.image)}" />
    <meta property="og:image:alt" content="${escapeHtml(metadata.imageAlt)}" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content="${OG_WIDTH}" />
    <meta property="og:image:height" content="${OG_HEIGHT}" />
    ${metadata.secondaryImage ? `<meta property="og:image" content="${escapeHtml(metadata.secondaryImage)}" />` : ''}
    ${metadata.secondaryImage ? `<meta property="og:image:secure_url" content="${escapeHtml(metadata.secondaryImage)}" />` : ''}
    ${metadata.secondaryImage ? `<meta property="og:image:type" content="image/svg+xml" />` : ''}
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(metadata.title)}" />
    <meta name="twitter:description" content="${escapeHtml(metadata.description)}" />
    <meta name="twitter:image" content="${escapeHtml(metadata.image)}" />
    <meta name="twitter:url" content="${escapeHtml(metadata.url)}" />
    <meta name="twitter:image:alt" content="${escapeHtml(metadata.imageAlt)}" />
  `;

  let next = html.replace(/<title>.*?<\/title>/is, '<title>Hayashi</title>');
  next = next.replace(/<meta name="description"[^>]*>\s*/gi, '');
  next = next.replace(/<meta name="theme-color"[^>]*>\s*/gi, '');
  next = next.replace(/<meta property="og:[^"]+"[^>]*>\s*/gi, '');
  next = next.replace(/<meta name="twitter:[^"]+"[^>]*>\s*/gi, '');
  return next.replace('</head>', `${metaBlock}\n  </head>`);
}

export function renderHomeOgSvg() {
  const heading = renderTextLines(
    ['Prompt to plugin.', 'Preview instantly.', 'Export VST3 + CLAP.'],
    74,
    154,
    92,
  );

  return baseSvgFrame(`
    <g filter="url(#shadow)">
      <rect x="74" y="50" width="255" height="38" rx="19" fill="#FFFFFF" fill-opacity="0.72" stroke="#10261D" stroke-opacity="0.08" />
      <text x="102" y="74" font-family="DM Sans, Arial, sans-serif" font-size="16" font-weight="700" letter-spacing="5" fill="#385540">PROMPT-TO-PLUGIN STUDIO</text>
    </g>
    <text x="74" y="154" font-family="DM Sans, Arial, sans-serif" font-size="80" font-weight="900" letter-spacing="-4.5" fill="#10261D">${heading}</text>
    <text x="74" y="456" font-family="DM Sans, Arial, sans-serif" font-size="28" font-weight="500" fill="#10261D" fill-opacity="0.72">
      Turn plain-language ideas into playable FX and synths,
    </text>
    <text x="74" y="492" font-family="DM Sans, Arial, sans-serif" font-size="28" font-weight="500" fill="#10261D" fill-opacity="0.72">
      audition them in-browser, and ship native builds from one room.
    </text>
    ${badges(['Live preview', 'Faust-native', 'Export-ready'])}
  `, { logoInOval: true });
}

export function renderShareOgSvg(args: ShareOgArgs) {
  const ownerName = truncate(args.ownerName, 34);
  const pluginName = truncate(args.pluginName, 92);
  const heading = wrapWords(pluginName, 18, 4);
  const typeLabel = `${args.pluginType} patch`;

  return baseSvgFrame(`
    <g filter="url(#shadow)">
      <rect x="74" y="50" width="252" height="38" rx="19" fill="#FFFFFF" fill-opacity="0.72" stroke="#10261D" stroke-opacity="0.08" />
      <text x="102" y="74" font-family="DM Sans, Arial, sans-serif" font-size="16" font-weight="700" letter-spacing="5" fill="#385540">PUBLIC EFFECT SHARE</text>
    </g>
    <text x="74" y="146" font-family="DM Sans, Arial, sans-serif" font-size="36" font-weight="700" fill="#4E6A53">${escapeXml(ownerName)} shared</text>
    <text x="74" y="206" font-family="DM Sans, Arial, sans-serif" font-size="72" font-weight="900" letter-spacing="-4" fill="#10261D">${renderTextLines(heading, 74, 206, 78)}</text>
    <text x="74" y="510" font-family="DM Sans, Arial, sans-serif" font-size="28" font-weight="500" fill="#10261D" fill-opacity="0.72">
      Audition the live patch, inspect the generated Faust, and step through
    </text>
    <text x="74" y="546" font-family="DM Sans, Arial, sans-serif" font-size="28" font-weight="500" fill="#10261D" fill-opacity="0.72">
      the current version stack inside Hayashi.
    </text>
    ${badges([typeLabel, `${args.versionCount} version${args.versionCount === 1 ? '' : 's'}`, ownerName])}
  `, { avatarImage: args.ownerImageUrl, avatarFallbackName: ownerName });
}

function svgToPng(svg: string): Buffer {
  const resvg = new Resvg(svg, {
    fitTo: {
      mode: 'width',
      value: OG_WIDTH,
    },
    font: {
      fontFiles: [],
      loadSystemFonts: true,
      defaultFontFamily: 'DM Sans',
    },
  });
  const pngData = resvg.render();
  return pngData.asPng();
}

export function renderHomeOgPng(): Buffer {
  return svgToPng(renderHomeOgSvg());
}

export function renderShareOgPng(args: ShareOgArgs): Buffer {
  return svgToPng(renderShareOgSvg(args));
}
