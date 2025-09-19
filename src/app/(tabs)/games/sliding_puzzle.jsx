// src/app/(tabs)/games/sliding-puzzle.jsx
import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, Text, TouchableOpacity, Dimensions } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../../utils/theme";
import { BlurView } from "expo-blur";
import { router } from "expo-router";
import { ArrowLeft, Trophy, Shuffle } from "lucide-react-native";
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

  // ──────────────────────────────────
  // Player + game ids
  // ──────────────────────────────────
  const [currentPlayerId, setCurrentPlayerId] = useState(null);
  const [gameId, setGameId] = useState(null);
  const submittedRef = useRef(false); // guard against double submit

  useEffect(() => {
    const loadPlayerId = async () => {
      try {
        const savedPlayerId = await AsyncStorage.getItem("puzzle_hub_player_id");
        setCurrentPlayerId(savedPlayerId ? parseInt(savedPlayerId, 10) : 1);
      } catch {
        setCurrentPlayerId(1);
      }
    };
    loadPlayerId();
  }, []);

  useEffect(() => {
    let mounted = true;
    let currentGameId = null;

    const setup = async () => {
      if (!currentPlayerId) return;
      const id = await getGameId(GAME_TYPES.SLIDING_PUZZLE);
      if (!mounted) return;
      if (id) {
        currentGameId = id;
        setGameId(id);
        try {
          await gameTracker.startGame(id, currentPlayerId);
        } catch (e) {
          console.warn("startGame failed:", e?.message || e);
        }
      } else {
        console.error("❌ Could not resolve Sliding Puzzle game ID");
      }
    };

    setup();

    return () => {
      mounted = false;
      // If we leave mid-run without submitting a final result, count as a play (no best_time)
      if (currentGameId && !submittedRef.current) {
        try {
          gameTracker.endGame(currentGameId, 0, {
            result: "play",
            completed: false,
            reason: "unmount",
          });
          submittedRef.current = true;
        } catch (e) {
          console.warn("endGame on unmount failed:", e?.message || e);
        }
      }
    };
  }, [currentPlayerId]);

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // ──────────────────────────────────
  // Game state
  // ──────────────────────────────────
  const [board, setBoard] = useState([]);
  const [moves, setMoves] = useState(0);
  const [timer, setTimer] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameWon, setGameWon] = useState(false);

  // live refs so stable callbacks can read fresh values
  const movesRef = useRef(0);
  const timerRef = useRef(0);
  const gameWonRef = useRef(false);
  useEffect(() => { movesRef.current = moves; }, [moves]);
  useEffect(() => { timerRef.current = timer; }, [timer]);
  useEffect(() => { gameWonRef.current = gameWon; }, [gameWon]);

  const GRID_SIZE = 4;
  const TILE_SIZE = (screenWidth - 80) / GRID_SIZE - 8;

  // ──────────────────────────────────
  // Helpers
  // ──────────────────────────────────
  const createSolvedBoard = () => {
    const b = [];
    for (let i = 1; i < GRID_SIZE * GRID_SIZE; i++) b.push(i);
    b.push(0);
    return b;
  };

  const isSolvable = (b) => {
    let inversions = 0;
    const flat = b.filter((v) => v !== 0);
    for (let i = 0; i < flat.length - 1; i++) {
      for (let j = i + 1; j < flat.length; j++) {
        if (flat[i] > flat[j]) inversions++;
      }
    }
    const emptyIndex = b.indexOf(0);
    const emptyRow = Math.floor(emptyIndex / GRID_SIZE);
    const emptyRowFromBottom = GRID_SIZE - emptyRow;
    if (emptyRowFromBottom % 2 === 0) return inversions % 2 === 1;
    return inversions % 2 === 0;
  };

  const calculateDifficulty = (b) => {
    let total = 0;
    for (let i = 0; i < b.length; i++) {
      const v = b[i];
      if (!v) continue;
      const cr = Math.floor(i / GRID_SIZE);
      const cc = i % GRID_SIZE;
      const tIdx = v - 1;
      const tr = Math.floor(tIdx / GRID_SIZE);
      const tc = tIdx % GRID_SIZE;
      total += Math.abs(cr - tr) + Math.abs(cc - tc);
    }
    return total;
  };

  const shuffleBoardWithMoves = () => {
    const nb = createSolvedBoard();
    const shuffleMoves = 100 + Math.floor(Math.random() * 100);
    for (let i = 0; i < shuffleMoves; i++) {
      const emptyIndex = nb.indexOf(0);
      const opts = getPossibleMoves(nb, emptyIndex);
      if (opts.length) {
        const pick = opts[Math.floor(Math.random() * opts.length)];
        [nb[emptyIndex], nb[pick]] = [nb[pick], nb[emptyIndex]];
      }
    }
    return nb;
  };

  const generateChallengingPuzzle = () => {
    let b;
    let attempts = 0;
    const maxAttempts = 1000;
    const minDifficulty = 25;
    do {
      b = [];
      for (let i = 0; i < GRID_SIZE * GRID_SIZE - 1; i++) b.push(i + 1);
      b.push(0);
      for (let i = b.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [b[i], b[j]] = [b[j], b[i]];
      }
      attempts++;
    } while ((!isSolvable(b) || calculateDifficulty(b) < minDifficulty) && attempts < maxAttempts);

    if (attempts >= maxAttempts) return shuffleBoardWithMoves();
    return b;
  };

  const shuffleBoard = () => generateChallengingPuzzle();

  const getPossibleMoves = (b, emptyIndex) => {
    const row = Math.floor(emptyIndex / GRID_SIZE);
    const col = emptyIndex % GRID_SIZE;
    const res = [];
    if (row > 0) res.push(emptyIndex - GRID_SIZE);
    if (row < GRID_SIZE - 1) res.push(emptyIndex + GRID_SIZE);
    if (col > 0) res.push(emptyIndex - 1);
    if (col < GRID_SIZE - 1) res.push(emptyIndex + 1);
    return res;
  };

  const isPuzzleSolved = (b) => {
    for (let i = 0; i < b.length - 1; i++) if (b[i] !== i + 1) return false;
    return b[b.length - 1] === 0;
  };

  // ──────────────────────────────────
  // Code Persistent: unified submitter
  // ──────────────────────────────────
  const submitPersistent = useCallback(
    (opts = {}) => {
      if (!gameId || submittedRef.current) return;
      const {
        completed = false,
        reason = "play",
      } = opts;

      const currentMoves = movesRef.current;
      const currentTime = timerRef.current;

      try {
        // For best_time games, we send time as SCORE only when completed
        const score = completed ? currentTime : 0;

        const meta = {
          result: completed ? "win" : "play",
          completed,
          reason,
          moves: currentMoves,
          time_s: currentTime,
        };
        if (completed) {
          meta.best_time = currentTime;
        }

        gameTracker.endGame(gameId, score, meta);
        submittedRef.current = true;
      } catch (e) {
        console.warn("submitPersistent failed:", e?.message || e);
      }
    },
    [gameId]
  );

  // ──────────────────────────────────
  // Initialize (stable) + mount once
  // ──────────────────────────────────
  const initializeGame = useCallback((reason = "restart") => {
    // If a run was going and not submitted yet, count it as a play (no best_time)
    if (!gameWonRef.current && (movesRef.current > 0 || timerRef.current > 0)) {
      submittedRef.current = false; // allow submit
      submitPersistent({ completed: false, reason });
    }

    const shuffled = shuffleBoard();
    setBoard(shuffled);
    setMoves(0);
    setTimer(0);
    setGameStarted(true);
    setGameWon(false);
    submittedRef.current = false; // fresh run
  }, [submitPersistent]);

  useEffect(() => {
    // Mount: start a fresh run. We don't need gameId ready for this; submissions no-op until it is.
    initializeGame("mount");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ──────────────────────────────────
  // Timer
  // ──────────────────────────────────
  useEffect(() => {
    let interval;
    if (gameStarted && !gameWon) {
      interval = setInterval(() => setTimer((prev) => prev + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [gameStarted, gameWon]);

  // ──────────────────────────────────
  // Tile press
  // ──────────────────────────────────
  const handleTilePress = (index) => {
    if (gameWon) return;
    const emptyIndex = board.indexOf(0);
    const options = getPossibleMoves(board, emptyIndex);
    if (!options.includes(index)) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const newBoard = [...board];
    [newBoard[emptyIndex], newBoard[index]] = [newBoard[index], newBoard[emptyIndex]];
    setBoard(newBoard);
    setMoves((m) => m + 1);

    // Win check (use newBoard)
    if (isPuzzleSolved(newBoard)) {
      setGameWon(true);
      // Submit best_time (time is the score) once
      submittedRef.current = false; // ensure we can submit final
      submitPersistent({ completed: true, reason: "win" });
    }
  };

  // ──────────────────────────────────
  // Back press: count as a play, reset, leave
  // ──────────────────────────────────
  const handleBackPress = useCallback(() => {
    submittedRef.current = false; // allow a play submit
    submitPersistent({ completed: false, reason: "back" });
    // Hard reset local state so coming back is fresh
    setBoard(createSolvedBoard());
    setMoves(0);
    setTimer(0);
    setGameStarted(false);
    setGameWon(false);
    router.back();
  }, [submitPersistent]);

  // ──────────────────────────────────
  // UI helpers
  // ──────────────────────────────────
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (!fontsLoaded) return null;

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
            onPress={handleBackPress}
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
            onPress={() => initializeGame("restart")}
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
        <View style={{ borderRadius: 16, overflow: "hidden" }}>
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
            {board.map((tile, index) => (
              <TouchableOpacity
                key={index}
                onPress={() => handleTilePress(index)}
                style={{
                  width: TILE_SIZE,
                  height: TILE_SIZE,
                  borderRadius: 8,
                  backgroundColor: tile === 0 ? "transparent" : colors.gameCard4,
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
            ))}
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

      {/* Win overlay */}
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
              <Trophy size={48} color={colors.gameAccent4} style={{ marginBottom: 16 }} />

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
                  onPress={() => initializeGame("restart")}
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
                  onPress={handleBackPress}
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
