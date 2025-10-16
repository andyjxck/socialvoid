// src/app/(tabs)/games/flow-connect.jsx   ← rename if your route differs
import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, Text, TouchableOpacity, Dimensions, Modal, ScrollView } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { ArrowLeft, RotateCcw, Undo, Trophy } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "../../../utils/theme";
import gameTracker from "../../../utils/gameTracking";
import { getGameId, GAME_TYPES } from "../../../utils/gameUtils";
import NightSkyBackground from "../../../components/NightSkyBackground";
import AchievementsSection from "../../../components/AchievementsSection";

/* =========================================================================
   FULL-COVER GENERATOR (embedded) — unchanged logic
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

// tiny seeded RNG
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
const shuffle = (rng, arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const buildSnakePath = (n) => {
  const path = [];
  for (let r = 0; r < n; r++) {
    if (r % 2 === 0) {
      for (let c = 0; c < n; c++) path.push({ row: r, col: c });
    } else {
      for (let c = n - 1; c >= 0; c--) path.push({ row: r, col: c });
    }
  }
  return path;
};
const spiceSnake = (rng, snake, n) => {
  let s = snake.slice();
  if (rng() < 0.5) s.reverse();
  if (rng() < 0.5) s = s.map((p) => ({ row: p.col, col: n - 1 - p.row }));
  return s;
};
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
  return shuffle(rng, base);
};
const chooseNumPairs = (n, level) => {
  const minPairs = Math.max(3, Math.floor(n / 2));
  const maxPairs = Math.min(8, Math.floor((n * n) / 3));
  const scaled = minPairs + Math.floor(Math.min(level, n * 2) / 2);
  return Math.max(minPairs, Math.min(maxPairs, scaled));
};
const generateFullCoverFlow = (gridSize = 5, level = 1) => {
  const n = gridSize;
  const salt = Math.floor(Math.random() * 1e9);
  const rng = seeded(`flow-fullcover|n=${n}|level=${level}|salt=${salt}`);
  const base = buildSnakePath(n);
  const snake = spiceSnake(rng, base, n);
  const pairs = chooseNumPairs(n, level);
  const minLen = Math.max(3, Math.floor(n * 0.7));
  const lens =
    splitIntoSegments(rng, n * n, pairs, minLen) ||
    Array(pairs).fill(Math.floor((n * n) / pairs));
  let idx = 0;
  const endpoints = {};
  const colors = shuffle(rng, COLORS).slice(0, pairs);
  for (let i = 0; i < pairs; i++) {
    const len = lens[i];
    const segment = snake.slice(idx, idx + len);
    idx += len;
    if (!segment.length) continue;
    const start = segment[0];
    const end = segment[segment.length - 1];
    const color = colors[i];
    endpoints[color] = [start, end];
  }
  return { endpoints };
};

/* =========================================================================
   SCREEN
   ========================================================================= */

const { width: screenWidth } = Dimensions.get("window");
const LEVEL_KEY = "flow_connect_level";

export default function FlowConnectGame() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  // Achievements modal
  const [showAchievements, setShowAchievements] = useState(false);

  // Grid scales with level: 5→6→7 (cap 7 for phones)
  const gridSizeForLevel = useCallback(
    (lvl) => Math.min(7, 5 + Math.floor((lvl - 1) / 3)),
    []
  );

  const [gridSize, setGridSize] = useState(gridSizeForLevel(1));
  const CELL_SIZE = (screenWidth - 80) / gridSize;

  const [currentPlayerId, setCurrentPlayerId] = useState(null);
  const [gameId, setGameId] = useState(null);
  const gameIdRef = useRef(null);

  const [level, setLevel] = useState(1);
  const [moves, setMoves] = useState(0);
  const [endpoints, setEndpoints] = useState({});
  const [paths, setPaths] = useState({});
  const [currentPath, setCurrentPath] = useState(null);
  const [gameWon, setGameWon] = useState(false);

  // live signal helpers (for nice AchievementsSection progress)
  const pairsConnectedRef = useRef(0);
  const startTimeRef = useRef(Date.now());

  // guard so we only submit once
  const submittedRef = useRef(false);

  // Load player ID
  useEffect(() => {
    const loadPlayerId = async () => {
      try {
        const savedPlayerId = await AsyncStorage.getItem("puzzle_hub_player_id");
        setCurrentPlayerId(savedPlayerId ? parseInt(savedPlayerId, 10) : 1);
      } catch {
        setCurrentPlayerId(1);
      }
    };
    loadPlayerId();
  }, []);

  // Save level when it changes
  useEffect(() => {
    AsyncStorage.setItem(LEVEL_KEY, String(level)).catch(() => {});
  }, [level]);

  // Start/cancel session on focus/blur
  useFocusEffect(
    useCallback(() => {
      let active = true;

      const start = async () => {
        if (!currentPlayerId) return;
        try {
          const id = await getGameId(GAME_TYPES.FLOW_CONNECT);
          if (!active) return;
          setGameId(id);
          gameIdRef.current = id;
          submittedRef.current = false;
          pairsConnectedRef.current = 0;
          startTimeRef.current = Date.now();
          await gameTracker.startGame(id, currentPlayerId);
          pushSignals(); // initial zeroed snapshot
        } catch (e) {
          console.warn("startGame failed:", e);
        }
      };

      start();

      // On blur/unmount: close if not submitted
      return () => {
        active = false;
        const gid = gameIdRef.current;
        if (gid && !submittedRef.current) {
          try {
            pushSignals();
            gameTracker.endGame(gid, 0, { cancelled: true, reason: "blur" });
          } catch {}
        }
      };
    }, [currentPlayerId])
  );

  const initializeGame = useCallback(
    async (levelToLoad) => {
      const lv = levelToLoad ?? level;
      const gs = gridSizeForLevel(lv);
      setLevel(lv);
      setGridSize(gs);

      const { endpoints: eps } = generateFullCoverFlow(gs, lv);
      setEndpoints(eps);
      setPaths({});
      setCurrentPath(null);
      setGameWon(false);
      setMoves(0);
      pairsConnectedRef.current = 0;
      startTimeRef.current = Date.now();
      submittedRef.current = false;

      console.log(
        `🎯 Flow INIT FULL-COVER n=${gs} level=${lv} pairs=${Object.keys(eps).length}`
      );
      pushSignals({ endpoints: eps, gridSize: gs, level: lv });
    },
    [gridSizeForLevel, level]
  );

  // Load saved level, then init board for that level
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const savedLvl = await AsyncStorage.getItem(LEVEL_KEY);
        const startLevel = Math.max(1, parseInt(savedLvl || "1", 10) || 1);
        if (!mounted) return;
        await initializeGame(startLevel);
      } catch {
        await initializeGame(1);
      }
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------- live signals -> AchievementsSection / tracking ----------------
  const pushSignals = useCallback(
    (extra = {}) => {
      if (!gameIdRef.current) return;
      const pairsTotal = Object.keys(endpoints || {}).length || 0;
      const pairsConnected = Object.values(paths || {}).reduce((acc, p) => {
        // count only completed pairs that include both endpoints
        if (!p || p.length < 2) return acc;
        const color = Object.entries(endpoints || {}).find(([, eps]) => {
          const hasA = p.some((c) => c.row === eps[0].row && c.col === eps[0].col);
          const hasB = p.some((c) => c.row === eps[1].row && c.col === eps[1].col);
          return hasA && hasB;
        });
        return acc + (color ? 1 : 0);
      }, 0);
      pairsConnectedRef.current = pairsConnected;

      gameTracker.updateGameData(gameIdRef.current, {
        level,
        grid_size: gridSize,
        moves,
        pairs_total: pairsTotal,
        pairs_connected: pairsConnected,
        elapsed_seconds: Math.floor((Date.now() - startTimeRef.current) / 1000),
        ...extra,
      });
    },
    [endpoints, paths, level, gridSize, moves]
  );

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
    if (currentPath && currentPath.path.some((p) => p.row === row && p.col === col)) {
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

      const idx = currentPath.path.findIndex((p) => p.row === row && p.col === col);
      if (idx !== -1) {
        setCurrentPath((prev) => ({ ...prev, path: prev.path.slice(0, idx + 1) }));
        pushSignals();
        return;
      }

      if (isEndpoint(cell, currentPath.color)) {
        const newPath = [...currentPath.path, cell];
        setPaths((prev) => ({ ...prev, [currentPath.color]: newPath }));
        setCurrentPath(null);
        setMoves((m) => m + 1);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        pushSignals();
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
      pushSignals();
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
          pushSignals();
          return;
        }
        setCurrentPath({ color, path: [cell] });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        pushSignals();
      } else if (cellContent?.type === "path") {
        const color = cellContent.color;
        setPaths((prev) => {
          const np = { ...prev };
          delete np[color];
          return np;
        });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        pushSignals();
      }
    }
  };

  const undoCurrentPath = () => {
    if (currentPath && currentPath.path.length > 1) {
      setCurrentPath((prev) => ({ ...prev, path: prev.path.slice(0, -1) }));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      pushSignals();
    }
  };

  const resetGame = () => {
    setPaths({});
    setCurrentPath(null);
    setMoves(0);
    setGameWon(false);
    initializeGame(level);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    pushSignals();
  };

  const nextLevel = () => {
    const newLevel = level + 1;
    setPaths({});
    setCurrentPath(null);
    setMoves(0);
    setGameWon(false);
    initializeGame(newLevel);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // pushSignals() will be called inside initializeGame
  };

  // Win condition checker + submit exactly once
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

        const hasA = p.some((c) => c.row === eps[0].row && c.col === eps[0].col);
        const hasB = p.some((c) => c.row === eps[1].row && c.col === eps[1].col);
        if (!hasA || !hasB) return false;

        for (let i = 1; i < p.length; i++) if (!isAdj(p[i - 1], p[i])) return false;

        for (const cell of p) {
          const kk = `${cell.row},${cell.col}`;
          if (seen.has(kk)) return false;
          seen.add(kk);
        }
      }

      return seen.size === gridSize * gridSize;
    };

    if (checkWin()) {
      if (!gameWon) setGameWon(true);
      pushSignals();
      if (gameIdRef.current && !submittedRef.current) {
        submittedRef.current = true;
        const score = Math.max(100, 1000 - moves * 10 + level * 100 + gridSize * 50);
        // Submit; gameTracker will update stats and run achievements
        gameTracker.endGame(gameIdRef.current, score, {
          level,
          gridSize,
          moves,
          result: "win",
        });
      }
    }
  }, [paths, endpoints, moves, level, gridSize, gameWon, pushSignals]);

  /* ============================== UI ============================== */

  const BOARD_SIDE = gridSize * CELL_SIZE;

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <NightSkyBackground />

      {/* Header */}
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 14,
          }}
        >
          <TouchableOpacity
            onPress={() => {
              const gid = gameIdRef.current;
              if (gid && !submittedRef.current) {
                try {
                  pushSignals();
                  gameTracker.endGame(gid, 0, { cancelled: true, reason: "back" });
                } catch {}
              }
              router.back();
            }}
            style={{
              padding: 8,
              borderRadius: 12,
              backgroundColor: colors.glassSecondary,
            }}
          >
            <ArrowLeft size={24} color={colors.text} />
          </TouchableOpacity>

          <Text style={{ fontSize: 20, fontWeight: "bold", color: colors.text }}>
            Color Flow
          </Text>

          <View style={{ flexDirection: "row", gap: 8 }}>
            {/* Achievements */}
            <TouchableOpacity
              onPress={() => {
                setShowAchievements(true);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              }}
              style={{ padding: 8, borderRadius: 12, backgroundColor: colors.glassSecondary }}
            >
              <Trophy size={22} color={colors.text} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={undoCurrentPath}
              disabled={!currentPath || currentPath.path.length <= 1}
              style={{
                padding: 8,
                borderRadius: 12,
                backgroundColor: colors.glassSecondary,
                opacity: !currentPath || currentPath.path.length <= 1 ? 0.4 : 1,
              }}
            >
              <Undo size={22} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={resetGame}
              style={{
                padding: 8,
                borderRadius: 12,
                backgroundColor: colors.glassSecondary,
              }}
            >
              <RotateCcw size={22} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Stats */}
        <BlurView
          intensity={70}
          tint={isDark ? "dark" : "light"}
          style={{
            borderRadius: 18,
            padding: 14,
            borderWidth: 1,
            borderColor: colors.border,
            marginBottom: 20,
          }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-around" }}>
            {[
              ["Level", level, colors.gameAccent2],
              ["Grid", `${gridSize}×${gridSize}`, colors.text],
              ["Pairs", Object.keys(endpoints).length, colors.gameAccent3],
              ["Moves", moves, colors.text],
            ].map(([label, value, color]) => (
              <View key={label} style={{ alignItems: "center" }}>
                <Text
                  style={{
                    fontSize: 12,
                    color: colors.textSecondary,
                    textTransform: "uppercase",
                  }}
                >
                  {label}
                </Text>
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: "bold",
                    color,
                    marginTop: 2,
                  }}
                >
                  {value}
                </Text>
              </View>
            ))}
          </View>
        </BlurView>
      </View>

      {/* Board */}
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <BlurView
          intensity={70}
          tint={isDark ? "dark" : "light"}
          style={{
            width: BOARD_SIDE + 20,
            height: BOARD_SIDE + 20,
            borderRadius: 24,
            overflow: "hidden",
            justifyContent: "center",
            alignItems: "center",
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          {Array.from({ length: gridSize }, (_, r) => (
            <View key={r} style={{ flexDirection: "row" }}>
              {Array.from({ length: gridSize }, (_, c) => {
                const content = getCellContent(r, c);
                const isCurrentTip =
                  currentPath &&
                  currentPath.path.length > 0 &&
                  currentPath.path[currentPath.path.length - 1]?.row === r &&
                  currentPath.path[currentPath.path.length - 1]?.col === c;

                const color = content?.color || colors.glassPrimary;
                const isEndpointCell = content?.type === "endpoint";
                return (
                  <TouchableOpacity
                    key={`${r}-${c}`}
                    onPress={() => handleCellTap(r, c)}
                    activeOpacity={0.8}
                    style={{
                      width: CELL_SIZE,
                      height: CELL_SIZE,
                      margin: 2,
                      borderRadius: isEndpointCell ? CELL_SIZE / 2 : 10,
                      overflow: "hidden",
                      borderWidth: isCurrentTip ? 2.5 : 0,
                      borderColor: isCurrentTip ? color : "transparent",
                      justifyContent: "center",
                      alignItems: "center",
                      backgroundColor: isEndpointCell
                        ? color
                        : content
                        ? color + "99"
                        : "rgba(255,255,255,0.05)",
                      shadowColor: color,
                      shadowOpacity: 0.4,
                      shadowRadius: isEndpointCell ? 6 : 2,
                      shadowOffset: { width: 0, height: 0 },
                      elevation: isEndpointCell ? 3 : 1,
                    }}
                  >
                    {isEndpointCell && (
                      <LinearGradient
                        colors={[color, "#ffffff80"]}
                        style={{
                          width: CELL_SIZE * 0.35,
                          height: CELL_SIZE * 0.35,
                          borderRadius: CELL_SIZE * 0.18,
                        }}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </BlurView>

        <Text
          style={{
            textAlign: "center",
            color: colors.textSecondary,
            fontSize: 14,
            marginTop: 20,
            paddingHorizontal: 30,
          }}
        >
          {currentPath
            ? "Draw lines between matching dots"
            : "Connect all pairs — fill every cell!"}
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
            backgroundColor: "rgba(0,0,0,0.65)",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <BlurView
            intensity={90}
            tint={isDark ? "dark" : "light"}
            style={{
              borderRadius: 24,
              padding: 30,
              alignItems: "center",
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text
              style={{
                fontSize: 24,
                fontWeight: "bold",
                color: colors.text,
                marginBottom: 8,
              }}
            >
              🎉 Level Complete
            </Text>
            <Text
              style={{
                fontSize: 16,
                color: colors.textSecondary,
                marginBottom: 20,
              }}
            >
              Solved in {moves} moves
            </Text>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity
                onPress={() => {
                  setGameWon(false);
                  resetGame();
                }}
                style={{
                  backgroundColor: colors.secondaryButton,
                  paddingHorizontal: 20,
                  paddingVertical: 10,
                  borderRadius: 12,
                }}
              >
                <Text
                  style={{
                    color: colors.secondaryButtonText,
                    fontWeight: "600",
                    fontSize: 14,
                  }}
                >
                  Replay
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setGameWon(false);
                  nextLevel();
                }}
                style={{
                  backgroundColor: colors.primaryButton,
                  paddingHorizontal: 20,
                  paddingVertical: 10,
                  borderRadius: 12,
                }}
              >
                <Text
                  style={{
                    color: colors.primaryButtonText,
                    fontWeight: "600",
                    fontSize: 14,
                  }}
                >
                  Next Level
                </Text>
              </TouchableOpacity>
            </View>
          </BlurView>
        </View>
      )}

      {/* Achievements Modal */}
      <Modal
        visible={showAchievements}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAchievements(false)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)" }}>
          <View
            style={{
              marginTop: insets.top + 12,
              marginBottom: insets.bottom + 12,
              flex: 1,
              paddingHorizontal: 16,
            }}
          >
            <BlurView
              intensity={isDark ? 70 : 90}
              tint={isDark ? "dark" : "light"}
              style={{
                flex: 1,
                borderRadius: 16,
                overflow: "hidden",
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: isDark
                  ? "rgba(31,41,55,0.8)"
                  : "rgba(255,255,255,0.85)",
              }}
            >
              {/* Header row */}
              <View
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Text
                  style={{
                    fontWeight: "700",
                    fontSize: 16,
                    color: colors.text,
                  }}
                >
                  Color Flow Achievements
                </Text>
                <TouchableOpacity
                  onPress={() => setShowAchievements(false)}
                  hitSlop={10}
                >
                  <Text
                    style={{
                      fontWeight: "600",
                      fontSize: 14,
                      color: colors.textSecondary,
                    }}
                  >
                    Close
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Content */}
              <ScrollView contentContainerStyle={{ paddingBottom: 16 }}>
                {currentPlayerId && gameIdRef.current ? (
                  <AchievementsSection
                    playerId={currentPlayerId}
                    gameId={gameIdRef.current}
                    autoRefreshMs={15000}
                    showSearchBar
                    showFilters
                  />
                ) : (
                  <View style={{ padding: 16 }}>
                    <Text
                      style={{
                        color: colors.textSecondary,
                        textAlign: "center",
                        fontWeight: "500",
                      }}
                    >
                      Loading achievements…
                    </Text>
                  </View>
                )}
              </ScrollView>
            </BlurView>
          </View>
        </View>
      </Modal>

      <View style={{ height: insets.bottom + 16 }} />
    </View>
  );
}
