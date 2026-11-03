import { it, expect, vi, afterEach } from "vitest";
import { createWorkerHintProvider } from "./worker-provider.js";
import { newGame } from "../game/game.js";
const state = newGame("0".repeat(81));
function setup() {
  const worker = {
    terminate: vi.fn(),
    postMessage: vi.fn(),
    onmessage: null,
    onerror: null,
    onmessageerror: null,
  };
  return {
    worker,
    provider: createWorkerHintProvider({
      makeWorker: () => /** @type {any} */ (worker),
      timeoutMs: 100,
    }),
  };
}
afterEach(() => vi.useRealTimers());
it("rejects stale IDs/fingerprints and terminates on successful null response", async () => {
  const { worker, provider } = setup();
  const p = provider(state, { signal: new AbortController().signal });
  const request = worker.postMessage.mock.calls[0][0];
  worker.onmessage({ data: { ...request, id: request.id - 1, hint: null } });
  expect(worker.terminate).not.toHaveBeenCalled();
  worker.onmessage({ data: { ...request, key: "stale", hint: null } });
  expect(worker.terminate).not.toHaveBeenCalled();
  worker.onmessage({ data: { ...request, hint: null } });
  await expect(p).resolves.toBe(null);
  expect(worker.terminate).toHaveBeenCalledOnce();
});
it("terminates synchronous searches on abort and ignores late messages", async () => {
  const { worker, provider } = setup(),
    controller = new AbortController();
  const p = provider(state, { signal: controller.signal });
  controller.abort();
  await expect(p).rejects.toMatchObject({ name: "AbortError" });
  const request = worker.postMessage.mock.calls[0][0];
  worker.onmessage({ data: { ...request, hint: null } });
  expect(worker.terminate).toHaveBeenCalledOnce();
});
it("terminates on timeout/error and does not start already aborted requests", async () => {
  vi.useFakeTimers();
  const { worker, provider } = setup();
  const p = provider(state, { signal: new AbortController().signal });
  const assertion = expect(p).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(101);
  await assertion;
  expect(worker.terminate).toHaveBeenCalledOnce();
  const c = new AbortController();
  c.abort();
  await expect(provider(state, { signal: c.signal })).rejects.toMatchObject({ name: "AbortError" });
  expect(worker.postMessage).toHaveBeenCalledOnce();
});
