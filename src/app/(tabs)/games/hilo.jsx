// src/app/(tabs)/games/hilo.jsx  (REPLACE ENTIRE FILE)
import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, Text, TouchableOpacity, Dimensions, BackHandler, AppState } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { router } from "expo-router";
import { ArrowLeft, RotateCcw, Trophy, ChevronUp, ChevronDown, Info } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import AchievementsSection from "../../../components/AchievementsSection";
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
import { useFocusEffect, useIsFocused } from "@react-navigation/native";

const { width: screenWidth } = Dimensions.get("window");

// ---- RANGE ----
const MIN_VAL = 1;
const MAX_VAL = 20;

// ---- IMPORTANT: set this to the real Hi-Lo id in your `games` table ----
const FALLBACK_GAME_ID = 22;

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

export default function HiLoGame() {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();

  // fonts
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // lifecycle/session refs
  const sessionOpenRef = useRef(false);
  const gameIdRef = useRef(null);
  const scoreRef = useRef(0);
  const inputLockRef = useRef(false);
  const appStateRef = useRef(AppState.currentState);
  const retryTimerRef = useRef(null);
  const didInitRef = useRef(false);

  // player
  const [currentPlayerId, setCurrentPlayerId] = useState(null);

  // game state
  const [currentNumber, setCurrentNumber] = useState(null);
  const [nextNumber, setNextNumber] = useState(null);
  const [score, setScore] = useState(0); // streak
  const [rounds, setRounds] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [message, setMessage] = useState("Make your call… Higher or Lower?");
  const [showAchievements, setShowAchievements] = useState(false);

  // keep scoreRef synced
  useEffect(() => { scoreRef.current = score; }, [score]);

  // load player id once
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem("puzzle_hub_player_id");
        setCurrentPlayerId(saved ? parseInt(saved, 10) : 1);
      } catch {
        setCurrentPlayerId(1);
      }
    })();
  }, []);

  // pure reset (only when we actually want a new run)
  const resetState = useCallback(() => {
    const first = rand(MIN_VAL, MAX_VAL);
    let next = rand(MIN_VAL, MAX_VAL);
    while (next === first) next = rand(MIN_VAL, MAX_VAL);

    setCurrentNumber(first);
    setNextNumber(next);
    setScore(0);
    setRounds(0);
    setMessage("Make your call… Higher or Lower?");
    setGameOver(false);
    inputLockRef.current = false;
  }, []);

  // live signals → AchievementsSection
  const pushSignals = useCallback((extra = {}) => {
    if (!gameIdRef.current) return;
    gameTracker.updateGameData(gameIdRef.current, {
      min_val: MIN_VAL,
      max_val: MAX_VAL,
      streak: scoreRef.current,
      rounds_played: rounds,
      current_number: currentNumber ?? null,
      ...extra,
    });
  }, [currentNumber, rounds]);

  // Resolve game id with retries, then actually open a tracked session
  const openTrackedSession = useCallback(
    async (attempt = 1) => {
      if (sessionOpenRef.current) return;
      if (!currentPlayerId || !isFocused) return;

      try {
        let gid = null;
        if (typeof getGameId === "function") {
          try { gid = await getGameId(GAME_TYPES?.HILO ?? "HI_LO"); } catch {}
          if (!gid) { try { gid = await getGameId("hilo"); } catch {} }
          if (!gid) { try { gid = await getGameId("Hi-Lo"); } catch {} }
        }
        if (!gid) gid = FALLBACK_GAME_ID;
        gameIdRef.current = gid;

        await gameTracker.startGame(gid, currentPlayerId);
        sessionOpenRef.current = true;
        pushSignals();
      } catch (e) {
        if (attempt < 5 && isFocused) {
          clearTimeout(retryTimerRef.current);
          retryTimerRef.current = setTimeout(() => {
            openTrackedSession(attempt + 1);
          }, 400 * attempt);
        }
      }
    },
    [currentPlayerId, isFocused, pushSignals]
  );

  const closeTrackedSession = useCallback(async (finalMeta = {}) => {
    clearTimeout(retryTimerRef.current);
    if (!sessionOpenRef.current) return;

    const gid = gameIdRef.current;
    gameIdRef.current = null;

    try {
      await gameTracker.endGame(gid, scoreRef.current || 0, {
        min_val: MIN_VAL,
        max_val: MAX_VAL,
        rounds,
        ...finalMeta,
      });
    } catch {
      // swallow
    } finally {
      sessionOpenRef.current = false;
    }
  }, [rounds]);

  // INIT: do a single reset when the screen FIRST mounts & becomes focused
  useEffect(() => {
    if (!didInitRef.current && isFocused) {
      didInitRef.current = true;
      resetState();
    }
  }, [isFocused, resetState]);

  // Start session only when: focused + playerId present. End when unfocused.
  useEffect(() => {
    if (isFocused && currentPlayerId) {
      openTrackedSession();
    } else {
      closeTrackedSession({ reason: "unfocus" });
    }
  }, [isFocused, currentPlayerId, openTrackedSession, closeTrackedSession]);

  // Only handle the back press; DO NOT reset on focus changes
  useFocusEffect(
    useCallback(() => {
      const back = BackHandler.addEventListener("hardwareBackPress", () => {
        closeTrackedSession({ reason: "back" });
        router.back();
        return true;
      });
      return () => {
        back.remove();
        closeTrackedSession({ reason: "blur" });
      };
    }, [closeTrackedSession])
  );

  // App background/foreground handling
  useEffect(() => {
    const sub = AppState.addEventListener("change", async (state) => {
      appStateRef.current = state;
      if ((state === "inactive" || state === "background") && sessionOpenRef.current) {
        await closeTrackedSession({ reason: "bg" });
      }
      if (state === "active" && isFocused && currentPlayerId && !sessionOpenRef.current) {
        await openTrackedSession();
      }
    });
    return () => sub.remove();
  }, [isFocused, currentPlayerId, openTrackedSession, closeTrackedSession]);

  // guessing
  const handleGuess = async (dir) => {
    if (gameOver || inputLockRef.current) return;
    inputLockRef.current = true;

    const wasHigher = nextNumber > currentNumber;
    const correct =
      (dir === "higher" && wasHigher) || (dir === "lower" && !wasHigher);

    if (correct) {
      try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      const newScore = score + 1;
      const newCurrent = nextNumber;

      // compute upcoming next BEFORE setting state
      let newNext = rand(MIN_VAL, MAX_VAL);
      while (newNext === newCurrent) newNext = rand(MIN_VAL, MAX_VAL);

      // single “round advance” state update
      setScore(newScore);
      setRounds((r) => r + 1);
      setCurrentNumber(newCurrent);
      setNextNumber(newNext);
      setMessage(`Correct! It was ${newCurrent}. Keep going…`);
      pushSignals({ streak: newScore, rounds_played: rounds + 1, current_number: newCurrent });

      inputLockRef.current = false;
      return;
    }

    try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
    setMessage(`Wrong! It was ${nextNumber}.`);
    setGameOver(true);
    pushSignals({ result: "loss", final_revealed: nextNumber });

    await closeTrackedSession({ reason: "loss", result: "loss" });
    inputLockRef.current = false;
  };

  const restartGame = async () => {
    await closeTrackedSession({ reason: "replay" });
    resetState();
    await openTrackedSession();
    pushSignals();
  };

  if (!fontsLoaded) return null;

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="light" />
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
            onPress={() => {
              closeTrackedSession({ reason: "back" });
              router.back();
            }}
            style={{
              padding: 8,
              borderRadius: 12,
              backgroundColor: "rgba(255,255,255,0.08)",
            }}
          >
            <ArrowLeft size={24} color="#fff" />
          </TouchableOpacity>

          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 20, color: "#fff" }}>Hi-Lo</Text>

          <View style={{ flexDirection: "row", gap: 10 }}>
            {/* Achievements */}
            <TouchableOpacity
              onPress={() => setShowAchievements(true)}
              style={{ padding: 8, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.08)" }}
            >
              <Trophy size={22} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={restartGame}
              style={{
                padding: 8,
                borderRadius: 12,
                backgroundColor: "rgba(255,255,255,0.08)",
              }}
            >
              <RotateCcw size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Streak + Range Card */}
        <BlurView
          intensity={80}
          tint="dark"
          style={{
            backgroundColor: "rgba(0,0,0,0.35)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.12)",
            borderRadius: 16,
            padding: 16,
          }}
        >
          <View style={{ alignItems: "center" }}>
            <Text
              style={{
                fontFamily: "Inter_500Medium",
                fontSize: 12,
                color: "rgba(255,255,255,0.8)",
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginBottom: 4,
              }}
            >
              Streak
            </Text>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 24, color: "#9AE6B4" }}>
              {score.toLocaleString()}
            </Text>

            {/* Clear range prompt */}
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 10, gap: 6 }}>
              <Info size={14} color="rgba(255,255,255,0.7)" />
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: "rgba(255,255,255,0.85)" }}>
                Range: {MIN_VAL}–{MAX_VAL}
              </Text>
            </View>
          </View>
        </BlurView>
      </View>

      {/* Body */}
      <View style={{ flex: 1, paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}>
        {/* Number + Message */}
        <View style={{ alignItems: "center", marginBottom: 16 }}>
          <BlurView
            intensity={100}
            tint="dark"
            style={{
              width: screenWidth - 40,
              borderRadius: 20,
              paddingVertical: 28,
              paddingHorizontal: 20,
              backgroundColor: "rgba(0,0,0,0.4)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.12)",
            }}
          >
            <Text
              style={{
                textAlign: "center",
                fontFamily: "Inter_500Medium",
                fontSize: 12,
                letterSpacing: 0.6,
                color: "rgba(255,255,255,0.75)",
                marginBottom: 10,
                textTransform: "uppercase",
              }}
            >
              Current Number
            </Text>
            <Text
              style={{
                textAlign: "center",
                fontFamily: "Inter_700Bold",
                fontSize: 56,
                color: "#fff",
              }}
            >
              {currentNumber ?? "-"}
            </Text>
            <Text
              style={{
                textAlign: "center",
                fontFamily: "Inter_500Medium",
                fontSize: 13,
                color: "rgba(255,255,255,0.85)",
                marginTop: 16,
              }}
            >
              {message}
            </Text>
            <Text
              style={{
                textAlign: "center",
                fontFamily: "Inter_500Medium",
                fontSize: 12,
                color: "rgba(255,255,255,0.6)",
                marginTop: 6,
              }}
            >
              Numbers are between {MIN_VAL} and {MAX_VAL}
            </Text>
          </BlurView>
        </View>

        {/* Controls */}
        <View style={{ flex: 1, justifyContent: "flex-end", gap: 14 }}>
          <TouchableOpacity
            disabled={gameOver}
            onPress={() => handleGuess("lower")}
            activeOpacity={0.9}
            style={{
              opacity: gameOver ? 0.5 : 1,
              backgroundColor: "rgba(255,255,255,0.08)",
              borderRadius: 16,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.14)",
              paddingVertical: 16,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <ChevronDown size={20} color="#FCA5A5" />
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: "#fff" }}>
                Lower
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            disabled={gameOver}
            onPress={() => handleGuess("higher")}
            activeOpacity={0.9}
            style={{
              opacity: gameOver ? 0.5 : 1,
              backgroundColor: "rgba(255,255,255,0.08)",
              borderRadius: 16,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.14)",
              paddingVertical: 16,
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 12,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <ChevronUp size={20} color="#9AE6B4" />
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: "#fff" }}>
                Higher
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Game Over Overlay */}
        {gameOver && (
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
              paddingHorizontal: 20,
            }}
          >
            <BlurView
              intensity={100}
              tint="dark"
              style={{
                backgroundColor: "rgba(0,0,0,0.85)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.15)",
                borderRadius: 20,
                padding: 32,
                alignItems: "center",
                width: screenWidth - 40,
              }}
            >
              <Trophy size={48} color="#9AE6B4" style={{ marginBottom: 16 }} />
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 24, color: "#fff", marginBottom: 8 }}>
                Game Over
              </Text>
              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 18, color: "#9AE6B4", marginBottom: 20 }}>
                Streak: {score.toLocaleString()}
              </Text>

              <View style={{ flexDirection: "row" }}>
                <TouchableOpacity
                  onPress={restartGame}
                  style={{
                    backgroundColor: "rgba(255,255,255,0.12)",
                    paddingHorizontal: 20,
                    paddingVertical: 12,
                    borderRadius: 12,
                    marginRight: 12,
                  }}
                >
                  <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#fff" }}>
                    Play Again
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    closeTrackedSession({ reason: "back_from_modal" });
                    router.back();
                  }}
                  style={{
                    backgroundColor: "#6366F1",
                    paddingHorizontal: 20,
                    paddingVertical: 12,
                    borderRadius: 12,
                  }}
                >
                  <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#fff" }}>
                    Back to Hub
                  </Text>
                </TouchableOpacity>
              </View>
            </BlurView>
          </View>
        )}
      </View>

      {/* Achievements Modal */}
      {showAchievements && (
        <View
          style={{
            position: "absolute",
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: "rgba(0,0,0,0.6)",
            justifyContent: "center",
            paddingHorizontal: 16,
          }}
        >
          <BlurView
            intensity={100}
            tint="dark"
            style={{
              borderRadius: 16,
              overflow: "hidden",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.12)",
              backgroundColor: "rgba(0,0,0,0.85)",
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
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: "#fff" }}>
                Hi-Lo Achievements
              </Text>
              <TouchableOpacity onPress={() => setShowAchievements(false)} hitSlop={10}>
                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: "rgba(255,255,255,0.8)" }}>
                  Close
                </Text>
              </TouchableOpacity>
            </View>

            <View style={{ padding: 12 }}>
              {currentPlayerId && gameIdRef.current ? (
                <AchievementsSection
                  playerId={currentPlayerId}
                  gameId={gameIdRef.current}
                  autoRefreshMs={15000}
                  showSearchBar
                  showFilters
                />
              ) : (
                <View style={{ padding: 16 }}>
                  <Text style={{ color: "rgba(255,255,255,0.75)", textAlign: "center", fontFamily: "Inter_600SemiBold" }}>
                    Loading achievements…
                  </Text>
                </View>
              )}
            </View>
          </BlurView>
        </View>
      )}
    </View>
  );
}
