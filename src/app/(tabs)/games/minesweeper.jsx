// src/app/(tabs)/games/minesweeper.jsx  (REPLACE ENTIRE FILE)
import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, Text, TouchableOpacity, Dimensions, Alert, Platform, Modal, ScrollView } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../../utils/theme";
import { BlurView } from "expo-blur";
import { router } from "expo-router";
import { ArrowLeft, RotateCcw, Flag, Bomb, Trophy } from "lucide-react-native";
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

const { width: screenW, height: screenH } = Dimensions.get("window");

export default function MinesweeperGame() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const isPad = Platform.OS === "ios" && Platform.isPad;

  // ── IDs & session tracking ──────────────────────────────
  const [playerId, setPlayerId] = useState(null);
  const [gameTypeId, setGameTypeId] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [showAchievements, setShowAchievements] = useState(false);
  const submittedRef = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem("puzzle_hub_player_id");
        setPlayerId(saved ? parseInt(saved, 10) : 1);
      } catch {
        setPlayerId(1);
      }
    })();
  }, []);

  useEffect(() => {
    let alive = true;
    let localSession = null;

    (async () => {
      if (!playerId) return;
      try {
        const id = await getGameId(GAME_TYPES.MINESWEEPER); // numeric id
        if (!alive) return;
        setGameTypeId(id);

        const started = await gameTracker.startGame(id, playerId);
        if (!alive) return;
        localSession = started || id;
        setSessionId(localSession);
        submittedRef.current = false;
      } catch (e) {
        console.warn("Minesweeper startGame failed:", e);
      }
    })();

    return () => {
      alive = false;
      if (localSession && !submittedRef.current) {
        try {
          submittedRef.current = true;
          gameTracker.endGame(localSession, 0, {
            result: "play",
            cancelled: true,
            completed: false,
            reason: "unmount",
          });
        } catch {}
      }
    };
  }, [playerId]);

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // ── Layout / board sizing ────────────────────────────────
  const headerH = insets.top + 16 + 56 + 20;
  const footerH = insets.bottom + 40;
  const verticalBudget = Math.max(320, screenH - headerH - footerH);

  const COLS = isPad ? 16 : 12;
  const ROWS = isPad ? 24 : 18;

  const maxCardW = Math.min(screenW * 0.94, isPad ? screenW * 0.9 : screenW * 0.94);
  const maxCardH = Math.min(verticalBudget, verticalBudget);

  const innerW = Math.max(0, maxCardW - 24);
  const innerH = Math.max(0, maxCardH - 24);

  const cellSize = Math.floor(Math.min(innerW / COLS, innerH / ROWS));
  const boardWidth = cellSize * COLS;
  const boardHeight = cellSize * ROWS;

  const MINES = Math.max(1, Math.round(COLS * ROWS * 0.16));

  // ── Game state ───────────────────────────────────────────
  const [board, setBoard] = useState([]);
  const [gameState, setGameState] = useState("idle"); // 'idle' | 'playing' | 'won' | 'lost'
  const [timer, setTimer] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);
  const [flagsRemaining, setFlagsRemaining] = useState(MINES);
  const [revealedCells, setRevealedCells] = useState(0);

  // ── Helpers ──────────────────────────────────────────────
  const generateMines = (rows, cols, mines, firstR, firstC) => {
    const minePositions = new Set();
    while (minePositions.size < mines) {
      const r = Math.floor(Math.random() * rows);
      const c = Math.floor(Math.random() * cols);
      const pos = `${r}-${c}`;
      const isFirst = r === firstR && c === firstC;
      const isAdj = Math.abs(r - firstR) <= 1 && Math.abs(c - firstC) <= 1;
      if (!isFirst && !isAdj) minePositions.add(pos);
    }
    return minePositions;
  };

  const countAdjacentMines = (grid, r0, c0) => {
    let count = 0;
    for (let r = r0 - 1; r <= r0 + 1; r++) {
      for (let c = c0 - 1; c <= c0 + 1; c++) {
        if (r >= 0 && r < grid.length && c >= 0 && c < grid[0].length) {
          if (grid[r][c].isMine) count++;
        }
      }
    }
    return count;
  };

  const initializeEmptyBoard = useCallback(() => {
    const newBoard = Array(ROWS)
      .fill(null)
      .map(() =>
        Array(COLS)
          .fill(null)
          .map(() => ({
            isMine: false,
            isRevealed: false,
            isFlagged: false,
            adjacentMines: 0,
          }))
      );
    setBoard(newBoard);
    setGameState("idle");
    setTimer(0);
    setGameStarted(false);
    setFlagsRemaining(MINES);
    setRevealedCells(0);
  }, [ROWS, COLS, MINES]);

  // Non-recursive flood reveal
  const revealCell = (grid, startR, startC) => {
    const rows = ROWS;
    const cols = COLS;
    const inBounds = (r, c) => r >= 0 && r < rows && c >= 0 && c < cols;

    const newBoard = grid.map((r) => r.map((c) => ({ ...c })));

    if (!inBounds(startR, startC)) return { newBoard, revealedCount: 0 };

    const first = newBoard[startR][startC];
    if (first.isRevealed || first.isFlagged) return { newBoard, revealedCount: 0 };

    let revealedCount = 0;
    const stack = [[startR, startC]];
    const visited = new Set();

    while (stack.length) {
      const [r, c] = stack.pop();
      const key = `${r}-${c}`;
      if (visited.has(key)) continue;
      if (!inBounds(r, c)) continue;

      const cell = newBoard[r][c];
      if (cell.isRevealed || cell.isFlagged) {
        visited.add(key);
        continue;
      }

      cell.isRevealed = true;
      revealedCount += 1;
      visited.add(key);

      if (!cell.isMine && cell.adjacentMines === 0) {
        for (let rr = r - 1; rr <= r + 1; rr++) {
          for (let cc = c - 1; cc <= c + 1; cc++) {
            if (rr === r && cc === c) continue;
            stack.push([rr, cc]);
          }
        }
      }
    }

    return { newBoard, revealedCount };
  };

  // Build board on first click (safe start)
  const layMinesAndStart = useCallback(
    (firstR, firstC) => {
      const newBoard = Array(ROWS)
        .fill(null)
        .map(() =>
          Array(COLS)
            .fill(null)
            .map(() => ({
              isMine: false,
              isRevealed: false,
              isFlagged: false,
              adjacentMines: 0,
            }))
        );

      const mines = generateMines(ROWS, COLS, MINES, firstR, firstC);
      mines.forEach((pos) => {
        const [r, c] = pos.split("-").map(Number);
        newBoard[r][c].isMine = true;
      });

      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (!newBoard[r][c].isMine) {
            newBoard[r][c].adjacentMines = countAdjacentMines(newBoard, r, c);
          }
        }
      }

      setBoard(newBoard);
      setGameState("playing");
      setGameStarted(true);
      setTimer(0);
      setFlagsRemaining(MINES);
      setRevealedCells(0);
    },
    [ROWS, COLS, MINES]
  );

  // Timer
  useEffect(() => {
    let interval;
    if (gameStarted && gameState === "playing") {
      interval = setInterval(() => setTimer((t) => t + 1), 1000);
    }
    return () => interval && clearInterval(interval);
  }, [gameStarted, gameState]);

  // Session submit helper
  const endSessionIfNeeded = (meta = {}) => {
    if (sessionId && !submittedRef.current) {
      try {
        submittedRef.current = true;
        gameTracker.endGame(sessionId, meta.completed ? timer : 0, {
          time_s: timer,
          ...meta, // result: 'win' | 'play', completed: bool, reason?: string
        });
      } catch {}
    }
  };

  const handleBackPress = () => {
    endSessionIfNeeded({ result: "play", cancelled: true, completed: false, reason: "back" });
    initializeEmptyBoard();
    router.back();
  };

  // Gameplay
  const handleCellPress = (row, col, isLongPress = false) => {
    if (gameState !== "playing" && gameState !== "idle") return;

    const cell = board[row]?.[col];
    if (!cell) return;

    // Long press toggles flag
    if (isLongPress) {
      if (cell.isRevealed) return;
      const newBoard = board.map((r) => r.map((c) => ({ ...c })));
      newBoard[row][col].isFlagged = !newBoard[row][col].isFlagged;
      setBoard(newBoard);
      setFlagsRemaining((prev) => prev + (newBoard[row][col].isFlagged ? -1 : 1));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      return;
    }

    // First click lays mines and starts
    if (!gameStarted) {
      layMinesAndStart(row, col);
      return;
    }

    // Can't reveal flagged or already revealed
    if (cell.isFlagged || cell.isRevealed) return;

    // Hit a mine → reveal all mines, submit a "play" (loss)
    if (cell.isMine) {
      const newBoard = board.map((r) => r.map((c) => ({ ...c })));
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (newBoard[r][c].isMine) newBoard[r][c].isRevealed = true;
        }
      }
      setBoard(newBoard);
      setGameState("lost");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

      endSessionIfNeeded({ result: "play", completed: false, reason: "mine" });

      Alert.alert(
        "Game Over! 💣",
        `You hit a mine! Time: ${Math.floor(timer / 60)}:${String(timer % 60).padStart(2, "0")}`,
        [
          { text: "New Game", onPress: () => initializeEmptyBoard() },
          { text: "Back to Hub", onPress: handleBackPress },
        ]
      );
      return;
    }

    // Reveal cell(s)
    const result = revealCell(board, row, col);
    setBoard(result.newBoard);
    setRevealedCells((prev) => prev + result.revealedCount);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Win check
    const totalCells = ROWS * COLS;
    const newlyRevealed = revealedCells + result.revealedCount;
    if (newlyRevealed === totalCells - MINES) {
      setGameState("won");

      // Only on completion: score = timer
      endSessionIfNeeded({ result: "win", completed: true });

      Alert.alert(
        "Victory! 🎉",
        `You won! Time: ${Math.floor(timer / 60)}:${String(timer % 60).padStart(2, "0")}`,
        [
          { text: "New Game", onPress: () => initializeEmptyBoard() },
          { text: "Back to Hub", onPress: handleBackPress },
        ]
      );
    }
  };

  // Init an empty board at mount
  useEffect(() => { initializeEmptyBoard(); }, [initializeEmptyBoard]);

  if (!fontsLoaded) return null;

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <NightSkyBackground />

      {/* Header */}
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, marginBottom: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <TouchableOpacity
            onPress={handleBackPress}
            style={{ padding: 8, borderRadius: 12, backgroundColor: colors.glassSecondary }}
          >
            <ArrowLeft size={24} color={colors.text} />
          </TouchableOpacity>

          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 20, color: colors.text }}>
            Mine Finder
          </Text>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <TouchableOpacity
              onPress={() => setShowAchievements(true)}
              style={{ padding: 8, borderRadius: 12, backgroundColor: colors.glassSecondary }}
            >
              <Trophy size={22} color={colors.text} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={initializeEmptyBoard}
              style={{ padding: 8, borderRadius: 12, backgroundColor: colors.glassSecondary }}
            >
              <RotateCcw size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Stats row */}
        <BlurView
          intensity={isDark ? 60 : 80}
          tint={isDark ? "dark" : "light"}
          style={{
            backgroundColor: isDark ? "rgba(31, 41, 55, 0.7)" : "rgba(255, 255, 255, 0.7)",
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 16,
            padding: 14,
          }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-around", alignItems: "center" }}>
            <View style={{ alignItems: "center" }}>
              <Text style={{
                fontFamily: "Inter_500Medium",
                fontSize: 12,
                color: colors.textSecondary,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginBottom: 2,
              }}>
                Time
              </Text>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.gameAccent8 }}>
                {Math.floor(timer / 60)}:{String(timer % 60).padStart(2, "0")}
              </Text>
            </View>

            <View style={{ alignItems: "center" }}>
              <Text style={{
                fontFamily: "Inter_500Medium",
                fontSize: 12,
                color: colors.textSecondary,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginBottom: 2,
              }}>
                Flags
              </Text>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.gameAccent8 }}>
                {flagsRemaining}
              </Text>
            </View>
          </View>
        </BlurView>
      </View>

      {/* Board Card */}
      <View style={{ flex: 1, paddingHorizontal: 20, alignItems: "center", justifyContent: "center" }}>
        <View style={{ width: Math.min(maxCardW, boardWidth + 24), height: Math.min(maxCardH, boardHeight + 24), borderRadius: 12, overflow: "hidden" }}>
          <BlurView
            intensity={isDark ? 60 : 80}
            tint={isDark ? "dark" : "light"}
            style={{
              backgroundColor: colors.glassSecondary,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 12,
              padding: 12,
              width: "100%",
              height: "100%",
            }}
          >
            <View style={{ width: boardWidth, height: boardHeight, alignSelf: "center" }}>
              {board.map((row, r) => (
                <View key={r} style={{ flexDirection: "row" }}>
                  {row.map((cell, c) => (
                    <TouchableOpacity
                      key={`${r}-${c}`}
                      onPress={() => handleCellPress(r, c)}
                      onLongPress={() => handleCellPress(r, c, true)}
                      delayLongPress={200}
                      style={{
                        width: cellSize,
                        height: cellSize,
                        backgroundColor: cell.isRevealed
                          ? cell.isMine
                            ? "#EF4444"
                            : colors.background
                          : colors.glassSecondary,
                        justifyContent: "center",
                        alignItems: "center",
                        borderWidth: 0.5,
                        borderColor: colors.overlay,
                      }}
                    >
                      {cell.isFlagged && !cell.isRevealed && (
                        <Flag size={Math.max(12, cellSize * 0.6)} color="#EF4444" />
                      )}
                      {cell.isRevealed && cell.isMine && (
                        <Bomb size={Math.max(12, cellSize * 0.6)} color="#FFFFFF" />
                      )}
                      {cell.isRevealed && !cell.isMine && cell.adjacentMines > 0 && (
                        <Text
                          style={{
                            fontFamily: "Inter_700Bold",
                            fontSize: Math.max(10, cellSize * 0.5),
                            color:
                              [
                                "#1E40AF",
                                "#16A34A",
                                "#DC2626",
                                "#7C2D12",
                                "#7C2D12",
                                "#DC2626",
                                "#000000",
                                "#6B7280",
                              ][cell.adjacentMines - 1] || colors.text,
                          }}
                        >
                          {cell.adjacentMines}
                        </Text>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
            </View>
          </BlurView>
        </View>

        {/* Instructions */}
        <Text
          style={{
            fontFamily: "Inter_500Medium",
            fontSize: 12,
            color: colors.textSecondary,
            textAlign: "center",
            paddingHorizontal: 20,
            marginTop: 12,
            paddingBottom: insets.bottom + 14,
          }}
        >
          Tap to reveal • Long press to flag • Avoid the mines!
        </Text>
      </View>

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
              borderColor: colors.border,
              backgroundColor: isDark ? "rgba(0,0,0,0.9)" : colors.background,
              maxHeight: "80%",
            }}
          >
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
              <Text style={{ fontWeight: "700", fontSize: 16, color: colors.text }}>
                Minesweeper Achievements
              </Text>
              <TouchableOpacity onPress={() => setShowAchievements(false)} hitSlop={10}>
                <Text style={{ fontWeight: "600", fontSize: 14, color: colors.textSecondary }}>
                  Close
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 12 }}>
              {playerId && gameTypeId ? (
                <AchievementsSection
                  playerId={playerId}
                  gameId={gameTypeId}
                  autoRefreshMs={15000}
                  showSearchBar
                  showFilters
                />
              ) : (
                <View style={{ padding: 16 }}>
                  <Text style={{ color: colors.textSecondary, textAlign: "center", fontWeight: "500" }}>
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
