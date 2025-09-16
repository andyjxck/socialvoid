// useGames.js
import { useState, useEffect } from 'react';
import { supabase } from "../utils/supabase";  // Adjust import as needed

/**
 * 🎯 PERSISTENT GAME STATS HOOK
 * Loads player's historical stats for any game type from the database
 * This fixes the "0 score reset" issue for all games!
 *
 * @param {number} playerId - The current player ID
 * @param {string} gameType - The game type (e.g., 'connect_4', '2048', 'tetris')
 * @returns {object} { stats, isLoading, error, refresh }
 */
export function useGameStats(playerId, gameType) {
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadStats = async () => {
    if (!playerId || !gameType) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      console.log(`📊 Loading ${gameType} stats for player:`, playerId);

      // Query Supabase for the player stats for the given game type
      const { data: playerStats, error: statsError } = await supabase
        .from("game_player_stats")
        .select("game_id, player_wins, ai_wins, total_games")
        .eq("user_id", playerId)
        .eq("game_id", gameType)
        .single();  // Fetch only one row for the specific game

      if (statsError) {
        console.error("❌ Error fetching player stats:", statsError);
        throw new Error('Failed to load player stats');
      }

      console.log("📊 Player stats loaded:", playerStats);

      if (playerStats) {
        // Found the player's game stats
        console.log(`🎮 ${gameType} persistent stats:`, playerStats);
        setStats(playerStats);
      } else {
        console.log(`🎮 No ${gameType} stats found, player hasn't played yet`);
        // Set default empty stats for new players
        setStats({
          high_score: 0,
          total_plays: 0,
          total_points_earned: 0,
          best_time: null,
          total_playtime_seconds: 0
        });
      }

    } catch (err) {
      console.error(`❌ Failed to load ${gameType} stats:`, err);
      setError(err.message);
      // Set default empty stats on error
      setStats({
        high_score: 0,
        total_plays: 0,
        total_points_earned: 0,
        best_time: null,
        total_playtime_seconds: 0
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, [playerId, gameType]);

  return {
    stats,
    isLoading,
    error,
    refresh: loadStats
  };
}

/**
 * 🎯 GAME TYPE CONSTANTS
 * All the game types that need persistent stats
 */
export const GAME_STATS_TYPES = {
  CONNECT_4: 'connect_4',
  TETRIS: 'tetris',
  TWENTY_FORTY_EIGHT: '2048',
  MEMORY_MATCH: 'memory_match',
  SNAKE: 'snake',
  MINESWEEPER: 'minesweeper',
  WORD_SEARCH: 'word_search',
  SUDOKU: 'sudoku',
  SLIDING_PUZZLE: 'sliding_puzzle',
  CHESS: 'chess',
  SOLITAIRE: 'solitaire',
  BLOCK_BLAST: 'block_blast',
  WATER_SORT: 'water_sort',
  MANCALA: 'mancala',
  FLOW_CONNECT: 'flow_connect',
  SIMON_SAYS: 'simon_says',
  WHACK_A_TAP: 'whack_a_tap',
  DOTS_AND_BOXES: 'dots_and_boxes',
  KAKURO: 'kakuro',
  WORD_WHEEL: 'word_wheel'
};

/**
 * 🎯 HELPER FUNCTIONS FOR DIFFERENT GAME TYPES
 */

/**
 * Format score display for different game types
 */
export function formatGameScore(stats, gameType) {
  if (!stats) return { display: '--', label: 'Score' };

  switch (gameType) {
    // Win-based games (show wins/total)
    case GAME_STATS_TYPES.CONNECT_4:
    case GAME_STATS_TYPES.CHESS:
    case GAME_STATS_TYPES.MANCALA:
    case GAME_STATS_TYPES.DOTS_AND_BOXES:
      return {
        display: `${stats.high_score || 0}/${stats.total_plays || 0}`,
        label: 'Wins',
        wins: stats.high_score || 0,
        losses: Math.max(0, (stats.total_plays || 0) - (stats.high_score || 0))
      };

    // Time-based games (show best time)
    case GAME_STATS_TYPES.WORD_SEARCH:
    case GAME_STATS_TYPES.SUDOKU:
    case GAME_STATS_TYPES.SLIDING_PUZZLE:
    case GAME_STATS_TYPES.MINESWEEPER:
    case GAME_STATS_TYPES.MEMORY_MATCH:
    case GAME_STATS_TYPES.SOLITAIRE:
      if (stats.best_time) {
        const minutes = Math.floor(stats.best_time / 60);
        const seconds = stats.best_time % 60;
        return {
          display: minutes > 0
            ? `${minutes}:${seconds.toString().padStart(2, '0')}`
            : `${seconds}s`,
          label: 'Best Time',
          timeSeconds: stats.best_time
        };
      }
      return { display: '--', label: 'Best Time' };

    // Level-based games
    case GAME_STATS_TYPES.FLOW_CONNECT:
    case GAME_STATS_TYPES.WATER_SORT:
      return {
        display: `Level ${stats.high_score || 0}`,
        label: 'Best Level',
        level: stats.high_score || 0
      };

    // Word count games
    case GAME_STATS_TYPES.WORD_WHEEL:
      return {
        display: `${stats.high_score || 0} words`,
        label: 'Best Score',
        words: stats.high_score || 0
      };

    // Standard score games
    case GAME_STATS_TYPES.TETRIS:
    case GAME_STATS_TYPES.TWENTY_FORTY_EIGHT:
    case GAME_STATS_TYPES.SNAKE:
    case GAME_STATS_TYPES.BLOCK_BLAST:
    case GAME_STATS_TYPES.SIMON_SAYS:
    case GAME_STATS_TYPES.WHACK_A_TAP:
    case GAME_STATS_TYPES.KAKURO:
    default:
      return {
        display: (stats.high_score || 0).toLocaleString(),
        label: 'High Score',
        score: stats.high_score || 0
      };
  }
}

/**
 * Get playtime display
 */
export function formatPlaytime(stats) {
  if (!stats?.total_playtime_seconds) return 'Not played yet';
  
  const totalSeconds = stats.total_playtime_seconds;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m played`;
  } else if (minutes > 0) {
    return `${minutes}m played`;
  } else {
    return 'Less than 1m played';
  }
}
