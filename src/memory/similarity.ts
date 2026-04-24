export function cosine(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    const av = a[i];
    const bv = b[i];
    dot += av * bv;
    magA += av * av;
    magB += bv * bv;
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

export function recencyScore(createdAtIso: string, halflifeDays: number, now: number = Date.now()): number {
  const created = Date.parse(createdAtIso);
  if (!Number.isFinite(created)) return 0;
  const ageDays = Math.max(0, (now - created) / 86_400_000);
  if (halflifeDays <= 0) return 0;
  return Math.exp(-Math.LN2 * (ageDays / halflifeDays));
}

export function bufferToFloat32(buf: Buffer): Float32Array {
  const copy = new ArrayBuffer(buf.byteLength);
  new Uint8Array(copy).set(buf);
  return new Float32Array(copy);
}

export function float32ToBuffer(vec: Float32Array): Buffer {
  return Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
}
