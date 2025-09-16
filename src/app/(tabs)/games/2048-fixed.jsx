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
import {
  ArrowLeft,
  RotateCcw,
  Trophy,
  Target,
  Clock,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import {
  GestureHandlerRootView,
  PanGestureHandler as RNPanGestureHandler,
} from "react-native-gesture-handler";
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

export default function Game2048() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const [currentPlayerId, setCurrentPlayerId] = useState(null);
  const [gameId, setGameId] = useState(null);

  // Get player ID from AsyncStorage
  useEffect(() => {
    const loadPlayerId = async () => {
      try {
        const savedPlayerId = await AsyncStorage.getItem(
          "puzzle_hub_player_id"
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

      const id = await getGameId(GAME_TYPES.TWENTY48);
      if (id && currentPlayerId && mounted) {
        currentGameId = id;
        setGameId(id);
        await gameTracker.startGame(id, currentPlayerId);
        console.log("🎮 2048 Fixed tracking started:", id);
      } else if (mounted) {
        console.error("❌ Could not get 2048 Fixed game ID or player ID");
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
  const [board, setBoard] = useState([]);
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(0);
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

  // Add random tile with progressive spawning
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

      // Find highest tile on board to determine what we can spawn
      const highestTile = Math.max(...currentBoard.flat());

      // Progressive tile spawning based on achievements
      const availableTiles = [];

      // Always available
      availableTiles.push({ value: 2, weight: 70 });
      availableTiles.push({ value: 4, weight: 25 });

      // Unlock 8 when player has achieved 128
      if (highestTile >= 128) {
        availableTiles.push({ value: 8, weight: 4 });
      }

      // Unlock 16 when player has achieved 256
      if (highestTile >= 256) {
        availableTiles.push({ value: 16, weight: 0.8 });
      }

      // Unlock 32 when player has achieved 512
      if (highestTile >= 512) {
        availableTiles.push({ value: 32, weight: 0.2 });
      }

      // Select tile based on weighted probability
      const totalWeight = availableTiles.reduce(
        (sum, tile) => sum + tile.weight,
        0
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

  // Move tiles in direction
  const moveTiles = async (direction) => {
    if (gameOver || gameWon) return;

    let newBoard = board.map((row) => [...row]);
    let newScore = score;
    let moved = false;

    const slideArray = (arr) => {
      // Remove zeros
      let filtered = arr.filter((val) => val !== 0);

      // Merge adjacent equal values
      for (let i = 0; i < filtered.length - 1; i++) {
        if (filtered[i] === filtered[i + 1]) {
          filtered[i] *= 2;
          filtered[i + 1] = 0;
          newScore += filtered[i];

          // Check for win condition
          if (filtered[i] === 2048 && !gameWon) {
            setGameWon(true);
          }
        }
      }

      // Remove zeros again after merging
      filtered = filtered.filter((val) => val !== 0);

      // Pad with zeros
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
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      newBoard = addRandomTile(newBoard);
      setBoard(newBoard);
      setScore(newScore);

      // Check if best score
      if (newScore > bestScore) {
        setBestScore(newScore);
      }

      // Check for game over
      if (isGameOver(newBoard)) {
        setGameOver(true);

        // End game tracking with final score
        if (gameId) {
          await gameTracker.endGame(gameId, newScore);
        }
      }
    }
  };

  // Check if game is over
  const isGameOver = (currentBoard) => {
    // Check for empty cells
    for (let i = 0; i < GRID_SIZE; i++) {
      for (let j = 0; j < GRID_SIZE; j++) {
        if (currentBoard[i][j] === 0) return false;
      }
    }

    // Check for possible merges
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

  // Handle gesture start
  const onHandlerStateChange = ({ nativeEvent }) => {
    if (nativeEvent.state === 1) {
      // BEGIN
      setGestureHandled(false);
    } else if (nativeEvent.state === 5) {
      // END
      setGestureHandled(false);
    }
  };

  // Handle gesture
  const onGestureEvent = ({ nativeEvent }) => {
    if (gestureHandled) return;

    const { translationX, translationY } = nativeEvent;
    const absX = Math.abs(translationX);
    const absY = Math.abs(translationY);
    const threshold = 50;

    if (absX > threshold || absY > threshold) {
      setGestureHandled(true);

      if (absX > absY) {
        // Horizontal swipe
        if (translationX > 0) {
          moveTiles("right");
        } else {
          moveTiles("left");
        }
      } else {
        // Vertical swipe
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

  // Get text color
  const getTextColor = (value) => {
    return value <= 4 ? "#776E65" : "#FFFFFF";
  };

  // Format time
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Initialize game on mount
  useEffect(() => {
    initializeGame();
  }, [initializeGame]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <StatusBar style={isDark ? "light" : "dark"} />

        {/* Night sky background gradient */}
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
                fontSize: 20,
                color: colors.text,
              }}
            >
              2048
            </Text>

            <TouchableOpacity
              onPress={initializeGame}
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
                  justifyContent: "space-between",
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
                    Score
                  </Text>
                  <Text
                    style={{
                      fontFamily: "Inter_700Bold",
                      fontSize: 18,
                      color: colors.gameAccent3,
                    }}
                  >
                    {score.toLocaleString()}
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
                    Best Tile
                  </Text>
                  <Text
                    style={{
                      fontFamily: "Inter_700Bold",
                      fontSize: 18,
                      color: colors.text,
                    }}
                  >
                    {Math.max(...board.flat()) || 0}
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
                    Time
                  </Text>
                  <Text
                    style={{
                      fontFamily: "Inter_700Bold",
                      fontSize: 18,
                      color: colors.text,
                    }}
                  >
                    {formatTime(timer)}
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
              paddingBottom: insets.bottom + 100,
              justifyContent: "center",
            }}
          >
            <View
              style={{
                width: screenWidth - 40,
                height: screenWidth - 40,
                backgroundColor: colors.glassSecondary,
                borderRadius: 12,
                padding: 8,
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
                          value === 0 ? colors.border : getTileColor(value),
                        justifyContent: "center",
                        alignItems: "center",
                      }}
                    >
                      {value !== 0 && (
                        <Text
                          style={{
                            fontFamily: "Inter_700Bold",
                            fontSize:
                              value >= 1000 ? 16 : value >= 100 ? 20 : 24,
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

            {/* Instructions */}
            <Text
              style={{
                fontFamily: "Inter_500Medium",
                fontSize: 14,
                color: colors.textSecondary,
                textAlign: "center",
                marginTop: 20,
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
            <View
              style={{
                borderRadius: 20,
                overflow: "hidden",
                margin: 20,
              }}
            >
              <BlurView
                intensity={isDark ? 80 : 100}
                tint={isDark ? "dark" : "light"}
                style={{
                  backgroundColor: isDark
                    ? "rgba(31, 41, 55, 0.9)"
                    : "rgba(255, 255, 255, 0.9)",
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 20,
                  padding: 32,
                  alignItems: "center",
                }}
              >
                <Trophy
                  size={48}
                  color={gameWon ? colors.gameAccent5 : colors.gameAccent3}
                  style={{ marginBottom: 16 }}
                />

                <Text
                  style={{
                    fontFamily: "Inter_700Bold",
                    fontSize: 24,
                    color: colors.text,
                    textAlign: "center",
                    marginBottom: 8,
                  }}
                >
                  {gameWon ? "You Win!" : "Game Over"}
                </Text>

                <Text
                  style={{
                    fontFamily: "Inter_600SemiBold",
                    fontSize: 18,
                    color: colors.gameAccent3,
                    marginBottom: 20,
                  }}
                >
                  Score: {score.toLocaleString()}
                </Text>

                <View style={{ flexDirection: "row", gap: 12 }}>
                  <TouchableOpacity
                    onPress={initializeGame}
                    style={{
                      backgroundColor: colors.secondaryButton,
                      paddingHorizontal: 20,
                      paddingVertical: 12,
                      borderRadius: 12,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: "Inter_600SemiBold",
                        fontSize: 14,
                        color: colors.secondaryButtonText,
                      }}
                    >
                      Play Again
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => router.back()}
                    style={{
                      backgroundColor: colors.primaryButton,
                      paddingHorizontal: 20,
                      paddingVertical: 12,
                      borderRadius: 12,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: "Inter_600SemiBold",
                        fontSize: 14,
                        color: colors.primaryButtonText,
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
