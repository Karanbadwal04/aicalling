import alawmulaw from "alawmulaw";

// Simple linear interpolation for low-latency voice streaming.
export function mulaw8kToPcm16k(base64) {
  const ulaw = Buffer.from(base64, "base64");
  const decoded = alawmulaw.mulaw.decode(ulaw);

  // Upsample 8 kHz -> 16 kHz.
  const output = new Int16Array(decoded.length * 2);
  for (let i = 0; i < decoded.length; i++) {
    const current = decoded[i];
    const next = decoded[Math.min(i + 1, decoded.length - 1)];
    output[i * 2] = current;
    output[i * 2 + 1] = Math.round((current + next) / 2);
  }

  return Buffer.from(
    output.buffer,
    output.byteOffset,
    output.byteLength
  ).toString("base64");
}

export function pcm24kToMulaw8k(base64) {
  const pcm = Buffer.from(base64, "base64");
  if (pcm.length < 2) return "";

  // Read little-endian signed 16-bit samples.
  const sampleCount = Math.floor(pcm.length / 2);
  const input = new Int16Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    input[i] = pcm.readInt16LE(i * 2);
  }

  // 24 kHz -> 8 kHz decimation with 3-sample averaging for smoother sound
  const output = new Int16Array(Math.floor(input.length / 3));
  for (let i = 0, j = 0; i + 2 < input.length; i += 3, j++) {
    output[j] = Math.round((input[i] + input[i + 1] + input[i + 2]) / 3);
  }

  return Buffer.from(alawmulaw.mulaw.encode(output)).toString("base64");
}
