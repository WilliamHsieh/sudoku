<script>
  import { get } from "svelte/store";
  import { solvedPuzzles } from "./store.js";
  import { puzzleData } from "./puzzles.js";
  import { formatTime } from "./store.js";
  import { game } from "./game/game.svelte.js";
  import { firstUnsolvedPuzzle } from "./game/daily.js";

  let currentDate = new Date();
  let currentMonth = currentDate.getMonth();
  let currentYear = currentDate.getFullYear();
  let selectedDate = null;
  let showModal = false;
  let modalDate = null;

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const difficulties = ["easy", "medium", "hard"];
  const totalPuzzles = Object.values(puzzleData).reduce(
    (sum, puzzles) => sum + Object.keys(puzzles).length,
    0
  );

  function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function getDaysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
  }

  function getFirstDayOfMonth(year, month) {
    return new Date(year, month, 1).getDay();
  }

  function generateCalendarDays(month, year) {
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const days = [];

    // Add empty cells for days before the first day of the month
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }

    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dateStr = formatDate(date);
      const today = new Date();
      const todayStr = formatDate(today);
      const isToday = dateStr === todayStr;
      const isPast = date < today || isToday; // Include today as clickable

      days.push({
        day,
        date: dateStr,
        isToday,
        isPast,
        puzzles: puzzleData[dateStr] || {},
      });
    }

    return days;
  }

  function previousMonth() {
    if (currentMonth === 0) {
      currentMonth = 11;
      currentYear--;
    } else {
      currentMonth--;
    }
    selectedDate = null; // Clear selection when changing months
    showModal = false; // Ensure modal is closed
    modalDate = null; // Clear modal date
  }

  function nextMonth() {
    if (currentMonth === 11) {
      currentMonth = 0;
      currentYear++;
    } else {
      currentMonth++;
    }
    selectedDate = null; // Clear selection when changing months
    showModal = false; // Ensure modal is closed
    modalDate = null; // Clear modal date
  }

  function goToToday() {
    const today = new Date();
    currentMonth = today.getMonth();
    currentYear = today.getFullYear();
    selectedDate = null; // Clear selection
    showModal = false; // Ensure modal is closed
    modalDate = null; // Clear modal date
  }

  function selectPuzzle(dateStr, difficulty) {
    console.log("Selecting puzzle:", dateStr, difficulty);
    const puzzleString = puzzleData[dateStr]?.[difficulty];

    if (puzzleString) {
      console.log("Loading puzzle:", puzzleString);
      game.load(puzzleString, { dateStr, difficulty });
      closeModal();
      window.dispatchEvent(
        new CustomEvent("loadPuzzle", {
          detail: { dateStr, difficulty, puzzleString },
        })
      );
    } else {
      console.log("No puzzle found for", dateStr, difficulty);
    }
  }

  function selectDate(day) {
    if (day && day.isPast) {
      selectedDate = day.date;
      const hasPuzzles = day.puzzles && Object.keys(day.puzzles).length > 0;

      if (hasPuzzles) {
        // Mobile journal: open the first unsolved of that day, as today.
        // Desktop keeps the difficulty modal.
        if (window.matchMedia("(max-width: 599px)").matches) {
          const pick = firstUnsolvedPuzzle(puzzleData, get(solvedPuzzles), day.date);
          if (pick) selectPuzzle(pick.dateStr, pick.difficulty);
          return;
        }
        modalDate = day.date;
        showModal = true;
      } else {
        // Just select the date visually if no puzzles
        showModal = false;
        modalDate = null;
      }
    }
  }

  function closeModal() {
    showModal = false;
    modalDate = null;
  }

  function handleModalBackdropClick(event) {
    if (event.target === event.currentTarget) {
      closeModal();
    }
  }

  $: calendarDays = generateCalendarDays(currentMonth, currentYear);
  $: console.log("Calendar days:", calendarDays.slice(0, 7)); // Debug first week
  $: modalPuzzles = modalDate ? puzzleData[modalDate] || {} : {};
</script>

<div class="calendar-container">
  <div class="calendar-header">
    <button class="nav-button" aria-label="Previous month" on:click={previousMonth}>
      <svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="m15 18-6-6 6-6"></path>
      </svg>
    </button>
    <div class="header-center">
      <h2>{monthNames[currentMonth]} {currentYear}</h2>
      <button class="today-button" on:click={goToToday}>Today</button>
    </div>
    <button class="nav-button" aria-label="Next month" on:click={nextMonth}>
      <svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="m9 18 6-6-6-6"></path>
      </svg>
    </button>
  </div>

  <div class="puzzle-stats">
    <p>{totalPuzzles} puzzles across {Object.keys(puzzleData).length} dates</p>
  </div>

  <div class="legend">
    <div class="legend-item">
      <span class="legend-dot easy"></span>
      Easy
    </div>
    <div class="legend-item">
      <span class="legend-dot medium"></span>
      Medium
    </div>
    <div class="legend-item">
      <span class="legend-dot hard"></span>
      Hard
    </div>
  </div>

  <div class="calendar-grid">
    <div class="day-header">Sun</div>
    <div class="day-header">Mon</div>
    <div class="day-header">Tue</div>
    <div class="day-header">Wed</div>
    <div class="day-header">Thu</div>
    <div class="day-header">Fri</div>
    <div class="day-header">Sat</div>

    {#each calendarDays as day, i (day?.date ?? `pad-${i}`)}
      <div
        class="calendar-day"
        class:empty={!day}
        class:today={day?.isToday}
        class:past={day?.isPast && !day?.isToday}
        class:future={day && !day?.isPast}
        class:selected={selectedDate === day?.date}
        class:has-puzzles={day && day.puzzles && Object.keys(day.puzzles).length > 0}
        on:click={() => selectDate(day)}
        on:keydown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            selectDate(day);
          }
        }}
        role="button"
        tabindex="0"
      >
        {#if day}
          <div class="day-number">{day.day}</div>
          <div class="puzzle-indicators">
            {#each difficulties as difficulty (difficulty)}
              {#if day.puzzles[difficulty]}
                <span
                  class="puzzle-dot {difficulty}"
                  class:solved={$solvedPuzzles[day.date]?.[difficulty]?.completed}
                  title="{difficulty} puzzle {$solvedPuzzles[day.date]?.[difficulty]?.completed
                    ? 'completed'
                    : 'available'}"
                >
                </span>
              {/if}
            {/each}
          </div>
        {/if}
      </div>
    {/each}
  </div>
</div>

<!-- Modal for difficulty selection -->
{#if showModal}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="modal-backdrop" on:click={handleModalBackdropClick}>
    <div class="modal">
      <div class="modal-header">
        <h3>Select Difficulty</h3>
        <p>Choose a puzzle for {modalDate}</p>
        <button class="modal-close" on:click={closeModal}>&times;</button>
      </div>

      <div class="modal-content">
        {#each difficulties as difficulty (difficulty)}
          {#if modalPuzzles[difficulty]}
            <button
              class="difficulty-button {difficulty}"
              class:completed={$solvedPuzzles[modalDate]?.[difficulty]?.completed}
              on:click={() => selectPuzzle(modalDate, difficulty)}
            >
              <div class="difficulty-icon {difficulty}"></div>
              <div class="difficulty-info">
                <span class="difficulty-name"
                  >{difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}</span
                >
                <span class="difficulty-desc">
                  {#if $solvedPuzzles[modalDate]?.[difficulty]?.completed}
                    Solved in {formatTime($solvedPuzzles[modalDate][difficulty].time)}
                  {:else}
                    {difficulty === "easy"
                      ? "Perfect for beginners"
                      : difficulty === "medium"
                        ? "Moderately challenging"
                        : "Expert level puzzle"}
                  {/if}
                </span>
              </div>
              {#if $solvedPuzzles[modalDate]?.[difficulty]?.completed}
                <span class="completed-badge">Completed</span>
              {/if}
            </button>
          {/if}
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .calendar-container {
    max-width: 800px;
    margin: 0 auto;
    padding: 12px 4px 20px;
    font-family: var(--ui-font);
    color: var(--ui-ink);
  }

  .calendar-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }

  .header-center {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  .calendar-header h2 {
    margin: 0;
    font-size: 1.35rem;
    font-weight: 600;
    color: var(--ui-ink);
  }

  .nav-button,
  .today-button {
    box-sizing: border-box;
    height: 32px;
    background: var(--key-bg);
    border: 1px solid var(--key-line);
    border-radius: 8px;
    color: var(--ui-ink);
    cursor: pointer;
    font-family: var(--ui-font);
    box-shadow: var(--key-shadow);
  }

  .nav-button {
    width: 32px;
    min-width: 32px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .nav-icon {
    width: 15px;
    height: 15px;
    flex: none;
    stroke: currentColor;
    fill: none;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .today-button {
    padding: 0 12px;
    font-size: 0.85rem;
    font-weight: 500;
  }

  .nav-button:hover,
  .today-button:hover {
    background: var(--key-pressed);
  }

  .puzzle-stats {
    text-align: center;
    margin-bottom: 16px;
    color: var(--ui-soft);
    font-size: 0.9rem;
  }

  .legend {
    display: flex;
    gap: 20px;
    margin-bottom: 20px;
    justify-content: center;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.9rem;
  }

  .legend-dot,
  .puzzle-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
  }

  .legend-dot.easy,
  .difficulty-icon.easy,
  .puzzle-dot.easy.solved {
    background: var(--diff-easy);
  }
  .legend-dot.medium,
  .difficulty-icon.medium,
  .puzzle-dot.medium.solved {
    background: var(--diff-medium);
  }
  .legend-dot.hard,
  .difficulty-icon.hard,
  .puzzle-dot.hard.solved {
    background: var(--diff-hard);
  }

  .calendar-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 1px;
    background: var(--line-thin);
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid var(--line-thin);
  }

  .day-header {
    background: var(--given-bg);
    color: var(--ui-ink);
    padding: 12px;
    text-align: center;
    font-weight: 600;
    font-size: 0.85rem;
  }

  .calendar-day {
    background: var(--board-bg);
    min-height: 80px;
    padding: 8px;
    position: relative;
    cursor: default;
    display: flex;
    flex-direction: column;
  }

  .calendar-day.today {
    background: var(--sel-bg);
    box-shadow: inset 0 0 0 var(--sel-ring-w) var(--sel-ring);
    cursor: pointer;
  }

  .calendar-day.selected {
    background: var(--sel-bg);
    box-shadow: inset 0 0 0 var(--sel-ring-w) var(--sel-ring);
    color: var(--sel-ink);
  }

  .calendar-day.selected .day-number {
    color: var(--sel-ink);
  }

  .calendar-day.future {
    background: var(--page-bg);
    color: var(--ui-soft);
    cursor: not-allowed;
  }

  .calendar-day.past {
    background: var(--board-bg);
    cursor: pointer;
  }

  .calendar-day.past:hover {
    background: var(--given-bg);
  }

  .calendar-day.empty {
    background: var(--page-bg);
  }

  .day-number {
    font-weight: 600;
    font-size: 1.1rem;
    margin-bottom: 6px;
    line-height: 1;
  }

  .puzzle-indicators {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    justify-content: center;
    align-items: flex-end;
    margin-top: 12px;
  }

  .puzzle-dot {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--dot-idle);
    flex-shrink: 0;
  }

  .puzzle-dot:hover {
    transform: scale(1.15);
  }

  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: var(--overlay);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  }

  .modal {
    background: var(--board-bg);
    padding: 24px;
    border-radius: 12px;
    max-width: 400px;
    width: 90%;
    box-shadow: var(--shadow-dialog);
    color: var(--ui-ink);
  }

  .modal-header {
    position: relative;
    margin-bottom: 24px;
    text-align: center;
  }

  .modal-header h3 {
    margin: 0 0 8px;
    font-size: 1.35rem;
    font-weight: 600;
    color: var(--ui-ink);
  }

  .modal-header p {
    margin: 0;
    color: var(--ui-soft);
    font-size: 0.9rem;
  }

  .modal-close {
    position: absolute;
    top: -4px;
    right: -4px;
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: var(--ui-soft);
    padding: 4px;
    border-radius: 4px;
  }

  .modal-close:hover {
    background: var(--given-bg);
    color: var(--ui-ink);
  }

  .modal-content {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .difficulty-button {
    background: var(--board-bg);
    border: 1px solid var(--key-line);
    border-radius: 8px;
    padding: 16px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 16px;
    text-align: left;
    position: relative;
    font-family: var(--ui-font);
  }

  .difficulty-button:hover {
    background: var(--given-bg);
  }

  .difficulty-button.completed {
    border-color: var(--cue-line);
    background: var(--cue-fill);
  }

  .difficulty-icon {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    flex-shrink: 0;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .difficulty-info {
    flex: 1;
  }

  .difficulty-name {
    display: block;
    font-weight: 600;
    font-size: 1.1rem;
    color: var(--ui-ink);
    margin-bottom: 4px;
  }

  .difficulty-desc {
    display: block;
    font-size: 0.85rem;
    color: var(--ui-soft);
  }

  .difficulty-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .completed-badge {
    background: var(--cue);
    color: var(--on-accent);
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 0.8rem;
    line-height: 1;
    position: absolute;
    right: 16px;
    top: 50%;
    transform: translateY(-50%);
  }

  .completion-check {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 1.2rem;
    color: var(--cue);
  }
</style>
