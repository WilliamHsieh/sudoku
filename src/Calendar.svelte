<script>
  import { onMount } from 'svelte';
  import { puzzle, prefilled, cellUpdate } from './store.js';

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

  // Embedded puzzle data for GitHub Pages
  const puzzleData = {
    '2025-01-12': {
      easy: '159230000800014700400500310060102578002083000980040006005000823700306005093000067',
      medium: '159230000800014700400500310060102578002083000980040006005000823700306005093000067',
      hard: '159230000800014700400500310060102578002083000980040006005000823700306005093000067'
    },
    '2025-01-13': {
      easy: '159230000800014700400500310060102578002083000980040006005000823700306005093000067',
      medium: '159230000800014700400500310060102578002083000980040006005000823700306005093000067',
      hard: '159230000800014700400500310060102578002083000980040006005000823700306005093000067'
    },
    '2025-01-14': {
      easy: '159230000800014700400500310060102578002083000980040006005000823700306005093000067',
      medium: '159230000800014700400500310060102578002083000980040006005000823700306005093000067',
      hard: '159230000800014700400500310060102578002083000980040006005000823700306005093000067'
    },
    '2025-01-15': {
      easy: '159230000800014700400500310060102578002083000980040006005000823700306005093000067',
      medium: '159230000800014700400500310060102578002083000980040006005000823700306005093000067',
      hard: '159230000800014700400500310060102578002083000980040006005000823700306005093000067'
    },
    '2025-01-16': {
      easy: '159230000800014700400500310060102578002083000980040006005000823700306005093000067',
      medium: '159230000800014700400500310060102578002083000980040006005000823700306005093000067',
      hard: '159230000800014700400500310060102578002083000980040006005000823700306005093000067'
    },
    '2025-06-01': {
      easy: '159230000800014700400500310060102578002083000980040006005000823700306005093000067',
      medium: '159230000800014700400500310060102578002083000980040006005000823700306005093000067',
      hard: '159230000800014700400500310060102578002083000980040006005000823700306005093000067'
    }
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

  function generateCalendarDays() {
    const daysInMonth = getDaysInMonth(currentYear, currentMonth);
    const firstDay = getFirstDayOfMonth(currentYear, currentMonth);
    const days = [];

    // Add empty cells for days before the first day of the month
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }

    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(currentYear, currentMonth, day);
      const dateStr = formatDate(date);
      const today = new Date();
      const isToday = dateStr === formatDate(today);
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
    closeModal();
  }

  function nextMonth() {
    if (currentMonth === 11) {
      currentMonth = 0;
      currentYear++;
    } else {
      currentMonth++;
    }
    selectedDate = null; // Clear selection when changing months
    closeModal();
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
    if (puzzleData[dateStr] && puzzleData[dateStr][difficulty]) {
      const puzzleString = puzzleData[dateStr][difficulty];
      console.log('Loading puzzle:', puzzleString);
      
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
    console.log('Selecting date:', day);
    if (day && day.isPast) {
      selectedDate = day.date;
      const hasPuzzles = day.puzzles && Object.keys(day.puzzles).length > 0;
      
      if (hasPuzzles) {
        modalDate = day.date;
        showModal = true;
      } else {
        // Just select the date visually if no puzzles
        console.log('No puzzles available for this date');
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

  $: calendarDays = generateCalendarDays();
  $: modalPuzzles = modalDate ? puzzleData[modalDate] || {} : {};
</script>

<div class="calendar-container">
  <div class="calendar-header">
    <button class="nav-button" on:click={previousMonth}>‹</button>
    <h2>{monthNames[currentMonth]} {currentYear}</h2>
    <button class="nav-button" on:click={nextMonth}>›</button>
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
                  style="background-color: {difficultyColors[difficulty]}"
                  title="{difficulty} puzzle available"
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
              on:click={() => selectPuzzle(modalDate, difficulty)}
            >
              <div class="difficulty-icon" style="background-color: {difficultyColors[difficulty]}"></div>
              <div class="difficulty-info">
                <span class="difficulty-name">{difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}</span>
                <span class="difficulty-desc">
                  {difficulty === 'easy' ? 'Perfect for beginners' : 
                   difficulty === 'medium' ? 'Moderately challenging' : 
                   'Expert level puzzle'}
                </span>
              </div>
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

  .calendar-header h2 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
  }

  .nav-button {
    background: #f3f4f6;
    border: none;
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 1.2rem;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .nav-button:hover {
    background: #e5e7eb;
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
    gap: 1px;
    background: #e5e7eb;
    border-radius: 8px;
    overflow: hidden;
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
    transition: background-color 0.2s;
  }

  .calendar-day.today {
    background: #dbeafe;
  }

  .calendar-day.selected {
    background: #3b82f6;
    color: white;
  }

  .calendar-day.selected .day-number {
    color: white;
  }

  .calendar-day.future {
    background: #f3f4f6;
    color: #9ca3af;
    cursor: not-allowed;
  }

  .calendar-day.future:hover {
    background: #f3f4f6;
  }

  .calendar-day.past {
    background: white;
    cursor: pointer;
  }

  .calendar-day.past:hover {
    background: #f9fafb;
  }

  .calendar-day.has-puzzles {
    position: relative;
  }

  .calendar-day.has-puzzles::after {
    content: '';
    position: absolute;
    top: 2px;
    right: 2px;
    width: 6px;
    height: 6px;
    background: #10b981;
    border-radius: 50%;
  }

  .day-number {
    font-weight: 600;
    margin-bottom: 4px;
  }

  .puzzle-indicators {
    display: flex;
    gap: 3px;
    flex-wrap: wrap;
  }

  .puzzle-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    border: none;
    cursor: pointer;
    transition: transform 0.2s;
  }

  .puzzle-dot:hover {
    transform: scale(1.3);
  }

  .puzzle-details {
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 8px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    z-index: 10;
    display: flex;
    flex-direction: row;
    gap: 6px;
    width: 180px;
    white-space: nowrap;
  }

  .puzzle-button {
    padding: 6px 8px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.75rem;
    font-weight: 500;
    transition: opacity 0.2s;
    flex: 1;
    min-width: 0;
    text-align: center;
  }

  .puzzle-button:hover {
    opacity: 0.8;
  }

  .puzzle-button.easy {
    background: #4ade80;
    color: white;
  }

  .puzzle-button.medium {
    background: #fbbf24;
    color: white;
  }

  .puzzle-button.hard {
    background: #f87171;
    color: white;
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
  }

  .difficulty-button:hover {
    border-color: #d1d5db;
    background: #f9fafb;
    transform: translateY(-1px);
  }

  .difficulty-icon {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    flex-shrink: 0;
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
</style> 