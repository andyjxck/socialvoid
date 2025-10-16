// src/app/(tabs)/games/fill-the-grid.jsx  (REPLACE ENTIRE FILE)
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TouchableOpacity, Dimensions, BackHandler, AppState, Modal, ScrollView } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { router } from "expo-router";
import { ArrowLeft, RotateCcw, Trophy } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import gameTracker from "../../../utils/gameTracking";
import { getGameId, GAME_TYPES } from "../../../utils/gameUtils";
import NightSkyBackground from "../../../components/NightSkyBackground";
import AchievementsSection from "../../../components/AchievementsSection";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";

const { width: screenWidth, height: screenHeight } = Dimensions.get("window");

// ---------- UI SIZING ----------
const FIELD_MARGIN_H = 20;
const BOARD_SIZE_PX = Math.min(340, Math.floor(screenHeight * 0.50)); // square board area

// ---------- GAME PALETTE ----------
const MASTER_COLORS = [
  "#EF4444", "#F59E0B", "#10B981", "#3B82F6",
  "#8B5CF6", "#EC4899", "#14B8A6", "#F97316",
  "#22D3EE", "#A3E635"
];

// ---- IMPORTANT: set this to your actual FILL THE GRID `games.id` if getGameId fails ----
const FALLBACK_GAME_ID = 25; // update if needed

// ---------- RNG (seeded; NEW seed every run) ----------
function xorshift32(seed) {
  let x = seed || 123456789;
  return () => {
    x ^= x << 13; x |= 0;
    x ^= x >>> 17; x |= 0;
    x ^= x << 5;  x |= 0;
    return ((x >>> 0) / 4294967296);
  };
}
function randomSeed() {
  const a = Math.floor(Math.random() * 0x7fffffff);
  const b = Date.now() & 0x7fffffff;
  let s = (a ^ (b << 1)) >>> 0;
  if (s === 0) s = 0x9e3779b9;
  return s;
}
function pickDistinct(rand, arr, n) {
  const pool = arr.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

// ---------- LEVEL CURVE ----------
function getLevelConfig(level) {
  const size = Math.min(8 + Math.floor((level - 1) / 2), 18);     // 8,8,9,9,10,10,...,18
  const numColors = Math.min(4 + Math.floor((level - 1) / 3), 8); // 4..8
  const shrinkingMargin = Math.max(0, 10 - Math.floor(level / 2));
  const moves = Math.round(size + numColors * 3 + shrinkingMargin);
  return { size, numColors, moves };
}

function buildBoard(level, seed) {
  const { size, numColors } = getLevelConfig(level);
  const rand = xorshift32(seed);
  const palette = pickDistinct(rand, MASTER_COLORS, numColors);
  const board = [];
  for (let r = 0; r < size; r++) {
    const row = [];
    for (let c = 0; c < size; c++) {
      row.push(palette[Math.floor(rand() * palette.length)]);
    }
    board.push(row);
  }
  return { board, palette };
}

// ---------- FLOOD FILL ----------
function boardsAllSame(board) {
  const first = board[0][0];
  const N = board.length;
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (board[r][c] !== first) return false;
    }
  }
  return true;
}
function floodFill(board, toColor) {
  const N = board.length;
  const fromColor = board[0][0];
  if (fromColor === toColor) return board; // no-op

  const next = board.map(row => row.slice());
  const stack = [[0, 0]];
  const seen = new Set(["0,0"]);

  while (stack.length) {
    const [r, c] = stack.pop();
    next[r][c] = toColor;
    const nbrs = [
      [r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1],
    ];
    for (const [nr, nc] of nbrs) {
      if (nr >= 0 && nr < N && nc >= 0 && nc < N) {
        const key = `${nr},${nc}`;
        if (!seen.has(key) && board[nr][nc] === fromColor) {
          seen.add(key);
          stack.push([nr, nc]);
        }
      }
    }
  }
  return next;
}

// ---------- COMPONENT ----------
export default function FillTheGrid() {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // ---- session / lifecycle ----
  const sessionOpenRef = useRef(false);
  const gameIdRef = useRef(null);
  const appStateRef = useRef(AppState.currentState);
  const retryTimerRef = useRef(null);

  const [currentPlayerId, setCurrentPlayerId] = useState(null);

  // ---- level + board state ----
  const [level, setLevel] = useState(1);
  const [seed, setSeed] = useState(() => randomSeed()); // New random seed each run
  const [board, setBoard] = useState(() => buildBoard(level, seed).board);
  const [palette, setPalette] = useState(() => buildBoard(level, seed).palette);
  const [movesLeft, setMovesLeft] = useState(() => getLevelConfig(level).moves);
  const [status, setStatus] = useState("playing"); // "playing" | "won" | "lost"

  // Achievements UI
  const [showAchievements, setShowAchievements] = useState(false);

  // Load player id once
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem("puzzle_hub_player_id");
        setCurrentPlayerId(saved ? parseInt(saved) : 1);
      } catch {
        setCurrentPlayerId(1);
      }
    })();
  }, []);

  // Build when level or seed changes
  useEffect(() => {
    const { board: b, palette: p } = buildBoard(level, seed);
    setBoard(b);
    setPalette(p);
    setMovesLeft(getLevelConfig(level).moves);
    setStatus("playing");
  }, [level, seed]);

  // Win/Lose checks
  useEffect(() => {
    if (status !== "playing") return;
    if (boardsAllSame(board)) {
      setStatus("won");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } else if (movesLeft <= 0) {
      if (!boardsAllSame(board)) {
        setStatus("lost");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      }
    }
  }, [board, movesLeft, status]);

  // ---------- OPEN/CLOSE TRACKED SESSION ----------
  const openTrackedSession = useCallback(
    async (attempt = 1) => {
      if (sessionOpenRef.current) return;
      if (!currentPlayerId || !isFocused) return;
      try {
        let gid = null;
        if (typeof getGameId === "function") {
          try { gid = await getGameId(GAME_TYPES?.FILLTHEGRID ?? "FILLTHEGRID"); } catch {}
          if (!gid) { try { gid = await getGameId("fillthegrid"); } catch {} }
          if (!gid) { try { gid = await getGameId("Fill The Grid"); } catch {} }
        }
        if (!gid) gid = FALLBACK_GAME_ID;
        gameIdRef.current = gid;
        await gameTracker.startGame(gid, currentPlayerId); // tracks playtime
        sessionOpenRef.current = true;
      } catch {
        if (attempt < 5 && isFocused) {
          clearTimeout(retryTimerRef.current);
          retryTimerRef.current = setTimeout(() => openTrackedSession(attempt + 1), 400 * attempt);
        }
      }
    },
    [currentPlayerId, isFocused]
  );

  const endNowWithStats = useCallback(async (finalStatus) => {
    if (!sessionOpenRef.current || !gameIdRef.current) return;

    const { size, numColors, moves } = getLevelConfig(level);
    const movesUsed = Math.max(0, moves - movesLeft);
    const duration = gameTracker.getCurrentDuration(gameIdRef.current);

    const gameData = {
      level_reached: level,
      grid_size: size,
      num_colors: numColors,
      moves_left: movesLeft,
      moves_used: movesUsed,
      player_won: finalStatus === "won",
      elapsed_seconds: duration,
    };

    // For this puzzle, use "score" as highest level reached this session
    const score = finalStatus === "won" ? level : 0;

    try {
      await gameTracker.endGame(gameIdRef.current, score, gameData);
    } catch {}
    sessionOpenRef.current = false;
  }, [level, movesLeft]);

  const closeTrackedSession = useCallback(async () => {
    clearTimeout(retryTimerRef.current);
    if (!sessionOpenRef.current) return;
    try {
      // If still "playing", submit a neutral session
      await gameTracker.endGame(gameIdRef.current, 0, {
        level_reached: level,
        player_won: false,
        elapsed_seconds: gameTracker.getCurrentDuration(gameIdRef.current),
        cancelled: true,
      });
    } catch {} finally {
      sessionOpenRef.current = false;
      gameIdRef.current = null;
    }
  }, [level]);

  // End immediately on win/loss so achievements unlock right away
  useEffect(() => {
    if (!sessionOpenRef.current) return;
    if (status === "won" || status === "lost") {
      endNowWithStats(status);
    }
  }, [status, endNowWithStats]);

  // Focus/background handling
  useEffect(() => {
    if (isFocused && currentPlayerId) {
      openTrackedSession();
    } else {
      closeTrackedSession();
    }
  }, [isFocused, currentPlayerId, openTrackedSession, closeTrackedSession]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", async (state) => {
      const prev = appStateRef.current;
      appStateRef.current = state;
      if ((state === "inactive" || state === "background") && sessionOpenRef.current) {
        await closeTrackedSession();
      }
      if (state === "active" && isFocused && currentPlayerId && !sessionOpenRef.current) {
        await openTrackedSession();
      }
    });
    return () => sub.remove();
  }, [isFocused, currentPlayerId, openTrackedSession, closeTrackedSession]);

  // Back: end session + leave
  useFocusEffect(
    useCallback(() => {
      const back = BackHandler.addEventListener("hardwareBackPress", () => {
        closeTrackedSession();
        router.back();
        return true;
      });
      return () => back.remove();
    }, [closeTrackedSession])
  );

  // ---- actions ----
  const onPickColor = (color) => {
    if (status !== "playing") return;
    const current = board[0][0];
    if (color === current) return; // no move spent
    const next = floodFill(board, color);
    if (next !== board) {
      setBoard(next);
      setMovesLeft((m) => m - 1);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  };

  const restartCurrentLevel = async () => {
    // If a run is still open and not ended by win/loss, close it cleanly
    if (sessionOpenRef.current) {
      await closeTrackedSession();
    }
    setSeed(randomSeed());
    // Start a fresh tracked run
    setTimeout(() => openTrackedSession(), 0);
  };

  const nextLevel = async () => {
    if (sessionOpenRef.current) {
      await closeTrackedSession();
    }
    setLevel((lv) => lv + 1);
    setSeed(randomSeed());
    setTimeout(() => openTrackedSession(), 0);
  };

  const prevLevel = async () => {
    if (sessionOpenRef.current) {
      await closeTrackedSession();
    }
    setLevel((lv) => Math.max(1, lv - 1));
    setSeed(randomSeed());
    setTimeout(() => openTrackedSession(), 0);
  };

  const onPressBack = async () => {
    await closeTrackedSession();
    router.back();
  };

  // ---- render helpers ----
  const { size } = getLevelConfig(level);
  const tileSize = Math.floor(BOARD_SIZE_PX / size);
  const boardWidth = tileSize * size;
  const boardHeight = boardWidth;

  if (!fontsLoaded) return null;

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="light" />
      <NightSkyBackground />

      {/* Header */}
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, marginBottom: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <TouchableOpacity
            onPress={onPressBack}
            style={{ padding: 8, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.08)" }}
          >
            <ArrowLeft size={24} color="#fff" />
          </TouchableOpacity>

          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 20, color: "#fff" }}>Fill The Grid</Text>

          <View style={{ flexDirection: "row", gap: 8 }}>
            {/* Achievements button */}
            <TouchableOpacity
              onPress={() => { setShowAchievements(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); }}
              style={{ padding: 8, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.08)", marginRight: 8 }}
            >
              <Trophy size={22} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={restartCurrentLevel}
              style={{ padding: 8, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.08)" }}
            >
              <RotateCcw size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Info / Level / Moves */}
        <BlurView
          intensity={80}
          tint="dark"
          style={{
            backgroundColor: "rgba(0,0,0,0.35)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.12)",
            borderRadius: 16,
            padding: 14,
          }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: "rgba(255,255,255,0.85)" }}>
                Turn the entire grid into <Text style={{ fontFamily: "Inter_700Bold" }}>one color</Text>. Change the{" "}
                <Text style={{ fontFamily: "Inter_700Bold" }}>top-left</Text> region to spread.
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: "rgba(255,255,255,0.8)", marginBottom: 2 }}>
                Level
              </Text>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 20, color: "#A5B4FC" }}>{level}</Text>
            </View>
          </View>

          <View style={{ height: 8 }} />

          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#E5E7EB" }}>
              Grid: {size}×{size}
            </Text>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: movesLeft > 4 ? "#9AE6B4" : "#FCA5A5" }}>
              Moves Left: {movesLeft}
            </Text>
          </View>
        </BlurView>
      </View>

      {/* Game Board */}
      <View style={{ flex: 1, paddingHorizontal: FIELD_MARGIN_H, paddingBottom: insets.bottom + 24 }}>
        <View
          style={{
            alignSelf: "center",
            width: boardWidth,
            height: boardHeight,
            borderRadius: 16,
            overflow: "hidden",
            backgroundColor: "rgba(255,255,255,0.06)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.12)",
          }}
        >
          {board.map((row, r) => (
            <View key={`r-${r}`} style={{ flexDirection: "row" }}>
              {row.map((color, c) => (
                <View
                  key={`c-${c}`}
                  style={{ width: tileSize, height: tileSize, backgroundColor: color }}
                />
              ))}
            </View>
          ))}
        </View>

        {/* Palette */}
        <View style={{ height: 12 }} />
        <BlurView
          intensity={80}
          tint="dark"
          style={{
            backgroundColor: "rgba(0,0,0,0.35)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.12)",
            borderRadius: 16,
            padding: 10,
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          {palette.map((c) => (
            <TouchableOpacity
              key={c}
              onPress={() => onPickColor(c)}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: c,
                borderWidth: 2,
                borderColor: "rgba(255,255,255,0.6)",
              }}
            />
          ))}
        </BlurView>

        {/* Win/Lose controls */}
        {status !== "playing" && (
          <View style={{ marginTop: 14, flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
            {status === "won" ? (
              <>
                <TouchableOpacity
                  onPress={restartCurrentLevel}
                  style={{
                    flex: 1,
                    backgroundColor: "rgba(255,255,255,0.12)",
                    paddingVertical: 14,
                    borderRadius: 12,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#fff" }}>New Layout</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={nextLevel}
                  style={{
                    flex: 1,
                    backgroundColor: "#6366F1",
                    paddingVertical: 14,
                    borderRadius: 12,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: "#fff" }}>Next Level</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  onPress={restartCurrentLevel}
                  style={{
                    flex: 1,
                    backgroundColor: "#EF4444",
                    paddingVertical: 14,
                    borderRadius: 12,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: "#190202" }}>Retry (New)</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={onPressBack}
                  style={{
                    flex: 1,
                    backgroundColor: "rgba(255,255,255,0.12)",
                    paddingVertical: 14,
                    borderRadius: 12,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#fff" }}>Back to Hub</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* Level nav (optional for testing) */}
        <View style={{ marginTop: 10, flexDirection: "row", justifyContent: "space-between" }}>
          <TouchableOpacity
            onPress={prevLevel}
            style={{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.08)" }}
          >
            <Text style={{ fontFamily: "Inter_600SemiBold", color: "#fff" }}>Prev</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={nextLevel}
            style={{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.08)" }}
          >
            <Text style={{ fontFamily: "Inter_600SemiBold", color: "#fff" }}>Next</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Achievements Modal */}
      <Modal
        visible={showAchievements}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAchievements(false)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)" }}>
          <View style={{ marginTop: insets.top + 12, marginBottom: insets.bottom + 12, flex: 1, paddingHorizontal: 16 }}>
            <BlurView
              intensity={90}
              tint="dark"
              style={{
                flex: 1,
                borderRadius: 16,
                overflow: "hidden",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
                backgroundColor: "rgba(0,0,0,0.75)",
              }}
            >
              {/* Header row */}
              <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.12)", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: "#fff" }}>
                  Fill The Grid · Achievements
                </Text>
                <TouchableOpacity onPress={() => setShowAchievements(false)} hitSlop={10}>
                  <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: "rgba(255,255,255,0.7)" }}>
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
                    autoRefreshMs={12000}
                    showSearchBar={true}
                    showFilters={true}
                  />
                ) : (
                  <View style={{ padding: 16 }}>
                    <Text style={{ color: "rgba(255,255,255,0.75)", fontFamily: "Inter_500Medium", textAlign: "center" }}>
                      Loading achievements…
                    </Text>
                  </View>
                )}
              </ScrollView>
            </BlurView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
