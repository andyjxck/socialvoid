// src/app/(tabs)/games/sudoku.jsx  (REPLACE ENTIRE FILE)
import React, { useState, useEffect, useCallback, useMemo, memo, useRef } from "react";
import { View, Text, TouchableOpacity, Dimensions, Modal, ScrollView } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../../utils/theme";
import { BlurView } from "expo-blur";
import { router } from "expo-router";
import { ArrowLeft, RotateCcw, Trophy, Eraser } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useIsFocused } from "@react-navigation/native";

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

const { width: screenWidth } = Dimensions.get("window");

// Single generic difficulty (Medium)
const DIFFICULTY = { key: "medium", cellsToRemove: 47, name: "Medium" };
const bestTimeKey = "sudoku_best_time_medium";

/* ---------- Memoized Cell ---------- */
const SudokuCell = memo(function SudokuCell({
  rowIndex,
  colIndex,
  value,
  locked,
  selected,
  CELL_SIZE,
  colors,
  onPress,
  getCellBackground,
}) {
  const bg = getCellBackground(rowIndex, colIndex);
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        width: CELL_SIZE,
        height: CELL_SIZE,
        backgroundColor: bg,
        justifyContent: "center",
        alignItems: "center",
        borderRightWidth: (colIndex + 1) % 3 === 0 && colIndex !== 8 ? 2 : 0.5,
        borderRightColor: (colIndex + 1) % 3 === 0 && colIndex !== 8 ? colors.border : colors.overlay,
        borderBottomWidth: 0.5,
        borderBottomColor: colors.overlay,
        shadowOpacity: selected ? 0.15 : 0,
      }}
    >
      {value !== 0 ? (
        <Text
          style={{
            fontFamily: "Inter_700Bold",
            fontSize: 16,
            color: locked ? colors.text : "#87CEEB",
          }}
        >
          {value}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}, (a, b) =>
  a.value === b.value &&
  a.locked === b.locked &&
  a.selected === b.selected &&
  a.CELL_SIZE === b.CELL_SIZE &&
  a.colors.text === b.colors.text &&
  a.colors.border === b.colors.border &&
  a.colors.overlay === b.colors.overlay
);

export default function SudokuGame() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const isFocused = useIsFocused();

  const [fontsLoaded] = useFonts({
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
  });

  // IDs / tracking
  const [currentPlayerId, setCurrentPlayerId] = useState(null);
  const [gameId, setGameId] = useState(null);
  const gameIdRef = useRef(null);

  // Achievements UI
  const [showAchievements, setShowAchievements] = useState(false);

  // Run guards
  const activeRef = useRef(false);
  const submittedRef = useRef(false);

  // Game state
  const [puzzle, setPuzzle] = useState([]);
  const [solution, setSolution] = useState([]);
  const [originalPuzzle, setOriginalPuzzle] = useState([]);
  const [selectedCell, setSelectedCell] = useState(null);
  const [timer, setTimer] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameWon, setGameWon] = useState(false);

  // best time (only one difficulty)
  const [bestTime, setBestTime] = useState(null);

  // track score/time safely on blur/unmount
  const timeRef = useRef(0);
  useEffect(() => { timeRef.current = timer; }, [timer]);

  // One-time: load player id and resolve game id
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const saved = await AsyncStorage.getItem("puzzle_hub_player_id");
        const pid = saved ? parseInt(saved, 10) : 1;
        if (!alive) return;
        setCurrentPlayerId(Number.isFinite(pid) ? pid : 1);

        const id = await getGameId(GAME_TYPES.SUDOKU);
        if (!alive) return;
        setGameId(id);
        gameIdRef.current = id;
      } catch {}
    })();
    return () => { alive = false; };
  }, []);

  // Load best time once
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(bestTimeKey);
        setBestTime(saved ? parseInt(saved, 10) : null);
      } catch { setBestTime(null); }
    })();
  }, []);

  // Focus/Blur lifecycle
  useEffect(() => {
    if (!gameId || !currentPlayerId) return;

    if (isFocused) {
      if (!activeRef.current) {
        activeRef.current = true;
        submittedRef.current = false;
        initializeGame();
        (async () => { try { await gameTracker.startGame(gameId, currentPlayerId); } catch {} })();
      }
    } else {
      if (activeRef.current && !submittedRef.current) {
        submittedRef.current = true;
        try { gameTracker.endGame(gameIdRef.current, 0, { result: "play", reason: "blur" }); } catch {}
      }
      activeRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused, gameId, currentPlayerId]);

  // Unmount safety
  useEffect(() => {
    return () => {
      if (activeRef.current && !submittedRef.current && gameIdRef.current) {
        submittedRef.current = true;
        try { gameTracker.endGame(gameIdRef.current, 0, { result: "play", reason: "unmount" }); } catch {}
      }
      activeRef.current = false;
    };
  }, []);

  // Cell size
  const CELL_SIZE = useMemo(() => (screenWidth - 60) / 9, []);

  /* ---------- Sudoku helpers ---------- */
  const createEmptyGrid = useCallback(() => {
    const arr = [];
    for (let i = 0; i < 9; i++) {
      const row = [];
      for (let j = 0; j < 9; j++) row.push(0);
      arr.push(row);
    }
    return arr;
  }, []);

  const isValidMove = useCallback((grid, row, col, num) => {
    for (let x = 0; x < 9; x++) if (grid[row][x] === num) return false;
    for (let y = 0; y < 9; y++) if (grid[y][col] === num) return false;

    const r0 = row - (row % 3);
    const c0 = col - (col % 3);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      if (grid[r0 + i][c0 + j] === num) return false;
    }
    return true;
  }, []);

  const fillGrid = useCallback(function fill(grid) {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (grid[r][c] === 0) {
          const nums = [1,2,3,4,5,6,7,8,9].sort(() => Math.random() - 0.5);
          for (let k = 0; k < nums.length; k++) {
            const n = nums[k];
            if (isValidMove(grid, r, c, n)) {
              grid[r][c] = n;
              if (fill(grid)) return true;
              grid[r][c] = 0;
            }
          }
          return false;
        }
      }
    }
    return true;
  }, [isValidMove]);

  const generateSolution = useCallback(() => {
    const g = createEmptyGrid();
    fillGrid(g);
    return g;
  }, [createEmptyGrid, fillGrid]);

  const createPuzzle = useCallback((solutionGrid) => {
    const p = solutionGrid.map((row) => row.slice());
    const toRemove = DIFFICULTY.cellsToRemove;
    let removed = 0;
    while (removed < toRemove) {
      const r = (Math.random() * 9) | 0;
      const c = (Math.random() * 9) | 0;
      if (p[r][c] !== 0) {
        p[r][c] = 0;
        removed++;
      }
    }
    return p;
  }, []);

  /* ---------- Init / Reset ---------- */
  const initializeGame = useCallback(() => {
    const newSolution = generateSolution();
    const newPuzzle = createPuzzle(newSolution);

    setSolution(newSolution);
    setPuzzle(newPuzzle);
    setOriginalPuzzle(newPuzzle.map((row) => row.slice()));
    setSelectedCell(null);
    setTimer(0);
    setGameStarted(true);
    setGameWon(false);
  }, [generateSolution, createPuzzle]);

  /* ---------- Timer ---------- */
  useEffect(() => {
    let interval;
    if (gameStarted && !gameWon && !showAchievements) {
      interval = setInterval(() => setTimer((t) => t + 1), 1000);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [gameStarted, gameWon, showAchievements]);

  /* ---------- Completion ---------- */
  const isPuzzleComplete = useCallback((grid) => {
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      if (grid[r][c] === 0) return false;
    }
    return true;
  }, []);

  const isPuzzleCorrect = useCallback((grid) => {
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      if (grid[r][c] !== solution[r][c]) return false;
    }
    return true;
  }, [solution]);

  /* ---------- Tracking helpers ---------- */
  const endRunOnce = useCallback((finalScore, meta) => {
    if (!gameIdRef.current || submittedRef.current) return;
    submittedRef.current = true;
    try { gameTracker.endGame(gameIdRef.current, finalScore, meta); } catch {}
    activeRef.current = false;
  }, []);

  /* ---------- Back / Reset / Win ---------- */
  const handleBackOut = useCallback(() => {
    if (activeRef.current && !submittedRef.current) {
      endRunOnce(0, { result: "play", reason: "back" });
    }
    router.back();
  }, [endRunOnce]);

  const submitWinIfNeeded = useCallback(async (elapsedSeconds) => {
    const prevBest = bestTime == null ? Infinity : bestTime;
    const improved = elapsedSeconds < prevBest;

    if (improved) {
      setBestTime(elapsedSeconds);
      try { await AsyncStorage.setItem(bestTimeKey, String(elapsedSeconds)); } catch {}
    }
    endRunOnce(elapsedSeconds, improved ? { result: "win", best_time: elapsedSeconds } : { result: "win" });
  }, [bestTime, endRunOnce]);

  /* ---------- Inputs ---------- */
  const handleCellPress = useCallback((row, col) => {
    if (gameWon || showAchievements) return;
    if (originalPuzzle[row] && originalPuzzle[row][col] !== 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSelectedCell({ row, col });
  }, [gameWon, originalPuzzle, showAchievements]);

  const handleNumberInput = useCallback((number) => {
    if (!selectedCell || gameWon || showAchievements) return;
    const { row, col } = selectedCell;
    if (originalPuzzle[row] && originalPuzzle[row][col] !== 0) return;

    setPuzzle((prev) => {
      const next = prev.map((r, i) => (i === row ? r.slice() : r));
      next[row][col] = number;

      if (number !== 0) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      }

      if (isPuzzleComplete(next) && isPuzzleCorrect(next)) {
        setGameWon(true);
        submitWinIfNeeded(timeRef.current);
      }
      return next;
    });
  }, [selectedCell, gameWon, originalPuzzle, isPuzzleComplete, isPuzzleCorrect, submitWinIfNeeded, showAchievements]);

  const clearCell = useCallback(() => {
    if (!selectedCell || gameWon || showAchievements) return;
    const { row, col } = selectedCell;
    if (originalPuzzle[row] && originalPuzzle[row][col] !== 0) return;
    handleNumberInput(0);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, [selectedCell, gameWon, originalPuzzle, handleNumberInput, showAchievements]);

  /* ---------- UI helpers ---------- */
  const formatTime = useCallback((seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, "0")}`;
  }, []);

  const getCellBackground = useCallback((row, col) => {
    if (selectedCell && selectedCell.row === row && selectedCell.col === col) {
      return colors.gameAccent6 + "40";
    }
    const boxRow = Math.floor(row / 3);
    const boxCol = Math.floor(col / 3);
    return (boxRow + boxCol) % 2 === 0 ? colors.glassPrimary : colors.glassSecondary;
  }, [selectedCell, colors.gameAccent6, colors.glassPrimary, colors.glassSecondary]);

  if (!fontsLoaded) return null;

  /* ---------- Main UI ---------- */
  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <NightSkyBackground />

      {/* Header */}
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, marginBottom: 20 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <TouchableOpacity onPress={handleBackOut} style={{ padding: 8, borderRadius: 12, backgroundColor: colors.glassSecondary }}>
            <ArrowLeft size={24} color={colors.text} />
          </TouchableOpacity>

          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 20, color: colors.text }}>Sudoku</Text>

          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity
              onPress={() => setShowAchievements(true)}
              style={{ padding: 8, borderRadius: 12, backgroundColor: colors.glassSecondary }}
            >
              <Trophy size={22} color={colors.text} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={initializeGame}
              style={{ padding: 8, borderRadius: 12, backgroundColor: colors.glassSecondary }}
            >
              <RotateCcw size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Stats */}
        <View style={{ borderRadius: 16, overflow: "hidden" }}>
          <BlurView
            intensity={isDark ? 60 : 80}
            tint={isDark ? "dark" : "light"}
            style={{
              backgroundColor: isDark ? "rgba(31, 41, 55, 0.7)" : "rgba(255, 255, 255, 0.7)",
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 16,
              padding: 16,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-around", alignItems: "center" }}>
              <View style={{ alignItems: "center" }}>
                <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                  Time
                </Text>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.gameAccent6 }}>
                  {formatTime(timer)}
                </Text>
              </View>

              <View style={{ alignItems: "center" }}>
                <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                  Difficulty
                </Text>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: colors.gameAccent6 }}>
                  {DIFFICULTY.name}
                </Text>
              </View>

              <TouchableOpacity onPress={clearCell} style={{ padding: 8, borderRadius: 12, backgroundColor: colors.gameAccent6 + "20" }}>
                <Eraser size={20} color={colors.gameAccent6} />
              </TouchableOpacity>
            </View>
          </BlurView>
        </View>
      </View>

      {/* Board */}
      <View style={{ flex: 1, paddingHorizontal: 20, justifyContent: "center" }}>
        <View
          style={{
            width: screenWidth - 40,
            height: screenWidth - 40,
            backgroundColor: colors.glassSecondary,
            borderRadius: 12,
            padding: 4,
            alignSelf: "center",
            marginBottom: 20,
          }}
        >
          {puzzle.map((row, rowIndex) => (
            <View
              key={rowIndex}
              style={{
                flexDirection: "row",
                borderBottomWidth: (rowIndex + 1) % 3 === 0 && rowIndex !== 8 ? 2 : 0,
                borderBottomColor: colors.border,
              }}
            >
              {row.map((cell, colIndex) => {
                const locked = originalPuzzle[rowIndex] && originalPuzzle[rowIndex][colIndex] !== 0;
                const selected = !!selectedCell && selectedCell.row === rowIndex && selectedCell.col === colIndex;
                return (
                  <SudokuCell
                    key={`${rowIndex}-${colIndex}`}
                    rowIndex={rowIndex}
                    colIndex={colIndex}
                    value={cell}
                    locked={locked}
                    selected={selected}
                    CELL_SIZE={CELL_SIZE}
                    colors={colors}
                    onPress={() => handleCellPress(rowIndex, colIndex)}
                    getCellBackground={getCellBackground}
                  />
                );
              })}
            </View>
          ))}
        </View>

        {/* Number input */}
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: 8,
            paddingBottom: insets.bottom + 20,
          }}
        >
          {[1,2,3,4,5,6,7,8,9].map((num) => (
            <TouchableOpacity
              key={num}
              onPress={() => handleNumberInput(num)}
              style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                backgroundColor: colors.gameCard6,
                justifyContent: "center",
                alignItems: "center",
                borderWidth: 1,
                borderColor: colors.gameAccent6,
              }}
            >
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.text }}>{num}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Win overlay */}
      {gameWon ? (
        <View
          style={{
            position: "absolute",
            top: 0, left: 0, right: 0, bottom: 0,
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
                backgroundColor: isDark ? "rgba(31, 41, 55, 0.9)" : "rgba(255,255,255,0.9)",
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 20,
                padding: 32,
                alignItems: "center",
              }}
            >
              <Trophy size={48} color={colors.gameAccent6} style={{ marginBottom: 16 }} />

              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 24, color: colors.text, textAlign: "center", marginBottom: 8 }}>
                Sudoku Solved!
              </Text>

              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 14, color: colors.textSecondary, marginBottom: 6, textAlign: "center" }}>
                Time: {formatTime(timer)}
              </Text>

              {bestTime !== null && (
                <Text style={{ fontFamily: "Inter_500Medium", fontSize: 14, color: colors.textSecondary, marginBottom: 20, textAlign: "center" }}>
                  Best ({DIFFICULTY.name}): {formatTime(bestTime)}
                </Text>
              )}

              <View style={{ flexDirection: "row", gap: 12 }}>
                <TouchableOpacity
                  onPress={initializeGame}
                  style={{ backgroundColor: colors.secondaryButton, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 }}
                >
                  <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.secondaryButtonText }}>
                    Play Again
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleBackOut}
                  style={{ backgroundColor: colors.primaryButton, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 }}
                >
                  <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.primaryButtonText }}>
                    Back to Hub
                  </Text>
                </TouchableOpacity>
              </View>
            </BlurView>
          </View>
        </View>
      ) : null}

      {/* Achievements Modal */}
      <Modal
        visible={showAchievements}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAchievements(false)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", paddingHorizontal: 16 }}>
          <View
            style={{
              borderRadius: 16,
              overflow: "hidden",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.15)",
              backgroundColor: "rgba(0,0,0,0.9)",
              maxHeight: "80%",
            }}
          >
            <View
              style={{
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderBottomColor: "rgba(255,255,255,0.12)",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Text style={{ fontWeight: "700", fontSize: 16, color: "#fff" }}>
                Sudoku Achievements
              </Text>
              <TouchableOpacity onPress={() => setShowAchievements(false)} hitSlop={10}>
                <Text style={{ fontWeight: "600", fontSize: 14, color: "rgba(255,255,255,0.75)" }}>
                  Close
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 12 }}>
              {currentPlayerId != null && gameId != null ? (
                <AchievementsSection
                  key={`${gameId}-${currentPlayerId}`}
                  playerId={currentPlayerId}
                  gameId={gameId}
                  autoRefreshMs={15000}
                  showSearchBar
                  showFilters
                />
              ) : (
                <View style={{ padding: 16 }}>
                  <Text style={{ color: "rgba(255,255,255,0.75)", textAlign: "center", fontWeight: "500" }}>
                    Loading achievements…
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
