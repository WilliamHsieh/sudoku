import { test as base, expect } from "@playwright/test";
import { upgradeServer } from "./upgrade-server.js";
import { cell, expectValue, DEMO_PUZZLE, solve } from "./helpers.js";

const test = base.extend({
  // eslint-disable-next-line no-empty-pattern
  deployment: async ({}, use) => {
    const server = await upgradeServer(process.env.SUDOKU_UPGRADE_BASELINE);
    await use(server);
    await server.close();
  },
});
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
const notice = (page) => page.locator(".update-notice.active");
const build = (page) => page.locator('meta[name="sudoku-build"]');
const attempts = (deployment) => deployment.requests.filter((r) => r.includes("_sudoku_update="));
const live = (page) => page.locator(".update-live");

async function open(page, deployment, query = `?q=${DEMO_PUZZLE}`) {
  await page.addInitScript(() => {
    localStorage.setItem("sudoku-keypad-coach", "1");
    localStorage.setItem("sudoku-cue", "0");
  });
  await page.goto(deployment.url + query);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(cell(page, 0)).toBeVisible();
  await page.evaluate(() => {
    window.documentIdentity = {};
  });
}
async function settle(page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => {}))
    )
  );
}
async function publish(page, deployment) {
  await page.clock.setSystemTime(new Date(Date.now() + 60_000));
  deployment.publish();
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }))
  );
  await expect(notice(page)).toHaveCSS("opacity", "1");
}
async function state(page) {
  return page.evaluate(() => ({
    cells: [...document.querySelectorAll(".board > .cell")].map((el) => [
      el.getAttribute("data-value"),
      el.getAttribute("data-notes"),
    ]),
    mode: document.querySelector(".notes-mode")?.getAttribute("aria-label"),
    time: document.querySelector("[data-time]")?.textContent,
  }));
}

async function openDaily(page, deployment, date = "2026-10-22") {
  await page.clock.setSystemTime(new Date("2026-10-23T12:00:00Z"));
  await page.addInitScript(() => {
    localStorage.setItem("sudoku-keypad-coach", "1");
    localStorage.setItem("sudoku-cue", "0");
  });
  await page.goto(deployment.url);
  await page.locator(`button.day[data-d="${date}"]:visible`).click();
  await page
    .locator(".prow:visible")
    .filter({ hasText: "Easy" })
    .getByRole("button", { name: "Start", exact: true })
    .click();
  await expect(page.locator(".board > .cell")).toHaveCount(81);
  await settle(page);
  return page
    .locator(".board > .cell")
    .evaluateAll((cells) => cells.flatMap((c, i) => (c.querySelector(".pen-box") ? [] : [i])));
}
function seconds(text) {
  const [m, s] = text.trim().split(":").map(Number);
  return m * 60 + s;
}

for (const mode of ["Manual", "Auto"]) {
  for (const delay of [100, 4500]) {
    test(`daily ${mode} game survives Update navigation delayed ${delay}ms`, async ({
      page,
      deployment,
    }) => {
      const [answer] = await openDaily(page, deployment);
      await cell(page, answer).click();
      await page.keyboard.press("1");
      const note = await page
        .locator(".board > .cell")
        .evaluateAll((cells) => cells.findIndex((c) => c.getAttribute("data-notes").includes("3")));
      expect(note).toBeGreaterThanOrEqual(0);
      if (mode === "Manual") {
        await page.locator(".notes-mode").click();
        await page.getByRole("menuitemradio", { name: /^Manual / }).click();
      }
      await page.keyboard.press("Shift+Digit3");
      await cell(page, note).click();
      await page.keyboard.press("Escape");
      if (mode === "Manual") await expect(cell(page, note)).toHaveAttribute("data-notes", /3/);
      else await expect(cell(page, note)).not.toHaveAttribute("data-notes", /3/);
      await publish(page, deployment);
      const before = await state(page);
      const puzzle = await page
        .getByRole("button", { name: /Open Journal/ })
        .getAttribute("aria-label");
      let saved;
      await page.exposeFunction("recordProgress", (value) => {
        saved = JSON.parse(value);
      });
      await page.evaluate(() => {
        const write = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
          if (key === "sudoku-progress") window.recordProgress(value);
          return write.call(this, key, value);
        };
      });
      await page.route("**/*", async (route) => {
        if (
          route.request().isNavigationRequest() &&
          route.request().url().includes("_sudoku_update=")
        )
          await new Promise((resolve) => setTimeout(resolve, delay));
        await route.continue().catch(() => {});
      });
      await notice(page).getByRole("button", { name: "Update", exact: true }).tap();
      await expect(build(page)).toHaveAttribute("content", "new");
      await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Play", exact: true }).tap();
      await expect(cell(page, answer)).toBeVisible();
      const after = await state(page);
      expect(after.cells).toEqual(before.cells);
      expect(after.mode).toBe(`Notes mode: ${mode}`);
      expect(
        await page.getByRole("button", { name: /Open Journal/ }).getAttribute("aria-label")
      ).toBe(puzzle);
      expect(Math.abs(seconds(after.time) - saved["2026-10-22"].easy.elapsed)).toBeLessThanOrEqual(
        1
      );
      expect(Math.abs(seconds(after.time) - seconds(before.time))).toBeLessThanOrEqual(1);
      expect(await page.evaluate(() => Object.keys(sessionStorage))).toEqual([]);
      expect(attempts(deployment)).toHaveLength(1);
      // An ordinary later reload also uses the normal start screen.
      await page.reload();
      await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
    });
  }
}

test("Update from Journal opens the start screen; Play resumes the daily autosave", async ({
  page,
  deployment,
}) => {
  const [answer] = await openDaily(page, deployment);
  await cell(page, answer).click();
  await page.keyboard.press("1");
  const before = await state(page);
  const puzzle = await page
    .getByRole("button", { name: /Open Journal/ })
    .getAttribute("aria-label");
  await page.getByRole("button", { name: /Open Journal/ }).click();
  await publish(page, deployment);
  await notice(page).getByRole("button", { name: "Update", exact: true }).tap();
  await expect(build(page)).toHaveAttribute("content", "new");
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Play", exact: true }).tap();
  await expectValue(page, answer, 1);
  const after = await state(page);
  expect(after.cells).toEqual(before.cells);
  expect(after.mode).toBe(before.mode);
  expect(Math.abs(seconds(after.time) - seconds(before.time))).toBeLessThanOrEqual(1);
  expect(await page.getByRole("button", { name: /Open Journal/ }).getAttribute("aria-label")).toBe(
    puzzle
  );
  expect(await page.evaluate(() => Object.keys(sessionStorage))).toEqual([]);
});

for (const failure of ["aborted", "failed"]) {
  test(`failed Update (${failure}) then normal reload opens the start screen`, async ({
    page,
    deployment,
  }) => {
    const [first, second] = await openDaily(page, deployment);
    await cell(page, first).click();
    await page.keyboard.press("1");
    await publish(page, deployment);
    let newest = await state(page);
    await page.route("**/*", (route) =>
      route.request().isNavigationRequest() ? route.abort(failure) : route.continue()
    );
    // A tap can finish before WebKit starts the navigation. Keep the route until it fails.
    const navigationFailed = page.waitForEvent(
      "requestfailed",
      (request) => request.isNavigationRequest() && request.url().includes("_sudoku_update=")
    );
    await notice(page).getByRole("button", { name: "Update", exact: true }).tap();
    await navigationFailed;
    // Chromium can show an error document; WebKit keeps the app and recovers the notice.
    await expect(page.locator(".update-notice.updating")).toHaveCount(0, { timeout: 6000 });
    if (failure === "aborted") {
      await expect(notice(page).getByRole("button", { name: "Update", exact: true })).toBeVisible({
        timeout: 6000,
      });
      await cell(page, second).click();
      await page.keyboard.press("2");
      await expectValue(page, second, 2);
      newest = await state(page);
    }
    await page.unrouteAll({ behavior: "wait" });
    await page.reload();
    await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
    await expect(page.locator(".play")).not.toBeVisible();
    expect(await page.evaluate(() => Object.keys(sessionStorage))).toEqual([]);
    await page.getByRole("button", { name: "Play", exact: true }).tap();
    await expectValue(page, first, 1);
    if (failure === "aborted") await expectValue(page, second, 2);
    expect((await state(page)).cells).toEqual(newest.cells);
  });
}

test("moves made during a slow Update survive the eventual navigation", async ({
  page,
  deployment,
}) => {
  const [first, second] = await openDaily(page, deployment);
  await cell(page, first).click();
  await page.keyboard.press("1");
  await publish(page, deployment);
  const box = await cell(page, second).boundingBox();
  let updateStarted;
  let newest;
  const started = new Promise((resolve) => {
    updateStarted = resolve;
  });
  await page.exposeFunction("progressSaved", (value) => {
    newest = JSON.parse(value)["2026-10-22"].easy;
  });
  await page.evaluate(() => {
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      const result = write.call(this, key, value);
      if (key === "sudoku-progress") window.progressSaved(value);
      return result;
    };
  });
  await page.route("**/*", async (route) => {
    if (route.request().isNavigationRequest()) {
      updateStarted();
      await new Promise((resolve) => setTimeout(resolve, 5500));
    }
    await route.continue().catch(() => {});
  });
  const tap = notice(page)
    .getByRole("button", { name: "Update", exact: true })
    .tap({ noWaitAfter: true });
  // Use page-level input while the browser has a pending document navigation.
  await started;
  await page.waitForTimeout(3300);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.press("2");
  await tap;
  await expect(build(page)).toHaveAttribute("content", "new");
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Play", exact: true }).tap();
  await expectValue(page, first, 1);
  await expectValue(page, second, 2);
  expect(newest.snapshot.answers[second]).toBe("2");
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("sudoku-progress"))["2026-10-22"].easy.snapshot
    )
  ).toEqual(newest.snapshot);
  expect(await page.evaluate(() => Object.keys(sessionStorage))).toEqual([]);
});

test("Update after finishing today's Easy stays on the normal start screen", async ({
  page,
  deployment,
}) => {
  const empty = await openDaily(page, deployment, "2026-10-23");
  const puzzle = await page
    .locator(".board > .cell")
    .evaluateAll((cells) =>
      cells.map((el) => el.querySelector(".pen-box")?.textContent.trim() || "0").join("")
    );
  const solution = solve(puzzle);
  for (const index of empty) {
    await cell(page, index).click();
    await page.keyboard.press(solution[index]);
  }
  await expect(page.getByRole("heading", { name: "Puzzle Complete!" })).toBeVisible();
  await page.locator(".success-close").click();
  const solved = await page.evaluate(() => localStorage.getItem("sudoku-solved"));
  expect(JSON.parse(solved)["2026-10-23"].easy.completed).toBe(true);
  await publish(page, deployment);
  await notice(page).getByRole("button", { name: "Update", exact: true }).tap();
  await expect(build(page)).toHaveAttribute("content", "new");
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await expect(page.locator(".play")).not.toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("sudoku-solved"))).toBe(solved);
  expect(await page.evaluate(() => Object.keys(sessionStorage))).toEqual([]);
});

test("Update writes no return marker to either storage area", async ({ page, deployment }) => {
  const writes = [];
  await page.exposeFunction("recordStorageWrite", (area, key) => writes.push([area, key]));
  await page.addInitScript(() => {
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      window.recordStorageWrite(this === sessionStorage ? "session" : "local", key);
      return write.call(this, key, value);
    };
  });
  const [answer] = await openDaily(page, deployment);
  await cell(page, answer).click();
  await page.keyboard.press("1");
  await publish(page, deployment);
  await notice(page).getByRole("button", { name: "Update", exact: true }).tap();
  await expect(build(page)).toHaveAttribute("content", "new");
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  expect(writes.filter(([area, key]) => area === "session" || /update/i.test(key))).toEqual([]);
  expect(await page.evaluate(() => Object.keys(sessionStorage))).toEqual([]);
  expect(
    await page.evaluate(() => Object.keys(localStorage).filter((key) => /update/i.test(key)))
  ).toEqual([]);
});

test("share-link Update keeps master behaviour without saving the board", async ({
  page,
  deployment,
}) => {
  await open(page, deployment);
  await cell(page, 0).click();
  await page.keyboard.press("4");
  await expectValue(page, 0, 4);
  await publish(page, deployment);
  await notice(page).getByRole("button", { name: "Update", exact: true }).tap();
  await expect(build(page)).toHaveAttribute("content", "new");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expectValue(page, 0, 0);
  expect(new URL(page.url()).searchParams.get("q")).toBe(DEMO_PUZZLE);
  expect(await page.evaluate(() => localStorage.getItem("sudoku-progress"))).toBeNull();
  expect(await page.evaluate(() => Object.keys(sessionStorage))).toEqual([]);
});

for (const edited of [false, true]) {
  test(`newer startup version only shows notice, entered digit: ${edited}`, async ({
    page,
    deployment,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    deployment.publish();
    deployment.launchOld();
    // Hold the initial check until Play is usable, including the first edit.
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    await page.route("**/version.json?*", async (route) => {
      await gate;
      await route.continue().catch(() => {});
    });
    const navigations = [];
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) navigations.push(frame.url());
    });
    // Freeze scheduling so the 1.5s network budget cannot race test-driver input.
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    await page.addInitScript(() => {
      localStorage.setItem("sudoku-keypad-coach", "1");
      window.documentIdentity = {};
    });
    await page.goto(`${deployment.url}?q=${DEMO_PUZZLE}`);
    await page.getByRole("button", { name: "Play", exact: true }).dispatchEvent("click");
    if (edited) {
      await cell(page, 0).dispatchEvent("click");
      await page.keyboard.press("4");
      await expectValue(page, 0, 4);
    }
    const identity = await page.evaluateHandle(() => window.documentIdentity);
    release();
    await expect(notice(page)).toHaveCSS("opacity", "1");
    await page.clock.runFor(1600);
    expect(navigations).toHaveLength(1);
    expect(attempts(deployment)).toHaveLength(0);
    expect(await identity.evaluate((value) => value === window.documentIdentity)).toBe(true);
    await expect(cell(page, 0)).toBeVisible();
    if (edited) await expectValue(page, 0, 4);
    await expect(build(page)).toHaveAttribute("content", "old");
  });
}

test("no service worker is registered before or after Update", async ({ page, deployment }) => {
  await openDaily(page, deployment);
  const registrations = () =>
    page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length);
  expect(await registrations()).toBe(0);
  await publish(page, deployment);
  await notice(page).getByRole("button", { name: "Update", exact: true }).tap();
  await expect(build(page)).toHaveAttribute("content", "new");
  expect(await registrations()).toBe(0);
});

for (const gesture of ["pointercancel", "touchcancel", "drag-return"]) {
  test(`regression: ${gesture} cannot activate Update`, async ({ page, deployment }) => {
    await openDaily(page, deployment);
    await publish(page, deployment);
    await notice(page)
      .locator(".update")
      .evaluate((button, gesture) => {
        const r = button.getBoundingClientRect();
        const touch = { identifier: 1, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
        const send = (type, point = touch) => {
          const event = new Event(type, { bubbles: true, cancelable: true });
          Object.defineProperties(event, {
            touches: { value: type === "touchend" ? [] : [point] },
            changedTouches: { value: [point] },
          });
          button.dispatchEvent(event);
        };
        send("touchstart");
        if (gesture === "drag-return") {
          send("touchmove", { ...touch, clientY: touch.clientY + 18 });
          send("touchmove");
        } else if (gesture === "pointercancel")
          button.dispatchEvent(
            new PointerEvent("pointercancel", { bubbles: true, pointerType: "touch" })
          );
        else send("touchcancel");
        send("touchend");
      }, gesture);
    await expect(notice(page)).toHaveAttribute("aria-busy", "false");
    expect(attempts(deployment)).toHaveLength(0);
  });
}

test("regression: native touch drag with pointercancel does not reload", async ({
  page,
  deployment,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Native CDP touch input is Chromium-only; cancellation is covered in both engines above."
  );
  await openDaily(page, deployment);
  await publish(page, deployment);
  const r = await notice(page).locator(".update").boundingBox();
  const x = r.x + r.width / 2,
    y = r.y + r.height / 2;
  const cdp = await page.context().newCDPSession(page);
  const send = (type, dy = 0) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchEnd" ? [] : [{ x, y: y + dy, id: 1 }],
    });
  await send("touchStart");
  for (let i = 1; i <= 6; i++) await send("touchMove", i * 3);
  await send("touchEnd", 18);
  await expect(notice(page)).toHaveAttribute("aria-busy", "false");
  await expect(build(page)).toHaveAttribute("content", "old");
  expect(attempts(deployment)).toHaveLength(0);
});

for (const input of ["touch", "mouse", "Enter", "Space"]) {
  test(`Update activates exactly once with ${input}`, async ({ page, deployment }) => {
    await openDaily(page, deployment);
    await publish(page, deployment);
    const button = notice(page).getByRole("button", { name: "Update", exact: true });
    if (input === "touch") await button.tap();
    else if (input === "mouse") await button.click();
    else {
      await button.focus();
      await button.press(input);
    }
    await expect(build(page)).toHaveAttribute("content", "new");
    expect(attempts(deployment)).toHaveLength(1);
  });
}

test("cold launch keeps the newer shell when the server offers an older deployment", async ({
  page,
  deployment,
}) => {
  await page.addInitScript(() => localStorage.setItem("sudoku-keypad-coach", "1"));
  const navigations = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) navigations.push(frame.url());
  });
  // The shell is new/2000; version.json, HTML and assets form a coherent old/1000 deployment.
  deployment.launchNew();
  const url = `${deployment.url}?q=${DEMO_PUZZLE}&keep=yes#board`;
  await page.goto(url);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(build(page)).toHaveAttribute("content", "new");
  await expect(page.locator(".board > .cell")).toHaveCount(81);
  expect(navigations).toEqual([url]);
  expect(attempts(deployment)).toHaveLength(0);
  expect(page.url()).toBe(url);
  await cell(page, 0).click();
  await page.keyboard.press("4");
  await expectValue(page, 0, 4);
});

test("offline foreground retains the document and usable input", async ({ page, deployment }) => {
  await open(page, deployment);
  const identity = await page.evaluateHandle(() => window.documentIdentity);
  deployment.publish();
  await page.clock.setSystemTime(new Date(Date.now() + 60_000));
  await page.context().setOffline(true);
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }))
  );
  await page.waitForTimeout(200);
  expect(await identity.evaluate((value) => value === window.documentIdentity)).toBe(true);
  await expect(build(page)).toHaveAttribute("content", "old");
  await expect(notice(page)).toHaveCount(0);
  await cell(page, 0).click();
  await page.keyboard.press("4");
  await expectValue(page, 0, 4);
  expect(attempts(deployment)).toHaveLength(0);
});

test("ordinary and persisted pageshow have exact version request counts without navigation", async ({
  page,
  deployment,
}) => {
  await open(page, deployment);
  const identity = await page.evaluateHandle(() => window.documentIdentity);
  const probes = () => deployment.requests.filter((r) => r.includes("version.json")).length;
  await expect.poll(probes).toBe(1);
  await page.clock.setSystemTime(new Date(Date.now() + 60_000));
  deployment.publish();
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow")));
  await page.waitForTimeout(100);
  expect(probes()).toBe(1);
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }))
  );
  await expect(notice(page)).toHaveCSS("opacity", "1");
  // Verification reads the manifest before and after warming HTML/assets.
  expect(probes()).toBe(3);
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent("pageshow"));
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
  });
  await page.waitForTimeout(100);
  expect(probes()).toBe(3);
  expect(await identity.evaluate((value) => value === window.documentIdentity)).toBe(true);
  expect(attempts(deployment)).toHaveLength(0);
});

test("animation frames never paint hint and notice ink together on entrance or exit", async ({
  page,
  deployment,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await open(page, deployment);
  const start = () =>
    page.evaluate(() => {
      window.swapSamples = [];
      const sample = () => {
        window.swapSamples.push({
          hint: Number(getComputedStyle(document.querySelector(".normal-hint")).opacity),
          notice: Number(getComputedStyle(document.querySelector(".update-notice")).opacity),
        });
        window.swapFrame = requestAnimationFrame(sample);
      };
      sample();
    });
  const stop = () =>
    page.evaluate(() => {
      cancelAnimationFrame(window.swapFrame);
      return window.swapSamples;
    });
  await start();
  await publish(page, deployment);
  const entrance = await stop();
  await start();
  await notice(page).getByRole("button", { name: "Dismiss", exact: true }).click();
  await expect(page.locator(".normal-hint")).toHaveCSS("opacity", "1");
  const exit = await stop();
  for (const frames of [entrance, exit]) {
    expect(frames.length).toBeGreaterThan(5);
    expect(frames.every((frame) => frame.hint === 0 || frame.notice === 0)).toBe(true);
  }
  expect(entrance.at(-1)).toEqual({ hint: 0, notice: 1 });
  expect(exit.at(-1)).toEqual({ hint: 1, notice: 0 });
});

for (const width of [390, 1280]) {
  for (const view of ["Play", "Journal"]) {
    for (const motion of ["normal", "media", "query"]) {
      test(`visible notice matrix ${width} ${view} ${motion}`, async ({ page, deployment }) => {
        await page.setViewportSize({ width, height: 844 });
        await page.emulateMedia({ reducedMotion: motion === "media" ? "reduce" : "no-preference" });
        await open(page, deployment, `?q=${DEMO_PUZZLE}${motion === "query" ? "&rm=1" : ""}`);
        if (view === "Journal") await page.getByRole("button", { name: /Open Journal/ }).click();
        await settle(page);
        const region = await live(page).elementHandle();
        const identity = await page.evaluateHandle(() => window.documentIdentity);
        const control = page.locator("#time-control");
        await control.focus();
        const focus = await page.evaluateHandle(() => document.activeElement);
        const geometry = () =>
          page
            .locator(".board, .hint-line, .keypad")
            .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()));
        const before = await geometry();
        await publish(page, deployment);
        expect(await geometry()).toEqual(before);
        const n = notice(page),
          rect = await n.boundingBox();
        expect(rect.x).toBeGreaterThanOrEqual(0);
        expect(rect.x + rect.width).toBeLessThanOrEqual(width);
        expect(rect.x + rect.width / 2).toBeCloseTo(width / 2, 0);
        const inline = width === 390 && view === "Play";
        await expect(n).toHaveClass(inline ? /inline/ : /pill/);
        if (!inline) {
          expect(rect.height).toBe(44);
          expect(844 - rect.y - rect.height).toBeCloseTo(16, 0);
        } else {
          await expect(page.locator(".normal-hint")).toHaveCSS("opacity", "0");
        }
        await expect(n).toHaveCSS("transition-duration", motion === "normal" ? "0.18s" : "0s");
        await expect(live(page)).toHaveText("New version ready. Update available.");
        await expect(live(page)).toHaveAttribute("aria-live", "polite");
        expect(await focus.evaluate((el) => el === document.activeElement)).toBe(true);
        expect(await identity.evaluate((value) => value === window.documentIdentity)).toBe(true);
        expect(attempts(deployment)).toHaveLength(0);
        await page.clock.install();
        await page.clock.fastForward(60_000);
        await expect(n).toBeVisible();
        await n.locator(".msg").tap();
        await expect(n).toBeVisible();
        await control.focus();
        await n.getByRole("button", { name: "Dismiss", exact: true }).tap();
        await expect(notice(page)).toHaveCount(0);
        expect(await focus.evaluate((el) => el === document.activeElement)).toBe(true);
        expect(await region.evaluate((el) => el === document.querySelector(".update-live"))).toBe(
          true
        );
        if (view === "Play") await page.getByRole("button", { name: /Open Journal/ }).click();
        else await page.getByRole("button", { name: "Back to game", exact: true }).click();
        expect(await region.evaluate((el) => el === document.querySelector(".update-live"))).toBe(
          true
        );
        expect(await identity.evaluate((value) => value === window.documentIdentity)).toBe(true);
        await expect(build(page)).toHaveAttribute("content", "old");
        expect(attempts(deployment)).toHaveLength(0);
      });
    }
  }
}
