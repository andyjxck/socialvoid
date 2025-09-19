// src/app/(tabs)/games/connect_4.jsx
import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
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
} from "../../../hooks/useGameStats";

const { width: screenWidth } = Dimensions.get("window");
const ROWS = 6;
const COLS = 7;
const EMPTY = 0;
const PLAYER = 1;
const AI = 2;

const CELL_SIZE = Math.min(45, (screenWidth - 80) / COLS);

export default function Connect4Game() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  // Board + flow state
  const [board, setBoard] = useState(() =>
    Array(ROWS)
      .fill(null)
      .map(() => Array(COLS).fill(EMPTY))
  );
  const [currentPlayer, setCurrentPlayer] = useState(PLAYER);
  const [winner, setWinner] = useState(null); // null | PLAYER | AI
  const [gameOver, setGameOver] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [selectedColumn, setSelectedColumn] = useState(3);

  // IDs
  const [currentPlayerId, setCurrentPlayerId] = useState(null);
  const [gameId, setGameId] = useState(null);

  // Scores
  const [sessionScore, setSessionScore] = useState({ player: 0, ai: 0 });
  const [totalScore, setTotalScore] = useState({ player: 0, ai: 0 });

  // One-shot guard for finishing logic
  const endHandledRef = useRef(false);

  // Persistent stats hook
 const { stats, isLoading: isLoadingStats } = useGameStats(
  currentPlayerId,
   gameId           // ✅ numeric ID from the DB
 );

  // Load totals from persistent stats
  useEffect(() => {
    if (!stats) return;
    const playerWins = stats.high_score || 0;
    const totalGames = stats.total_plays || 0;
    const aiWins = Math.max(0, totalGames - playerWins);
    setTotalScore({ player: playerWins, ai: aiWins });
    // console.log("🎮 Connect 4 persistent stats loaded:", { playerWins, aiWins, totalGames });
  }, [stats]);

  // Load player id
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem("puzzle_hub_player_id");
        setCurrentPlayerId(saved ? parseInt(saved, 10) : 1);
      } catch (e) {
        console.error("Failed to load player ID:", e);
        setCurrentPlayerId(1);
      }
    })();
  }, []);

  // Resolve game id + start tracking once
  useEffect(() => {
    let active = true;
    (async () => {
      if (!currentPlayerId) return;
      const id = await getGameId(GAME_TYPES.CONNECT_4);
      if (!active) return;
      if (id) {
        setGameId(id);
        // start tracking AFTER both ids exist
        await gameTracker.startGame(id, currentPlayerId);
      }
    })();
    return () => {
      active = false;
      // do NOT auto-end here; endings are handled by outcome only
    };
  }, [currentPlayerId]);

  // ---------- game helpers ----------
  const isValidMove = (brd, col) => brd[0][col] === EMPTY;

  const getLowestRow = (brd, col) => {
    for (let row = ROWS - 1; row >= 0; row--) {
      if (brd[row][col] === EMPTY) return row;
    }
    return -1;
  };

  const checkWinner = (brd, row, col, who) => {
    const dirs = [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1],
    ];
    for (const [dr, dc] of dirs) {
      let count = 1;

      for (let i = 1; i < 4; i++) {
        const r = row + dr * i;
        const c = col + dc * i;
        if (r >= 0 && r < ROWS && c >= 0 && c < COLS && brd[r][c] === who) {
          count++;
        } else break;
      }
      for (let i = 1; i < 4; i++) {
        const r = row - dr * i;
        const c = col - dc * i;
        if (r >= 0 && r < ROWS && c >= 0 && c < COLS && brd[r][c] === who) {
          count++;
        } else break;
      }
      if (count >= 4) return true;
    }
    return false;
  };

  const getAIMove = (brd) => {
    // 1) winning move
    for (let col = 0; col < COLS; col++) {
      if (isValidMove(brd, col)) {
        const t = brd.map((r) => [...r]);
        const row = getLowestRow(t, col);
        t[row][col] = AI;
        if (checkWinner(t, row, col, AI)) return col;
      }
    }
    // 2) block player
    for (let col = 0; col < COLS; col++) {
      if (isValidMove(brd, col)) {
        const t = brd.map((r) => [...r]);
        const row = getLowestRow(t, col);
        t[row][col] = PLAYER;
        if (checkWinner(t, row, col, PLAYER)) return col;
      }
    }
    // 3) center bias
    const bag = [];
    for (let col = 0; col < COLS; col++) {
      if (isValidMove(brd, col)) {
        const weight = col === 3 ? 4 : col === 2 || col === 4 ? 3 : col === 1 || col === 5 ? 2 : 1;
        for (let i = 0; i < weight; i++) bag.push(col);
      }
    }
    return bag[Math.floor(Math.random() * bag.length)];
  };

  // ---------- actions ----------
  const dropPiece = async (col) => {
    if (gameOver || currentPlayer !== PLAYER || !isValidMove(board, col)) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const newBoard = board.map((r) => [...r]);
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

    if (newBoard.every((r) => r.every((c) => c !== EMPTY))) {
      setGameOver(true);
      Alert.alert("🤝 Draw!", "Good game! Try again?");
      return;
    }

    setCurrentPlayer(AI);
  };

  // AI turn (clean timeout + minimal deps)
  useEffect(() => {
    if (currentPlayer !== AI || gameOver) return;
    setIsThinking(true);
    const t = setTimeout(async () => {
      const aiCol = getAIMove(board);
      const newBoard = board.map((r) => [...r]);
      const row = getLowestRow(newBoard, aiCol);
      newBoard[row][aiCol] = AI;

      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      setBoard(newBoard);
      setIsThinking(false);

      if (checkWinner(newBoard, row, aiCol, AI)) {
        setWinner(AI);
        setGameOver(true);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        Alert.alert("🤖 AI Wins!", "The AI got you this time. Try again!");
        return;
      }

      if (newBoard.every((r) => r.every((c) => c !== EMPTY))) {
        setGameOver(true);
        Alert.alert("🤝 Draw!", "Good game! Try again?");
        return;
      }

      setCurrentPlayer(PLAYER);
    }, 600);

    return () => clearTimeout(t);
  }, [currentPlayer, gameOver, board]);

  // ---------- one-shot finish handler ----------
  useEffect(() => {
    if (winner === null || !gameId || !currentPlayerId) return;
    if (endHandledRef.current) return; // already handled
    endHandledRef.current = true;

    const isWin = winner === PLAYER;
    const deltaPlayer = isWin ? 1 : 0;
    const deltaAI = isWin ? 0 : 1;

    // Update session score ONCE (functional to avoid deps)
    setSessionScore((prev) => ({
      player: prev.player + deltaPlayer,
      ai: prev.ai + deltaAI,
    }));

    // Update total score (persistent + this match)
    setTotalScore((prev) => ({
      player: prev.player + deltaPlayer,
      ai: prev.ai + deltaAI,
    }));

    // End the tracked session ONCE
    try {
      gameTracker.endGame(gameId, isWin ? 1 : 0, { winner: isWin ? "Player" : "AI" });
    } catch (e) {
      console.warn("endGame failed:", e?.message);
    }

    // eslint-disable-next-line no-console
    console.log("🎯 Connect 4 game completed:", {
      winner: isWin ? "Player" : "AI",
    });
  }, [winner, gameId, currentPlayerId]);

  // ---------- controls ----------
  const resetGame = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    // allow a new one-shot finish next match
    endHandledRef.current = false;

    setBoard(
      Array(ROWS)
        .fill(null)
        .map(() => Array(COLS).fill(EMPTY))
    );
    setCurrentPlayer(PLAYER);
    setWinner(null);
    setGameOver(false);
    setIsThinking(false);
    setSelectedColumn(3);

    // start a fresh tracked session for the same game/player
    if (gameId && currentPlayerId) {
      await gameTracker.startGame(gameId, currentPlayerId);
    }
  };

  const moveLeft = async () => {
    if (selectedColumn > 0 && currentPlayer === PLAYER && !gameOver) {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setSelectedColumn((c) => c - 1);
    }
  };

  const moveRight = async () => {
    if (selectedColumn < COLS - 1 && currentPlayer === PLAYER && !gameOver) {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setSelectedColumn((c) => c + 1);
    }
  };

  const handleDrop = async () => {
    await dropPiece(selectedColumn);
  };

  const getCellColor = (cell) => {
    if (cell === PLAYER) return "#06D6A0";
    if (cell === AI) return "#F72585";
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

        {/* Persistent score */}
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
              <Text style={{ fontSize: 12, fontWeight: "600", color: "#06D6A0" }}>
                You {isLoadingStats ? "..." : totalScore.player}
              </Text>

              <Text style={{ fontSize: 12, fontWeight: "600", color: "#E0E7FF" }}>
                {getStatusText()}
              </Text>

              <Text style={{ fontSize: 12, fontWeight: "600", color: "#F72585" }}>
                AI {isLoadingStats ? "..." : totalScore.ai}
              </Text>
            </View>
          </BlurView>
        </View>
      </View>

      {/* Game Area */}
      <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 20 }}>
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
                {selectedColumn === col && currentPlayer === PLAYER && !gameOver && (
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

        {/* Board */}
        <View style={{ borderRadius: 24, overflow: "hidden", marginBottom: 24 }}>
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

        {/* Controls */}
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
                onPress={async () => {
                  if (selectedColumn > 0 && currentPlayer === PLAYER && !gameOver) {
                    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedColumn((c) => c - 1);
                  }
                }}
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
                      selectedColumn === 0 || currentPlayer !== PLAYER || gameOver
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
                  }}
                >
                  DROP
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={async () => {
                  if (
                    selectedColumn < COLS - 1 &&
                    currentPlayer === PLAYER &&
                    !gameOver
                  ) {
                    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedColumn((c) => c + 1);
                  }
                }}
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
