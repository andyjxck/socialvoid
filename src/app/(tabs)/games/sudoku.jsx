import React, { useState, useEffect, useCallback, useMemo, memo } from "react";
import { View, Text, TouchableOpacity, Dimensions } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../../../utils/theme";
import { BlurView } from "expo-blur";
import { router } from "expo-router";
import { ArrowLeft, RotateCcw, Trophy, Eraser } from "lucide-react-native";
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
  easy: {
    cellsToRemove: 38, // Results in ~43 clues (good for easy)
    name: "Easy",
    description: "36-49 numbers given • Straightforward solving",
  },
  medium: {
    cellsToRemove: 47, // Results in ~34 clues (good for medium)
    name: "Medium",
    description: "32-35 numbers given • Requires techniques",
  },
  hard: {
    cellsToRemove: 52, // Results in ~29 clues (good for hard)
    name: "Hard",
    description: "28-31 numbers given • Advanced strategies",
  },
};

/* ---------------- Memoized cell: only re-renders when its own props change ---------------- */
const SudokuCell = memo(
  function SudokuCell({
    rowIndex,
    colIndex,
    value,
    locked,
    selected,
    CELL_SIZE,
    colors,
    onPress,
    getCellBackground,
  }) {
    const bg = getCellBackground(rowIndex, colIndex);

    return (
      <TouchableOpacity
        onPress={onPress}
        style={{
          width: CELL_SIZE,
          height: CELL_SIZE,
          backgroundColor: bg,
          justifyContent: "center",
          alignItems: "center",
          borderRightWidth:
            (colIndex + 1) % 3 === 0 && colIndex !== 8 ? 2 : 0.5,
          borderRightColor:
            (colIndex + 1) % 3 === 0 && colIndex !== 8
              ? colors.border
              : colors.overlay,
          borderBottomWidth: 0.5,
          borderBottomColor: colors.overlay,
          ...(selected ? { shadowOpacity: 0.15 } : null),
        }}
        activeOpacity={0.8}
      >
        {value !== 0 && (
          <Text
            style={{
              fontFamily: "Inter_700Bold",
              fontSize: 16,
              // Pre-filled numbers use normal text color; user-entered use light blue
              color: locked ? colors.text : "#87CEEB",
            }}
          >
            {value}
          </Text>
        )}
      </TouchableOpacity>
    );
  },
  (prev, next) =>
    prev.value === next.value &&
    prev.locked === next.locked &&
    prev.selected === next.selected &&
    prev.CELL_SIZE === next.CELL_SIZE &&
    prev.colors.text === next.colors.text &&
    prev.colors.border === next.colors.border &&
    prev.colors.overlay === next.colors.overlay
);

export default function SudokuGame() {
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
        setCurrentPlayerId(savedPlayerId ? parseInt(savedPlayerId) : 1);
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

      const id = await getGameId(GAME_TYPES.SUDOKU);
      if (id && currentPlayerId && mounted) {
        currentGameId = id;
        setGameId(id);
        await gameTracker.startGame(id, currentPlayerId);
        console.log("🎮 Sudoku tracking started:", id);
      } else if (mounted) {
        console.error("❌ Could not get Sudoku game ID or player ID");
      }
    };

    setupGame();

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
  const [difficulty, setDifficulty] = useState("medium");
  const [showDifficultySelect, setShowDifficultySelect] = useState(true);
  const [puzzle, setPuzzle] = useState([]);
  const [solution, setSolution] = useState([]);
  const [selectedCell, setSelectedCell] = useState(null);
  const [timer, setTimer] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameWon, setGameWon] = useState(false);
  const [originalPuzzle, setOriginalPuzzle] = useState([]);

  const CELL_SIZE = useMemo(() => (screenWidth - 60) / 9, []);

  // Create empty 9x9 grid
  const createEmptyGrid = useCallback(() => {
    return Array(9)
      .fill(null)
      .map(() => Array(9).fill(0));
  }, []);

  // Check if number is valid in position
  const isValidMove = useCallback((grid, row, col, num) => {
    for (let x = 0; x < 9; x++) {
      if (grid[row][x] === num) return false;
    }
    for (let x = 0; x < 9; x++) {
      if (grid[x][col] === num) return false;
    }
    const startRow = row - (row % 3);
    const startCol = col - (col % 3);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        if (grid[i + startRow][j + startCol] === num) return false;
      }
    }
    return true;
  }, []);

  // Fill grid recursively
  const fillGrid = useCallback(
    (grid) => {
      for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 9; col++) {
          if (grid[row][col] === 0) {
            const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9].sort(
              () => Math.random() - 0.5
            );
            for (const num of numbers) {
              if (isValidMove(grid, row, col, num)) {
                grid[row][col] = num;
                if (fillGrid(grid)) return true;
                grid[row][col] = 0;
              }
            }
            return false;
          }
        }
      }
      return true;
    },
    [isValidMove]
  );

  // Generate complete valid sudoku
  const generateSolution = useCallback(() => {
    const grid = createEmptyGrid();
    fillGrid(grid);
    return grid;
  }, [createEmptyGrid, fillGrid]);

  // Create puzzle by removing numbers from solution
  const createPuzzle = useCallback((solutionGrid, diffKey) => {
    const p = solutionGrid.map((row) => row.slice());
    const cellsToRemove = DIFFICULTIES[diffKey].cellsToRemove;

    let removed = 0;
    while (removed < cellsToRemove) {
      const r = (Math.random() * 9) | 0;
      const c = (Math.random() * 9) | 0;
      if (p[r][c] !== 0) {
        p[r][c] = 0;
        removed++;
      }
    }
    return p;
  }, []);

  // Check if puzzle is complete
  const isPuzzleComplete = useCallback((grid) => {
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        if (grid[row][col] === 0) return false;
      }
    }
    return true;
  }, []);

  // Check if puzzle is correct (matches solution)
  const isPuzzleCorrect = useCallback(
    (grid) => {
      for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 9; col++) {
          if (grid[row][col] !== solution[row][col]) return false;
        }
      }
      return true;
    },
    [solution]
  );

  // Initialize game
  const initializeGame = useCallback(() => {
    // Yield one frame so UI paints before generation (prevents initial hitch)
    setTimeout(() => {
      const newSolution = generateSolution();
      const newPuzzle = createPuzzle(newSolution, difficulty);

      setSolution(newSolution);
      setPuzzle(newPuzzle);
      setOriginalPuzzle(newPuzzle.map((row) => row.slice())); // Store original puzzle
      setSelectedCell(null);
      setTimer(0);
      setGameStarted(true);
      setGameWon(false);
    }, 0);
  }, [generateSolution, createPuzzle, difficulty]);

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

  // Handle cell press
  const handleCellPress = useCallback(
    (row, col) => {
      if (gameWon) return;
      if (originalPuzzle[row] && originalPuzzle[row][col] !== 0) return; // Can't edit pre-filled cells
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      setSelectedCell({ row, col });
    },
    [gameWon, originalPuzzle]
  );

  // Handle number input — only update the changed row
  const handleNumberInput = useCallback(
    (number) => {
      if (!selectedCell || gameWon) return;

      const { row, col } = selectedCell;
      if (originalPuzzle[row] && originalPuzzle[row][col] !== 0) return; // Can't edit pre-filled cells

      setPuzzle((prev) => {
        const next = prev.slice(); // shallow clone
        const rowCopy = prev[row].slice(); // clone only the changed row
        rowCopy[col] = number;
        next[row] = rowCopy;
        return next;
      });

      if (number !== 0) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      }

      // Read latest grid once and check win
      setPuzzle((current) => {
        if (isPuzzleComplete(current) && isPuzzleCorrect(current)) {
          setGameWon(true);
          const score = Math.max(100, 1000 - Math.floor(timer / 10));
          if (gameId) gameTracker.endGame(gameId, score);
        }
        return current; // no change
      });
    },
    [
      selectedCell,
      gameWon,
      originalPuzzle,
      isPuzzleComplete,
      isPuzzleCorrect,
      timer,
      gameId,
    ]
  );

  // Clear selected cell
  const clearCell = useCallback(() => {
    if (!selectedCell || gameWon) return;
    const { row, col } = selectedCell;
    if (originalPuzzle[row] && originalPuzzle[row][col] !== 0) return; // Can't edit pre-filled cells
    handleNumberInput(0);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, [selectedCell, gameWon, originalPuzzle, handleNumberInput]);

  // Format time
  const formatTime = useCallback((seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }, []);

  // Get cell background color (stable)
  const getCellBackground = useCallback(
    (row, col) => {
      if (
        selectedCell &&
        selectedCell.row === row &&
        selectedCell.col === col
      ) {
        return colors.gameAccent6 + "40";
      }
      const boxRow = Math.floor(row / 3);
      const boxCol = Math.floor(col / 3);
      return (boxRow + boxCol) % 2 === 0
        ? colors.glassPrimary
        : colors.glassSecondary;
    },
    [
      selectedCell,
      colors.gameAccent6,
      colors.glassPrimary,
      colors.glassSecondary,
    ]
  );

  // Initialize game on mount and when difficulty changes
  useEffect(() => {
    initializeGame();
  }, [initializeGame]);

  if (!fontsLoaded) {
    return null;
  }

  // Difficulty selection screen
  if (showDifficultySelect) {
    return (
      <View style={{ flex: 1 }}>
        <StatusBar style={isDark ? "light" : "dark"} />

        {/* Night sky background gradient */}
        <NightSkyBackground />

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
              Sudoku
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
                    {config.description}
                  </Text>
                </BlurView>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    );
  }

  // Main game screen continues here...
  return (
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
            Sudoku
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
                    color: colors.gameAccent6,
                  }}
                >
                  {formatTime(timer)}
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
                    color: colors.gameAccent6,
                  }}
                >
                  {DIFFICULTIES[difficulty].name}
                </Text>
              </View>

              <TouchableOpacity
                onPress={clearCell}
                style={{
                  padding: 8,
                  borderRadius: 12,
                  backgroundColor: colors.gameAccent6 + "20",
                }}
              >
                <Eraser size={20} color={colors.gameAccent6} />
              </TouchableOpacity>
            </View>
          </BlurView>
        </View>
      </View>

      {/* Game board */}
      <View
        style={{
          flex: 1,
          paddingHorizontal: 20,
          justifyContent: "center",
        }}
      >
        <View
          style={{
            width: screenWidth - 40,
            height: screenWidth - 40,
            backgroundColor: colors.glassSecondary,
            borderRadius: 12,
            padding: 4,
            alignSelf: "center",
            marginBottom: 20,
          }}
        >
          {puzzle.map((row, rowIndex) => (
            <View
              key={rowIndex}
              style={{
                flexDirection: "row",
                borderBottomWidth:
                  (rowIndex + 1) % 3 === 0 && rowIndex !== 8 ? 2 : 0,
                borderBottomColor: colors.border,
              }}
            >
              {row.map((cell, colIndex) => {
                const locked =
                  originalPuzzle[rowIndex] &&
                  originalPuzzle[rowIndex][colIndex] !== 0;

                const selected =
                  !!selectedCell &&
                  selectedCell.row === rowIndex &&
                  selectedCell.col === colIndex;

                return (
                  <SudokuCell
                    key={`${rowIndex}-${colIndex}`}
                    rowIndex={rowIndex}
                    colIndex={colIndex}
                    value={cell}
                    locked={locked}
                    selected={selected}
                    CELL_SIZE={CELL_SIZE}
                    colors={colors}
                    onPress={() => handleCellPress(rowIndex, colIndex)}
                    getCellBackground={getCellBackground}
                  />
                );
              })}
            </View>
          ))}
        </View>

        {/* Number input */}
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: 8,
            paddingBottom: insets.bottom + 20,
          }}
        >
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <TouchableOpacity
              key={num}
              onPress={() => handleNumberInput(num)}
              style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                backgroundColor: colors.gameCard6,
                justifyContent: "center",
                alignItems: "center",
                borderWidth: 1,
                borderColor: colors.gameAccent6,
              }}
            >
              <Text
                style={{
                  fontFamily: "Inter_700Bold",
                  fontSize: 18,
                  color: colors.text,
                }}
              >
                {num}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
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
                color={colors.gameAccent6}
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
                Sudoku Solved!
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
                Time: {formatTime(timer)}
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