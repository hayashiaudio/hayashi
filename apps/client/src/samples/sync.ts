import { getSample, storeSample } from './indexedDb';

export async function fetchMissingSample(
  assetId: string,
  storageUrl: string,
  meta: {
    name: string;
    mimeType: string;
    duration?: number;
    sampleRate?: number;
    channels?: number;
    waveformPeaks?: number[];
  }
): Promise<boolean> {
  const existing = await getSample(assetId);
  if (existing) return true;

  try {
    const res = await fetch(storageUrl);
    if (!res.ok) {
      console.warn('[fetchMissing] HTTP', res.status, storageUrl);
      return false;
    }
    const buffer = await res.arrayBuffer();
    await storeSample(assetId, meta.name, buffer, meta.mimeType, {
      duration: meta.duration,
      sampleRate: meta.sampleRate,
      channels: meta.channels,
      waveformPeaks: meta.waveformPeaks,
    }, storageUrl);
    return true;
  } catch (e) {
    console.warn('[fetchMissing] Failed to fetch sample', assetId, e);
    return false;
  }
}
