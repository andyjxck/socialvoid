// playtimeTracker.js
// FULL REWRITE — Supabase only, no RPCs, with aggressive debug logs and 60s auto-flush.
// Drop this in place of your current file.

// ───────────────────────────────────────────────────────────────────────────────
// CONFIG: tables & columns  (edit these names if your DB differs)
//
// players                : per-user totals
//   - id                         (uuid | bigint)
//   - total_playtime_seconds     (int)
//
// game_player_stats      : per-user/per-game totals
//   - user_id                    (uuid | bigint)  -- FK to players.id
//   - game_id                    (int | uuid)     -- FK to games.id
//   - total_time_seconds         (int)
//
// game_sessions          : raw event log of each ended (or flushed) game slice (recommended)
//   - id                         (uuid | bigint, default gen)
//   - player_id                  (uuid | bigint)
//   - game_id                    (int | uuid)
//   - duration_seconds           (int)
//   - created_at                 (timestamptz default now())
//
// achievements           : catalog of achievements
//   - id                         (int | uuid)
//   - key                        (text)              e.g., "playtime_update", "game_completed", "friend_added"
//   - name                       (text)
//   - target_value               (int)               threshold to complete
//   - scope                      (text)              "global" | "game" | "friend" | etc.
//   - game_id                    (int | uuid) null   if scope == "game", the specific game (or null=any)
//
// player_achievements    : per-user achievement progress
//   - player_id                  (uuid | bigint)
//   - achievement_id             (int | uuid)
//   - progress_value             (int)               accumulative
//   - completed_at               (timestamptz | null)
//
// achievement_events     : audit trail of track calls (optional but very useful)
//   - id                         (uuid | bigint, default gen)
//   - player_id                  (uuid | bigint)
//   - game_id                    (int | uuid) null
//   - action_key                 (text)
//   - value                      (int)
//   - data                       (jsonb)
//   - created_at                 (timestamptz default now())
//
// If your schema differs, update the constants below.
// ───────────────────────────────────────────────────────────────────────────────

import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";

// ╭────────────────────────────────────────────────────────────────────────────╮
// │ DB CONSTANTS (edit if your schema names differ)                            │
// ╰────────────────────────────────────────────────────────────────────────────╯
const TBL_PLAYERS = "players";
const COL_PLAYERS_ID = "id";
const COL_PLAYERS_TOTAL = "total_playtime_seconds";

const TBL_GAME_PLAYER_STATS = "game_player_stats";
const COL_GPS_USER_ID = "user_id";
const COL_GPS_GAME_ID = "game_id";
const COL_GPS_TOTAL = "total_time_seconds";

const TBL_GAME_SESSIONS = "game_sessions";
const COL_SESS_PLAYER_ID = "player_id";
const COL_SESS_GAME_ID = "game_id";
const COL_SESS_DURATION = "duration_seconds";
// const COL_SESS_CREATED_AT = "created_at"; // default now()

const TBL_ACHIEVEMENTS = "achievements";
const COL_ACH_ID = "id";
const COL_ACH_KEY = "key";
const COL_ACH_NAME = "name";
const COL_ACH_TARGET = "target_value";
const COL_ACH_SCOPE = "scope";
const COL_ACH_GAME_ID = "game_id";

const TBL_PLAYER_ACH = "player_achievements";
const COL_PACH_PLAYER_ID = "player_id";
const COL_PACH_ACH_ID = "achievement_id";
const COL_PACH_PROGRESS = "progress_value";
const COL_PACH_COMPLETED_AT = "completed_at";

const TBL_ACH_EVENTS = "achievement_events";
const COL_EVT_PLAYER_ID = "player_id";
const COL_EVT_GAME_ID = "game_id";
const COL_EVT_ACTION_KEY = "action_key";
const COL_EVT_VALUE = "value";
const COL_EVT_DATA = "data";

// AsyncStorage keys
const KEY_OFFLINE_SESSIONS = "offline_sessions";
const KEY_TOTAL_PLAYTIME = "total_playtime_seconds";

// Auto-flush cadence (ms)
const FLUSH_INTERVAL_MS = 60_000; // 60 seconds
// Minimum duration to submit (seconds)
const MIN_SUBMIT_SEC = 5;

// ╭────────────────────────────────────────────────────────────────────────────╮
// │ Utility helpers                                                            │
// ╰────────────────────────────────────────────────────────────────────────────╯
const nowISO = () => new Date().toISOString();
const clampInt = (n) => Math.max(0, Math.floor(Number(n || 0)));
const toInt = (n) => Math.floor(Number(n || 0));

/** Debug logger (toggle ENABLED to silence) */
const dbg = (...args) => {
  const ENABLED = true;
  if (ENABLED) console.log(...args);
};

/** Supabase error formatter */
const sberr = (prefix, error) => {
  const msg = error?.message || error?.toString?.() || String(error);
  console.error(prefix, msg, error);
  return msg;
};

// ╭────────────────────────────────────────────────────────────────────────────╮
// │ PlaytimeTracker — Supabase-only, 60s auto-flush, achievements + offline    │
// ╰────────────────────────────────────────────────────────────────────────────╯
class PlaytimeTracker {
  constructor() {
    // Session (app-wide)
    this.sessionStartTime = null;
    this.isTrackingSession = false;
    this.backgroundTime = null;

    // Per-game
    this.currentGameId = null;
    this.gameSessionStartTime = null;
    this.isTrackingGame = false;
    this.gameBackgroundTime = null;

    // Auto-flush timer
    this.flushTimer = null;
    this.lastFlushAt = null;
    this.pendingGameAccumSeconds = 0;

    // Optional convenience
    this.currentPlayerId = null;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Player convenience
  // ───────────────────────────────────────────────────────────────────────────
  setPlayerId(playerId) {
    this.currentPlayerId = playerId;
    dbg("👤 [Tracker] setPlayerId:", playerId);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Session (app) tracking
  // ───────────────────────────────────────────────────────────────────────────
  startSession() {
    if (!this.isTrackingSession) {
      this.sessionStartTime = Date.now();
      this.isTrackingSession = true;
      dbg("📱 [Session] started @", new Date(this.sessionStartTime).toISOString());
    } else {
      dbg("📱 [Session] already tracking");
    }
  }

  pauseSession() {
    if (this.isTrackingSession && !this.backgroundTime) {
      this.backgroundTime = Date.now();
      dbg("📱 [Session] paused (background) @", new Date(this.backgroundTime).toISOString());
    }
    this.pauseGameSession();
  }

  resumeSession() {
    if (this.isTrackingSession && this.backgroundTime) {
      const paused = Date.now() - this.backgroundTime;
      if (this.sessionStartTime) this.sessionStartTime += paused;
      this.backgroundTime = null;
      dbg("📱 [Session] resumed, adjusted start forward by", Math.round(paused / 1000), "s");
    }
    this.resumeGameSession();
  }

  endSession() {
    if (this.isTrackingSession && this.sessionStartTime) {
      // ensure coherent game end
      this.endGameSession(); // will flush

      const sec = clampInt((Date.now() - this.sessionStartTime) / 1000);
      dbg("📱 [Session] ended:", sec, "seconds");
      this.isTrackingSession = false;
      this.sessionStartTime = null;
      this.backgroundTime = null;
      return sec;
    }
    dbg("📱 [Session] end ignored — not tracking");
    return 0;
  }

  getCurrentSessionDuration() {
    if (!this.isTrackingSession || !this.sessionStartTime) return 0;
    const base = this.backgroundTime ?? Date.now();
    return clampInt((base - this.sessionStartTime) / 1000);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Game tracking
  // ───────────────────────────────────────────────────────────────────────────
  startGameSession(gameId) {
    // end previous if switching
    if (this.isTrackingGame && this.currentGameId && this.currentGameId !== gameId) {
      dbg("🎮 [Game] switching from", this.currentGameId, "to", gameId, "→ ending previous first");
      this._flushGameNow("switch-before-start").catch(() => {});
      this._hardResetGameState();
    }

    this.currentGameId = gameId;
    this.gameSessionStartTime = Date.now();
    this.isTrackingGame = true;
    this.gameBackgroundTime = null;
    this.pendingGameAccumSeconds = 0;
    this.lastFlushAt = Date.now();

    dbg(`🎮 [Game] START gameId=${gameId} @ ${nowISO()}`);
    this._ensureFlushTimer();
  }

  pauseGameSession() {
    if (this.isTrackingGame && !this.gameBackgroundTime) {
      this.gameBackgroundTime = Date.now();
      dbg("🎮 [Game] paused @", new Date(this.gameBackgroundTime).toISOString());
    }
  }

  resumeGameSession() {
    if (this.isTrackingGame && this.gameBackgroundTime) {
      const paused = Date.now() - this.gameBackgroundTime;
      if (this.gameSessionStartTime) this.gameSessionStartTime += paused;
      this.gameBackgroundTime = null;
      dbg("🎮 [Game] resumed, adjusted start forward by", Math.round(paused / 1000), "s");
    }
  }

  endGameSession() {
    if (!this.isTrackingGame || !this.gameSessionStartTime || !this.currentGameId) {
      dbg("🎮 [Game] end ignored — nothing to end");
      return null;
    }

    if (this.gameBackgroundTime) this.resumeGameSession();

    const durSec = clampInt((Date.now() - this.gameSessionStartTime) / 1000);
    const gameId = this.currentGameId;

    // add any remaining accumulated seconds before end
    this.pendingGameAccumSeconds += durSec;
    dbg(`🎮 [Game] END gameId=${gameId} localDur=${durSec}s + pending=${this.pendingGameAccumSeconds}s`);

    // flush and log a session row
    this._flushGameNow("endGameSession").catch(() => {});

    const ended = { gameId, duration: durSec };

    // clear state
    this._hardResetGameState();

    return ended;
  }

  getCurrentGameSessionDuration() {
    if (!this.isTrackingGame || !this.gameSessionStartTime) return 0;
    const base = this.gameBackgroundTime ?? Date.now();
    return clampInt((base - this.gameSessionStartTime) / 1000);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Public submitters (manual triggers)
  // ───────────────────────────────────────────────────────────────────────────
  async submitSession(playerId, sessionDuration) {
    if (!playerId || sessionDuration < MIN_SUBMIT_SEC) {
      return { success: false, reason: "Session too short or missing playerId" };
    }
    try {
      const total = await this._incrementPlayerTotal(playerId, sessionDuration);
      dbg(`📱 [Submit] +${sessionDuration}s → players.total=${total}s`);
      return { success: true, data: { total_playtime_seconds: total } };
    } catch (e) {
      const msg = sberr("❌ [Submit] players total failed:", e);
      await this.storeOfflineSession(playerId, sessionDuration);
      return { success: false, reason: msg };
    }
  }

  async submitGameSession(playerId, gameId, sessionDuration) {
    if (!playerId || !gameId || sessionDuration < MIN_SUBMIT_SEC) {
      return { success: false, reason: "Session too short or missing data" };
    }
    try {
      const total = await this._incrementGameTotal(playerId, gameId, sessionDuration);
      dbg(`🎮 [Submit] +${sessionDuration}s → game_player_stats.total=${total}s for game=${gameId}`);
      await this._insertGameSessionRow(playerId, gameId, sessionDuration);
      return { success: true, data: { total_time_seconds: total } };
    } catch (e) {
      const msg = sberr("❌ [Submit] game total failed:", e);
      return { success: false, reason: msg };
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Achievements
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Track an achievement action: inserts an audit event, matches achievements
   * by `key`, applies scope rules, and upserts player progress. Returns
   * a list of newly-completed achievements.
   */
  async trackAchievements(playerId, gameId, action, value, gameData = {}) {
    try {
      if (!playerId || !action) {
        dbg("🏆 [Ach] ignored — missing playerId or action");
        return [];
      }

      // 1) audit event (optional table)
      await supabase.from(TBL_ACH_EVENTS).insert([
        {
          [COL_EVT_PLAYER_ID]: playerId,
          [COL_EVT_GAME_ID]: gameId ?? null,
          [COL_EVT_ACTION_KEY]: action,
          [COL_EVT_VALUE]: clampInt(value),
          [COL_EVT_DATA]: gameData ?? {},
        },
      ]);

      // 2) load matching achievements by action key
      const { data: matches, error: achErr } = await supabase
        .from(TBL_ACHIEVEMENTS)
        .select(`${COL_ACH_ID}, ${COL_ACH_KEY}, ${COL_ACH_NAME}, ${COL_ACH_TARGET}, ${COL_ACH_SCOPE}, ${COL_ACH_GAME_ID}`)
        .eq(COL_ACH_KEY, action);

      if (achErr) throw achErr;
      if (!matches || matches.length === 0) {
        dbg("🏆 [Ach] no matching achievements for key:", action);
        return [];
      }

      // 3) upsert progress for each matching achievement
      const newlyCompleted = [];

      for (const ach of matches) {
        const achId = ach[COL_ACH_ID];
        const achName = ach[COL_ACH_NAME];
        const achTarget = toInt(ach[COL_ACH_TARGET]);
        const achScope = String(ach[COL_ACH_SCOPE] || "global");
        const achGameId = ach[COL_ACH_GAME_ID];

        // scope enforcement
        if (achScope === "game") {
          if (achGameId != null && String(achGameId) !== String(gameId ?? "")) {
            continue;
          }
        }

        // fetch current progress
        const { data: pa, error: paErr } = await supabase
          .from(TBL_PLAYER_ACH)
          .select(`${COL_PACH_PROGRESS}, ${COL_PACH_COMPLETED_AT}`)
          .eq(COL_PACH_PLAYER_ID, playerId)
          .eq(COL_PACH_ACH_ID, achId)
          .maybeSingle();
        if (paErr) throw paErr;

        const alreadyCompleted = !!pa?.[COL_PACH_COMPLETED_AT];
        const prevProgress = toInt(pa?.[COL_PACH_PROGRESS]);
        const nextProgress = prevProgress + clampInt(value);
        const completes = !alreadyCompleted && nextProgress >= achTarget && achTarget > 0;

        if (!pa) {
          const insertPayload = {
            [COL_PACH_PLAYER_ID]: playerId,
            [COL_PACH_ACH_ID]: achId,
            [COL_PACH_PROGRESS]: nextProgress,
            [COL_PACH_COMPLETED_AT]: completes ? nowISO() : null,
          };
          const { error: insErr } = await supabase.from(TBL_PLAYER_ACH).insert([insertPayload]);
          if (insErr) throw insErr;
        } else {
          const updatePayload = { [COL_PACH_PROGRESS]: nextProgress };
          if (completes) updatePayload[COL_PACH_COMPLETED_AT] = nowISO();

          const { error: updErr } = await supabase
            .from(TBL_PLAYER_ACH)
            .update(updatePayload)
            .eq(COL_PACH_PLAYER_ID, playerId)
            .eq(COL_PACH_ACH_ID, achId);
          if (updErr) throw updErr;
        }

        if (completes) {
          newlyCompleted.push({ id: achId, name: achName });
          dbg(`🏆 [Ach] completed "${achName}" (id=${achId})`);
        } else {
          dbg(`🏆 [Ach] progressed "${achName}" → ${nextProgress}/${achTarget}`);
        }
      }

      return newlyCompleted;
    } catch (error) {
      sberr("❌ [Ach] trackAchievements failed:", error);
      return [];
    }
  }

  /** Submit a session then track a "playtime_update" achievement. */
  async submitSessionWithAchievements(playerId, sessionDuration) {
    try {
      const res = await this.submitSession(playerId, sessionDuration);
      if (res.success && sessionDuration > 0) {
        dbg("🕐 [Ach] playtime_update for", Math.floor(sessionDuration / 60), "min");
        await this.trackAchievements(playerId, null, "playtime_update", sessionDuration, {
          playtimeSeconds: sessionDuration,
          playtimeMinutes: Math.floor(sessionDuration / 60),
        });
      }
      return res;
    } catch (e) {
      const msg = sberr("❌ [Ach] submitSessionWithAchievements failed:", e);
      return { success: false, reason: msg };
    }
  }

  /**
   * High-level: call at game completion. Ends local game timer, submits playtime,
   * then tracks "game_completed" achievement (with score/time in payload).
   */
  async autoTrackOnGameEnd(gameId, playerId, score, gameData = {}) {
    try {
      const ended = this.endGameSession(); // flush+clear inside
      const dur = ended?.duration ?? 0;
      if (dur > 0) {
        await this.submitGameSession(playerId, gameId, dur);
      }

      const completed = await this.trackAchievements(playerId, gameId, "game_completed", score, {
        score,
        timeSeconds: dur,
        ...gameData,
      });

      if (completed.length > 0) {
        // Optional meta: achievement_completed count
        await this.trackAchievements(playerId, null, "achievement_completed", completed.length, {
          achievementsUnlocked: completed.length,
          latestAchievements: completed.map((a) => a.id),
        });
      }

      return completed;
    } catch (e) {
      sberr("❌ [AutoTrack] onGameEnd failed:", e);
      return [];
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Offline queue (playtime only — game totals are flushed live)
  // ───────────────────────────────────────────────────────────────────────────
  async storeOfflineSession(playerId, durationSec) {
    try {
      const raw = (await AsyncStorage.getItem(KEY_OFFLINE_SESSIONS)) || "[]";
      const arr = JSON.parse(raw);
      arr.push({ player_id: playerId, duration: clampInt(durationSec), ts: Date.now() });
      await AsyncStorage.setItem(KEY_OFFLINE_SESSIONS, JSON.stringify(arr));
      dbg("📦 [Offline] stored session:", durationSec, "s");
    } catch (e) {
      sberr("❌ [Offline] store failed:", e);
    }
  }

  async submitOfflineSessions() {
    try {
      const raw = await AsyncStorage.getItem(KEY_OFFLINE_SESSIONS);
      if (!raw) return;
      const sessions = JSON.parse(raw);
      if (!Array.isArray(sessions) || sessions.length === 0) return;

      const stillPending = [];
      for (const s of sessions) {
        const ok = await this.submitSession(s.player_id, s.duration);
        if (!ok.success) stillPending.push(s);
      }

      if (stillPending.length === 0) {
        await AsyncStorage.removeItem(KEY_OFFLINE_SESSIONS);
        dbg("📦 [Offline] all sessions submitted, queue cleared");
      } else {
        await AsyncStorage.setItem(KEY_OFFLINE_SESSIONS, JSON.stringify(stillPending));
        dbg("📦 [Offline] partial submit — remaining:", stillPending.length);
      }
    } catch (e) {
      sberr("❌ [Offline] submit failed:", e);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Local display helpers
  // ───────────────────────────────────────────────────────────────────────────
  async getTotalPlaytime() {
    try {
      const raw = await AsyncStorage.getItem(KEY_TOTAL_PLAYTIME);
      return raw ? toInt(raw) : 0;
    } catch (e) {
      sberr("❌ getTotalPlaytime failed:", e);
      return 0;
    }
  }

  async updateTotalPlaytime(totalSeconds) {
    try {
      await AsyncStorage.setItem(KEY_TOTAL_PLAYTIME, String(clampInt(totalSeconds)));
    } catch (e) {
      sberr("❌ updateTotalPlaytime failed:", e);
    }
  }

  formatPlaytime(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  }

  // Progress/levels
  getPlayerTitle(level) {
    if (level >= 200) return "Puzzle Deity";
    if (level >= 190) return "Puzzle Transcendent";
    if (level >= 180) return "Puzzle Omniscient";
    if (level >= 170) return "Puzzle Eternal";
    if (level >= 160) return "Puzzle Immortal";
    if (level >= 150) return "Puzzle Supreme";
    if (level >= 145) return "Puzzle Overlord";
    if (level >= 140) return "Puzzle Emperor";
    if (level >= 135) return "Puzzle Sovereign";
    if (level >= 130) return "Puzzle Monarch";
    if (level >= 125) return "Puzzle Ruler";
    if (level >= 120) return "Puzzle Commander";
    if (level >= 115) return "Puzzle General";
    if (level >= 110) return "Puzzle Marshal";
    if (level >= 105) return "Puzzle Captain";
    if (level >= 100) return "Puzzle Grandmaster";
    if (level >= 98) return "Puzzle Sage";
    if (level >= 96) return "Puzzle Oracle";
    if (level >= 94) return "Puzzle Visionary";
    if (level >= 92) return "Puzzle Mystic";
    if (level >= 90) return "Puzzle Wizard";
    if (level >= 88) return "Puzzle Sorcerer";
    if (level >= 86) return "Puzzle Magician";
    if (level >= 84) return "Puzzle Enchanter";
    if (level >= 82) return "Puzzle Legend";
    if (level >= 80) return "Puzzle Mythic";
    if (level >= 78) return "Puzzle Hero";
    if (level >= 76) return "Puzzle Guardian";
    if (level >= 74) return "Puzzle Protector";
    if (level >= 72) return "Puzzle Defender";
    if (level >= 70) return "Puzzle Warrior";
    if (level >= 68) return "Puzzle Knight";
    if (level >= 66) return "Puzzle Crusader";
    if (level >= 64) return "Puzzle Paladin";
    if (level >= 62) return "Puzzle Elite";
    if (level >= 60) return "Puzzle Expert";
    if (level >= 58) return "Puzzle Virtuoso";
    if (level >= 56) return "Puzzle Genius";
    if (level >= 54) return "Puzzle Prodigy";
    if (level >= 52) return "Puzzle Savant";
    if (level >= 50) return "Puzzle Specialist";
    if (level >= 48) return "Puzzle Scholar";
    if (level >= 46) return "Puzzle Analyst";
    if (level >= 44) return "Puzzle Strategist";
    if (level >= 42) return "Puzzle Tactician";
    if (level >= 40) return "Puzzle Architect";
    if (level >= 38) return "Puzzle Designer";
    if (level >= 36) return "Puzzle Engineer";
    if (level >= 34) return "Puzzle Craftsman";
    if (level >= 32) return "Puzzle Artisan";
    if (level >= 30) return "Puzzle Veteran";
    if (level >= 28) return "Puzzle Professional";
    if (level >= 26) return "Puzzle Experienced";
    if (level >= 25) return "Puzzle Pro";
    if (level >= 24) return "Puzzle Ace";
    if (level >= 23) return "Puzzle Star";
    if (level >= 22) return "Puzzle Advanced";
    if (level >= 21) return "Puzzle Skilled";
    if (level >= 20) return "Puzzle Senior";
    if (level >= 19) return "Puzzle Trainee";
    if (level >= 18) return "Puzzle Competent";
    if (level >= 17) return "Puzzle Capable";
    if (level >= 16) return "Puzzle Proficient";
    if (level >= 15) return "Puzzle Enthusiast";
    if (level >= 14) return "Puzzle Devotee";
    if (level >= 13) return "Puzzle Fan";
    if (level >= 12) return "Puzzle Lover";
    if (level >= 11) return "Puzzle Adept";
    if (level >= 10) return "Puzzle Solver";
    if (level >= 9) return "Puzzle Hunter";
    if (level >= 8) return "Puzzle Seeker";
    if (level >= 7) return "Puzzle Explorer";
    if (level >= 6) return "Puzzle Discoverer";
    if (level >= 5) return "Puzzle Apprentice";
    if (level >= 4) return "Puzzle Learner";
    if (level >= 3) return "Puzzle Student";
    if (level >= 2) return "Puzzle Beginner";
    return "Puzzle Newcomer";
  }

  getTimeToNextLevel(totalPlaytimeSeconds) {
    const totalMinutes = Math.floor(totalPlaytimeSeconds / 60);
    const minutesToNextLevel = 15 - (totalMinutes % 15);
    const secondsToNextLevel = minutesToNextLevel * 60 - (totalPlaytimeSeconds % 60);
    return {
      minutes: Math.floor(secondsToNextLevel / 60),
      seconds: secondsToNextLevel % 60,
      totalSeconds: secondsToNextLevel,
    };
  }

  // ╭──────────────────────────────────────────────────────────────────────────╮
  // Internal: periodic flush logic
  // ╰──────────────────────────────────────────────────────────────────────────╯
  _ensureFlushTimer() {
    if (this.flushTimer) return;
    this.flushTimer = setInterval(() => {
      this._tickFlush().catch(() => {});
    }, FLUSH_INTERVAL_MS);
    dbg("⏱️ [Flush] timer started (60s cadence)");
  }

  _clearFlushTimer() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
      dbg("⏱️ [Flush] timer cleared");
    }
  }

  async _tickFlush() {
    if (!this.isTrackingGame || !this.currentGameId || !this.gameSessionStartTime) return;

    const now = Date.now();
    const base = this.gameBackgroundTime ?? now;
    const elapsedSinceStart = clampInt((base - this.gameSessionStartTime) / 1000);

    const last = this.lastFlushAt ?? this.gameSessionStartTime;
    const delta = clampInt((base - last) / 1000);

    this.pendingGameAccumSeconds += delta;
    this.lastFlushAt = now;

    dbg(`⏱️ [Flush] tick: +${delta}s (elapsed=${elapsedSinceStart}s, pending=${this.pendingGameAccumSeconds}s)`);

    if (this.pendingGameAccumSeconds >= MIN_SUBMIT_SEC) {
      await this._flushGameNow("interval");
    }
  }

  async _flushGameNow(reason) {
    try {
      const playerId = this.currentPlayerId;
      const gameId = this.currentGameId;

      if (!playerId || !gameId) {
        dbg("⏱️ [Flush]", reason, "ignored — missing playerId/gameId");
        this.pendingGameAccumSeconds = 0;
        return;
      }

      const toSubmit = this.pendingGameAccumSeconds;
      if (toSubmit < MIN_SUBMIT_SEC) {
        dbg(`⏱️ [Flush] ${reason} — not enough seconds to submit (${toSubmit}s)`);
        this.pendingGameAccumSeconds = 0;
        return;
      }

      // 1) increment per-game total
      const newGameTotal = await this._incrementGameTotal(playerId, gameId, toSubmit);

      // 2) increment player total
      const newPlayerTotal = await this._incrementPlayerTotal(playerId, toSubmit);

      // 3) log a session slice row
      await this._insertGameSessionRow(playerId, gameId, toSubmit);

      dbg(`✅ [Flush:${reason}] +${toSubmit}s submitted — game_total=${newGameTotal}s, player_total=${newPlayerTotal}s`);

      // reset pending and mirror locally
      this.pendingGameAccumSeconds = 0;
      this.lastFlushAt = Date.now();
      await this.updateTotalPlaytime(newPlayerTotal);
    } catch (e) {
      sberr("❌ [Flush] failed:", e);
      // keep pending seconds so we retry on next tick
    }
  }

  _hardResetGameState() {
    this._clearFlushTimer();
    this.currentGameId = null;
    this.isTrackingGame = false;
    this.gameSessionStartTime = null;
    this.gameBackgroundTime = null;
    this.lastFlushAt = null;
    this.pendingGameAccumSeconds = 0;
    dbg("🧹 [Game] state reset");
  }

  // ╭──────────────────────────────────────────────────────────────────────────╮
  // Internal DB helpers (no RPCs)
  // ╰──────────────────────────────────────────────────────────────────────────╯
  async _incrementPlayerTotal(playerId, deltaSec) {
    const sec = clampInt(deltaSec);

    // read current
    const { data: cur, error: selErr } = await supabase
      .from(TBL_PLAYERS)
      .select(COL_PLAYERS_TOTAL)
      .eq(COL_PLAYERS_ID, playerId)
      .maybeSingle();
    if (selErr) throw selErr;

    const current = clampInt(cur?.[COL_PLAYERS_TOTAL]);
    const next = current + sec;

    // update
    const { data: upd, error: updErr } = await supabase
      .from(TBL_PLAYERS)
      .update({ [COL_PLAYERS_TOTAL]: next })
      .eq(COL_PLAYERS_ID, playerId)
      .select(COL_PLAYERS_TOTAL)
      .single();
    if (updErr) throw updErr;

    return clampInt(upd?.[COL_PLAYERS_TOTAL] ?? next);
  }

  async _incrementGameTotal(playerId, gameId, deltaSec) {
    const sec = clampInt(deltaSec);

    // ensure row exists
    const { data: gps, error: gpsSelErr } = await supabase
      .from(TBL_GAME_PLAYER_STATS)
      .select(COL_GPS_TOTAL)
      .eq(COL_GPS_USER_ID, playerId)
      .eq(COL_GPS_GAME_ID, gameId)
      .maybeSingle();
    if (gpsSelErr) throw gpsSelErr;

    if (!gps) {
      const { error: insErr } = await supabase.from(TBL_GAME_PLAYER_STATS).insert([
        {
          [COL_GPS_USER_ID]: playerId,
          [COL_GPS_GAME_ID]: gameId,
          [COL_GPS_TOTAL]: 0,
        },
      ]);
      if (insErr) throw insErr;
    }

    // read current (or 0)
    const { data: cur, error: selErr2 } = await supabase
      .from(TBL_GAME_PLAYER_STATS)
      .select(COL_GPS_TOTAL)
      .eq(COL_GPS_USER_ID, playerId)
      .eq(COL_GPS_GAME_ID, gameId)
      .maybeSingle();
    if (selErr2) throw selErr2;

    const current = clampInt(cur?.[COL_GPS_TOTAL]);
    const next = current + sec;

    const { data: upd, error: updErr } = await supabase
      .from(TBL_GAME_PLAYER_STATS)
      .update({ [COL_GPS_TOTAL]: next })
      .eq(COL_GPS_USER_ID, playerId)
      .eq(COL_GPS_GAME_ID, gameId)
      .select(COL_GPS_TOTAL)
      .single();
    if (updErr) throw updErr;

    return clampInt(upd?.[COL_GPS_TOTAL] ?? next);
  }

  async _insertGameSessionRow(playerId, gameId, durationSec) {
    const sec = clampInt(durationSec);
    if (sec <= 0) return;
    const { error } = await supabase.from(TBL_GAME_SESSIONS).insert([
      {
        [COL_SESS_PLAYER_ID]: playerId,
        [COL_SESS_GAME_ID]: gameId,
        [COL_SESS_DURATION]: sec,
      },
    ]);
    if (error) throw error;
  }
}

export default new PlaytimeTracker();
