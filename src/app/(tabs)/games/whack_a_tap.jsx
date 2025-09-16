import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, Text, TouchableOpacity, Dimensions, Alert } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../../../utils/theme";
import { BlurView } from "expo-blur";
import { router } from "expo-router";
import { ArrowLeft, RotateCcw, Play } from "lucide-react-native";
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

const GAME_DURATION = 60; // seconds
const MOLE_SHOW_TIME = 300; // ms visible (halved from 600)
const MOLE_SPAWN_INTERVAL = { min: 350, max: 400 }; // ms between spawns (halved from 400-500)

export default function WhackATapGame() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const [currentPlayerId, setCurrentPlayerId] = useState(null);
  const [gameId, setGameId] = useState(null);

  // ---- TRACK PLAYER + GAME ID ----
  useEffect(() => {
    (async () => {
      try {
        const savedPlayerId = await AsyncStorage.getItem(
          "puzzle_hub_player_id",
        );
        setCurrentPlayerId(savedPlayerId ? parseInt(savedPlayerId) : 1);
      } catch {
        setCurrentPlayerId(1);
      }
    })();
  }, []);

  useEffect(() => {
    let mounted = true;
    let currentGameId = null;
    (async () => {
      if (!currentPlayerId) return;
      const id = await getGameId(GAME_TYPES.WHACK_A_TAP);
      if (id && mounted) {
        currentGameId = id;
        setGameId(id);
        try {
          await gameTracker.startGame(id, currentPlayerId);
        } catch {}
      }
    })();
    return () => {
      mounted = false;
      if (currentGameId) {
        try {
          gameTracker.endGame(currentGameId, 0);
        } catch {}
      }
    };
  }, [currentPlayerId]);

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // ---- GAME STATE ----
  const [gameState, setGameState] = useState("waiting"); // waiting | playing | gameover
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [lastScore, setLastScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [activeMole, setActiveMole] = useState(null);
  const [tappedMole, setTappedMole] = useState(null);

  // ---- REFS TO AVOID STALE CLOSURES ----
  const gameStateRef = useRef(gameState);
  const runIdRef = useRef(0); // cancel token for a running game
  const mountedRef = useRef(true);
  const gameTimerRef = useRef(null);
  const spawnTimerRef = useRef(null);
  const hideTimerRef = useRef(null);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      clearAllTimers();
    };
  }, []);

  // ---- PERSIST SCORES ----
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem("whack_a_tap_scores");
        if (saved) {
          const { best, last } = JSON.parse(saved);
          setBestScore(best || 0);
          setLastScore(last || 0);
        }
      } catch {}
    })();
  }, []);

  const saveScores = useCallback(async (best, last) => {
    try {
      await AsyncStorage.setItem(
        "whack_a_tap_scores",
        JSON.stringify({ best, last }),
      );
    } catch {}
  }, []);

  // ---- TIMER HELPERS ----
  const clearAllTimers = useCallback(() => {
    if (gameTimerRef.current) {
      clearInterval(gameTimerRef.current);
      gameTimerRef.current = null;
    }
    if (spawnTimerRef.current) {
      clearTimeout(spawnTimerRef.current);
      spawnTimerRef.current = null;
    }
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const randomDelay = () =>
    Math.floor(
      Math.random() * (MOLE_SPAWN_INTERVAL.max - MOLE_SPAWN_INTERVAL.min),
    ) + MOLE_SPAWN_INTERVAL.min;

  const scheduleNextSpawn = useCallback((delayMs) => {
    if (!mountedRef.current) return;
    if (spawnTimerRef.current) {
      clearTimeout(spawnTimerRef.current);
      spawnTimerRef.current = null;
    }
    spawnTimerRef.current = setTimeout(() => {
      spawnMoleSafe();
    }, delayMs);
  }, []);

  // ---- SPAWN MOLE (STATE-SAFE) ----
  const spawnMoleSafe = useCallback(() => {
    // read the LIVE game state via refs to avoid stale closures
    if (!mountedRef.current) return;
    if (gameStateRef.current !== "playing") return;

    const thisRun = runIdRef.current; // only act if same run
    const hole = Math.floor(Math.random() * 9);
    setActiveMole(hole);
    setTappedMole(null);

    // ensure previous hide timer is cleared before scheduling a new one
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    hideTimerRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      if (runIdRef.current !== thisRun) return;
      if (gameStateRef.current !== "playing") return;

      // mole times out: hide and schedule next
      setActiveMole(null);
      setTappedMole(null);
      scheduleNextSpawn(randomDelay());
    }, MOLE_SHOW_TIME);
  }, [scheduleNextSpawn]);

  // ---- START A NEW GAME ----
  const startNewGame = useCallback(() => {
    // cancel any previous run + timers
    runIdRef.current += 1;
    clearAllTimers();

    setGameState("playing");
    setScore(0);
    setTimeLeft(GAME_DURATION);
    setActiveMole(null);
    setTappedMole(null);

    // countdown
    gameTimerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);

    // first mole after 800ms (feels snappier)
    scheduleNextSpawn(800);
  }, [clearAllTimers, scheduleNextSpawn]);

  // ---- TAP HANDLER ----
  const handleHoleTap = useCallback(
    (holeIndex) => {
      if (gameStateRef.current !== "playing") return;
      if (activeMole !== holeIndex) return;

      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {}

      setScore((s) => s + 1);
      setTappedMole(holeIndex);

      // remove current mole immediately
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }

      // brief hit feedback then spawn next
      setTimeout(() => {
        if (!mountedRef.current) return;
        setActiveMole(null);
        setTappedMole(null);
        scheduleNextSpawn(randomDelay());
      }, 250);
    },
    [activeMole, scheduleNextSpawn],
  );

  // ---- END GAME WHEN TIME HITS 0 ----
  useEffect(() => {
    if (timeLeft === 0 && gameState === "playing") {
      // lock in this run and stop timers
      runIdRef.current += 1;
      clearAllTimers();
      setGameState("gameover");
      setActiveMole(null);
      setTappedMole(null);

      const finalScore = score;
      setLastScore(finalScore);

      if (finalScore > bestScore) {
        setBestScore(finalScore);
        saveScores(finalScore, finalScore);
      } else {
        saveScores(bestScore, finalScore);
      }

      if (gameId) {
        try {
          gameTracker.endGame(gameId, finalScore * 5);
        } catch {}
      }

      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } catch {}

      Alert.alert(
        "Time's Up! ⏰",
        `You whacked ${finalScore} moles!\n${
          finalScore > bestScore ? "New best score!" : ""
        }`,
        [
          { text: "Play Again", onPress: startNewGame },
          { text: "Back to Hub", onPress: () => router.back() },
        ],
      );
    }
  }, [
    timeLeft,
    gameState,
    score,
    bestScore,
    gameId,
    saveScores,
    startNewGame,
    clearAllTimers,
  ]);

  // ---- CLEANUP ----
  useEffect(() => {
    return () => {
      runIdRef.current += 1;
      clearAllTimers();
    };
  }, [clearAllTimers]);

  // ---- UI UTILS ----
  const formatTime = useCallback((s) => `${s}s`, []);
  const holeSize = (screenWidth - 80) / 3 - 16;

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
            onPress={() => router.back()}
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
            Whack-A-Tap
          </Text>

          <TouchableOpacity
            onPress={startNewGame}
            style={{
              padding: 8,
              borderRadius: 12,
              backgroundColor: colors.glassSecondary,
            }}
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
              backgroundColor: isDark
                ? "rgba(31, 41, 55, 0.7)"
                : "rgba(255,255,255,0.7)",
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
                  Score
                </Text>
                <Text
                  style={{
                    fontFamily: "Inter_700Bold",
                    fontSize: 18,
                    color: colors.gameAccent2,
                  }}
                >
                  {score}
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
                  Best
                </Text>
                <Text
                  style={{
                    fontFamily: "Inter_700Bold",
                    fontSize: 18,
                    color: colors.gameAccent2,
                  }}
                >
                  {bestScore}
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
                    color: timeLeft <= 10 ? "#EF4444" : colors.gameAccent2,
                  }}
                >
                  {formatTime(timeLeft)}
                </Text>
              </View>
            </View>
          </BlurView>
        </View>
      </View>

      {/* Status line */}
      <View style={{ paddingHorizontal: 20, marginBottom: 20 }}>
        <Text
          style={{
            fontFamily: "Inter_600SemiBold",
            fontSize: 16,
            color: colors.text,
            textAlign: "center",
          }}
        >
          {gameState === "waiting" && "Tap 'Start Game' to begin!"}
          {gameState === "playing" && "Tap the moles as fast as you can!"}
          {gameState === "gameover" && "Game Over!"}
        </Text>
      </View>

      {/* Grid */}
      <View
        style={{
          flex: 1,
          paddingHorizontal: 20,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <View
          style={{
            width: screenWidth - 40,
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 16,
            justifyContent: "center",
          }}
        >
          {Array.from({ length: 9 }).map((_, index) => (
            <TouchableOpacity
              key={index}
              onPress={() => handleHoleTap(index)}
              activeOpacity={0.7}
              disabled={gameState !== "playing"}
              style={{
                width: holeSize,
                height: holeSize,
                borderRadius: 12,
                backgroundColor:
                  activeMole === index ? "#8B4513" : colors.glassSecondary,
                borderWidth: 2,
                borderColor: activeMole === index ? "#654321" : colors.border,
                justifyContent: "center",
                alignItems: "center",
                position: "relative",
                opacity: gameState === "playing" ? 1 : 0.5,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.2,
                shadowRadius: 4,
                elevation: 4,
              }}
            >
              {activeMole === index ? (
                <View
                  style={{
                    width: holeSize * 0.8,
                    height: holeSize * 0.8,
                    borderRadius: 8,
                    backgroundColor:
                      tappedMole === index ? "#10B981" : "#8B4513",
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
                  <Text
                    style={{
                      fontSize: holeSize * 0.3,
                      color: "white",
                      textAlign: "center",
                    }}
                  >
                    {tappedMole === index ? "✓" : "🐹"}
                  </Text>
                </View>
              ) : (
                <View
                  style={{
                    width: holeSize * 0.4,
                    height: holeSize * 0.4,
                    borderRadius: holeSize * 0.2,
                    backgroundColor: "#1F2937",
                    borderWidth: 2,
                    borderColor: "#374151",
                  }}
                />
              )}
            </TouchableOpacity>
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
            <Text
              style={{
                fontFamily: "Inter_700Bold",
                fontSize: 16,
                color: "white",
              }}
            >
              Start Game
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={{ height: insets.bottom + 20 }} />
    </View>
  );
}
