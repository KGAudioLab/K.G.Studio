function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++)
    view.setUint8(offset + i, str.charCodeAt(i));
}

export async function sliceAudioToWav(
  arrayBuffer: ArrayBuffer,
  startSeconds: number,
  durationSeconds: number
): Promise<ArrayBuffer> {
  const audioCtx = new AudioContext();
  const decoded = await audioCtx.decodeAudioData(arrayBuffer);
  audioCtx.close();

  const { sampleRate, numberOfChannels: numCh } = decoded;
  const startSample = Math.floor(startSeconds * sampleRate);
  const numSamples = Math.min(
    Math.floor(durationSeconds * sampleRate),
    decoded.length - startSample
  );

  const bytesPerSample = 2; // 16-bit PCM
  const dataSize = numSamples * numCh * bytesPerSample;
  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numCh, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numCh * bytesPerSample, true);
  view.setUint16(32, numCh * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let ch = 0; ch < numCh; ch++) {
      const s = decoded.getChannelData(ch)[startSample + i];
      const c = Math.max(-1, Math.min(1, s));
      view.setInt16(offset, c < 0 ? c * 32768 : c * 32767, true);
      offset += 2;
    }
  }

  return buf;
}
