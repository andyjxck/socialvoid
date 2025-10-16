// mobile/src/app/games/WhackATapGame.jsx
import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, Text, TouchableOpacity, Dimensions, Alert, BackHandler, Pressable, Modal, ScrollView } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../../utils/theme";
import { BlurView } from "expo-blur";
import { router } from "expo-router";
import { ArrowLeft, RotateCcw, Play, Trophy } from "lucide-react-native";
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
import { supabase } from "../../../utils/supabase";

const { width: screenWidth } = Dimensions.get("window");

/** Tweaks to make it more “whackable” */
const GAME_DURATION = 60;              // seconds
const MOLE_SHOW_TIME = 650;            // ms visible (↑ from 475)
const MOLE_SPAWN_INTERVAL = {          // ms between spawns
  min: 550,
  max: 800,
};
const TAP_GRACE_MS = 150;              // ms after mole hides where a tap still counts
const HIT_SLOP = { top: 12, bottom: 12, left: 12, right: 12 };

export default function WhackATapGame() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const [currentPlayerId, setCurrentPlayerId] = useState(null);
  const [gameId, setGameId] = useState(null);
  const gameIdRef = useRef(null);
  const sessionIdRef = useRef(null);

  const activeRef = useRef(false);
  const submittedRef = useRef(false);

  // Achievements modal
  const [showAchievements, setShowAchievements] = useState(false);

  // For pausing/resuming when opening achievements
  const prevStateRef = useRef("waiting");
  const pausedRef = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const savedPlayerId = await AsyncStorage.getItem("puzzle_hub_player_id");
        setCurrentPlayerId(savedPlayerId ? parseInt(savedPlayerId, 10) : 1);
      } catch {
        setCurrentPlayerId(1);
      }
    })();
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!currentPlayerId) return;
      try {
        const id = await getGameId(GAME_TYPES.WHACK_A_TAP);
        if (!mounted || !id) return;
        setGameId(id);
        gameIdRef.current = id;

        try {
          const sessionId = await gameTracker.startGame(id, currentPlayerId);
          sessionIdRef.current = sessionId || id;
          activeRef.current = true;
          submittedRef.current = false;
        } catch {}
      } catch {}
    })();
    return () => {
      mounted = false;
      if (sessionIdRef.current && activeRef.current && !submittedRef.current) {
        try { gameTracker.endGame(sessionIdRef.current, 0, { cancelled: true, reason: "unmount" }); } catch {}
        submittedRef.current = true;
        activeRef.current = false;
      }
    };
  }, [currentPlayerId]);

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // ── GAME STATE
  const [gameState, setGameState] = useState("waiting"); // waiting | playing | gameover
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [lastScore, setLastScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [activeMole, setActiveMole] = useState(null);
  const [tappedMole, setTappedMole] = useState(null);

  // Refs for speed & reliability
  const gameStateRef = useRef(gameState);
  const runIdRef = useRef(0);
  const mountedRef = useRef(true);
  const gameTimerRef = useRef(null);
  const spawnTimerRef = useRef(null);
  const hideTimerRef = useRef(null);
  const sessionStartRef = useRef(null);

  // live “active mole” + “last mole” refs for grace window
  const activeMoleRef = useRef(null);
  const lastMoleRef = useRef({ index: null, at: 0 });

  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      clearAllTimers();
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem("whack_a_tap_scores");
        if (saved) {
          const { best = 0, last = 0 } = JSON.parse(saved);
          setBestScore(best);
          setLastScore(last);
        }
      } catch {}
    })();
  }, []);

  const saveScores = useCallback(async (best, last) => {
    try { await AsyncStorage.setItem("whack_a_tap_scores", JSON.stringify({ best, last })); } catch {}
  }, []);

  // Optional persistence (kept as-is)
  const insertGameSession = useCallback(
    async ({ startMs, endMs, finalScore, result }) => {
      if (!currentPlayerId || !gameId) return;
      const startIso = new Date(startMs || Date.now()).toISOString();
      const endIso = new Date(endMs || Date.now()).toISOString();
      const duration = Math.max(0, Math.floor(((endMs || Date.now()) - (startMs || Date.now())) / 1000));
      try {
        await supabase.from("game_sessions").insert({
          player_id: currentPlayerId,
          game_id: gameId,
          start_time: startIso,
          end_time: endIso,
          duration,
          score: Number(finalScore || 0),
          meta: { result },
        });
      } catch {}
    },
    [currentPlayerId, gameId]
  );

  const updateHighScoreIfBetter = useCallback(
    async (newScore) => {
      if (!currentPlayerId || !gameId) return;
      try {
        const { data, error } = await supabase
          .from("player_game_stats")
          .select("high_score")
          .eq("player_id", currentPlayerId)
          .eq("game_id", gameId)
          .maybeSingle();
        if (error) throw error;
        const currentHigh = data?.high_score ?? 0;
        if (Number(newScore) > Number(currentHigh)) {
          await supabase.from("player_game_stats").upsert({
            player_id: currentPlayerId,
            game_id: gameId,
            high_score: Number(newScore),
          });
        }
      } catch {}
    },
    [currentPlayerId, gameId]
  );

  // ── TIMERS
  const clearAllTimers = useCallback(() => {
    if (gameTimerRef.current) { clearInterval(gameTimerRef.current); gameTimerRef.current = null; }
    if (spawnTimerRef.current) { clearTimeout(spawnTimerRef.current); spawnTimerRef.current = null; }
    if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
  }, []);

  const randomDelay = () =>
    Math.floor(Math.random() * (MOLE_SPAWN_INTERVAL.max - MOLE_SPAWN_INTERVAL.min)) +
    MOLE_SPAWN_INTERVAL.min;

  const scheduleNextSpawn = useCallback((delayMs) => {
    if (!mountedRef.current) return;
    if (spawnTimerRef.current) { clearTimeout(spawnTimerRef.current); spawnTimerRef.current = null; }
    spawnTimerRef.current = setTimeout(() => {
      spawnMoleSafe();
    }, delayMs);
  }, []);

  const spawnMoleSafe = useCallback(() => {
    if (!mountedRef.current) return;
    if (gameStateRef.current !== "playing") return;

    const thisRun = runIdRef.current;
    const hole = Math.floor(Math.random() * 9);

    setActiveMole(hole);
    activeMoleRef.current = hole;
    setTappedMole(null);

    if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }

    hideTimerRef.current = setTimeout(() => {
      if (!mountedRef.current || runIdRef.current !== thisRun || gameStateRef.current !== "playing") return;

      // Record last mole for grace taps
      lastMoleRef.current = { index: activeMoleRef.current, at: Date.now() };
      setActiveMole(null);
      activeMoleRef.current = null;
      setTappedMole(null);

      scheduleNextSpawn(randomDelay());
    }, MOLE_SHOW_TIME);
  }, [scheduleNextSpawn]);

  // ── START
  const startNewGame = useCallback(async () => {
    if (!activeRef.current || submittedRef.current) {
      if (gameIdRef.current && currentPlayerId) {
        try {
          const newSessionId = await gameTracker.startGame(gameIdRef.current, currentPlayerId);
          sessionIdRef.current = newSessionId || gameIdRef.current;
          activeRef.current = true;
          submittedRef.current = false;
        } catch {}
      }
    }

    runIdRef.current += 1;
    clearAllTimers();

    setGameState("playing");
    setScore(0);
    setTimeLeft(GAME_DURATION);
    setActiveMole(null);
    activeMoleRef.current = null;
    setTappedMole(null);
    lastMoleRef.current = { index: null, at: 0 };

    sessionStartRef.current = Date.now();

    gameTimerRef.current = setInterval(() => {
      setTimeLeft((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);

    // small lead-in so players are ready
    scheduleNextSpawn(700);
  }, [clearAllTimers, scheduleNextSpawn, currentPlayerId]);

  // ── TAP
  const handleHoleTap = useCallback(
    (holeIndex) => {
      if (gameStateRef.current !== "playing") return;

      const now = Date.now();
      const isActive = activeMoleRef.current === holeIndex;
      const inGrace =
        lastMoleRef.current.index === holeIndex &&
        now - lastMoleRef.current.at <= TAP_GRACE_MS;

      if (!isActive && !inGrace) return;

      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}

      setScore((s) => s + 1);
      setTappedMole(holeIndex);

      if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }

      // Lock out double taps on same mole quickly
      activeMoleRef.current = null;
      setActiveMole(null);

      setTimeout(() => {
        if (!mountedRef.current || gameStateRef.current !== "playing") return;
        setTappedMole(null);
        scheduleNextSpawn(randomDelay());
      }, 220);
    },
    [scheduleNextSpawn]
  );

  // ── END WHEN TIME HITS 0
  useEffect(() => {
    if (timeLeft === 0 && gameState === "playing") {
      runIdRef.current += 1;
      clearAllTimers();
      setGameState("gameover");
      setActiveMole(null);
      activeMoleRef.current = null;
      setTappedMole(null);

      const finalScore = score;
      setLastScore(finalScore);

      if (finalScore > bestScore) {
        setBestScore(finalScore);
        saveScores(finalScore, finalScore);
      } else {
        saveScores(bestScore, finalScore);
      }

      const startMs = sessionStartRef.current || Date.now();
      const endMs = Date.now();
      insertGameSession({ startMs, endMs, finalScore, result: "play" });
      updateHighScoreIfBetter(finalScore);

      if (sessionIdRef.current && activeRef.current && !submittedRef.current) {
        try { gameTracker.endGame(sessionIdRef.current, finalScore, { result: "play" }); } catch {}
        submittedRef.current = true;
        activeRef.current = false;
      }

      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      Alert.alert(
        "Time's Up! ⏰",
        `You whacked ${finalScore} moles!${finalScore > bestScore ? " New best score!" : ""}`,
        [
          { text: "Play Again", onPress: startNewGame },
          { text: "Back to Hub", onPress: () => handleExitToHub() },
        ]
      );
    }
  }, [
    timeLeft,
    gameState,
    score,
    bestScore,
    saveScores,
    startNewGame,
    clearAllTimers,
    insertGameSession,
    updateHighScoreIfBetter,
  ]);

  const handleExitToHub = useCallback(() => {
    const isPlaying = gameStateRef.current === "playing";
    const finalScore = isPlaying ? score : 0;
    const startMs = sessionStartRef.current || Date.now();
    const endMs = Date.now();

    insertGameSession({ startMs, endMs, finalScore, result: "exit" });

    if (sessionIdRef.current && activeRef.current && !submittedRef.current) {
      try { gameTracker.endGame(sessionIdRef.current, 0, { cancelled: true, reason: "back" }); } catch {}
      submittedRef.current = true;
      activeRef.current = false;
    }

    runIdRef.current += 1;
    clearAllTimers();
    setGameState("waiting");
    setActiveMole(null);
    activeMoleRef.current = null;
    setTappedMole(null);
    setTimeLeft(GAME_DURATION);
    sessionStartRef.current = null;

    router.back();
  }, [score, insertGameSession, clearAllTimers]);

  // Pause/resume helpers when opening achievements mid-game
  const pauseIfPlaying = useCallback(() => {
    if (gameStateRef.current === "playing") {
      prevStateRef.current = "playing";
      pausedRef.current = true;
      clearAllTimers();
    } else {
      prevStateRef.current = gameStateRef.current;
    }
  }, [clearAllTimers]);

  const resumeIfPaused = useCallback(() => {
    if (pausedRef.current && prevStateRef.current === "playing" && timeLeft > 0) {
      pausedRef.current = false;
      setGameState("playing");
      // restart timers and spawn schedule quickly
      if (!gameTimerRef.current) {
        gameTimerRef.current = setInterval(() => {
          setTimeLeft((prev) => (prev <= 1 ? 0 : prev - 1));
        }, 1000);
      }
      scheduleNextSpawn(300);
    }
  }, [scheduleNextSpawn, timeLeft]);

  const onHeaderBackPress = useCallback(() => {
    handleExitToHub();
  }, [handleExitToHub]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      handleExitToHub();
      return true;
    });
    return () => sub.remove();
  }, [handleExitToHub]);

  // UI
  const formatTime = useCallback((s) => `${s}s`, []);
  const holeSize = (screenWidth - 80) / 3 - 12;

  if (!fontsLoaded) return null;

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <NightSkyBackground />

      {/* Header */}
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, marginBottom: 20 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <TouchableOpacity
            onPress={onHeaderBackPress}
            style={{ padding: 8, borderRadius: 12, backgroundColor: colors.glassSecondary }}
          >
            <ArrowLeft size={24} color={colors.text} />
          </TouchableOpacity>

          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 20, color: colors.text }}>
            Whack-A-Tap
          </Text>

          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity
              onPress={() => {
                pauseIfPlaying();
                setShowAchievements(true);
              }}
              style={{ padding: 8, borderRadius: 12, backgroundColor: colors.glassSecondary }}
            >
              <Trophy size={22} color={colors.text} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={startNewGame}
              style={{ padding: 8, borderRadius: 12, backgroundColor: colors.glassSecondary }}
            >
              <RotateCcw size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Stats */}
        <View style={{ borderRadius: 16, overflow: "hidden" }}>
          <BlurView
            intensity={isDark ? 60 : 80}
            tint={isDark ? "dark" : "light"}
            style={{
              backgroundColor: isDark ? "rgba(31, 41, 55, 0.7)" : "rgba(255,255,255,0.7)",
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 16,
              padding: 16,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-around", alignItems: "center" }}>
              <View style={{ alignItems: "center" }}>
                <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                  Score
                </Text>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.gameAccent2 }}>
                  {score}
                </Text>
              </View>

              <View style={{ alignItems: "center" }}>
                <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                  Best
                </Text>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.gameAccent2 }}>
                  {bestScore}
                </Text>
              </View>

              <View style={{ alignItems: "center" }}>
                <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                  Time
                </Text>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: timeLeft <= 10 ? "#EF4444" : colors.gameAccent2 }}>
                  {formatTime(timeLeft)}
                </Text>
              </View>
            </View>
          </BlurView>
        </View>
      </View>

      {/* Status */}
      <View style={{ paddingHorizontal: 20, marginBottom: 20 }}>
        <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 16, color: colors.text, textAlign: "center" }}>
          {gameState === "waiting" && "Tap 'Start Game' to begin!"}
          {gameState === "playing" && "Tap the moles as fast as you can!"}
          {gameState === "gameover" && "Game Over!"}
        </Text>
      </View>

      {/* Grid */}
      <View style={{ flex: 1, paddingHorizontal: 20, justifyContent: "center", alignItems: "center" }}>
        <View style={{ width: screenWidth - 40, flexDirection: "row", flexWrap: "wrap", gap: 16, justifyContent: "center" }}>
          {Array.from({ length: 9 }).map((_, index) => (
            <Pressable
              key={index}
              onPress={() => handleHoleTap(index)}
              hitSlop={HIT_SLOP}
              disabled={gameState !== "playing"}
              style={({ pressed }) => ({
                width: holeSize,
                height: holeSize,
                borderRadius: 12,
                backgroundColor: activeMole === index ? "#8B4513" : colors.glassSecondary,
                borderWidth: 2,
                borderColor: activeMole === index ? "#654321" : colors.border,
                justifyContent: "center",
                alignItems: "center",
                position: "relative",
                opacity: gameState === "playing" ? 1 : 0.5,
                transform: [{ scale: pressed ? 0.98 : 1 }],
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.2,
                shadowRadius: 4,
                elevation: 4,
              })}
            >
              {activeMole === index ? (
                <View
                  style={{
                    width: holeSize * 0.8,
                    height: holeSize * 0.8,
                    borderRadius: 8,
                    backgroundColor: tappedMole === index ? "#10B981" : "#8B4513",
                    justifyContent: "center",
                    alignItems: "center",
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.3,
                    shadowRadius: 6,
                    elevation: 8,
                    transform: [{ scale: tappedMole === index ? 0.9 : 1 }],
                    borderWidth: 2,
                    borderColor: tappedMole === index ? "#059669" : "#654321",
                  }}
                >
                  <Text style={{ fontSize: holeSize * 0.3, color: "white", textAlign: "center" }}>
                    {tappedMole === index ? "✓" : "🐹"}
                  </Text>
                </View>
              ) : (
                <View
                  style={{
                    width: holeSize * 0.42,
                    height: holeSize * 0.42,
                    borderRadius: holeSize * 0.21,
                    backgroundColor: "#1F2937",
                    borderWidth: 2,
                    borderColor: "#374151",
                  }}
                />
              )}
            </Pressable>
          ))}
        </View>

        {/* Start button */}
        {gameState === "waiting" && (
          <TouchableOpacity
            onPress={startNewGame}
            style={{
              marginTop: 40,
              paddingHorizontal: 32,
              paddingVertical: 16,
              borderRadius: 16,
              backgroundColor: colors.gameAccent2,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Play size={20} color="white" />
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: "white" }}>
              Start Game
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Achievements modal */}
      <Modal
        visible={showAchievements}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowAchievements(false);
          resumeIfPaused();
        }}
        onDismiss={resumeIfPaused}
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
                Whack-A-Tap Achievements
              </Text>
              <TouchableOpacity
                onPress={() => { setShowAchievements(false); resumeIfPaused(); }}
                hitSlop={10}
              >
                <Text style={{ fontWeight: "600", fontSize: 14, color: "rgba(255,255,255,0.75)" }}>
                  Close
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 12 }}>
              {currentPlayerId != null && (gameIdRef.current ?? gameId) != null ? (
                <AchievementsSection
                  key={`${(gameIdRef.current ?? gameId)}-${currentPlayerId}`}
                  playerId={currentPlayerId}
                  gameId={gameIdRef.current ?? gameId}
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

      <View style={{ height: insets.bottom + 20 }} />
    </View>
  );
}
