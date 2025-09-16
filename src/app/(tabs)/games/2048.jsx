import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  PanGestureHandler,
  Dimensions,
  Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../../../utils/theme";
import { BlurView } from "expo-blur";
import { router } from "expo-router";
import { ArrowLeft, RotateCcw, Trophy } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import {
  GestureHandlerRootView,
  PanGestureHandler as RNPanGestureHandler,
} from "react-native-gesture-handler";
import AsyncStorage from "@react-native-async-storage/async-storage";
import gameTracker from "../../../utils/gameTracking";
import { getGameId, GAME_TYPES } from "../../../utils/gameUtils";
import { useGameStats, GAME_STATS_TYPES } from "../../../hooks/useGameStats";
import NightSkyBackground from "../../../components/NightSkyBackground";

const { width: screenWidth } = Dimensions.get("window");

export default function Game2048() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const [currentPlayerId, setCurrentPlayerId] = useState(null);
  const [gameId, setGameId] = useState(null);

  // 🎯 USE PERSISTENT STATS!
  const {
    stats,
    isLoading: isLoadingStats,
    error: statsError,
  } = useGameStats(currentPlayerId, GAME_STATS_TYPES.TWENTY_FORTY_EIGHT);

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

    const setupGame = async () => {
      if (!currentPlayerId) return;

      const id = await getGameId(GAME_TYPES.TWENTY48);
      if (id && currentPlayerId && mounted) {
        setGameId(id);
        await gameTracker.startGame(id, currentPlayerId);
        console.log("🎮 2048 tracking started:", id);
      } else if (mounted) {
        console.error("❌ Could not get 2048 game ID or player ID");
      }
    };

    setupGame();

    return () => {
      mounted = false;
    };
  }, [currentPlayerId]);

  // Game state
  const [board, setBoard] = useState([]);
  const [score, setScore] = useState(0);
  const [timer, setTimer] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [gameWon, setGameWon] = useState(false);
  const [gestureHandled, setGestureHandled] = useState(false);

  const GRID_SIZE = 4;
  const TILE_SIZE = (screenWidth - 80) / GRID_SIZE - 8;

  // Initialize empty board
  const createEmptyBoard = () => {
    return Array(GRID_SIZE)
      .fill(null)
      .map(() => Array(GRID_SIZE).fill(0));
  };

  // Add random tile
  const addRandomTile = (currentBoard) => {
    const emptyCells = [];
    for (let i = 0; i < GRID_SIZE; i++) {
      for (let j = 0; j < GRID_SIZE; j++) {
        if (currentBoard[i][j] === 0) {
          emptyCells.push({ row: i, col: j });
        }
      }
    }

    if (emptyCells.length > 0) {
      const randomCell =
        emptyCells[Math.floor(Math.random() * emptyCells.length)];

      const highestTile = Math.max(...currentBoard.flat());
      const availableTiles = [];

      availableTiles.push({ value: 2, weight: 70 });
      availableTiles.push({ value: 4, weight: 25 });

      if (highestTile >= 128) {
        availableTiles.push({ value: 8, weight: 4 });
      }
      if (highestTile >= 256) {
        availableTiles.push({ value: 16, weight: 0.8 });
      }
      if (highestTile >= 512) {
        availableTiles.push({ value: 32, weight: 0.2 });
      }

      const totalWeight = availableTiles.reduce(
        (sum, tile) => sum + tile.weight,
        0,
      );
      let random = Math.random() * totalWeight;

      let selectedValue = 2;
      for (const tile of availableTiles) {
        random -= tile.weight;
        if (random <= 0) {
          selectedValue = tile.value;
          break;
        }
      }

      const newBoard = currentBoard.map((row) => [...row]);
      newBoard[randomCell.row][randomCell.col] = selectedValue;
      return newBoard;
    }
    return currentBoard;
  };

  // Initialize game
  const initializeGame = useCallback(() => {
    let newBoard = createEmptyBoard();
    newBoard = addRandomTile(newBoard);
    newBoard = addRandomTile(newBoard);

    setBoard(newBoard);
    setScore(0);
    setTimer(0);
    setGameStarted(true);
    setGameOver(false);
    setGameWon(false);
  }, []);

  // Timer effect
  useEffect(() => {
    let interval;
    if (gameStarted && !gameOver && !gameWon) {
      interval = setInterval(() => {
        setTimer((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [gameStarted, gameOver, gameWon]);

 useEffect(() => {
  return () => {
    if (gameId && currentPlayerId) {
      gameTracker.endGame(gameId, score);
    }
  };
}, [gameId, currentPlayerId, score]);

  // Move tiles in direction
  const moveTiles = async (direction) => {
    if (gameOver || gameWon) return;

    let newBoard = board.map((row) => [...row]);
    let newScore = score;
    let moved = false;

    const slideArray = (arr) => {
      let filtered = arr.filter((val) => val !== 0);

      for (let i = 0; i < filtered.length - 1; i++) {
        if (filtered[i] === filtered[i + 1]) {
          filtered[i] *= 2;
          filtered[i + 1] = 0;
          newScore += filtered[i];

          if (filtered[i] === 2048 && !gameWon) {
            setGameWon(true);
          }
        }
      }

      filtered = filtered.filter((val) => val !== 0);

      while (filtered.length < GRID_SIZE) {
        filtered.push(0);
      }

      return filtered;
    };

    if (direction === "left") {
      for (let i = 0; i < GRID_SIZE; i++) {
        const originalRow = [...newBoard[i]];
        newBoard[i] = slideArray(newBoard[i]);
        if (JSON.stringify(originalRow) !== JSON.stringify(newBoard[i])) {
          moved = true;
        }
      }
    } else if (direction === "right") {
      for (let i = 0; i < GRID_SIZE; i++) {
        const originalRow = [...newBoard[i]];
        newBoard[i] = slideArray(newBoard[i].reverse()).reverse();
        if (JSON.stringify(originalRow) !== JSON.stringify(newBoard[i])) {
          moved = true;
        }
      }
    } else if (direction === "up") {
      for (let j = 0; j < GRID_SIZE; j++) {
        const column = [];
        for (let i = 0; i < GRID_SIZE; i++) {
          column.push(newBoard[i][j]);
        }
        const originalColumn = [...column];
        const newColumn = slideArray(column);
        for (let i = 0; i < GRID_SIZE; i++) {
          newBoard[i][j] = newColumn[i];
        }
        if (JSON.stringify(originalColumn) !== JSON.stringify(newColumn)) {
          moved = true;
        }
      }
    } else if (direction === "down") {
      for (let j = 0; j < GRID_SIZE; j++) {
        const column = [];
        for (let i = 0; i < GRID_SIZE; i++) {
          column.push(newBoard[i][j]);
        }
        const originalColumn = [...column];
        const newColumn = slideArray(column.reverse()).reverse();
        for (let i = 0; i < GRID_SIZE; i++) {
          newBoard[i][j] = newColumn[i];
        }
        if (JSON.stringify(originalColumn) !== JSON.stringify(newColumn)) {
          moved = true;
        }
      }
    }

    if (moved) {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      newBoard = addRandomTile(newBoard);
      setBoard(newBoard);
      setScore(newScore);

      if (isGameOver(newBoard)) {
        setGameOver(true);
      }
    }
  };

  // Check if game is over
  const isGameOver = (currentBoard) => {
    for (let i = 0; i < GRID_SIZE; i++) {
      for (let j = 0; j < GRID_SIZE; j++) {
        if (currentBoard[i][j] === 0) return false;
      }
    }

    for (let i = 0; i < GRID_SIZE; i++) {
      for (let j = 0; j < GRID_SIZE; j++) {
        const current = currentBoard[i][j];
        if (
          (i < GRID_SIZE - 1 && current === currentBoard[i + 1][j]) ||
          (j < GRID_SIZE - 1 && current === currentBoard[i][j + 1])
        ) {
          return false;
        }
      }
    }

    return true;
  };

  // Handle gesture
  const onHandlerStateChange = ({ nativeEvent }) => {
    if (nativeEvent.state === 1) {
      setGestureHandled(false);
    } else if (nativeEvent.state === 5) {
      setGestureHandled(false);
    }
  };

  const onGestureEvent = ({ nativeEvent }) => {
    if (gestureHandled) return;

    const { translationX, translationY } = nativeEvent;
    const absX = Math.abs(translationX);
    const absY = Math.abs(translationY);
    const threshold = 50;

    if (absX > threshold || absY > threshold) {
      setGestureHandled(true);

      if (absX > absY) {
        if (translationX > 0) {
          moveTiles("right");
        } else {
          moveTiles("left");
        }
      } else {
        if (translationY > 0) {
          moveTiles("down");
        } else {
          moveTiles("up");
        }
      }
    }
  };

  // Get tile color
  const getTileColor = (value) => {
    const tileColors = {
      2: "#EEE4DA",
      4: "#EDE0C8",
      8: "#F2B179",
      16: "#F59563",
      32: "#F67C5F",
      64: "#F65E3B",
      128: "#EDCF72",
      256: "#EDCC61",
      512: "#EDC850",
      1024: "#EDC53F",
      2048: "#EDC22E",
    };
    return tileColors[value] || "#3C4043";
  };

  const getTextColor = (value) => {
    return value <= 4 ? "#776E65" : "#FFFFFF";
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Initialize game on mount
  useEffect(() => {
    initializeGame();
  }, [initializeGame]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
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
              2048
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

          {/* PERSISTENT STATS DISPLAY */}
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
                <View style={{ alignItems: "center" }}>
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: "600",
                      color: "#94A3B8",
                    }}
                  >
                    HIGH SCORE
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: "#06D6A0",
                    }}
                  >
                    {isLoadingStats
                      ? "..."
                      : (stats?.high_score || 0).toLocaleString()}
                  </Text>
                </View>

                <View style={{ alignItems: "center" }}>
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: "600",
                      color: "#94A3B8",
                    }}
                  >
                    CURRENT
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: "#E0E7FF",
                    }}
                  >
                    {score.toLocaleString()}
                  </Text>
                </View>

                <View style={{ alignItems: "center" }}>
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: "600",
                      color: "#94A3B8",
                    }}
                  >
                    BEST TILE
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: "#F72585",
                    }}
                  >
                    {Math.max(...board.flat()) || 0}
                  </Text>
                </View>
              </View>
            </BlurView>
          </View>
        </View>

        {/* Game Info */}
        <View
          style={{
            marginHorizontal: 20,
            marginBottom: 16,
          }}
        >
          <View style={{ borderRadius: 12, overflow: "hidden" }}>
            <BlurView
              intensity={30}
              tint="dark"
              style={{
                backgroundColor: "rgba(30, 41, 59, 0.4)",
                borderWidth: 1,
                borderColor: "rgba(148, 163, 184, 0.3)",
                borderRadius: 12,
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
                <View style={{ alignItems: "center" }}>
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: "600",
                      color: "#94A3B8",
                    }}
                  >
                    TIME
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: "#E0E7FF",
                    }}
                  >
                    {formatTime(timer)}
                  </Text>
                </View>

                <View style={{ alignItems: "center" }}>
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: "600",
                      color: "#94A3B8",
                    }}
                  >
                    GAMES
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: "#A855F7",
                    }}
                  >
                    {isLoadingStats ? "..." : stats?.total_plays || 0}
                  </Text>
                </View>

                <View style={{ alignItems: "center" }}>
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: "600",
                      color: "#94A3B8",
                    }}
                  >
                    STATUS
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: gameWon
                        ? "#06D6A0"
                        : gameOver
                          ? "#F72585"
                          : "#E0E7FF",
                    }}
                  >
                    {gameWon ? "Won!" : gameOver ? "Game Over" : "Playing"}
                  </Text>
                </View>
              </View>
            </BlurView>
          </View>
        </View>

        {/* Game board */}
        <RNPanGestureHandler
          onGestureEvent={onGestureEvent}
          onHandlerStateChange={onHandlerStateChange}
        >
          <View
            style={{
              flex: 1,
              paddingHorizontal: 20,
              paddingBottom: insets.bottom + 60,
              justifyContent: "center",
            }}
          >
            <View style={{ borderRadius: 24, overflow: "hidden" }}>
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
                    width: screenWidth - 80,
                    height: screenWidth - 80,
                    alignSelf: "center",
                  }}
                >
                  {board.map((row, rowIndex) => (
                    <View
                      key={rowIndex}
                      style={{
                        flexDirection: "row",
                        flex: 1,
                      }}
                    >
                      {row.map((value, colIndex) => (
                        <View
                          key={`${rowIndex}-${colIndex}`}
                          style={{
                            flex: 1,
                            margin: 4,
                            borderRadius: 8,
                            backgroundColor:
                              value === 0
                                ? "rgba(30, 41, 59, 0.6)"
                                : getTileColor(value),
                            justifyContent: "center",
                            alignItems: "center",
                          }}
                        >
                          {value !== 0 && (
                            <Text
                              style={{
                                fontSize:
                                  value >= 1000 ? 16 : value >= 100 ? 20 : 24,
                                fontWeight: "bold",
                                color: getTextColor(value),
                              }}
                            >
                              {value}
                            </Text>
                          )}
                        </View>
                      ))}
                    </View>
                  ))}
                </View>
              </BlurView>
            </View>

            <Text
              style={{
                fontSize: 14,
                color: "#94A3B8",
                textAlign: "center",
                marginTop: 16,
              }}
            >
              Swipe to move tiles. Combine tiles with the same number to reach
              2048!
            </Text>
          </View>
        </RNPanGestureHandler>

        {/* Game over overlay */}
        {(gameOver || gameWon) && (
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
            <View style={{ borderRadius: 24, overflow: "hidden", margin: 20 }}>
              <BlurView
                intensity={80}
                tint="dark"
                style={{
                  backgroundColor: "rgba(139, 92, 246, 0.2)",
                  borderWidth: 2,
                  borderColor: "rgba(224, 231, 255, 0.3)",
                  borderRadius: 24,
                  padding: 32,
                  alignItems: "center",
                  shadowColor: "#8B5CF6",
                  shadowOffset: { width: 0, height: 8 },
                  shadowOpacity: 0.3,
                  shadowRadius: 20,
                  elevation: 12,
                }}
              >
                <Trophy
                  size={48}
                  color={gameWon ? "#06D6A0" : "#F72585"}
                  style={{ marginBottom: 16 }}
                />

                <Text
                  style={{
                    fontSize: 24,
                    fontWeight: "bold",
                    color: "#E0E7FF",
                    textAlign: "center",
                    marginBottom: 8,
                    textShadowColor: "#8B5CF6",
                    textShadowRadius: 10,
                  }}
                >
                  {gameWon ? "You Win!" : "Game Over"}
                </Text>

                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: "600",
                    color: "#94A3B8",
                    marginBottom: 20,
                  }}
                >
                  Score: {score.toLocaleString()}
                </Text>

                <View style={{ flexDirection: "row", gap: 12 }}>
                  <TouchableOpacity
                    onPress={initializeGame}
                    style={{
                      backgroundColor: "rgba(6, 214, 160, 0.3)",
                      paddingHorizontal: 20,
                      paddingVertical: 12,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: "#06D6A0",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "600",
                        color: "#06D6A0",
                      }}
                    >
                      Play Again
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => router.back()}
                    style={{
                      backgroundColor: "rgba(168, 85, 247, 0.3)",
                      paddingHorizontal: 20,
                      paddingVertical: 12,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: "#A855F7",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "600",
                        color: "#A855F7",
                      }}
                    >
                      Back to Hub
                    </Text>
                  </TouchableOpacity>
                </View>
              </BlurView>
            </View>
          </View>
        )}
      </View>
    </GestureHandlerRootView>
  );
}
