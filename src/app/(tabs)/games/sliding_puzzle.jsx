import React, { useState, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, Dimensions, Alert } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../../../utils/theme";
import { BlurView } from "expo-blur";
import { router } from "expo-router";
import { ArrowLeft, RotateCcw, Trophy, Shuffle } from "lucide-react-native";
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

export default function SlidingPuzzleGame() {
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

      const id = await getGameId(GAME_TYPES.SLIDING_PUZZLE);
      if (id && currentPlayerId && mounted) {
        currentGameId = id;
        setGameId(id);
        await gameTracker.startGame(id, currentPlayerId);
        console.log("🎮 Sliding Puzzle tracking started:", id);
      } else if (mounted) {
        console.error("❌ Could not get Sliding Puzzle game ID or player ID");
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
  const [moves, setMoves] = useState(0);
  const [timer, setTimer] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameWon, setGameWon] = useState(false);

  const GRID_SIZE = 4;
  const TILE_SIZE = (screenWidth - 80) / GRID_SIZE - 8;

  // Create solved board (1-15 with 0 as empty space)
  const createSolvedBoard = () => {
    const board = [];
    for (let i = 1; i < GRID_SIZE * GRID_SIZE; i++) {
      board.push(i);
    }
    board.push(0); // Empty space
    return board;
  };

  // Check if a configuration is solvable (inversion count must be correct)
  const isSolvable = (board) => {
    let inversions = 0;
    const flatBoard = board.filter((val) => val !== 0); // Remove empty space

    for (let i = 0; i < flatBoard.length - 1; i++) {
      for (let j = i + 1; j < flatBoard.length; j++) {
        if (flatBoard[i] > flatBoard[j]) {
          inversions++;
        }
      }
    }

    // For 4x4 grid: puzzle is solvable if:
    // - Empty space on even row (counting from bottom) and inversions odd
    // - Empty space on odd row (counting from bottom) and inversions even
    const emptyIndex = board.indexOf(0);
    const emptyRow = Math.floor(emptyIndex / GRID_SIZE);
    const emptyRowFromBottom = GRID_SIZE - emptyRow;

    if (emptyRowFromBottom % 2 === 0) {
      return inversions % 2 === 1;
    } else {
      return inversions % 2 === 0;
    }
  };

  // Count minimum moves needed to solve (Manhattan distance heuristic)
  const calculateDifficulty = (board) => {
    let totalDistance = 0;

    for (let i = 0; i < board.length; i++) {
      const value = board[i];
      if (value === 0) continue;

      // Current position
      const currentRow = Math.floor(i / GRID_SIZE);
      const currentCol = i % GRID_SIZE;

      // Target position
      const targetIndex = value - 1;
      const targetRow = Math.floor(targetIndex / GRID_SIZE);
      const targetCol = targetIndex % GRID_SIZE;

      // Manhattan distance
      const distance =
        Math.abs(currentRow - targetRow) + Math.abs(currentCol - targetCol);
      totalDistance += distance;
    }

    return totalDistance;
  };

  // Generate a challenging but solvable puzzle
  const generateChallengingPuzzle = () => {
    let board;
    let attempts = 0;
    const maxAttempts = 1000;
    const minDifficulty = 25; // Minimum Manhattan distance for a challenging puzzle

    do {
      // Create random permutation
      board = [];
      for (let i = 0; i < GRID_SIZE * GRID_SIZE - 1; i++) {
        board.push(i + 1);
      }
      board.push(0);

      // Fisher-Yates shuffle
      for (let i = board.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [board[i], board[j]] = [board[j], board[i]];
      }

      attempts++;
    } while (
      (!isSolvable(board) || calculateDifficulty(board) < minDifficulty) &&
      attempts < maxAttempts
    );

    // Fallback: if we can't generate a challenging puzzle, use move-based shuffle
    if (attempts >= maxAttempts) {
      return shuffleBoardWithMoves();
    }

    return board;
  };

  // Fallback shuffle using valid moves (guaranteed solvable but may be easier)
  const shuffleBoardWithMoves = () => {
    const newBoard = createSolvedBoard();
    // Much more moves for difficulty: 100-200 shuffles
    const shuffleMoves = 100 + Math.floor(Math.random() * 100);

    for (let i = 0; i < shuffleMoves; i++) {
      const emptyIndex = newBoard.indexOf(0);
      const possibleMoves = getPossibleMoves(newBoard, emptyIndex);
      if (possibleMoves.length > 0) {
        const randomMove =
          possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
        [newBoard[emptyIndex], newBoard[randomMove]] = [
          newBoard[randomMove],
          newBoard[emptyIndex],
        ];
      }
    }
    return newBoard;
  };

  // Shuffle board to create challenging puzzles
  const shuffleBoard = () => {
    return generateChallengingPuzzle();
  };

  // Get possible moves for empty space
  const getPossibleMoves = (board, emptyIndex) => {
    const row = Math.floor(emptyIndex / GRID_SIZE);
    const col = emptyIndex % GRID_SIZE;
    const moves = [];

    // Up
    if (row > 0) moves.push(emptyIndex - GRID_SIZE);
    // Down
    if (row < GRID_SIZE - 1) moves.push(emptyIndex + GRID_SIZE);
    // Left
    if (col > 0) moves.push(emptyIndex - 1);
    // Right
    if (col < GRID_SIZE - 1) moves.push(emptyIndex + 1);

    return moves;
  };

  // Check if puzzle is solved (numbers 1-15 in order with empty space at end)
  const isPuzzleSolved = (board) => {
    for (let i = 0; i < board.length - 1; i++) {
      if (board[i] !== i + 1) return false;
    }
    return board[board.length - 1] === 0;
  };

  // Initialize game
  const initializeGame = useCallback(() => {
    const solvedBoard = createSolvedBoard();
    const shuffledBoard = shuffleBoard(solvedBoard);

    setBoard(shuffledBoard);
    setMoves(0);
    setTimer(0);
    setGameStarted(true);
    setGameWon(false);
  }, []);

  // Timer effect
  useEffect(() => {
    let interval;
    if (gameStarted && !gameWon) {
      interval = setInterval(() => {
        setTimer((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [gameStarted, gameWon]);

  // Handle tile press
  const handleTilePress = (index) => {
    if (gameWon) return;

    const emptyIndex = board.indexOf(0);
    const possibleMoves = getPossibleMoves(board, emptyIndex);

    if (possibleMoves.includes(index)) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const newBoard = [...board];
      [newBoard[emptyIndex], newBoard[index]] = [
        newBoard[index],
        newBoard[emptyIndex],
      ];

      setBoard(newBoard);
      setMoves((prev) => prev + 1);

      // Check if won
      if (isPuzzleSolved(newBoard)) {
        setGameWon(true);

        const score = Math.max(100, 1000 - moves * 5 - timer);

        // End game tracking with final score
        if (gameId) {
          gameTracker.endGame(gameId, score);
        }
      }
    }
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
    <View style={{ flex: 1 }}>
      <StatusBar style={isDark ? "light" : "dark"} />
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
            15 Puzzle
          </Text>

          <TouchableOpacity
            onPress={initializeGame}
            style={{
              padding: 8,
              borderRadius: 12,
              backgroundColor: colors.glassSecondary,
            }}
          >
            <Shuffle size={24} color={colors.text} />
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
                  Moves
                </Text>
                <Text
                  style={{
                    fontFamily: "Inter_700Bold",
                    fontSize: 18,
                    color: colors.gameAccent4,
                  }}
                >
                  {moves}
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
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              justifyContent: "space-between",
            }}
          >
            {board.map((tile, index) => {
              return (
                <TouchableOpacity
                  key={index}
                  onPress={() => handleTilePress(index)}
                  style={{
                    width: TILE_SIZE,
                    height: TILE_SIZE,
                    borderRadius: 8,
                    backgroundColor:
                      tile === 0 ? "transparent" : colors.gameCard4,
                    justifyContent: "center",
                    alignItems: "center",
                    marginBottom: 8,
                    borderWidth: tile === 0 ? 0 : 1,
                    borderColor: colors.border,
                  }}
                >
                  {tile !== 0 && (
                    <Text
                      style={{
                        fontFamily: "Inter_700Bold",
                        fontSize: 24,
                        color: colors.text,
                      }}
                    >
                      {tile}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Instructions */}
        <Text
          style={{
            fontFamily: "Inter_500Medium",
            fontSize: 14,
            color: colors.textSecondary,
            textAlign: "center",
            marginTop: 20,
            paddingHorizontal: 20,
          }}
        >
          Slide tiles to arrange numbers in sequential order:
        </Text>

        <Text
          style={{
            fontFamily: "Inter_600SemiBold",
            fontSize: 14,
            color: colors.text,
            textAlign: "center",
            marginTop: 8,
            paddingHorizontal: 20,
            lineHeight: 20,
          }}
        >
          1 2 3 4{"\n"}5 6 7 8{"\n"}9 10 11 12{"\n"}13 14 15 ⬜
        </Text>
      </View>

      {/* Game won overlay */}
      {gameWon && (
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
                color={colors.gameAccent4}
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
                Puzzle Solved!
              </Text>

              <Text
                style={{
                  fontFamily: "Inter_500Medium",
                  fontSize: 14,
                  color: colors.textSecondary,
                  marginBottom: 20,
                  textAlign: "center",
                }}
              >
                Moves: {moves} | Time: {formatTime(timer)}
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
  );
}