import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Alert,
  Dimensions,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import {
  ArrowLeft,
  RotateCcw,
  HelpCircle,
  Trophy,
  Clock,
} from "lucide-react-native";
import { useTheme } from "../../../utils/theme";
import NightSkyBackground from "../../../components/NightSkyBackground";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { usePlaytimeTracking } from "../../../hooks/usePlaytimeTracking";
import {
  useGameStats,
  GAME_STATS_TYPES,
  formatGameScore,
} from "../../../hooks/useGameStats";
import gameTracker from "../../../utils/gameTracking";
import { getGameId, GAME_TYPES } from "../../../utils/gameUtils";

const { width: screenWidth } = Dimensions.get("window");

// Make cells bigger and more readable
const CELL_SIZE = Math.min(42, (screenWidth - 60) / 9);

// Simple Kakuro puzzle generator
const generateKakuroPuzzle = () => {
  const size = 7; // Smaller grid but bigger cells = better UX
  const grid = [];

  // Initialize grid
  for (let r = 0; r < size; r++) {
    grid[r] = [];
    for (let c = 0; c < size; c++) {
      grid[r][c] = { type: "white", value: 0, clue: null };
    }
  }

  // Add clue cells with better distribution
  const clueCells = [
    { row: 0, col: 0, across: 16, down: 10 },
    { row: 0, col: 1, down: 12 },
    { row: 0, col: 3, across: 23, down: 15 },
    { row: 0, col: 5, across: 9 },
    { row: 1, col: 0, down: 8 },
    { row: 1, col: 2, across: 7, down: 11 },
    { row: 1, col: 6, across: 6 },
    { row: 2, col: 1, across: 14 },
    { row: 3, col: 0, across: 21, down: 5 },
    { row: 3, col: 4, across: 12 },
    { row: 4, col: 2, across: 13, down: 8 },
    { row: 5, col: 1, across: 10 },
    { row: 6, col: 0, across: 15 },
  ];

  // Set clue cells
  clueCells.forEach(({ row, col, across, down }) => {
    if (row < size && col < size) {
      grid[row][col] = {
        type: "clue",
        across: across || null,
        down: down || null,
      };
    }
  });

  // Create solution with better logic
  const solution = [];
  for (let r = 0; r < size; r++) {
    solution[r] = [];
    for (let c = 0; c < size; c++) {
      if (grid[r][c].type === "white") {
        // Better solution generation
        solution[r][c] = ((r * 3 + c * 2 + 1) % 9) + 1;
      } else {
        solution[r][c] = 0;
      }
    }
  }

  return { grid, solution, size };
};

export default function KakuroGame() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [puzzle, setPuzzle] = useState(null);
  const [userGrid, setUserGrid] = useState(null);
  const [selectedCell, setSelectedCell] = useState(null);
  const [showKeypad, setShowKeypad] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showWin, setShowWin] = useState(false);
  const [startTime, setStartTime] = useState(null);
  const [gameTime, setGameTime] = useState(0);
  const [currentPlayerId, setCurrentPlayerId] = useState(null);
  const [gameId, setGameId] = useState(null);

  // 🎯 USE PERSISTENT STATS!
  const {
    stats,
    isLoading: isLoadingStats,
    error: statsError,
  } = useGameStats(currentPlayerId, GAME_STATS_TYPES.KAKURO);

  const { startTracking, stopTracking } = usePlaytimeTracking("kakuro");

  // Load player ID
  useEffect(() => {
    const loadData = async () => {
      try {
        const savedPlayerId = await AsyncStorage.getItem(
          "puzzle_hub_player_id",
        );
        const playerId = savedPlayerId ? parseInt(savedPlayerId) : 1;
        setCurrentPlayerId(playerId);
      } catch (error) {
        console.error("Error loading data:", error);
      }
    };
    loadData();
  }, []);

  // Setup game tracking
  useEffect(() => {
    let mounted = true;

    const setupGame = async () => {
      if (!currentPlayerId) return;
      const id = await getGameId(GAME_TYPES.KAKURO);
      if (id && currentPlayerId && mounted) {
        setGameId(id);
        await gameTracker.startGame(id, currentPlayerId);
      }
    };

    setupGame();
    return () => {
      mounted = false;
    };
  }, [currentPlayerId]);

  useEffect(() => {
    try {
      initializeGame();
    } catch (error) {
      console.error("Error initializing Kakuro:", error);
    }
  }, []);

  useEffect(() => {
    if (startTime) {
      const interval = setInterval(() => {
        setGameTime(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [startTime]);

  const initializeGame = () => {
    try {
      const newPuzzle = generateKakuroPuzzle();
      setPuzzle(newPuzzle);

      // Initialize user grid
      const newUserGrid = [];
      for (let r = 0; r < newPuzzle.size; r++) {
        newUserGrid[r] = [];
        for (let c = 0; c < newPuzzle.size; c++) {
          newUserGrid[r][c] = 0;
        }
      }
      setUserGrid(newUserGrid);

      setSelectedCell(null);
      setShowKeypad(false);
      setShowWin(false);
      setStartTime(Date.now());
      setGameTime(0);
      startTracking();
    } catch (error) {
      console.error("Error in initializeGame:", error);
    }
  };

  const handleCellPress = async (row, col) => {
    try {
      if (
        puzzle &&
        puzzle.grid[row] &&
        puzzle.grid[row][col] &&
        puzzle.grid[row][col].type === "white"
      ) {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setSelectedCell([row, col]);
        setShowKeypad(true);
      }
    } catch (error) {
      console.error("Error in handleCellPress:", error);
    }
  };

  const handleNumberInput = async (num) => {
    try {
      if (selectedCell && userGrid) {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        const [row, col] = selectedCell;
        const newGrid = userGrid.map((r) => [...r]);
        newGrid[row][col] = num;
        setUserGrid(newGrid);
        setShowKeypad(false);
        setSelectedCell(null);

        // Win check
        setTimeout(() => {
          if (checkWinCondition(newGrid)) {
            stopTracking();

            // Update persistent stats
            if (gameId && currentPlayerId) {
              gameTracker.endGame(gameId, gameTime); // Score is completion time
            }

            setShowWin(true);
          }
        }, 100);
      }
    } catch (error) {
      console.error("Error in handleNumberInput:", error);
    }
  };

  const checkWinCondition = (grid) => {
    try {
      if (!puzzle || !puzzle.solution || !grid) return false;

      for (let r = 0; r < puzzle.size; r++) {
        for (let c = 0; c < puzzle.size; c++) {
          if (
            puzzle.grid[r] &&
            puzzle.grid[r][c] &&
            puzzle.grid[r][c].type === "white"
          ) {
            if (grid[r] && grid[r][c] !== puzzle.solution[r][c]) {
              return false;
            }
          }
        }
      }
      return true;
    } catch (error) {
      console.error("Error in checkWinCondition:", error);
      return false;
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const renderCell = (row, col) => {
    try {
      if (
        !puzzle ||
        !puzzle.grid ||
        !puzzle.grid[row] ||
        !puzzle.grid[row][col]
      ) {
        return (
          <View
            key={`${row}-${col}`}
            style={{ width: CELL_SIZE, height: CELL_SIZE, margin: 2 }}
          />
        );
      }

      const cell = puzzle.grid[row][col];
      const value = (userGrid && userGrid[row] && userGrid[row][col]) || 0;
      const isSelected =
        selectedCell && selectedCell[0] === row && selectedCell[1] === col;

      if (cell.type === "clue") {
        return (
          <View
            key={`${row}-${col}`}
            style={{
              width: CELL_SIZE,
              height: CELL_SIZE,
              margin: 2,
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            <BlurView
              intensity={30}
              tint="dark"
              style={{
                flex: 1,
                backgroundColor: "rgba(30, 41, 59, 0.8)",
                borderWidth: 1,
                borderColor: "rgba(148, 163, 184, 0.3)",
                borderRadius: 8,
                position: "relative",
              }}
            >
              {cell.down && (
                <Text
                  style={{
                    fontSize: 10,
                    color: "#E0E7FF",
                    position: "absolute",
                    top: 4,
                    right: 4,
                    fontWeight: "700",
                    textShadowColor: "#8B5CF6",
                    textShadowRadius: 2,
                  }}
                >
                  {cell.down}
                </Text>
              )}
              {cell.across && (
                <Text
                  style={{
                    fontSize: 10,
                    color: "#E0E7FF",
                    position: "absolute",
                    bottom: 4,
                    left: 4,
                    fontWeight: "700",
                    textShadowColor: "#8B5CF6",
                    textShadowRadius: 2,
                  }}
                >
                  {cell.across}
                </Text>
              )}
              <View
                style={{
                  position: "absolute",
                  top: CELL_SIZE / 3,
                  left: CELL_SIZE / 3,
                  right: 2,
                  bottom: 2,
                  borderTopWidth: cell.down ? 0 : 1,
                  borderLeftWidth: cell.across ? 0 : 1,
                  borderColor: "rgba(168, 85, 247, 0.5)",
                }}
              />
            </BlurView>
          </View>
        );
      }

      return (
        <TouchableOpacity
          key={`${row}-${col}`}
          onPress={() => handleCellPress(row, col)}
          style={{
            width: CELL_SIZE,
            height: CELL_SIZE,
            margin: 2,
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          <BlurView
            intensity={isSelected ? 60 : 40}
            tint="dark"
            style={{
              flex: 1,
              backgroundColor: isSelected
                ? "rgba(168, 85, 247, 0.3)"
                : "rgba(139, 92, 246, 0.15)",
              borderWidth: 2,
              borderColor: isSelected
                ? "rgba(168, 85, 247, 0.8)"
                : "rgba(224, 231, 255, 0.3)",
              borderRadius: 8,
              alignItems: "center",
              justifyContent: "center",
              shadowColor: isSelected ? "#A855F7" : "transparent",
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 1,
              shadowRadius: 8,
            }}
          >
            <Text
              style={{
                fontSize: 18,
                fontWeight: "800",
                color: value > 0 ? "#E0E7FF" : "transparent",
                textShadowColor: "#8B5CF6",
                textShadowOffset: { width: 0, height: 0 },
                textShadowRadius: 4,
              }}
            >
              {value > 0 ? value : ""}
            </Text>
          </BlurView>
        </TouchableOpacity>
      );
    } catch (error) {
      console.error("Error in renderCell:", error);
      return (
        <View
          key={`${row}-${col}`}
          style={{ width: CELL_SIZE, height: CELL_SIZE, margin: 2 }}
        />
      );
    }
  };

  if (!puzzle) {
    return (
      <View style={{ flex: 1 }}>
        <StatusBar style="light" />
        <LinearGradient
          colors={["#1a0b2e", "#16213e", "#0f3460", "#533a7d"]}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <NightSkyBackground />
        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <Text style={{ color: "#E0E7FF", fontSize: 18 }}>Loading...</Text>
        </View>
      </View>
    );
  }

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
            Kakuro
          </Text>

          <View style={{ flexDirection: "row", gap: 12 }}>
            <TouchableOpacity
              onPress={() => setShowHelp(true)}
              style={{
                padding: 12,
                borderRadius: 16,
                backgroundColor: "rgba(255, 255, 255, 0.1)",
                borderWidth: 1,
                borderColor: "rgba(255, 255, 255, 0.2)",
              }}
            >
              <HelpCircle size={24} color="#E0E7FF" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={initializeGame}
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
                  style={{ fontSize: 10, fontWeight: "600", color: "#94A3B8" }}
                >
                  BEST TIME
                </Text>
                <Text
                  style={{ fontSize: 12, fontWeight: "600", color: "#06D6A0" }}
                >
                  {isLoadingStats
                    ? "..."
                    : stats?.best_time
                      ? formatTime(stats.best_time)
                      : "None"}
                </Text>
              </View>

              <View style={{ alignItems: "center" }}>
                <Text
                  style={{ fontSize: 10, fontWeight: "600", color: "#94A3B8" }}
                >
                  CURRENT
                </Text>
                <Text
                  style={{ fontSize: 12, fontWeight: "600", color: "#E0E7FF" }}
                >
                  {formatTime(gameTime)}
                </Text>
              </View>

              <View style={{ alignItems: "center" }}>
                <Text
                  style={{ fontSize: 10, fontWeight: "600", color: "#94A3B8" }}
                >
                  SOLVED
                </Text>
                <Text
                  style={{ fontSize: 12, fontWeight: "600", color: "#F72585" }}
                >
                  {isLoadingStats ? "..." : stats?.total_plays || 0}
                </Text>
              </View>
            </View>
          </BlurView>
        </View>
      </View>

      {/* Game Grid */}
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 20,
        }}
      >
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
            {puzzle.grid.map((row, rowIndex) => (
              <View key={rowIndex} style={{ flexDirection: "row" }}>
                {row.map((_, colIndex) => renderCell(rowIndex, colIndex))}
              </View>
            ))}
          </BlurView>
        </View>
      </View>

      {/* Keypad Modal */}
      <Modal
        visible={showKeypad}
        transparent
        animationType="fade"
        onRequestClose={() => setShowKeypad(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <View
            style={{
              backgroundColor: colors.glassSecondary,
              borderRadius: 16,
              padding: 20,
              margin: 20,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text
              style={{
                fontSize: 18,
                fontWeight: "bold",
                color: colors.text,
                textAlign: "center",
                marginBottom: 20,
                fontFamily: "Nunito-Bold",
              }}
            >
              Enter Number
            </Text>

            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 10,
                justifyContent: "center",
              }}
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <TouchableOpacity
                  key={num}
                  onPress={() => handleNumberInput(num)}
                  style={{
                    width: 50,
                    height: 50,
                    backgroundColor: colors.primary,
                    borderRadius: 8,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 18,
                      fontWeight: "bold",
                      color: "white",
                      fontFamily: "Nunito-Bold",
                    }}
                  >
                    {num}
                  </Text>
                </TouchableOpacity>
              ))}

              <TouchableOpacity
                onPress={() => handleNumberInput(0)}
                style={{
                  width: 110,
                  height: 50,
                  backgroundColor: colors.surfaceSecondary,
                  borderRadius: 8,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "bold",
                    color: colors.text,
                    fontFamily: "Nunito-Bold",
                  }}
                >
                  Clear
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Help Modal */}
      <Modal
        visible={showHelp}
        transparent
        animationType="fade"
        onRequestClose={() => setShowHelp(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <View
            style={{
              backgroundColor: colors.glassSecondary,
              borderRadius: 16,
              padding: 20,
              margin: 20,
              maxWidth: 300,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text
              style={{
                fontSize: 20,
                fontWeight: "bold",
                color: colors.text,
                textAlign: "center",
                marginBottom: 16,
                fontFamily: "Nunito-Bold",
              }}
            >
              How to Play Kakuro
            </Text>

            <Text
              style={{
                fontSize: 16,
                color: colors.text,
                lineHeight: 24,
                marginBottom: 20,
                fontFamily: "Nunito-Regular",
              }}
            >
              Fill each run with digits 1–9, no repeats, to match the clue sum
              in the black cell. Across clue is bottom-left; down clue is
              top-right.
            </Text>

            <TouchableOpacity
              onPress={() => setShowHelp(false)}
              style={{
                backgroundColor: colors.primary,
                borderRadius: 8,
                padding: 12,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "bold",
                  color: "white",
                  fontFamily: "Nunito-Bold",
                }}
              >
                Got it!
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Win Modal */}
      <Modal
        visible={showWin}
        transparent
        animationType="fade"
        onRequestClose={() => setShowWin(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <View
            style={{
              backgroundColor: colors.glassSecondary,
              borderRadius: 16,
              padding: 20,
              margin: 20,
              alignItems: "center",
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Trophy size={48} color={colors.primary} />

            <Text
              style={{
                fontSize: 24,
                fontWeight: "bold",
                color: colors.text,
                textAlign: "center",
                marginTop: 16,
                marginBottom: 8,
                fontFamily: "Nunito-Bold",
              }}
            >
              Kakuro Solved!
            </Text>

            <Text
              style={{
                fontSize: 16,
                color: colors.textSecondary,
                textAlign: "center",
                marginBottom: 24,
                fontFamily: "Nunito-Medium",
              }}
            >
              Time: {formatTime(gameTime)}
              {stats?.best_time &&
                gameTime <= stats.best_time &&
                "\n🎉 New Best Time!"}
            </Text>

            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity
                onPress={initializeGame}
                style={{
                  backgroundColor: colors.primary,
                  borderRadius: 8,
                  paddingHorizontal: 20,
                  paddingVertical: 12,
                }}
              >
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "bold",
                    color: "white",
                    fontFamily: "Nunito-Bold",
                  }}
                >
                  Play Again
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => router.back()}
                style={{
                  backgroundColor: colors.surfaceSecondary,
                  borderRadius: 8,
                  paddingHorizontal: 20,
                  paddingVertical: 12,
                }}
              >
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "bold",
                    color: colors.text,
                    fontFamily: "Nunito-Bold",
                  }}
                >
                  Back
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
