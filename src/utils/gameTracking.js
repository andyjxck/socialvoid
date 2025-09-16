import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import playtimeTracker from "./playtimeTracker";

class GameTracker {
  constructor() {
    this.sessions = new Map(); // gameId -> session data
  }

  /*─────────────────────────────
    Start a new game session
  ─────────────────────────────*/
    async startGame(gameId, playerId) {
      console.log(`🎮 Starting game tracking: ${gameId} for player ${playerId}`);

      // 🔑 NEW: close any active session first
      for (const [activeId, session] of this.sessions) {
        console.log(`⚠️ Ending leftover session for game ${activeId}`);
        await this.endGame(activeId, session.score || 0);
      }

      // Start game session in playtime tracker too
      playtimeTracker.startGameSession(gameId);

      const session = {
        gameId,
        playerId,
        startTime: Date.now(),
        endTime: null,
        duration: 0,
        score: 0,
        gameData: {},
      };

      this.sessions.set(gameId, session);

      try {
        await AsyncStorage.setItem(
          `game_session_${gameId}`,
          JSON.stringify(session)
        );
      } catch (error) {
        console.error("Failed to store session:", error);
      }
    }


  /*─────────────────────────────
    End a session and submit
  ─────────────────────────────*/
  async endGame(gameId, score = 0, gameData = {}) {
    const session = this.sessions.get(gameId);
    if (!session) {
      console.warn(`No session found for game ${gameId}`);
      return null;
    }

    const pt = playtimeTracker.endGameSession();
    session.endTime = Date.now();
    session.duration = pt ? pt.duration : Math.floor((session.endTime - session.startTime) / 1000);
    session.score = Number(score || 0);
    session.gameData = gameData || {};

    console.log(`🎮 Game session: ${session.duration}s`, gameData);

    await this.submitSession(session);

    this.sessions.delete(gameId);
    await AsyncStorage.removeItem(`game_session_${gameId}`);
    return session;
  }

  /*─────────────────────────────
    Write everything to Supabase
  ─────────────────────────────*/
  async submitSession(session) {
    const { playerId, gameId, duration, score, startTime, endTime, gameData } = session;

    try {
      // 1️⃣ Insert into game_sessions
      const { error: insertErr } = await supabase.from("game_sessions").insert({
        player_id: playerId,
        game_id: gameId,
        score,
        points_earned: 10, // adjust if you award differently
        duration_seconds: duration,
        game_data: { duration, ...gameData },
        created_at: new Date(endTime).toISOString(),
      });
      if (insertErr) throw insertErr;

      // 2️⃣ Update players.total_playtime_seconds
      await this.addTotalPlaytime(playerId, duration);

      // 3️⃣ Check & unlock achievements
      await this.checkAchievements(playerId, gameId);

      console.log("✅ Session + playtime + achievements recorded");
    } catch (err) {
      console.error("❌ Failed to submit session:", err);
      await this.storeFailed(session);
    }
  }

  /*─────────────────────────────
    Add to players.total_playtime_seconds
  ─────────────────────────────*/
  async addTotalPlaytime(playerId, seconds) {
    const { data, error } = await supabase
      .from("players")
      .select("total_playtime_seconds")
      .eq("id", playerId)
      .maybeSingle();
    if (error) throw error;

    const current = data?.total_playtime_seconds || 0;
    const { error: upErr } = await supabase
      .from("players")
      .update({ total_playtime_seconds: current + seconds })
      .eq("id", playerId);
    if (upErr) throw upErr;
  }

  /*─────────────────────────────
    Achievement checking
  ─────────────────────────────*/
  async checkAchievements(playerId, gameId) {
    // all achievements for this game or global
    const { data: achievements, error } = await supabase
      .from("achievements")
      .select("*")
      .or(`game_id.eq.${gameId},game_id.is.null`);
    if (error) throw error;

    // per-game total duration
    const { data: sessions, error: sErr } = await supabase
      .from("game_sessions")
      .select("duration_seconds")
      .eq("player_id", playerId)
      .eq("game_id", gameId);
    if (sErr) throw sErr;
    const totalGameTime = sessions.reduce((sum, r) => sum + (r.duration_seconds || 0), 0);

    // already-completed
    const { data: completed, error: cErr } = await supabase
      .from("player_achievements")
      .select("achievement_id")
      .eq("player_id", playerId);
    if (cErr) throw cErr;
    const done = new Set(completed.map(a => a.achievement_id));

    for (const ach of achievements) {
      if (done.has(ach.id)) continue;

      let progress = 0;
      if (ach.achievement_type === "total_playtime") {
        const { data: p, error: pErr } = await supabase
          .from("players")
          .select("total_playtime_seconds")
          .eq("id", playerId)
          .maybeSingle();
        if (pErr) throw pErr;
        progress = p?.total_playtime_seconds || 0;
      } else if (ach.achievement_type === "game_playtime") {
        progress = totalGameTime;
      }

      if (progress >= (ach.target_value || 0)) {
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
    Utilities
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
      try { await this.submitSession(s); }
      catch { still.push(s); }
    }
    await AsyncStorage.setItem("failed_sessions", JSON.stringify(still));
  }

  getCurrentDuration(gameId) {
    const s = this.sessions.get(gameId);
    return s ? Math.floor((Date.now() - s.startTime) / 1000) : 0;
  }

  updateGameData(gameId, gameData) {
    const s = this.sessions.get(gameId);
    if (s) s.gameData = { ...s.gameData, ...(gameData || {}) };
  }
}

export default new GameTracker();
