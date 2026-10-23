import { test as base, expect } from "@playwright/test";
import { upgradeServer } from "./upgrade-server.js";
import { cell, expectValue, DEMO_PUZZLE } from "./helpers.js";

const test = base.extend({
  // Playwright requires an object pattern for fixture dependencies.
  // eslint-disable-next-line no-empty-pattern
  deployment: async ({}, use) => {
    const server = await upgradeServer();
    await use(server);
    await server.close();
  },
});
const build = (page) => page.locator('meta[name="sudoku-build"]');

async function open(page, deployment) {
  // Only seed on the first document, so a reload cannot conceal lost storage.
  await page.addInitScript(() => {
    if (sessionStorage.getItem("upgrade-fixture-seeded")) return;
    sessionStorage.setItem("upgrade-fixture-seeded", "1");
    localStorage.setItem("sudoku-keypad-coach", "1");
    localStorage.setItem("sudoku-cue", "0");
    localStorage.setItem("sudoku-tap-fill", "1");
    localStorage.setItem(
      "sudoku-solved",
      JSON.stringify({
        "2026-10-21": { easy: { completed: true, time: 123, timestamp: 1792530000000 } },
      })
    );
  });
  await page.clock.setSystemTime(new Date("2026-10-23T12:00:00Z"));
  await page.goto(`${deployment.url}?q=${DEMO_PUZZLE}`);
  if ((await cell(page, 0).count()) === 0)
    await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(cell(page, 0)).toBeVisible();
  await expect(build(page)).toHaveAttribute("content", "old");
  await cell(page, 0).click();
  await page.keyboard.press("4");
  await expectValue(page, 0, 4);
}

async function foreground(page) {
  await page.bringToFront();
  // Real lifecycle event dispatch, with only the wall clock advanced to exercise
  // the 30-second throttle without slowing every fault case by half a minute.
  await page.clock.setSystemTime(new Date((await page.evaluate(() => Date.now())) + 60_000));
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }))
  );
}

async function storage(page) {
  return page.evaluate(() => ({
    solved: localStorage.getItem("sudoku-solved"),
    cue: localStorage.getItem("sudoku-cue"),
    tap: localStorage.getItem("sudoku-tap-fill"),
  }));
}

test("two builds: foreground updates automatically and preserves board, undo, Journal and preferences", async ({
  page,
  deployment,
}) => {
  await open(page, deployment);
  const before = await storage(page);
  deployment.publish();
  await foreground(page);
  await expect(build(page)).toHaveAttribute("content", "new");
  await expectValue(page, 0, 4);
  expect(await storage(page)).toEqual(before);
  await page.keyboard.press("Control+z");
  await expectValue(page, 0, 0);
  await page.keyboard.press("Control+y");
  await expectValue(page, 0, 4);
  await foreground(page);
  await page.waitForTimeout(1200);
  expect(deployment.requests.filter((r) => r.includes("_sudoku_update="))).toHaveLength(1);
  await expect(page.getByRole("button", { name: /update/i })).toHaveCount(0);
});

test("holds an update until pointer input and its commit end", async ({
  page,
  deployment,
}, testInfo) => {
  await open(page, deployment);
  let release;
  if (testInfo.project.name === "upgrade-mobile") {
    // Genuine touch contacts through Chromium, including the app's release edit.
    await cell(page, 2).click();
    const key = await page.locator('#keypad [data-d="1"]').boundingBox();
    const cdp = await page.context().newCDPSession(page);
    const x = key.x + key.width / 2,
      y = key.y + key.height / 2;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y, id: 1 }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y: y - 45, id: 1 }],
    });
    release = () => cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } else {
    await cell(page, 2).hover();
    await page.mouse.down();
    release = () => page.mouse.up();
  }
  deployment.publish();
  await foreground(page);
  await page.waitForTimeout(1500);
  await expect(build(page)).toHaveAttribute("content", "old");
  await release();
  await expect(build(page)).toHaveAttribute("content", "new");
  await expectValue(page, 0, 4);
  if (testInfo.project.name === "upgrade-mobile") {
    // Legacy preference: swipe up toggles the candidate, not an answer.
    await expect(cell(page, 2).locator('.pencil-box[data-d="1"]')).toHaveClass(/invisible/);
  }
});

for (const fault of ["offline", "version-error", "old-html", "missing-asset"]) {
  test(`keeps playing on ${fault}, then safely retries on a later foreground`, async ({
    page,
    deployment,
  }) => {
    await open(page, deployment);
    deployment.publish();
    deployment.fault(fault);
    if (fault === "offline") await page.context().setOffline(true);
    await foreground(page);
    await page.waitForTimeout(1200);
    await expect(build(page)).toHaveAttribute("content", "old");
    await cell(page, 2).click();
    await page.keyboard.press("1");
    await expectValue(page, 2, 1);
    if (fault === "offline") await page.context().setOffline(false);
    deployment.fault("");
    await page.clock.setSystemTime(new Date((await page.evaluate(() => Date.now())) + 60_000));
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(build(page)).toHaveAttribute("content", "new");
    await expectValue(page, 2, 1);
  });
}

test("failed persistence keeps unsaved input and does not navigate", async ({
  page,
  deployment,
}) => {
  await open(page, deployment);
  await page.evaluate(() => {
    window.originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new DOMException("Full", "QuotaExceededError");
    };
  });
  await cell(page, 2).click();
  await page.keyboard.press("1");
  deployment.publish();
  await foreground(page);
  await page.waitForTimeout(1500);
  await expect(build(page)).toHaveAttribute("content", "old");
  await expectValue(page, 2, 1);
  expect(deployment.requests.filter((r) => r.includes("_sudoku_update="))).toHaveLength(0);
  await page.evaluate(() => {
    Storage.prototype.setItem = window.originalSetItem;
  });
  await page.clock.setSystemTime(new Date((await page.evaluate(() => Date.now())) + 60_000));
  await page.evaluate(() => window.dispatchEvent(new Event("pageshow")));
  await expect(build(page)).toHaveAttribute("content", "new");
  await expectValue(page, 2, 1);
});

test("stale navigation restores state and cannot cause a reload loop", async ({
  page,
  deployment,
}) => {
  await open(page, deployment);
  deployment.publish();
  deployment.fault("stale-navigation");
  await foreground(page);
  await expect
    .poll(() => deployment.requests.filter((r) => r.includes("_sudoku_update=")).length)
    .toBe(1);
  await expectValue(page, 0, 4);
  await expect(build(page)).toHaveAttribute("content", "old");
  await page.clock.setSystemTime(new Date((await page.evaluate(() => Date.now())) + 60_000));
  await page.evaluate(() => window.dispatchEvent(new Event("pageshow")));
  await page.waitForTimeout(1500);
  expect(deployment.requests.filter((r) => r.includes("_sudoku_update="))).toHaveLength(1);
  await expectValue(page, 0, 4);
});

test("daily puzzle progress survives a failed write, update and Journal resume", async ({
  page,
  deployment,
}) => {
  await open(page, deployment);
  await page.getByRole("button", { name: "Journal", exact: true }).click();
  await page.locator('button.day[data-d="2026-10-22"]:visible').click();
  await page
    .locator(".prow:visible")
    .filter({ hasText: "Easy" })
    .getByRole("button", { name: "Start", exact: true })
    .click();
  // Derive the first empty cell from the rendered board, then use real input.
  const index = await page
    .locator(".board > .cell")
    .evaluateAll((cells) => cells.findIndex((c) => !c.querySelector(".pen-box")));
  expect(index).toBeGreaterThanOrEqual(0);
  await page.evaluate(() => {
    window.originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "sudoku-progress") throw new DOMException("Full", "QuotaExceededError");
      return window.originalSetItem.call(this, key, value);
    };
  });
  await cell(page, index).click();
  await page.keyboard.press("1");
  await expectValue(page, index, 1);
  deployment.publish();
  await foreground(page);
  await page.waitForTimeout(1500);
  await expect(build(page)).toHaveAttribute("content", "old");
  await expectValue(page, index, 1);
  await page.evaluate(() => {
    Storage.prototype.setItem = window.originalSetItem;
  });
  await page.clock.setSystemTime(new Date((await page.evaluate(() => Date.now())) + 60_000));
  await page.evaluate(() => window.dispatchEvent(new Event("pageshow")));
  await expect(build(page)).toHaveAttribute("content", "new");
  await expectValue(page, index, 1);
  const progress = await page.evaluate(() => JSON.parse(localStorage.getItem("sudoku-progress")));
  expect(progress["2026-10-22"].easy.snapshot.answers[index]).toBe("1");
  await page.getByRole("button", { name: "Journal", exact: true }).click();
  await page.locator('button.day[data-d="2026-10-22"]:visible').click();
  await page
    .locator(".prow:visible")
    .filter({ hasText: "Easy" })
    .getByRole("button", { name: "Resume", exact: true })
    .click();
  await expectValue(page, index, 1);
});

test("keyboard hold blocks navigation until keyup", async ({ page, deployment }) => {
  await open(page, deployment);
  await cell(page, 2).click();
  await page.keyboard.down("1");
  deployment.publish();
  await foreground(page);
  await page.waitForTimeout(1400);
  await expect(build(page)).toHaveAttribute("content", "old");
  await page.keyboard.up("1");
  await expect(build(page)).toHaveAttribute("content", "new");
  await expectValue(page, 2, 1);
});

test("checks on launch without waiting for a foreground event", async ({ page, deployment }) => {
  let published = false;
  await page.route("**/version.json?*", async (route) => {
    if (!published) {
      deployment.publish();
      published = true;
    }
    await route.continue();
  });
  await page.goto(deployment.url);
  await expect(build(page)).toHaveAttribute("content", "new");
  expect(deployment.requests.filter((r) => r.includes("_sudoku_update="))).toHaveLength(1);
  await expect(page.locator(".journal")).toBeVisible();
});

test("hidden pages defer checks and visible return preserves the paused puzzle", async ({
  page,
  deployment,
}) => {
  await open(page, deployment);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  deployment.publish();
  await foreground(page);
  await page.waitForTimeout(1200);
  await expect(build(page)).toHaveAttribute("content", "old");
  await page.evaluate(() => {
    delete document.visibilityState;
    delete document.hidden;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(build(page)).toHaveAttribute("content", "new");
  await expect(page.locator("#resume")).toBeVisible();
  await page.locator("#resume").click();
  await expectValue(page, 0, 4);
});

test("a touch contact still blocks updates after the browser cancels its pointer", async ({
  page,
  deployment,
}, testInfo) => {
  test.skip(testInfo.project.name !== "upgrade-mobile", "Requires Chromium CDP touch contacts");
  await open(page, deployment);
  await page.evaluate(() =>
    window.addEventListener(
      "pointerdown",
      (event) => {
        window.touchPointer = event.pointerId;
      },
      { once: true }
    )
  );
  const cdp = await page.context().newCDPSession(page);
  const title = await page.locator(".hd-brand").boundingBox();
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: title.x + 20, y: title.y + 10, id: 1 }],
  });
  // Native scrolling can cancel Pointer Events while the finger remains down.
  await page.evaluate(() =>
    window.dispatchEvent(
      new PointerEvent("pointercancel", { pointerId: window.touchPointer, pointerType: "touch" })
    )
  );
  deployment.publish();
  await foreground(page);
  await page.waitForTimeout(1500);
  await expect(build(page)).toHaveAttribute("content", "old");
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(build(page)).toHaveAttribute("content", "new");
  await expectValue(page, 0, 4);
});

async function openDaily(page, deployment, date) {
  await page.goto(deployment.url);
  await page.locator(`button.day[data-d="${date}"]:visible`).click();
  await page
    .locator(".prow:visible")
    .filter({ hasText: "Easy" })
    .getByRole("button", { name: /^(Start|Resume)$/ })
    .click();
  const index = await page
    .locator(".board > .cell")
    .evaluateAll((cells) => cells.findIndex((c) => !c.querySelector(".pen-box")));
  await cell(page, index).click();
  await page.keyboard.press("1");
  await expectValue(page, index, 1);
  return index;
}

async function sharedStorage(page) {
  return page.evaluate(() =>
    Object.fromEntries(
      ["sudoku-progress", "sudoku-solved", "sudoku-cue", "sudoku-tap-fill"].map((key) => [
        key,
        localStorage.getItem(key),
      ])
    )
  );
}

for (const change of ["unrelated progress", "same puzzle and completion", "preferences"]) {
  test(`two tabs: ${change} written after initialization survives an update attempt`, async ({
    page,
    context,
    deployment,
  }) => {
    const index = await openDaily(page, deployment, "2026-10-22");
    const other = await context.newPage();
    if (change === "unrelated progress") {
      // This second app writes through real gameplay AFTER the first app loaded.
      await openDaily(other, deployment, "2026-10-21");
    } else {
      await other.goto(deployment.url);
      // Completed records and conflicting snapshots are explicit second-tab fixtures.
      await other.evaluate((kind) => {
        if (kind === "same puzzle and completion") {
          const progress = JSON.parse(localStorage.getItem("sudoku-progress"));
          progress["2026-10-22"].easy.elapsed = 999;
          localStorage.setItem("sudoku-progress", JSON.stringify(progress));
          localStorage.setItem(
            "sudoku-solved",
            JSON.stringify({ "2026-10-22": { easy: { completed: true, time: 99 } } })
          );
        } else {
          localStorage.setItem("sudoku-cue", "0");
          localStorage.setItem("sudoku-tap-fill", "1");
        }
      }, change);
    }
    const before = await sharedStorage(other);
    if (change === "unrelated progress") {
      expect(Object.keys(JSON.parse(before["sudoku-progress"])).sort()).toEqual([
        "2026-10-21",
        "2026-10-22",
      ]);
    }
    await page.evaluate(() => {
      window.updateWrites = [];
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (this === localStorage) window.updateWrites.push(key);
        return original.call(this, key, value);
      };
    });
    deployment.publish();
    await foreground(page);
    await page.waitForTimeout(1800);
    // Fail closed: no ring/progress/preference/pending write may precede detection.
    expect(await sharedStorage(other)).toEqual(before);
    await expect(build(page)).toHaveAttribute("content", "old");
    expect(await page.evaluate(() => window.updateWrites)).toEqual([]);
    await expectValue(page, index, 1);
    expect(deployment.requests.filter((r) => r.includes("_sudoku_update="))).toHaveLength(0);
    await other.close();
  });
}

test("focus transition while Tab is held blocks navigation until keyup", async ({
  page,
  deployment,
}) => {
  await open(page, deployment);
  const journal = page.getByRole("button", { name: "Journal", exact: true });
  await journal.focus();
  await page.keyboard.down("Tab");
  await expect(journal).not.toBeFocused();
  expect(await page.evaluate(() => document.hasFocus())).toBe(true);
  expect(await page.evaluate(() => document.visibilityState)).toBe("visible");
  deployment.publish();
  await foreground(page);
  await page.waitForTimeout(1800);
  await expect(build(page)).toHaveAttribute("content", "old");
  await page.keyboard.up("Tab");
  await expect(build(page)).toHaveAttribute("content", "new");
  await expectValue(page, 0, 4);
});

for (const reset of ["window blur", "hidden page"]) {
  test(`${reset} resets a held key whose release happens outside the page`, async ({
    page,
    deployment,
  }) => {
    await open(page, deployment);
    await page.getByRole("button", { name: "Journal", exact: true }).focus();
    await page.keyboard.down("Tab");
    deployment.publish();
    await foreground(page);
    await page.waitForTimeout(1200);
    await expect(build(page)).toHaveAttribute("content", "old");
    await page.evaluate((kind) => {
      if (kind === "window blur") {
        window.dispatchEvent(new Event("blur"));
      } else {
        Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
        document.dispatchEvent(new Event("visibilitychange"));
        delete document.visibilityState;
        document.dispatchEvent(new Event("visibilitychange"));
      }
    }, reset);
    await expect(build(page)).toHaveAttribute("content", "new");
    await page.keyboard.up("Tab");
  });
}

test("two initialized tabs cannot overwrite each other's later saves", async ({
  page,
  context,
  deployment,
}) => {
  const index = await openDaily(page, deployment, "2026-10-22");
  const other = await context.newPage();
  await other.goto(deployment.url);
  // Both app instances have loaded before A changes its map again.
  await cell(page, index).click();
  await page.keyboard.press("2");
  const before = await sharedStorage(page);
  await other.locator('button.day[data-d="2026-10-21"]:visible').click();
  await other
    .locator(".prow:visible")
    .filter({ hasText: "Easy" })
    .getByRole("button", { name: "Start", exact: true })
    .click();
  const otherIndex = await other
    .locator(".board > .cell")
    .evaluateAll((cells) => cells.findIndex((c) => !c.querySelector(".pen-box")));
  await cell(other, otherIndex).click();
  await other.keyboard.press("1");
  await expectValue(other, otherIndex, 1);
  expect(await sharedStorage(page)).toEqual(before);
  deployment.publish();
  await foreground(other);
  await other.waitForTimeout(1800);
  await expect(build(other)).toHaveAttribute("content", "old");
  expect(await sharedStorage(page)).toEqual(before);
  await expectValue(other, otherIndex, 1);
  await other.close();
});

test("Tab into browser chrome cannot update a visible unfocused window", async ({
  page,
  deployment,
}, testInfo) => {
  test.skip(testInfo.project.name !== "upgrade-chromium", "Desktop browser chrome focus");
  await open(page, deployment);
  await page.getByRole("button", { name: "Play", exact: true }).focus();
  await page.keyboard.down("Tab");
  expect(await page.evaluate(() => document.hasFocus())).toBe(false);
  expect(await page.evaluate(() => document.visibilityState)).toBe("visible");
  deployment.publish();
  await page.clock.setSystemTime(new Date((await page.evaluate(() => Date.now())) + 60_000));
  await page.evaluate(() => window.dispatchEvent(new Event("pageshow")));
  await page.waitForTimeout(1800);
  await expect(build(page)).toHaveAttribute("content", "old");
  await page.keyboard.up("Tab");
  await page.getByRole("button", { name: "Journal", exact: true }).click();
  await expect(build(page)).toHaveAttribute("content", "new");
});

test("two tabs: a write during navigation cannot be overwritten by the restored board", async ({
  page,
  context,
  deployment,
}) => {
  const index = await openDaily(page, deployment, "2026-10-22");
  const other = await context.newPage();
  await other.goto(deployment.url);
  let duringNavigation;
  await page.route("**/*_sudoku_update=*", async (route) => {
    // A has saved its checkpoint. B writes before A's new document initializes.
    await other.evaluate(() => {
      const progress = JSON.parse(localStorage.getItem("sudoku-progress"));
      progress["2026-10-22"].easy.elapsed = 999;
      localStorage.setItem("sudoku-progress", JSON.stringify(progress));
      localStorage.setItem("sudoku-cue", "0");
      localStorage.setItem(
        "sudoku-solved",
        JSON.stringify({ "2026-10-21": { easy: { completed: true, time: 123 } } })
      );
    });
    duringNavigation = await sharedStorage(other);
    await route.continue();
  });
  deployment.publish();
  await foreground(page);
  await expect(build(page)).toHaveAttribute("content", "new");
  await expectValue(page, index, 1);
  await cell(page, index).click();
  await page.keyboard.press("2");
  await expectValue(page, index, 2);
  expect(await sharedStorage(other)).toEqual(duringNavigation);
  await other.close();
});
