<script>
  import { onMount } from 'svelte';

  let currentDate = new Date();
  let currentMonth = currentDate.getMonth();
  let currentYear = currentDate.getFullYear();
  let puzzleData = {};
  let selectedDate = null;

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

  onMount(async () => {
    await loadPuzzleData();
  });

  async function loadPuzzleData() {
    puzzleData = {};
    
    // Load puzzle data for the current month and previous months
    const endDate = new Date(currentYear, currentMonth + 1, 0);
    const startDate = new Date(currentYear, currentMonth - 2, 1); // Load 3 months of data
    
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = formatDate(d);
      puzzleData[dateStr] = {};
      
      for (const difficulty of difficulties) {
        try {
          const response = await fetch(`/board/nytimes/${difficulty}/${dateStr}`);
          if (response.ok) {
            const puzzleString = await response.text();
            puzzleData[dateStr][difficulty] = puzzleString.trim();
          }
        } catch (error) {
          // Puzzle doesn't exist for this date/difficulty
          console.log(`No puzzle found for ${dateStr} ${difficulty}`);
        }
      }
    }
    console.log('Loaded puzzle data:', puzzleData);
  }

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
    loadPuzzleData();
  }

  function nextMonth() {
    if (currentMonth === 11) {
      currentMonth = 0;
      currentYear++;
    } else {
      currentMonth++;
    }
    selectedDate = null; // Clear selection when changing months
    loadPuzzleData();
  }

  function selectPuzzle(dateStr, difficulty) {
    console.log('Selecting puzzle:', dateStr, difficulty);
    if (puzzleData[dateStr] && puzzleData[dateStr][difficulty]) {
      const puzzleString = puzzleData[dateStr][difficulty];
      console.log('Loading puzzle:', puzzleString);
      // Navigate to the puzzle with the selected puzzle data
      window.location.href = `/?q=${puzzleString}`;
    } else {
      console.log('No puzzle found for', dateStr, difficulty);
    }
  }

  function selectDate(day) {
    console.log('Selecting date:', day);
    if (day && day.isPast) {
      selectedDate = selectedDate === day.date ? null : day.date;
      console.log('Selected date:', selectedDate);
    }
  }

  $: calendarDays = generateCalendarDays();
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
                <button 
                  class="puzzle-dot" 
                  style="background-color: {difficultyColors[difficulty]}"
                  on:click|stopPropagation={() => selectPuzzle(day.date, difficulty)}
                  title="Play {difficulty} puzzle from {day.date}"
                  type="button"
                >
                </button>
              {/if}
            {/each}
          </div>
          
          {#if selectedDate === day.date && day.puzzles && Object.keys(day.puzzles).length > 0}
            <div class="puzzle-details">
              {#each difficulties as difficulty}
                {#if day.puzzles[difficulty]}
                  <button 
                    class="puzzle-button {difficulty}"
                    on:click|stopPropagation={() => selectPuzzle(day.date, difficulty)}
                    type="button"
                  >
                    {difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
                  </button>
                {/if}
              {/each}
            </div>
          {/if}
        {/if}
      </div>
    {/each}
  </div>
  
  <!-- Debug info -->
  <div style="margin-top: 20px; font-size: 0.8rem; color: #666;">
    <p>Current month: {monthNames[currentMonth]} {currentYear}</p>
    <p>Puzzle data loaded: {Object.keys(puzzleData).length} dates</p>
    <p>Selected date: {selectedDate || 'None'}</p>
  </div>
</div>

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
    left: 0;
    right: 0;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 8px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    z-index: 10;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .puzzle-button {
    padding: 6px 12px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.8rem;
    font-weight: 500;
    transition: opacity 0.2s;
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
</style> 