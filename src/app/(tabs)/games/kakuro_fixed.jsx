import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, Modal, Alert } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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

// Better Kakuro puzzle generator
const generateKakuroPuzzle = () => {
  const size = 6;
  const grid = [];
  const solution = [];
  const clues = {};

  // Initialize empty grid
  for (let r = 0; r < size; r++) {
    grid[r] = [];
    solution[r] = [];
    for (let c = 0; c < size; c++) {
      grid[r][c] = null;
      solution[r][c] = 0;
    }
  }

  // Define a proper Kakuro pattern
  // B = Black (clue cell), W = White (input cell)
  const pattern = ["BWWBWW", "WBBWBB", "WBWWBW", "BWWBWW", "WBBWBB", "WBWWBW"];

  // Apply pattern
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (pattern[r] && pattern[r][c] === "B") {
        grid[r][c] = { type: "black" };
      } else {
        grid[r][c] = { type: "white", value: 0 };
      }
    }
  }

  // Define runs (groups of consecutive white cells)
  const runs = [
    // Horizontal runs
    {
      cells: [
        [0, 1],
        [0, 2],
      ],
      direction: "across",
      cluePos: [0, 0],
    },
    {
      cells: [
        [0, 4],
        [0, 5],
      ],
      direction: "across",
      cluePos: [0, 3],
    },
    { cells: [[1, 0]], direction: "across", cluePos: null },
    { cells: [[1, 3]], direction: "across", cluePos: null },
    { cells: [[2, 0]], direction: "across", cluePos: null },
    {
      cells: [
        [2, 2],
        [2, 3],
      ],
      direction: "across",
      cluePos: [2, 1],
    },
    { cells: [[2, 5]], direction: "across", cluePos: null },
    {
      cells: [
        [3, 1],
        [3, 2],
      ],
      direction: "across",
      cluePos: [3, 0],
    },
    {
      cells: [
        [3, 4],
        [3, 5],
      ],
      direction: "across",
      cluePos: [3, 3],
    },
    { cells: [[4, 0]], direction: "across", cluePos: null },
    { cells: [[4, 3]], direction: "across", cluePos: null },
    { cells: [[5, 0]], direction: "across", cluePos: null },
    {
      cells: [
        [5, 2],
        [5, 3],
      ],
      direction: "across",
      cluePos: [5, 1],
    },
    { cells: [[5, 5]], direction: "across", cluePos: null },

    // Vertical runs
    {
      cells: [
        [1, 0],
        [2, 0],
      ],
      direction: "down",
      cluePos: [0, 0],
    },
    {
      cells: [
        [0, 1],
        [1, 1],
      ],
      direction: "down",
      cluePos: null,
    },
    {
      cells: [
        [0, 2],
        [3, 2],
      ],
      direction: "down",
      cluePos: null,
    },
    {
      cells: [
        [1, 3],
        [2, 3],
      ],
      direction: "down",
      cluePos: [0, 3],
    },
    {
      cells: [
        [0, 4],
        [3, 4],
      ],
      direction: "down",
      cluePos: null,
    },
    {
      cells: [
        [0, 5],
        [2, 5],
      ],
      direction: "down",
      cluePos: null,
    },
  ];

  // Generate solutions for valid runs (2+ cells)
  const validRuns = runs.filter((run) => run.cells.length >= 2);

  validRuns.forEach((run) => {
    // Generate unique numbers for this run
    const numbers = [];
    const used = new Set();

    for (let i = 0; i < run.cells.length; i++) {
      let num;
      do {
        num = Math.floor(Math.random() * 9) + 1;
      } while (used.has(num));
      used.add(num);
      numbers.push(num);
    }

    // Place numbers in solution
    run.cells.forEach(([r, c], i) => {
      if (solution[r] && solution[r][c] !== undefined) {
        solution[r][c] = numbers[i];
      }
    });

    // Create clue
    if (run.cluePos) {
      const [cr, cc] = run.cluePos;
      const sum = numbers.reduce((a, b) => a + b, 0);

      if (!clues[`${cr},${cc}`]) {
        clues[`${cr},${cc}`] = {};
      }
      clues[`${cr},${cc}`][run.direction] = sum;
    }
  });

  return { grid, clues, solution };
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
  const [bestTime, setBestTime] = useState(null);

  const { startTracking, stopTracking } = usePlaytimeTracking("kakuro");

  useEffect(() => {
    try {
      initializeGame();
      loadBestTime();
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

  const loadBestTime = async () => {
    try {
      const saved = await AsyncStorage.getItem("kakuro_best_time");
      if (saved) setBestTime(parseInt(saved));
    } catch (error) {
      console.error("Error loading best time:", error);
    }
  };

  const saveBestTime = async (time) => {
    try {
      if (!bestTime || time < bestTime) {
        setBestTime(time);
        await AsyncStorage.setItem("kakuro_best_time", time.toString());
      }
    } catch (error) {
      console.error("Error saving best time:", error);
    }
  };

  const initializeGame = () => {
    try {
      const newPuzzle = generateKakuroPuzzle();
      setPuzzle(newPuzzle);

      // Initialize user grid
      const newUserGrid = [];
      for (let r = 0; r < 6; r++) {
        newUserGrid[r] = [];
        for (let c = 0; c < 6; c++) {
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

  const handleCellPress = (row, col) => {
    try {
      if (
        puzzle &&
        puzzle.grid &&
        puzzle.grid[row] &&
        puzzle.grid[row][col] &&
        puzzle.grid[row][col].type === "white"
      ) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setSelectedCell([row, col]);
        setShowKeypad(true);
      }
    } catch (error) {
      console.error("Error in handleCellPress:", error);
    }
  };

  const handleNumberInput = (num) => {
    try {
      if (selectedCell && userGrid) {
        const [row, col] = selectedCell;
        const newGrid = userGrid.map((r) => [...r]);
        newGrid[row][col] = num;
        setUserGrid(newGrid);
        setShowKeypad(false);
        setSelectedCell(null);

        // Check win condition
        setTimeout(() => {
          if (checkWinCondition(newGrid)) {
            stopTracking();
            saveBestTime(gameTime);
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

      for (let r = 0; r < 6; r++) {
        for (let c = 0; c < 6; c++) {
          if (
            puzzle.grid &&
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
            style={{ width: 50, height: 50, margin: 1 }}
          />
        );
      }

      const cell = puzzle.grid[row][col];
      const value = (userGrid && userGrid[row] && userGrid[row][col]) || 0;
      const isSelected =
        selectedCell && selectedCell[0] === row && selectedCell[1] === col;
      const clue = puzzle.clues && puzzle.clues[`${row},${col}`];

      if (cell.type === "black") {
        return (
          <View
            key={`${row}-${col}`}
            style={{
              width: 50,
              height: 50,
              backgroundColor: "#1a1a1a",
              borderWidth: 1,
              borderColor: "#333",
              position: "relative",
              margin: 1,
              borderRadius: 2,
            }}
          >
            {/* Diagonal line */}
            <View
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
              }}
            >
              <View
                style={{
                  position: "absolute",
                  width: Math.sqrt(2) * 50,
                  height: 1,
                  backgroundColor: "#666",
                  top: 25,
                  left: -12.5,
                  transform: [{ rotate: "45deg" }],
                }}
              />
            </View>

            {/* Down clue (top-right) */}
            {clue && clue.down && (
              <Text
                style={{
                  fontSize: 9,
                  color: "#fff",
                  position: "absolute",
                  top: 2,
                  right: 3,
                  fontWeight: "bold",
                  fontFamily: "Nunito-Bold",
                }}
              >
                {clue.down}
              </Text>
            )}

            {/* Across clue (bottom-left) */}
            {clue && clue.across && (
              <Text
                style={{
                  fontSize: 9,
                  color: "#fff",
                  position: "absolute",
                  bottom: 2,
                  left: 3,
                  fontWeight: "bold",
                  fontFamily: "Nunito-Bold",
                }}
              >
                {clue.across}
              </Text>
            )}
          </View>
        );
      }

      return (
        <TouchableOpacity
          key={`${row}-${col}`}
          onPress={() => handleCellPress(row, col)}
          style={{
            width: 50,
            height: 50,
            backgroundColor: isSelected ? "#4c1d95" : "#f8fafc",
            borderWidth: 1,
            borderColor: isSelected ? "#8b5cf6" : "#cbd5e1",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 2,
            margin: 1,
          }}
        >
          <Text
            style={{
              fontSize: 18,
              fontWeight: "600",
              color: value > 0 ? "#1e293b" : "transparent",
              fontFamily: "Nunito-Bold",
            }}
          >
            {value > 0 ? value : ""}
          </Text>
        </TouchableOpacity>
      );
    } catch (error) {
      console.error("Error in renderCell:", error);
      return (
        <View
          key={`${row}-${col}`}
          style={{ width: 50, height: 50, margin: 1 }}
        />
      );
    }
  };

  if (!puzzle) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <NightSkyBackground />
        <Text style={{ color: colors.text }}>Loading...</Text>
      </View>
    );
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background,
      }}
    >
      <NightSkyBackground />

      <View
        style={{
          flex: 1,
          paddingTop: insets.top,
        }}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            padding: 16,
            backgroundColor: colors.glassSecondary,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          <TouchableOpacity onPress={() => router.back()}>
            <ArrowLeft size={24} color={colors.text} />
          </TouchableOpacity>

          <View style={{ alignItems: "center" }}>
            <Text
              style={{
                fontSize: 20,
                fontWeight: "bold",
                color: colors.text,
                fontFamily: "Nunito-Bold",
              }}
            >
              Kakuro
            </Text>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <Clock size={14} color={colors.textSecondary} />
              <Text
                style={{
                  fontSize: 14,
                  color: colors.textSecondary,
                  fontFamily: "Nunito-SemiBold",
                }}
              >
                {formatTime(gameTime)}
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 12 }}>
            <TouchableOpacity onPress={() => setShowHelp(true)}>
              <HelpCircle size={24} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity onPress={initializeGame}>
              <RotateCcw size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Game Grid */}
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <View
            style={{
              backgroundColor: colors.glassSecondary,
              borderRadius: 12,
              padding: 16,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            {puzzle.grid &&
              puzzle.grid.map &&
              puzzle.grid.map((row, rowIndex) => (
                <View key={rowIndex} style={{ flexDirection: "row" }}>
                  {row &&
                    row.map &&
                    row.map((_, colIndex) => renderCell(rowIndex, colIndex))}
                </View>
              ))}
          </View>

          {bestTime && (
            <Text
              style={{
                marginTop: 16,
                fontSize: 14,
                color: colors.textSecondary,
                fontFamily: "Nunito-Medium",
              }}
            >
              Best Time: {formatTime(bestTime)}
            </Text>
          )}
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
                Fill white cells with digits 1-9. Each run of white cells must
                add up to the clue number shown in the adjacent black cell. No
                digit can repeat within the same run.
                {"\n\n"}• Bottom-left number = across clue
                {"\n"}• Top-right number = down clue
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
                {bestTime && gameTime <= bestTime && "\n🎉 New Best Time!"}
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
    </View>
  );
}
