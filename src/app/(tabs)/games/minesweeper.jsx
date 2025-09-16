import React, { useState, useEffect, useCallback } from "react";
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
  Trophy,
  Settings,
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
  const [currentPlayerId, setCurrentPlayerId] = useState(null);
  const [gameId, setGameId] = useState(null);

  // Get player ID from AsyncStorage
  useEffect(() => {
    const loadPlayerId = async () => {
      try {
        const savedPlayerId = await AsyncStorage.getItem(
          "puzzle_hub_player_id",
        );
        if (savedPlayerId) {
          setCurrentPlayerId(parseInt(savedPlayerId));
        } else {
          setCurrentPlayerId(1);
        }
      } catch (error) {
        console.error("Failed to load player ID:", error);
        setCurrentPlayerId(1);
      }
    };
    loadPlayerId();
  }, []);

  // Get the correct game ID and start tracking
  useEffect(() => {
    let mounted = true;
    let currentGameId = null;

    const setupGame = async () => {
      if (!currentPlayerId) return;

      const id = await getGameId(GAME_TYPES.MINESWEEPER);
      if (id && currentPlayerId && mounted) {
        currentGameId = id;
        setGameId(id);
        await gameTracker.startGame(id, currentPlayerId);
        console.log("🎮 Minesweeper tracking started:", id);
      } else if (mounted) {
        console.error("❌ Could not get Minesweeper game ID or player ID");
      }
    };

    setupGame();

    // Cleanup when component unmounts or effect re-runs
    return () => {
      mounted = false;
      if (currentGameId) {
        gameTracker.endGame(currentGameId, 0);
      }
    };
  }, [currentPlayerId]);

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // Game state
  const [difficulty, setDifficulty] = useState("easy");
  const [showDifficultySelect, setShowDifficultySelect] = useState(true);
  const [board, setBoard] = useState([]);
  const [gameState, setGameState] = useState("playing"); // 'playing', 'won', 'lost'
  const [timer, setTimer] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);
  const [flagsRemaining, setFlagsRemaining] = useState(0);
  const [revealedCells, setRevealedCells] = useState(0);

  const config = DIFFICULTIES[difficulty];

  // Generate mines
  const generateMines = (rows, cols, mines, firstClickRow, firstClickCol) => {
    const minePositions = new Set();

    while (minePositions.size < mines) {
      const row = Math.floor(Math.random() * rows);
      const col = Math.floor(Math.random() * cols);
      const pos = `${row}-${col}`;

      // Don't place mine on first click or adjacent cells
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

  // Count adjacent mines
  const countAdjacentMines = (board, row, col) => {
    let count = 0;
    for (let r = row - 1; r <= row + 1; r++) {
      for (let c = col - 1; c <= col + 1; c++) {
        if (r >= 0 && r < board.length && c >= 0 && c < board[0].length) {
          if (board[r][c].isMine) count++;
        }
      }
    }
    return count;
  };

  // Initialize board
  const initializeBoard = useCallback(
    (firstClickRow = null, firstClickCol = null) => {
      const newBoard = Array(config.rows)
        .fill(null)
        .map((_, row) =>
          Array(config.cols)
            .fill(null)
            .map((_, col) => ({
              isMine: false,
              isRevealed: false,
              isFlagged: false,
              adjacentMines: 0,
            })),
        );

      // Place mines if first click is provided
      if (firstClickRow !== null && firstClickCol !== null) {
        const minePositions = generateMines(
          config.rows,
          config.cols,
          config.mines,
          firstClickRow,
          firstClickCol,
        );

        minePositions.forEach((pos) => {
          const [row, col] = pos.split("-").map(Number);
          newBoard[row][col].isMine = true;
        });

        // Calculate adjacent mine counts
        for (let row = 0; row < config.rows; row++) {
          for (let col = 0; col < config.cols; col++) {
            if (!newBoard[row][col].isMine) {
              newBoard[row][col].adjacentMines = countAdjacentMines(
                newBoard,
                row,
                col,
              );
            }
          }
        }
      }

      setBoard(newBoard);
      setGameState("playing");
      setTimer(0);
      setGameStarted(firstClickRow !== null);
      setFlagsRemaining(config.mines);
      setRevealedCells(0);
    },
    [config],
  );

  // Reveal cell and adjacent empty cells
  const revealCell = (board, row, col, visited = new Set()) => {
    const key = `${row}-${col}`;
    if (visited.has(key)) return { newBoard: board, revealedCount: 0 };

    visited.add(key);

    if (row < 0 || row >= config.rows || col < 0 || col >= config.cols) {
      return { newBoard: board, revealedCount: 0 };
    }

    const newBoard = board.map((r) => r.map((c) => ({ ...c })));
    const cell = newBoard[row][col];

    if (cell.isRevealed || cell.isFlagged) {
      return { newBoard: board, revealedCount: 0 };
    }

    cell.isRevealed = true;
    let revealedCount = 1;

    // If empty cell (no adjacent mines), reveal all adjacent cells
    if (cell.adjacentMines === 0 && !cell.isMine) {
      for (let r = row - 1; r <= row + 1; r++) {
        for (let c = col - 1; c <= col + 1; c++) {
          if (r !== row || c !== col) {
            const result = revealCell(newBoard, r, c, visited);
            Object.assign(newBoard, result.newBoard);
            revealedCount += result.revealedCount;
          }
        }
      }
    }

    return { newBoard, revealedCount };
  };

  // Handle cell press
  const handleCellPress = (row, col, isLongPress = false) => {
    if (gameState !== "playing") return;

    const cell = board[row][col];

    // Long press or right click for flagging
    if (isLongPress) {
      if (cell.isRevealed) return;

      const newBoard = board.map((r) => r.map((c) => ({ ...c })));
      newBoard[row][col].isFlagged = !newBoard[row][col].isFlagged;

      setBoard(newBoard);
      setFlagsRemaining(
        (prev) => prev + (newBoard[row][col].isFlagged ? -1 : 1),
      );
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      return;
    }

    // Can't reveal flagged cells
    if (cell.isFlagged) return;

    // First click - initialize mines
    if (!gameStarted) {
      initializeBoard(row, col);
      setGameStarted(true);
      return;
    }

    // Hit a mine - game over
    if (cell.isMine) {
      const newBoard = board.map((r) => r.map((c) => ({ ...c })));
      // Reveal all mines
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

      Alert.alert(
        "Game Over! 💣",
        `You hit a mine! Time: ${Math.floor(timer / 60)}:${(timer % 60)
          .toString()
          .padStart(2, "0")}`,
        [
          { text: "New Game", onPress: () => initializeBoard() },
          { text: "Back to Hub", onPress: () => router.back() },
        ],
      );
      return;
    }

    // Reveal cell(s)
    const result = revealCell(board, row, col);
    setBoard(result.newBoard);
    setRevealedCells((prev) => prev + result.revealedCount);

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Check win condition
    const totalCells = config.rows * config.cols;
    const newRevealedCells = revealedCells + result.revealedCount;

    if (newRevealedCells === totalCells - config.mines) {
      setGameState("won");

      // For time-based games like Minesweeper, submit the actual time taken as the score
      // This allows proper leaderboard tracking of best times
      if (gameId) {
        try {
          gameTracker.endGame(gameId, timer); // Pass timer (seconds) as score
        } catch (e) {
          console.warn("gameTracker.endGame failed:", e?.message || e);
        }
      }

      Alert.alert(
        "Victory! 🎉",
        `You won! Time: ${Math.floor(timer / 60)}:${(timer % 60)
          .toString()
          .padStart(2, "0")}`,
        [
          { text: "New Game", onPress: () => initializeBoard() },
          { text: "Back to Hub", onPress: () => router.back() },
        ],
      );
    }
  };

  // Timer effect
  useEffect(() => {
    let interval;
    if (gameStarted && gameState === "playing") {
      interval = setInterval(() => {
        setTimer((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [gameStarted, gameState]);

  // Initialize board on difficulty change
  useEffect(() => {
    if (!showDifficultySelect) {
      initializeBoard();
    }
  }, [difficulty, showDifficultySelect, initializeBoard]);

  if (!fontsLoaded) {
    return null;
  }

  // Difficulty selection screen
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

            {Object.entries(DIFFICULTIES).map(([key, config]) => (
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
                    {config.name}
                  </Text>
                  <Text
                    style={{
                      fontFamily: "Inter_500Medium",
                      fontSize: 14,
                      color: colors.textSecondary,
                    }}
                  >
                    {config.rows}×{config.cols} grid • {config.mines} mines
                  </Text>
                </BlurView>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    );
  }

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
            onPress={() => setShowDifficultySelect(true)}
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
                  {Math.floor(timer / 60)}:
                  {(timer % 60).toString().padStart(2, "0")}
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
                    onLongPress={() =>
                      handleCellPress(rowIndex, colIndex, true)
                    }
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
