// src/utils/gameTracker.js
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import playtimeTracker from "./playtimeTracker";

class GameTracker {
  constructor() {
    this.sessions = new Map(); // Map<gameId, session>
  }

  /*─────────────────────────────
    Start a new game session
  ─────────────────────────────*/
  async startGame(gameId, playerId) {
    if (!gameId || !playerId) return;

    console.log(`🎮 Starting game tracking: ${gameId} for player ${playerId}`);

    // end any leftover sessions first
    for (const [id, s] of this.sessions) {
      if (!s.ended) await this.endGame(id, s.score || 0, s.gameData || {});
    }

    playtimeTracker.setPlayerId(playerId);
      playtimeTracker.startGameSession(gameId);
    const session = {
      gameId,
      playerId,
      startTime: Date.now(),
      endTime: null,
      duration: 0,
      score: 0,
      gameData: {},
      ended: false,
    };

    this.sessions.set(gameId, session);
    await AsyncStorage.setItem(`game_session_${gameId}`, JSON.stringify(session));
  }

  /*─────────────────────────────
    End a session and submit
  ─────────────────────────────*/
  async endGame(gameId, score = 0, gameData = {}) {
    let s = this.sessions.get(gameId);
    if (!s) {
      const raw = await AsyncStorage.getItem(`game_session_${gameId}`);
      if (raw) s = JSON.parse(raw);
    }
    if (!s || s.ended) return s || null;

    const pt = playtimeTracker.endGameSession(s.playerId, s.gameId);
    s.endTime = Date.now();
    s.duration = pt?.duration ?? Math.floor((s.endTime - s.startTime) / 1000);
    s.score = Number(score || 0);
    s.gameData = gameData || {};
    s.ended = true;

    console.log(`🎮 Game session: ${s.duration}s`, s.gameData);

    try {
      await this.submitSession(s);
    } catch (e) {
      console.error("❌ Failed to submit session:", e);
      await this.storeFailed(s);
    } finally {
      this.sessions.delete(gameId);
      await AsyncStorage.removeItem(`game_session_${gameId}`);
    }
    return s;
  }

  /*─────────────────────────────
    Persist to Supabase + update stats
  ─────────────────────────────*/
  async submitSession(s) {
    const { playerId, gameId, duration, score, endTime, gameData } = s;

    // 1️⃣ always log a raw session
    const { error: insertErr } = await supabase.from("game_sessions").insert({
      player_id: playerId,
      game_id: gameId,
      score,
      points_earned: 10,
      duration_seconds: duration,
      game_data: { duration, ...gameData },
      created_at: new Date(endTime).toISOString(),
    });
    if (insertErr) throw insertErr;

    // 2️⃣ add to players.total_playtime_seconds
    await this.addTotalPlaytime(playerId, duration);

    // 3️⃣ bump persistent score tables
      console.log("➡️ Submitting persistent stats", { playerId, gameId, score });
    await this.updatePersistentStats(playerId, gameId, score, gameData);

    // 4️⃣ achievements
    await this.checkAchievements(playerId, gameId);

    console.log("✅ Session + persistent stats recorded");
  }

  /*─────────────────────────────
    Increment global playtime
  ─────────────────────────────*/
  async addTotalPlaytime(playerId, seconds) {
    const { data, error } = await supabase
      .from("players")
      .select("total_playtime_seconds")
      .eq("id", playerId)
      .maybeSingle();
    if (error) throw error;

    const current = Number(data?.total_playtime_seconds || 0);
    const next = current + Number(seconds || 0);

    const { error: upErr } = await supabase
      .from("players")
      .update({ total_playtime_seconds: next })
      .eq("id", playerId);
    if (upErr) throw upErr;
  }

    // src/utils/gameTracker.js (only replace updatePersistentStats)
    async updatePersistentStats(playerId, gameId, score, gameData) {
      // Decide behavior per game using DB fields if available, with a code fallback.
      // DB (optional): games.game_type, games.track_best_time (bool)
      // If your 'games' table doesn't have track_best_time, adjust the fallback set below.

      // Fallback sets (edit once here if needed)
      const AI_GAMES_BY_TYPE = new Set(["chess", "connect_4", "dots_and_boxes", "mancala"]);
      const BEST_TIME_GAMES_BY_TYPE = new Set([
        // put time-based/high-score games here if you don't have a DB flag
        "block_blast",
        // "minesweeper",
        // "snake",
        // add more as needed
      ]);

      // Pull game metadata once
      let gameType = null;
      let trackBestTime = null; // prefer DB flag if present
      try {
        const { data: g } = await supabase
          .from("games")
          .select("game_type, track_best_time") // ok if track_best_time doesn't exist; it will be undefined
          .eq("id", gameId)
          .maybeSingle();

        gameType = g?.game_type || null;
        // If DB has a boolean column track_best_time, use it. Otherwise, leave null and fall back.
        trackBestTime = typeof g?.track_best_time === "boolean" ? g.track_best_time : null;
      } catch {
        // ignore; we'll fall back to code sets
      }

      const isAIGame = gameType ? AI_GAMES_BY_TYPE.has(gameType) : false;
      // If DB column missing, fall back to code set
      const shouldTrackBestTime =
        trackBestTime !== null ? trackBestTime : (gameType ? BEST_TIME_GAMES_BY_TYPE.has(gameType) : false);

      // Always work in player_game_stats keyed by numeric game_id
      const { data: row, error: selErr } = await supabase
        .from("player_game_stats")
        .select("id, high_score, total_plays, best_time")
        .eq("player_id", playerId)
        .eq("game_id", gameId)
        .maybeSingle();
      if (selErr) throw selErr;

      if (isAIGame) {
        // Count Player wins in high_score, total games in total_plays.
        // AI wins = total_plays - high_score (you can compute on read).
        const winInc = gameData?.winner === "Player" ? 1 : 0;

        if (!row) {
          await supabase.from("player_game_stats").insert({
            player_id: playerId,
            game_id: gameId,
            high_score: winInc,
            total_plays: 1,
          });
        } else {
          await supabase
            .from("player_game_stats")
            .update({
              high_score: (Number(row.high_score || 0) + winInc),
              total_plays: (Number(row.total_plays || 0) + 1),
            })
            .eq("id", row.id);
        }
        return;
      }

      // High-score style games.
      // We’ll also track best_time (lowest duration) if the game is marked as time-tracked.
      const newHigh = Math.max(Number(row?.high_score || 0), Number(score || 0));

      // duration is already computed by gameTracker.endGame() and set on the session
      // Submit path passes it in as `s.duration`, which we already wrote to game_sessions.
      // We can recompute here from gameData if you sent it, but simpler: read from gameData.duration if present,
      // else don't change best_time (it’s optional).
      const durationSec = Number(gameData?.duration ?? 0) || null;

      if (!row) {
        await supabase.from("player_game_stats").insert({
          player_id: playerId,
          game_id: gameId,
          high_score: Number(score || 0),
          total_plays: 1,
          ...(shouldTrackBestTime && durationSec != null ? { best_time: durationSec } : {}),
        });
      } else {
        const next = {
          high_score: newHigh,
          total_plays: (Number(row.total_plays || 0) + 1),
        };

        if (shouldTrackBestTime && durationSec != null) {
          const currentBest = row.best_time == null ? null : Number(row.best_time);
          next.best_time =
            currentBest == null || currentBest === 0
              ? durationSec
              : Math.min(currentBest, durationSec);
        }

        await supabase.from("player_game_stats").update(next).eq("id", row.id);
      }
    }



  /*─────────────────────────────
    Achievements (unchanged)
  ─────────────────────────────*/
  async checkAchievements(playerId, gameId) {
    const { data: achievements, error } = await supabase
      .from("achievements")
      .select("*")
      .or(`game_id.eq.${gameId},game_id.is.null`);
    if (error) throw error;

    const { data: sessions, error: sErr } = await supabase
      .from("game_sessions")
      .select("duration_seconds")
      .eq("player_id", playerId)
      .eq("game_id", gameId);
    if (sErr) throw sErr;

    const totalGameTime = (sessions || []).reduce(
      (sum, r) => sum + (Number(r.duration_seconds) || 0),
      0
    );

    const { data: completed, error: cErr } = await supabase
      .from("player_achievements")
      .select("achievement_id")
      .eq("player_id", playerId);
    if (cErr) throw cErr;

    const done = new Set((completed || []).map((a) => a.achievement_id));

    for (const ach of achievements || []) {
      if (done.has(ach.id)) continue;

      let progress = 0;
      if (ach.achievement_type === "total_playtime") {
        const { data: p } = await supabase
          .from("players")
          .select("total_playtime_seconds")
          .eq("id", playerId)
          .maybeSingle();
        progress = Number(p?.total_playtime_seconds || 0);
      } else if (ach.achievement_type === "game_playtime") {
        progress = totalGameTime;
      }

      if (progress >= Number(ach.target_value || 0)) {
        await supabase.from("player_achievements").insert({
          player_id: playerId,
          achievement_id: ach.id,
          progress,
          is_completed: true,
          completed_at: new Date().toISOString(),
        });
        console.log(`🏆 Achievement unlocked: ${ach.name}`);
      }
    }
  }

  /*─────────────────────────────
    Offline buffer
  ─────────────────────────────*/
  async storeFailed(session) {
    const failed = await AsyncStorage.getItem("failed_sessions");
    const list = failed ? JSON.parse(failed) : [];
    list.push(session);
    await AsyncStorage.setItem("failed_sessions", JSON.stringify(list));
  }

  async retryFailedSessions() {
    const failed = await AsyncStorage.getItem("failed_sessions");
    if (!failed) return;
    const list = JSON.parse(failed);
    const still = [];
    for (const s of list) {
      try {
        await this.submitSession(s);
      } catch {
        still.push(s);
      }
    }
    await AsyncStorage.setItem("failed_sessions", JSON.stringify(still));
  }

  /*─────────────────────────────
    Helpers
  ─────────────────────────────*/
  getCurrentDuration(gameId) {
    const s = this.sessions.get(gameId);
    return s ? Math.floor((Date.now() - s.startTime) / 1000) : 0;
  }

  updateGameData(gameId, gameData) {
    const s = this.sessions.get(gameId);
    if (s && !s.ended) s.gameData = { ...s.gameData, ...(gameData || {}) };
  }
}

export default new GameTracker();
