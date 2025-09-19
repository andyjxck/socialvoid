// src/app/(tabs)/games/2048.jsx
import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, Text, TouchableOpacity, Dimensions } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
import { useFocusEffect } from "@react-navigation/native";

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
const GRID_SIZE = 4;

export default function Game2048() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  // IDs
  const [playerId, setPlayerId] = useState(null);
  const [gameId, setGameId] = useState(null);
  const gameIdRef = useRef(null);

  // Game state
  const [board, setBoard] = useState([]);
  const [score, setScore] = useState(0);
  const scoreRef = useRef(0);
  const [timer, setTimer] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [gameWon, setGameWon] = useState(false);
  const [gestureHandled, setGestureHandled] = useState(false);

  // timer + “submit once” guards
  const intervalRef = useRef(null);
  const submittedRef = useRef(false);

  // fonts
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // keep refs in sync
  useEffect(() => {
    scoreRef.current = score;
  }, [score]);
  useEffect(() => {
    gameIdRef.current = gameId;
  }, [gameId]);

  // ---------------- helpers ----------------
  const createEmptyBoard = () =>
    Array(GRID_SIZE)
      .fill(null)
      .map(() => Array(GRID_SIZE).fill(0));

  const addRandomTile = (currentBoard) => {
    const empty = [];
    for (let i = 0; i < GRID_SIZE; i++) {
      for (let j = 0; j < GRID_SIZE; j++) {
        if (currentBoard[i][j] === 0) empty.push({ row: i, col: j });
      }
    }
    if (!empty.length) return currentBoard;

    const pick = empty[Math.floor(Math.random() * empty.length)];
    const highest = Math.max(...currentBoard.flat());

    const available = [
      { value: 2, weight: 70 },
      { value: 4, weight: 25 },
      ...(highest >= 128 ? [{ value: 8, weight: 4 }] : []),
      ...(highest >= 256 ? [{ value: 16, weight: 0.8 }] : []),
      ...(highest >= 512 ? [{ value: 32, weight: 0.2 }] : []),
    ];
    const total = available.reduce((s, t) => s + t.weight, 0);
    let r = Math.random() * total;
    let val = 2;
    for (const t of available) {
      r -= t.weight;
      if (r <= 0) {
        val = t.value;
        break;
      }
    }

    const next = currentBoard.map((row) => [...row]);
    next[pick.row][pick.col] = val;
    return next;
  };

  const initializeGame = useCallback(() => {
    // fresh board + local state reset
    let b = createEmptyBoard();
    b = addRandomTile(b);
    b = addRandomTile(b);
    setBoard(b);
    setScore(0);
    setTimer(0);
    setGameOver(false);
    setGameWon(false);
    setGestureHandled(false);
    submittedRef.current = false; // allow a future submit
  }, []);

  // ---------------- IDs bootstrap ----------------
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem("puzzle_hub_player_id");
        setPlayerId(saved ? parseInt(saved, 10) : 1);
      } catch {
        setPlayerId(1);
      }
    })();
  }, []);

  // ---------------- focus/blur lifecycle ----------------
  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      const start = async () => {
        if (!playerId) return;
        const id = await getGameId(GAME_TYPES.TWENTY48);
        if (!isActive) return;

        setGameId(id);
        // start tracking & start fresh run
        await gameTracker.startGame(id, playerId);
        initializeGame();

        // start timer
        if (!intervalRef.current) {
          intervalRef.current = setInterval(() => {
            setTimer((t) => t + 1);
          }, 1000);
        }
      };

      start();

      // on blur/unfocus → stop timer + submit once with current score
      return () => {
        isActive = false;
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        const gid = gameIdRef.current;
        if (gid && playerId && !submittedRef.current) {
          submittedRef.current = true;
          // fire-and-forget to avoid blocking nav
          gameTracker.endGame(gid, scoreRef.current, { reason: "blur" });
        }
      };
    }, [playerId, initializeGame]) // ← don't depend on score/gameId to avoid accidental cleanups
  );

  // ---------------- back button ----------------
  const handleBack = async () => {
    try {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (gameIdRef.current && playerId && !submittedRef.current) {
        submittedRef.current = true;
        await gameTracker.endGame(gameIdRef.current, scoreRef.current, { reason: "back_button" });
      }
    } catch {}
    router.back();
  };

  // ---------------- gameplay ----------------
  const isGameOver = (b) => {
    // empty cell?
    for (let i = 0; i < GRID_SIZE; i++) {
      for (let j = 0; j < GRID_SIZE; j++) if (b[i][j] === 0) return false;
    }
    // merges available?
    for (let i = 0; i < GRID_SIZE; i++) {
      for (let j = 0; j < GRID_SIZE; j++) {
        const v = b[i][j];
        if ((i < GRID_SIZE - 1 && v === b[i + 1][j]) || (j < GRID_SIZE - 1 && v === b[i][j + 1]))
          return false;
      }
    }
    return true;
  };

  const moveTiles = async (direction) => {
    if (gameOver || gameWon) return;

    let newBoard = board.map((row) => [...row]);
    let newScore = score;
    let moved = false;

    const slideArray = (arr) => {
      let filtered = arr.filter((v) => v !== 0);
      for (let i = 0; i < filtered.length - 1; i++) {
        if (filtered[i] === filtered[i + 1]) {
          filtered[i] *= 2;
          filtered[i + 1] = 0;
          newScore += filtered[i];
          if (filtered[i] === 2048 && !gameWon) setGameWon(true);
        }
      }
      filtered = filtered.filter((v) => v !== 0);
      while (filtered.length < GRID_SIZE) filtered.push(0);
      return filtered;
    };

    if (direction === "left") {
      for (let i = 0; i < GRID_SIZE; i++) {
        const row = newBoard[i];
        const next = slideArray(row);
        if (JSON.stringify(row) !== JSON.stringify(next)) moved = true;
        newBoard[i] = next;
      }
    } else if (direction === "right") {
      for (let i = 0; i < GRID_SIZE; i++) {
        const row = newBoard[i];
        const next = slideArray([...row].reverse()).reverse();
        if (JSON.stringify(row) !== JSON.stringify(next)) moved = true;
        newBoard[i] = next;
      }
    } else if (direction === "up") {
      for (let j = 0; j < GRID_SIZE; j++) {
        const col = [];
        for (let i = 0; i < GRID_SIZE; i++) col.push(newBoard[i][j]);
        const next = slideArray(col);
        for (let i = 0; i < GRID_SIZE; i++) newBoard[i][j] = next[i];
        if (JSON.stringify(col) !== JSON.stringify(next)) moved = true;
      }
    } else if (direction === "down") {
      for (let j = 0; j < GRID_SIZE; j++) {
        const col = [];
        for (let i = 0; i < GRID_SIZE; i++) col.push(newBoard[i][j]);
        const next = slideArray(col.reverse()).reverse();
        for (let i = 0; i < GRID_SIZE; i++) newBoard[i][j] = next[i];
        if (JSON.stringify(col) !== JSON.stringify(next.slice().reverse())) moved = true;
      }
    }

    if (!moved) return;

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    newBoard = addRandomTile(newBoard);
    setBoard(newBoard);
    setScore(newScore);

    if (isGameOver(newBoard)) {
      setGameOver(true);
      // stop timer & submit once
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (gameIdRef.current && playerId && !submittedRef.current) {
        submittedRef.current = true;
        await gameTracker.endGame(gameIdRef.current, newScore, { reason: "game_over" });
      }
    }
  };

  // gestures
  const onHandlerStateChange = () => {
    // reset swipe gate on any state change (simple & robust)
    setGestureHandled(false);
  };

  const onGestureEvent = ({ nativeEvent }) => {
    if (gestureHandled) return;
    const { translationX, translationY } = nativeEvent;
    const ax = Math.abs(translationX);
    const ay = Math.abs(translationY);
    const threshold = 50;

    if (ax > threshold || ay > threshold) {
      setGestureHandled(true);
      if (ax > ay) {
        translationX > 0 ? moveTiles("right") : moveTiles("left");
      } else {
        translationY > 0 ? moveTiles("down") : moveTiles("up");
      }
    }
  };

  // styles helpers
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
  const getTextColor = (value) => (value <= 4 ? "#776E65" : "#FFFFFF");
  const formatTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  // fonts gate
  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <StatusBar style={isDark ? "light" : "dark"} />
        <NightSkyBackground />

        {/* Header */}
        <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, marginBottom: 20 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 16,
            }}
          >
            <TouchableOpacity
              onPress={handleBack}
              style={{
                padding: 8,
                borderRadius: 12,
                backgroundColor: colors.glassSecondary,
              }}
            >
              <ArrowLeft size={24} color={colors.text} />
            </TouchableOpacity>

            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 20, color: colors.text }}>
              2048
            </Text>

            <TouchableOpacity
              onPress={() => {
                // hard reset local run (does NOT submit)
                if (intervalRef.current) {
                  clearInterval(intervalRef.current);
                  intervalRef.current = null;
                }
                initializeGame();
                // restart timer
                intervalRef.current = setInterval(() => {
                  setTimer((t) => t + 1);
                }, 1000);
              }}
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
          <View style={{ borderRadius: 16, overflow: "hidden" }}>
            <BlurView
              intensity={isDark ? 60 : 80}
              tint={isDark ? "dark" : "light"}
              style={{
                backgroundColor: isDark ? "rgba(31,41,55,0.7)" : "rgba(255,255,255,0.7)",
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
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.gameAccent3 }}>
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
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.text }}>
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
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.text }}>
                    {formatTime(timer)}
                  </Text>
                </View>
              </View>
            </BlurView>
          </View>
        </View>

        {/* Board */}
        <RNPanGestureHandler onGestureEvent={onGestureEvent} onHandlerStateChange={onHandlerStateChange}>
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
              {board.map((row, i) => (
                <View key={i} style={{ flexDirection: "row", flex: 1 }}>
                  {row.map((val, j) => (
                    <View
                      key={`${i}-${j}`}
                      style={{
                        flex: 1,
                        margin: 4,
                        borderRadius: 8,
                        backgroundColor: val === 0 ? colors.border : getTileColor(val),
                        justifyContent: "center",
                        alignItems: "center",
                      }}
                    >
                      {val !== 0 && (
                        <Text
                          style={{
                            fontFamily: "Inter_700Bold",
                            fontSize: val >= 1000 ? 16 : val >= 100 ? 20 : 24,
                            color: getTextColor(val),
                          }}
                        >
                          {val}
                        </Text>
                      )}
                    </View>
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
              }}
            >
              Swipe to move tiles. Combine tiles with the same number to reach 2048!
            </Text>
          </View>
        </RNPanGestureHandler>

        {/* Overlay */}
        {(gameOver || gameWon) && (
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0,0,0,0.7)",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <View style={{ borderRadius: 20, overflow: "hidden", margin: 20 }}>
              <BlurView
                intensity={isDark ? 80 : 100}
                tint={isDark ? "dark" : "light"}
                style={{
                  backgroundColor: isDark ? "rgba(31,41,55,0.9)" : "rgba(255,255,255,0.9)",
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
                    onPress={() => {
                      // restart run (no submit)
                      if (intervalRef.current) {
                        clearInterval(intervalRef.current);
                        intervalRef.current = null;
                      }
                      initializeGame();
                      intervalRef.current = setInterval(() => {
                        setTimer((t) => t + 1);
                      }, 1000);
                    }}
                    style={{
                      backgroundColor: colors.secondaryButton,
                      paddingHorizontal: 20,
                      paddingVertical: 12,
                      borderRadius: 12,
                    }}
                  >
                    <Text
                      style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.secondaryButtonText }}
                    >
                      Play Again
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={handleBack}
                    style={{
                      backgroundColor: colors.primaryButton,
                      paddingHorizontal: 20,
                      paddingVertical: 12,
                      borderRadius: 12,
                    }}
                  >
                    <Text
                      style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.primaryButtonText }}
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
