<script>
  import { tick, untrack } from "svelte";
  import { get } from "svelte/store";
  import { solvedPuzzles, puzzleProgress } from "./store.js";
  import { puzzleData } from "./puzzles.js";
  import { game } from "./game/game.svelte.js";
  import { formatDay, latestPuzzleDay } from "./game/daily.js";
  import {
    DIFFS,
    DIFF_LABEL,
    MONTHS,
    MONTHS3,
    WEEKDAYS,
    addDays,
    fmtTime,
    longDate,
    parseDay,
    shortDate,
    startOfMonth,
  } from "./journal/format.js";
  import {
    averages,
    dayDesc,
    longestStreak,
    monthCells,
    monthStats,
    personalBests,
    puzzleState,
    solvedCount,
    streakFrom,
    unfinishedList,
  } from "./journal/stats.js";
  import Icon from "./journal/Icon.svelte";
  import Marks from "./journal/Marks.svelte";
  import DiffLabel from "./journal/DiffLabel.svelte";
  import PuzzleRow from "./journal/PuzzleRow.svelte";
  import { SLIDE_EASE, SLIDE_MS, slideOffsets } from "./journal/slide.js";
  import { isAway, isTodayShortcut, latestAnnouncement, monthsToLatest } from "./journal/home.js";

  const today = formatDay(new Date());
  const latest = latestPuzzleDay(puzzleData, today) ?? today;

  let view = $state(startOfMonth(latest));
  /** Selected puzzle day, or null for the unfocused latest panel. */
  let sel = $state(/** @type {string | null} */ (null));
  /** Mobile sheet: a day, unfinished, or closed. */
  let sheet = $state(/** @type {null | "day" | "unfinished"} */ (null));
  let swipeX = $state(0);
  let swiping = $state(false);
  let touchX = 0;
  let animating = $state(false);
  let returning = $state(false);
  let announcement = $state("");
  /** @type {HTMLElement | null} */
  let contextCard = $state(null);
  let hasCardState = false;
  let slideGen = 0;
  let slideTimer = 0;
  let alive = true;
  /** @type {HTMLDivElement | null} */
  let mobVp = $state(null);
  /** @type {HTMLDivElement | null} */
  let deskVp = $state(null);
  /**
   * Dual-grid slide. `view` (title + stats) stays put until the track settles.
   * @typedef {{
   *   dir: -1 | 1,
   *   destination: Date,
   *   selection: string | null,
   *   onfinish?: () => void,
   *   fromPx: number,
   *   width: number,
   *   phase: "prep" | "run",
   *   target: "mobile" | "desktop",
   *   gen: number,
   * }} MonthSlide
   */
  let slide = $state(/** @type {MonthSlide | null} */ (null));

  const solved = $derived($solvedPuzzles);
  const progress = $derived($puzzleProgress);
  const md = $derived(monthStats(puzzleData, solved, progress, view, latest));
  const cells = $derived(monthCells(puzzleData, latest, today, view));
  const unfinished = $derived(unfinishedList(progress, solved));
  const streak = $derived(streakFrom(puzzleData, solved, latest));
  const longest = $derived(longestStreak(puzzleData, solved, latest));
  const bests = $derived(personalBests(solved));
  const avgs = $derived(averages(solved));
  const y = $derived(view.getFullYear());
  const m = $derived(view.getMonth());
  const nextStart = $derived(
    `${m === 11 ? y + 1 : y}-${String(m === 11 ? 1 : m + 2).padStart(2, "0")}-01`
  );
  const canNext = $derived(nextStart <= today);
  const mobileAway = $derived(!returning && isAway(view, sel, latest, true));
  const desktopAway = $derived(!returning && isAway(view, sel, latest, false));
  const home = startOfMonth(latest);
  const homeLabel = `${MONTHS[home.getMonth()]} ${home.getFullYear()}`;
  const backLabel = `Back to ${homeLabel}, latest puzzles`;
  const shownDay = $derived(sel || latest);
  const otherUnfinished = $derived(unfinished.filter((x) => x.date !== shownDay));
  const sheetDay = $derived(sheet === "day" ? sel : null);
  const incomingCells = $derived(
    slide ? monthCells(puzzleData, latest, today, slide.destination) : cells
  );

  /** @param {string} date */
  function kinds(date) {
    return DIFFS.map((d) => puzzleState(solved, progress, date, d).kind);
  }

  function prefersReduced() {
    return (
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  /** @param {number} gen */
  function finishSlide(gen) {
    if (!slide || slide.gen !== gen) return;
    const current = slide;
    slide = null;
    animating = false;
    window.clearTimeout(slideTimer);
    const vp = current.target === "mobile" ? mobVp : deskVp;
    if (vp) vp.style.height = "";
    view = current.destination;
    current.onfinish?.();
  }

  /**
   * Paint the resting offset, then slide. Two frames so the start position commits
   * before the transition (same order as the approved mockup).
   * @param {number} gen
   * @param {HTMLElement} vp
   */
  function armSlide(gen, vp) {
    tick().then(() => {
      if (!alive || !slide || slide.gen !== gen) return;
      const track = vp.querySelector(".track");
      if (!(track instanceof HTMLElement)) {
        finishSlide(gen);
        return;
      }
      void track.offsetWidth;
      getComputedStyle(track).transform;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!alive || !slide || slide.gen !== gen || slide.phase !== "prep") return;
          slide = { ...slide, phase: "run" };
          window.clearTimeout(slideTimer);
          slideTimer = window.setTimeout(() => finishSlide(gen), SLIDE_MS + 120);
        });
      });
    });
  }

  /** @param {MonthSlide} s */
  function trackTransform(s) {
    const { start, end } = slideOffsets(s.dir, s.width, s.fromPx);
    return `translateX(${s.phase === "run" ? end : start}px)`;
  }

  /** @param {MonthSlide} s */
  function trackTransition(s) {
    return s.phase === "run" ? `transform ${SLIDE_MS}ms ${SLIDE_EASE}` : "none";
  }

  /** @param {TransitionEvent} e */
  function onTrackEnd(e) {
    if (!slide || e.propertyName !== "transform" || e.target !== e.currentTarget) return;
    finishSlide(slide.gen);
  }

  /**
   * Month chevrons, `[` `]`, and a committed touch drag.
   * `fromPx` continues a finger drag into the dual-grid slide.
   * @param {number} n
   * @param {number} [fromPx]
   * @param {{ selection?: string | null, onfinish?: () => void }} [options]
   */
  function shiftMonth(n, fromPx = 0, options = {}) {
    if (animating) return;
    if (n > 0 && !canNext) return;
    if (n === 0) return;
    const next = new Date(y, m + n, 1);
    const mobile = isMobile();
    const vp = mobile ? mobVp : deskVp;
    const grid = vp?.querySelector(":scope > .grid");
    if (prefersReduced() || !vp || !(grid instanceof HTMLElement) || vp.clientWidth <= 0) {
      swipeX = 0;
      swiping = false;
      view = next;
      options.onfinish?.();
      return;
    }
    vp.style.height = `${grid.offsetHeight}px`;
    animating = true;
    swipeX = 0;
    swiping = false;
    const gen = ++slideGen;
    slide = {
      dir: n < 0 ? -1 : 1,
      destination: next,
      selection: options.selection === undefined ? sel : options.selection,
      onfinish: options.onfinish,
      fromPx,
      width: vp.clientWidth,
      phase: "prep",
      target: mobile ? "mobile" : "desktop",
      gen,
    };
    armSlide(gen, vp);
  }

  /** @param {boolean} [openSheetAfter] */
  function goLatest(openSheetAfter = false) {
    if (animating || swiping || !isAway(view, sel, latest, isMobile())) return;
    const selection = sel;
    sel = null;
    sheet = null;
    returning = true;
    announcement = "";
    const done = async () => {
      await tick();
      if (!alive) return;
      const vp = isMobile() ? mobVp : deskVp;
      const cell = /** @type {HTMLButtonElement | null | undefined} */ (
        vp?.querySelector(`button.day[data-d="${latest}"]`)
      );
      cell?.focus({ preventScroll: true });
      if (openSheetAfter) openDay(latest);
      // Keep card changes silent through the optional sheet selection, then
      // announce the completed return once through the shared status.
      await tick();
      if (!alive) return;
      returning = false;
      announcement = latestAnnouncement(latest);
    };
    const diff = monthsToLatest(view, latest);
    if (diff) shiftMonth(diff, 0, { selection, onfinish: done });
    else void done();
  }

  function openLatest() {
    if (animating || swiping) return;
    if (monthsToLatest(view, latest)) goLatest(true);
    else openDay(latest);
  }

  function isMobile() {
    return typeof window !== "undefined" && window.matchMedia("(max-width: 599px)").matches;
  }

  /** @param {string} date */
  function openDay(date) {
    if (animating) return;
    if (!puzzleData[date]) return;
    if (isMobile()) {
      sel = date;
      sheet = "day";
      return;
    }
    sel = sel === date ? null : date;
    const d = parseDay(date);
    if (d.getFullYear() !== y || d.getMonth() !== m) view = startOfMonth(date);
  }

  function openUnfinished() {
    if (animating) return;
    sel = null;
    sheet = "unfinished";
  }

  function closeSheet() {
    sheet = null;
    if (isMobile()) sel = null;
  }

  /**
   * @param {string} date
   * @param {(typeof DIFFS)[number]} diff
   */
  function playPuzzle(date, diff) {
    const puzzle = puzzleData[date]?.[diff];
    if (!puzzle) return;
    const st = puzzleState(get(solvedPuzzles), get(puzzleProgress), date, diff);
    if (st.kind === "progress") {
      game.load(puzzle, {
        dateStr: date,
        difficulty: diff,
        snapshot: st.snapshot,
        elapsed: st.elapsed,
      });
    } else {
      game.load(puzzle, { dateStr: date, difficulty: diff });
    }
    window.dispatchEvent(
      new CustomEvent("loadPuzzle", {
        detail: { dateStr: date, difficulty: diff, puzzleString: puzzle },
      })
    );
  }

  /** @param {string} date */
  function pickDayFromUnfinished(date) {
    if (animating) return;
    if (isMobile()) {
      sel = date;
      sheet = "day";
      return;
    }
    sel = date;
    view = startOfMonth(date);
  }

  /** @param {TouchEvent} e */
  function onTouchStart(e) {
    if (animating) return;
    touchX = e.touches[0].clientX;
    swiping = true;
    swipeX = 0;
  }
  /** @param {TouchEvent} e */
  function onTouchMove(e) {
    if (!swiping || animating) return;
    let dx = e.touches[0].clientX - touchX;
    if (dx < 0 && !canNext) dx /= 4;
    swipeX = dx;
  }
  function onTouchEnd() {
    if (!swiping) return;
    const dx = swipeX;
    if (Math.abs(dx) > 60 && (dx > 0 || canNext)) shiftMonth(dx > 0 ? -1 : 1, dx);
    else {
      swipeX = 0;
      swiping = false;
    }
  }

  /** @param {KeyboardEvent} e */
  function onKey(e) {
    if (animating || swiping || isMobile()) return;
    if (isTodayShortcut(e)) {
      if (sheet || document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]'))
        return;
      if (desktopAway) {
        e.preventDefault();
        goLatest();
      }
      return;
    }
    if (e.key === "Escape" && sel) {
      sel = null;
      return;
    }
    if (e.key === "[") {
      shiftMonth(-1);
      return;
    }
    if (e.key === "]") {
      if (canNext) shiftMonth(1);
      return;
    }
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key] ?? 0;
    let t = addDays(sel || latest, step);
    let g = 0;
    while (t <= latest && !puzzleData[t] && g++ < 40) t = addDays(t, step > 0 ? 1 : -1);
    if (puzzleData[t] && t <= latest) {
      sel = t;
      view = startOfMonth(t);
    }
  }

  $effect(() => {
    // Mirror the card's text for ordinary selection and puzzle-state changes.
    // A single persistent region also works when the desktop card is hidden.
    sel;
    solved;
    progress;
    if (!hasCardState) {
      hasCardState = true;
      return;
    }
    if (untrack(() => returning)) return;
    tick().then(() => {
      if (alive && !returning) announcement = contextCard?.textContent?.trim() ?? "";
    });
  });

  $effect(() => {
    if (typeof document === "undefined") return;
    document.body.classList.toggle("journal-sheet", !!sheet);
    return () => document.body.classList.remove("journal-sheet");
  });

  $effect(() => {
    alive = true;
    return () => {
      alive = false;
      window.clearTimeout(slideTimer);
      if (mobVp) mobVp.style.height = "";
      if (deskVp) deskVp.style.height = "";
    };
  });
</script>

<svelte:window onkeydown={onKey} />

{#snippet monthTitle(away)}
  <button
    class="month-title"
    class:away
    type="button"
    aria-disabled={!away || animating ? "true" : undefined}
    aria-label={away && !animating ? backLabel : returning ? homeLabel : `${MONTHS[m]} ${y}`}
    title={away && !animating ? "Back to latest" : undefined}
    onclick={() => goLatest()}
  >
    <span class="month-text">{MONTHS[m]} <span class="num year">{y}</span></span>
    <span class="return-icon" aria-hidden="true"
      ><svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.25"
        stroke-linecap="round"
        stroke-linejoin="round"
        ><path d="M9 14 4 9l5-5" /><path
          d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"
        /></svg
      ></span
    >
  </button>
{/snippet}

<div class="journal">
  <div class="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</div>
  <div class="mobile">
    <div class="lcard">
      <button
        class="latest"
        class:sel={sheet === "day" && sel === latest}
        type="button"
        data-d={latest}
        aria-label="Latest puzzles, {longDate(latest)}"
        onclick={openLatest}
      >
        <span>
          <span class="k">Latest puzzles</span>
          <b>{shortDate(latest)}</b>
        </span>
        <span class="ct num">
          <Marks kinds={kinds(latest)} size={11} gap={3} />
          {solvedCount(solved, latest)} of 3
        </span>
        <Icon name="chevron-right" />
      </button>
      {#if unfinished.length}
        <button
          class="ulink"
          class:sel={sheet === "unfinished"}
          type="button"
          aria-label="Unfinished puzzles, {unfinished.length}"
          onclick={openUnfinished}
        >
          <Icon name="history" />
          <span>Unfinished</span>
          <span class="ucount num">{unfinished.length}</span>
          <Icon name="chevron-right" />
        </button>
      {/if}
    </div>

    <div class="mhead">
      <h1>{@render monthTitle(mobileAway)}</h1>
      <button
        class="iconbtn"
        type="button"
        aria-label="Previous month"
        onclick={() => shiftMonth(-1)}
      >
        <Icon name="chevron-left" />
      </button>
      <button
        class="iconbtn"
        type="button"
        aria-label="Next month"
        disabled={!canNext}
        onclick={() => shiftMonth(1)}
      >
        <Icon name="chevron-right" />
      </button>
    </div>

    <section class="sblock" aria-label="{MONTHS[m]} by difficulty">
      <div class="srow h">
        <span>{MONTHS3[m]} by difficulty</span>
        <span class="r">Solved</span>
        <span class="r">Avg</span>
        <span class="r">Best</span>
      </div>
      {#each DIFFS as d (d)}
        {@const r = md.rows[d]}
        <div class="srow">
          <DiffLabel diff={d} />
          <span class="r num">{r.n}</span>
          <span class="r num">{r.avg != null ? fmtTime(r.avg) : "—"}</span>
          <span class="r num">{r.best ? fmtTime(r.best.time) : "—"}</span>
        </div>
      {/each}
      <div class="sfoot">
        <Icon name="flame" />
        {#if streak}
          <b class="num">{streak}</b>
          <span>puzzle-day streak · longest <span class="num">{longest}</span></span>
        {:else}
          <span>Solve any puzzle to start a streak</span>
        {/if}
      </div>
    </section>

    <div class="cal">
      {#snippet mobGrid(gridCells, dragging, selection = sel)}
        <div
          class="grid mgrid"
          class:swiping={dragging}
          style:transform={dragging && swipeX ? `translateX(${swipeX}px)` : undefined}
        >
          {#each WEEKDAYS as w (w)}
            <div class="wd">{w[0]}</div>
          {/each}
          {#each gridCells as cell, i (cell?.date ?? `m-${i}`)}
            {#if !cell}
              <div></div>
            {:else if cell.kind === "nop"}
              <div
                class="day nop"
                aria-disabled="true"
                aria-label="{longDate(cell.date)}: no puzzle"
              >
                <span class="n num">{cell.day}</span>
                <span class="x">None</span>
              </div>
            {:else if cell.kind === "future"}
              <div class="day future" aria-disabled="true">
                <span class="n num">{cell.day}</span>
                {#if cell.notYet}<span class="x">Not yet</span>{/if}
              </div>
            {:else}
              <button
                class="day"
                class:is-latest={cell.date === latest}
                class:sel={selection === cell.date}
                type="button"
                data-d={cell.date}
                aria-label="{longDate(cell.date)}{cell.date === latest
                  ? ' (latest)'
                  : ''}: {dayDesc(solved, progress, cell.date)}"
                onclick={() => openDay(cell.date)}
              >
                <span class="n num">{cell.day}</span>
                <Marks kinds={kinds(cell.date)} size={9} gap={2} />
              </button>
            {/if}
          {/each}
        </div>
      {/snippet}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="viewport"
        bind:this={mobVp}
        ontouchstart={onTouchStart}
        ontouchmove={onTouchMove}
        ontouchend={onTouchEnd}
      >
        {#if slide && slide.target === "mobile"}
          <div
            class="track"
            style:transform={trackTransform(slide)}
            style:transition={trackTransition(slide)}
            ontransitionend={onTrackEnd}
          >
            {#if slide.dir < 0}
              {@render mobGrid(incomingCells, false)}
              {@render mobGrid(cells, false, slide.selection)}
            {:else}
              {@render mobGrid(cells, false, slide.selection)}
              {@render mobGrid(incomingCells, false)}
            {/if}
          </div>
        {:else}
          {@render mobGrid(cells, swiping)}
        {/if}
      </div>
      <div class="legend">
        <span>E · M · H</span>
        <span><Marks kinds={["solved"]} size={11} gap={0} />Solved</span>
        <span><Marks kinds={["progress"]} size={11} gap={0} />In progress</span>
        <span><Marks kinds={["none"]} size={11} gap={0} />Not solved</span>
        <span><i class="lg-nop"></i>No puzzle</span>
        <span><i class="lg-lat"></i>Latest</span>
      </div>
    </div>
  </div>

  <div class="page desktop">
    <aside class="left">
      <section class="card stats" aria-label="{MONTHS[m]} by difficulty">
        <h2>{MONTHS[m]} by difficulty</h2>
        <p class="lede num">
          {md.days} puzzle days · {md.tot} solved{md.unf ? ` · ${md.unf} unfinished` : ""}
        </p>
        <div class="stbl">
          <div class="stat h">
            <span></span>
            <span class="r">Solved</span>
            <span class="r">Avg</span>
            <span class="r">Best</span>
          </div>
          {#each DIFFS as d (d)}
            {@const r = md.rows[d]}
            <div class="stat">
              <DiffLabel diff={d} />
              <span class="r num">{r.n}</span>
              <span class="r num">{r.avg != null ? fmtTime(r.avg) : "—"}</span>
              <span class="r num">{r.best ? fmtTime(r.best.time) : "—"}</span>
            </div>
          {/each}
        </div>
        <div class="streak">
          <Icon name="flame" />
          <div>
            {#if streak}
              <span class="big num">{streak}</span>
              <div>puzzle-day streak</div>
            {:else}
              <div>Solve any puzzle to start a streak</div>
            {/if}
          </div>
          <div class="lg">Longest<b class="num">{longest}</b></div>
        </div>
      </section>
      <section class="card alltime" aria-label="All-time bests">
        <span class="kicker">All-time best</span>
        {#each DIFFS as d (d)}
          {@const b = bests[d]}
          <div class="ab">
            <DiffLabel diff={d} />
            <span>
              {#if b}
                <b class="num">{fmtTime(b.time)}</b>{shortDate(b.date).split(", ")[1]}
              {:else}
                —
              {/if}
            </span>
          </div>
        {/each}
      </section>
    </aside>

    <section class="cal dcal" aria-label="Calendar">
      <div class="strip">
        {#each DIFFS as d, i (d)}
          {@const r = md.rows[d]}
          <div class="card t">
            <div class="tl">
              <span>{DIFF_LABEL[d]}</span>
              <Marks pos={i} size={8} gap={2} />
            </div>
            <div class="tv">
              <b class="num">{r.n}</b>
              <span class="mm">
                <span>Avg</span>
                <span class="num">{r.avg != null ? fmtTime(r.avg) : "—"}</span>
                <span>Best</span>
                <span class="num">{r.best ? fmtTime(r.best.time) : "—"}</span>
              </span>
            </div>
          </div>
        {/each}
        <div class="card sk">
          <Icon name="flame" />
          <b class="num">{streak}</b>
          <span>day<br />streak</span>
        </div>
      </div>
      <div class="dmhead">
        <h2>{@render monthTitle(desktopAway)}</h2>
        <button
          class="navbtn"
          type="button"
          aria-label="Previous month"
          onclick={() => shiftMonth(-1)}
        >
          <Icon name="chevron-left" />
        </button>
        <button
          class="navbtn"
          type="button"
          aria-label="Next month"
          disabled={!canNext}
          onclick={() => shiftMonth(1)}
        >
          <Icon name="chevron-right" />
        </button>
      </div>
      <div class="msub num">
        <span>{md.tot} solved</span>
        {#if md.unf}
          <span class="dot">·</span>
          <span>{md.unf} unfinished</span>
        {/if}
        <span class="dot">·</span>
        <Icon name="flame" />
        <span>{streak}-day streak</span>
      </div>
      {#snippet deskGrid(gridCells, selection = sel)}
        <div class="grid dgrid" role="grid">
          {#each WEEKDAYS as w (w)}
            <div class="wd">{w}</div>
          {/each}
          {#each gridCells as cell, i (cell?.date ?? `d-${i}`)}
            {#if !cell}
              <div class="blank"></div>
            {:else if cell.kind === "nop"}
              <div
                class="day nop"
                aria-disabled="true"
                aria-label="{longDate(cell.date)}: no puzzle"
                title="No puzzle for this date"
              >
                <span class="n num">{cell.day}</span>
                <span class="lbl">No puzzle</span>
              </div>
            {:else if cell.kind === "future"}
              <div
                class="day future"
                aria-disabled="true"
                title={cell.notYet ? "Not out yet" : undefined}
              >
                <span class="n num">{cell.day}</span>
                {#if cell.notYet}<span class="lbl">Not out yet</span>{/if}
              </div>
            {:else}
              <button
                class="day"
                class:is-latest={cell.date === latest}
                class:sel={selection === cell.date || (!selection && cell.date === latest)}
                type="button"
                data-d={cell.date}
                aria-pressed={selection === cell.date || (!selection && cell.date === latest)}
                aria-label="{longDate(cell.date)}{cell.date === latest
                  ? ' (latest)'
                  : ''}: {dayDesc(solved, progress, cell.date)}"
                onclick={() => openDay(cell.date)}
              >
                <span class="n num">{cell.day}</span>
                <Marks kinds={kinds(cell.date)} size={12} gap={4} />
              </button>
            {/if}
          {/each}
        </div>
      {/snippet}
      <div class="viewport" bind:this={deskVp}>
        {#if slide && slide.target === "desktop"}
          <div
            class="track"
            style:transform={trackTransform(slide)}
            style:transition={trackTransition(slide)}
            ontransitionend={onTrackEnd}
          >
            {#if slide.dir < 0}
              {@render deskGrid(incomingCells)}
              {@render deskGrid(cells, slide.selection)}
            {:else}
              {@render deskGrid(cells, slide.selection)}
              {@render deskGrid(incomingCells)}
            {/if}
          </div>
        {:else}
          {@render deskGrid(cells)}
        {/if}
      </div>
      <div class="legend dleg">
        <span>E · M · H</span>
        <span><Marks kinds={["solved"]} size={12} gap={0} />Solved</span>
        <span><Marks kinds={["progress"]} size={12} gap={0} />In progress</span>
        <span><Marks kinds={["none"]} size={12} gap={0} />Not solved</span>
        <i class="brk" aria-hidden="true"></i>
        <span><i class="lg-nop"></i>No puzzle</span>
        <span><i class="lg-lat"></i>Latest</span>
        <span><i class="lg-sel"></i>Open</span>
      </div>
      <div class="keys">
        <span><kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> move day</span>
        <span><kbd>↵</kbd> play</span>
        <span><kbd>[</kbd><kbd>]</kbd> month</span>
        <span><kbd>T</kbd> today</span>
        <span><kbd>Esc</kbd> deselect</span>
      </div>
    </section>

    <aside class="right">
      {#if !sel || sel === latest}
        <section class="card ctx" aria-label="Latest puzzles" bind:this={contextCard}>
          <span class="kicker">Latest puzzles</span>
          <h2>{longDate(latest)}</h2>
          <p class="sub num">{solvedCount(solved, latest)} of 3 solved</p>
          <div class="plist">
            {#each DIFFS as d (d)}
              <PuzzleRow
                diff={d}
                st={puzzleState(solved, progress, latest, d)}
                avg={avgs[d]}
                isPb={bests[d]?.date === latest}
                onplay={() => playPuzzle(latest, d)}
              />
            {/each}
          </div>
          {#if sel !== latest}
            <p class="jump">
              <Icon name="info" />
              <span>Pick a day to open its puzzles here.</span>
              <kbd>←</kbd><kbd>→</kbd>
            </p>
          {/if}
        </section>
      {:else}
        <section class="card ctx" aria-label="Puzzles for {longDate(sel)}" bind:this={contextCard}>
          <div class="back">
            <button type="button" onclick={() => goLatest()}
              ><Icon name="arrow-left" />Back to latest</button
            >
            <kbd>T</kbd>
          </div>
          <span class="kicker">Puzzles for</span>
          <h2>{longDate(sel)}</h2>
          <p class="sub num">
            {DIFFS.some((d) => puzzleState(solved, progress, sel, d).kind !== "none")
              ? `${solvedCount(solved, sel)} of 3 solved`
              : "Not played yet"}
          </p>
          <div class="plist">
            {#each DIFFS as d (d)}
              <PuzzleRow
                diff={d}
                st={puzzleState(solved, progress, sel, d)}
                avg={avgs[d]}
                isPb={bests[d]?.date === sel}
                onplay={() => playPuzzle(sel, d)}
              />
            {/each}
          </div>
          <p class="pnote">
            <Icon name="calendar-days" />
            <span>NYT daily puzzles for this US date. Times stay on this device.</span>
          </p>
        </section>
      {/if}

      <section class="card ucard" aria-label="Unfinished puzzles (other than the day shown above)">
        <div class="uh">
          <Icon name="history" />
          <span class="kicker">Unfinished</span>
          {#if otherUnfinished.length}
            <span class="ucount num">{otherUnfinished.length}</span>
          {/if}
        </div>
        {#if otherUnfinished.length}
          <div class="ulist" class:more={otherUnfinished.length > 2}>
            {#each otherUnfinished as x (`${x.date}:${x.diff}`)}
              <button
                class="ulnk"
                type="button"
                data-d={x.date}
                aria-label="Open {longDate(x.date)}: {DIFF_LABEL[x.diff]}, {x.pct}% filled"
                onclick={() => pickDayFromUnfinished(x.date)}
              >
                <span>
                  <span class="l1">
                    <DiffLabel diff={x.diff} />
                    <span class="ud">{shortDate(x.date)}</span>
                  </span>
                  <span class="s num">{fmtTime(x.elapsed)} played · {x.pct}% filled</span>
                </span>
                <span class="bar"><i style="width:{x.pct}%"></i></span>
                <Icon name="chevron-right" />
              </button>
            {/each}
          </div>
        {:else}
          <p class="uempty">
            {unfinished.length
              ? "No other unfinished puzzles."
              : "No unfinished puzzles right now."}
          </p>
        {/if}
      </section>
    </aside>
  </div>
</div>

{#if sheet}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="scrim on" onclick={closeSheet}></div>
  <div
    class="sheet on"
    role="dialog"
    aria-modal="true"
    aria-label={sheet === "unfinished" ? "Unfinished puzzles" : "Day puzzles"}
  >
    <div class="grab"></div>
    {#if sheet === "unfinished"}
      <div class="shead">
        <div>
          <h2>Unfinished</h2>
          <p class="num">
            {unfinished.length
              ? `${unfinished.length} in progress · most recent first`
              : "Nothing in progress"}
          </p>
        </div>
        <button class="iconbtn" type="button" aria-label="Close" onclick={closeSheet}>
          <Icon name="x" />
        </button>
      </div>
      {#if unfinished.length}
        <div class="plist scroll ulist-m">
          {#each unfinished as x (`${x.date}:${x.diff}`)}
            <div class="urow">
              <button
                class="ub"
                type="button"
                data-d={x.date}
                aria-label="{DIFF_LABEL[x.diff]}, {longDate(x.date)}: {x.pct}% filled"
                onclick={() => pickDayFromUnfinished(x.date)}
              >
                <span class="l1">
                  <DiffLabel diff={x.diff} />
                  <span class="ud">{shortDate(x.date)}</span>
                </span>
                <span class="s num">{fmtTime(x.elapsed)} played · {x.pct}% filled</span>
                <span class="bar"><i style="width:{x.pct}%"></i></span>
              </button>
              <button
                class="btn btn-primary"
                type="button"
                onclick={() => playPuzzle(x.date, x.diff)}
              >
                <Icon name="play" />Resume
              </button>
            </div>
          {/each}
        </div>
      {:else}
        <p class="uempty-m">No unfinished puzzles right now.</p>
      {/if}
      <p class="snote">
        <Icon name="history" />Puzzles you leave halfway wait here. Progress stays on this device.
      </p>
    {:else if sheetDay}
      <div class="shead">
        <div>
          {#if sheetDay === latest}
            <span class="kicker">Latest puzzles</span>
          {/if}
          <h2>{longDate(sheetDay)}</h2>
          <p class="num">
            {DIFFS.some((d) => puzzleState(solved, progress, sheetDay, d).kind !== "none")
              ? `${solvedCount(solved, sheetDay)} of 3 solved`
              : "Not played yet"}
          </p>
        </div>
        <button class="iconbtn" type="button" aria-label="Close" onclick={closeSheet}>
          <Icon name="x" />
        </button>
      </div>
      <div class="plist">
        {#each DIFFS as d (d)}
          <PuzzleRow
            diff={d}
            st={puzzleState(solved, progress, sheetDay, d)}
            avg={avgs[d]}
            isPb={bests[d]?.date === sheetDay}
            onplay={() => playPuzzle(sheetDay, d)}
          />
        {/each}
      </div>
      <p class="snote">
        <Icon name="calendar-days" />NYT daily puzzles for this US date. Times stay on this device.
      </p>
    {/if}
  </div>
{/if}

<style>
  .journal {
    --chip: var(--chip-bg);
    --chipline: var(--chip-line);
    --ease: cubic-bezier(0.22, 0.8, 0.24, 1);
    font-size: 15px;
    line-height: 1.4;
  }
  .num {
    font-variant-numeric: tabular-nums;
  }
  .kicker {
    font-size: 12px;
    font-weight: 600;
    color: var(--ink2);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .ucount {
    display: inline-grid;
    place-items: center;
    min-width: 22px;
    height: 22px;
    padding: 0 7px;
    border-radius: 11px;
    background: var(--chip-bg);
    border: 1px solid var(--chip-line);
    color: var(--amber);
    font-size: 12.5px;
    font-weight: 700;
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
    font-size: 12px;
    color: var(--ink2);
    align-items: center;
  }
  .legend > span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .lg-nop {
    width: 14px;
    height: 12px;
    border-radius: 3px;
    border: 1.5px dashed var(--ink2);
  }
  .lg-lat {
    width: 14px;
    height: 12px;
    border-radius: 3px;
    border: 2px solid var(--ink);
  }
  .lg-sel {
    width: 14px;
    height: 12px;
    border-radius: 3px;
    background: var(--sel);
  }
  .bar {
    height: 4px;
    border-radius: 2px;
    background: var(--neutral);
    overflow: hidden;
  }
  .bar i {
    display: block;
    height: 100%;
    background: var(--amber);
  }
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    height: 40px;
    padding: 0 16px;
    border-radius: 10px;
    font-weight: 600;
    font-size: 15px;
    white-space: nowrap;
    font-family: inherit;
    border: 0;
    cursor: pointer;
    --ic: 16px;
  }
  .btn-primary {
    background: var(--blue);
    color: #fff;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .month-title {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: none;
    color: var(--ink);
    font: inherit;
    letter-spacing: inherit;
    text-align: inherit;
    white-space: nowrap;
    cursor: default;
    -webkit-tap-highlight-color: transparent;
    transition: color 150ms var(--ease);
  }
  .month-title::after {
    content: "";
    position: absolute;
    inset: -4px -6px;
  }
  .month-title.away:not([aria-disabled]) {
    cursor: pointer;
  }
  .month-title .year {
    color: var(--ink2);
    font-weight: 500;
    transition: color 150ms var(--ease);
  }
  .return-icon {
    display: inline-flex;
    width: 22px;
    height: 22px;
    flex: none;
    translate: 0 -1px;
    opacity: 0;
    pointer-events: none;
    transition: opacity 150ms var(--ease);
  }
  .month-title.away .return-icon {
    opacity: 1;
  }
  @media (hover: hover) {
    .month-title.away:not([aria-disabled]):hover {
      color: var(--ink2);
    }
  }
  .month-title.away:not([aria-disabled]):active,
  .month-title.away:not([aria-disabled]):active .year {
    color: #73716d;
  }
  .month-title:focus-visible {
    outline: 2px solid var(--blue);
    outline-offset: 3px;
  }
  kbd {
    font: 600 11px/1 var(--ui-font);
    color: var(--ink2);
    background: var(--card);
    border: 1px solid var(--hair);
    box-shadow: 0 1px 0 var(--hair);
    border-radius: 5px;
    padding: 3px 5px 2px;
    min-width: 20px;
    display: inline-block;
    text-align: center;
  }
  kbd + kbd {
    margin-left: 3px;
  }

  .desktop {
    display: none;
  }

  /* —— mobile M1 + U2 —— */
  .mobile {
    padding: 0 8px 8px;
  }
  .mobile .lcard {
    margin-top: 2px;
    background: var(--card);
    border: 1px solid var(--hair);
    border-radius: 14px;
    overflow: hidden;
  }
  .latest {
    display: grid;
    grid-template-columns: 1fr auto auto;
    align-items: center;
    gap: 12px;
    width: 100%;
    text-align: left;
    background: var(--card);
    border: 0;
    border-radius: 0;
    margin: 0;
    padding: 9px 12px 9px 14px;
    cursor: pointer;
    font: inherit;
    color: inherit;
  }
  .latest .k {
    font-size: 11px;
    font-weight: 600;
    color: var(--ink2);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .latest b {
    display: block;
    font-size: 16px;
    font-weight: 700;
    margin-top: 1px;
  }
  .latest .ct {
    font-size: 13px;
    line-height: 1;
    color: var(--ink2);
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .latest > :global(svg) {
    color: var(--ink2);
  }
  .latest.sel,
  .ulink.sel {
    background: var(--sel);
    box-shadow: inset 0 0 0 2px var(--blue);
  }
  .latest.sel {
    border-radius: 13px 13px 0 0;
  }
  .ulink.sel {
    border-radius: 0 0 13px 13px;
  }
  .ulink {
    position: relative;
    display: grid;
    grid-template-columns: auto 1fr auto auto;
    align-items: center;
    gap: 10px;
    width: 100%;
    height: 42px;
    padding: 0 12px 0 14px;
    font-size: 14px;
    font-weight: 600;
    color: var(--ink);
    text-align: left;
    background: none;
    border: 0;
    cursor: pointer;
    font-family: inherit;
  }
  .ulink::before {
    content: "";
    position: absolute;
    top: 0;
    left: 14px;
    right: 12px;
    border-top: 1px solid var(--neutral-2);
  }
  .ulink.sel::before {
    display: none;
  }
  .ulink > :global(svg:first-of-type) {
    --ic: 16px;
    color: var(--amber);
  }
  .ulink > :global(svg:last-of-type) {
    --ic: 18px;
    color: var(--ink2);
  }
  .ulink .ucount {
    height: 20px;
    min-width: 20px;
    font-size: 12px;
    margin-right: 2px;
  }
  .mhead {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 14px;
  }
  .mhead h1 {
    font-size: 24px;
    font-weight: 700;
    letter-spacing: -0.015em;
    flex: 1;
    margin: 0;
  }
  .iconbtn {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    display: grid;
    place-items: center;
    color: var(--ink);
    background: none;
    border: 0;
    cursor: pointer;
  }
  .iconbtn:disabled {
    color: var(--line-thin);
    cursor: default;
  }
  .sblock {
    margin-top: 10px;
    background: var(--card);
    border: 1px solid var(--hair);
    border-radius: 14px;
    padding: 4px 14px 6px;
  }
  .srow {
    display: grid;
    grid-template-columns: 1fr 54px 62px 62px;
    align-items: center;
    height: 30px;
    font-size: 14px;
  }
  .srow .r {
    text-align: right;
  }
  .srow.h {
    height: 24px;
    font-size: 11px;
    font-weight: 600;
    color: var(--ink2);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .srow + .srow:not(.h) {
    border-top: 1px solid var(--neutral-2);
  }
  .srow :global(.diff) {
    font-size: 14px;
    gap: 7px;
  }
  .sfoot {
    display: flex;
    align-items: center;
    gap: 8px;
    border-top: 1px solid var(--hair);
    margin-top: 2px;
    padding-top: 7px;
    font-size: 13px;
    color: var(--ink2);
    --ic: 15px;
  }
  .sfoot :global(svg) {
    color: var(--amber);
  }
  .sfoot b {
    font-size: 15px;
    color: var(--ink);
  }
  .mobile .cal {
    margin-top: 12px;
  }
  .viewport {
    overflow: hidden;
    position: relative;
    touch-action: pan-y;
  }
  .track {
    display: flex;
    width: 200%;
    will-change: transform;
  }
  .track > .grid {
    flex: 0 0 50%;
    width: 50%;
    min-width: 0;
    transition: none;
  }
  .mgrid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 4px;
    transition: transform 0.28s var(--ease);
    --dh: 54px;
  }
  .mgrid.swiping {
    transition: none;
  }
  .mobile .wd {
    font-size: 11px;
    font-weight: 600;
    color: var(--ink2);
    text-align: center;
    padding-bottom: 3px;
  }
  .mobile .day {
    position: relative;
    height: var(--dh, 54px);
    border-radius: 10px;
    background: var(--card);
    border: 1px solid var(--hair);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: flex-start;
    /* 7px inset so content clears the 2px inset latest ring by ≥5px */
    padding: 7px 0 10px 7px;
    text-align: left;
    font: inherit;
    color: inherit;
    cursor: pointer;
  }
  .mobile .day .n {
    font-size: 14px;
    font-weight: 600;
    color: var(--ink);
    line-height: 1;
  }
  .mobile .day.future {
    background: transparent;
    border-color: transparent;
    cursor: default;
  }
  .mobile .day.future .n {
    color: var(--ink2);
    font-weight: 400;
  }
  .mobile .day.future .x,
  .mobile .day.nop .x {
    font-size: 9.5px;
    font-weight: 600;
    color: var(--ink2);
  }
  /* Latest ring is ink, fully inside the cell. Selected day is fill only — no blue ring. */
  .mobile .day.is-latest:not(.sel) {
    outline: 2px solid var(--ink);
    outline-offset: -2px;
  }
  .mobile .day.sel {
    background: var(--sel);
  }
  .mobile .day.nop {
    background: transparent;
    border: 1.5px dashed var(--line-thin);
    cursor: default;
  }
  .mobile .day.nop .n {
    color: var(--ink2);
    font-weight: 400;
  }
  .mobile .legend {
    margin-top: 10px;
  }

  .scrim {
    position: fixed;
    inset: 0;
    background: rgb(28 26 22 / 0.34);
    z-index: 40;
  }
  .sheet {
    display: flex;
    flex-direction: column;
    max-height: calc(100dvh - 56px);
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    margin: 0 auto;
    max-width: 560px;
    background: var(--card);
    border-radius: 18px 18px 0 0;
    padding: 8px 16px calc(20px + env(safe-area-inset-bottom));
    box-shadow: 0 -6px 24px rgb(28 26 22 / 0.12);
    z-index: 41;
  }
  .grab {
    width: 36px;
    height: 5px;
    border-radius: 3px;
    background: var(--hair);
    margin: 0 auto 10px;
    flex: none;
  }
  .shead {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
    flex: none;
  }
  .shead h2 {
    font-size: 20px;
    font-weight: 700;
    margin: 2px 0 0;
  }
  .shead p {
    font-size: 14px;
    color: var(--ink2);
    margin-top: 2px;
  }
  .plist {
    margin-top: 8px;
    border-top: 1px solid var(--hair);
  }
  .sheet :global(.prow .diff) {
    font-size: 17px;
  }
  .plist.scroll {
    overflow-y: auto;
    overscroll-behavior: contain;
    min-height: 0;
  }
  .snote {
    margin-top: 4px;
    padding-top: 12px;
    border-top: 1px solid var(--hair);
    font-size: 13px;
    color: var(--ink2);
    display: flex;
    gap: 6px;
    align-items: flex-start;
    flex: none;
    --ic: 15px;
  }
  .snote :global(svg) {
    margin-top: 1px;
  }
  .urow {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    min-height: 78px;
    padding: 10px 0;
  }
  .urow + .urow {
    border-top: 1px solid var(--neutral-2);
  }
  .ub {
    display: block;
    text-align: left;
    min-width: 0;
    background: none;
    border: 0;
    cursor: pointer;
    font: inherit;
    color: inherit;
    padding: 0;
  }
  .ub .l1 {
    display: flex;
    align-items: baseline;
    gap: 8px;
    flex-wrap: wrap;
  }
  .ub .ud {
    font-size: 13px;
    color: var(--ink2);
  }
  .ub .s {
    display: block;
    margin-top: 3px;
    font-size: 13px;
    color: var(--ink2);
  }
  .ub .bar {
    display: block;
    margin-top: 7px;
    width: 100%;
    max-width: 150px;
  }
  .uempty-m {
    padding: 22px 0 18px;
    font-size: 14px;
    color: var(--ink2);
    border-top: 1px solid var(--hair);
    margin-top: 8px;
  }

  /* —— desktop —— */
  @media (min-width: 600px) {
    .mobile,
    .scrim,
    .sheet {
      display: none;
    }
    .desktop {
      display: grid;
      grid-template-columns: 290px minmax(0, 1fr) 350px;
      gap: 36px;
      max-width: 1380px;
      margin: 0 auto;
      padding: 28px 36px 32px;
      align-items: start;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--hair);
      border-radius: 14px;
    }
    .stats {
      padding: 18px 18px 16px;
    }
    .stats h2,
    .ctx h2 {
      font-size: 19px;
      font-weight: 700;
      letter-spacing: -0.005em;
      margin: 0;
    }
    .stats .lede {
      font-size: 13px;
      color: var(--ink2);
      margin-top: 3px;
    }
    .stbl {
      margin-top: 12px;
    }
    .stat {
      display: grid;
      grid-template-columns: 1fr 46px 56px 56px;
      align-items: center;
      height: 44px;
      font-size: 14px;
    }
    .stat + .stat {
      border-top: 1px solid var(--neutral-2);
    }
    .stat .r {
      text-align: right;
    }
    .stat.h {
      height: 26px;
      font-size: 11px;
      color: var(--ink2);
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      border-bottom: 1px solid var(--hair);
    }
    .stat.h + .stat {
      border-top: 0;
    }
    .streak {
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      gap: 10px;
      margin-top: 12px;
      padding-top: 14px;
      border-top: 1px solid var(--hair);
      font-size: 12.5px;
      color: var(--ink2);
      --ic: 20px;
    }
    .streak .big {
      font-size: 26px;
      font-weight: 700;
      color: var(--ink);
      line-height: 1;
    }
    .streak :global(svg) {
      color: var(--amber);
    }
    .streak .lg {
      text-align: right;
    }
    .streak .lg b {
      display: block;
      font-size: 15px;
      color: var(--ink);
    }
    .alltime {
      margin-top: 14px;
      padding: 14px 18px;
    }
    .alltime .kicker {
      margin-bottom: 6px;
      display: block;
    }
    .ab {
      display: flex;
      justify-content: space-between;
      align-items: center;
      height: 32px;
      font-size: 14px;
    }
    .ab > span:last-child {
      color: var(--ink2);
      font-size: 13px;
    }
    .ab b {
      color: var(--ink);
      font-weight: 700;
      margin-right: 6px;
    }
    .strip {
      display: none;
      grid-template-columns: repeat(3, 1fr) auto;
      gap: 8px;
      margin-bottom: 16px;
    }
    .strip .t {
      padding: 9px 12px;
    }
    .strip .tl {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 13px;
      font-weight: 600;
    }
    .strip .tv {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 3px;
      font-size: 12.5px;
      color: var(--ink2);
    }
    .strip .tv .mm {
      display: grid;
      grid-template-columns: auto auto;
      gap: 0 6px;
      line-height: 1.35;
    }
    .strip .tv .mm span:nth-child(even) {
      color: var(--ink);
      text-align: right;
    }
    .strip .tv b {
      font-size: 20px;
      color: var(--ink);
    }
    .strip .sk {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0 14px;
      font-size: 12.5px;
      color: var(--ink2);
      --ic: 18px;
    }
    .strip .sk b {
      font-size: 20px;
      color: var(--ink);
    }
    .strip .sk :global(svg) {
      color: var(--amber);
    }
    .dcal {
      min-width: 0;
    }
    .dcal .viewport {
      border: 1px solid var(--line-thin);
      border-radius: 12px;
      background: var(--hair);
    }
    .dmhead {
      display: grid;
      grid-template-columns: 44px 1fr 44px;
      align-items: center;
    }
    .dmhead h2 {
      grid-column: 2;
      grid-row: 1;
      text-align: center;
      font-size: 24px;
      font-weight: 700;
      letter-spacing: -0.01em;
      margin: 0;
    }
    .dmhead .return-icon {
      position: absolute;
      left: 100%;
      margin-left: 6px;
      top: 50%;
      translate: 0 calc(-50% - 1px);
    }
    .dmhead .month-title::after {
      right: -34px;
    }
    .dmhead .navbtn {
      grid-row: 1;
      grid-column: 1;
    }
    .dmhead .navbtn:last-child {
      grid-column: 3;
    }
    .navbtn {
      width: 44px;
      height: 44px;
      border-radius: 11px;
      display: grid;
      place-items: center;
      background: var(--card);
      border: 1px solid var(--hair);
      color: var(--ink);
      cursor: pointer;
    }
    .navbtn:hover:not(:disabled) {
      border-color: var(--line-thin);
    }
    .navbtn:disabled {
      color: var(--line-thin);
      background: transparent;
      cursor: default;
    }
    .msub {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 8px;
      margin: 6px 0 14px;
      font-size: 13px;
      color: var(--ink2);
      --ic: 14px;
    }
    .msub :global(svg) {
      color: var(--amber);
    }
    .msub .dot {
      color: var(--line-thin);
    }
    .dgrid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      background: var(--hair);
      gap: 1px;
      --dh: clamp(64px, calc((100vh - 330px) / 6), 112px);
    }
    .dgrid .wd {
      background: var(--line-box);
      color: #f5f4f0;
      font-size: 12px;
      font-weight: 600;
      text-align: center;
      padding: 9px 0;
      letter-spacing: 0.03em;
    }
    .dgrid .day,
    .blank {
      background: var(--card);
      height: var(--dh);
      position: relative;
    }
    .blank {
      background: var(--neutral-2);
    }
    .dgrid .day {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
      width: 100%;
      transition: background-color 0.12s;
      border: 0;
      outline: none;
      font: inherit;
      color: inherit;
      cursor: pointer;
      padding: 10px 0;
    }
    .dgrid button.day:hover:not(.sel) {
      background: #faf9f6;
    }
    .dgrid .day .n {
      font-size: 16px;
      font-weight: 600;
      color: var(--ink);
      line-height: 1;
    }
    .dgrid .day.future {
      background: var(--page);
      cursor: default;
    }
    .dgrid .day.future .n {
      color: var(--ink2);
      font-weight: 400;
    }
    .dgrid .day.future .lbl,
    .dgrid .day.nop .lbl {
      font-size: 11px;
      color: var(--ink2);
      font-weight: 600;
    }
    .dgrid .day.nop .lbl {
      font-size: 10px;
      white-space: nowrap;
    }
    .dgrid .day.is-latest::before {
      content: "";
      position: absolute;
      inset: 2px;
      border: 2px solid var(--ink);
      border-radius: 9px;
      pointer-events: none;
    }
    .dgrid .day.sel,
    button.day.sel:hover {
      background: var(--sel);
    }
    /* Inset ring, same shape as the latest ring, so it never sits on the grid lines. */
    .dgrid .day.sel::after {
      content: "";
      position: absolute;
      inset: 1px;
      border: 3px solid var(--blue);
      border-radius: 10px;
      pointer-events: none;
    }
    /* Selected + latest: drop the ink Latest ring; keep blue selected ring + fill. */
    .dgrid .day.sel.is-latest::before {
      border-color: transparent;
    }
    .dgrid .day.nop {
      background: var(--page);
      cursor: not-allowed;
    }
    .dgrid .day.nop::before {
      content: "";
      position: absolute;
      inset: 5px;
      border: 1.5px dashed var(--line-thin);
      border-radius: 8px;
      pointer-events: none;
    }
    .dgrid .day.nop .n {
      color: var(--ink2);
      font-weight: 400;
    }
    .dleg {
      margin-top: 14px;
      justify-content: center;
      gap: 3px 12px;
    }
    .dleg .brk {
      flex-basis: 100%;
      height: 0;
    }
    .keys {
      margin-top: 10px;
      display: flex;
      justify-content: center;
      gap: 6px 14px;
      font-size: 12px;
      color: var(--ink2);
    }
    .keys span {
      white-space: nowrap;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .ctx {
      padding: 18px 18px 16px;
    }
    .ctx .kicker {
      display: block;
      margin-bottom: 3px;
    }
    .ctx .sub {
      font-size: 13px;
      color: var(--ink2);
      margin-top: 3px;
    }
    .ctx .plist {
      margin-top: 12px;
    }
    .ctx :global(.prow .diff) {
      font-size: 16px;
    }
    .back {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin: -6px 0 12px -8px;
      padding: 0;
    }
    .back button {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 32px;
      padding: 0 10px 0 8px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      color: var(--ink);
      background: none;
      border: 0;
      cursor: pointer;
      font-family: inherit;
      --ic: 16px;
    }
    .back button:hover {
      background: var(--neutral);
    }
    .jump {
      margin-top: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12.5px;
      color: var(--ink2);
      padding: 10px 12px;
      border-radius: 10px;
      background: var(--page);
      --ic: 14px;
    }
    .jump span {
      flex: 1;
      margin-left: 6px;
    }
    .pnote {
      margin-top: 4px;
      padding-top: 12px;
      border-top: 1px solid var(--hair);
      font-size: 12.5px;
      color: var(--ink2);
      display: flex;
      gap: 6px;
      --ic: 14px;
    }
    .pnote :global(svg) {
      margin-top: 2px;
    }
    .ucard {
      margin-top: 16px;
      padding: 12px 0 0;
      overflow: hidden;
    }
    .ucard .uh {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0 18px;
      padding: 0 0 8px;
      border-bottom: 1px solid var(--hair);
      --ic: 16px;
    }
    .ucard .uh :global(svg) {
      color: var(--amber);
    }
    .ucard .uh .kicker {
      flex: 1;
    }
    .ulist {
      max-height: 172px;
      overflow-y: auto;
      overscroll-behavior: contain;
      padding: 4px 8px 8px;
    }
    .ulnk {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto auto;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 8px 6px 8px 10px;
      border-radius: 10px;
      text-align: left;
      transition: background-color 0.12s;
      background: none;
      border: 0;
      cursor: pointer;
      font: inherit;
      color: inherit;
      --ic: 18px;
    }
    .ulnk + .ulnk {
      margin-top: 2px;
    }
    .ulnk:hover {
      background: var(--neutral-2);
    }
    .ulnk .l1 {
      display: flex;
      align-items: baseline;
      gap: 8px;
    }
    .ulnk :global(.diff) {
      font-size: 14px;
      gap: 7px;
    }
    .ulnk .ud,
    .ulnk .s {
      font-size: 12.5px;
      color: var(--ink2);
    }
    .ulnk .s {
      display: block;
      margin-top: 3px;
    }
    .ulnk > .bar {
      margin-top: 0;
      width: 56px;
    }
    .ulnk > :global(svg) {
      color: var(--ink2);
    }
    .ulist.more {
      box-shadow: inset 0 -10px 8px -8px rgb(28 26 22 / 0.1);
    }
    .ucard .uempty {
      padding: 10px 18px 8px;
      font-size: 13px;
      color: var(--ink2);
    }
  }

  @media (min-width: 600px) and (max-width: 1200px) {
    .desktop {
      grid-template-columns: minmax(0, 1fr) 320px;
      gap: 24px;
      padding: 20px 24px;
    }
    .left {
      display: none;
    }
    .strip {
      display: grid;
    }
    .dgrid {
      --dh: clamp(56px, calc((100vh - 400px) / 6), 92px);
    }
    .dgrid .day {
      gap: 8px;
    }
    .keys {
      display: none;
    }
  }

  /* Keep the title and its hit area clear of the arrows at narrow desktop widths. */
  @media (min-width: 600px) and (max-width: 799px) {
    .desktop {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .mgrid,
    .ulnk,
    .dgrid .day,
    .track,
    .month-title,
    .month-title .year,
    .return-icon {
      transition: none;
    }
  }
</style>
