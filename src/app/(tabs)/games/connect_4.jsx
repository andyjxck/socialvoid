import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  Animated,
  Dimensions,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { ArrowLeft, RotateCcw, ArrowDown } from "lucide-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "../../../utils/theme";
import gameTracker from "../../../utils/gameTracking";
import { getGameId, GAME_TYPES } from "../../../utils/gameUtils";
import { BlurView } from "expo-blur";
import NightSkyBackground from "../../../components/NightSkyBackground";
import {
  useGameStats,
  GAME_STATS_TYPES,
  formatGameScore,
} from "../../../hooks/useGameStats";

const { width: screenWidth, height: screenHeight } = Dimensions.get("window");
const ROWS = 6;
const COLS = 7;
const EMPTY = 0;
const PLAYER = 1;
const AI = 2;

const CELL_SIZE = Math.min(45, (screenWidth - 80) / COLS);

export default function Connect4Game() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const [board, setBoard] = useState(() =>
    Array(ROWS)
      .fill(null)
      .map(() => Array(COLS).fill(EMPTY)),
  );
  const [currentPlayer, setCurrentPlayer] = useState(PLAYER);
  const [winner, setWinner] = useState(null);
  const [gameOver, setGameOver] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [currentPlayerId, setCurrentPlayerId] = useState(null);
  const [gameId, setGameId] = useState(null);
  const [selectedColumn, setSelectedColumn] = useState(3);

  // 🎯 USE THE NEW PERSISTENT STATS HOOK!
  const {
    stats,
    isLoading: isLoadingStats,
    error: statsError,
  } = useGameStats(currentPlayerId, GAME_STATS_TYPES.CONNECT_4);

  // Calculate current session score for display
  const [sessionScore, setSessionScore] = useState({ player: 0, ai: 0 });
  const [totalScore, setTotalScore] = useState({ player: 0, ai: 0 });

  // Update total score when stats load
  useEffect(() => {
    if (stats) {
      const playerWins = stats.high_score || 0;
      const totalGames = stats.total_plays || 0;
      const aiWins = Math.max(0, totalGames - playerWins);

      setTotalScore({ player: playerWins, ai: aiWins });
      console.log("🎮 Connect 4 persistent stats loaded:", {
        playerWins,
        aiWins,
        totalGames,
      });
    }
  }, [stats]);

  useEffect(() => {
    const loadPlayerId = async () => {
      try {
        const savedPlayerId = await AsyncStorage.getItem(
          "puzzle_hub_player_id",
        );
        setCurrentPlayerId(savedPlayerId ? parseInt(savedPlayerId) : 1);
      } catch (error) {
        console.error("Failed to load player ID:", error);
        setCurrentPlayerId(1);
      }
    };
    loadPlayerId();
  }, []);

  useEffect(() => {
    let mounted = true;
    let currentGameId = null;

    const setupGame = async () => {
      if (!currentPlayerId) return;
      const id = await getGameId(GAME_TYPES.CONNECT_4);
      if (id && currentPlayerId && mounted) {
        currentGameId = id;
        setGameId(id);
        await gameTracker.startGame(id, currentPlayerId);
      }
    };

    setupGame();

    return () => {
      mounted = false;
      // Don't end game on unmount - let specific game outcomes handle it
    };
  }, [currentPlayerId]);

  // Handle game completion - UPDATE PERSISTENT STATS
  useEffect(() => {
    if (winner !== null && gameId && currentPlayerId) {
      const isWin = winner === PLAYER;
      const gameScore = isWin ? 1 : 0; // 1 for win, 0 for loss

      // Update session score
      setSessionScore((prev) => ({
        player: isWin ? prev.player + 1 : prev.player,
        ai: !isWin ? prev.ai + 1 : prev.ai,
      }));

      // Update total score (persistent + session)
      setTotalScore((prev) => ({
        player: isWin ? prev.player + 1 : prev.player,
        ai: !isWin ? prev.ai + 1 : prev.ai,
      }));

      // End the game with the score (wins) - this updates the database
      gameTracker.endGame(gameId, gameScore);

      console.log("🎯 Connect 4 game completed:", {
        winner: winner === PLAYER ? "Player" : "AI",
        sessionScore: {
          player: isWin ? sessionScore.player + 1 : sessionScore.player,
          ai: !isWin ? sessionScore.ai + 1 : sessionScore.ai,
        },
        totalScore: {
          player: isWin ? totalScore.player + 1 : totalScore.player,
          ai: !isWin ? totalScore.ai + 1 : totalScore.ai,
        },
      });
    }
  }, [winner, gameId, currentPlayerId, sessionScore, totalScore]);

  const checkWinner = (board, row, col, player) => {
    const directions = [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1],
    ];

    for (let [dr, dc] of directions) {
      let count = 1;

      for (let i = 1; i < 4; i++) {
        const r = row + dr * i;
        const c = col + dc * i;
        if (
          r >= 0 &&
          r < ROWS &&
          c >= 0 &&
          c < COLS &&
          board[r][c] === player
        ) {
          count++;
        } else break;
      }

      for (let i = 1; i < 4; i++) {
        const r = row - dr * i;
        const c = col - dc * i;
        if (
          r >= 0 &&
          r < ROWS &&
          c >= 0 &&
          c < COLS &&
          board[r][c] === player
        ) {
          count++;
        } else break;
      }

      if (count >= 4) return true;
    }
    return false;
  };

  const getAIMove = (board) => {
    // Check for winning move
    for (let col = 0; col < COLS; col++) {
      if (isValidMove(board, col)) {
        const testBoard = board.map((row) => [...row]);
        const row = getLowestRow(testBoard, col);
        testBoard[row][col] = AI;
        if (checkWinner(testBoard, row, col, AI)) {
          return col;
        }
      }
    }

    // Block player winning move
    for (let col = 0; col < COLS; col++) {
      if (isValidMove(board, col)) {
        const testBoard = board.map((row) => [...row]);
        const row = getLowestRow(testBoard, col);
        testBoard[row][col] = PLAYER;
        if (checkWinner(testBoard, row, col, PLAYER)) {
          return col;
        }
      }
    }

    // Prefer center columns
    const validMoves = [];
    for (let col = 0; col < COLS; col++) {
      if (isValidMove(board, col)) {
        const weight =
          col === 3
            ? 4
            : col === 2 || col === 4
              ? 3
              : col === 1 || col === 5
                ? 2
                : 1;
        for (let i = 0; i < weight; i++) {
          validMoves.push(col);
        }
      }
    }

    return validMoves[Math.floor(Math.random() * validMoves.length)];
  };

  const isValidMove = (board, col) => board[0][col] === EMPTY;

  const getLowestRow = (board, col) => {
    for (let row = ROWS - 1; row >= 0; row--) {
      if (board[row][col] === EMPTY) {
        return row;
      }
    }
    return -1;
  };

  const dropPiece = async (col) => {
    if (gameOver || !isValidMove(board, col) || currentPlayer !== PLAYER)
      return;

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const newBoard = board.map((row) => [...row]);
    const row = getLowestRow(newBoard, col);
    newBoard[row][col] = PLAYER;

    setBoard(newBoard);

    if (checkWinner(newBoard, row, col, PLAYER)) {
      setWinner(PLAYER);
      setGameOver(true);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("🎉 You Win!", "Great job! You beat the AI!");
      return;
    }

    if (newBoard.every((row) => row.every((cell) => cell !== EMPTY))) {
      setGameOver(true);
      Alert.alert("🤝 Draw!", "Good game! Try again?");
      return;
    }

    setCurrentPlayer(AI);
  };

  // AI turn
  useEffect(() => {
    if (currentPlayer === AI && !gameOver) {
      setIsThinking(true);

      const timeout = setTimeout(async () => {
        const aiCol = getAIMove(board);
        const newBoard = board.map((row) => [...row]);
        const row = getLowestRow(newBoard, aiCol);
        newBoard[row][aiCol] = AI;

        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

        setBoard(newBoard);
        setIsThinking(false);

        if (checkWinner(newBoard, row, aiCol, AI)) {
          setWinner(AI);
          setGameOver(true);
          await Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Warning,
          );
          Alert.alert("🤖 AI Wins!", "The AI got you this time. Try again!");
          return;
        }

        if (newBoard.every((row) => row.every((cell) => cell !== EMPTY))) {
          setGameOver(true);
          Alert.alert("🤝 Draw!", "Good game! Try again?");
          return;
        }

        setCurrentPlayer(PLAYER);
      }, 600);

      return () => clearTimeout(timeout);
    }
  }, [currentPlayer, board, gameOver]);

  const resetGame = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setBoard(
      Array(ROWS)
        .fill(null)
        .map(() => Array(COLS).fill(EMPTY)),
    );
    setCurrentPlayer(PLAYER);
    setWinner(null);
    setGameOver(false);
    setIsThinking(false);
    setSelectedColumn(3);
  };

  const moveLeft = async () => {
    if (selectedColumn > 0) {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setSelectedColumn(selectedColumn - 1);
    }
  };

  const moveRight = async () => {
    if (selectedColumn < COLS - 1) {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setSelectedColumn(selectedColumn + 1);
    }
  };

  const handleDrop = async () => {
    await dropPiece(selectedColumn);
  };

  const getCellColor = (cell) => {
    if (cell === PLAYER) return "#06D6A0"; // Bright cyan-green
    if (cell === AI) return "#F72585"; // Bright magenta-pink
    return "transparent";
  };

  const getStatusText = () => {
    if (gameOver) {
      if (winner === PLAYER) return "🎉 Victory!";
      if (winner === AI) return "🤖 AI Won!";
      return "🤝 Draw!";
    }
    if (isThinking) return "AI thinking...";
    return currentPlayer === PLAYER ? "Your Turn" : "AI's Turn";
  };

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="light" />

      {/* Cosmic background */}
      <LinearGradient
        colors={["#1a0b2e", "#16213e", "#0f3460", "#533a7d"]}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      />

      {/* Animated stars */}
      <NightSkyBackground />

      {/* Header */}
      <View
        style={{
          paddingTop: insets.top + 16,
          paddingHorizontal: 20,
          marginBottom: 16,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <TouchableOpacity
            onPress={() => router.back()}
            style={{
              padding: 12,
              borderRadius: 16,
              backgroundColor: "rgba(255, 255, 255, 0.1)",
              borderWidth: 1,
              borderColor: "rgba(255, 255, 255, 0.2)",
            }}
          >
            <ArrowLeft size={24} color="#E0E7FF" />
          </TouchableOpacity>

          <Text
            style={{
              fontSize: 22,
              fontWeight: "bold",
              color: "#E0E7FF",
              textShadowColor: "#8B5CF6",
              textShadowOffset: { width: 0, height: 0 },
              textShadowRadius: 10,
            }}
          >
            Connect Four
          </Text>

          <TouchableOpacity
            onPress={resetGame}
            style={{
              padding: 12,
              borderRadius: 16,
              backgroundColor: "rgba(255, 255, 255, 0.1)",
              borderWidth: 1,
              borderColor: "rgba(255, 255, 255, 0.2)",
            }}
          >
            <RotateCcw size={24} color="#E0E7FF" />
          </TouchableOpacity>
        </View>

        {/* PERSISTENT SCORE DISPLAY - Shows real win/loss record forever! */}
        <View style={{ borderRadius: 16, overflow: "hidden" }}>
          <BlurView
            intensity={40}
            tint="dark"
            style={{
              backgroundColor: "rgba(139, 92, 246, 0.2)",
              borderWidth: 1,
              borderColor: "rgba(224, 231, 255, 0.3)",
              borderRadius: 16,
              paddingHorizontal: 16,
              paddingVertical: 8,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Text
                style={{ fontSize: 12, fontWeight: "600", color: "#06D6A0" }}
              >
                You {isLoadingStats ? "..." : totalScore.player}
              </Text>

              <Text
                style={{ fontSize: 12, fontWeight: "600", color: "#E0E7FF" }}
              >
                {getStatusText()}
              </Text>

              <Text
                style={{ fontSize: 12, fontWeight: "600", color: "#F72585" }}
              >
                AI {isLoadingStats ? "..." : totalScore.ai}
              </Text>
            </View>
          </BlurView>
        </View>
      </View>

      {/* Game Area */}
      <View
        style={{ flex: 1, justifyContent: "center", paddingHorizontal: 20 }}
      >
        {/* Column Arrow */}
        <View
          style={{
            flexDirection: "row",
            marginBottom: 12,
            justifyContent: "center",
          }}
        >
          {Array(COLS)
            .fill(null)
            .map((_, col) => (
              <View
                key={col}
                style={{
                  width: CELL_SIZE + 6,
                  alignItems: "center",
                  marginHorizontal: 1,
                }}
              >
                {selectedColumn === col &&
                  currentPlayer === PLAYER &&
                  !gameOver && (
                    <ArrowDown
                      size={20}
                      color="#06D6A0"
                      style={{
                        shadowColor: "#06D6A0",
                        shadowOffset: { width: 0, height: 0 },
                        shadowOpacity: 1,
                        shadowRadius: 8,
                      }}
                    />
                  )}
              </View>
            ))}
        </View>

        {/* Beautiful glassmorphic game board */}
        <View
          style={{ borderRadius: 24, overflow: "hidden", marginBottom: 24 }}
        >
          <BlurView
            intensity={60}
            tint="dark"
            style={{
              backgroundColor: "rgba(139, 92, 246, 0.15)",
              borderWidth: 2,
              borderColor: "rgba(224, 231, 255, 0.3)",
              borderRadius: 24,
              padding: 16,
              shadowColor: "#8B5CF6",
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.3,
              shadowRadius: 16,
              elevation: 10,
            }}
          >
            {board.map((row, rowIndex) => (
              <View
                key={rowIndex}
                style={{
                  flexDirection: "row",
                  marginBottom: rowIndex === ROWS - 1 ? 0 : 6,
                  justifyContent: "center",
                }}
              >
                {row.map((cell, colIndex) => (
                  <View
                    key={colIndex}
                    style={{
                      width: CELL_SIZE,
                      height: CELL_SIZE,
                      borderRadius: CELL_SIZE / 2,
                      marginHorizontal: 3,
                      backgroundColor: "rgba(30, 41, 59, 0.4)",
                      borderWidth: 1,
                      borderColor: "rgba(224, 231, 255, 0.2)",
                      alignItems: "center",
                      justifyContent: "center",
                      shadowColor: "#000",
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.3,
                      shadowRadius: 4,
                      elevation: 2,
                    }}
                  >
                    {cell !== EMPTY && (
                      <View
                        style={{
                          width: CELL_SIZE - 8,
                          height: CELL_SIZE - 8,
                          borderRadius: (CELL_SIZE - 8) / 2,
                          backgroundColor: getCellColor(cell),
                          shadowColor: getCellColor(cell),
                          shadowOffset: { width: 0, height: 0 },
                          shadowOpacity: 1,
                          shadowRadius: 8,
                          elevation: 8,
                          borderWidth: 2,
                          borderColor: "rgba(255, 255, 255, 0.3)",
                        }}
                      />
                    )}
                  </View>
                ))}
              </View>
            ))}
          </BlurView>
        </View>

        {/* Magical controls */}
        <View style={{ borderRadius: 20, overflow: "hidden" }}>
          <BlurView
            intensity={50}
            tint="dark"
            style={{
              backgroundColor: "rgba(139, 92, 246, 0.2)",
              borderWidth: 1,
              borderColor: "rgba(224, 231, 255, 0.3)",
              borderRadius: 20,
              padding: 16,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <TouchableOpacity
                onPress={moveLeft}
                disabled={
                  selectedColumn === 0 || currentPlayer !== PLAYER || gameOver
                }
                style={{
                  backgroundColor:
                    selectedColumn === 0 || currentPlayer !== PLAYER || gameOver
                      ? "rgba(100, 116, 139, 0.3)"
                      : "rgba(6, 214, 160, 0.3)",
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  borderRadius: 12,
                  flex: 1,
                  borderWidth: 1,
                  borderColor:
                    selectedColumn === 0 || currentPlayer !== PLAYER || gameOver
                      ? "rgba(148, 163, 184, 0.3)"
                      : "rgba(6, 214, 160, 0.5)",
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "700",
                    color:
                      selectedColumn === 0 ||
                      currentPlayer !== PLAYER ||
                      gameOver
                        ? "#94A3B8"
                        : "#06D6A0",
                    textAlign: "center",
                  }}
                >
                  ← LEFT
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleDrop}
                disabled={
                  !isValidMove(board, selectedColumn) ||
                  currentPlayer !== PLAYER ||
                  gameOver
                }
                style={{
                  backgroundColor:
                    !isValidMove(board, selectedColumn) ||
                    currentPlayer !== PLAYER ||
                    gameOver
                      ? "rgba(100, 116, 139, 0.3)"
                      : "rgba(168, 85, 247, 0.4)",
                  paddingHorizontal: 20,
                  paddingVertical: 12,
                  borderRadius: 12,
                  flex: 1.2,
                  borderWidth: 2,
                  borderColor:
                    !isValidMove(board, selectedColumn) ||
                    currentPlayer !== PLAYER ||
                    gameOver
                      ? "rgba(148, 163, 184, 0.3)"
                      : "rgba(168, 85, 247, 0.6)",
                  shadowColor: "#A855F7",
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.3,
                  shadowRadius: 8,
                  elevation: 5,
                }}
              >
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "800",
                    color:
                      !isValidMove(board, selectedColumn) ||
                      currentPlayer !== PLAYER ||
                      gameOver
                        ? "#94A3B8"
                        : "#E0E7FF",
                    textAlign: "center",
                    textShadowColor: "#8B5CF6",
                    textShadowOffset: { width: 0, height: 0 },
                    textShadowRadius: 6,
                  }}
                >
                  DROP
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={moveRight}
                disabled={
                  selectedColumn === COLS - 1 ||
                  currentPlayer !== PLAYER ||
                  gameOver
                }
                style={{
                  backgroundColor:
                    selectedColumn === COLS - 1 ||
                    currentPlayer !== PLAYER ||
                    gameOver
                      ? "rgba(100, 116, 139, 0.3)"
                      : "rgba(6, 214, 160, 0.3)",
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  borderRadius: 12,
                  flex: 1,
                  borderWidth: 1,
                  borderColor:
                    selectedColumn === COLS - 1 ||
                    currentPlayer !== PLAYER ||
                    gameOver
                      ? "rgba(148, 163, 184, 0.3)"
                      : "rgba(6, 214, 160, 0.5)",
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "700",
                    color:
                      selectedColumn === COLS - 1 ||
                      currentPlayer !== PLAYER ||
                      gameOver
                        ? "#94A3B8"
                        : "#06D6A0",
                    textAlign: "center",
                  }}
                >
                  RIGHT →
                </Text>
              </TouchableOpacity>
            </View>
          </BlurView>
        </View>
      </View>

      <View style={{ paddingBottom: insets.bottom + 20 }} />
    </View>
  );
}
