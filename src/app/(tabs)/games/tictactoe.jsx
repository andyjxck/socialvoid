// src/app/(tabs)/games/tictactoe.jsx
import React, { useEffect, useState, useRef, useCallback } from "react";
import { View, Text, TouchableOpacity, Alert, Dimensions, Modal, ScrollView } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../../../utils/theme";
import { router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { ArrowLeft, RotateCcw, X as XIcon, Circle, Trophy } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import gameTracker from "../../../utils/gameTracking";
import { getGameId, GAME_TYPES } from "../../../utils/gameUtils";
import NightSkyBackground from "../../../components/NightSkyBackground";
import AchievementsSection from "../../../components/AchievementsSection";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";

const { width } = Dimensions.get("window");
const CELL = Math.min(100, Math.floor((width - 64) / 3));
const BLUNDER_CHANCE = 0.025; // 0 = perfect, 1 = random

export default function TicTacToe() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  // IDs / session
  const [playerId, setPlayerId] = useState(null);
  const [gameTypeId, setGameTypeId] = useState(null);
  const runIdRef = useRef(null);        // run/session id from startGame
  const submittedRef = useRef(false);   // guard endGame once
  const endHandledRef = useRef(false);  // guard end-of-game UI once

  // Achievements UI
  const [showAchievements, setShowAchievements] = useState(false);

  // fonts
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // timer
  const [seconds, setSeconds] = useState(0);
  const secondsRef = useRef(0);
  const timerRef = useRef(null);
  const startTimer = () => {
    if (timerRef.current) return;
    timerRef.current = setInterval(() => {
      setSeconds((s) => {
        const next = s + 1;
        secondsRef.current = next;
        return next;
      });
    }, 1000);
  };
  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };
  const resetTimer = () => {
    secondsRef.current = 0;
    setSeconds(0);
  };

  // game state
  const EMPTY = null; // null | 'X' | 'O'
  const [board, setBoard] = useState(Array(9).fill(EMPTY));
  const [turn, setTurn] = useState(Math.random() < 0.5 ? "X" : "O"); // random first turn
  const [gameOver, setGameOver] = useState(false);

  const winningLines = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ];

  const winnerOf = useCallback((b) => {
    for (const [a, c, d] of winningLines) {
      if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a]; // 'X' or 'O'
    }
    if (b.every((v) => v)) return "draw";
    return null;
  }, []);

  const resetBoard = useCallback(() => {
    endHandledRef.current = false;
    setBoard(Array(9).fill(EMPTY));
    setTurn(Math.random() < 0.5 ? "X" : "O"); // 50/50 each new game
    setGameOver(false);
    resetTimer();
  }, []);

  // load player id once
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

  // unified end run (uses real run id + current time)
  const endRunNow = async (score = 0, meta = {}) => {
    const runId = runIdRef.current;
    if (!runId || submittedRef.current) return;
    try {
      await gameTracker.endGame(runId, score, { ...meta, time_s: secondsRef.current });
    } catch {}
    submittedRef.current = true;
  };

  // Start session on focus; end on blur — DEPENDS ONLY ON playerId
  useFocusEffect(
    useCallback(() => {
      let active = true;

      (async () => {
        if (!playerId) return;
        try {
          const numericId = await getGameId(GAME_TYPES.TICTACTOE); // must be NUMBER
          if (!active) return;
          setGameTypeId(numericId);

          const started = await gameTracker.startGame(numericId, playerId);
          // run/session id from backend; fallback to numeric game type id
          runIdRef.current = Number.isFinite(Number(started)) ? Number(started) : numericId;

          submittedRef.current = false;
          resetBoard();
          stopTimer();
          resetTimer();
          startTimer();

          console.log("[TicTacToe] session started:", {
            gameTypeId: numericId,
            runId: runIdRef.current,
            playerId,
          });
        } catch (e) {
          console.warn("TicTacToe startGame failed:", e);
        }
      })();

      return () => {
        active = false;
        stopTimer();
        if (!submittedRef.current && runIdRef.current) {
          endRunNow(0, { cancelled: true, reason: "blur" });
        }
      };
    }, [playerId])
  );

  // safety on unmount
  useEffect(() => {
    return () => {
      stopTimer();
      if (!submittedRef.current && runIdRef.current) {
        endRunNow(0, { cancelled: true, reason: "unmount" });
      }
    };
  }, []);

  // minimax (perfect play)
  const minimax = (b, isMax) => {
    const w = winnerOf(b);
    if (w === "X") return -10;
    if (w === "O") return 10;
    if (w === "draw") return 0;

    let best = isMax ? -Infinity : Infinity;
    const mark = isMax ? "O" : "X";
    for (let i = 0; i < 9; i++) {
      if (!b[i]) {
        b[i] = mark;
        const score = minimax(b, !isMax);
        b[i] = null;
        best = isMax ? Math.max(best, score) : Math.min(best, score);
      }
    }
    return best;
  };

  // AI move with small blunder chance
  const aiMove = useCallback(() => {
    setBoard((prev) => {
      const b = [...prev];
      const options = [];
      for (let i = 0; i < 9; i++) {
        if (!b[i]) {
          b[i] = "O";
          const score = minimax(b, false);
          b[i] = null;
          options.push({ idx: i, score });
        }
      }
      if (!options.length) return b;
      options.sort((a, c) => c.score - a.score);

      let chosen;
      if (Math.random() < BLUNDER_CHANCE) {
        const half = Math.max(1, Math.floor(options.length / 2));
        const worse = options.slice(half);
        chosen = worse[Math.floor(Math.random() * worse.length)];
      } else {
        const top = options[0].score;
        const bests = options.filter(o => o.score === top);
        chosen = bests[Math.floor(Math.random() * bests.length)];
      }
      if (chosen) b[chosen.idx] = "O";
      return b;
    });
    setTurn("X");
  }, [minimax]);

  // turn loop + end-of-game
  useEffect(() => {
    const w = winnerOf(board);
    if (!w) {
      if (turn === "O" && !gameOver) {
        const t = setTimeout(() => aiMove(), 300);
        return () => clearTimeout(t);
      }
      return;
    }

    if (endHandledRef.current) return;
    endHandledRef.current = true;

    setGameOver(true);
    stopTimer();

    let title, score, meta;
    if (w === "X") {
      title = "You win! 🏆";
      score = 100;
      meta = { result: "win" };
    } else if (w === "O") {
      title = "AI wins 🤖";
      score = 10;
      meta = { result: "loss" };
    } else {
      title = "Draw 🤝";
      score = 25;
      meta = { result: "draw" };
    }

    endRunNow(score, meta);

    Alert.alert("Game Over", title, [
      { text: "Play Again", onPress: () => { resetBoard(); startTimer(); } },
      { text: "Back to Hub", onPress: () => router.back() },
    ]);
  }, [board, turn, gameOver, winnerOf, aiMove, resetBoard, stopTimer]);

  // player tap
  const tap = async (idx) => {
    if (gameOver || turn !== "X" || board[idx]) return;
    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    setBoard((b) => {
      const nb = [...b];
      nb[idx] = "X";
      return nb;
    });
    setTurn("O");
  };

  // back button — end run with time BEFORE navigating
  const handleBack = useCallback(async () => {
    stopTimer();
    if (!submittedRef.current && runIdRef.current) {
      await endRunNow(0, { cancelled: true, reason: "back" });
    }
    router.back();
  }, []);

  if (!fontsLoaded) return null;

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <NightSkyBackground />

      {/* Header */}
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 16, marginBottom: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <TouchableOpacity
            onPress={handleBack}
            style={{ padding: 8, borderRadius: 12, backgroundColor: colors.glassSecondary }}
          >
            <ArrowLeft size={24} color={colors.text} />
          </TouchableOpacity>

          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 20, color: colors.text }}>
            Tic-Tac-Toe
          </Text>

          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity
              onPress={() => { setShowAchievements(true); stopTimer(); }}
              style={{ padding: 8, borderRadius: 12, backgroundColor: colors.glassSecondary }}
            >
              <Trophy size={22} color={colors.text} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => { resetBoard(); startTimer(); }}
              style={{ padding: 8, borderRadius: 12, backgroundColor: colors.glassSecondary }}
            >
              <RotateCcw size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ borderRadius: 16, overflow: "hidden" }}>
          <BlurView
            intensity={isDark ? 60 : 80}
            tint={isDark ? "dark" : "light"}
            style={{
              backgroundColor: isDark ? "rgba(31,41,55,0.7)" : "rgba(255,255,255,0.7)",
              borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 14
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-around", alignItems: "center" }}>
              <View style={{ alignItems: "center" }}>
                <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.textSecondary, textTransform: "uppercase" }}>You</Text>
                <XIcon size={22} color={colors.gameAccent3} />
              </View>
              <View style={{ alignItems: "center" }}>
                <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.textSecondary, textTransform: "uppercase" }}>AI</Text>
                <Circle size={22} color={colors.gameAccent1} />
              </View>
              <View style={{ alignItems: "center" }}>
                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.text }}>
                  {gameOver ? "Finished" : (turn === "X" ? "Your turn" : "AI thinking…")}
                </Text>
                <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.textSecondary, marginTop: 4 }}>
                  Time: {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
                </Text>
              </View>
            </View>
          </BlurView>
        </View>
      </View>

      {/* Board */}
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingBottom: insets.bottom + 32 }}>
        <BlurView
          intensity={isDark ? 50 : 80}
          tint={isDark ? "dark" : "light"}
          style={{
            borderRadius: 20, padding: 8,
            backgroundColor: isDark ? "rgba(31,41,55,0.7)" : "rgba(255,255,255,0.7)",
            borderWidth: 1, borderColor: colors.border
          }}
        >
          <View style={{ width: CELL * 3, height: CELL * 3, flexDirection: "row", flexWrap: "wrap" }}>
            {board.map((v, i) => {
              const r = Math.floor(i / 3), c = i % 3;
              const showRight = c < 2, showBottom = r < 2;
              return (
                <TouchableOpacity
                  key={i}
                  onPress={() => tap(i)}
                  style={{
                    width: CELL, height: CELL, alignItems: "center", justifyContent: "center",
                    borderRightWidth: showRight ? 1 : 0, borderBottomWidth: showBottom ? 1 : 0,
                    borderColor: isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)"
                  }}
                >
                  {v === "X" && <XIcon size={Math.floor(CELL * 0.5)} color={colors.gameAccent3} />}
                  {v === "O" && <Circle size={Math.floor(CELL * 0.5)} color={colors.gameAccent1} />}
                </TouchableOpacity>
              );
            })}
          </View>
          <LinearGradient colors={["rgba(255,255,255,0.06)", "transparent"]} style={{ height: 6, borderRadius: 6, marginTop: 8 }} />
        </BlurView>
      </View>

      {/* Achievements Modal */}
      <Modal
        visible={showAchievements}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowAchievements(false);
          if (!gameOver) startTimer();
        }}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", paddingHorizontal: 16 }}>
          <View
            style={{
              borderRadius: 16,
              overflow: "hidden",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.15)",
              backgroundColor: "rgba(0,0,0,0.9)",
              maxHeight: "80%",
            }}
          >
            <View
              style={{
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderBottomColor: "rgba(255,255,255,0.12)",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Text style={{ fontWeight: "700", fontSize: 16, color: "#fff" }}>
                Tic-Tac-Toe Achievements
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setShowAchievements(false);
                  if (!gameOver) startTimer();
                }}
                hitSlop={10}
              >
                <Text style={{ fontWeight: "600", fontSize: 14, color: "rgba(255,255,255,0.75)" }}>
                  Close
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 12 }}>
              {playerId != null && gameTypeId != null ? (
                <AchievementsSection
                  key={`${gameTypeId}-${playerId}`}
                  playerId={playerId}
                  gameId={gameTypeId}
                  autoRefreshMs={15000}
                  showSearchBar
                  showFilters
                />
              ) : (
                <View style={{ padding: 16 }}>
                  <Text style={{ color: "rgba(255,255,255,0.75)", textAlign: "center", fontWeight: "500" }}>
                    Loading achievements…
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
