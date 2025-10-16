// mobile/src/app/games/WordWheelGame.jsx
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  Animated,
  BackHandler,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { BlurView } from "expo-blur";
import { ArrowLeft, RotateCcw, HelpCircle, Trophy, Clock } from "lucide-react-native";
import { useTheme } from "../../../utils/theme";
import NightSkyBackground from "../../../components/NightSkyBackground";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import gameTracker from "../../../utils/gameTracking";
import { getGameId, GAME_TYPES } from "../../../utils/gameUtils";
import { generateWordWheel, isValidWord } from "../../../utils/puzzle_wheel/logic";
import AchievementsSection from "../../../components/AchievementsSection";

export default function WordWheelGame() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  // ── IDs / tracking
  const [currentPlayerId, setCurrentPlayerId] = useState(null);
  const [gameId, setGameId] = useState(null);
  const gameIdRef = useRef(null);

  const focusedRef = useRef(false);
  const didStartThisFocusRef = useRef(false);
  const activeRef = useRef(false);
  const submittedRef = useRef(false);

  // timer / refs
  const timerRef = useRef(null);
  const mountedRef = useRef(true);

  // ── Game state
  const [wheel, setWheel] = useState(() => generateWordWheel());
  const [currentWord, setCurrentWord] = useState("");
  const [foundWords, setFoundWords] = useState([]);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(60);
  const [gameActive, setGameActive] = useState(true);
  const [showHelp, setShowHelp] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [bestScore, setBestScore] = useState(null);
  const [shakeAnimation] = useState(new Animated.Value(0));

  // 🏆 Achievements modal (pause timer while open)
  const [showAchievements, setShowAchievements] = useState(false);

  // ── Load ids + best score once
  useEffect(() => {
    mountedRef.current = true;
    (async () => {
      try {
        const savedPlayerId = await AsyncStorage.getItem("puzzle_hub_player_id");
        setCurrentPlayerId(savedPlayerId ? parseInt(savedPlayerId, 10) : 1);
      } catch {
        setCurrentPlayerId(1);
      }
      try {
        const id = await getGameId(GAME_TYPES.WORD_WHEEL);
        setGameId(id || null);
        gameIdRef.current = id || null;
      } catch {
        setGameId(null);
        gameIdRef.current = null;
      }
      try {
        const saved = await AsyncStorage.getItem("word_wheel_best_score");
        if (saved) setBestScore(parseInt(saved, 10));
      } catch {}
    })();

    return () => {
      mountedRef.current = false;
      clearTimer();
      if (gameIdRef.current && activeRef.current && !submittedRef.current) {
        try { gameTracker.endGame(gameIdRef.current, 0, { cancelled: true, reason: "unmount" }); } catch {}
        submittedRef.current = true;
        activeRef.current = false;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Focus lifecycle
  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      didStartThisFocusRef.current = false;
      maybeStartTrackingOnce();
      initializeGame();

      return () => {
        focusedRef.current = false;
        if (gameIdRef.current && activeRef.current && !submittedRef.current) {
          try { gameTracker.endGame(gameIdRef.current, 0, { cancelled: true, reason: "blur" }); } catch {}
          submittedRef.current = true;
          activeRef.current = false;
        }
        clearTimer();
      };
    }, [])
  );

  // Start tracker once IDs ready (and focused)
  useEffect(() => {
    if (!focusedRef.current) return;
    maybeStartTrackingOnce();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPlayerId, gameId]);

  const maybeStartTrackingOnce = useCallback(async () => {
    if (didStartThisFocusRef.current) return;
    if (!focusedRef.current) return;
    if (!currentPlayerId || !gameIdRef.current) return;
    try {
      await gameTracker.startGame(gameIdRef.current, currentPlayerId);
      activeRef.current = true;
      submittedRef.current = false;
      didStartThisFocusRef.current = true;
    } catch {}
  }, [currentPlayerId]);

  // ── Back handler: end run and navigate back
  const handleBackPress = useCallback(() => {
    if (gameIdRef.current && activeRef.current && !submittedRef.current) {
      try { gameTracker.endGame(gameIdRef.current, score || 0, { cancelled: true, reason: "back" }); } catch {}
      submittedRef.current = true;
      activeRef.current = false;
    }
    setGameActive(false);
    clearTimer();
    setCurrentWord("");
    setFoundWords([]);
    setScore(0);
    setTimeLeft(60);
    setShowResult(false);
    router.back();
    return true;
  }, [score]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      handleBackPress();
      return true;
    });
    return () => sub.remove();
  }, [handleBackPress]);

  // ── Timer helpers
  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    clearTimer();
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (!mountedRef.current) return prev;
        if (prev <= 1) {
          clearTimer();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [clearTimer]);

  // End when time hits 0
  useEffect(() => {
    if (gameActive && timeLeft === 0) endGame();
  }, [gameActive, timeLeft, endGame]);

  // ⏸️ Pause/resume timer when achievements modal toggles
  useEffect(() => {
    if (showAchievements) {
      clearTimer();
    } else if (gameActive && timeLeft > 0 && focusedRef.current) {
      startTimer();
    }
  }, [showAchievements, gameActive, timeLeft, startTimer, clearTimer]);

  // ── Game flow
  const initializeGame = useCallback(() => {
    const newWheel = generateWordWheel();
    setWheel(newWheel);
    setCurrentWord("");
    setFoundWords([]);
    setScore(0);
    setTimeLeft(60);
    setGameActive(true);
    setShowResult(false);
    startTimer();
  }, [startTimer]);

  const saveBestScore = useCallback(
    async (currentScore) => {
      try {
        if (bestScore == null || currentScore > bestScore) {
          setBestScore(currentScore);
          await AsyncStorage.setItem("word_wheel_best_score", String(currentScore));
        }
      } catch {}
    },
    [bestScore]
  );

  const endGame = useCallback(() => {
    if (!mountedRef.current) return;
    setGameActive(false);
    clearTimer();
    saveBestScore(score);
    if (gameIdRef.current && activeRef.current && !submittedRef.current) {
      try { gameTracker.endGame(gameIdRef.current, score, { result: "time_up" }); } catch {}
      submittedRef.current = true;
      activeRef.current = false;
    }
    setShowResult(true);
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
  }, [clearTimer, saveBestScore, score]);

  const addLetter = useCallback(
    (letter) => {
      if (!gameActive) return;
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
      setCurrentWord((w) => w + letter);
    },
    [gameActive]
  );

  const clearWord = useCallback(() => {
    if (!gameActive) return;
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    setCurrentWord("");
  }, [gameActive]);

  const submitWord = useCallback(() => {
    try {
      if (!gameActive || currentWord.length < 3 || !wheel) return;

      const valid = isValidWord(currentWord, wheel.allLetters, wheel.center);
      const duplicate = foundWords.some((w) => w.word === currentWord.toUpperCase());

      if (valid && !duplicate) {
        try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
        let points = 1;
        if (currentWord.length >= 7) points += 5;
        else if (currentWord.length >= 5) points += 2;

        setFoundWords((arr) => [...arr, { word: currentWord.toUpperCase(), points }]);
        setScore((s) => s + points);
        setCurrentWord("");
      } else {
        try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
        Animated.sequence([
          Animated.timing(shakeAnimation, { toValue: 10, duration: 50, useNativeDriver: true }),
          Animated.timing(shakeAnimation, { toValue: -10, duration: 50, useNativeDriver: true }),
          Animated.timing(shakeAnimation, { toValue: 10, duration: 50, useNativeDriver: true }),
          Animated.timing(shakeAnimation, { toValue: 0, duration: 50, useNativeDriver: true }),
        ]).start();
      }
    } catch {}
  }, [gameActive, currentWord, wheel, foundWords, shakeAnimation]);

  const formatTime = useCallback((seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }, []);

  // ── UI
  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <NightSkyBackground />

      {/* Header */}
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, marginBottom: 20 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <TouchableOpacity
            onPress={handleBackPress}
            style={{ padding: 8, borderRadius: 12, backgroundColor: colors.glassSecondary }}
          >
            <ArrowLeft size={24} color={colors.text} />
          </TouchableOpacity>

          <Text style={{ fontSize: 20, fontWeight: "bold", color: colors.text }}>
            Word Wheel
          </Text>

          <View style={{ flexDirection: "row", gap: 8 }}>
            {/* 🏆 Trophy: open Achievements */}
            <TouchableOpacity
              onPress={() => setShowAchievements(true)}
              style={{ padding: 8, borderRadius: 12, backgroundColor: colors.glassSecondary }}
            >
              <Trophy size={22} color={colors.text} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setShowHelp(true)}
              style={{ padding: 8, borderRadius: 12, backgroundColor: colors.glassSecondary }}
            >
              <HelpCircle size={22} color={colors.text} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={initializeGame}
              style={{ padding: 8, borderRadius: 12, backgroundColor: colors.glassSecondary }}
            >
              <RotateCcw size={22} color={colors.text} />
            </TouchableOpacity>
          </View>
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
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ alignItems: "center", flex: 1 }}>
                <Text style={{ fontSize: 12, color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                  Score
                </Text>
                <Text style={{ fontSize: 20, fontWeight: "bold", color: colors.gameAccent2 }}>
                  {score}
                </Text>
              </View>

              <View style={{ alignItems: "center", flex: 1 }}>
                <Text style={{ fontSize: 12, color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                  Best
                </Text>
                <Text style={{ fontSize: 18, fontWeight: "bold", color: colors.text }}>
                  {bestScore ?? 0}
                </Text>
              </View>

              <View style={{ alignItems: "center", flex: 1 }}>
                <Text style={{ fontSize: 12, color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                  Time
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Clock size={16} color={timeLeft <= 10 ? "#EF4444" : colors.text} />
                  <Text style={{ fontSize: 18, fontWeight: "bold", color: timeLeft <= 10 ? "#EF4444" : colors.text }}>
                    {formatTime(timeLeft)}
                  </Text>
                </View>
              </View>
            </View>
          </BlurView>
        </View>
      </View>

      {/* Body */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 20 }}>
        {/* Board with wheel */}
        <View
          style={{
            backgroundColor: isDark ? "rgba(31,41,55,0.8)" : "rgba(255,255,255,0.9)",
            borderRadius: 16,
            padding: 20,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <View style={{ width: 220, height: 220, position: "relative", alignItems: "center", justifyContent: "center" }}>
            {/* Center letter */}
            <TouchableOpacity
              onPress={() => addLetter(wheel.center)}
              activeOpacity={0.85}
              style={{
                width: 78, height: 78, borderRadius: 39,
                backgroundColor: colors.primaryButton ?? colors.gameAccent1,
                alignItems: "center", justifyContent: "center",
                position: "absolute", zIndex: 10,
                borderWidth: 2, borderColor: colors.border,
                shadowColor: colors.gameAccent1, shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.35, shadowRadius: 10, elevation: 8,
              }}
            >
              <Text style={{ fontSize: 30, fontWeight: "800", color: "white" }}>{wheel.center}</Text>
            </TouchableOpacity>

            {/* Outer letters */}
            {wheel.outer?.map((letter, index) => {
              const angle = (index * 360) / wheel.outer.length;
              const radian = (angle * Math.PI) / 180;
              const x = Math.cos(radian) * 85;
              const y = Math.sin(radian) * 85;
              return (
                <TouchableOpacity
                  key={index}
                  onPress={() => addLetter(letter)}
                  activeOpacity={0.85}
                  style={{
                    width: 58, height: 58, borderRadius: 29,
                    backgroundColor: colors.glassSecondary,
                    borderWidth: 2, borderColor: colors.border,
                    alignItems: "center", justifyContent: "center",
                    position: "absolute", left: 110 + x - 29, top: 110 + y - 29,
                    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.15, shadowRadius: 6, elevation: 4,
                  }}
                >
                  <Text style={{ fontSize: 22, fontWeight: "800", color: colors.text }}>{letter}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Current Word */}
        <Animated.View
          style={{
            backgroundColor: colors.glassSecondary,
            borderRadius: 12,
            padding: 16,
            marginBottom: 16,
            borderWidth: 1,
            borderColor: colors.border,
            transform: [{ translateX: shakeAnimation }],
          }}
        >
          <Text style={{ fontSize: 12, color: colors.textSecondary, textAlign: "center", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
            Current Word
          </Text>
          <Text style={{ fontSize: 24, fontWeight: "bold", color: colors.text, textAlign: "center", minHeight: 30 }}>
            {currentWord || "—"}
          </Text>

          <View style={{ flexDirection: "row", justifyContent: "center", gap: 12, marginTop: 14 }}>
            <TouchableOpacity
              onPress={clearWord}
              style={{ backgroundColor: colors.secondaryButton, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12 }}
            >
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.secondaryButtonText }}>Clear</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={submitWord}
              disabled={currentWord.length < 3}
              style={{
                backgroundColor: currentWord.length >= 3 ? colors.primaryButton : colors.glassSecondary,
                paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12,
                borderWidth: currentWord.length >= 3 ? 0 : 1, borderColor: colors.border,
                opacity: currentWord.length >= 3 ? 1 : 0.6,
              }}
            >
              <Text
                style={{
                  fontSize: 14, fontWeight: "700",
                  color: currentWord.length >= 3 ? colors.primaryButtonText : colors.textSecondary,
                }}
              >
                Submit
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Found Words */}
        <View style={{ backgroundColor: colors.glassSecondary, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ fontSize: 16, fontWeight: "800", color: colors.text, marginBottom: 10 }}>
            Found Words ({foundWords.length})
          </Text>

          {foundWords.length === 0 ? (
            <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: "center", fontStyle: "italic" }}>
              No words found yet
            </Text>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 220 }}>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {foundWords.map((item, index) => (
                  <View
                    key={index}
                    style={{
                      backgroundColor: colors.gameAccent1 + "20",
                      borderRadius: 8,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <Text style={{ fontSize: 14, color: colors.text, fontWeight: "700" }}>
                      {item.word}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.gameAccent1, fontWeight: "800" }}>
                      +{item.points}
                    </Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          )}

          {bestScore != null && (
            <Text style={{ marginTop: 12, fontSize: 12, color: colors.textSecondary, textAlign: "center" }}>
              Best Score: {bestScore}
            </Text>
          )}
        </View>
      </ScrollView>

      {/* Help Modal */}
      <Modal visible={showHelp} transparent animationType="fade" onRequestClose={() => setShowHelp(false)}>
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", alignItems: "center", padding: 20 }}>
          <View style={{ borderRadius: 20, overflow: "hidden", width: "100%", maxWidth: 360 }}>
            <BlurView
              intensity={isDark ? 80 : 100}
              tint={isDark ? "dark" : "light"}
              style={{
                backgroundColor: isDark ? "rgba(31,41,55,0.95)" : "rgba(255,255,255,0.95)",
                borderWidth: 1, borderColor: colors.border, borderRadius: 20, padding: 24,
              }}
            >
              <Text style={{ fontSize: 20, fontWeight: "800", color: colors.text, textAlign: "center", marginBottom: 12 }}>
                How to Play
              </Text>
              <Text style={{ fontSize: 16, color: colors.text, lineHeight: 22, textAlign: "center" }}>
                Form words using the letters in the wheel. Each word must include the center letter and be 3+ letters.
                {"\n\n"}1 point per word • +2 for 5+ letters • +5 for 7+ letters
              </Text>

              <TouchableOpacity
                onPress={() => setShowHelp(false)}
                style={{ marginTop: 18, alignSelf: "center", backgroundColor: colors.primaryButton ?? colors.gameAccent1, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 }}
              >
                <Text style={{ fontSize: 14, fontWeight: "800", color: colors.primaryButtonText ?? "white" }}>
                  Got it
                </Text>
              </TouchableOpacity>
            </BlurView>
          </View>
        </View>
      </Modal>

      {/* Result Modal */}
      {showResult && (
        <Modal visible={showResult} transparent animationType="fade" onRequestClose={() => setShowResult(false)}>
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "center", alignItems: "center", padding: 20 }}>
            <View style={{ borderRadius: 20, overflow: "hidden", width: "100%", maxWidth: 360 }}>
              <BlurView
                intensity={isDark ? 80 : 100}
                tint={isDark ? "dark" : "light"}
                style={{
                  backgroundColor: isDark ? "rgba(31,41,55,0.95)" : "rgba(255,255,255,0.95)",
                  borderWidth: 1, borderColor: colors.border, borderRadius: 20, padding: 24, alignItems: "center",
                }}
              >
                <Trophy size={48} color={colors.gameAccent1} style={{ marginBottom: 10 }} />
                <Text style={{ fontSize: 22, fontWeight: "800", color: colors.text, textAlign: "center", marginBottom: 6 }}>
                  Time’s Up!
                </Text>
                <Text style={{ fontSize: 18, color: colors.gameAccent1, fontWeight: "800", marginBottom: 10 }}>
                  Final Score: {score}
                </Text>
                <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: "center", marginBottom: 16 }}>
                  Words found: {foundWords.length}
                  {bestScore != null && score >= bestScore ? "\n🎉 New Best Score!" : ""}
                </Text>

                <View style={{ flexDirection: "row", gap: 12 }}>
                  <TouchableOpacity
                    onPress={initializeGame}
                    style={{ backgroundColor: colors.secondaryButton, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: "700", color: colors.secondaryButtonText }}>
                      Play Again
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={handleBackPress}
                    style={{ backgroundColor: colors.primaryButton, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: "700", color: colors.primaryButtonText }}>
                      Back to Hub
                    </Text>
                  </TouchableOpacity>
                </View>
              </BlurView>
            </View>
          </View>
        </Modal>
      )}

      {/* 🏆 Achievements Modal */}
      <Modal
        visible={showAchievements}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAchievements(false)}
        onShow={() => clearTimer()}                         // pause time
        onDismiss={() => { if (gameActive && timeLeft > 0) startTimer(); }}  // resume time
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
                Word Wheel Achievements
              </Text>
              <TouchableOpacity onPress={() => setShowAchievements(false)} hitSlop={10}>
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
    </View>
  );
}
