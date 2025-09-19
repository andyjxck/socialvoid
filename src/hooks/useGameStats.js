// src/hooks/useGames.js
import { useState, useEffect } from "react";
import { supabase } from "../utils/supabase";

/**
 * useGameStats
 * Load persistent per-player stats for a single game.
 *
 * @param {number} playerId  players.id
 * @param {number} gameId    games.id  (numeric ID, not the string game_type)
 * @returns {object} { stats, isLoading, error, refresh }
 */
export function useGameStats(playerId, gameId) {
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadStats = async () => {
    if (!playerId || !gameId) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      console.log(`📊 Loading stats: player ${playerId}, game ${gameId}`);

      // player_game_stats holds high_score / total_plays / etc.
      const { data, error: fetchErr } = await supabase
        .from("player_game_stats")
        .select(
          "high_score, total_plays, total_points_earned, best_time, total_playtime_seconds, player_id, game_id"
        )
        .eq("player_id", playerId)
        .eq("game_id", gameId)
        .maybeSingle(); // avoid “0 rows” error

      if (fetchErr) throw fetchErr;

      setStats(
        data || {
          high_score: 0,
          total_plays: 0,
          total_points_earned: 0,
          best_time: null,
          total_playtime_seconds: 0,
        }
      );
    } catch (err) {
      console.error("❌ Failed to load player stats:", err);
      setError(err.message);
      setStats({
        high_score: 0,
        total_plays: 0,
        total_points_earned: 0,
        best_time: null,
        total_playtime_seconds: 0,
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, [playerId, gameId]);

  return { stats, isLoading, error, refresh: loadStats };
}

/** Game-type string constants for convenience (use to look up games.id elsewhere) */
export const GAME_STATS_TYPES = {
  CONNECT_4: "connect_4",
  TETRIS: "tetris",
  TWENTY_FORTY_EIGHT: "2048",
  MEMORY_MATCH: "memory_match",
  SNAKE: "snake",
  MINESWEEPER: "minesweeper",
  WORD_SEARCH: "word_search",
  SUDOKU: "sudoku",
  SLIDING_PUZZLE: "sliding_puzzle",
  CHESS: "chess",
  SOLITAIRE: "solitaire",
  BLOCK_BLAST: "block_blast",
  WATER_SORT: "water_sort",
  MANCALA: "mancala",
  FLOW_CONNECT: "flow_connect",
  SIMON_SAYS: "simon_says",
  WHACK_A_TAP: "whack_a_tap",
  DOTS_AND_BOXES: "dots_and_boxes",
  KAKURO: "kakuro",
  WORD_WHEEL: "word_wheel",
};

/**
 * Format score display depending on the game type.
 * @param {object} stats  object from useGameStats
 * @param {string} gameType one of GAME_STATS_TYPES
 */
export function formatGameScore(stats, gameType) {
  if (!stats) return { display: "--", label: "Score" };

  switch (gameType) {
    // Games where “wins / total plays” is more meaningful
    case GAME_STATS_TYPES.CONNECT_4:
    case GAME_STATS_TYPES.CHESS:
    case GAME_STATS_TYPES.MANCALA:
    case GAME_STATS_TYPES.DOTS_AND_BOXES:
      return {
        display: `${stats.high_score || 0}/${stats.total_plays || 0}`,
        label: "Wins",
        wins: stats.high_score || 0,
        losses: Math.max(
          0,
          (stats.total_plays || 0) - (stats.high_score || 0)
        ),
      };

    // Games with a best-time metric
    case GAME_STATS_TYPES.WORD_SEARCH:
    case GAME_STATS_TYPES.SUDOKU:
    case GAME_STATS_TYPES.SLIDING_PUZZLE:
    case GAME_STATS_TYPES.MINESWEEPER:
    case GAME_STATS_TYPES.MEMORY_MATCH:
    case GAME_STATS_TYPES.SOLITAIRE: {
      const t = stats.best_time;
      if (!t) return { display: "--", label: "Best Time" };
      const m = Math.floor(t / 60);
      const s = t % 60;
      return {
        display: m > 0 ? `${m}:${s.toString().padStart(2, "0")}` : `${s}s`,
        label: "Best Time",
        timeSeconds: t,
      };
    }

    // Level-based games
    case GAME_STATS_TYPES.FLOW_CONNECT:
    case GAME_STATS_TYPES.WATER_SORT:
      return {
        display: `Level ${stats.high_score || 0}`,
        label: "Best Level",
        level: stats.high_score || 0,
      };

    // Word-count scoring
    case GAME_STATS_TYPES.WORD_WHEEL:
      return {
        display: `${stats.high_score || 0} words`,
        label: "Best Score",
        words: stats.high_score || 0,
      };

    // Default: standard numeric high score
    default:
      return {
        display: (stats.high_score || 0).toLocaleString(),
        label: "High Score",
        score: stats.high_score || 0,
      };
  }
}

/**
 * Human-readable playtime from total_playtime_seconds.
 */
export function formatPlaytime(stats) {
  const sec = stats?.total_playtime_seconds || 0;
  if (sec <= 0) return "Not played yet";

  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);

  if (h > 0) return `${h}h ${m}m played`;
  if (m > 0) return `${m}m played`;
  return "Less than 1m played";
}
