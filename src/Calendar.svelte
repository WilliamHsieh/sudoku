<script>
  import { onMount } from 'svelte';
  import { puzzle, prefilled, cellUpdate, solvedPuzzles, currentPuzzle } from './store.js';
  import { puzzleData } from './puzzles.js';
  import { resetTimer, formatTime } from './store.js';

  let currentDate = new Date();
  let currentMonth = currentDate.getMonth();
  let currentYear = currentDate.getFullYear();
  let selectedDate = null;
  let showModal = false;
  let modalDate = null;

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const difficulties = ['easy', 'medium', 'hard'];
  const difficultyColors = {
    easy: '#4ade80',
    medium: '#fbbf24', 
    hard: '#f87171'
  };

  function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
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
        puzzles: puzzleData[dateStr] || {}
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

  function loadPuzzle(puzzleString) {
    // Parse puzzle string into 2D array format matching store.js
    const newPuzzle = [];
    for (let i = 0; i < 9; i++) {
      const row = [];
      for (let j = 0; j < 9; j++) {
        row.push(parseInt(puzzleString[i * 9 + j], 10));
      }
      newPuzzle.push(row);
    }
    
    // Update the puzzle store
    puzzle.set(newPuzzle);
    
    // Update prefilled status
    const newPrefilled = [];
    for (let i = 0; i < 9; i++) {
      const row = [];
      for (let j = 0; j < 9; j++) {
        row.push(newPuzzle[i][j] !== 0);
      }
      newPrefilled.push(row);
    }
    prefilled.set(newPrefilled);
    
    // Trigger cell update
    cellUpdate.set(true);
  }

  function selectPuzzle(dateStr, difficulty) {
    console.log('Selecting puzzle:', dateStr, difficulty);
    const puzzleString = puzzleData[dateStr]?.[difficulty];
    
    if (puzzleString) {
      console.log('Loading puzzle:', puzzleString);
      
      // Set current puzzle info
      currentPuzzle.set({ dateStr, difficulty });
      
      // Reset timer for new puzzle
      resetTimer();
      
      // Load puzzle using the store system
      loadPuzzle(puzzleString);
      
      // Close modal and emit event
      closeModal();
      window.dispatchEvent(new CustomEvent('loadPuzzle', { 
        detail: { dateStr, difficulty, puzzleString } 
      }));
    } else {
      console.log('No puzzle found for', dateStr, difficulty);
    }
  }

  function selectDate(day) {
    if (day && day.isPast) {
      selectedDate = day.date;
      const hasPuzzles = day.puzzles && Object.keys(day.puzzles).length > 0;
      
      if (hasPuzzles) {
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
  $: modalPuzzles = modalDate ? puzzleData[modalDate] || {} : {};
  $: totalPuzzles = Object.values(puzzleData).reduce((sum, puzzles) => sum + Object.keys(puzzles).length, 0);
</script>

<div class="calendar-container">
  <div class="calendar-header">
    <button class="nav-button" on:click={previousMonth}>‹</button>
    <div class="header-center">
      <h2>{monthNames[currentMonth]} {currentYear}</h2>
      <button class="today-button" on:click={goToToday}>Today</button>
    </div>
    <button class="nav-button" on:click={nextMonth}>›</button>
  </div>

  <div class="puzzle-stats">
    <p>{totalPuzzles} puzzles across {Object.keys(puzzleData).length} dates</p>
  </div>

  <div class="legend">
    <div class="legend-item">
      <span class="legend-dot" style="background-color: {difficultyColors.easy}"></span>
      Easy
    </div>
    <div class="legend-item">
      <span class="legend-dot" style="background-color: {difficultyColors.medium}"></span>
      Medium
    </div>
    <div class="legend-item">
      <span class="legend-dot" style="background-color: {difficultyColors.hard}"></span>
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

    {#each calendarDays as day}
      <div 
        class="calendar-day"
        class:empty={!day}
        class:today={day?.isToday}
        class:past={day?.isPast && !day?.isToday}
        class:future={day && !day?.isPast}
        class:selected={selectedDate === day?.date}
        class:has-puzzles={day && day.puzzles && Object.keys(day.puzzles).length > 0}
        on:click={() => selectDate(day)}
        role="button"
        tabindex="0"
      >
        {#if day}
          <div class="day-number">{day.day}</div>
          <div class="puzzle-indicators">
            {#each difficulties as difficulty}
              {#if day.puzzles[difficulty]}
                <span 
                  class="puzzle-dot" 
                  class:solved={$solvedPuzzles[day.date]?.[difficulty]?.completed}
                  style="background-color: {$solvedPuzzles[day.date]?.[difficulty]?.completed ? difficultyColors[difficulty] : '#e5e7eb'}"
                  title="{difficulty} puzzle {$solvedPuzzles[day.date]?.[difficulty]?.completed ? 'completed' : 'available'}"
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
  <div class="modal-backdrop" on:click={handleModalBackdropClick}>
    <div class="modal">
      <div class="modal-header">
        <h3>Select Difficulty</h3>
        <p>Choose a puzzle for {modalDate}</p>
        <button class="modal-close" on:click={closeModal}>&times;</button>
      </div>
      
      <div class="modal-content">
        {#each difficulties as difficulty}
          {#if modalPuzzles[difficulty]}
            <button 
              class="difficulty-button {difficulty}"
              class:completed={$solvedPuzzles[modalDate]?.[difficulty]?.completed}
              on:click={() => selectPuzzle(modalDate, difficulty)}
            >
              <div class="difficulty-icon" style="background-color: {difficultyColors[difficulty]}">
                {#if $solvedPuzzles[modalDate]?.[difficulty]?.completed}
                  <span class="completion-check">✓</span>
                {/if}
              </div>
              <div class="difficulty-info">
                <span class="difficulty-name">{difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}</span>
                <span class="difficulty-desc">
                  {#if $solvedPuzzles[modalDate]?.[difficulty]?.completed}
                    Solved in {formatTime($solvedPuzzles[modalDate][difficulty].time)}
                  {:else}
                    {difficulty === 'easy' ? 'Perfect for beginners' : 
                     difficulty === 'medium' ? 'Moderately challenging' : 
                     'Expert level puzzle'}
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
    padding: 20px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
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
    font-size: 1.5rem;
    font-weight: 600;
  }

  .nav-button {
    background: white;
    border: 2px solid #e5e7eb;
    border-radius: 8px;
    padding: 12px 16px;
    font-size: 1.4rem;
    cursor: pointer;
    transition: all 0.2s;
    color: #374151;
    font-weight: 600;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    min-width: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .nav-button:hover {
    background: #3b82f6;
    border-color: #3b82f6;
    color: white;
    transform: translateY(-1px);
    box-shadow: 0 4px 8px rgba(59, 130, 246, 0.3);
  }

  .nav-button:active {
    transform: translateY(0);
  }

  .today-button {
    background: white;
    border: 2px solid #e5e7eb;
    border-radius: 6px;
    padding: 6px 12px;
    font-size: 0.85rem;
    cursor: pointer;
    transition: all 0.2s;
    color: #374151;
    font-weight: 500;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .today-button:hover {
    background: #3b82f6;
    border-color: #3b82f6;
    color: white;
    transform: translateY(-1px);
    box-shadow: 0 2px 6px rgba(59, 130, 246, 0.3);
  }

  .today-button:active {
    transform: translateY(0);
  }

  .puzzle-stats {
    text-align: center;
    margin-bottom: 20px;
    color: #6b7280;
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

  .legend-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
  }

  .calendar-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 2px;
    background: #e5e7eb;
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid #d1d5db;
  }

  .day-header {
    background: #374151;
    color: white;
    padding: 12px;
    text-align: center;
    font-weight: 600;
    font-size: 0.9rem;
  }

  .calendar-day {
    background: white;
    min-height: 80px;
    padding: 8px;
    position: relative;
    transition: all 0.2s ease;
    border: 2px solid transparent;
    cursor: default;
    display: flex;
    flex-direction: column;
  }

  .calendar-day.today {
    background: #dbeafe;
    border-color: #3b82f6;
    cursor: pointer;
  }

  .calendar-day.today:hover {
    background: #bfdbfe;
    border-color: #2563eb;
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .calendar-day.selected {
    background: #3b82f6 !important;
    color: white;
    border-color: #1d4ed8;
  }

  .calendar-day.selected .day-number {
    color: white;
  }

  .calendar-day.future,
  .calendar-day.empty {
    background: #f9fafb !important;
    color: #9ca3af;
    cursor: not-allowed;
  }

  .calendar-day.future:hover,
  .calendar-day.empty:hover {
    background: #f9fafb;
  }

  .calendar-day.past {
    background: white;
    cursor: pointer;
    border: 1px solid #e5e7eb;
  }

  .calendar-day.past:hover {
    background: #f3f4f6;
    border-color: #d1d5db;
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .calendar-day.has-puzzles.past:hover {
    border-color: #10b981;
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
    border: none;
    cursor: pointer;
    transition: all 0.2s;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .puzzle-dot:hover {
    transform: scale(1.2);
  }

  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  }

  .modal {
    background: white;
    padding: 24px;
    border-radius: 12px;
    max-width: 400px;
    width: 90%;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
  }

  .modal-header {
    position: relative;
    margin-bottom: 24px;
    text-align: center;
  }

  .modal-header h3 {
    margin: 0 0 8px 0;
    font-size: 1.5rem;
    font-weight: 600;
    color: #111827;
  }

  .modal-header p {
    margin: 0;
    color: #6b7280;
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
    color: #6b7280;
    padding: 4px;
    border-radius: 4px;
  }

  .modal-close:hover {
    background: #f3f4f6;
    color: #374151;
  }

  .modal-content {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .difficulty-button {
    background: white;
    border: 2px solid #e5e7eb;
    border-radius: 8px;
    padding: 16px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 16px;
    transition: all 0.2s;
    text-align: left;
    position: relative;
  }

  .difficulty-button:hover {
    border-color: #d1d5db;
    background: #f9fafb;
    transform: translateY(-1px);
  }

  .difficulty-button.completed {
    border-color: #4ade80;
    background: #f0fdf4;
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
    color: #111827;
    margin-bottom: 4px;
  }

  .difficulty-desc {
    display: block;
    font-size: 0.85rem;
    color: #6b7280;
  }

  .difficulty-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .completed-badge {
    background-color: #4ade80;
    color: white;
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
    color: #4ade80;
  }
</style> 