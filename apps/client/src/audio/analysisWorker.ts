export interface AnalysisResult {
  spectrum: number[];
  centroid: number;
  rms: number;
  zcr: number;
  peakDb: number;
}

function computeCentroid(magnitudes: Float32Array, sampleRate: number): number {
  let sum = 0;
  let weightedSum = 0;
  for (let i = 0; i < magnitudes.length; i++) {
    const freq = (i * sampleRate) / (2 * magnitudes.length);
    sum += magnitudes[i];
    weightedSum += magnitudes[i] * freq;
  }
  return sum > 0 ? weightedSum / sum : 0;
}

function computeRMS(timeDomain: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < timeDomain.length; i++) {
    sum += timeDomain[i] * timeDomain[i];
  }
  return Math.sqrt(sum / timeDomain.length);
}

function computeZCR(timeDomain: Float32Array): number {
  let crossings = 0;
  for (let i = 1; i < timeDomain.length; i++) {
    if ((timeDomain[i] >= 0 && timeDomain[i - 1] < 0) || (timeDomain[i] < 0 && timeDomain[i - 1] >= 0)) {
      crossings++;
    }
  }
  return crossings / (timeDomain.length - 1);
}

function computePeakDb(timeDomain: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < timeDomain.length; i++) {
    const abs = Math.abs(timeDomain[i]);
    if (abs > peak) peak = abs;
  }
  return 20 * Math.log10(peak + 1e-10);
}

self.onmessage = (e: MessageEvent) => {
  const { frequencyData, timeDomainData, sampleRate } = e.data;
  const freq = new Float32Array(frequencyData);
  const time = new Float32Array(timeDomainData);

  const binSize = Math.floor(freq.length / 64);
  const spectrum: number[] = [];
  for (let i = 0; i < 64; i++) {
    let sum = 0;
    for (let j = 0; j < binSize; j++) {
      sum += freq[i * binSize + j];
    }
    const avgDb = sum / binSize;
    spectrum.push(Math.max(0, (avgDb + 100) / 100));
  }

  const result: AnalysisResult = {
    spectrum,
    centroid: computeCentroid(freq, sampleRate),
    rms: computeRMS(time),
    zcr: computeZCR(time),
    peakDb: computePeakDb(time),
  };

  self.postMessage(result, [frequencyData.buffer, timeDomainData.buffer]);
};
