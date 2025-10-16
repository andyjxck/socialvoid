// src/utils/gameTracker.js
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import playtimeTracker from "./playtimeTracker";

/*───────────────────────────────────────────────────────────────
  Resilient helpers
────────────────────────────────────────────────────────────────*/
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function prettyErr(e) {
  if (!e) return "Unknown error";
  const msg =
    typeof e === "string"
      ? e
      : e?.message || e?.error_description || JSON.stringify(e);
  return String(msg).slice(0, 400);
}

/**
 * Robust write for player_achievements:
 *  - try UPSERT with retries on transient errors (5xx/429/timeouts)
 *  - fall back to UPDATE → INSERT
 *  - short-circuit when nothing changed
 */
async function safeUpsertPlayerAchievement(
  payload,
  {
    conflictCols = "player_id,achievement_id",
    maxRetries = 4,
    shortCircuitAgainst, // { progress, is_completed }
  } = {}
) {
  // Skip if no change
  if (shortCircuitAgainst) {
    const sameProgress =
      Number(shortCircuitAgainst.progress || 0) === Number(payload.progress || 0);
    const sameComplete =
      !!shortCircuitAgainst.is_completed === !!payload.is_completed;
    if (sameProgress && sameComplete) {
      return { ok: true, mode: "noop" };
    }
  }

  // Attempt UPSERT with backoff
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const { error } = await supabase
        .from("player_achievements")
        .upsert(payload, { onConflict: conflictCols });

      if (!error) return { ok: true, mode: "upsert" };

      const msg = String(error?.message || "");
      const transient = /(^|[^a-z])(429|5\d\d)([^a-z]|$)|timeout|temporar|unavail|network/i.test(msg);
      if (!transient) break;

      await sleep(250 * (attempt + 1) + Math.floor(Math.random() * 120));
    } catch (e) {
      const msg = String(e?.message || e);
      const transient =
        /(^|[^a-z])(429|5\d\d)([^a-z]|$)|timeout|temporar|unavail|network|fetch/i.test(
          msg
        );
      if (!transient) break;
      await sleep(250 * (attempt + 1) + Math.floor(Math.random() * 120));
    }
  }

  // Fallback: UPDATE → INSERT
  try {
    const { error: updErr } = await supabase
      .from("player_achievements")
      .update({
        progress: payload.progress,
        is_completed: payload.is_completed,
        ...(payload.completed_at ? { completed_at: payload.completed_at } : {}),
      })
      .eq("player_id", payload.player_id)
      .eq("achievement_id", payload.achievement_id);

    if (!updErr) return { ok: true, mode: "update" };

    const { error: insErr } = await supabase
      .from("player_achievements")
      .insert(payload);

    if (!insErr) return { ok: true, mode: "insert" };

    return { ok: false, error: insErr || updErr };
  } catch (e) {
    return { ok: false, error: e };
  }
}

/*───────────────────────────────────────────────────────────────
  GameTracker
────────────────────────────────────────────────────────────────*/
class GameTracker {
  constructor() {
    /** @type {Map<number, {gameId:number, playerId:number, startTime:number, endTime:number|null, duration:number, score:number, gameData:any, ended:boolean}>} */
    this.sessions = new Map();
  }

  /*─────────────────────────────
    Start a new game session
  ─────────────────────────────*/
  async startGame(gameId, playerId) {
    if (!gameId || !playerId) return;

    console.log(`🎮 Starting game tracking: ${gameId} for player ${playerId}`);

    // End any still-open sessions (best-effort)
    for (const [id, s] of this.sessions) {
      if (!s.ended) {
        try {
          await this.endGame(id, s.score || 0, s.gameData || {});
        } catch (e) {
          console.warn("⚠️ Failed ending previous session:", prettyErr(e));
        }
      }
    }

    // Playtime session (global tracker)
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
    await AsyncStorage.setItem(
      `game_session_${gameId}`,
      JSON.stringify(session)
    );
  }

  /*─────────────────────────────
    End a session and submit
  ─────────────────────────────*/
  async endGame(gameId, score = 0, gameData = {}) {
    let s = this.sessions.get(gameId);
    if (!s) {
      // Recover after app restart
      const raw = await AsyncStorage.getItem(`game_session_${gameId}`);
      if (raw) s = JSON.parse(raw);
    }
    if (!s || s.ended) return s || null;

    // End playtime tracking
    const pt = playtimeTracker.endGameSession(s.playerId, s.gameId);

    s.endTime = Date.now();
    s.duration = pt?.duration ?? Math.floor((s.endTime - s.startTime) / 1000);
    s.score = Number(score || 0);
    // keep duration inside gameData too (signals read rely on it)
    s.gameData = {
      duration: s.duration,
      elapsed_seconds: s.duration,
      ...s.gameData,
      ...(gameData || {}),
    };
    s.ended = true;

    console.log(`🎮 Game session ended: ${s.duration}s`, s.gameData);

    try {
      await this.submitSession(s);
    } catch (e) {
      console.error("❌ Failed to submit session:", prettyErr(e));
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

    // 1) Log a raw session
    const { error: insertErr } = await supabase.from("game_sessions").insert({
      player_id: playerId,
      game_id: gameId,
      score,
      points_earned: 10, // tune if desired
      duration_seconds: duration,
      game_data: { duration, ...gameData },
      created_at: new Date(endTime).toISOString(),
    });
    if (insertErr) throw insertErr;

    // 2) Increment global playtime
    await this.addTotalPlaytime(playerId, duration);

    // 3) Update per-game persistent stats
    console.log("➡️ Submitting persistent stats", { playerId, gameId, score });
    await this.updatePersistentStats(playerId, gameId, score, gameData);

    // 4) Award achievements
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

  /*─────────────────────────────
    Persistent stats per game
  ─────────────────────────────*/
  async updatePersistentStats(playerId, gameId, score, gameData) {
    const AI_GAMES_BY_TYPE = new Set(["connect_4", "dots_and_boxes", "mancala"]);
    const BEST_TIME_GAMES_BY_TYPE = new Set(["block_blast"]);

    let gameType = null;
    let trackBestTime = null;

    try {
      const { data: g } = await supabase
        .from("games")
        .select("game_type, track_best_time")
        .eq("id", gameId)
        .maybeSingle(); // unique id → safe
      gameType = g?.game_type || null;
      trackBestTime =
        typeof g?.track_best_time === "boolean" ? g.track_best_time : null;
    } catch {
      // ignore
    }

    const isAIGame = gameType ? AI_GAMES_BY_TYPE.has(gameType) : false;
    const shouldTrackBestTime =
      trackBestTime !== null
        ? trackBestTime
        : gameType
        ? BEST_TIME_GAMES_BY_TYPE.has(gameType)
        : false;

    // 🔧 Guard against duplicates: pick latest row only
    const { data: row, error: selErr } = await supabase
      .from("player_game_stats")
      .select("id, high_score, total_plays, best_time")
      .eq("player_id", playerId)
      .eq("game_id", gameId)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (selErr) throw selErr;

    if (isAIGame) {
      const winInc =
        gameData?.winner === "Player" || gameData?.winner === "player" ? 1 : 0;

      if (!row) {
        await supabase.from("player_game_stats").insert({
          player_id: playerId,
          game_id: gameId,
          high_score: winInc, // wins
          total_plays: 1,
        });
      } else {
        await supabase
          .from("player_game_stats")
          .update({
            high_score: Number(row.high_score || 0) + winInc,
            total_plays: Number(row.total_plays || 0) + 1,
          })
          .eq("id", row.id);
      }
      return;
    }

    // Non-AI game: high_score is literal score; best_time optional
    const newHigh = Math.max(Number(row?.high_score || 0), Number(score || 0));
    const durationSec =
      Number(gameData?.duration ?? gameData?.elapsed_seconds ?? 0) || null;

    if (!row) {
      await supabase.from("player_game_stats").insert({
        player_id: playerId,
        game_id: gameId,
        high_score: Number(score || 0),
        total_plays: 1,
        ...(shouldTrackBestTime && durationSec != null
          ? { best_time: durationSec }
          : {}),
      });
    } else {
      const next = {
        high_score: newHigh,
        total_plays: Number(row.total_plays || 0) + 1,
      };

      if (shouldTrackBestTime && durationSec != null) {
        const currentBest =
          row.best_time == null ? null : Number(row.best_time);
        next.best_time =
          currentBest == null || currentBest === 0
            ? durationSec
            : Math.min(currentBest, durationSec);
      }

      await supabase.from("player_game_stats").update(next).eq("id", row.id);
    }
  }

  /*─────────────────────────────
    Achievements
  ─────────────────────────────*/
  async checkAchievements(playerId, gameId) {
    // 1) Achievements for this game (and global=null)
    const { data: achievements, error: achErr } = await supabase
      .from("achievements")
      .select("*")
      .or(`game_id.eq.${gameId},game_id.is.null`);
    if (achErr) throw achErr;
    if (!achievements || achievements.length === 0) return;

    // 2) Signals (guard duplicates with order+limit)
    const [{ data: pgStats }, { data: sessions = [] }, { data: playerRow }] =
      await Promise.all([
        supabase
          .from("player_game_stats")
          .select("high_score,total_plays")
          .eq("player_id", playerId)
          .eq("game_id", gameId)
          .order("id", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("game_sessions")
          .select("duration_seconds, score, game_data")
          .eq("player_id", playerId)
          .eq("game_id", gameId),
        supabase
          .from("players")
          .select("total_playtime_seconds")
          .eq("id", playerId)
          .maybeSingle(),
      ]);

    // Generic stats
    const highScore = Number(pgStats?.high_score || 0); // wins for AI games or literal score
    const totalPlays = Number(pgStats?.total_plays || 0);
    const totalGameTime = sessions.reduce(
      (sum, r) => sum + (Number(r?.duration_seconds) || 0),
      0
    );
    const totalPlaytimeSeconds = Number(playerRow?.total_playtime_seconds || 0);

    // Per-game signals from session.game_data
    let maxHighestTile = 0;
    let maxBoxesInGame = 0;
    let maxChain = 0;
    let fastestWin = null;

    // Block Blast
    let lifetimeLines = 0;
    let bestMultiClear = 0;

    // Fill The Grid
    let maxLevelReached = 0;

    for (const s of sessions) {
      const gd = s?.game_data || {};

      // 2048-style
      maxHighestTile = Math.max(maxHighestTile, Number(gd.highest_tile || 0));

      // Dots & Boxes
      maxBoxesInGame = Math.max(maxBoxesInGame, Number(gd.player_boxes || 0));
      maxChain = Math.max(maxChain, Number(gd.longest_chain_player || 0));

      const won =
        gd.player_won === true ||
        gd.winner === "Player" ||
        gd.winner === "player";
      if (won) {
        const dur =
          Number(s.duration_seconds) ||
          Number(gd.elapsed_seconds) ||
          Number(gd.duration) ||
          0;
        if (dur > 0) {
          fastestWin = fastestWin == null ? dur : Math.min(fastestWin, dur);
        }
      }

      // Block Blast
      lifetimeLines += Number(gd.total_lines_cleared || 0);
      bestMultiClear = Math.max(
        bestMultiClear,
        Number(gd.max_lines_single_clear || 0)
      );

      // Fill The Grid
      maxLevelReached = Math.max(
        maxLevelReached,
        Number(gd.level_reached || gd.reach_level || 0)
      );
    }

    // Already completed (avoid spam)
    const { data: completedRows, error: compErr } = await supabase
      .from("player_achievements")
      .select("achievement_id, progress, is_completed")
      .eq("player_id", playerId);
    if (compErr) throw compErr;

    const completedMap = new Map(
      (completedRows || []).map((r) => [
        r.achievement_id,
        { progress: Number(r.progress || 0), is_completed: !!r.is_completed },
      ])
    );

    // 3) Evaluate each achievement and upsert
    for (const ach of achievements) {
      const id = ach.id;
      const type = String(ach.achievement_type || "").toLowerCase();
      const target = Number(ach.target_value || 0);

      let currentProgress = 0;
      let complete = false;

      switch (type) {
        case "score":
          currentProgress = highScore;
          complete = currentProgress >= target && target > 0;
          break;

        case "plays":
        case "total_plays":
          currentProgress = totalPlays;
          complete = currentProgress >= target && target > 0;
          break;

        case "highest_tile":
          currentProgress = maxHighestTile;
          complete = currentProgress >= target && target > 0;
          break;

        case "game_playtime":
          currentProgress = totalGameTime; // seconds
          complete = currentProgress >= target && target > 0;
          break;

        case "total_playtime":
          currentProgress = totalPlaytimeSeconds; // seconds
          complete = currentProgress >= target && target > 0;
          break;

        case "boxes_in_game":
          currentProgress = maxBoxesInGame;
          complete = currentProgress >= target && target > 0;
          break;

        case "chain_longest":
          currentProgress = maxChain;
          complete = currentProgress >= target && target > 0;
          break;

        case "wins_total":
          currentProgress = highScore;
          complete = currentProgress >= target && target > 0;
          break;

        case "quick_win_secs":
          currentProgress = fastestWin == null ? 0 : fastestWin;
          complete =
            fastestWin != null && target > 0 && Number(fastestWin) <= target;
          break;

        case "lifetime_lines":
          currentProgress = lifetimeLines;
          complete = currentProgress >= target && target > 0;
          break;

        case "best_multi_clear":
          currentProgress = bestMultiClear;
          complete = currentProgress >= target && target > 0;
          break;

        case "reach_level":
        case "level_reached":
          currentProgress = maxLevelReached;
          complete = currentProgress >= target && target > 0;
          break;

        default:
          continue;
      }

      // Merge with previously stored progress
      const prev = completedMap.get(id);
      const prevProgress = Number(prev?.progress || 0);
      let mergedProgress = currentProgress;

      if (type === "quick_win_secs") {
        // keep lowest
        if (prevProgress > 0 && currentProgress > 0) {
          mergedProgress = Math.min(prevProgress, currentProgress);
        } else if (prevProgress > 0 && currentProgress === 0) {
          mergedProgress = prevProgress;
        }
      } else {
        mergedProgress = Math.max(prevProgress, currentProgress);
      }

      const payload = {
        player_id: playerId,
        achievement_id: id,
        progress: mergedProgress,
        is_completed: complete || !!prev?.is_completed,
        ...(complete && !prev?.is_completed
          ? { completed_at: new Date().toISOString() }
          : {}),
      };

      try {
        const res = await safeUpsertPlayerAchievement(payload, {
          shortCircuitAgainst: prev || { progress: 0, is_completed: false },
        });

        if (!res.ok) {
          console.error(
            `❌ Achievement write failed id=${id}: ${prettyErr(res.error)}`
          );
        } else if (payload.is_completed && !prev?.is_completed) {
          console.log(`🏆 Achievement unlocked: ${ach.name} (id=${id})`);
        }
      } catch (e) {
        console.error(
          `❌ Achievement write crashed id=${id}: ${prettyErr(e)}`
        );
      }
    }
  }

  /*─────────────────────────────
    Offline buffer
  ─────────────────────────────*/
  async storeFailed(session) {
    try {
      const failed = await AsyncStorage.getItem("failed_sessions");
      const list = failed ? JSON.parse(failed) : [];
      list.push(session);
      await AsyncStorage.setItem("failed_sessions", JSON.stringify(list));
    } catch (e) {
      console.error("❌ Failed to buffer failed session:", prettyErr(e));
    }
  }

  async retryFailedSessions() {
    try {
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
    } catch (e) {
      console.error("❌ Failed to retry failed sessions:", prettyErr(e));
    }
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
