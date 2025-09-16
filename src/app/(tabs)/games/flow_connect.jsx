import React, { useState, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, Dimensions } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { router } from "expo-router";
import { ArrowLeft, RotateCcw, Undo } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "../../../utils/theme";
import gameTracker from "../../../utils/gameTracking";
import { getGameId, GAME_TYPES } from "../../../utils/gameUtils";
import NightSkyBackground from "../../../components/NightSkyBackground";
/* =========================================================================
   FULL-COVER GENERATOR (embedded)
   - Builds a Hamiltonian "snake" path that visits every cell once
   - Splits into segments → endpoints are segment ends
   - Guarantees the final solution covers 100% of the board
   ========================================================================= */

const COLORS = [
  "#FF6B6B",
  "#4ECDC4",
  "#45B7D1",
  "#96CEB4",
  "#FFEAA7",
  "#FD79A8",
  "#6C5CE7",
  "#A29BFE",
  "#74B9FF",
  "#00B894",
  "#E17055",
  "#FDCB6E",
];

// tiny seeded RNG (for reproducible-but-random feel)
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}
function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const seeded = (seed) => mulberry32(xmur3(seed)());
const randInt = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));

const shuffle = (rng, arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Build a single Hamiltonian snake path across n×n grid
const buildSnakePath = (n) => {
  const path = [];
  for (let r = 0; r < n; r++) {
    if (r % 2 === 0) {
      for (let c = 0; c < n; c++) path.push({ row: r, col: c });
    } else {
      for (let c = n - 1; c >= 0; c--) path.push({ row: r, col: c });
    }
  }
  return path; // length n*n
};

// Randomly flip rows or reverse whole snake to add variety → still full cover
const spiceSnake = (rng, snake, n) => {
  let s = snake.slice();
  if (rng() < 0.5) s.reverse();
  // Occasionally rotate the board 90° by mapping coords
  if (rng() < 0.5) {
    s = s.map((p) => ({ row: p.col, col: n - 1 - p.row }));
  }
  return s;
};

// Split an array length L into K contiguous segment lengths (>= minLen) summing to L
const splitIntoSegments = (rng, total, K, minLen) => {
  const base = Array(K).fill(minLen);
  let remaining = total - K * minLen;
  if (remaining < 0) return null;

  while (remaining > 0) {
    for (let i = 0; i < K && remaining > 0; i++) {
      const add = Math.min(1 + Math.floor(rng() * 3), remaining);
      base[i] += add;
      remaining -= add;
    }
  }
  return shuffle(rng, base); // randomize segment order a bit
};

// Choose number of color pairs based on level + grid size (kept sensible)
const chooseNumPairs = (n, level) => {
  const minPairs = Math.max(3, Math.floor(n / 2));
  const maxPairs = Math.min(8, Math.floor((n * n) / 3));
  const scaled = minPairs + Math.floor(Math.min(level, n * 2) / 2);
  return Math.max(minPairs, Math.min(maxPairs, scaled));
};

// Full-cover generator: ALWAYS fills board by cutting the snake into segments
const generateFullCoverFlow = (gridSize = 5, level = 1) => {
  const n = gridSize;
  const salt = Math.floor(Math.random() * 1e9);
  const rng = seeded(`flow-fullcover|n=${n}|level=${level}|salt=${salt}`);

  // 1) base snake
  const base = buildSnakePath(n);
  const snake = spiceSnake(rng, base, n); // variety, still Hamiltonian

  // 2) number of pairs
  const pairs = chooseNumPairs(n, level);

  // 3) segment lengths
  const minLen = Math.max(3, Math.floor(n * 0.7)); // avoid trivial tiny segments
  const lens =
    splitIntoSegments(rng, n * n, pairs, minLen) ||
    Array(pairs).fill(Math.floor((n * n) / pairs));
  // if split failed (edge cases), just chunk evenly

  // 4) cut snake into segments → endpoints
  let idx = 0;
  const endpoints = {};
  const colors = shuffle(rng, COLORS).slice(0, pairs);

  for (let i = 0; i < pairs; i++) {
    const len = lens[i];
    const segment = snake.slice(idx, idx + len);
    idx += len;
    // safety: if lengths overrun due to fallback, clamp
    if (segment.length === 0) continue;

    const start = segment[0];
    const end = segment[segment.length - 1];
    const color = colors[i];
    endpoints[color] = [start, end];
  }

  // For debug:
  console.log(
    `🧩 Flow FULL-COVER OK n=${n} level=${level} pairs=${
      Object.keys(endpoints).length
    } salt=${salt}`
  );

  return { endpoints }; // we only expose endpoints; player must fill to cover 100%
};

/* =========================================================================
   SCREEN
   ========================================================================= */

const { width: screenWidth } = Dimensions.get("window");

export default function FlowConnectGame() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  // Grid scales with level: 5→6→7 (cap 7 for phones)
  const gridSizeForLevel = useCallback(
    (lvl) => Math.min(7, 5 + Math.floor((lvl - 1) / 3)),
    []
  );
  const [gridSize, setGridSize] = useState(gridSizeForLevel(1));
  const CELL_SIZE = (screenWidth - 80) / gridSize;

  const [currentPlayerId, setCurrentPlayerId] = useState(null);
  const [gameId, setGameId] = useState(null);

  const [level, setLevel] = useState(1);
  const [moves, setMoves] = useState(0);
  const [endpoints, setEndpoints] = useState({});
  const [paths, setPaths] = useState({});
  const [currentPath, setCurrentPath] = useState(null);
  const [gameWon, setGameWon] = useState(false);

  // Load player ID
  useEffect(() => {
    const loadPlayerId = async () => {
      try {
        const savedPlayerId = await AsyncStorage.getItem(
          "puzzle_hub_player_id"
        );
        setCurrentPlayerId(savedPlayerId ? parseInt(savedPlayerId, 10) : 1);
      } catch {
        setCurrentPlayerId(1);
      }
    };
    loadPlayerId();
  }, []);

  // Setup game tracking
  useEffect(() => {
    let mounted = true;
    let currentGameId = null;

    const setupGame = async () => {
      if (!currentPlayerId) return;
      const id = await getGameId(GAME_TYPES.FLOW_CONNECT);
      if (id && mounted) {
        currentGameId = id;
        setGameId(id);
        await gameTracker.startGame(id, currentPlayerId);
      }
    };
    setupGame();

    return () => {
      mounted = false;
      if (currentGameId) gameTracker.endGame(currentGameId, 0);
    };
  }, [currentPlayerId]);

  const initializeGame = useCallback(
    (levelToLoad = level) => {
      const gs = gridSizeForLevel(levelToLoad);
      setGridSize(gs);

      // FULL COVER, always
      const { endpoints: eps } = generateFullCoverFlow(gs, levelToLoad);

      setEndpoints(eps);
      setPaths({});
      setCurrentPath(null);
      setGameWon(false);
      setMoves(0);
      setLevel(levelToLoad);

      console.log(
        `🎯 Flow INIT FULL-COVER n=${gs} level=${levelToLoad} pairs=${
          Object.keys(eps).length
        }`
      );
    },
    [gridSizeForLevel, level]
  );

  // Win condition: every color path must be contiguous and, combined, they must fill the board (implicit with full-cover endpoints).
  useEffect(() => {
    const checkWin = () => {
      const required = Object.keys(endpoints).length;
      if (!required) return false;

      const seen = new Set();
      const isAdj = (a, b) => {
        const dr = Math.abs(a.row - b.row),
          dc = Math.abs(a.col - b.col);
        return (dr === 1 && dc === 0) || (dr === 0 && dc === 1);
      };

      for (const [color, eps] of Object.entries(endpoints)) {
        const p = paths[color];
        if (!p || p.length < 2) return false;

        const hasA = p.some(
          (c) => c.row === eps[0].row && c.col === eps[0].col
        );
        const hasB = p.some(
          (c) => c.row === eps[1].row && c.col === eps[1].col
        );
        if (!hasA || !hasB) return false;

        for (let i = 1; i < p.length; i++)
          if (!isAdj(p[i - 1], p[i])) return false;

        for (const cell of p) {
          const kk = `${cell.row},${cell.col}`;
          if (seen.has(kk)) return false;
          seen.add(kk);
        }
      }

      // To truly ensure full cover on user solution, require seen.size === n*n:
      // Users can connect endpoints with a shorter path than our segment, but since
      // we don't reveal solution cells, require full fill to accept win.
      return seen.size === gridSize * gridSize;
    };

    if (checkWin()) {
      setGameWon(true);
      if (gameId) {
        const score = Math.max(
          100,
          1000 - moves * 10 + level * 100 + gridSize * 50
        );
        gameTracker.endGame(gameId, score);
      }
    }
  }, [paths, endpoints, moves, level, gameId, gridSize]);

  // mount
  useEffect(() => {
    initializeGame(1);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const getCellContent = (row, col) => {
    for (const [color, eps] of Object.entries(endpoints)) {
      if (eps.some((ep) => ep.row === row && ep.col === col)) {
        return { type: "endpoint", color };
      }
    }
    for (const [color, path] of Object.entries(paths)) {
      if (path && path.some((p) => p.row === row && p.col === col)) {
        return { type: "path", color };
      }
    }
    if (
      currentPath &&
      currentPath.path.some((p) => p.row === row && p.col === col)
    ) {
      return { type: "path", color: currentPath.color };
    }
    return null;
  };

  const areAdjacent = (a, b) => {
    if (!a || !b) return false;
    const dr = Math.abs(a.row - b.row),
      dc = Math.abs(a.col - b.col);
    return (dr === 1 && dc === 0) || (dr === 0 && dc === 1);
  };

  const isEndpoint = (pos, color) => {
    const eps = endpoints[color];
    if (!eps || !pos) return false;
    return eps.some((ep) => ep.row === pos.row && ep.col === pos.col);
  };

  const handleCellTap = (row, col) => {
    const cellContent = getCellContent(row, col);
    const cell = { row, col };

    if (currentPath) {
      const last = currentPath.path[currentPath.path.length - 1];
      if (!areAdjacent(last, cell)) return;

      const idx = currentPath.path.findIndex(
        (p) => p.row === row && p.col === col
      );
      if (idx !== -1) {
        setCurrentPath((prev) => ({
          ...prev,
          path: prev.path.slice(0, idx + 1),
        }));
        return;
      }

      if (isEndpoint(cell, currentPath.color)) {
        const newPath = [...currentPath.path, cell];
        setPaths((prev) => ({ ...prev, [currentPath.color]: newPath }));
        setCurrentPath(null);
        setMoves((m) => m + 1);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        return;
      }

      if (cellContent && cellContent.color !== currentPath.color) {
        if (cellContent.type === "endpoint") return;
        const colorToDelete = cellContent.color;
        setPaths((prev) => {
          const np = { ...prev };
          delete np[colorToDelete];
          return np;
        });
      }

      setCurrentPath((prev) => ({ ...prev, path: [...prev.path, cell] }));
    } else {
      if (cellContent?.type === "endpoint") {
        const color = cellContent.color;
        if (paths[color]) {
          setPaths((prev) => {
            const np = { ...prev };
            delete np[color];
            return np;
          });
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          return;
        }
        setCurrentPath({ color, path: [cell] });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } else if (cellContent?.type === "path") {
        const color = cellContent.color;
        setPaths((prev) => {
          const np = { ...prev };
          delete np[color];
          return np;
        });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    }
  };

  const undoCurrentPath = () => {
    if (currentPath && currentPath.path.length > 1) {
      setCurrentPath((prev) => ({ ...prev, path: prev.path.slice(0, -1) }));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const resetGame = () => {
    setPaths({});
    setCurrentPath(null);
    setMoves(0);
    setGameWon(false);
    initializeGame(level); // generate a fresh full-cover layout for same level
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const nextLevel = () => {
    const newLevel = level + 1;
    setPaths({});
    setCurrentPath(null);
    setMoves(0);
    setGameWon(false);
    initializeGame(newLevel);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  /* ============================== UI ============================== */

  const BOARD_SIDE = gridSize * CELL_SIZE;

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <NightSkyBackground />
      {/* Header */}
      <View
        style={{
          paddingTop: insets.top + 16,
          paddingHorizontal: 20,
          marginBottom: 20,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <TouchableOpacity
            onPress={() => router.back()}
            style={{
              padding: 8,
              borderRadius: 12,
              backgroundColor: colors.glassSecondary,
            }}
          >
            <ArrowLeft size={24} color={colors.text} />
          </TouchableOpacity>

          <Text
            style={{ fontSize: 20, fontWeight: "bold", color: colors.text }}
          >
            Flow Connect
          </Text>

          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity
              onPress={undoCurrentPath}
              disabled={!currentPath || currentPath.path.length <= 1}
              style={{
                padding: 8,
                borderRadius: 12,
                backgroundColor: colors.glassSecondary,
                opacity: !currentPath || currentPath.path.length <= 1 ? 0.5 : 1,
              }}
            >
              <Undo size={24} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={resetGame}
              style={{
                padding: 8,
                borderRadius: 12,
                backgroundColor: colors.glassSecondary,
              }}
            >
              <RotateCcw size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Game stats */}
        <View style={{ borderRadius: 16, overflow: "hidden" }}>
          <BlurView
            intensity={isDark ? 60 : 80}
            tint={isDark ? "dark" : "light"}
            style={{
              backgroundColor: isDark
                ? "rgba(31, 41, 55, 0.7)"
                : "rgba(255, 255, 255, 0.7)",
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 16,
              padding: 16,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <View style={{ alignItems: "center" }}>
                <Text
                  style={{
                    fontSize: 12,
                    color: colors.textSecondary,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    marginBottom: 4,
                  }}
                >
                  Level
                </Text>
                <Text
                  style={{
                    fontSize: 20,
                    fontWeight: "bold",
                    color: colors.gameAccent2,
                  }}
                >
                  {level}
                </Text>
              </View>
              <View style={{ alignItems: "center" }}>
                <Text
                  style={{
                    fontSize: 12,
                    color: colors.textSecondary,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    marginBottom: 4,
                  }}
                >
                  Grid
                </Text>
                <Text
                  style={{
                    fontSize: 20,
                    fontWeight: "bold",
                    color: colors.text,
                  }}
                >
                  {gridSize}×{gridSize}
                </Text>
              </View>
              <View style={{ alignItems: "center" }}>
                <Text
                  style={{
                    fontSize: 12,
                    color: colors.textSecondary,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    marginBottom: 4,
                  }}
                >
                  Pairs
                </Text>
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "bold",
                    color: colors.gameAccent3,
                  }}
                >
                  {Object.keys(endpoints).length}
                </Text>
              </View>
              <View style={{ alignItems: "center" }}>
                <Text
                  style={{
                    fontSize: 12,
                    color: colors.textSecondary,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    marginBottom: 4,
                  }}
                >
                  Moves
                </Text>
                <Text
                  style={{
                    fontSize: 20,
                    fontWeight: "bold",
                    color: colors.text,
                  }}
                >
                  {moves}
                </Text>
              </View>
            </View>
          </BlurView>
        </View>
      </View>

      {/* Game Board */}
      <View
        style={{ flex: 1, justifyContent: "center", paddingHorizontal: 20 }}
      >
        <View
          style={{
            width: gridSize * CELL_SIZE,
            height: gridSize * CELL_SIZE,
            backgroundColor: isDark
              ? "rgba(31, 41, 55, 0.8)"
              : "rgba(255, 255, 255, 0.9)",
            borderRadius: 12,
            padding: 8,
            alignSelf: "center",
            marginBottom: 20,
          }}
        >
          {Array.from({ length: gridSize }, (_, rowIndex) => (
            <View key={rowIndex} style={{ flexDirection: "row", flex: 1 }}>
              {Array.from({ length: gridSize }, (_, colIndex) => {
                const content = getCellContent(rowIndex, colIndex);
                const isCurrentTip =
                  currentPath &&
                  currentPath.path.length > 0 &&
                  currentPath.path[currentPath.path.length - 1]?.row ===
                    rowIndex &&
                  currentPath.path[currentPath.path.length - 1]?.col ===
                    colIndex;

                return (
                  <TouchableOpacity
                    key={`${rowIndex}-${colIndex}`}
                    onPress={() => handleCellTap(rowIndex, colIndex)}
                    activeOpacity={0.7}
                    style={{
                      flex: 1,
                      backgroundColor: content
                        ? content.type === "endpoint"
                          ? content.color
                          : content.color + "90"
                        : isDark
                        ? "rgba(55, 65, 81, 0.3)"
                        : "rgba(243, 244, 246, 0.5)",
                      justifyContent: "center",
                      alignItems: "center",
                      margin: 2,
                      borderRadius:
                        content && content.type === "endpoint"
                          ? CELL_SIZE / 2
                          : 6,
                      borderWidth: isCurrentTip ? 3 : 0,
                      borderColor: currentPath?.color || "transparent",
                    }}
                  >
                    {content && content.type === "endpoint" && (
                      <View
                        style={{
                          width: CELL_SIZE * 0.3,
                          height: CELL_SIZE * 0.3,
                          backgroundColor: "#FFFFFF",
                          borderRadius: CELL_SIZE * 0.15,
                          shadowColor: "#000",
                          shadowOffset: { width: 0, height: 2 },
                          shadowOpacity: 0.3,
                          shadowRadius: 4,
                          elevation: 4,
                        }}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>

        <Text
          style={{
            fontSize: 14,
            color: colors.textSecondary,
            textAlign: "center",
            paddingHorizontal: 20,
            paddingBottom: insets.bottom + 20,
          }}
        >
          {currentPath
            ? "Tap adjacent cells to continue the line"
            : "Connect all color pairs. You must fill the entire board."}
        </Text>
      </View>

      {/* Win Modal */}
      {gameWon && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <View style={{ borderRadius: 20, overflow: "hidden", margin: 20 }}>
            <BlurView
              intensity={isDark ? 80 : 100}
              tint={isDark ? "dark" : "light"}
              style={{
                backgroundColor: isDark
                  ? "rgba(31, 41, 55, 0.9)"
                  : "rgba(255, 255, 255, 0.9)",
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 20,
                padding: 32,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  fontSize: 24,
                  fontWeight: "bold",
                  color: colors.text,
                  textAlign: "center",
                  marginBottom: 16,
                }}
              >
                🎉 Level Complete!
              </Text>
              <Text
                style={{
                  fontSize: 18,
                  color: colors.gameAccent2,
                  marginBottom: 8,
                }}
              >
                Level {level} solved in {moves} moves
              </Text>

              <View style={{ flexDirection: "row", gap: 12, marginTop: 20 }}>
                <TouchableOpacity
                  onPress={resetGame}
                  style={{
                    backgroundColor: colors.secondaryButton,
                    paddingHorizontal: 20,
                    paddingVertical: 12,
                    borderRadius: 12,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: colors.secondaryButtonText,
                    }}
                  >
                    Replay
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={nextLevel}
                  style={{
                    backgroundColor: colors.primaryButton,
                    paddingHorizontal: 20,
                    paddingVertical: 12,
                    borderRadius: 12,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: colors.primaryButtonText,
                    }}
                  >
                    Next Level
                  </Text>
                </TouchableOpacity>
              </View>
            </BlurView>
          </View>
        </View>
      )}
    </View>
  );
}