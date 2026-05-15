import { describe, it, expect } from "vitest";
import { decideCodeGating } from "../src/repo-intel/gating.js";

describe("decideCodeGating", () => {
  it("skips empty input", () => {
    expect(decideCodeGating("").skip).toBe(true);
    expect(decideCodeGating("   ").skip).toBe(true);
  });

  it("skips greetings (pt + en)", () => {
    expect(decideCodeGating("oi").skip).toBe(true);
    expect(decideCodeGating("olá!").skip).toBe(true);
    expect(decideCodeGating("hello").skip).toBe(true);
    expect(decideCodeGating("obrigado").skip).toBe(true);
    expect(decideCodeGating("thanks").skip).toBe(true);
    expect(decideCodeGating("tchau").skip).toBe(true);
  });

  it("skips meta-questions", () => {
    expect(decideCodeGating("que horas são?").skip).toBe(true);
    expect(decideCodeGating("what time is it").skip).toBe(true);
    expect(decideCodeGating("tudo bem?").skip).toBe(true);
    expect(decideCodeGating("how are you").skip).toBe(true);
  });

  it("skips low-information short prompts without code tokens", () => {
    expect(decideCodeGating("ok").skip).toBe(true);
    expect(decideCodeGating("legal").skip).toBe(true);
  });

  it("passes prompts with file-path tokens", () => {
    expect(decideCodeGating("explique src/agent/loop.ts").skip).toBe(false);
  });

  it("passes prompts with function-call syntax", () => {
    expect(decideCodeGating("como funciona fooBar()?").skip).toBe(false);
  });

  it("passes prompts with dotted identifiers", () => {
    expect(decideCodeGating("o que é foo.bar?").skip).toBe(false);
  });

  it("passes longer descriptive prompts even without code tokens", () => {
    expect(decideCodeGating("como funciona o sistema de hooks no projeto").skip).toBe(false);
  });

  it("skips very short prompts even with one significant word", () => {
    expect(decideCodeGating("hooks").skip).toBe(true);
  });
});
