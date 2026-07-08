import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import apiModule from "../../../static/api.js";

const { mapLimit, getJSON, ServiceError } = apiModule;

describe("mapLimit", () => {
  it("preserves output order regardless of completion order", async () => {
    const items = [30, 10, 20, 5, 15];
    const results = await mapLimit(items, 3, (ms) => new Promise((r) => setTimeout(() => r(ms * 2), ms)));
    expect(results).toEqual(items.map((ms) => ms * 2));
  });

  it("never runs more than `limit` tasks concurrently", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const items = Array.from({ length: 10 }, (_, i) => i);
    await mapLimit(items, 3, async (i) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return i;
    });
    expect(maxInFlight).toBeLessThanOrEqual(3);
  });

  it("handles an empty item list", async () => {
    const results = await mapLimit([], 5, () => Promise.resolve(1));
    expect(results).toEqual([]);
  });

  it("handles a limit larger than the item count", async () => {
    const results = await mapLimit([1, 2], 10, (x) => Promise.resolve(x + 1));
    expect(results).toEqual([2, 3]);
  });
});

describe("getJSON", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns parsed JSON on a 200 response", async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ hello: "world" }) });
    const data = await getJSON("https://example.com/api");
    expect(data).toEqual({ hello: "world" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("throws a ServiceError immediately on a non-retryable status (e.g. 404)", async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 404 });
    await expect(getJSON("https://example.com/api")).rejects.toThrow(ServiceError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("includes the failing host and status in the error message", async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 404 });
    await expect(getJSON("https://example.com/api")).rejects.toThrow(/404.*example\.com/);
  });

  it("retries once on 429 then succeeds", async () => {
    fetch
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ recovered: true }) });
    const data = await getJSON("https://example.com/api");
    expect(data).toEqual({ recovered: true });
    expect(fetch).toHaveBeenCalledTimes(2);
  }, 10000);

  it("retries on 503 the same as 429", async () => {
    fetch
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ recovered: true }) });
    const data = await getJSON("https://example.com/api");
    expect(data).toEqual({ recovered: true });
  }, 10000);

  it("gives up after exhausting retries and throws", async () => {
    fetch.mockResolvedValue({ ok: false, status: 429 });
    await expect(getJSON("https://example.com/api", 1)).rejects.toThrow(ServiceError);
    expect(fetch).toHaveBeenCalledTimes(2); // initial attempt + 1 retry
  }, 10000);
});
