import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';
import { createElement, type CSSProperties, type ReactNode } from 'react';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

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

type SatoriFont = {
  name: string;
  data: Buffer;
  weight: 400 | 600 | 700 | 800;
  style: 'normal';
};

const SITE_NAME = 'Hayashi';
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
const BODY_COLOR = '#10261d';
const MUTED_COLOR = 'rgba(16, 38, 29, 0.72)';
const ACCENT_COLOR = '#6f9e42';
const HIGHLIGHT_COLOR = '#fff5d8';

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

let satoriFontsPromise: Promise<SatoriFont[]> | null = null;
function getSatoriFonts() {
  if (!satoriFontsPromise) {
    satoriFontsPromise = Promise.resolve([
      {
        name: 'Manrope',
        data: readFileSync(require.resolve('@fontsource/manrope/files/manrope-latin-400-normal.woff')),
        weight: 400,
        style: 'normal',
      },
      {
        name: 'Manrope',
        data: readFileSync(require.resolve('@fontsource/manrope/files/manrope-latin-600-normal.woff')),
        weight: 600,
        style: 'normal',
      },
      {
        name: 'Manrope',
        data: readFileSync(require.resolve('@fontsource/manrope/files/manrope-latin-700-normal.woff')),
        weight: 700,
        style: 'normal',
      },
      {
        name: 'Manrope',
        data: readFileSync(require.resolve('@fontsource/manrope/files/manrope-latin-800-normal.woff')),
        weight: 800,
        style: 'normal',
      },
    ]);
  }
  return satoriFontsPromise;
}

const remoteImageCache = new Map<string, Promise<string | null>>();

async function fetchImageAsDataUri(url: string): Promise<string | null> {
  if (url.startsWith('data:')) return url;
  if (remoteImageCache.has(url)) return remoteImageCache.get(url)!;

  const promise = (async () => {
    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      const contentType = response.headers.get('content-type') ?? 'image/png';
      const arrayBuffer = await response.arrayBuffer();
      return `data:${contentType};base64,${Buffer.from(arrayBuffer).toString('base64')}`;
    } catch {
      return null;
    }
  })();

  remoteImageCache.set(url, promise);
  return promise;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function truncate(value: string, length: number) {
  if (value.length <= length) return value;
  return `${value.slice(0, Math.max(0, length - 1)).trimEnd()}…`;
}

function svgDataUri(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function buildDitheringVisualSvg(imageHref: string | null) {
  const embeddedLogo = getLogoBase64();
  const source = imageHref ?? embeddedLogo;
  const innerVisual = source
    ? `
      <image
        href="${escapeHtml(source)}"
        x="84"
        y="84"
        width="392"
        height="392"
        preserveAspectRatio="xMidYMid slice"
        clip-path="url(#heroClip)"
        filter="url(#duotone)"
      />
      <image
        href="${escapeHtml(source)}"
        x="84"
        y="84"
        width="392"
        height="392"
        preserveAspectRatio="xMidYMid slice"
        clip-path="url(#heroClip)"
        opacity="0.20"
      />
    `
    : '';

  return svgDataUri(`
    <svg width="560" height="560" viewBox="0 0 560 560" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="heroGlow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(278 266) rotate(90) scale(220 220)">
          <stop stop-color="#6A9B3D" stop-opacity="0.20"/>
          <stop offset="1" stop-color="#6A9B3D" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="heroShell" x1="280" y1="22" x2="280" y2="538" gradientUnits="userSpaceOnUse">
          <stop stop-color="rgba(253,249,240,0.96)"/>
          <stop offset="1" stop-color="rgba(232,240,222,0.92)"/>
        </linearGradient>
        <radialGradient id="heroInner" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(280 280) rotate(90) scale(170 170)">
          <stop stop-color="rgba(255,255,255,0.90)"/>
          <stop offset="0.62" stop-color="rgba(248,242,229,0.58)"/>
          <stop offset="1" stop-color="rgba(106,155,61,0.20)"/>
        </radialGradient>
        <clipPath id="heroClip">
          <ellipse cx="280" cy="280" rx="196" ry="196"/>
        </clipPath>
        <pattern id="heroDots" width="12" height="12" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.6" fill="#07160f"/>
          <circle cx="8" cy="5" r="1.2" fill="#6f9e42"/>
          <circle cx="6" cy="10" r="1.1" fill="#fff5d8"/>
        </pattern>
        <filter id="duotone" x="-10%" y="-10%" width="120%" height="120%">
          <feColorMatrix
            type="matrix"
            values="
              0.2126 0.7152 0.0722 0 0
              0.2126 0.7152 0.0722 0 0
              0.2126 0.7152 0.0722 0 0
              0 0 0 1 0"
          />
          <feComponentTransfer>
            <feFuncR type="table" tableValues="0.027 0.435 1"/>
            <feFuncG type="table" tableValues="0.086 0.620 0.961"/>
            <feFuncB type="table" tableValues="0.059 0.259 0.847"/>
          </feComponentTransfer>
        </filter>
      </defs>

      <circle cx="280" cy="280" r="236" fill="url(#heroGlow)"/>
      <circle cx="470" cy="112" r="46" fill="rgba(255,255,255,0.34)" stroke="rgba(24,51,36,0.10)"/>
      <circle cx="112" cy="468" r="30" fill="rgba(248,242,229,0.85)" stroke="rgba(212,140,46,0.18)"/>

      <ellipse cx="280" cy="280" rx="258" ry="258" fill="url(#heroShell)" stroke="rgba(24,51,36,0.14)"/>
      <ellipse cx="280" cy="280" rx="226" ry="226" fill="url(#heroInner)" stroke="rgba(24,51,36,0.10)"/>
      <ellipse cx="280" cy="280" rx="198" ry="198" fill="#eef2df" stroke="rgba(24,51,36,0.12)"/>
      ${innerVisual}
      <ellipse cx="280" cy="280" rx="196" ry="196" fill="url(#heroDots)" opacity="0.20"/>
      <ellipse cx="280" cy="280" rx="196" ry="196" fill="url(#heroDots)" opacity="0.08" transform="rotate(9 280 280)"/>
      <ellipse cx="280" cy="280" rx="196" ry="196" fill="url(#heroInner)" opacity="0.28"/>
      <ellipse cx="280" cy="418" rx="118" ry="18" fill="rgba(255,255,255,0.35)"/>
    </svg>
  `);
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

function h(type: string, props: Record<string, unknown> | null, ...children: ReactNode[]) {
  return createElement(type, props, ...children);
}

const shellStyle: CSSProperties = {
  width: `${OG_WIDTH}px`,
  height: `${OG_HEIGHT}px`,
  display: 'flex',
  position: 'relative',
  overflow: 'hidden',
  background: 'linear-gradient(135deg, #fbf7eb 0%, #f4eedc 48%, #e8f0de 100%)',
  color: BODY_COLOR,
  fontFamily: 'Manrope',
};

const gridStyle: CSSProperties = {
  position: 'absolute',
  inset: '0px',
  backgroundImage:
    'linear-gradient(rgba(16,38,29,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(16,38,29,0.035) 1px, transparent 1px)',
  backgroundSize: '28px 28px',
  opacity: 0.7,
};

const fadeStyle: CSSProperties = {
  position: 'absolute',
  left: '0px',
  right: '0px',
  bottom: '0px',
  height: '160px',
  background: 'linear-gradient(180deg, rgba(251,247,235,0) 0%, rgba(16,26,18,0.08) 100%)',
};

const layoutStyle: CSSProperties = {
  position: 'relative',
  width: '100%',
  height: '100%',
  display: 'flex',
  padding: '52px 60px',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '40px',
};

const contentStyle: CSSProperties = {
  width: '620px',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
};

const eyebrowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  alignSelf: 'flex-start',
  padding: '10px 16px',
  borderRadius: '999px',
  border: '1px solid rgba(24,51,36,0.14)',
  background: 'rgba(255,255,255,0.55)',
  boxShadow: '0 8px 18px rgba(16,38,29,0.06)',
  color: '#375540',
  fontSize: '15px',
  fontWeight: 800,
  letterSpacing: '0.24em',
  textTransform: 'uppercase',
};

const badgeRowStyle: CSSProperties = {
  marginTop: '34px',
  display: 'flex',
  gap: '12px',
  flexWrap: 'wrap',
};

function badge(label: string, background = 'rgba(255,255,255,0.74)') {
  return h('div', {
    style: {
      display: 'flex',
      alignItems: 'center',
      padding: '10px 16px',
      borderRadius: '999px',
      border: '1px solid rgba(24,51,36,0.14)',
      background,
      color: '#294232',
      fontSize: '15px',
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
    } satisfies CSSProperties,
  }, label);
}

function visualPane(imageHref: string | null) {
  return h('div', {
    style: {
      width: '440px',
      height: '540px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      flexShrink: 0,
    } satisfies CSSProperties,
  },
  h('img', {
    src: buildDitheringVisualSvg(imageHref),
    width: '440',
    height: '440',
    style: {
      width: '440px',
      height: '440px',
      objectFit: 'contain',
    } satisfies CSSProperties,
  }));
}

function headingBlock(lines: string[], accentIndex?: number) {
  return h('div', {
    style: {
      marginTop: '22px',
      display: 'flex',
      flexDirection: 'column',
      gap: '2px',
      fontSize: '76px',
      lineHeight: 0.96,
      letterSpacing: '-0.08em',
      fontWeight: 800,
      maxWidth: '11ch',
    } satisfies CSSProperties,
  }, ...lines.map((line, index) => h('div', {
    style: {
      color: index === accentIndex ? '#49633c' : BODY_COLOR,
      display: 'flex',
    } satisfies CSSProperties,
  }, line)));
}

function paragraph(lines: string[]) {
  return h('div', {
    style: {
      marginTop: '26px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      maxWidth: '560px',
      fontSize: '28px',
      lineHeight: 1.35,
      color: MUTED_COLOR,
    } satisfies CSSProperties,
  }, ...lines.map((line) => h('div', { style: { display: 'flex' } }, line)));
}

async function resolveOgImageSrc(value?: string | null) {
  if (!value) return getLogoBase64();
  if (value.startsWith('data:')) return value;
  return await fetchImageAsDataUri(value);
}

async function renderSatoriSvg(node: ReactNode) {
  return await satori(node, {
    width: OG_WIDTH,
    height: OG_HEIGHT,
    fonts: await getSatoriFonts(),
  });
}

function homeNode() {
  return h('div', { style: shellStyle },
    h('div', { style: gridStyle }),
    h('div', { style: fadeStyle }),
    h('div', { style: layoutStyle },
      h('div', { style: contentStyle },
        h('div', { style: eyebrowStyle }, 'Prompt-to-plugin studio'),
        headingBlock(['Prompt to plugin.', 'Preview instantly.', 'Export VST3 + CLAP.']),
        paragraph([
          'Turn plain-language ideas into playable FX and synths,',
          'audition them in-browser, and ship native builds from one room.',
        ]),
        h('div', { style: badgeRowStyle },
          badge('Live preview'),
          badge('Faust-native', 'rgba(243,236,215,0.96)'),
          badge('Export-ready'),
        ),
      ),
      visualPane(getLogoBase64()),
    ),
  );
}

async function shareNode(args: ShareOgArgs) {
  const ownerName = truncate(args.ownerName, 34);
  const pluginName = truncate(args.pluginName, 92);
  const wrappedName = wrapWords(pluginName, 18, 4);
  const imageSrc = await resolveOgImageSrc(args.ownerImageUrl);
  const badges = [
    `${args.pluginType} patch`,
    `${args.versionCount} version${args.versionCount === 1 ? '' : 's'}`,
    ownerName,
  ];

  return h('div', { style: shellStyle },
    h('div', { style: gridStyle }),
    h('div', { style: fadeStyle }),
    h('div', { style: layoutStyle },
      h('div', { style: contentStyle },
        h('div', { style: eyebrowStyle }, 'Public effect share'),
        h('div', {
          style: {
            marginTop: '34px',
            display: 'flex',
            color: '#4e6a53',
            fontSize: '34px',
            fontWeight: 700,
          } satisfies CSSProperties,
        }, `${ownerName} shared`),
        headingBlock(wrappedName),
        paragraph([
          'Audition the live patch, inspect the generated Faust, and step through',
          'the current version stack inside Hayashi.',
        ]),
        h('div', { style: badgeRowStyle }, ...badges.map((item, index) =>
          badge(item, index === 0 ? 'rgba(243,236,215,0.96)' : 'rgba(255,255,255,0.74)'),
        )),
      ),
      visualPane(imageSrc),
    ),
  );
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
  const primarySecureImage = metadata.image.startsWith('https://')
    ? `<meta property="og:image:secure_url" content="${escapeHtml(metadata.image)}" />`
    : '';
  const secondaryImageBlock = metadata.secondaryImage
    ? `<meta property="og:image" content="${escapeHtml(metadata.secondaryImage)}" />`
    : '';
  const secondarySecureImage = metadata.secondaryImage?.startsWith('https://')
    ? `<meta property="og:image:secure_url" content="${escapeHtml(metadata.secondaryImage)}" />`
    : '';
  const secondaryImageType = metadata.secondaryImage
    ? `<meta property="og:image:type" content="image/svg+xml" />`
    : '';
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
    ${primarySecureImage}
    <meta property="og:image:alt" content="${escapeHtml(metadata.imageAlt)}" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content="${OG_WIDTH}" />
    <meta property="og:image:height" content="${OG_HEIGHT}" />
    ${secondaryImageBlock}
    ${secondarySecureImage}
    ${secondaryImageType}
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

export async function renderHomeOgSvg() {
  return await renderSatoriSvg(homeNode());
}

export async function renderShareOgSvg(args: ShareOgArgs) {
  return await renderSatoriSvg(await shareNode(args));
}

async function svgToPng(svg: string): Promise<Buffer> {
  const resvg = new Resvg(svg, {
    fitTo: {
      mode: 'width',
      value: OG_WIDTH,
    },
    font: {
      fontFiles: [],
      loadSystemFonts: true,
      defaultFontFamily: 'Manrope',
    },
  });
  const pngData = resvg.render();
  return pngData.asPng();
}

export async function renderHomeOgPng(): Promise<Buffer> {
  return await svgToPng(await renderHomeOgSvg());
}

export async function renderShareOgPng(args: ShareOgArgs): Promise<Buffer> {
  return await svgToPng(await renderShareOgSvg(args));
}
