// src/app/(tabs)/games/minesweeper.jsx
import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, Text, TouchableOpacity, Dimensions, Alert } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../../../utils/theme";
import { BlurView } from "expo-blur";
import { router } from "expo-router";
import {
  ArrowLeft,
  RotateCcw,
  Flag,
  Bomb,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import gameTracker from "../../../utils/gameTracking";
import { getGameId, GAME_TYPES } from "../../../utils/gameUtils";
import NightSkyBackground from "../../../components/NightSkyBackground";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";

const { width: screenWidth } = Dimensions.get("window");

const DIFFICULTIES = {
  easy: { rows: 9, cols: 9, mines: 10, name: "Easy" },
  medium: { rows: 16, cols: 16, mines: 40, name: "Medium" },
  hard: { rows: 16, cols: 30, mines: 99, name: "Hard" },
};

export default function MinesweeperGame() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  // ───────────────────────────────
  // IDs & session tracking (numeric game_id, separate sessionId)
  // ───────────────────────────────
  const [playerId, setPlayerId] = useState(null);
  const [gameTypeId, setGameTypeId] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const submittedRef = useRef(false); // guard to avoid double submit

  // Player id from storage (fallback to 1)
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem("puzzle_hub_player_id");
        setPlayerId(saved ? parseInt(saved, 10) : 1);
      } catch (e) {
        setPlayerId(1);
      }
    })();
  }, []);

  // Resolve numeric game id and start a session; ensure we end session on unmount if not submitted
  useEffect(() => {
    let alive = true;
    let localSession = null;

    (async () => {
      if (!playerId) return;
      try {
        const id = await getGameId(GAME_TYPES.MINESWEEPER); // numeric id only
        if (!alive) return;
        setGameTypeId(id);

        // Start session and keep its id (some implementations return sessionId; fallback to gameTypeId)
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
      // If component unmounts without a final submit, count as a play (not completed, no best_time)
      if (localSession && !submittedRef.current) {
        try {
          submittedRef.current = true;
          gameTracker.endGame(localSession, 0, {
            result: "play",
            cancelled: true,
            completed: false,
            reason: "unmount",
          });
        } catch (e) {
          // swallow
        }
      }
    };
  }, [playerId]);

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // ───────────────────────────────
  // Game state
  // ───────────────────────────────
  const [difficulty, setDifficulty] = useState("easy");
  const [showDifficultySelect, setShowDifficultySelect] = useState(true);
  const [board, setBoard] = useState([]);
  const [gameState, setGameState] = useState("idle"); // 'idle' | 'playing' | 'won' | 'lost'
  const [timer, setTimer] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);
  const [flagsRemaining, setFlagsRemaining] = useState(0);
  const [revealedCells, setRevealedCells] = useState(0);

  const config = DIFFICULTIES[difficulty];

  // ───────────────────────────────
  // Helpers (keep your flood reveal behavior intact)
  // ───────────────────────────────
  const generateMines = (rows, cols, mines, firstClickRow, firstClickCol) => {
    const minePositions = new Set();
    while (minePositions.size < mines) {
      const row = Math.floor(Math.random() * rows);
      const col = Math.floor(Math.random() * cols);
      const pos = `${row}-${col}`;

      const isFirstClick = row === firstClickRow && col === firstClickCol;
      const isAdjacent =
        Math.abs(row - firstClickRow) <= 1 &&
        Math.abs(col - firstClickCol) <= 1;

      if (!isFirstClick && !isAdjacent) {
        minePositions.add(pos);
      }
    }
    return minePositions;
  };

  const countAdjacentMines = (grid, row, col) => {
    let count = 0;
    for (let r = row - 1; r <= row + 1; r++) {
      for (let c = col - 1; c <= col + 1; c++) {
        if (r >= 0 && r < grid.length && c >= 0 && c < grid[0].length) {
          if (grid[r][c].isMine) count++;
        }
      }
    }
    return count;
  };

  const initializeBoard = useCallback(
    (firstClickRow = null, firstClickCol = null) => {
      const newBoard = Array(config.rows)
        .fill(null)
        .map(() =>
          Array(config.cols)
            .fill(null)
            .map(() => ({
              isMine: false,
              isRevealed: false,
              isFlagged: false,
              adjacentMines: 0,
            }))
        );

      if (firstClickRow !== null && firstClickCol !== null) {
        const minePositions = generateMines(
          config.rows,
          config.cols,
          config.mines,
          firstClickRow,
          firstClickCol
        );

        minePositions.forEach((pos) => {
          const [row, col] = pos.split("-").map(Number);
          newBoard[row][col].isMine = true;
        });

        for (let row = 0; row < config.rows; row++) {
          for (let col = 0; col < config.cols; col++) {
            if (!newBoard[row][col].isMine) {
              newBoard[row][col].adjacentMines = countAdjacentMines(
                newBoard,
                row,
                col
              );
            }
          }
        }
      }

      setBoard(newBoard);
      setGameState(firstClickRow !== null ? "playing" : "idle");
      setTimer(0);
      setGameStarted(firstClickRow !== null);
      setFlagsRemaining(config.mines);
      setRevealedCells(0);
    },
    [config]
  );

 // REPLACE your revealCell with this iterative BFS version (no recursion, single clone)
const revealCell = (board, startR, startC) => {
  const rows = config.rows;
  const cols = config.cols;

  // deep clone once
  const newBoard = board.map((r) => r.map((c) => ({ ...c })));

  // bounds helper
  const inBounds = (r, c) => r >= 0 && r < rows && c >= 0 && c < cols;

  // early exits
  if (!inBounds(startR, startC)) {
    return { newBoard, revealedCount: 0 };
  }
  const first = newBoard[startR][startC];
  if (first.isRevealed || first.isFlagged) {
    return { newBoard, revealedCount: 0 };
  }

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

    // reveal this cell
    cell.isRevealed = true;
    revealedCount += 1;
    visited.add(key);

    // if it's an empty cell (0 adjacent), push neighbors to reveal as a chunk
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

  // ───────────────────────────────
  // Timer (no periodic database playtime pushes — only UI timer)
  // ───────────────────────────────
  useEffect(() => {
    let interval;
    if (gameStarted && gameState === "playing") {
      interval = setInterval(() => {
        setTimer((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [gameStarted, gameState]);

  // ───────────────────────────────
  // Back / Exit handling (submit a play/loss; no best_time)
  // ───────────────────────────────
  const handleBackPress = () => {
    try {
      if (sessionId && !submittedRef.current) {
        submittedRef.current = true;
        // End as a "play" (not completed). No best_time.
        gameTracker.endGame(sessionId, 0, {
          result: "play",
          cancelled: true,
          completed: false,
          time_s: timer,
          difficulty,
          reason: "back",
        });
      }
    } catch (e) {
      // swallow
    }

    // Reset local state so the next open is fresh
    setTimer(0);
    setGameStarted(false);
    setGameState("idle");
    setBoard([]);
    setRevealedCells(0);
    setFlagsRemaining(0);

    router.back();
  };

  // ───────────────────────────────
  // Gameplay
  // ───────────────────────────────
  const handleCellPress = (row, col, isLongPress = false) => {
    if (gameState !== "playing" && gameState !== "idle") return;

    const cellCurrent = board[row]?.[col];
    if (!cellCurrent) return;

    // Long press toggles flag
    if (isLongPress) {
      if (cellCurrent.isRevealed) return;
      const newBoard = board.map((r) => r.map((c) => ({ ...c })));
      newBoard[row][col].isFlagged = !newBoard[row][col].isFlagged;
      setBoard(newBoard);
      setFlagsRemaining((prev) => prev + (newBoard[row][col].isFlagged ? -1 : 1));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      return;
    }

    // First click lays mines and starts playing
    if (!gameStarted) {
      initializeBoard(row, col);
      setGameStarted(true);
      return;
    }

    // Can't reveal flagged or already revealed
    if (cellCurrent.isFlagged || cellCurrent.isRevealed) return;

    // Hit a mine → reveal all mines, submit a "play", not completed
    if (cellCurrent.isMine) {
      const newBoard = board.map((r) => r.map((c) => ({ ...c })));
      for (let r = 0; r < config.rows; r++) {
        for (let c = 0; c < config.cols; c++) {
          if (newBoard[r][c].isMine) {
            newBoard[r][c].isRevealed = true;
          }
        }
      }
      setBoard(newBoard);
      setGameState("lost");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

      // Submit as a play (loss). Do NOT submit best_time.
      if (sessionId && !submittedRef.current) {
        try {
          submittedRef.current = true;
          gameTracker.endGame(sessionId, 0, {
            result: "play",
            completed: false,
            time_s: timer,
            difficulty,
            reason: "mine",
          });
        } catch (e) {
          // swallow
        }
      }

      Alert.alert(
        "Game Over! 💣",
        `You hit a mine! Time: ${Math.floor(timer / 60)}:${String(timer % 60).padStart(2, "0")}`,
        [
          { text: "New Game", onPress: () => initializeBoard() },
          { text: "Back to Hub", onPress: handleBackPress },
        ]
      );
      return;
    }

    // Reveal cell(s) with flood
    const result = revealCell(board, row, col);
    setBoard(result.newBoard);
    setRevealedCells((prev) => prev + result.revealedCount);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Win check
    const totalCells = config.rows * config.cols;
    const newRevealedCount = revealedCells + result.revealedCount;
    if (newRevealedCount === totalCells - config.mines) {
      setGameState("won");

  // Submit best_time ONLY on completion (win)
if (sessionId && !submittedRef.current) {
  try {
    submittedRef.current = true;
    // IMPORTANT: for best_time games, the backend expects the time in the SCORE param
    gameTracker.endGame(sessionId, timer, {
      result: "win",
      completed: true,
      best_time: timer, // optional
      time_s: timer,    // optional
      difficulty,
    });
  } catch (e) {
    console.warn("endGame (win) failed:", e?.message || e);
  }
}

      Alert.alert(
        "Victory! 🎉",
        `You won! Time: ${Math.floor(timer / 60)}:${String(timer % 60).padStart(2, "0")}`,
        [
          { text: "New Game", onPress: () => initializeBoard() },
          { text: "Back to Hub", onPress: handleBackPress },
        ]
      );
    }
  };

  // Reset board whenever difficulty is chosen (after selection screen)
  useEffect(() => {
    if (!showDifficultySelect) {
      initializeBoard();
    }
  }, [difficulty, showDifficultySelect, initializeBoard]);

  if (!fontsLoaded) {
    return null;
  }

  // ───────────────────────────────
  // Difficulty selection screen
  // ───────────────────────────────
  if (showDifficultySelect) {
    return (
      <View style={{ flex: 1 }}>
        <StatusBar style={isDark ? "light" : "dark"} />

        {/* Night sky background with sparkles and moon */}
        <NightSkyBackground />

        <LinearGradient
          colors={
            isDark
              ? ["rgba(17, 24, 39, 1)", "rgba(31, 41, 55, 0.8)"]
              : ["rgba(239, 68, 68, 0.1)", "rgba(255, 255, 255, 0.9)"]
          }
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        />

        <View
          style={{
            paddingTop: insets.top + 16,
            paddingHorizontal: 20,
            flex: 1,
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 40,
            }}
          >
            <TouchableOpacity
              onPress={handleBackPress}
              style={{
                padding: 8,
                borderRadius: 12,
                backgroundColor: colors.glassSecondary,
              }}
            >
              <ArrowLeft size={24} color={colors.text} />
            </TouchableOpacity>

            <Text
              style={{
                fontFamily: "Inter_700Bold",
                fontSize: 24,
                color: colors.text,
              }}
            >
              Minesweeper
            </Text>

            <View style={{ width: 40 }} />
          </View>

          {/* Difficulty selection */}
          <View style={{ flex: 1, justifyContent: "center" }}>
            <Text
              style={{
                fontFamily: "Inter_600SemiBold",
                fontSize: 20,
                color: colors.text,
                textAlign: "center",
                marginBottom: 32,
              }}
            >
              Choose Difficulty
            </Text>

            {Object.entries(DIFFICULTIES).map(([key, cfg]) => (
              <TouchableOpacity
                key={key}
                onPress={() => {
                  setDifficulty(key);
                  setShowDifficultySelect(false);
                }}
                style={{
                  marginBottom: 16,
                  borderRadius: 16,
                  overflow: "hidden",
                }}
              >
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
                    padding: 20,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "Inter_700Bold",
                      fontSize: 18,
                      color: colors.text,
                      marginBottom: 4,
                    }}
                  >
                    {cfg.name}
                  </Text>
                  <Text
                    style={{
                      fontFamily: "Inter_500Medium",
                      fontSize: 14,
                      color: colors.textSecondary,
                    }}
                  >
                    {cfg.rows}×{cfg.cols} grid • {cfg.mines} mines
                  </Text>
                </BlurView>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    );
  }

  // ───────────────────────────────
  // Game screen
  // ───────────────────────────────
  const cellSize = Math.min(25, (screenWidth - 40) / config.cols);
  const boardWidth = cellSize * config.cols;
  const boardHeight = cellSize * config.rows;

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={isDark ? "light" : "dark"} />

      {/* Night sky background with sparkles and moon */}
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
            onPress={handleBackPress}
            style={{
              padding: 8,
              borderRadius: 12,
              backgroundColor: colors.glassSecondary,
            }}
          >
            <ArrowLeft size={24} color={colors.text} />
          </TouchableOpacity>

          <Text
            style={{
              fontFamily: "Inter_700Bold",
              fontSize: 20,
              color: colors.text,
            }}
          >
            Minesweeper
          </Text>

          <TouchableOpacity
            onPress={() => initializeBoard()}
            style={{
              padding: 8,
              borderRadius: 12,
              backgroundColor: colors.glassSecondary,
            }}
          >
            <RotateCcw size={24} color={colors.text} />
          </TouchableOpacity>
        </View>

        {/* Game stats */}
        <View
          style={{
            borderRadius: 16,
            overflow: "hidden",
          }}
        >
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
                justifyContent: "space-around",
                alignItems: "center",
              }}
            >
              <View style={{ alignItems: "center" }}>
                <Text
                  style={{
                    fontFamily: "Inter_500Medium",
                    fontSize: 12,
                    color: colors.textSecondary,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    marginBottom: 4,
                  }}
                >
                  Time
                </Text>
                <Text
                  style={{
                    fontFamily: "Inter_700Bold",
                    fontSize: 18,
                    color: colors.gameAccent8,
                  }}
                >
                  {Math.floor(timer / 60)}:{String(timer % 60).padStart(2, "0")}
                </Text>
              </View>

              <View style={{ alignItems: "center" }}>
                <Text
                  style={{
                    fontFamily: "Inter_500Medium",
                    fontSize: 12,
                    color: colors.textSecondary,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    marginBottom: 4,
                  }}
                >
                  Flags
                </Text>
                <Text
                  style={{
                    fontFamily: "Inter_700Bold",
                    fontSize: 18,
                    color: colors.gameAccent8,
                  }}
                >
                  {flagsRemaining}
                </Text>
              </View>

              <View style={{ alignItems: "center" }}>
                <Text
                  style={{
                    fontFamily: "Inter_500Medium",
                    fontSize: 12,
                    color: colors.textSecondary,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    marginBottom: 4,
                  }}
                >
                  Difficulty
                </Text>
                <Text
                  style={{
                    fontFamily: "Inter_700Bold",
                    fontSize: 14,
                    color: colors.gameAccent8,
                  }}
                >
                  {DIFFICULTIES[difficulty].name}
                </Text>
              </View>
            </View>
          </BlurView>
        </View>
      </View>

      {/* Game board */}
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          paddingHorizontal: 20,
        }}
      >
        <View
          style={{
            width: boardWidth + 8,
            height: boardHeight + 8,
            backgroundColor: colors.glassSecondary,
            borderRadius: 8,
            padding: 4,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <View style={{ width: boardWidth, height: boardHeight }}>
            {board.map((row, rowIndex) => (
              <View
                key={rowIndex}
                style={{
                  flexDirection: "row",
                }}
              >
                {row.map((cell, colIndex) => (
                  <TouchableOpacity
                    key={`${rowIndex}-${colIndex}`}
                    onPress={() => handleCellPress(rowIndex, colIndex)}
                    onLongPress={() => handleCellPress(rowIndex, colIndex, true)}
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
                      <Flag size={cellSize * 0.6} color="#EF4444" />
                    )}
                    {cell.isRevealed && cell.isMine && (
                      <Bomb size={cellSize * 0.6} color="#FFFFFF" />
                    )}
                    {cell.isRevealed &&
                      !cell.isMine &&
                      cell.adjacentMines > 0 && (
                        <Text
                          style={{
                            fontFamily: "Inter_700Bold",
                            fontSize: cellSize * 0.5,
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
        </View>

        {/* Instructions */}
        <Text
          style={{
            fontFamily: "Inter_500Medium",
            fontSize: 12,
            color: colors.textSecondary,
            textAlign: "center",
            paddingHorizontal: 20,
            marginTop: 16,
            paddingBottom: insets.bottom + 20,
          }}
        >
          Tap to reveal • Long press to flag • Avoid the mines!
        </Text>
      </View>
    </View>
  );
}
