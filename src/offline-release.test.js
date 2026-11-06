import { expect, it } from "vitest";
import { fixture } from "../offline/test-fixture.js";

it("stages a complete verified release before explicit activation, reusing an unchanged bank", async () => {
  const x = await fixture();
  const old = await x.release("old");
  await x.store.stage(old);
  expect(await x.store.active()).toBeNull();
  await x.store.activate("old");
  const next = await x.release("new");
  await x.store.stage(next);
  expect((await x.store.active()).version).toBe("old");
  expect(x.requests.filter((r) => r.url.includes("banks/"))).toHaveLength(1);
  await x.store.activate("new");
  expect((await x.store.active()).version).toBe("new");
  expect(await (await x.store.asset("old", "index.html")).text()).toBe("old");
  expect(x.requests.every((r) => r.options.cache === "no-store")).toBe(true);
});
it.each(["corrupt", "interrupted", "mismatch"])(
  "preserves the old release on %s staging",
  async (fault) => {
    const x = await fixture();
    await x.store.stage(await x.release("old"));
    await x.store.activate("old");
    const next = await x.release("new", '"new bank"');
    if (fault === "corrupt") x.bodies.set(next.bank.path, "bad bytes");
    if (fault === "interrupted") x.bodies.set(next.bank.path, new Error("disconnected"));
    if (fault === "mismatch") x.bodies.set("version.json", "{}");
    await expect(x.store.stage(next)).rejects.toThrow();
    await expect(x.store.activate("new")).rejects.toThrow();
    expect((await x.store.active()).version).toBe("old");
    expect(await (await x.store.asset("old", "index.html")).text()).toBe("old");
  }
);
