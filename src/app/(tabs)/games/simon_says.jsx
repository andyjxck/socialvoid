// src/app/(tabs)/games/simon_says.jsx  (REPLACE ENTIRE FILE)
import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, Text, TouchableOpacity, Dimensions, Alert, Animated, BackHandler, Modal, ScrollView } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { router } from "expo-router";
import { ArrowLeft, RotateCcw, Play, Trophy } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import gameTracker from "../../../utils/gameTracking";
import { getGameId, GAME_TYPES } from "../../../utils/gameUtils";
import NightSkyBackground from "../../../components/NightSkyBackground";
import { useTheme } from "../../../utils/theme";
import { useIsFocused } from "@react-navigation/native";
import AchievementsSection from "../../../components/AchievementsSection";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";

const { width: screenWidth } = Dimensions.get("window");

// Pads
const BASE_COLORS = [
  { id: 0, name: "Green",  color: "#10B981", lightColor: "#6EE7B7" },
  { id: 1, name: "Red",    color: "#EF4444", lightColor: "#FCA5A5" },
  { id: 2, name: "Yellow", color: "#F59E0B", lightColor: "#FDE68A" },
  { id: 3, name: "Blue",   color: "#3B82F6", lightColor: "#93C5FD" },
];
const EXTRA_COLORS = [
  { id: 4, name: "Purple", color: "#8B5CF6", lightColor: "#C4B5FD" },
  { id: 5, name: "Pink",   color: "#EC4899", lightColor: "#F9A8D4" },
];

const ON_MS = 520;
const GAP_MS = 300;

export default function SimonSaysGame() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const isFocused = useIsFocused();

  // IDs
  const [playerId, setPlayerId] = useState(null);
  const [gameId, setGameId] = useState(null);

  // Game state
  const [sequence, setSequence] = useState([]);
  const [playerSequence, setPlayerSequence] = useState([]);
  const [currentRound, setCurrentRound] = useState(0);
  const [gameState, setGameState] = useState("waiting"); // waiting | showing | playing | gameover
  const [activeColor, setActiveColor] = useState(null);
  const [bestScore, setBestScore] = useState(0);
  const [timer, setTimer] = useState(0);
  const [extraUnlocked, setExtraUnlocked] = useState(false);

  // Achievements
  const [showAchievements, setShowAchievements] = useState(false);

  // Anim/Timers
  const unlockAnim = useRef(new Animated.Value(0)).current;
  const playTimerRef = useRef(null);
  const playIndexRef = useRef(0);
  const showingRef = useRef(false);
  const tickRef = useRef(null);

  // Tracking session guard
  const sessionOpenRef = useRef(false);
  const endingRef = useRef(false); // prevent double end()

  // Fonts
  const [fontsLoaded] = useFonts({
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
  });

  /* ───────────── IDs ───────────── */
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem("puzzle_hub_player_id");
        setPlayerId(saved ? parseInt(saved, 10) : 1);
      } catch { setPlayerId(1); }
    })();
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!playerId) return;
      try {
        const id = await getGameId(GAME_TYPES.SIMON_SAYS);
        if (alive) setGameId(id || null);
      } catch { if (alive) setGameId(null); }
    })();
    return () => { alive = false; };
  }, [playerId]);

  /* ───────────── UI helpers ───────────── */
  const clearShowTimers = useCallback(() => {
    if (playTimerRef.current) { clearTimeout(playTimerRef.current); playTimerRef.current = null; }
    showingRef.current = false;
    playIndexRef.current = 0;
  }, []);

  const startUITimer = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(() => setTimer(t => t + 1), 1000);
  }, []);
  const stopUITimer = useCallback(() => {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
  }, []);

  const softResetForNewRound = useCallback(() => {
    // Reset only per-round state; keep header and overall UI intact
    clearShowTimers();
    setPlayerSequence([]);
    setActiveColor(null);
  }, [clearShowTimers]);

  const hardResetAllUI = useCallback(() => {
    clearShowTimers();
    stopUITimer();
    setGameState("waiting");
    setActiveColor(null);
    setSequence([]);
    setPlayerSequence([]);
    setCurrentRound(0);
    setTimer(0);
    setExtraUnlocked(false);
  }, [clearShowTimers, stopUITimer]);

  /* ───────────── Tracking open/close ───────────── */
  const openTrackedSession = useCallback(async () => {
    if (sessionOpenRef.current || !playerId || !gameId) return;
    try {
      await gameTracker.startGame(gameId, playerId);
      sessionOpenRef.current = true;
      endingRef.current = false;
    } catch { /* ignore */ }
  }, [playerId, gameId]);

  const closeTrackedSession = useCallback(async (score = 0, meta = {}) => {
    if (!sessionOpenRef.current || endingRef.current || !gameId) return;
    endingRef.current = true;
    try { await gameTracker.endGame(gameId, score, meta); } catch { /* ignore */ }
    sessionOpenRef.current = false;
    endingRef.current = false;
  }, [gameId]);

  /* ───────────── Focus/Blur lifecycle ─────────────
     - On focus: open (or keep) tracking session. DO NOT reset UI.
     - On blur:  end session and reset UI.
  -------------------------------------------------- */
  useEffect(() => {
    if (!gameId || !playerId) return;

    const onFocus = async () => {
      await openTrackedSession();
      // do not reset UI here — avoids the “refresh” feel on entry
    };

    const onBlur = async () => {
      await closeTrackedSession(currentRound, { result: "blur" });
      hardResetAllUI();
    };

    if (isFocused) onFocus(); else onBlur();
  }, [isFocused, gameId, playerId, openTrackedSession, closeTrackedSession, hardResetAllUI, currentRound]);

  /* ───────────── Sequence player ───────────── */
  const stepShow = useCallback((seq) => {
    if (!showingRef.current) return;

    if (playIndexRef.current >= seq.length) {
      setActiveColor(null);
      setGameState("playing");
      playTimerRef.current = null;
      showingRef.current = false;
      return;
    }

    const colorId = seq[playIndexRef.current];
    setActiveColor(colorId);
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}

    playTimerRef.current = setTimeout(() => {
      setActiveColor(null);
      playTimerRef.current = setTimeout(() => {
        playIndexRef.current += 1;
        stepShow(seq);
      }, GAP_MS);
    }, ON_MS);
  }, []);

  const beginShow = useCallback((seq) => {
    clearShowTimers();
    showingRef.current = true;
    setGameState("showing");
    setPlayerSequence([]);
    playTimerRef.current = setTimeout(() => stepShow(seq), 280);
  }, [stepShow, clearShowTimers]);

  /* ───────────── Controls ───────────── */
  const startNewGame = useCallback(async () => {
    // If a previous round ended the session (loss/back), quietly open a new one
    if (!sessionOpenRef.current) await openTrackedSession();

    softResetForNewRound();
    setTimer(0);
    startUITimer();

    const first = Math.floor(Math.random() * BASE_COLORS.length);
    const firstSeq = [first];

    setSequence(firstSeq);
    setCurrentRound(1);
    setGameState("showing");
    beginShow(firstSeq);
  }, [softResetForNewRound, startUITimer, beginShow, openTrackedSession]);

  const endRunOnLose = useCallback(async (roundReached) => {
    stopUITimer();
    setGameState("gameover");

    // End this tracked run; stay on screen (no UI reset)
    await closeTrackedSession(roundReached, { result: "lose" });

    try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
    Alert.alert(
      "Game Over",
      `You reached round ${roundReached}`,
      [
        { text: "Play Again", onPress: () => startNewGame() },
        { text: "Back", onPress: () => handleBackPress(true) },
      ],
      { cancelable: false }
    );
  }, [closeTrackedSession, startNewGame, stopUITimer]);

  const handleColorPress = useCallback(async (colorId) => {
    if (gameState !== "playing") return;

    const expected = sequence[playerSequence.length];

    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    setActiveColor(colorId);
    setTimeout(() => setActiveColor(null), 160);

    const nextPlayer = [...playerSequence, colorId];
    setPlayerSequence(nextPlayer);

    // Wrong
    if (nextPlayer[nextPlayer.length - 1] !== expected) {
      await endRunOnLose(currentRound);
      return;
    }

    // Completed round
    if (nextPlayer.length === sequence.length) {
      setGameState("waiting");
      setPlayerSequence([]);
      const nextRound = currentRound + 1;
      setCurrentRound(nextRound);

      // Unlock extra colors at 15
      if (nextRound === 15 && !extraUnlocked) {
        setExtraUnlocked(true);
        Animated.sequence([
          Animated.timing(unlockAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
          Animated.delay(1500),
          Animated.timing(unlockAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
        ]).start();
        try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      }

      const pool = nextRound >= 15 ? [...BASE_COLORS, ...EXTRA_COLORS] : BASE_COLORS;
      const nextColor = Math.floor(Math.random() * pool.length);
      const newSeq = [...sequence, nextColor];
      setSequence(newSeq);

      beginShow(newSeq);
    }
  }, [gameState, sequence, playerSequence, currentRound, extraUnlocked, unlockAnim, beginShow, endRunOnLose]);

  const handleBackPress = useCallback(async (fromAlert = false) => {
    // End session (if open) with current progress; then leave
    await closeTrackedSession(currentRound, { result: "back" });
    hardResetAllUI();
    if (!fromAlert) router.back();
  }, [closeTrackedSession, currentRound, hardResetAllUI]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      handleBackPress();
      return true;
    });
    return () => sub.remove();
  }, [handleBackPress]);

  // Track best (UI only)
  useEffect(() => {
    if (gameState === "gameover" || gameState === "waiting") {
      setBestScore(prev => Math.max(prev, currentRound));
    }
  }, [gameState, currentRound]);

  // Pause timer when achievements open
  useEffect(() => {
    if (showAchievements) stopUITimer();
    else if (gameState === "showing" || gameState === "playing") startUITimer();
  }, [showAchievements, gameState, startUITimer, stopUITimer]);

  const formatTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
  const colorPool = currentRound >= 15 ? [...BASE_COLORS, ...EXTRA_COLORS] : BASE_COLORS;
  const padSize = currentRound >= 15 ? (screenWidth - 80 - 24) / 3 : (screenWidth - 80 - 16) / 2;

  if (!fontsLoaded) return null;

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <NightSkyBackground />

      {/* Header */}
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, marginBottom: 20 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <TouchableOpacity onPress={() => handleBackPress()} style={{ padding: 8, borderRadius: 12, backgroundColor: colors.glassSecondary }}>
            <ArrowLeft size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 20, color: colors.text }}>Pattern Match</Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TouchableOpacity onPress={() => setShowAchievements(true)} style={{ padding: 8, borderRadius: 12, backgroundColor: colors.glassSecondary }}>
              <Trophy size={22} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity onPress={startNewGame} style={{ padding: 8, borderRadius: 12, backgroundColor: colors.glassSecondary }}>
              <RotateCcw size={22} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Stats */}
        <BlurView intensity={isDark ? 60 : 80} tint={isDark ? "dark" : "light"} style={{ borderRadius: 16, marginTop: 16, padding: 14, borderWidth: 1, borderColor: colors.border }}>
          <View style={{ flexDirection: "row", justifyContent: "space-around", alignItems: "center" }}>
            <View style={{ alignItems: "center" }}>
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>Round</Text>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.gameAccent1 }}>{currentRound}</Text>
            </View>
            <View style={{ alignItems: "center" }}>
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>Best</Text>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.gameAccent1 }}>{bestScore}</Text>
            </View>
            <View style={{ alignItems: "center" }}>
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>Time</Text>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.gameAccent1 }}>{formatTime(timer)}</Text>
            </View>
          </View>
        </BlurView>
      </View>

      {/* Status */}
      <Text style={{ textAlign: "center", color: colors.text, fontFamily: "Inter_600SemiBold", fontSize: 16, marginBottom: 8 }}>
        {gameState === "waiting" && (currentRound === 0 ? "Tap 'New Game' to start!" : "Get ready…")}
        {gameState === "showing" && "Watch the pattern…"}
        {gameState === "playing" && "Your turn! Repeat the pattern"}
        {gameState === "gameover" && "Game Over"}
      </Text>

      {/* Pads */}
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <View style={{ width: screenWidth - 80, flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 12 }}>
          {colorPool.map((c) => (
            <TouchableOpacity
              key={c.id}
              onPress={() => handleColorPress(c.id)}
              disabled={gameState !== "playing"}
              activeOpacity={0.85}
              style={{
                width: padSize,
                height: padSize,
                borderRadius: 16,
                backgroundColor: activeColor === c.id ? c.lightColor : c.color,
                justifyContent: "center",
                alignItems: "center",
                opacity: gameState === "playing" ? 1 : 0.88,
                transform: [{ scale: activeColor === c.id ? 0.96 : 1 }],
                borderWidth: activeColor === c.id ? 3 : 0,
                borderColor: activeColor === c.id ? "#FFFFFF" : "transparent",
                shadowColor: c.color,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: activeColor === c.id ? 0.6 : 0.25,
                shadowRadius: 8,
                elevation: 10,
              }}
            >
              <Text style={{ color: "white", fontFamily: "Inter_700Bold", fontSize: 16 }}>
                {c.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Unlock toast */}
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            bottom: "20%",
            opacity: unlockAnim,
            transform: [{ scale: unlockAnim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }],
          }}
        >
          <BlurView intensity={80} tint="dark" style={{ borderRadius: 20, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: "rgba(139,92,246,0.2)", borderWidth: 1, borderColor: "rgba(255,255,255,0.25)" }}>
            <Text style={{ fontSize: 18, fontWeight: "bold", color: "#A78BFA", textAlign: "center" }}>✨ New Colors Unlocked! ✨</Text>
            <Text style={{ color: "#F9A8D4", textAlign: "center", marginTop: 2, fontSize: 14 }}>Purple and Pink added!</Text>
          </BlurView>
        </Animated.View>
      </View>

      {/* Start button */}
      {gameState === "waiting" && currentRound === 0 && (
        <TouchableOpacity
          onPress={startNewGame}
          style={{
            alignSelf: "center",
            marginBottom: insets.bottom + 28,
            paddingHorizontal: 32,
            paddingVertical: 14,
            borderRadius: 16,
            backgroundColor: colors.gameAccent1,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Play size={20} color="white" />
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: "white" }}>New Game</Text>
        </TouchableOpacity>
      )}

      {/* Achievements Modal */}
      <Modal
        visible={showAchievements}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAchievements(false)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", paddingHorizontal: 16 }}>
          <View
            style={{
              borderRadius: 16,
              overflow: "hidden",
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: isDark ? "rgba(0,0,0,0.9)" : colors.background,
              maxHeight: "80%",
            }}
          >
            <View
              style={{
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Text style={{ fontWeight: "700", fontSize: 16, color: colors.text }}>
                Simon Says Achievements
              </Text>
              <TouchableOpacity onPress={() => setShowAchievements(false)} hitSlop={10}>
                <Text style={{ fontWeight: "600", fontSize: 14, color: colors.textSecondary }}>
                  Close
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 12 }}>
              {playerId && gameId ? (
                <AchievementsSection
                  playerId={playerId}
                  gameId={gameId}
                  autoRefreshMs={15000}
                  showSearchBar
                  showFilters
                />
              ) : (
                <View style={{ padding: 16 }}>
                  <Text style={{ color: colors.textSecondary, textAlign: "center", fontWeight: "500" }}>
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
