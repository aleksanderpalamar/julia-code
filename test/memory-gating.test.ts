import { describe, it, expect } from "vitest";
import { decideGating } from "../src/memory/gating.js";

describe("decideGating — layer 1 (heuristic)", () => {
  it("skips empty or whitespace input", () => {
    expect(decideGating("").skip).toBe(true);
    expect(decideGating("   \n\t  ").skip).toBe(true);
  });

  it("skips pure greetings (pt-br and en)", () => {
    for (const g of ["oi", "Oi!", "Olá", "olá.", "ola", "hello", "Hi", "hey", "bom dia", "Boa noite!", "tudo bem?"]) {
      expect(decideGating(g)).toMatchObject({ skip: true, reason: "greeting" });
    }
  });

  it("does NOT skip 'qual meu OS?' (short but informative — the bug fix)", () => {
    expect(decideGating("qual meu OS?")).toMatchObject({ skip: false });
  });

  it("does NOT skip short technical questions with 2+ significant tokens", () => {
    expect(decideGating("deploy target?")).toMatchObject({ skip: false });
    expect(decideGating("run tests")).toMatchObject({ skip: false });
    expect(decideGating("what's my shell?")).toMatchObject({ skip: false });
  });

  it("skips greeting-like inputs even when longer", () => {
    expect(decideGating("oi tudo bem?")).toMatchObject({ skip: true });
  });

  it("skips single-word low-information input", () => {
    expect(decideGating("eu")).toMatchObject({ skip: true, reason: "low-information" });
    expect(decideGating("yes")).toMatchObject({ skip: true, reason: "low-information" });
    expect(decideGating("ok")).toMatchObject({ skip: true, reason: "low-information" });
  });

  it("does NOT skip long exploratory questions", () => {
    expect(decideGating("Como está a cobertura de testes do pipeline de orchestrator?")).toMatchObject({ skip: false });
  });
});

describe("decideGating — layer 2 (custom gate)", () => {
  it("consults the custom gate when provided and heuristic allows", () => {
    const result = decideGating("deploy target?", {
      customGate: () => ({ skip: true, reason: "custom-rule" }),
    });
    expect(result).toMatchObject({ skip: true, reason: "custom-rule" });
  });

  it("custom gate returning null or undefined lets heuristic result pass through", () => {
    const passThroughNull = decideGating("deploy target?", { customGate: () => null });
    const passThroughUndef = decideGating("deploy target?", { customGate: () => undefined });
    expect(passThroughNull.skip).toBe(false);
    expect(passThroughUndef.skip).toBe(false);
  });

  it("custom gate is NOT consulted when heuristic already rejected the input", () => {
    let called = false;
    const result = decideGating("oi", {
      customGate: () => { called = true; return { skip: false }; },
    });
    expect(called).toBe(false);
    expect(result.skip).toBe(true);
  });
});
