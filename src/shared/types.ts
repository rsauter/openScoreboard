// src/shared/types.ts

// #region ─── Common ─────────────────────────────────────────────────────────────

/** The current phase of a game, progressing sequentially from pregame to ended. */
export type GamePhase =
  | 'pregame'
  | 'period'
  | 'break'      // Intermission between regular periods
  | 'ot_break'   // Break before OT / between OT periods
  | 'so_break'   // Break before shootout
  | 'overtime'
  | 'shootout'
  | 'ended';

// #endregion

// #region ─── Penalty ──────────────────────────────────────────────────────────────────

/** Controls how a penalty is rendered on the display. */
export type PenaltyDisplayMode = 'slot' | 'badge';

/** Lifecycle status of a penalty. */
export type PenaltyStatus      = 'running' | 'queued' | 'waiting' | 'cleared' | 'expired' | 'cancelled';

/** Defines a penalty type as configured in a SportsTemplate. */
export interface PenaltyType {
  id:              string;
  label:           string;
  durationSeconds: number;
  displayMode:     PenaltyDisplayMode;
  clearableByGoal: boolean;
  chainSeconds?:   number;  // For 2+2: below this remaining time the penalty can no longer be cleared by goal
}

/** The type of companion penalty accompanying a main penalty. */
export type CompanionType = '2' | '5' | '2+2';

/** Global penalty engine settings, defined per SportsTemplate. */
export interface PenaltySettings {
  maxActiveSlots:     number;   // Typically 2
  queueEnabled:       boolean;
  queueOrderEditable: boolean;
}

/** A single penalty instance active or queued during a game. */
export interface Penalty {
  id:              number;
  team:            'home' | 'away';
  player:          string;
  typeId:          string;             // Reference to PenaltyType.id
  displayMode:     PenaltyDisplayMode;
  clearableByGoal: boolean;
  duration:        number;             // Seconds (original duration)
  remaining:       number;             // Seconds (countdown, only decreasing when status=running)
  status:          PenaltyStatus;
  queuePosition:      number | null;   // 1-based, only set when status=queued
  linkedPenaltyId:    number | null;   // ID of the companion penalty (set on main penalty)
  parentPenaltyId:    number | null;   // ID of the main penalty (set on companion penalty)
  blockedByPenaltyId: number | null;   // ID of the slot penalty that must expire first (waiting status)
  nextPenaltyId:      number | null;   // For 2+2: ID of the second 2min that starts after the first
}

// #endregion

// #region ─── Match configuration (minutes — DB/API/UI) ────────────────────────────────
// All duration fields in MINUTES. server.ts converts → seconds for GameState.

/** Game configuration as used in the UI and API (all durations in minutes). */
export interface MatchConfig {
  numPeriods:      number;
  periodDuration:  number;  // Minutes
  breakDuration:   number;  // Minutes
  hasOvertime:     boolean;
  numOtPeriods:    number | null;  // null = Open End
  otDuration:      number;         // Minutes per OT period
  otSuddenDeath:   boolean;
  otBreakDuration: number;         // Minutes
  hasShootout:     boolean;
  soBreakDuration: number;         // Minutes
}

// #endregion

// #region ─── GameState (seconds — runtime/WebSocket) ─────────────────────────────────
// All duration fields in SECONDS here (tick loop works in seconds).

/** The authoritative real-time game state held in memory on the server
 *  and broadcast to all clients via WebSocket (all durations in seconds). */
export interface GameState {
  // Game config snapshot
  numPeriods:      number;
  periodDuration:  number;  // Seconds
  breakDuration:   number;  // Seconds
  hasOvertime:     boolean;
  numOtPeriods:    number | null;
  otDuration:      number;  // Seconds
  otSuddenDeath:   boolean;
  otBreakDuration: number;  // Seconds
  hasShootout:     boolean;
  soBreakDuration: number;  // Seconds

  /** If true, the period/overtime clock displays elapsed time (counting up from 0) instead
   *  of remaining time. Breaks always display remaining time regardless of this flag.
   *  Internal timeRemaining always counts down; this only affects display formatting. */
  countUp:         boolean;

  // Penalty configuration (from template)
  penaltyTypes:    PenaltyType[];
  penaltySettings: PenaltySettings;

  // Teams
  homeTeam:  string;
  awayTeam:  string;
  homeColor: string;
  awayColor: string;
  homeAbbr:  string;
  awayAbbr:  string;

  // Score
  homeScore:    number;
  awayScore:    number;
  homeShootout: number;
  awayShootout: number;

  // Game flow
  phase:           GamePhase;
  currentPeriod:   number;  // Regular period (1..numPeriods)
  currentOtPeriod: number;  // 0 = not in OT, 1 = OT1, 2 = OT2 ...
  timeRemaining:   number;  // Seconds
  running:         boolean;
  lastTick:        number | null;

  // Penalties
  penalties: Penalty[];

  // Timeouts
  homeTimeouts:     number;
  awayTimeouts:     number;
  timeoutActive:    'home' | 'away' | null;
  timeoutRemaining: number;  // Seconds
}

// #endregion

// #region ─── WebSocket Messages Server → Client ──────────────────────────────────────

/** Messages sent from the server to all connected clients. */
export type ServerMessage =
  | { type: 'STATE'; state: GameState }
  | { type: 'BUZZER'; reason: 'period' | 'timeout' | 'penalty' | 'manual'; id?: number };

// #endregion

// #region ─── WebSocket Commands Client → Server ──────────────────────────────────────

/** Commands sent from a client to the server to mutate game state. */
export type ClientCommand =
  | { cmd: 'SET_CONFIG'; homeTeam: string; awayTeam: string; homeColor?: string; awayColor?: string; homeAbbr?: string; awayAbbr?: string; config: MatchConfig; templateSlug?: string }
  | { cmd: 'START' }
  | { cmd: 'STOP' }
  | { cmd: 'NEXT_PHASE' }
  | { cmd: 'ABORT_GAME' }
  | { cmd: 'RESTART_GAME' }
  | { cmd: 'GOAL_HOME' }
  | { cmd: 'GOAL_AWAY' }
  | { cmd: 'UNDO_HOME' }
  | { cmd: 'UNDO_AWAY' }
  | { cmd: 'SO_HOME' }
  | { cmd: 'SO_AWAY' }
  | { cmd: 'ADD_PENALTY'; team: 'home' | 'away'; player: string; typeId: string; companion?: { player: string; type: CompanionType } }
  | { cmd: 'REMOVE_PENALTY'; id: number }
  | { cmd: 'REORDER_QUEUE'; team: 'home' | 'away'; orderedIds: number[] }
  | { cmd: 'TIMEOUT'; team: 'home' | 'away' }
  | { cmd: 'ADJUST_TIME'; delta: number }
  | { cmd: 'SET_TIME'; seconds: number }
  | { cmd: 'SET_PENALTY_TIME'; id: number; seconds: number }
  | { cmd: 'BUZZER_MANUAL' };

// #endregion

// #region ─── API Types ────────────────────────────────────────────────────────────────
// SportsTemplate as returned by the API (minutes)

/** A sports template as returned by the REST API (all durations in minutes). */
export interface SportsTemplate {
  id:              number;
  slug:            string;   // Stable, distinct identifier (from YAML filename/slug field)
  name:            string;
  numPeriods:      number;
  periodDuration:  number;  // Minutes
  breakDuration:   number;  // Minutes
  hasOvertime:     boolean;
  numOtPeriods:    number | null;
  otDuration:      number;  // Minutes
  otSuddenDeath:   boolean;
  otBreakDuration: number;  // Minutes
  hasShootout:     boolean;
  soBreakDuration: number;  // Minutes
  /** If true, the period/overtime clock displays elapsed time (counting up) instead of
   *  remaining time. Breaks always display remaining time regardless of this flag. */
  countUp:         boolean;
  isDefault:       boolean;
  createdAt:       string;
  // Penalty configuration
  penaltyTypes:    PenaltyType[];
  penaltySettings: PenaltySettings;
}

// #endregion

// #region ─── Archived Game States ──────────────────────────────────────────────────────

/** Metadata for a finished/archived game state file, as listed in Settings. */
export interface ArchivedStateInfo {
  filename:     string;    // e.g. state_2026-06-17T20-15-00_Home-vs-Away.json
  archivedAt:   string;    // ISO timestamp, parsed from the filename
  homeTeam:     string;
  awayTeam:     string;
  homeScore:    number;
  awayScore:    number;
  homeShootout: number;
  awayShootout: number;
  phase:        GamePhase;
}

// #endregion

// #region ─── License / Fleet Identity ─────────────────────────────────────────────────

/** Subscription state as tracked by scoreboardFLEET for this device. */
export type SubscriptionStatus = 'unlicensed' | 'active' | 'expired';

/** Contents of license.json (project root).
 *  Written only by the pairing process or by the one-time migration on first
 *  startup. Never written by the Settings UI — read-only from the app's perspective.
 *  fleetInstanceId is generated once on first boot and never changes,
 *  regardless of licensing state (see ADR-00XX). */
export interface LicenseInfo {
  fleetInstanceId:    string;
  licenseKey:         string | null;
  organizationName:   string | null;
  subscriptionStatus: SubscriptionStatus;
  licenseValidUntil:  string | null;  // ISO date string, null when unlicensed
}

/** Returns a default (unlicensed) LicenseInfo for a freshly generated fleetInstanceId.
 *  Used by ensureLicenseFile() on first boot when no license.json exists yet. */
export function defaultLicenseInfo(fleetInstanceId: string): LicenseInfo {
  return {
    fleetInstanceId,
    licenseKey:         null,
    organizationName:   null,
    subscriptionStatus: 'unlicensed',
    licenseValidUntil:  null,
  };
}

// #endregion