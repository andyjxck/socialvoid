// mobile/src/app/games/WordSearchGame.jsx
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  ScrollView,
  BackHandler,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../../utils/theme";
import { BlurView } from "expo-blur";
import { router } from "expo-router";
import { ArrowLeft, RotateCcw, Trophy } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";
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
import { supabase } from "../../../utils/supabase"; // 🔒 persistence

export default function WordSearchGame() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const queryClient = useQueryClient();

  const [currentPlayerId, setCurrentPlayerId] = useState(null);
  const [gameId, setGameId] = useState(null);

  // ─────────────────────────────────────────────────────────────────────────────
  // Get player ID from AsyncStorage
  useEffect(() => {
    const loadPlayerId = async () => {
      try {
        const savedPlayerId = await AsyncStorage.getItem("puzzle_hub_player_id");
        setCurrentPlayerId(savedPlayerId ? parseInt(savedPlayerId) : 1);
      } catch (error) {
        console.error("Failed to load player ID:", error);
        setCurrentPlayerId(1);
      }
    };
    loadPlayerId();
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // Get the correct game ID and start tracking
  useEffect(() => {
    let mounted = true;
    const setupGame = async () => {
      const id = await getGameId(GAME_TYPES.WORD_SEARCH);
      if (id && currentPlayerId && mounted) {
        setGameId(id);
        try {
          await gameTracker.startGame(id, currentPlayerId);
          console.log("🎮 Word Search tracking started:", id);
        } catch {}
      } else {
        console.error("❌ Could not get Word Search game ID or player ID");
      }
    };
    setupGame();

    return () => {
      mounted = false;
      if (gameId) {
        try {
          gameTracker.endGame(gameId, foundWords.length * 100 || 0);
        } catch {}
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPlayerId]);

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // GAME STATE
  const [grid, setGrid] = useState([]);
  const [wordsToFind, setWordsToFind] = useState([]);
  const [foundWords, setFoundWords] = useState([]);
  const [selectedCells, setSelectedCells] = useState([]);
  const [startCell, setStartCell] = useState(null);
  const [timer, setTimer] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameCompleted, setGameCompleted] = useState(false);
  const [placedWords, setPlacedWords] = useState([]);

  const GRID_SIZE = 12;

  // Session start timestamp (ms) for persistence duration
  const sessionStartRef = useRef(null);

  // ─────────────────────────────────────────────────────────────────────────────
  // WORD LIST
  const WORD_BANK = [
    "JAVASCRIPT","PYTHON","REACT","ANGULAR","NODEJS","TYPESCRIPT","DATABASE",
    "FRONTEND","BACKEND","FULLSTACK","ALGORITHM","FUNCTION","VARIABLE","CONSTANT",
    "BOOLEAN","INTEGER","STRING","ARRAY","OBJECT","METHOD","CLASS","INTERFACE",
    "MODULE","PACKAGE","FRAMEWORK","LIBRARY","COMPONENT","ELEMENT","ATTRIBUTE",
    "PROPERTY","EVENT","HANDLER","CALLBACK","PROMISE","ASYNC","AWAIT","DEBUGGING",
    "TESTING","DEPLOYMENT","VERSION","CONTROL","GITHUB","BRANCH","COMMIT","MERGE",
    "PULL","REQUEST","ISSUE","TERMINAL","COMMAND","SCRIPT","BUILD","COMPILE",
    "RUNTIME","MEMORY","STORAGE","NETWORK","SERVER","CLIENT","API","JSON","XML",
    "HTTP","HTTPS","REST","GRAPHQL","AUTHENTICATION","AUTHORIZATION","SESSION",
    "TOKEN","SECURITY","ENCRYPTION",
  ];

  // ─────────────────────────────────────────────────────────────────────────────
  // PERSISTENCE HELPERS (Supabase)
  const insertGameSession = useCallback(
    async ({ startMs, endMs, finalScore, result }) => {
      if (!currentPlayerId || !gameId) return;
      const startIso = new Date(startMs || Date.now()).toISOString();
      const endIso = new Date(endMs || Date.now()).toISOString();
      const duration = Math.max(
        0,
        Math.floor(((endMs || Date.now()) - (startMs || Date.now())) / 1000)
      );

      try {
        await supabase.from("game_sessions").insert({
          player_id: currentPlayerId,
          game_id: gameId,
          start_time: startIso,
          end_time: endIso,
          duration,
          score: Number(finalScore || 0),
          meta: { result }, // "win" | "loss" | "exit"
        });
      } catch (e) {
        // silent fail if offline; optional queue can be added later
      }
    },
    [currentPlayerId, gameId]
  );

  const updateBestTimeIfBetter = useCallback(
    async (newTimeSeconds) => {
      if (!currentPlayerId || !gameId) return;
      try {
        const { data, error } = await supabase
          .from("player_game_stats")
          .select("best_time")
          .eq("player_id", currentPlayerId)
          .eq("game_id", gameId)
          .maybeSingle();

        if (error) throw error;
        const current = data?.best_time ?? null;
        const isBetter = current == null || Number(newTimeSeconds) < Number(current);

        if (isBetter) {
          await supabase.from("player_game_stats").upsert({
            player_id: currentPlayerId,
            game_id: gameId,
            best_time: Number(newTimeSeconds),
          });
        }
      } catch (e) {
        // ignore; can be retried later if you add a queue
      }
    },
    [currentPlayerId, gameId]
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // GRID GEN
  const generateRandomLetter = () => String.fromCharCode(65 + Math.floor(Math.random() * 26));

  const canPlaceWord = (grid, word, row, col, direction) => {
    const directions = { horizontal: [0, 1], vertical: [1, 0], diagonal: [1, 1], diagonalUp: [-1, 1] };
    const [dr, dc] = directions[direction];

    for (let i = 0; i < word.length; i++) {
      const newRow = row + dr * i;
      const newCol = col + dc * i;
      if (
        newRow < 0 || newRow >= GRID_SIZE ||
        newCol < 0 || newCol >= GRID_SIZE
      ) return false;
      if (grid[newRow][newCol] !== null && grid[newRow][newCol] !== word[i]) return false;
    }
    return true;
  };

  const placeWord = (grid, word, row, col, direction) => {
    const directions = { horizontal: [0, 1], vertical: [1, 0], diagonal: [1, 1], diagonalUp: [-1, 1] };
    const [dr, dc] = directions[direction];
    const wordData = { word, cells: [] };
    for (let i = 0; i < word.length; i++) {
      const newRow = row + dr * i;
      const newCol = col + dc * i;
      grid[newRow][newCol] = word[i];
      wordData.cells.push({ row: newRow, col: newCol });
    }
    return wordData;
  };

  const createWordSearchGrid = (selectedWords) => {
    const grid = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null));
    const placedWordsData = [];
    const directions = ["horizontal", "vertical", "diagonal", "diagonalUp"];

    const sortedWords = [...selectedWords].sort((a, b) => b.length - a.length);

    sortedWords.forEach((word) => {
      let placed = false;
      let attempts = 0;
      while (!placed && attempts < 500) {
        const direction = directions[Math.floor(Math.random() * directions.length)];
        const row = Math.floor(Math.random() * GRID_SIZE);
        const col = Math.floor(Math.random() * GRID_SIZE);
        if (canPlaceWord(grid, word, row, col, direction)) {
          const wordData = placeWord(grid, word, row, col, direction);
          placedWordsData.push(wordData);
          placed = true;
        }
        attempts++;
      }
      if (!placed) {
        for (let dir of directions) {
          for (let r = 0; r < GRID_SIZE && !placed; r++) {
            for (let c = 0; c < GRID_SIZE && !placed; c++) {
              if (canPlaceWord(grid, word, r, c, dir)) {
                const wordData = placeWord(grid, word, r, c, dir);
                placedWordsData.push(wordData);
                placed = true;
                break;
              }
            }
          }
        }
      }
    });

    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        if (grid[row][col] === null) grid[row][col] = generateRandomLetter();
      }
    }

    const actuallyPlacedWords = placedWordsData.map((w) => w.word);
    return { grid, placedWordsData, actuallyPlacedWords };
  };

  const initializeGame = useCallback(() => {
    const numWords = 8 + Math.floor(Math.random() * 5);
    const shuffledWords = [...WORD_BANK].sort(() => 0.5 - Math.random());
    const selectedWords = shuffledWords.slice(0, numWords);

    const { grid: newGrid, placedWordsData, actuallyPlacedWords } =
      createWordSearchGrid(selectedWords);

    setGrid(newGrid);
    setWordsToFind(actuallyPlacedWords);
    setPlacedWords(placedWordsData);
    setFoundWords([]);
    setSelectedCells([]);
    setStartCell(null);
    setTimer(0);
    setGameStarted(false);
    setGameCompleted(false);
    sessionStartRef.current = null; // reset session start
  }, []);

  // Timer
  useEffect(() => {
    let interval;
    if (gameStarted && !gameCompleted) {
      interval = setInterval(() => {
        setTimer((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [gameStarted, gameCompleted]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Back handling → submit a loss play
  const handleExitToHub = useCallback(() => {
    const startMs = sessionStartRef.current || Date.now();
    const endMs = Date.now();

    // record loss (best_time not updated on loss)
    insertGameSession({
      startMs,
      endMs,
      finalScore: foundWords.length * 100 || 0,
      result: "loss",
    });

    router.back();
    return true;
  }, [foundWords.length, insertGameSession]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", handleExitToHub);
    return () => sub.remove();
  }, [handleExitToHub]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Tapping logic
  const handleCellPress = async (row, col) => {
    if (!gameStarted) {
      setGameStarted(true);
      sessionStartRef.current = Date.now(); // mark session start on first interaction
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    const cellKey = `${row}-${col}`;

    if (!startCell) {
      setStartCell({ row, col });
      setSelectedCells([cellKey]);
    } else if (startCell.row === row && startCell.col === col) {
      setStartCell(null);
      setSelectedCells([]);
    } else {
      const newSelection = getSelectionPath(startCell.row, startCell.col, row, col);

      if (newSelection.length >= 3) {
        const letters = newSelection
          .map((key) => {
            const [r, c] = key.split("-").map(Number);
            return grid[r][c];
          })
          .join("");

        const reverseLetters = letters.split("").reverse().join("");

        const foundWord = wordsToFind.find(
          (word) =>
            (word === letters || word === reverseLetters) &&
            !foundWords.includes(word)
        );

        if (foundWord) {
          const updated = [...foundWords, foundWord];
          setFoundWords(updated);
          setSelectedCells([]);
          setStartCell(null);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

          // If all words are found → win
          if (updated.length === wordsToFind.length) {
            setGameCompleted(true);

            const score = Math.max(100, 1000 - timer * 2 + foundWords.length * 50);

            // Persistence on WIN:
            const startMs = sessionStartRef.current || Date.now();
            const endMs = Date.now();
            insertGameSession({
              startMs,
              endMs,
              finalScore: score,
              result: "win",
            });
            // Best time tracking — only if completed
            updateBestTimeIfBetter(timer);

            if (gameId) {
              try {
                await gameTracker.endGame(gameId, score);
              } catch {}
            }
          }
        } else {
          setSelectedCells(newSelection);
          setTimeout(() => {
            setSelectedCells([]);
            setStartCell(null);
          }, 1000);
        }
      } else {
        setSelectedCells([]);
        setStartCell(null);
      }
    }
  };

  const getSelectionPath = (startRow, startCol, endRow, endCol) => {
    const path = [];
    const deltaRow = endRow - startRow;
    const deltaCol = endCol - startCol;

    if (deltaRow === 0) {
      const step = deltaCol > 0 ? 1 : -1;
      for (let c = startCol; c !== endCol + step; c += step) path.push(`${startRow}-${c}`);
    } else if (deltaCol === 0) {
      const step = deltaRow > 0 ? 1 : -1;
      for (let r = startRow; r !== endRow + step; r += step) path.push(`${r}-${startCol}`);
    } else if (Math.abs(deltaRow) === Math.abs(deltaCol)) {
      const stepRow = deltaRow > 0 ? 1 : -1;
      const stepCol = deltaCol > 0 ? 1 : -1;
      const distance = Math.abs(deltaRow);
      for (let i = 0; i <= distance; i++) {
        path.push(`${startRow + i * stepRow}-${startCol + i * stepCol}`);
      }
    }
    return path;
  };

  const getCellBackground = (row, col) => {
    const cellKey = `${row}-${col}`;
    if (selectedCells.includes(cellKey)) return colors.gameAccent10 + "60";

    const isPartOfFoundWord = placedWords.some(
      (wordData) =>
        foundWords.includes(wordData.word) &&
        wordData.cells.some((cell) => cell.row === row && cell.col === col)
    );
    if (isPartOfFoundWord) return "#FFB3B3";
    return colors.gameCard10;
  };

  // (kept for potential styling use)
  const isCellPartOfFoundWord = (row, col) =>
    placedWords.some(
      (wordData) =>
        foundWords.includes(wordData.word) &&
        wordData.cells.some((cell) => cell.row === row && cell.col === col)
    );

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  useEffect(() => {
    initializeGame();
  }, [initializeGame]);

  if (!fontsLoaded) return null;

  // ─────────────────────────────────────────────────────────────────────────────
  // UI
  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <NightSkyBackground />

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
            onPress={handleExitToHub}
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
            Word Search
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
              marginBottom: 12,
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
                Found
              </Text>
              <Text
                style={{
                  fontFamily: "Inter_700Bold",
                  fontSize: 18,
                  color: colors.gameAccent10,
                }}
              >
                {foundWords.length}/{wordsToFind.length}
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

          <ScrollView
            showsVerticalScrollIndicator={false}
            style={{ maxHeight: 120 }}
            contentContainerStyle={{ paddingBottom: 8 }}
          >
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 8,
                width: "100%",
                justifyContent: "flex-start",
              }}
            >
              {wordsToFind.map((word) => (
                <View
                  key={word}
                  style={{
                    backgroundColor: foundWords.includes(word)
                      ? "#FFB3B3"
                      : "transparent",
                    paddingHorizontal: foundWords.includes(word) ? 8 : 0,
                    paddingVertical: foundWords.includes(word) ? 4 : 0,
                    borderRadius: foundWords.includes(word) ? 8 : 0,
                    marginBottom: 4,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "Inter_600SemiBold",
                      fontSize: 12,
                      color: foundWords.includes(word) ? "#333333" : colors.text,
                      opacity: foundWords.includes(word) ? 0.8 : 1,
                    }}
                  >
                    {word}
                  </Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </BlurView>
      </View>

      <View
        style={{
          flex: 1,
          paddingHorizontal: 20,
          justifyContent: "center",
        }}
      >
        <View
          style={{
            width: Dimensions.get("window").width - 40,
            height: Dimensions.get("window").width - 40,
            backgroundColor: colors.glassSecondary,
            borderRadius: 12,
            padding: 4,
            alignSelf: "center",
          }}
        >
          {grid.map((row, rowIndex) => (
            <View key={rowIndex} style={{ flexDirection: "row", flex: 1 }}>
              {row.map((letter, colIndex) => (
                <TouchableOpacity
                  key={`${rowIndex}-${colIndex}`}
                  onPress={() => handleCellPress(rowIndex, colIndex)}
                  style={{
                    flex: 1,
                    backgroundColor: getCellBackground(rowIndex, colIndex),
                    justifyContent: "center",
                    alignItems: "center",
                    borderWidth: 0.5,
                    borderColor: colors.overlay,
                    margin: 0.5,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "Inter_600SemiBold",
                      fontSize: 10,
                      color: colors.text,
                    }}
                  >
                    {letter}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </View>

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
          Tap the first letter, then tap the last letter of each word to select it!
        </Text>
      </View>

      {/* Game completion overlay */}
      {gameCompleted && (
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
          <View style={{ borderRadius: 20, overflow: "hidden", margin: 20 }}>
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
              <Trophy size={48} color={colors.gameAccent10} style={{ marginBottom: 16 }} />

              <Text
                style={{
                  fontFamily: "Inter_700Bold",
                  fontSize: 24,
                  color: colors.text,
                  textAlign: "center",
                  marginBottom: 8,
                }}
              >
                All Words Found!
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
                Time: {formatTime(timer)} | Words: {foundWords.length}
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
                  onPress={handleExitToHub}
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
