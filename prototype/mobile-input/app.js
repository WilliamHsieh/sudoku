(() => {
  // Classic easy givens. Candidates are derived only from digits on the board.
  const PUZZLE = [
    [5, 3, 0, 0, 7, 0, 0, 0, 0],
    [6, 0, 0, 1, 9, 5, 0, 0, 0],
    [0, 9, 8, 0, 0, 0, 0, 6, 0],
    [8, 0, 0, 0, 6, 0, 0, 0, 3],
    [4, 0, 0, 8, 0, 3, 0, 0, 1],
    [7, 0, 0, 0, 2, 0, 0, 0, 6],
    [0, 6, 0, 0, 0, 0, 2, 8, 0],
    [0, 0, 0, 4, 1, 9, 0, 0, 5],
    [0, 0, 0, 0, 8, 0, 0, 7, 9],
  ];

  const TAP_MAX_DIST = 8;
  const TAP_MAX_MS = 500;
  const ARM_PX = 28;
  const DISARM_PX = 22;
  const CUE_FLASH = 1500;
  const FLY_MS = 260;
  const CUE_INTERVAL = readCueInterval();

  function readCueInterval() {
    const raw = new URLSearchParams(location.search).get("cueInterval");
    if (raw == null || raw === "") return 15000;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) return 15000;
    return value;
  }

  const boardEl = document.getElementById("board");
  const keysEl = document.getElementById("keys");
  const undoBtn = document.getElementById("undo");
  const eraseBtn = document.getElementById("erase");
  const modeBtn = document.getElementById("mode");
  const modeLabel = document.getElementById("mode-label");
  const moreBtn = document.getElementById("more");
  const sheet = document.getElementById("sheet");
  const cueToggle = document.getElementById("cue-toggle");
  const sheetClose = document.getElementById("sheet-close");
  const finger = document.getElementById("finger");

  const given = PUZZLE.map((row) => row.map((n) => n !== 0));
  let values = PUZZLE.map((row) => row.slice());
  let manual = emptyNotes();
  let excl = emptyNotes();
  let incl = emptyNotes();
  let mode = "auto";
  let selected = null;
  let cueEnabled = true;
  const history = [];
  const cueCycles = new Map();
  const cueHides = new Map();
  const cueShowing = new Set();
  const cells = [];
  let gesture = null;
  let dragPreview = null;
  let pendingArrive = null;
  let visualGen = 0;

  document.documentElement.dataset.cueInterval = String(CUE_INTERVAL);
  document.documentElement.dataset.cueFlash = String(CUE_FLASH);
  document.documentElement.dataset.cueEnabled = "true";

  function emptyNotes() {
    return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => []));
  }

  function prefersReduced() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function resist(px) {
    const span = 72;
    const lifted = span * (1 - Math.exp(-Math.max(0, px) / span));
    return lifted;
  }

  function sameBox(r1, c1, r2, c2) {
    return Math.floor(r1 / 3) === Math.floor(r2 / 3) && Math.floor(c1 / 3) === Math.floor(c2 / 3);
  }

  function usedDigits(r, c) {
    const used = new Set();
    for (let i = 0; i < 9; i++) {
      if (values[r][i]) used.add(values[r][i]);
      if (values[i][c]) used.add(values[i][c]);
    }
    const br = Math.floor(r / 3) * 3;
    const bc = Math.floor(c / 3) * 3;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const v = values[br + i][bc + j];
        if (v) used.add(v);
      }
    }
    return used;
  }

  function visibleList(r, c) {
    if (values[r][c] !== 0) return [];
    if (mode === "manual") return manual[r][c].slice().sort((a, b) => a - b);
    const set = new Set();
    for (let d = 1; d <= 9; d++) set.add(d);
    for (const d of usedDigits(r, c)) set.delete(d);
    for (const d of excl[r][c]) set.delete(d);
    for (const d of incl[r][c]) set.add(d);
    return [...set].sort((a, b) => a - b);
  }

  function conflicts() {
    const bad = Array.from({ length: 9 }, () => Array(9).fill(false));
    const mark = (coords) => {
      const groups = new Map();
      for (const [r, c] of coords) {
        const v = values[r][c];
        if (!v) continue;
        if (!groups.has(v)) groups.set(v, []);
        groups.get(v).push([r, c]);
      }
      for (const list of groups.values()) {
        if (list.length < 2) continue;
        for (const [r, c] of list) bad[r][c] = true;
      }
    };
    for (let r = 0; r < 9; r++) mark(Array.from({ length: 9 }, (_, c) => [r, c]));
    for (let c = 0; c < 9; c++) mark(Array.from({ length: 9 }, (_, r) => [r, c]));
    for (let br = 0; br < 3; br++) {
      for (let bc = 0; bc < 3; bc++) {
        const coords = [];
        for (let i = 0; i < 3; i++) {
          for (let j = 0; j < 3; j++) coords.push([br * 3 + i, bc * 3 + j]);
        }
        mark(coords);
      }
    }
    return bad;
  }

  function snapshot() {
    const copy = (grid) => grid.map((row) => row.map((list) => list.slice()));
    return JSON.stringify({
      values: values.map((row) => row.slice()),
      manual: copy(manual),
      excl: copy(excl),
      incl: copy(incl),
    });
  }

  function pushHistory() {
    history.push(snapshot());
    if (history.length > 100) history.shift();
  }

  function restore(raw) {
    const data = JSON.parse(raw);
    values = data.values;
    manual = data.manual;
    excl = data.excl;
    incl = data.incl;
  }

  function canEdit(r, c) {
    return !given[r][c];
  }

  function canNote(r, c) {
    return canEdit(r, c) && values[r][c] === 0;
  }

  function hasClearable(r, c) {
    if (!canEdit(r, c)) return false;
    return values[r][c] !== 0 || manual[r][c].length > 0 || excl[r][c].length > 0 || incl[r][c].length > 0;
  }

  function writeDigit(r, c, digit) {
    if (!canEdit(r, c)) return;
    pushHistory();
    if (values[r][c] === digit) {
      values[r][c] = 0;
    } else {
      values[r][c] = digit;
      manual[r][c] = [];
      excl[r][c] = [];
      incl[r][c] = [];
    }
    updateBoard();
  }

  function clearCell(r, c) {
    if (!hasClearable(r, c)) return;
    pushHistory();
    values[r][c] = 0;
    manual[r][c] = [];
    excl[r][c] = [];
    incl[r][c] = [];
    updateBoard();
  }

  function toggleCandidate(r, c, digit) {
    if (!canNote(r, c)) return false;
    pushHistory();
    if (mode === "manual") {
      const list = manual[r][c];
      const i = list.indexOf(digit);
      if (i >= 0) list.splice(i, 1);
      else list.push(digit);
      list.sort((a, b) => a - b);
    } else {
      const showing = visibleList(r, c).includes(digit);
      const exclSet = new Set(excl[r][c]);
      const inclSet = new Set(incl[r][c]);
      if (showing) {
        if (inclSet.has(digit)) inclSet.delete(digit);
        else exclSet.add(digit);
      } else if (exclSet.has(digit)) {
        exclSet.delete(digit);
      } else {
        inclSet.add(digit);
      }
      excl[r][c] = [...exclSet].sort((a, b) => a - b);
      incl[r][c] = [...inclSet].sort((a, b) => a - b);
    }
    updateBoard();
    return true;
  }

  function undo() {
    const prev = history.pop();
    if (!prev) return;
    restore(prev);
    updateBoard();
  }

  function select(r, c) {
    selected = { r, c };
    updateBoard();
  }

  function slotEl(r, c, digit) {
    return cells[r][c].querySelector(`.note[data-d="${digit}"]`);
  }

  function buildBoard() {
    for (let r = 0; r < 9; r++) {
      cells[r] = [];
      for (let c = 0; c < 9; c++) {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "cell";
        cell.dataset.r = String(r);
        cell.dataset.c = String(c);
        cell.classList.add(`r${r}`, `c${c}`);
        cell.setAttribute("role", "gridcell");
        const value = document.createElement("span");
        value.className = "value";
        const notes = document.createElement("span");
        notes.className = "notes";
        for (let d = 1; d <= 9; d++) {
          const note = document.createElement("span");
          note.className = "note";
          note.dataset.d = String(d);
          notes.appendChild(note);
        }
        const dot = document.createElement("i");
        dot.className = "dot";
        cell.append(value, notes, dot);
        cell.addEventListener("click", () => select(r, c));
        cell.addEventListener("contextmenu", (event) => {
          event.preventDefault();
          select(r, c);
          clearCell(r, c);
        });
        boardEl.appendChild(cell);
        cells[r][c] = cell;
      }
    }
  }

  function buildKeys() {
    for (let d = 1; d <= 9; d++) {
      const key = document.createElement("button");
      key.type = "button";
      key.className = "key";
      key.dataset.digit = String(d);
      key.setAttribute("aria-label", `Digit ${d}`);
      const bar = document.createElement("span");
      bar.className = "bar";
      const digit = document.createElement("span");
      digit.className = "digit";
      digit.textContent = String(d);
      const label = document.createElement("span");
      label.className = "label";
      key.append(bar, digit, label);
      keysEl.appendChild(key);
    }
  }

  function updateBoard() {
    const bad = conflicts();
    const focusValue = selected ? values[selected.r][selected.c] : 0;
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const cell = cells[r][c];
        const value = values[r][c];
        const isSelected = selected && selected.r === r && selected.c === c;
        const peer = selected && !isSelected && (selected.r === r || selected.c === c || sameBox(selected.r, selected.c, r, c));
        const same = focusValue !== 0 && value === focusValue && !isSelected;
        const cands = visibleList(r, c);
        const single = value === 0 && cands.length === 1;
        const cue = cueEnabled && cueShowing.has(`${r},${c}`) && single;
        const cls = ["cell", `r${r}`, `c${c}`];
        if (given[r][c]) cls.push("given");
        else if (value) cls.push("entry");
        if (value) cls.push("has-value");
        if (isSelected) cls.push("selected");
        else if (peer) cls.push("peer");
        if (same) cls.push("same");
        if (bad[r][c]) cls.push("conflict");
        if (single) cls.push("single");
        const name = cls.join(" ");
        if (cell.className !== name) cell.className = name;
        cell.dataset.value = String(value);
        cell.dataset.given = given[r][c] ? "true" : "false";
        cell.dataset.selected = isSelected ? "true" : "false";
        cell.dataset.peer = peer ? "true" : "false";
        cell.dataset.same = same ? "true" : "false";
        cell.dataset.conflict = bad[r][c] ? "true" : "false";
        cell.dataset.candidates = cands.join(",");
        cell.dataset.single = single ? "true" : "false";
        cell.dataset.cue = cue ? "true" : "false";
        cell.setAttribute("aria-selected", isSelected ? "true" : "false");
        cell.querySelector(".value").textContent = value ? String(value) : "";
        for (let d = 1; d <= 9; d++) {
          const slot = cell.querySelector(`.note[data-d="${d}"]`);
          const on = cands.includes(d);
          const arriving = pendingArrive && pendingArrive.r === r && pendingArrive.c === c && pendingArrive.d === d;
          slot.textContent = on ? String(d) : "";
          slot.classList.toggle("on", on);
          slot.classList.toggle("arriving", !!(arriving && on));
          slot.classList.toggle("cue", !!(cue && on && d === cands[0]));
          slot.classList.remove("preview", "preview-remove");
        }
      }
    }
    applyDragPreview();
    const active = selected ? values[selected.r][selected.c] : 0;
    for (const key of keysEl.children) {
      key.classList.toggle("on", Number(key.dataset.digit) === active && active !== 0);
    }
    undoBtn.disabled = history.length === 0;
    eraseBtn.disabled = !(selected && hasClearable(selected.r, selected.c));
    modeBtn.dataset.mode = mode;
    modeBtn.setAttribute("aria-pressed", mode === "auto" ? "true" : "false");
    modeLabel.textContent = mode === "auto" ? "Auto" : "Manual";
    modeBtn.setAttribute(
      "aria-label",
      mode === "auto" ? "Notes are automatic. Switch to manual notes." : "Notes are manual. Switch to automatic notes.",
    );
    syncCues();
  }

  function applyDragPreview() {
    if (!dragPreview) return;
    const { r, c, digit, removing } = dragPreview;
    const slot = slotEl(r, c, digit);
    if (!slot) return;
    if (removing) {
      slot.classList.add("preview-remove");
    } else {
      slot.textContent = String(digit);
      slot.classList.add("preview");
    }
  }

  function isSingle(r, c) {
    return cueEnabled && values[r][c] === 0 && visibleList(r, c).length === 1;
  }

  function clearCue(key) {
    if (cueCycles.has(key)) clearTimeout(cueCycles.get(key));
    if (cueHides.has(key)) clearTimeout(cueHides.get(key));
    cueCycles.delete(key);
    cueHides.delete(key);
    cueShowing.delete(key);
  }

  // Same cycle as PencilBox: wait the interval, flash the lone digit for 1.5s,
  // and schedule the next flash from the moment this one appears.
  function flashCue(r, c) {
    const key = `${r},${c}`;
    cueCycles.delete(key);
    if (!isSingle(r, c)) {
      clearCue(key);
      updateBoard();
      return;
    }
    cueShowing.add(key);
    if (cueHides.has(key)) clearTimeout(cueHides.get(key));
    cueHides.set(
      key,
      setTimeout(() => {
        cueHides.delete(key);
        cueShowing.delete(key);
        updateBoard();
      }, CUE_FLASH),
    );
    cueCycles.set(
      key,
      setTimeout(() => flashCue(r, c), CUE_INTERVAL),
    );
    updateBoard();
  }

  function syncCues() {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const key = `${r},${c}`;
        if (!isSingle(r, c)) {
          if (cueCycles.has(key) || cueHides.has(key) || cueShowing.has(key)) clearCue(key);
          continue;
        }
        if (cueCycles.has(key) || cueShowing.has(key)) continue;
        cueCycles.set(
          key,
          setTimeout(() => flashCue(r, c), CUE_INTERVAL),
        );
      }
    }
  }

  function clearCueState() {
    for (const key of new Set([...cueCycles.keys(), ...cueHides.keys(), ...cueShowing])) clearCue(key);
  }

  function setCueEnabled(on) {
    cueEnabled = on;
    document.documentElement.dataset.cueEnabled = on ? "true" : "false";
    if (!on) clearCueState();
    updateBoard();
  }

  function openSheet() {
    sheet.hidden = false;
    moreBtn.setAttribute("aria-expanded", "true");
  }

  function closeSheet() {
    sheet.hidden = true;
    moreBtn.setAttribute("aria-expanded", "false");
  }

  function showFinger(x, y) {
    finger.hidden = false;
    finger.style.left = `${x}px`;
    finger.style.top = `${y}px`;
  }

  function hideFinger() {
    finger.hidden = true;
  }

  function clearKeyMotion(key) {
    key.classList.remove("pressed", "dragging", "armed", "add", "remove");
    const label = key.querySelector(".label");
    label.textContent = "";
  }

  function makeGhost(text, x, y, size, removing) {
    const ghost = document.createElement("div");
    ghost.className = removing ? "ghost remove" : "ghost";
    ghost.textContent = text;
    ghost.style.left = `${x}px`;
    ghost.style.top = `${y}px`;
    ghost.style.fontSize = `${size}px`;
    ghost.style.transform = "translate(-50%, -50%)";
    document.body.appendChild(ghost);
    return ghost;
  }

  function startGesture(key, event) {
    visualGen += 1;
    document.querySelectorAll(".ghost").forEach((node) => node.remove());
    if (pendingArrive) {
      pendingArrive = null;
      updateBoard();
    }
    const digitEl = key.querySelector(".digit");
    const rect = digitEl.getBoundingClientRect();
    gesture = {
      id: event.pointerId,
      key,
      digit: Number(key.dataset.digit),
      startX: event.clientX,
      startY: event.clientY,
      startTime: performance.now(),
      originX: rect.left + rect.width / 2,
      originY: rect.top + rect.height / 2,
      digitSize: parseFloat(getComputedStyle(digitEl).fontSize) || 28,
      dragging: false,
      armed: false,
      removing: false,
      ox: 0,
      oy: 0,
      ghost: null,
      gen: visualGen,
    };
    key.classList.add("pressed");
    key.setPointerCapture?.(event.pointerId);
    showFinger(event.clientX, event.clientY);
  }

  function updateGesture(event) {
    if (!gesture || event.pointerId !== gesture.id) return;
    showFinger(event.clientX, event.clientY);
    const dx = event.clientX - gesture.startX;
    const up = gesture.startY - event.clientY;
    const dist = Math.hypot(dx, event.clientY - gesture.startY);
    gesture.dist = dist;
    const upward = up > TAP_MAX_DIST && up > Math.abs(dx) * 0.75;
    if (!gesture.dragging && !upward) return;
    if (!gesture.dragging) {
      gesture.dragging = true;
      gesture.removing = selected ? visibleList(selected.r, selected.c).includes(gesture.digit) && canNote(selected.r, selected.c) : false;
      gesture.ghost = makeGhost(String(gesture.digit), gesture.originX, gesture.originY, gesture.digitSize, gesture.removing);
      gesture.key.classList.add("dragging", gesture.removing ? "remove" : "add");
      gesture.key.querySelector(".label").textContent = gesture.removing ? "- candidate" : "+ candidate";
      if (selected && canNote(selected.r, selected.c)) {
        dragPreview = { r: selected.r, c: selected.c, digit: gesture.digit, removing: gesture.removing };
        applyDragPreview();
      }
    }
    gesture.ox = dx * 0.35;
    gesture.oy = -resist(Math.max(0, up));
    if (gesture.ghost) {
      gesture.ghost.style.transform = `translate(-50%, -50%) translate(${gesture.ox}px, ${gesture.oy}px)`;
    }
    const wasArmed = gesture.armed;
    if (!gesture.armed && up >= ARM_PX) gesture.armed = true;
    else if (gesture.armed && up < DISARM_PX) gesture.armed = false;
    gesture.key.classList.toggle("armed", gesture.armed);
    if (gesture.armed && !wasArmed) navigator.vibrate?.(8);
  }

  function finishGesture(event) {
    if (!gesture || event.pointerId !== gesture.id) return;
    const current = gesture;
    gesture = null;
    dragPreview = null;
    hideFinger();
    const elapsed = performance.now() - current.startTime;
    const dist = current.dist || 0;
    if (current.dragging) {
      if (current.armed) commitSwipe(current);
      else glideBack(current);
      return;
    }
    clearKeyMotion(current.key);
    if (dist < TAP_MAX_DIST && elapsed < TAP_MAX_MS && selected) {
      writeDigit(selected.r, selected.c, current.digit);
    }
  }

  function cancelGesture(event) {
    if (!gesture || (event && event.pointerId !== gesture.id)) return;
    const current = gesture;
    gesture = null;
    dragPreview = null;
    hideFinger();
    if (current.dragging) glideBack(current);
    else clearKeyMotion(current.key);
    updateBoard();
  }

  function glideBack(current) {
    const ghost = current.ghost;
    const key = current.key;
    updateBoard();
    if (!ghost || prefersReduced()) {
      ghost?.remove();
      if (current.gen === visualGen) clearKeyMotion(key);
      return;
    }
    // Straight line back to the key. ease-out stays inside the segment, so it does not overshoot.
    const anim = ghost.animate(
      [
        { transform: `translate(-50%, -50%) translate(${current.ox}px, ${current.oy}px)` },
        { transform: "translate(-50%, -50%) translate(0px, 0px)" },
      ],
      { duration: 180, easing: "ease-out", fill: "forwards" },
    );
    anim.onfinish = () => {
      ghost.remove();
      if (current.gen === visualGen) clearKeyMotion(key);
      updateBoard();
    };
  }

  function commitSwipe(current) {
    const { key, digit, gen } = current;
    if (!selected || !canNote(selected.r, selected.c)) {
      glideBack(current);
      return;
    }
    const removing = visibleList(selected.r, selected.c).includes(digit);
    if (prefersReduced()) {
      current.ghost?.remove();
      clearKeyMotion(key);
      crossfadeToggle(selected.r, selected.c, digit, removing);
      return;
    }
    if (removing) {
      const slot = slotEl(selected.r, selected.c, digit);
      const from = slot.getBoundingClientRect();
      current.ghost?.remove();
      toggleCandidate(selected.r, selected.c, digit);
      flyToKey(from, key, digit, gen);
      return;
    }
    pendingArrive = { r: selected.r, c: selected.c, d: digit };
    const moved = toggleCandidate(selected.r, selected.c, digit);
    clearKeyMotion(key);
    if (!moved) {
      pendingArrive = null;
      current.ghost?.remove();
      return;
    }
    const slot = slotEl(selected.r, selected.c, digit);
    flyToSlot(current, slot);
  }

  function crossfadeToggle(r, c, digit, removing) {
    const slot = slotEl(r, c, digit);
    if (removing && slot) {
      const rect = slot.getBoundingClientRect();
      const ghost = makeGhost(String(digit), rect.left + rect.width / 2, rect.top + rect.height / 2, 10, true);
      const fade = ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: "linear", fill: "forwards" });
      fade.onfinish = () => ghost.remove();
    }
    toggleCandidate(r, c, digit);
    if (!removing) {
      const next = slotEl(r, c, digit);
      next?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: "linear" });
    }
  }

  function flyToSlot(current, slot) {
    const ghost = current.ghost;
    if (!ghost || !slot) {
      pendingArrive = null;
      updateBoard();
      return;
    }
    const visual = ghost.getBoundingClientRect();
    const startX = visual.left + visual.width / 2;
    const startY = visual.top + visual.height / 2;
    const end = slot.getBoundingClientRect();
    const endX = end.left + end.width / 2;
    const endY = end.top + end.height / 2;
    ghost.style.left = `${startX}px`;
    ghost.style.top = `${startY}px`;
    const dx = endX - startX;
    const dy = endY - startY;
    const endScale = 0.36;
    const anim = ghost.animate(
      [
        { transform: "translate(-50%, -50%) translate(0px, 0px) scale(1)" },
        { transform: `translate(-50%, -50%) translate(${dx}px, ${dy}px) scale(${endScale})` },
      ],
      { duration: FLY_MS, easing: "ease-out", fill: "forwards" },
    );
    anim.onfinish = () => {
      ghost.remove();
      if (current.gen !== visualGen) return;
      pendingArrive = null;
      if (!visibleList(slot.closest(".cell") ? Number(slot.closest(".cell").dataset.r) : -1, Number(slot.closest(".cell")?.dataset.c)).includes(Number(slot.dataset.d))) {
        updateBoard();
        return;
      }
      slot.classList.remove("arriving");
      slot.classList.add("on", "flash");
      slot.textContent = slot.dataset.d;
      slot.addEventListener("animationend", () => slot.classList.remove("flash"), { once: true });
    };
  }

  function flyToKey(fromRect, key, digit, gen) {
    const digitEl = key.querySelector(".digit");
    const target = digitEl.getBoundingClientRect();
    const startX = fromRect.left + fromRect.width / 2;
    const startY = fromRect.top + fromRect.height / 2;
    const endX = target.left + target.width / 2;
    const endY = target.top + target.height / 2;
    const ghost = makeGhost(String(digit), startX, startY, 10, true);
    const dx = endX - startX;
    const dy = endY - startY;
    const anim = ghost.animate(
      [
        { transform: "translate(-50%, -50%) translate(0px, 0px) scale(1)" },
        { transform: `translate(-50%, -50%) translate(${dx}px, ${dy}px) scale(2.8)` },
      ],
      { duration: FLY_MS, easing: "ease-out", fill: "forwards" },
    );
    anim.onfinish = () => {
      ghost.remove();
      if (gen === visualGen) {
        clearKeyMotion(key);
        key.classList.add("flash");
        key.addEventListener("animationend", () => key.classList.remove("flash"), { once: true });
      }
    };
  }

  function moveSelection(dr, dc) {
    if (!selected) {
      select(0, 0);
      return;
    }
    const r = Math.min(8, Math.max(0, selected.r + dr));
    const c = Math.min(8, Math.max(0, selected.c + dc));
    select(r, c);
  }

  function onKeyDown(event) {
    if (event.target instanceof HTMLInputElement) return;
    if (event.key === "Escape" && !sheet.hidden) {
      closeSheet();
      return;
    }
    if (!sheet.hidden) return;
    const meta = event.metaKey || event.ctrlKey;
    if (meta && event.key.toLowerCase() === "z" && !event.shiftKey) {
      event.preventDefault();
      undo();
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveSelection(0, -1);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      moveSelection(0, 1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveSelection(-1, 0);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveSelection(1, 0);
      return;
    }
    if (!selected) return;
    const code = event.code || "";
    let digit = null;
    if (code.startsWith("Digit")) digit = Number(code.slice(5));
    else if (code.startsWith("Numpad")) digit = Number(code.slice(6));
    if (digit === null || Number.isNaN(digit)) {
      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        clearCell(selected.r, selected.c);
      }
      return;
    }
    event.preventDefault();
    if (digit === 0) {
      clearCell(selected.r, selected.c);
      return;
    }
    if (event.shiftKey) toggleCandidate(selected.r, selected.c, digit);
    else writeDigit(selected.r, selected.c, digit);
  }

  window.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const key = event.target.closest?.(".key");
    if (!key || gesture) return;
    event.preventDefault();
    startGesture(key, event);
  });
  window.addEventListener("pointermove", updateGesture);
  window.addEventListener("pointerup", finishGesture);
  window.addEventListener("pointercancel", cancelGesture);
  window.addEventListener(
    "pointerdown",
    (event) => {
      if (event.target.closest?.(".key")) return;
      showFinger(event.clientX, event.clientY);
    },
    true,
  );
  window.addEventListener(
    "pointermove",
    (event) => {
      if (!finger.hidden && !gesture) showFinger(event.clientX, event.clientY);
    },
    true,
  );
  window.addEventListener(
    "pointerup",
    () => {
      if (!gesture) hideFinger();
    },
    true,
  );
  window.addEventListener("keydown", onKeyDown);

  undoBtn.addEventListener("click", undo);
  eraseBtn.addEventListener("click", () => {
    if (selected) clearCell(selected.r, selected.c);
  });
  modeBtn.addEventListener("click", () => {
    mode = mode === "auto" ? "manual" : "auto";
    updateBoard();
  });
  moreBtn.addEventListener("click", openSheet);
  sheetClose.addEventListener("click", closeSheet);
  sheet.addEventListener("click", (event) => {
    if (event.target === sheet) closeSheet();
  });
  cueToggle.addEventListener("change", () => setCueEnabled(cueToggle.checked));

  buildBoard();
  buildKeys();
  updateBoard();
})();
