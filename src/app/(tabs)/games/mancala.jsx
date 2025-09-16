import React, { useState, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, Dimensions, Alert } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../../../utils/theme";
import { BlurView } from "expo-blur";
import { router } from "expo-router";
import { ArrowLeft, RotateCcw } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import gameTracker from "../../../utils/gameTracking";
import { getGameId, GAME_TYPES } from "../../../utils/gameUtils";
import { useGameStats, GAME_STATS_TYPES } from "../../../hooks/useGameStats";
import NightSkyBackground from "../../../components/NightSkyBackground";

const { width: screenWidth, height: screenHeight } = Dimensions.get("window");

export default function MancalaGame() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const [currentPlayerId, setCurrentPlayerId] = useState(1);
  const [gameId, setGameId] = useState(null);

  // 🎯 USE PERSISTENT STATS!
  const {
    stats,
    isLoading: isLoadingStats,
    error: statsError,
  } = useGameStats(currentPlayerId, GAME_STATS_TYPES.MANCALA);

  // Calculate persistent win/loss record
  const [persistentScore, setPersistentScore] = useState({ player: 0, ai: 0 });

  useEffect(() => {
    if (stats) {
      const playerWins = stats.high_score || 0; // wins stored in high_score
      const totalGames = stats.total_plays || 0;
      const aiWins = Math.max(0, totalGames - playerWins);

      setPersistentScore({ player: playerWins, ai: aiWins });
      console.log("🎮 Mancala persistent stats:", {
        playerWins,
        aiWins,
        totalGames,
      });
    }
  }, [stats]);

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
      const id = await getGameId(GAME_TYPES.MANCALA);
      if (id && currentPlayerId && mounted) {
        currentGameId = id;
        setGameId(id);
        await gameTracker.startGame(id, currentPlayerId);
        console.log("🎮 Mancala tracking started:", id);
      } else if (mounted) {
        console.error("❌ Could not get Mancala game ID or player ID");
      }
    };
    setupGame();

    return () => {
      mounted = false;
    };
  }, [currentPlayerId]);

  // Game state
  const [board, setBoard] = useState([]);
  const [currentPlayer, setCurrentPlayer] = useState("player"); // "player" or "ai"
  const [gameOver, setGameOver] = useState(false);
  const [winner, setWinner] = useState(null);
  const [aiThinking, setAiThinking] = useState(false);
  const [playerStats, setPlayerStats] = useState({
    wins: 0,
    losses: 0,
    gamesPlayed: 0,
    averageScore: 24,
    difficulty: 0.5,
  });

  // Board layout constants
  const PLAYER_PITS = [0, 1, 2, 3, 4, 5];
  const PLAYER_STORE = 6;
  const AI_PITS = [7, 8, 9, 10, 11, 12];
  const AI_STORE = 13;

  // Initialize game
  const initializeGame = useCallback(() => {
    const newBoard = [
      4,
      4,
      4,
      4,
      4,
      4, // Player pits (0-5)
      0, // Player store (6)
      4,
      4,
      4,
      4,
      4,
      4, // AI pits (7-12)
      0, // AI store (13)
    ];

    setBoard(newBoard);
    setCurrentPlayer("player");
    setGameOver(false);
    setWinner(null);
    setAiThinking(false);
  }, []);

  // Check if game is over
  const isGameOver = (board) => {
    const playerPitsEmpty = PLAYER_PITS.every((pit) => board[pit] === 0);
    const aiPitsEmpty = AI_PITS.every((pit) => board[pit] === 0);
    return playerPitsEmpty || aiPitsEmpty;
  };

  // Collect remaining stones when game ends
  const collectRemainingStones = (board) => {
    const newBoard = [...board];

    PLAYER_PITS.forEach((pit) => {
      newBoard[PLAYER_STORE] += newBoard[pit];
      newBoard[pit] = 0;
    });

    AI_PITS.forEach((pit) => {
      newBoard[AI_STORE] += newBoard[pit];
      newBoard[pit] = 0;
    });

    return newBoard;
  };

  // Mancala movement logic
  const makeMove = (board, pitIndex, isPlayer) => {
    const newBoard = [...board];
    let stones = newBoard[pitIndex];

    if (stones === 0) return null;

    newBoard[pitIndex] = 0;
    let currentIndex = pitIndex;

    for (let i = 0; i < stones; i++) {
      currentIndex = (currentIndex + 1) % 14;

      if (
        (isPlayer && currentIndex === AI_STORE) ||
        (!isPlayer && currentIndex === PLAYER_STORE)
      ) {
        currentIndex = (currentIndex + 1) % 14;
      }

      newBoard[currentIndex]++;
    }

    const lastStoneInOwnStore =
      (isPlayer && currentIndex === PLAYER_STORE) ||
      (!isPlayer && currentIndex === AI_STORE);

    // Capture logic
    if (!lastStoneInOwnStore && newBoard[currentIndex] === 1) {
      const isOnPlayerSide = PLAYER_PITS.includes(currentIndex);
      const isOnAISide = AI_PITS.includes(currentIndex);

      if ((isPlayer && isOnPlayerSide) || (!isPlayer && isOnAISide)) {
        let oppositePit = 12 - currentIndex;

        if (
          oppositePit >= 0 &&
          oppositePit <= 13 &&
          oppositePit !== PLAYER_STORE &&
          oppositePit !== AI_STORE &&
          newBoard[oppositePit] > 0
        ) {
          const capturedStones = newBoard[oppositePit] + newBoard[currentIndex];
          newBoard[oppositePit] = 0;
          newBoard[currentIndex] = 0;

          if (isPlayer) {
            newBoard[PLAYER_STORE] += capturedStones;
          } else {
            newBoard[AI_STORE] += capturedStones;
          }
        }
      }
    }

    return {
      board: newBoard,
      extraTurn: lastStoneInOwnStore,
    };
  };

  // AI strategy
  const evaluateMove = (board, pitIndex, difficulty) => {
    const result = makeMove(board, pitIndex, false);
    if (!result) return -1000;

    let score = result.board[AI_STORE] * 8;
    const extraTurnBonus = 5 + difficulty * 10;
    if (result.extraTurn) score += extraTurnBonus;

    const originalAIStones = board[AI_STORE];
    const captureBonus = (result.board[AI_STORE] - originalAIStones - 1) * 3;
    if (captureBonus > 0) score += captureBonus;

    const randomFactor = (1.5 - difficulty) * 20;
    score += (Math.random() - 0.5) * randomFactor;

    if (difficulty < 0.7 && Math.random() < 0.3 - difficulty * 0.2) {
      score *= 0.5;
    }

    return score;
  };

  const selectAIMove = (board, difficulty) => {
    const validMoves = AI_PITS.filter((pit) => board[pit] > 0);
    if (validMoves.length === 0) return null;

    if (difficulty < 0.4 && Math.random() < 0.25) {
      return validMoves[Math.floor(Math.random() * validMoves.length)];
    }

    const scoredMoves = validMoves.map((move) => ({
      move,
      score: evaluateMove(board, move, difficulty),
    }));

    scoredMoves.sort((a, b) => b.score - a.score);

    const topMovesCount = Math.max(
      1,
      Math.ceil(validMoves.length * (0.3 + difficulty * 0.7)),
    );
    const selectedIndex = Math.floor(
      Math.random() * Math.min(topMovesCount, scoredMoves.length),
    );

    return scoredMoves[selectedIndex].move;
  };

  // Update persistent stats when game ends
  const handleGameEnd = async (playerScore, aiScore) => {
    const isWin = playerScore > aiScore;

    // Update local persistent score display immediately
    setPersistentScore((prev) => ({
      player: isWin ? prev.player + 1 : prev.player,
      ai: !isWin ? prev.ai + 1 : prev.ai,
    }));

    // Update database
    if (gameId && currentPlayerId) {
      const gameScore = isWin ? 1 : 0; // 1 for win, 0 for loss
      await gameTracker.endGame(gameId, gameScore);
      console.log("🎯 Mancala game completed:", {
        winner: isWin ? "Player" : "AI",
        persistentScore: {
          player: isWin ? persistentScore.player + 1 : persistentScore.player,
          ai: !isWin ? persistentScore.ai + 1 : persistentScore.ai,
        },
      });
    }
  };

  // Execute AI move
  const executeAIMove = useCallback(async () => {
    if (currentPlayer !== "ai" || gameOver || aiThinking) return;

    setAiThinking(true);
    await new Promise((resolve) => setTimeout(resolve, 800));

    const selectedPit = selectAIMove(board, playerStats.difficulty);

    if (selectedPit !== null) {
      const result = makeMove(board, selectedPit, false);

      if (result) {
        setBoard(result.board);
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        if (isGameOver(result.board)) {
          const finalBoard = collectRemainingStones(result.board);
          setBoard(finalBoard);
          setGameOver(true);

          const playerScore = finalBoard[PLAYER_STORE];
          const aiScore = finalBoard[AI_STORE];

          // Update persistent stats
          await handleGameEnd(playerScore, aiScore);

          if (playerScore > aiScore) {
            setWinner("player");
            Alert.alert("Victory! 🎉", `You won ${playerScore} to ${aiScore}!`);
          } else if (aiScore > playerScore) {
            setWinner("ai");
            Alert.alert(
              "AI Wins 🤖",
              `AI won ${aiScore} to ${playerScore}. Try again!`,
            );
          } else {
            setWinner("tie");
            Alert.alert("Tie Game! 🤝", `Both players scored ${playerScore}!`);
          }
        } else {
          setCurrentPlayer(result.extraTurn ? "ai" : "player");
        }
      }
    }

    setAiThinking(false);
  }, [
    board,
    currentPlayer,
    gameOver,
    aiThinking,
    playerStats,
    gameId,
    currentPlayerId,
    persistentScore,
  ]);

  // Handle player move
  const handlePlayerMove = async (pitIndex) => {
    if (currentPlayer !== "player" || gameOver || aiThinking) return;
    if (!PLAYER_PITS.includes(pitIndex) || board[pitIndex] === 0) return;

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const result = makeMove(board, pitIndex, true);

    if (result) {
      setBoard(result.board);

      if (isGameOver(result.board)) {
        const finalBoard = collectRemainingStones(result.board);
        setBoard(finalBoard);
        setGameOver(true);

        const playerScore = finalBoard[PLAYER_STORE];
        const aiScore = finalBoard[AI_STORE];

        // Update persistent stats
        await handleGameEnd(playerScore, aiScore);

        if (playerScore > aiScore) {
          setWinner("player");
          Alert.alert("Victory! 🎉", `You won ${playerScore} to ${aiScore}!`);
        } else if (aiScore > playerScore) {
          setWinner("ai");
          Alert.alert(
            "AI Wins 🤖",
            `AI won ${aiScore} to ${playerScore}. Try again!`,
          );
        } else {
          setWinner("tie");
          Alert.alert("Tie Game! 🤝", `Both players scored ${playerScore}!`);
        }
      } else {
        setCurrentPlayer(result.extraTurn ? "player" : "ai");
      }
    }
  };

  // Trigger AI move when it's AI's turn
  useEffect(() => {
    if (currentPlayer === "ai" && !gameOver && !aiThinking) {
      const timeoutId = setTimeout(executeAIMove, 500);
      return () => clearTimeout(timeoutId);
    }
  }, [currentPlayer, gameOver, executeAIMove, aiThinking]);

  // Initialize game on mount
  useEffect(() => {
    initializeGame();
  }, [initializeGame]);

  const getStatusText = () => {
    if (gameOver) {
      if (winner === "player") return "🎉 Victory!";
      if (winner === "ai") return "🤖 AI Won!";
      return "🤝 Tie Game!";
    }
    if (aiThinking) return "AI Thinking...";
    return currentPlayer === "player" ? "Your Turn" : "AI's Turn";
  };

  const getStatusColor = () => {
    if (gameOver && winner === "player") return "#06D6A0";
    if (gameOver && winner === "ai") return "#F72585";
    return "#E0E7FF";
  };

  const pitSize = Math.min(48, (screenHeight - 300) / 8);

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
            Mancala
          </Text>

          <TouchableOpacity
            onPress={async () => {
              await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
              initializeGame();
            }}
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

        {/* PERSISTENT SCORE DISPLAY */}
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
                You {isLoadingStats ? "..." : persistentScore.player}
              </Text>

              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "600",
                  color: getStatusColor(),
                  textAlign: "center",
                }}
              >
                {getStatusText()}
              </Text>

              <Text
                style={{ fontSize: 12, fontWeight: "600", color: "#F72585" }}
              >
                AI {isLoadingStats ? "..." : persistentScore.ai}
              </Text>
            </View>
          </BlurView>
        </View>
      </View>

      {/* Game Board */}
      <View
        style={{
          flex: 1,
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 20,
        }}
      >
        {/* AI Store */}
        <View
          style={{ borderRadius: 16, overflow: "hidden", marginBottom: 12 }}
        >
          <BlurView
            intensity={40}
            tint="dark"
            style={{
              backgroundColor: "rgba(139, 92, 246, 0.15)",
              borderWidth: 1,
              borderColor: "rgba(224, 231, 255, 0.3)",
              borderRadius: 16,
              padding: 16,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontSize: 10,
                fontWeight: "600",
                color: "#94A3B8",
                marginBottom: 8,
              }}
            >
              AI STORE
            </Text>
            <View
              style={{
                backgroundColor: "#F72585",
                width: 60,
                height: 60,
                borderRadius: 30,
                justifyContent: "center",
                alignItems: "center",
                shadowColor: "#F72585",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 8,
                elevation: 8,
              }}
            >
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "bold",
                  color: "#FFFFFF",
                  textShadowColor: "#000",
                  textShadowRadius: 2,
                }}
              >
                {board[AI_STORE] || 0}
              </Text>
            </View>
          </BlurView>
        </View>

        {/* Game Pits */}
        <View
          style={{ borderRadius: 24, overflow: "hidden", marginBottom: 12 }}
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
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                height: 300,
              }}
            >
              {/* Player pits */}
              <View
                style={{
                  justifyContent: "space-around",
                  alignItems: "center",
                  flex: 1,
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "600",
                    color: "#06D6A0",
                    marginBottom: 8,
                  }}
                >
                  YOUR PITS
                </Text>
                {[0, 1, 2, 3, 4, 5].map((pitIndex) => (
                  <TouchableOpacity
                    key={pitIndex}
                    onPress={() => handlePlayerMove(pitIndex)}
                    disabled={
                      currentPlayer !== "player" ||
                      board[pitIndex] === 0 ||
                      gameOver ||
                      aiThinking
                    }
                    style={{
                      width: pitSize,
                      height: pitSize,
                      borderRadius: pitSize / 2,
                      backgroundColor:
                        currentPlayer === "player" &&
                        board[pitIndex] > 0 &&
                        !gameOver
                          ? "rgba(6, 214, 160, 0.8)"
                          : "rgba(30, 41, 59, 0.6)",
                      borderWidth: 2,
                      borderColor:
                        currentPlayer === "player" &&
                        board[pitIndex] > 0 &&
                        !gameOver
                          ? "#06D6A0"
                          : "rgba(148, 163, 184, 0.3)",
                      justifyContent: "center",
                      alignItems: "center",
                      shadowColor:
                        currentPlayer === "player" &&
                        board[pitIndex] > 0 &&
                        !gameOver
                          ? "#06D6A0"
                          : "transparent",
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: 1,
                      shadowRadius: 4,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "bold",
                        color: "#E0E7FF",
                      }}
                    >
                      {board[pitIndex] || 0}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* AI pits */}
              <View
                style={{
                  justifyContent: "space-around",
                  alignItems: "center",
                  flex: 1,
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "600",
                    color: "#F72585",
                    marginBottom: 8,
                  }}
                >
                  AI PITS
                </Text>
                {[12, 11, 10, 9, 8, 7].map((pitIndex) => (
                  <View
                    key={pitIndex}
                    style={{
                      width: pitSize,
                      height: pitSize,
                      borderRadius: pitSize / 2,
                      backgroundColor:
                        aiThinking && currentPlayer === "ai"
                          ? "rgba(247, 37, 133, 0.3)"
                          : "rgba(30, 41, 59, 0.6)",
                      borderWidth: 2,
                      borderColor:
                        aiThinking && currentPlayer === "ai"
                          ? "#F72585"
                          : "rgba(148, 163, 184, 0.3)",
                      justifyContent: "center",
                      alignItems: "center",
                      shadowColor:
                        aiThinking && currentPlayer === "ai"
                          ? "#F72585"
                          : "transparent",
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: 1,
                      shadowRadius: 4,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "bold",
                        color: "#E0E7FF",
                      }}
                    >
                      {board[pitIndex] || 0}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </BlurView>
        </View>

        {/* Player Store */}
        <View style={{ borderRadius: 16, overflow: "hidden" }}>
          <BlurView
            intensity={40}
            tint="dark"
            style={{
              backgroundColor: "rgba(139, 92, 246, 0.15)",
              borderWidth: 1,
              borderColor: "rgba(224, 231, 255, 0.3)",
              borderRadius: 16,
              padding: 16,
              alignItems: "center",
            }}
          >
            <View
              style={{
                backgroundColor: "#06D6A0",
                width: 60,
                height: 60,
                borderRadius: 30,
                justifyContent: "center",
                alignItems: "center",
                shadowColor: "#06D6A0",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 8,
                elevation: 8,
              }}
            >
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "bold",
                  color: "#FFFFFF",
                  textShadowColor: "#000",
                  textShadowRadius: 2,
                }}
              >
                {board[PLAYER_STORE] || 0}
              </Text>
            </View>
            <Text
              style={{
                fontSize: 10,
                fontWeight: "600",
                color: "#94A3B8",
                marginTop: 8,
              }}
            >
              YOUR STORE
            </Text>
          </BlurView>
        </View>

        {/* Game Status */}
        <Text
          style={{
            fontSize: 14,
            color: "#94A3B8",
            textAlign: "center",
            marginTop: 16,
          }}
        >
          {currentPlayer === "player"
            ? "Tap your pits to move stones!"
            : aiThinking
              ? "AI is thinking..."
              : "AI's turn..."}
        </Text>
      </View>
    </View>
  );
}
