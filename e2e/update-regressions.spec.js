import { test as base, expect } from "@playwright/test";
import { upgradeServer } from "./upgrade-server.js";
import { buildRoot } from "./upgrade-builds.js";
import { join } from "node:path";
import { cell, expectValue, DEMO_PUZZLE } from "./helpers.js";

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

for (const mode of ["Manual", "Auto"]) {
  for (const delay of [100, 4500]) {
    test(`regression: ${mode} game survives Update navigation delayed ${delay}ms`, async ({
      page,
      deployment,
    }) => {
      await open(page, deployment);
      await cell(page, 0).click();
      await page.keyboard.press("4");
      if (mode === "Manual") {
        await page.locator(".notes-mode").click();
        await page.getByRole("menuitemradio", { name: /^Manual / }).click();
      }
      await page.keyboard.press("Shift+Digit3");
      await cell(page, 2).click();
      await page.keyboard.press("Escape");
      await publish(page, deployment);
      const before = await state(page);
      let saved;
      let removedBeforeArrival = false;
      page.on("console", (message) => {
        if (message.text().startsWith("R2_RESUME ")) saved = JSON.parse(message.text().slice(10));
        if (message.text() === "R2_REMOVED") removedBeforeArrival = true;
      });
      await page.evaluate(() => {
        const write = Storage.prototype.setItem,
          remove = Storage.prototype.removeItem;
        Storage.prototype.setItem = function (key, value) {
          if (key === "sudoku-update-resume") console.log("R2_RESUME " + value);
          return write.call(this, key, value);
        };
        Storage.prototype.removeItem = function (key) {
          if (key === "sudoku-update-resume") console.log("R2_REMOVED");
          return remove.call(this, key);
        };
      });
      await page.route("**/*", async (route) => {
        if (
          route.request().isNavigationRequest() &&
          route.request().url().includes("_sudoku_update=")
        ) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
        await route.continue().catch(() => {});
      });
      await notice(page).getByRole("button", { name: "Update", exact: true }).tap();
      await expect(build(page)).toHaveAttribute("content", "new");
      if (delay > 3000) expect(removedBeforeArrival).toBe(false);
      await expect(cell(page, 0)).toBeVisible();
      const after = await state(page);
      expect(after.cells).toEqual(before.cells);
      expect(after.mode).toBe(`Notes mode: ${mode}`);
      const elapsed = Number(saved.elapsed);
      expect(after.time?.trim()).toBe(
        `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`
      );
      expect(await page.evaluate(() => sessionStorage.getItem("sudoku-update-resume"))).toBeNull();
      expect(attempts(deployment)).toHaveLength(1);
    });
  }
}

for (const gesture of ["pointercancel", "touchcancel", "drag-return"]) {
  test(`regression: ${gesture} cannot activate Update`, async ({ page, deployment }) => {
    await open(page, deployment);
    await publish(page, deployment);
    await page.evaluate(() => {
      sessionStorage.setItem("sudoku-update-attempts", '["new"]');
      window.updateWrites = 0;
      const write = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === "sudoku-update-resume") window.updateWrites++;
        return write.call(this, key, value);
      };
    });
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
    expect(await page.evaluate(() => window.updateWrites)).toBe(0);
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
  await open(page, deployment);
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
    await open(page, deployment);
    await publish(page, deployment);
    let writes = 0;
    await page.exposeFunction("recordUpdateSave", () => writes++);
    await page.evaluate(() => {
      const write = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === "sudoku-update-resume") window.recordUpdateSave();
        return write.call(this, key, value);
      };
    });
    const button = notice(page).getByRole("button", { name: "Update", exact: true });
    if (input === "touch") await button.tap();
    else if (input === "mouse") await button.click();
    else {
      await button.focus();
      await button.press(input);
    }
    await expect(build(page)).toHaveAttribute("content", "new");
    expect(writes).toBe(1);
    expect(attempts(deployment)).toHaveLength(1);
  });
}

for (const fault of ["offline", "version-error", "old-html", "asset-error"]) {
  test(`regression: staged launch stays editable on ${fault}, applies when reachable`, async ({
    page,
    deployment,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem("sudoku-keypad-coach", "1");
      localStorage.setItem(
        "sudoku-pending-update",
        JSON.stringify({ version: "new", builtAt: 2000 })
      );
    });
    deployment.publish();
    deployment.launchOld();
    deployment.fault(fault);
    await page.route("**/*", (route) => {
      const request = route.request();
      if (request.isNavigationRequest() && request.url().includes("_sudoku_update="))
        return route.abort("internetdisconnected");
      if (
        fault === "asset-error" &&
        request.resourceType() === "fetch" &&
        request.url().includes("/assets/")
      )
        return route.fulfill({ status: 503, body: "asset unavailable" });
      return route.continue();
    });
    await page.goto(`${deployment.url}?q=${DEMO_PUZZLE}`).catch(() => {});
    await page.getByRole("button", { name: "Play", exact: true }).click({ timeout: 4000 });
    await expect(cell(page, 0)).toBeVisible();
    await page.waitForTimeout(1700);
    await expect(build(page)).toHaveAttribute("content", "old");
    await cell(page, 0).click();
    await page.keyboard.press("4");
    await expectValue(page, 0, 4);
    expect(attempts(deployment)).toHaveLength(0);
    expect(await page.evaluate(() => localStorage.getItem("sudoku-pending-update"))).not.toBeNull();
    deployment.fault("");
    deployment.launchOld();
    await page.unroute("**/*");
    await page.reload();
    await expect(build(page)).toHaveAttribute("content", "new");
    expect(attempts(deployment)).toHaveLength(1);
  });
}

test("regression: offline context retains the cached shell and pending build", async ({
  page,
  deployment,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("sudoku-keypad-coach", "1");
    localStorage.setItem(
      "sudoku-pending-update",
      JSON.stringify({ version: "new", builtAt: 2000 })
    );
  });
  await page.context().setOffline(true);
  // Supply only the already cached old shell and assets; all update networking fails.
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("version.json") || url.searchParams.has("_sudoku_update"))
      return route.abort("internetdisconnected");
    const relative = url.pathname.replace(/^\/sudoku\//, "") || "index.html";
    return route.fulfill({
      path: join(process.env.SUDOKU_UPGRADE_BASELINE || buildRoot, "old", relative),
    });
  });
  await page.goto(`${deployment.url}?q=${DEMO_PUZZLE}`).catch(() => {});
  await page.getByRole("button", { name: "Play", exact: true }).click({ timeout: 4000 });
  await cell(page, 0).click();
  await page.keyboard.press("4");
  await expectValue(page, 0, 4);
  await expect(build(page)).toHaveAttribute("content", "old");
  expect(await page.evaluate(() => navigator.onLine)).toBe(false);
  expect(attempts(deployment)).toHaveLength(0);
  expect(await page.evaluate(() => localStorage.getItem("sudoku-pending-update"))).not.toBeNull();
  await page.context().setOffline(false);
  await page.unrouteAll({ behavior: "wait" });
  deployment.publish();
  deployment.launchOld();
  await page.reload();
  await expect(build(page)).toHaveAttribute("content", "new");
});

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
  expect(await page.evaluate(() => sessionStorage.getItem("sudoku-update-attempts"))).toBeNull();
  await cell(page, 0).click();
  await page.keyboard.press("4");
  await expectValue(page, 0, 4);
});

test("daily progress bytes and elapsed time survive next-launch apply", async ({
  page,
  deployment,
}) => {
  await page.clock.setSystemTime(new Date("2026-10-23T12:00:00Z"));
  await open(page, deployment);
  await page.getByRole("button", { name: /Open Journal/ }).click();
  await page.locator('button.day[data-d="2026-10-22"]:visible').click();
  await page
    .locator(".prow:visible")
    .filter({ hasText: "Easy" })
    .getByRole("button", { name: "Start", exact: true })
    .click();
  await expect(page.locator(".board > .cell")).toHaveCount(81);
  await settle(page);
  const index = await page
    .locator(".board > .cell")
    .evaluateAll((cells) => cells.findIndex((c) => !c.querySelector(".pen-box")));
  expect(index).toBeGreaterThanOrEqual(0);
  await expect(page.locator("[data-time]")).not.toHaveText(/0:00$/);
  await cell(page, index).click();
  await page.keyboard.press("1");
  await expectValue(page, index, 1);
  await page.getByRole("button", { name: /Open Journal/ }).click();
  const saved = await page.evaluate(() => localStorage.getItem("sudoku-progress"));
  const entry = JSON.parse(saved)["2026-10-22"].easy;
  expect(entry.elapsed).toBeGreaterThan(0);
  await publish(page, deployment);
  await notice(page).getByRole("button", { name: "Dismiss", exact: true }).click();
  deployment.launchOld();
  await page.goto(`${deployment.url}?q=${DEMO_PUZZLE}&keep=yes#board`);
  await expect(build(page)).toHaveAttribute("content", "new");
  expect(await page.evaluate(() => localStorage.getItem("sudoku-progress"))).toBe(saved);
  expect(new URL(page.url()).searchParams.get("keep")).toBe("yes");
  expect(new URL(page.url()).hash).toBe("#board");
  await page.locator('button.day[data-d="2026-10-22"]:visible').click();
  await page
    .locator(".prow:visible")
    .filter({ hasText: "Easy" })
    .getByRole("button", { name: "Resume", exact: true })
    .click();
  await expectValue(page, index, 1);
  const elapsed = await page.locator("[data-time]").evaluate((el) => {
    const [m, s] = el.textContent.trim().split(":").map(Number);
    return m * 60 + s;
  });
  expect(elapsed).toBeGreaterThanOrEqual(entry.elapsed);
  expect(elapsed).toBeLessThan(entry.elapsed + 3);
  expect(attempts(deployment)).toHaveLength(1);
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
