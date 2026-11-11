/**
 * @typedef {1|2|3|4|5|6|7|8} Level
 * @typedef {'easy'|'medium'|'hard'|'manual'|'sequential'} Mode
 * @typedef {{codes: string[], detail: string}} Reason
 * @typedef {{id: string, digits: string, ratingTenths: number, level: Level, sourceHash?: string, sourceBucket?: string, [key: string]: unknown}} Puzzle
 * @typedef {{repo: string, gitSha: string, files: string[], license: string, grader: {name: string, version: string, settings: string}, verification: {method: string, version: string, url: string}, [key: string]: unknown}} Source
 * @typedef {{schema: 1, catalogVersion: string, source: Source, puzzles: Puzzle[], ratingIndex?: Record<string, string[]>, levelIndex?: Record<string, number[]>, [key: string]: unknown}} Catalog
 * @typedef {{min: number, max: number}} Band
 * @typedef {{kind: 'level', level: Level}|{kind: 'experience', mapsToLevel: Level}} ColdStart
 * @typedef {'independent_complete'|'hinted_complete'|'viewed_answer'|'gave_up'|'in_progress'|'paused'} Outcome
 * @typedef {'light'|'some_effort'|'struggle'} Feedback
 * @typedef {{candidateMode: string, [key: string]: string|boolean}} Settings
 * @typedef {{attemptId: string, playerId: string, puzzle: Puzzle, catalogVersion: string,
 * source: Source, mode: Mode, ruleVersion: string, reason: Reason, replay: boolean,
 * settings: Settings, recommendation?: Recommendation}} Start
 * @typedef {Start & {startedAt: number, updatedAt: number, endedAt?: number,
 * effectiveMs: number, hintCount: number, hintUsed: boolean, answerRevealed: boolean, outcome: Outcome,
 * feedback?: Feedback, settingsHistory: {at: number, settings: Settings}[]}} Attempt
 * A hint event is one star-key (3-step hint panel) use. Omitted source means star.
 * Fill and the 30-second single-cell hint dot must not emit hint events; explicit
 * non-star sources are retained in the log but ignored by the projection.
 * @typedef {{id: string, attemptId: string, at: number} & (
 * {type: 'start', start: Start} |
 * {type: 'time', effectiveMs: number} |
 * {type: 'settings', settings: Settings} |
 * {type: 'feedback', feedback?: Feedback} |
 * {type: 'hint', source?: string} |
 * {type: 'pause'|'background'|'close'|'resume'|'reveal'|'complete'|'give_up'}
 * )} PlayEvent
 * @typedef {{schema: 1, events: PlayEvent[]}} RecordLog
 * @typedef {{getItem: (key: string) => string|null, setItem: (key: string, value: string) => void}} Storage
 */
/**
 * @typedef {{mode: Mode, candidateRange: {min: number, max: number|null}, selectedRatingBucket: number|null,
 * puzzleId: string|null, reason: Reason, fallbackUsed: boolean, ruleVersion: string,
 * historySnapshotVersion: string, catalogVersion: string, seed: string|number,
 * context?: {coldStart: ColdStart, manualLevel?: Level, sequentialLevel?: Level, maxOpenLevel?: Level, recentPuzzleIds: (string|null)[]}}} Recommendation
 */
export {};
