// src/utils/gameIds.js
import { supabase } from "./supabase"; // adjust path if needed

// Cache to avoid hitting Supabase repeatedly
const gameIdCache = {};

/**
 * Aliases so different front-end keys still match the DB `games.game_type`
 * You can add or remove items if you add more games later.
 */
const TYPE_ALIASES = {
  "2048": ["2048", "twenty48", "twenty_forty_eight"],
  blockrise: ["blockrise"],
  snake: ["snake"],
    pong: ["pong"],
    smashem: ["smashem"],
    voidinvaders: ["voidinvaders"],

    stackem: ["stackem"],
    hilo: ["hilo"],
  minesweeper: ["minesweeper", "mine_sweeper"],
  sudoku: ["sudoku"],
    choices: ["choices"],
  memory_match: ["memory_match", "memory-match"],
  word_search: ["word_search", "word-search"],
  sliding_puzzle: ["sliding_puzzle", "sliding-puzzle"],
    hangman: ["hangman", "hangman"],
    wordtiles: ["wordtiles", "wordtiles"],
    block_blast: ["block_blast", "block-blast"],
  water_sort: ["water_sort", "water-sort"],
  flow_connect: ["flow_connect", "flow-connect"],
  mancala: ["mancala"],
  solitaire: ["solitaire"],
    fillthegrid: ["fillthegrid"],
  connect_4: ["connect_4", "connect4"],
  simon_says: ["simon_says", "simon"],
  whack_a_tap: ["whack_a_tap", "whack-a-tap"],
  dots_and_boxes: ["dots_and_boxes", "dots_boxes"],
  kakuro: ["kakuro"],
  word_wheel: ["word_wheel", "word-wheel"],
    tictactoe: ["tictactoe"],
};

/**
 * Build all candidate strings we should try against `games.game_type`
 */
function candidateTypes(gameType) {
  if (!gameType) return [];
  const key = String(gameType).toLowerCase();
  const aliases = TYPE_ALIASES[key] || [];
  // also try swapping underscores and hyphens just in case
  const alt1 = key.replace(/_/g, "-");
  const alt2 = key.replace(/-/g, "_");
  return Array.from(new Set([key, alt1, alt2, ...aliases]));
}

/**
 * Get the numeric id from the games table by its game_type
 * @param {string} gameType - e.g. "tetris", "connect_4"
 * @returns {Promise<number|null>} numeric id or null if not found
 */
export const getGameId = async (gameType) => {
  if (!gameType) return null;

  if (gameIdCache[gameType]) {
    return gameIdCache[gameType];
  }

  try {
    const candidates = candidateTypes(gameType);

    for (const type of candidates) {
      const { data, error } = await supabase
        .from("games")
        .select("id, game_type")
        .eq("game_type", type)
        .maybeSingle();

      if (error) {
        console.error(`❌ Supabase error while looking up "${type}":`, error);
        continue;
      }

      if (data?.id) {
        gameIdCache[gameType] = data.id;
        console.log(`🎮 Game ID cached: ${gameType} (${type}) = ${data.id}`);
        return data.id;
      }
    }

    console.warn(`⚠️ No game found for type "${gameType}" (tried: ${candidates.join(", ")})`);
    return null;
  } catch (err) {
    console.error(`❌ Error getting game ID for ${gameType}:`, err);
    return null;
  }
};

/**
 * Game type constants for easy reference in your app
 * These match the exact `game_type` values shown in your screenshots.
 */
export const GAME_TYPES = {
  TWENTY48: "2048",
  BLOCKRISE: "blockrise",
  SNAKE: "snake",
    PONG: "pong",
    SMASHEM: "smashem",
    VOIDINVADERS: "voidinvaders",

    STACKEM: "stackem",
    HILO: "hilo",
  MINESWEEPER: "minesweeper",
  SUDOKU: "sudoku",
    CHOICES: "choices",
  MEMORY_MATCH: "memory_match",
  WORD_SEARCH: "word_search",
  SLIDING_PUZZLE: "sliding_puzzle",
    HANGMAN: "hangman",
  BLOCK_BLAST: "block_blast",
  WATER_SORT: "water_sort",
  FLOW_CONNECT: "flow_connect",
  MANCALA: "mancala",
  SOLITAIRE: "solitaire",
    FILLTHEGRID: "fillthegrid",
  CONNECT_4: "connect_4",
  SIMON_SAYS: "simon_says",
  WHACK_A_TAP: "whack_a_tap",
  DOTS_AND_BOXES: "dots_and_boxes",
  KAKURO: "kakuro",
  WORD_WHEEL: "word_wheel",
  CROSS_WORD_WHEEL: "cross_word_wheel",
  WORDTILES: "wordtiles",
  CROSSWORD: "crossword",
    TICTACTOE: "tictactoe",
};

/**
 * Clear the ID cache (if games table changes while app is running)
 */
export const clearGameIdCache = () => {
  Object.keys(gameIdCache).forEach((k) => delete gameIdCache[k]);
  console.log("🎮 Game ID cache cleared");
};

export default {
  getGameId,
  GAME_TYPES,
  clearGameIdCache,
};
