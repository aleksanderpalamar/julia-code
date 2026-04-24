import { describe, it, expect } from "vitest";
import { cosine, recencyScore, bufferToFloat32, float32ToBuffer } from "../src/memory/similarity.js";

describe("cosine", () => {
  it("returns 1 for identical vectors", () => {
    const a = Float32Array.from([1, 0, 0]);
    expect(cosine(a, Float32Array.from([1, 0, 0]))).toBeCloseTo(1, 6);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosine(Float32Array.from([1, 0]), Float32Array.from([0, 1]))).toBeCloseTo(0, 6);
  });

  it("returns -1 for anti-parallel vectors", () => {
    expect(cosine(Float32Array.from([1, 2, 3]), Float32Array.from([-1, -2, -3]))).toBeCloseTo(-1, 6);
  });

  it("returns 0 when any vector is all zeros", () => {
    expect(cosine(Float32Array.from([0, 0, 0]), Float32Array.from([1, 1, 1]))).toBe(0);
  });

  it("returns 0 for length mismatch (defensive)", () => {
    expect(cosine(Float32Array.from([1, 2]), Float32Array.from([1, 2, 3]))).toBe(0);
  });
});

describe("recencyScore (exponential decay)", () => {
  const now = Date.parse("2026-04-24T12:00:00Z");

  it("returns 1 at age 0", () => {
    const iso = new Date(now).toISOString();
    expect(recencyScore(iso, 30, now)).toBeCloseTo(1, 6);
  });

  it("returns 0.5 at exactly one halflife", () => {
    const iso = new Date(now - 30 * 86_400_000).toISOString();
    expect(recencyScore(iso, 30, now)).toBeCloseTo(0.5, 4);
  });

  it("returns ~0.25 at two halflives", () => {
    const iso = new Date(now - 60 * 86_400_000).toISOString();
    expect(recencyScore(iso, 30, now)).toBeCloseTo(0.25, 3);
  });

  it("stays between 0 and 1 even for very old memories", () => {
    const iso = new Date(now - 365 * 10 * 86_400_000).toISOString();
    const s = recencyScore(iso, 30, now);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThan(0.01);
  });

  it("returns 0 for unparseable dates", () => {
    expect(recencyScore("not-a-date", 30, now)).toBe(0);
  });

  it("returns 0 when halflife is non-positive", () => {
    const iso = new Date(now - 86_400_000).toISOString();
    expect(recencyScore(iso, 0, now)).toBe(0);
  });
});

describe("bufferToFloat32 / float32ToBuffer", () => {
  it("round-trips a Float32Array via Buffer", () => {
    const original = Float32Array.from([0.1, -0.5, 0.999, 1e-6]);
    const buf = float32ToBuffer(original);
    expect(buf).toBeInstanceOf(Buffer);
    const roundTrip = bufferToFloat32(buf);
    expect(roundTrip.length).toBe(original.length);
    for (let i = 0; i < original.length; i++) {
      expect(roundTrip[i]).toBeCloseTo(original[i], 6);
    }
  });
});
