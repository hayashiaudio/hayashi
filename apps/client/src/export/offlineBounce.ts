export async function exportWav(
  renderFn: (ctx: OfflineAudioContext) => Promise<void> | void,
  durationSeconds: number,
  sampleRate = 48000,
  bitDepth: 16 | 24 = 16
): Promise<Blob> {
  console.log('[Hayashi] exportWav: duration=', durationSeconds, 'sr=', sampleRate, 'samples=', Math.round(durationSeconds * sampleRate));
  const offlineCtx = new OfflineAudioContext(2, durationSeconds * sampleRate, sampleRate);
  await renderFn(offlineCtx);
  const rendered = await offlineCtx.startRendering();

  // Check if rendered buffer is silent
  let maxAmp = 0;
  for (let c = 0; c < rendered.numberOfChannels; c++) {
    const data = rendered.getChannelData(c);
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > maxAmp) maxAmp = abs;
    }
  }
  console.log('[Hayashi] exportWav: rendered', rendered.duration, 's, channels=', rendered.numberOfChannels, 'maxAmp=', maxAmp);

  return audioBufferToWavBlob(rendered, bitDepth);
}

function audioBufferToWavBlob(buffer: AudioBuffer, bitDepth: 16 | 24 = 16): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;

  const dataLength = buffer.length * numChannels * bytesPerSample;
  const headerLength = 44;
  const totalLength = headerLength + dataLength;

  const arrayBuffer = new ArrayBuffer(totalLength);
  const view = new DataView(arrayBuffer);

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }

  writeString(0, 'RIFF');
  view.setUint32(4, totalLength - 8, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, 'data');
  view.setUint32(40, dataLength, true);

  let offset = 44;
  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) channels.push(buffer.getChannelData(c));

  if (bitDepth === 16) {
    for (let i = 0; i < buffer.length; i++) {
      for (let c = 0; c < numChannels; c++) {
        const sample = Math.max(-1, Math.min(1, channels[c][i]));
        const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        view.setInt16(offset, intSample, true);
        offset += bytesPerSample;
      }
    }
  } else {
    // 24-bit: store in a Uint8Array view for byte-level writing
    const dataView = new Uint8Array(arrayBuffer, headerLength, dataLength);
    let byteOffset = 0;
    for (let i = 0; i < buffer.length; i++) {
      for (let c = 0; c < numChannels; c++) {
        const sample = Math.max(-1, Math.min(1, channels[c][i]));
        const intSample = sample < 0
          ? Math.round(sample * 0x800000)
          : Math.round(sample * 0x7fffff);
        // Write 3 bytes little-endian
        dataView[byteOffset] = intSample & 0xff;
        dataView[byteOffset + 1] = (intSample >> 8) & 0xff;
        dataView[byteOffset + 2] = (intSample >> 16) & 0xff;
        byteOffset += 3;
      }
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}
