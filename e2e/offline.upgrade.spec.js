import { test as base, expect } from "@playwright/test";
import { upgradeServer } from "./upgrade-server.js";
import { cell, expectValue, DEMO_PUZZLE } from "./helpers.js";
const test = base.extend({
  // eslint-disable-next-line no-empty-pattern
  deployment: async ({}, use) => {
    const server = await upgradeServer();
    await use(server);
    await server.close();
  },
});
const start = (page) => page.getByRole("button", { name: /^(Play|Start puzzle)$/, exact: true });
const notice = (page) => page.locator(".update-notice.active");
async function check(page) {
  await page.clock.setSystemTime(new Date(await page.evaluate(() => Date.now() + 60_000)));
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }))
  );
}
test("first visit blocks play until complete; a failed bank download has a working retry", async ({
  page,
  deployment,
}) => {
  const release = deployment.holdBank();
  await page.goto(deployment.url);
  await expect(page.getByRole("heading", { name: "Preparing puzzles" })).toBeVisible();
  await expect(start(page)).toHaveCount(0);
  await expect
    .poll(() => deployment.requests.filter((url) => url.includes("/banks/")).length)
    .toBe(1);
  deployment.fault("bank-corrupt");
  release();
  await expect(page.getByRole("heading", { name: "Could not prepare puzzles" })).toBeVisible();
  await expect(start(page)).toHaveCount(0);
  deployment.fault("");
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(start(page)).toBeVisible();
  expect(await page.evaluate(() => navigator.serviceWorker.controller.scriptURL)).toBe(
    `${deployment.url}sw.js`
  );
  expect(
    await page.evaluate(() => Object.keys(globalThis.__sudokuPuzzleBank).length)
  ).toBeGreaterThan(400);
});
test("first visit stays blocked while any offline shell entry is missing", async ({
  page,
  deployment,
}) => {
  const release = deployment.holdAsset("apple-touch-icon.png");
  try {
    await page.goto(deployment.url);
    await expect(page.getByRole("heading", { name: "Preparing puzzles" })).toBeVisible();
    await expect
      .poll(() =>
        deployment.requests.some((url) => url.includes("apple-touch-icon.png?_sudoku_check="))
      )
      .toBe(true);
    await expect(start(page)).toHaveCount(0);
    expect(await page.evaluate(() => globalThis.__sudokuPuzzleBank)).toBeUndefined();
  } finally {
    release();
  }
  await expect(start(page)).toBeVisible();
  expect(
    await page.evaluate(async () => {
      const cache = await caches.open(
        (await caches.keys()).find((name) => name.endsWith(":release:old"))
      );
      const manifest = await (await cache.match(new URL("__ready", location.href))).json();
      return Promise.all(
        [...manifest.assets, manifest.bank].map(async (entry) => {
          const response = await cache.match(new URL(entry.path, location.href));
          if (!response) return false;
          const hash = [
            ...new Uint8Array(await crypto.subtle.digest("SHA-256", await response.arrayBuffer())),
          ]
            .map((n) => n.toString(16).padStart(2, "0"))
            .join("");
          return hash === entry.hash;
        })
      );
    })
  ).not.toContain(false);
});

// Observe from document creation: a transient preparing screen is a regression,
// even if it has disappeared by the time Play becomes visible.
async function observePreparation(context) {
  await context.addInitScript(() => {
    window.__preparingSeen = [];
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (/Preparing puzzles|Downloading puzzles/.test(node.textContent || ""))
            window.__preparingSeen.push(node.textContent);
        }
      }
    }).observe(document, { childList: true, subtree: true });
  });
}

test("verified warm launches never show preparation and work on fresh offline navigation", async ({
  page,
  context,
  deployment,
}) => {
  await observePreparation(context);
  await page.goto(`${deployment.url}?q=${DEMO_PUZZLE}&keep=yes#board`);
  await start(page).click();
  await cell(page, 0).click();
  await page.keyboard.press("4");
  expect(await page.evaluate(() => window.__preparingSeen.length)).toBeGreaterThan(0);
  const catalogPath = await page.evaluate(() => globalThis.__sudokuBankCatalog.path);
  // Keep the NYT reuse assertion separate from the additional manifest asset.
  const banks = () =>
    deployment.requests.filter((url) => url.includes("/banks/") && !url.includes(catalogPath));
  expect(banks()).toHaveLength(1);
  await page.reload();
  await expect(start(page)).toBeVisible();
  expect(await page.evaluate(() => window.__preparingSeen)).toEqual([]);
  await context.setOffline(true);
  await page.reload();
  await start(page).click();
  await expectValue(page, 0, 4);
  expect(await page.evaluate(() => window.__preparingSeen)).toEqual([]);
  const fresh = await context.newPage();
  await fresh.goto(`${deployment.url}?q=${DEMO_PUZZLE}&keep=yes#board`);
  await start(fresh).click();
  await expectValue(fresh, 0, 4);
  expect(await fresh.evaluate(() => window.__preparingSeen)).toEqual([]);
  expect(await fresh.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  expect(banks()).toHaveLength(1);
});

test("warm boot does not wait for service worker registration network checks", async ({
  page,
  context,
  deployment,
}) => {
  await page.goto(deployment.url);
  await expect(start(page)).toBeVisible();
  // Model a register/update request whose network never responds. The real
  // controlling worker and all cached release verification remain in use.
  await context.addInitScript(() => {
    navigator.serviceWorker.register = () => new Promise(() => {});
  });
  await page.reload();
  await expect(start(page)).toBeVisible({ timeout: 3000 });
});

test("warm launch bypasses a blocked background update without changing the active release", async ({
  page,
  context,
  deployment,
}) => {
  await observePreparation(context);
  await page.goto(`${deployment.url}?q=${DEMO_PUZZLE}`);
  await start(page).click();
  await cell(page, 0).click();
  await page.keyboard.press("4");
  const release = deployment.holdBank();
  deployment.publish("next");
  await check(page);
  await expect
    .poll(() => deployment.requests.filter((url) => url.includes("/banks/")).length)
    .toBe(2);
  try {
    const fresh = await context.newPage();
    await fresh.goto(`${deployment.url}?q=${DEMO_PUZZLE}`);
    await expect(start(fresh)).toBeVisible({ timeout: 3000 });
    expect(await fresh.evaluate(() => window.__preparingSeen)).toEqual([]);
    await start(fresh).click();
    await expectValue(fresh, 0, 4);
    await expect(fresh.locator('meta[name="sudoku-build"]')).toHaveAttribute("content", "old");
    expect(await fresh.evaluate(() => globalThis.__sudokuPuzzleBank["2099-01-01"])).toBeUndefined();
    release();
    await expect(notice(page)).toBeVisible();
    await expectValue(fresh, 0, 4);
  } finally {
    release();
  }
});

test("preparation notifications do not break already-open clients using the original reply protocol", async ({
  page,
  deployment,
}) => {
  await page.goto(deployment.url);
  await expect(start(page)).toBeVisible();
  await page.evaluate(async () => {
    const cache = await caches.open(
      (await caches.keys()).find((name) => name.endsWith(":release:old"))
    );
    const bank = (await cache.keys()).find((request) => request.url.includes("/banks/"));
    await cache.delete(bank);
    window.__legacyReplies = [];
    const channel = new MessageChannel();
    channel.port1.onmessage = ({ data }) => window.__legacyReplies.push(data);
    navigator.serviceWorker.controller.postMessage(
      {
        type: "PREPARE",
        current: { version: "old", builtAt: 1000 },
      },
      [channel.port2]
    );
  });
  await expect.poll(() => page.evaluate(() => window.__legacyReplies.length)).toBeGreaterThan(0);
  const first = await page.evaluate(() => window.__legacyReplies[0]);
  expect(first.state).toBeUndefined();
  expect(Object.keys(first.value).length).toBeGreaterThan(400);
});

test("second launch and an app-only update reuse the bank, and activate fully offline", async ({
  page,
  context,
  deployment,
}) => {
  await page.goto(`${deployment.url}?q=${DEMO_PUZZLE}&keep=yes#board`);
  await start(page).click();
  const catalogPath = await page.evaluate(() => globalThis.__sudokuBankCatalog.path);
  // Keep the NYT reuse assertion separate from the additional manifest asset.
  const banks = () =>
    deployment.requests.filter((url) => url.includes("/banks/") && !url.includes(catalogPath));
  expect(banks()).toHaveLength(1);
  await page.reload();
  await start(page).click();
  expect(banks()).toHaveLength(1);
  deployment.publish();
  await check(page);
  await expect(notice(page)).toBeVisible();
  expect(banks()).toHaveLength(1);
  await context.setOffline(true);
  await notice(page).getByRole("button", { name: "Update", exact: true }).click();
  await expect(page.locator('meta[name="sudoku-build"]')).toHaveAttribute("content", "new");
  await start(page).click();
  await cell(page, 0).click();
  await page.keyboard.press("4");
  await expectValue(page, 0, 4);
  expect(new URL(page.url()).searchParams.get("keep")).toBe("yes");
  expect(new URL(page.url()).hash).toBe("#board");
});

for (const fault of ["bank-corrupt", "bank-interrupted", "manifest-change"]) {
  test(`a ${fault} update preserves the complete old bank and offline shell`, async ({
    page,
    context,
    deployment,
  }) => {
    await page.goto(deployment.url);
    await start(page).click();
    const oldBank = await page.evaluate(() => globalThis.__sudokuPuzzleBank);
    deployment.publish("next");
    deployment.fault(fault);
    await check(page);
    await expect
      .poll(() => deployment.requests.filter((url) => url.includes("/banks/")).length)
      .toBeGreaterThan(1);
    await page.waitForTimeout(300);
    await expect(notice(page)).toHaveCount(0);
    await context.setOffline(true);
    await page.reload();
    await start(page).click();
    expect(await page.evaluate(() => globalThis.__sudokuPuzzleBank)).toEqual(oldBank);
    await expect(page.locator('meta[name="sudoku-build"]')).toHaveAttribute("content", "old");
    await expect(page.locator(".board > .cell")).toHaveCount(81);
    await context.setOffline(false);
    deployment.fault("");
    await check(page);
    await expect(notice(page)).toBeVisible();
    await context.setOffline(true);
    await notice(page).getByRole("button", { name: "Update", exact: true }).click();
    await expect(page.locator('meta[name="sudoku-build"]')).toHaveAttribute("content", "next");
    await expect(start(page)).toBeVisible();
    expect(await page.evaluate(() => globalThis.__sudokuPuzzleBank["2099-01-01"])).toBeTruthy();
  });
}

test("new shell and complete bank activate together while an old tab keeps its assets and cannot save stale progress", async ({
  page,
  context,
  deployment,
}) => {
  const url = `${deployment.url}?q=${DEMO_PUZZLE}&keep=yes#board`;
  await page.goto(url);
  await start(page).click();
  await cell(page, 0).click();
  await page.keyboard.press("4");
  const oldPage = await context.newPage();
  await oldPage.goto(url);
  await start(oldPage).click();
  await expectValue(oldPage, 0, 4);
  deployment.publish("next");
  await check(page);
  await expect(notice(page)).toBeVisible();
  const oldAssets = await oldPage.evaluate(() =>
    [...document.querySelectorAll('link[rel="stylesheet"]')].map((link) => link.href)
  );
  await context.setOffline(true);
  await notice(page).getByRole("button", { name: "Update", exact: true }).click();
  await expect(page.locator('meta[name="sudoku-build"]')).toHaveAttribute("content", "next");
  await start(page).click();
  await expectValue(page, 0, 4);
  await cell(page, 0).click();
  await page.keyboard.press("2");
  await expectValue(page, 0, 2);
  const saved = await page.evaluate(() => localStorage.getItem("sudoku-custom-progress"));
  await cell(oldPage, 0).click();
  await oldPage.keyboard.press("3");
  await expectValue(oldPage, 0, 3);
  expect(await page.evaluate(() => localStorage.getItem("sudoku-custom-progress"))).toBe(saved);
  expect(
    await oldPage.evaluate(
      async (assets) => Promise.all(assets.map(async (url) => (await fetch(url)).ok)),
      oldAssets
    )
  ).toEqual(oldAssets.map(() => true));
  expect(await oldPage.evaluate(() => globalThis.__sudokuPuzzleBank["2099-01-01"])).toBeUndefined();
  await oldPage.getByRole("button", { name: /Open Journal/ }).click();
  await expect(oldPage.locator(".journal")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("sudoku-custom-progress"))).toBe(saved);
  expect(await page.evaluate(() => globalThis.__sudokuPuzzleBank["2099-01-01"])).toBeTruthy();
  await page.reload();
  await start(page).click();
  await expectValue(page, 0, 2);
});

test("a stale first HTML shell fails visibly and Reload fetches a fresh coherent release", async ({
  page,
  deployment,
}) => {
  deployment.publish();
  deployment.launchOld();
  await page.goto(`${deployment.url}?q=${DEMO_PUZZLE}&keep=yes#board`);
  await expect(page.getByRole("heading", { name: "Could not prepare puzzles" })).toBeVisible();
  await expect(start(page)).toHaveCount(0);
  await page.getByRole("link", { name: "Reload Sudoku" }).click();
  await expect(start(page)).toBeVisible();
  await expect(page.locator('meta[name="sudoku-build"]')).toHaveAttribute("content", "new");
  expect(
    deployment.requests.some(
      (path) => path.startsWith("/sudoku/?") && path.includes("_sudoku_check=")
    )
  ).toBe(true);
  expect(new URL(page.url()).searchParams.get("keep")).toBe("yes");
  expect(new URL(page.url()).hash).toBe("#board");
  expect(new URL(page.url()).searchParams.has("_sudoku_check")).toBe(false);
});

for (const fault of ["blocked getter", "malformed snapshot"]) {
  test(`Update preserves the page and gameplay on ${fault}`, async ({ page, deployment }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${deployment.url}?q=${DEMO_PUZZLE}`);
    await start(page).click();
    await cell(page, 0).click();
    await page.keyboard.press("4");
    deployment.publish();
    await check(page);
    await expect(notice(page)).toBeVisible();
    const before = await page.evaluate((fault) => {
      const key = "sudoku-custom-progress";
      if (fault === "malformed snapshot") {
        const data = JSON.parse(localStorage.getItem(key));
        data.unrelated = { hard: { snapshot: {} } };
        localStorage.setItem(key, JSON.stringify(data));
      }
      const saved = localStorage.getItem(key);
      const read = Storage.prototype.getItem;
      window.__readSaved = () => saved === read.call(localStorage, key);
      window.__writes = 0;
      const write = Storage.prototype.setItem;
      Storage.prototype.setItem = function (...args) {
        window.__writes++;
        return write.apply(this, args);
      };
      if (fault === "blocked getter")
        Storage.prototype.getItem = () => {
          throw new Error("blocked getter");
        };
      window.__sameDocument = true;
      return saved;
    }, fault);
    expect(before).toBeTruthy();
    await cell(page, 0).click();
    await page.keyboard.press("2");
    await expectValue(page, 0, 2);
    await notice(page).getByRole("button", { name: "Update", exact: true }).click();
    await expect(page.getByRole("link", { name: "Reload Sudoku" })).toBeVisible();
    await page.waitForTimeout(1200);
    expect(await page.evaluate(() => window.__sameDocument)).toBe(true);
    expect(await page.evaluate(() => window.__readSaved())).toBe(true);
    expect(await page.evaluate(() => window.__writes)).toBe(0);
    expect(errors).toEqual([]);
    await expectValue(page, 0, 2);
    await page.screenshot({ path: test.info().outputPath("storage-failure.png") });
  });
}

for (const damage of ["missing", "corrupt", "corrupt shell"]) {
  test(`online Retry repairs a ${damage} local complete bank and keeps saved progress`, async ({
    page,
    context,
    deployment,
  }) => {
    await page.goto(`${deployment.url}?q=${DEMO_PUZZLE}`);
    await start(page).click();
    await cell(page, 0).click();
    await page.keyboard.press("4");
    const saved = await page.evaluate(() => localStorage.getItem("sudoku-custom-progress"));
    const oldBank = await page.evaluate(() => globalThis.__sudokuPuzzleBank);
    await page.evaluate(async (damage) => {
      const name = (await caches.keys()).find((name) => name.endsWith(":release:old"));
      const cache = await caches.open(name);
      const bank = (await cache.keys()).find((request) =>
        damage === "corrupt shell"
          ? request.url.endsWith("apple-touch-icon.png")
          : request.url.includes("/banks/")
      );
      if (damage === "missing") await cache.delete(bank);
      else await cache.put(bank, new Response("corrupt local entry"));
    }, damage);
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Could not prepare puzzles" })).toBeVisible();
    await expect(start(page)).toHaveCount(0);
    await context.setOffline(false);
    deployment.fault(damage === "corrupt shell" ? "shell-corrupt" : "bank-corrupt");
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.getByRole("heading", { name: "Could not prepare puzzles" })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("sudoku-custom-progress"))).toBe(saved);
    expect(
      await page.evaluate(async () => {
        const cache = await caches.open(
          (await caches.keys()).find((name) => name.endsWith(":release:old"))
        );
        return !!(await cache.match(new URL("index.html", location.href)));
      })
    ).toBe(true);
    deployment.fault("");
    const release =
      damage === "corrupt shell"
        ? deployment.holdAsset("apple-touch-icon.png")
        : deployment.holdBank();
    try {
      await page.getByRole("button", { name: "Retry" }).click();
      await expect(page.getByRole("heading", { name: "Preparing puzzles" })).toBeVisible();
      await expect(start(page)).toHaveCount(0);
    } finally {
      release();
    }
    await expect(start(page)).toBeVisible();
    expect(await page.evaluate(() => globalThis.__sudokuPuzzleBank)).toEqual(oldBank);
    expect(await page.evaluate(() => localStorage.getItem("sudoku-custom-progress"))).toBe(saved);
    await context.setOffline(true);
    await page.reload();
    await start(page).click();
    await expectValue(page, 0, 4);
    await page.screenshot({ path: test.info().outputPath("repaired-bank.png") });
  });
}

test("verification requests bypass cached release content", async ({ page, deployment }) => {
  await page.goto(deployment.url);
  await expect(start(page)).toBeVisible();
  const bankUrl = await page.evaluate(async () => {
    const cache = await caches.open(
      (await caches.keys()).find((name) => name.endsWith(":release:old"))
    );
    await cache.put(new URL("version.json", location.href), new Response('{"poisoned":true}'));
    const manifest = await (await cache.match(new URL("__ready", location.href))).json();
    return new URL(manifest.bank.path, location.href).href;
  });
  deployment.fault("bank-corrupt");
  const results = await page.evaluate(async (url) => {
    const cached = await (await fetch(url)).text();
    const noStore = await (await fetch(url, { cache: "no-store" })).text();
    const reload = await (await fetch(url, { cache: "reload" })).text();
    const nonce = await (await fetch(`${url}?_sudoku_check=probe`)).text();
    const version = await (await fetch(new URL("version.json", location.href))).json();
    return { cached, noStore, reload, nonce, version };
  }, bankUrl);
  expect(Object.keys(JSON.parse(results.cached)).length).toBeGreaterThan(400);
  expect(results.noStore).toBe("corrupt bank");
  expect(results.reload).toBe("corrupt bank");
  expect(results.nonce).toBe("corrupt bank");
  expect(results.version.version).toBe("old");
  expect(results.version.poisoned).toBeUndefined();
});

test("explicit fresh recovery becomes the durable offline release", async ({
  page,
  context,
  deployment,
}) => {
  await page.goto(deployment.url);
  await expect(start(page)).toBeVisible();
  await page.evaluate(async () => {
    const name = (await caches.keys()).find((key) => key.endsWith("release:old"));
    const cache = await caches.open(name);
    for (const request of await cache.keys()) {
      if (request.url.includes("/banks/")) await cache.delete(request);
    }
  });
  // GitHub Pages need not retain the previous bank after a new deployment.
  deployment.publish("next");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Could not prepare puzzles" })).toBeVisible();
  await page.getByRole("link", { name: "Reload Sudoku" }).click();
  await expect(start(page)).toBeVisible();
  await expect(page.locator('meta[name="sudoku-build"]')).toHaveAttribute("content", "next");
  await context.setOffline(true);
  await page.reload();
  await expect(start(page)).toBeVisible();
  await expect(page.locator('meta[name="sudoku-build"]')).toHaveAttribute("content", "next");
  await start(page).click();
  await expect(page.locator(".board > .cell")).toHaveCount(81);
});

test("a corrupt sampled catalog rejects staging and activation while the old release stays usable", async ({
  page,
  context,
  deployment,
}) => {
  await page.goto(deployment.url);
  await expect(start(page)).toBeVisible();
  const previous = await page.evaluate(() => globalThis.__sudokuBankCatalog);
  deployment.publish();
  deployment.fault("catalog-corrupt");
  const result = await page.evaluate(async () => {
    const command = (type, extra) =>
      new Promise((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = ({ data }) => {
          channel.port1.close();
          resolve(data);
        };
        navigator.serviceWorker.controller.postMessage({ type, ...extra }, [channel.port2]);
      });
    const staged = await command("STAGE", { current: { version: "old", builtAt: 1000 } });
    const activated = await command("ACTIVATE", { version: "new" });
    const metadata = await caches.open("sudoku-offline-v1:/sudoku/:metadata");
    const active = await (await metadata.match(new URL("__active", location.href))).json();
    const candidate = await caches.open("sudoku-offline-v1:/sudoku/:release:new");
    return {
      staged,
      activated,
      active,
      ready: !!(await candidate.match(new URL("__ready", location.href))),
    };
  });
  expect(result.staged.error).toBe("Download verification failed");
  expect(result.activated.error).toBe("Release is not ready");
  expect(result.active).toBe("old");
  expect(result.ready).toBe(false);
  expect(
    deployment.requests.some((url) => url.includes(previous.path) && url.includes("_sudoku_check="))
  ).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(start(page)).toBeVisible();
  expect(await page.evaluate(() => globalThis.__sudokuBankCatalog)).toEqual(previous);
  expect(
    await page.evaluate(
      async () =>
        (await (await fetch(new URL(globalThis.__sudokuBankCatalog.path, location.href))).json())
          .puzzles.length
    )
  ).toBe(4000);
});
