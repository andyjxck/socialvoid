// src/utils/playtimeTracker.js
// Supabase-only, 60s auto-flush. Works with your schema:
// - players.total_playtime_seconds
// - player_game_stats(player_id, game_id, total_playtime_seconds)
// - game_sessions (player_id, game_id, duration_seconds)

import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";

// ─── TABLE/COLUMN NAMES (MATCH YOUR DB) ──────────────────────────────────────
const TBL_PLAYERS = "players";
const COL_PLAYERS_ID = "id";
const COL_PLAYERS_TOTAL = "total_playtime_seconds";

const TBL_GAME_PLAYER_STATS = "player_game_stats";           // ✅ your table
const COL_GPS_PLAYER_ID = "player_id";                        // ✅ your column
const COL_GPS_GAME_ID = "game_id";
const COL_GPS_TOTAL = "total_playtime_seconds";               // ✅ your column

const TBL_GAME_SESSIONS = "game_sessions";
const COL_SESS_PLAYER_ID = "player_id";
const COL_SESS_GAME_ID = "game_id";
const COL_SESS_DURATION = "duration_seconds";

// Optional (only used if you add achievements later)
const TBL_ACHIEVEMENTS = "achievements";
const TBL_PLAYER_ACH = "player_achievements";

const KEY_TOTAL_PLAYTIME = "total_playtime_seconds";
const FLUSH_INTERVAL_MS = 60_000; // 60s
const MIN_SUBMIT_SEC = 5;

const nowISO = () => new Date().toISOString();
const clampInt = (n) => Math.max(0, Math.floor(Number(n || 0)));

const dbg = (...args) => {
  const ENABLED = true;
  if (ENABLED) console.log(...args);
};

const sberr = (prefix, error) => {
  const msg = error?.message || error?.toString?.() || String(error);
  console.error(prefix, msg, error);
  return msg;
};

class PlaytimeTracker {
  constructor() {
    // who is playing
    this.currentPlayerId = null;

    // current game timing
    this.currentGameId = null;
    this.gameSessionStartTime = null;
    this.isTrackingGame = false;
    this.gameBackgroundTime = null;

    // flush state
    this.flushTimer = null;
    this.lastFlushAt = null;
    this.pendingGameAccumSeconds = 0;
  }

  // You MUST call this once you know the player
  setPlayerId(playerId) {
    this.currentPlayerId = playerId ? Number(playerId) : null;
    dbg("👤 [Tracker] setPlayerId:", this.currentPlayerId);
  }

  // ─── Game lifecycle ────────────────────────────────────────────────────────
  startGameSession(gameId) {
    const gid = Number(gameId);
    if (!gid) {
      dbg("🎮 [Game] start ignored — missing/invalid gameId");
      return;
    }

    // if switching games, flush previous
    if (this.isTrackingGame && this.currentGameId && this.currentGameId !== gid) {
      dbg("🎮 [Game] switching from", this.currentGameId, "to", gid, "→ ending previous first");
      this._flushGameNow("switch-before-start").catch(() => {});
      this._hardResetGameState();
    }

    this.currentGameId = gid;
    this.gameSessionStartTime = Date.now();
    this.isTrackingGame = true;
    this.gameBackgroundTime = null;
    this.pendingGameAccumSeconds = 0;
    this.lastFlushAt = Date.now();

    dbg(`🎮 [Game] START gameId=${gid} @ ${nowISO()}`);
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

    this.pendingGameAccumSeconds += durSec;
    dbg(`🎮 [Game] END gameId=${gameId} localDur=${durSec}s + pending=${this.pendingGameAccumSeconds}s`);

    // flush remainder
    this._flushGameNow("endGameSession").catch(() => {});

    const ended = { gameId, duration: durSec };
    this._hardResetGameState();
    return ended;
  }

  // ─── Flush loop ────────────────────────────────────────────────────────────
  _ensureFlushTimer() {
    if (this.flushTimer) return;
    this.flushTimer = setInterval(() => this._tickFlush().catch(() => {}), FLUSH_INTERVAL_MS);
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
    const last = this.lastFlushAt ?? this.gameSessionStartTime;
    const delta = clampInt((base - last) / 1000);

    this.pendingGameAccumSeconds += delta;
    this.lastFlushAt = now;

    dbg(`⏱️ [Flush] tick: +${delta}s (pending=${this.pendingGameAccumSeconds}s)`);

    if (this.pendingGameAccumSeconds >= MIN_SUBMIT_SEC) {
      await this._flushGameNow("interval");
    }
  }

  async _flushGameNow(reason) {
    const playerId = this.currentPlayerId ? Number(this.currentPlayerId) : null;
    const gameId = this.currentGameId ? Number(this.currentGameId) : null;

    if (!playerId || !gameId) {
      dbg("⏱️ [Flush]", reason, "ignored — missing playerId/gameId");
      this.pendingGameAccumSeconds = 0;
      return;
    }

    const toSubmit = this.pendingGameAccumSeconds;
    if (toSubmit < MIN_SUBMIT_SEC) {
      dbg(`⏱️ [Flush] ${reason} — not enough seconds (${toSubmit}s)`);
      this.pendingGameAccumSeconds = 0;
      return;
    }

    try {
      // a) per-game totals
      const newGameTotal = await this._incrementGameTotal(playerId, gameId, toSubmit);
      // b) player total
      const newPlayerTotal = await this._incrementPlayerTotal(playerId, toSubmit);
      // c) session slice row
      await this._insertGameSessionRow(playerId, gameId, toSubmit);

      dbg(
        `✅ [Flush:${reason}] +${toSubmit}s → game_total=${newGameTotal}s, player_total=${newPlayerTotal}s`
      );

      this.pendingGameAccumSeconds = 0;
      this.lastFlushAt = Date.now();
      await AsyncStorage.setItem(KEY_TOTAL_PLAYTIME, String(newPlayerTotal));
    } catch (e) {
      sberr("❌ [Flush] failed:", e);
      // keep pending; will retry
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

  // ─── DB helpers ────────────────────────────────────────────────────────────
  async _incrementPlayerTotal(playerId, deltaSec) {
    const delta = clampInt(deltaSec);

    const { data: cur, error: selErr } = await supabase
      .from(TBL_PLAYERS)
      .select(COL_PLAYERS_TOTAL)
      .eq(COL_PLAYERS_ID, playerId)
      .maybeSingle();
    if (selErr) throw selErr;

    const current = clampInt(cur?.[COL_PLAYERS_TOTAL]);
    const next = current + delta;

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
    const delta = clampInt(deltaSec);

    // ensure row exists
    const { data: exists, error: sel1 } = await supabase
      .from(TBL_GAME_PLAYER_STATS)
      .select(COL_GPS_TOTAL)
      .eq(COL_GPS_PLAYER_ID, playerId)
      .eq(COL_GPS_GAME_ID, gameId)
      .maybeSingle();
    if (sel1) throw sel1;

    if (!exists) {
      const { error: insErr } = await supabase.from(TBL_GAME_PLAYER_STATS).insert([
        { [COL_GPS_PLAYER_ID]: playerId, [COL_GPS_GAME_ID]: gameId, [COL_GPS_TOTAL]: 0 },
      ]);
      if (insErr) throw insErr;
    }

    // read current
    const { data: cur, error: sel2 } = await supabase
      .from(TBL_GAME_PLAYER_STATS)
      .select(COL_GPS_TOTAL)
      .eq(COL_GPS_PLAYER_ID, playerId)
      .eq(COL_GPS_GAME_ID, gameId)
      .maybeSingle();
    if (sel2) throw sel2;

    const current = clampInt(cur?.[COL_GPS_TOTAL]);
    const next = current + delta;

    const { data: upd, error: updErr } = await supabase
      .from(TBL_GAME_PLAYER_STATS)
      .update({ [COL_GPS_TOTAL]: next })
      .eq(COL_GPS_PLAYER_ID, playerId)
      .eq(COL_GPS_GAME_ID, gameId)
      .select(COL_GPS_TOTAL)
      .single();
    if (updErr) throw updErr;

    return clampInt(upd?.[COL_GPS_TOTAL] ?? next);
  }

  async _insertGameSessionRow(playerId, gameId, sec) {
    const duration = clampInt(sec);
    if (duration <= 0) return;
    const { error } = await supabase.from(TBL_GAME_SESSIONS).insert([
      { [COL_SESS_PLAYER_ID]: playerId, [COL_SESS_GAME_ID]: gameId, [COL_SESS_DURATION]: duration },
    ]);
    if (error) throw error;
  }

  // ─── tiny helpers used by UI ───────────────────────────────────────────────
  formatPlaytime(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

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
}

export default new PlaytimeTracker();
