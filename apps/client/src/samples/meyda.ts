import Meyda from 'meyda';

export function createMeydaAnalyzer(
  sourceNode: AudioNode,
  ctx: AudioContext,
  features: string[] = ['rms', 'spectralCentroid', 'zcr']
) {
  const analyzer = Meyda.createMeydaAnalyzer({
    audioContext: ctx,
    source: sourceNode as unknown as AudioNode & { connect: AudioNode['connect'] },
    bufferSize: 512,
    featureExtractors: features,
    callback: (features: Partial<Record<string, number>>) => {
      console.log('[Hayashi] Meyda features', features);
    },
  });
  return analyzer;
}
