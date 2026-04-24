import { describe, it, expect, beforeEach, vi } from "vitest";

interface FakeMemory {
  id: number;
  key: string;
  content: string;
  embedding: Buffer | null;
}

const store: FakeMemory[] = [];

const countMock = vi.fn(() => store.filter(m => m.embedding === null).length);
const getBatchMock = vi.fn((limit: number) =>
  store.filter(m => m.embedding === null).slice(0, limit),
);
const updateMock = vi.fn((key: string, buf: Buffer, _model: string) => {
  const target = store.find(m => m.key === key);
  if (target) target.embedding = buf;
});

vi.mock("../src/session/manager.js", () => ({
  countMemoriesWithoutEmbedding: () => countMock(),
  getMemoriesWithoutEmbedding: (limit: number) => getBatchMock(limit),
  updateMemoryEmbedding: (key: string, buf: Buffer, model: string) => updateMock(key, buf, model),
}));

const availableMock = vi.fn(async () => true);
const embedMock = vi.fn(async (_text: string) => Float32Array.from([0.1, 0.2]));
const providerMock = {
  name: "mock",
  model: "mock-embed",
  available: async () => availableMock(),
  embed: (text: string) => embedMock(text),
};
vi.mock("../src/memory/embeddings/index.js", () => ({
  getEmbeddingProvider: () => providerMock,
  isEmbeddingProviderAvailable: () => availableMock(),
  resetEmbeddingProviderCache: vi.fn(),
  EmbeddingProviderError: class {},
}));

import { backfillMissingEmbeddings } from "../src/memory/backfill.js";

function seed(keys: string[]) {
  store.length = 0;
  let id = 1;
  for (const k of keys) {
    store.push({ id: id++, key: k, content: `content-${k}`, embedding: null });
  }
}

beforeEach(() => {
  store.length = 0;
  countMock.mockClear();
  getBatchMock.mockClear();
  updateMock.mockClear();
  availableMock.mockReset();
  availableMock.mockResolvedValue(true);
  embedMock.mockReset();
  embedMock.mockImplementation(async () => Float32Array.from([0.1, 0.2]));
});

describe("backfillMissingEmbeddings", () => {
  it("aborts cleanly when provider is unavailable", async () => {
    seed(["a"]);
    availableMock.mockResolvedValue(false);
    const res = await backfillMissingEmbeddings();
    expect(res).toMatchObject({ aborted: true, reason: "provider-unavailable" });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("returns immediately with total=0 when there is nothing to backfill", async () => {
    const res = await backfillMissingEmbeddings();
    expect(res).toMatchObject({ processed: 0, failed: 0, total: 0, aborted: false, reason: "completed" });
    expect(embedMock).not.toHaveBeenCalled();
  });

  it("processes all memories in batches and updates each row", async () => {
    seed(["a", "b", "c", "d"]);
    const res = await backfillMissingEmbeddings({ batchSize: 2 });
    expect(res).toMatchObject({ processed: 4, failed: 0, total: 4, aborted: false, reason: "completed" });
    expect(embedMock).toHaveBeenCalledTimes(4);
    expect(updateMock).toHaveBeenCalledTimes(4);
    for (const mem of store) {
      expect(mem.embedding).toBeInstanceOf(Buffer);
    }
  });

  it("reports progress after each item", async () => {
    seed(["a", "b", "c"]);
    const progress: Array<[number, number]> = [];
    await backfillMissingEmbeddings({
      batchSize: 2,
      onProgress: (d, t) => progress.push([d, t]),
    });
    expect(progress).toEqual([[1, 3], [2, 3], [3, 3]]);
  });

  it("retries transient per-item failures on the next batch loop", async () => {
    seed(["a", "b", "c"]);
    let bAttempts = 0;
    embedMock.mockImplementation(async (text) => {
      if (text === "content-b") {
        bAttempts++;
        if (bAttempts === 1) throw new Error("transient");
      }
      return Float32Array.from([0.1, 0.2]);
    });

    const res = await backfillMissingEmbeddings({ batchSize: 5 });
    expect(res.processed).toBe(3);
    expect(res.failed).toBe(1);
    expect(res.aborted).toBe(false);
    expect(store.every(m => m.embedding !== null)).toBe(true);
  });

  it("aborts after N consecutive failures (provider died mid-run)", async () => {
    seed(["a", "b", "c", "d", "e"]);
    embedMock.mockImplementation(async () => {
      throw new Error("dead");
    });

    const res = await backfillMissingEmbeddings({
      batchSize: 5,
      maxConsecutiveFailures: 3,
    });
    expect(res.aborted).toBe(true);
    expect(res.reason).toBe("consecutive-failures");
    expect(res.failed).toBe(3);
    expect(res.processed).toBe(0);
  });

  it("is resumable: items processed in first run are not retried on second run", async () => {
    seed(["a", "b", "c"]);
    await backfillMissingEmbeddings({ batchSize: 10 });
    embedMock.mockClear();
    const res2 = await backfillMissingEmbeddings({ batchSize: 10 });
    expect(res2.total).toBe(0);
    expect(embedMock).not.toHaveBeenCalled();
  });

  it("honors an abort signal between iterations", async () => {
    seed(["a", "b", "c"]);
    const ctrl = new AbortController();
    embedMock.mockImplementation(async () => {
      ctrl.abort();
      return Float32Array.from([0.1, 0.2]);
    });
    const res = await backfillMissingEmbeddings({ batchSize: 5, signal: ctrl.signal });
    expect(res.aborted).toBe(true);
    expect(res.reason).toBe("signal");
    expect(res.processed).toBe(1);
  });
});
