import React, { useState, useEffect, useCallback, useMemo, memo, useRef } from "react";
import { View, Text, TouchableOpacity, Dimensions } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
  easy: { cellsToRemove: 38, name: "Easy", description: "36-49 numbers given • Straightforward solving" },
  medium: { cellsToRemove: 47, name: "Medium", description: "32-35 numbers given • Requires techniques" },
  hard: { cellsToRemove: 52, name: "Hard", description: "28-31 numbers given • Advanced strategies" },
};

function bestTimeKey(diff) {
  return "sudoku_best_time_" + diff;
}

/* ---------- Memoized Cell (only re-renders when its own props change) ---------- */
const SudokuCell = memo(function SudokuCell(props) {
  const {
    rowIndex,
    colIndex,
    value,
    locked,
    selected,
    CELL_SIZE,
    colors,
    onPress,
    getCellBackground,
  } = props;

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
        borderRightWidth: (colIndex + 1) % 3 === 0 && colIndex !== 8 ? 2 : 0.5,
        borderRightColor: (colIndex + 1) % 3 === 0 && colIndex !== 8 ? colors.border : colors.overlay,
        borderBottomWidth: 0.5,
        borderBottomColor: colors.overlay,
        shadowOpacity: selected ? 0.15 : 0,
      }}
      activeOpacity={0.8}
    >
      {value !== 0 ? (
        <Text
          style={{
            fontFamily: "Inter_700Bold",
            fontSize: 16,
            color: locked ? colors.text : "#87CEEB",
          }}
        >
          {value}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}, function areEqual(prev, next) {
  return (
    prev.value === next.value &&
    prev.locked === next.locked &&
    prev.selected === next.selected &&
    prev.CELL_SIZE === next.CELL_SIZE &&
    prev.colors.text === next.colors.text &&
    prev.colors.border === next.colors.border &&
    prev.colors.overlay === next.colors.overlay
  );
});

export default function SudokuGame() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const [currentPlayerId, setCurrentPlayerId] = useState(null);
  const [gameId, setGameId] = useState(null);

  // Refs to avoid duplicate submissions / manage lifecycle
  const submittedRef = useRef(false);    // true after we call endGame for the run
  const activeRef = useRef(false);       // true when a puzzle is generated (run is active)
  const gameIdRef = useRef(null);

  // Load player id + resolve game id (one-time)
  useEffect(function () {
    var mounted = true;
    (async function init() {
      try {
        const saved = await AsyncStorage.getItem("puzzle_hub_player_id");
        const pid = saved ? parseInt(saved, 10) : 1;
        if (!mounted) return;
        setCurrentPlayerId(pid);

        const id = await getGameId(GAME_TYPES.SUDOKU);
        if (!mounted) return;
        setGameId(id);
        gameIdRef.current = id;

        try {
          await gameTracker.startGame(id, pid);
        } catch (e) {}
      } catch (e) {}
    })();

    return function cleanup() {
      mounted = false;
      // If leaving screen while a run was active but not submitted, count as play (no score)
      if (gameIdRef.current && activeRef.current && !submittedRef.current) {
        try {
          gameTracker.endGame(gameIdRef.current, 0, { result: "play", reason: "unmount" });
        } catch (e) {}
      }
      submittedRef.current = true;
      activeRef.current = false;
    };
  }, []);

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
  const [originalPuzzle, setOriginalPuzzle] = useState([]);
  const [selectedCell, setSelectedCell] = useState(null);
  const [timer, setTimer] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameWon, setGameWon] = useState(false);

  // best time (per difficulty), persisted
  const [bestTime, setBestTime] = useState(null);

  // Guard against re-gen loops
  const didInitRef = useRef(false);

  const CELL_SIZE = useMemo(function () {
    return (screenWidth - 60) / 9;
  }, []);

  // Load best time whenever difficulty changes
  useEffect(function () {
    var mounted = true;
    (async function loadBest() {
      try {
        const saved = await AsyncStorage.getItem(bestTimeKey(difficulty));
        if (!mounted) return;
        setBestTime(saved ? parseInt(saved, 10) : null);
      } catch (e) {
        if (mounted) setBestTime(null);
      }
    })();
    // Allow init once after difficulty change
    didInitRef.current = false;
    return function () {
      mounted = false;
    };
  }, [difficulty]);

  // --- Sudoku helpers ---

  const createEmptyGrid = useCallback(function () {
    var arr = [];
    for (var i = 0; i < 9; i++) {
      var row = [];
      for (var j = 0; j < 9; j++) row.push(0);
      arr.push(row);
    }
    return arr;
  }, []);

  const isValidMove = useCallback(function (grid, row, col, num) {
    for (var x = 0; x < 9; x++) if (grid[row][x] === num) return false;
    for (var y = 0; y < 9; y++) if (grid[y][col] === num) return false;

    var r0 = row - (row % 3);
    var c0 = col - (col % 3);
    for (var i = 0; i < 3; i++) {
      for (var j = 0; j < 3; j++) {
        if (grid[r0 + i][c0 + j] === num) return false;
      }
    }
    return true;
  }, []);

  const fillGrid = useCallback(function (grid) {
    for (var r = 0; r < 9; r++) {
      for (var c = 0; c < 9; c++) {
        if (grid[r][c] === 0) {
          var nums = [1,2,3,4,5,6,7,8,9].sort(function(){return Math.random() - 0.5;});
          for (var k = 0; k < nums.length; k++) {
            var n = nums[k];
            if (isValidMove(grid, r, c, n)) {
              grid[r][c] = n;
              if (fillGrid(grid)) return true;
              grid[r][c] = 0;
            }
          }
          return false;
        }
      }
    }
    return true;
  }, [isValidMove]);

  const generateSolution = useCallback(function () {
    var g = createEmptyGrid();
    fillGrid(g);
    return g;
  }, [createEmptyGrid, fillGrid]);

  const createPuzzle = useCallback(function (solutionGrid, diffKey) {
    var p = solutionGrid.map(function (row) { return row.slice(); });
    var toRemove = DIFFICULTIES[diffKey].cellsToRemove;
    var removed = 0;
    while (removed < toRemove) {
      var r = (Math.random() * 9) | 0;
      var c = (Math.random() * 9) | 0;
      if (p[r][c] !== 0) {
        p[r][c] = 0;
        removed++;
      }
    }
    return p;
  }, []);

  // Init / Reset
  const initializeGame = useCallback(function () {
    var newSolution = generateSolution();
    var newPuzzle = createPuzzle(newSolution, difficulty);

    setSolution(newSolution);
    setPuzzle(newPuzzle);
    setOriginalPuzzle(newPuzzle.map(function (row) { return row.slice(); }));
    setSelectedCell(null);
    setTimer(0);
    setGameStarted(true);
    setGameWon(false);

    activeRef.current = true;
    submittedRef.current = false;
  }, [generateSolution, createPuzzle, difficulty]);

  // Only generate when entering the game screen (once per difficulty selection)
  useEffect(function () {
    if (!showDifficultySelect && !didInitRef.current) {
      didInitRef.current = true;
      initializeGame();
    }
  }, [showDifficultySelect, initializeGame]);

  // Timer
  useEffect(function () {
    var interval;
    if (gameStarted && !gameWon) {
      interval = setInterval(function () {
        setTimer(function (t) { return t + 1; });
      }, 1000);
    }
    return function () {
      if (interval) clearInterval(interval);
    };
  }, [gameStarted, gameWon]);

  // Completion checks
  const isPuzzleComplete = useCallback(function (grid) {
    for (var r = 0; r < 9; r++) {
      for (var c = 0; c < 9; c++) {
        if (grid[r][c] === 0) return false;
      }
    }
    return true;
  }, []);

  const isPuzzleCorrect = useCallback(function (grid) {
    for (var r = 0; r < 9; r++) {
      for (var c = 0; c < 9; c++) {
        if (grid[r][c] !== solution[r][c]) return false;
      }
    }
    return true;
  }, [solution]);

  // Back out -> count as play, no score
  const handleBackOut = useCallback(function () {
    setShowDifficultySelect(true);
    setGameStarted(false);
    setGameWon(false);
    activeRef.current = false;

    if (gameIdRef.current && !submittedRef.current) {
      try {
        gameTracker.endGame(gameIdRef.current, 0, { result: "play", reason: "back" });
      } catch (e) {}
      submittedRef.current = true;
    }
  }, []);

  // Submit win: persist best time (if improved) and endGame once
  const submitWinIfNeeded = useCallback(async function (elapsedSeconds) {
    var prevBest = bestTime === null ? Infinity : bestTime;
    var improved = elapsedSeconds < prevBest;

    if (improved) {
      setBestTime(elapsedSeconds);
      try {
        await AsyncStorage.setItem(bestTimeKey(difficulty), String(elapsedSeconds));
      } catch (e) {}
    }

    if (gameIdRef.current && !submittedRef.current) {
      var meta = { result: "win" };
      if (improved) meta.best_time = elapsedSeconds;
      try { gameTracker.endGame(gameIdRef.current, elapsedSeconds, meta); } catch (e) {}
      submittedRef.current = true;
    }
    activeRef.current = false;
  }, [bestTime, difficulty]);

  // Input handlers
  const handleCellPress = useCallback(function (row, col) {
    if (gameWon) return;
    if (originalPuzzle[row] && originalPuzzle[row][col] !== 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(function() {});
    setSelectedCell({ row: row, col: col });
  }, [gameWon, originalPuzzle]);

  const handleNumberInput = useCallback(function (number) {
    if (!selectedCell || gameWon) return;

    var row = selectedCell.row;
    var col = selectedCell.col;
    if (originalPuzzle[row] && originalPuzzle[row][col] !== 0) return;

    setPuzzle(function (prev) {
      var next = prev.map(function (r, i) { return i === row ? r.slice() : r; });
      next[row][col] = number;

      if (number !== 0) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(function(){});
      }

      if (isPuzzleComplete(next) && isPuzzleCorrect(next)) {
        setGameWon(true);
        submitWinIfNeeded(timer);
      }

      return next;
    });
  }, [selectedCell, gameWon, originalPuzzle, isPuzzleComplete, isPuzzleCorrect, timer, submitWinIfNeeded]);

  const clearCell = useCallback(function () {
    if (!selectedCell || gameWon) return;
    var row = selectedCell.row;
    var col = selectedCell.col;
    if (originalPuzzle[row] && originalPuzzle[row][col] !== 0) return;
    handleNumberInput(0);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(function(){});
  }, [selectedCell, gameWon, originalPuzzle, handleNumberInput]);

  // UI helpers
  const formatTime = useCallback(function (seconds) {
    var mins = Math.floor(seconds / 60);
    var secs = seconds % 60;
    return mins + ":" + String(secs).padStart(2, "0");
  }, []);

  const getCellBackground = useCallback(function (row, col) {
    if (selectedCell && selectedCell.row === row && selectedCell.col === col) {
      return colors.gameAccent6 + "40";
    }
    var boxRow = Math.floor(row / 3);
    var boxCol = Math.floor(col / 3);
    return (boxRow + boxCol) % 2 === 0 ? colors.glassPrimary : colors.glassSecondary;
  }, [selectedCell, colors.gameAccent6, colors.glassPrimary, colors.glassSecondary]);

  if (!fontsLoaded) return null;

  // ---------------- Difficulty Selection ----------------
  if (showDifficultySelect) {
    return (
      <View style={{ flex: 1 }}>
        <StatusBar style={isDark ? "light" : "dark"} />
        <NightSkyBackground />

        <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, flex: 1 }}>
          {/* Header */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 40 }}>
            <TouchableOpacity
              onPress={function () {
                // Leaving Sudoku entirely: if a run was active and not submitted, count as play
                if (gameIdRef.current && activeRef.current && !submittedRef.current) {
                  try { gameTracker.endGame(gameIdRef.current, 0, { result: "play", reason: "back" }); } catch (e) {}
                  submittedRef.current = true;
                }
                activeRef.current = false;
                router.back();
              }}
              style={{ padding: 8, borderRadius: 12, backgroundColor: colors.glassSecondary }}
            >
              <ArrowLeft size={24} color={colors.text} />
            </TouchableOpacity>

            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 24, color: colors.text }}>Sudoku</Text>

            <View style={{ width: 40 }} />
          </View>

          {/* Best time (if exists for this difficulty) */}
          {bestTime !== null ? (
            <Text
              style={{
                fontFamily: "Inter_500Medium",
                fontSize: 14,
                color: colors.textSecondary,
                textAlign: "center",
                marginBottom: 16,
              }}
            >
              Best Time ({DIFFICULTIES[difficulty].name}): {formatTime(bestTime)}
            </Text>
          ) : null}

          {/* Choices */}
          <View style={{ flex: 1, justifyContent: "center" }}>
            <Text
              style={{
                fontFamily: "Inter_600SemiBold",
                fontSize: 20,
                color: colors.text,
                textAlign: "center",
                marginBottom: 24,
              }}
            >
              Choose Difficulty
            </Text>

            {Object.keys(DIFFICULTIES).map(function (key) {
              var config = DIFFICULTIES[key];
              return (
                <TouchableOpacity
                  key={key}
                  onPress={function () {
                    setDifficulty(key);
                    setShowDifficultySelect(false); // init will happen once via guard
                  }}
                  style={{ marginBottom: 16, borderRadius: 16, overflow: "hidden" }}
                >
                  <BlurView
                    intensity={isDark ? 60 : 80}
                    tint={isDark ? "dark" : "light"}
                    style={{
                      backgroundColor: isDark ? "rgba(31, 41, 55, 0.7)" : "rgba(255, 255, 255, 0.7)",
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 16,
                      padding: 20,
                    }}
                  >
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.text, marginBottom: 4 }}>
                      {config.name}
                    </Text>
                    <Text style={{ fontFamily: "Inter_500Medium", fontSize: 14, color: colors.textSecondary }}>
                      {config.description}
                    </Text>
                  </BlurView>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    );
  }

  // ---------------- Main Game ----------------
  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <NightSkyBackground />

      {/* Header */}
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, marginBottom: 20 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <TouchableOpacity onPress={handleBackOut} style={{ padding: 8, borderRadius: 12, backgroundColor: colors.glassSecondary }}>
            <ArrowLeft size={24} color={colors.text} />
          </TouchableOpacity>

          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 20, color: colors.text }}>Sudoku</Text>

          <TouchableOpacity
            onPress={function () {
              // Explicit reset of current run
              didInitRef.current = true;
              initializeGame();
            }}
            style={{ padding: 8, borderRadius: 12, backgroundColor: colors.glassSecondary }}
          >
            <RotateCcw size={24} color={colors.text} />
          </TouchableOpacity>
        </View>

        {/* Stats */}
        <View style={{ borderRadius: 16, overflow: "hidden" }}>
          <BlurView
            intensity={isDark ? 60 : 80}
            tint={isDark ? "dark" : "light"}
            style={{
              backgroundColor: isDark ? "rgba(31, 41, 55, 0.7)" : "rgba(255, 255, 255, 0.7)",
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 16,
              padding: 16,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-around", alignItems: "center" }}>
              <View style={{ alignItems: "center" }}>
                <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                  Time
                </Text>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.gameAccent6 }}>
                  {formatTime(timer)}
                </Text>
              </View>

              <View style={{ alignItems: "center" }}>
                <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                  Difficulty
                </Text>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: colors.gameAccent6 }}>
                  {DIFFICULTIES[difficulty].name}
                </Text>
              </View>

              <TouchableOpacity onPress={clearCell} style={{ padding: 8, borderRadius: 12, backgroundColor: colors.gameAccent6 + "20" }}>
                <Eraser size={20} color={colors.gameAccent6} />
              </TouchableOpacity>
            </View>
          </BlurView>
        </View>
      </View>

      {/* Board */}
      <View style={{ flex: 1, paddingHorizontal: 20, justifyContent: "center" }}>
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
          {puzzle.map(function (row, rowIndex) {
            return (
              <View
                key={rowIndex}
                style={{
                  flexDirection: "row",
                  borderBottomWidth: (rowIndex + 1) % 3 === 0 && rowIndex !== 8 ? 2 : 0,
                  borderBottomColor: colors.border,
                }}
              >
                {row.map(function (cell, colIndex) {
                  var locked = originalPuzzle[rowIndex] && originalPuzzle[rowIndex][colIndex] !== 0;
                  var selected = !!selectedCell && selectedCell.row === rowIndex && selectedCell.col === colIndex;
                  return (
                    <SudokuCell
                      key={rowIndex + "-" + colIndex}
                      rowIndex={rowIndex}
                      colIndex={colIndex}
                      value={cell}
                      locked={locked}
                      selected={selected}
                      CELL_SIZE={CELL_SIZE}
                      colors={colors}
                      onPress={function () { handleCellPress(rowIndex, colIndex); }}
                      getCellBackground={getCellBackground}
                    />
                  );
                })}
              </View>
            );
          })}
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
          {[1,2,3,4,5,6,7,8,9].map(function (num) {
            return (
              <TouchableOpacity
                key={num}
                onPress={function () { handleNumberInput(num); }}
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
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.text }}>{num}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Win overlay */}
      {gameWon ? (
        <View
          style={{
            position: "absolute",
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <View style={{ borderRadius: 20, overflow: "hidden", margin: 20 }}>
            <BlurView
              intensity={isDark ? 80 : 100}
              tint={isDark ? "dark" : "light"}
              style={{
                backgroundColor: isDark ? "rgba(31, 41, 55, 0.9)" : "rgba(255, 255, 255, 0.9)",
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 20,
                padding: 32,
                alignItems: "center",
              }}
            >
              <Trophy size={48} color={colors.gameAccent6} style={{ marginBottom: 16 }} />

              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 24, color: colors.text, textAlign: "center", marginBottom: 8 }}>
                Sudoku Solved!
              </Text>

              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 14, color: colors.textSecondary, marginBottom: 6, textAlign: "center" }}>
                Time: {formatTime(timer)}
              </Text>

              {bestTime !== null ? (
                <Text style={{ fontFamily: "Inter_500Medium", fontSize: 14, color: colors.textSecondary, marginBottom: 20, textAlign: "center" }}>
                  Best ({DIFFICULTIES[difficulty].name}): {formatTime(bestTime)}
                </Text>
              ) : null}

              <View style={{ flexDirection: "row", gap: 12 }}>
                <TouchableOpacity
                  onPress={function () { didInitRef.current = true; initializeGame(); }}
                  style={{ backgroundColor: colors.secondaryButton, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 }}
                >
                  <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.secondaryButtonText }}>
                    Play Again
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleBackOut}
                  style={{ backgroundColor: colors.primaryButton, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 }}
                >
                  <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.primaryButtonText }}>
                    Back to Hub
                  </Text>
                </TouchableOpacity>
              </View>
            </BlurView>
          </View>
        </View>
      ) : null}
    </View>
  );
}
