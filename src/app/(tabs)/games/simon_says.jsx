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

const COLORS = [
  { id: 0, name: "Green", color: "#10B981", lightColor: "#34D399" },
  { id: 1, name: "Red", color: "#EF4444", lightColor: "#F87171" },
  { id: 2, name: "Yellow", color: "#F59E0B", lightColor: "#FBBF24" },
  { id: 3, name: "Blue", color: "#3B82F6", lightColor: "#60A5FA" },
];

export default function SimonSaysGame() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const [currentPlayerId, setCurrentPlayerId] = useState(null);
  const [gameId, setGameId] = useState(null);

  // --- CANCELLATION + TIMER MANAGEMENT ---
  const timeoutsRef = useRef([]); // all pending timeouts
  const runIdRef = useRef(0); // increments to cancel any ongoing showSequence/flash
  const mountedRef = useRef(true);

  const scheduleTimeout = useCallback((fn, delay) => {
    const id = setTimeout(fn, delay);
    timeoutsRef.current.push(id);
    return id;
  }, []);

  const delay = useCallback(
    (ms) =>
      new Promise((res) => {
        scheduleTimeout(res, ms);
      }),
    [scheduleTimeout]
  );

  const clearAllTimers = useCallback(() => {
    for (const id of timeoutsRef.current) clearTimeout(id);
    timeoutsRef.current = [];
  }, []);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      clearAllTimers();
    };
  }, [clearAllTimers]);

  // Get player ID from AsyncStorage
  useEffect(() => {
    const loadPlayerId = async () => {
      try {
        const savedPlayerId = await AsyncStorage.getItem(
          "puzzle_hub_player_id"
        );
        setCurrentPlayerId(savedPlayerId ? parseInt(savedPlayerId) : 1);
      } catch (error) {
        console.error("Failed to load player ID:", error);
        setCurrentPlayerId(1);
      }
    };
    loadPlayerId();
  }, []);

  // Get the correct game ID and start tracking
  useEffect(() => {
    let active = true;
    let currentGameId = null;

    const setupGame = async () => {
      if (!currentPlayerId) return;
      const id = await getGameId(GAME_TYPES.SIMON_SAYS);
      if (id && currentPlayerId && active) {
        currentGameId = id;
        setGameId(id);
        try {
          await gameTracker.startGame(id, currentPlayerId);
        } catch (e) {
          console.warn("gameTracker.startGame failed:", e?.message || e);
        }
        console.log("🎮 Simon Says tracking started:", id);
      } else if (active) {
        console.error("❌ Could not get Simon Says game ID or player ID");
      }
    };

    setupGame();

    return () => {
      active = false;
      if (currentGameId) {
        try {
          gameTracker.endGame(currentGameId, 0);
        } catch (e) {
          console.warn(
            "gameTracker.endGame on unmount failed:",
            e?.message || e
          );
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

  // Game state
  const [sequence, setSequence] = useState([]);
  const [playerSequence, setPlayerSequence] = useState([]);
  const [currentRound, setCurrentRound] = useState(0);
  const [gameState, setGameState] = useState("waiting"); // waiting, showing, playing, gameover
  const [activeColor, setActiveColor] = useState(null);
  const [bestScore, setBestScore] = useState(0);
  const [lastScore, setLastScore] = useState(0);
  const [timer, setTimer] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);

  // Load saved scores
  useEffect(() => {
    const loadScores = async () => {
      try {
        const saved = await AsyncStorage.getItem("simon_says_scores");
        if (saved) {
          const { best, last } = JSON.parse(saved);
          setBestScore(best || 0);
          setLastScore(last || 0);
        }
      } catch (error) {
        console.error("Failed to load scores:", error);
      }
    };
    loadScores();
  }, []);

  const saveScores = useCallback(async (best, last) => {
    try {
      await AsyncStorage.setItem(
        "simon_says_scores",
        JSON.stringify({ best, last })
      );
    } catch (error) {
      console.error("Failed to save scores:", error);
    }
  }, []);

  // Timer effect
  useEffect(() => {
    let interval;
    if (gameStarted && gameState !== "gameover") {
      interval = setInterval(() => {
        setTimer((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [gameStarted, gameState]);

  // FLASH (cancellable)
  const flashColor = useCallback(
    async (colorId, duration = 500) => {
      const myRun = runIdRef.current;
      setActiveColor(colorId);
      try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } catch {}
      await delay(duration);
      // Only clear if this run is still active
      if (runIdRef.current === myRun && mountedRef.current) {
        setActiveColor(null);
      }
    },
    [delay]
  );

  // SHOW SEQUENCE (cancellable & uses explicit sequence argument)
  const showSequence = useCallback(
    async (seq, myRun) => {
      // Guard: cancel any pending timeouts for cleanliness (fresh show)
      clearAllTimers();
      setGameState("showing");
      setPlayerSequence([]);

      await delay(500);
      for (const colorId of seq) {
        if (runIdRef.current !== myRun || !mountedRef.current) return; // cancelled
        await flashColor(colorId, 500);
        if (runIdRef.current !== myRun || !mountedRef.current) return; // cancelled
        await delay(300); // spacing between flashes
      }

      if (runIdRef.current === myRun && mountedRef.current) {
        setGameState("playing");
      }
    },
    [flashColor, delay, clearAllTimers]
  );

  // Start new game (fully resets + cancels any prior timers)
  const startNewGame = useCallback(async () => {
    clearAllTimers();
    const myRun = ++runIdRef.current; // invalidate previous sequences immediately

    console.log("🎮 Starting new Simon Says game");
    const firstColor = Math.floor(Math.random() * 4);
    const initialSeq = [firstColor];

    setSequence(initialSeq);
    setPlayerSequence([]);
    setCurrentRound(1);
    setActiveColor(null);
    setTimer(0);
    setGameStarted(true);
    setGameState("waiting");

    await delay(800);
    if (runIdRef.current !== myRun || !mountedRef.current) return;

    console.log("🎵 Showing initial sequence:", initialSeq);
    await showSequence(initialSeq, myRun);
  }, [delay, showSequence, clearAllTimers]);

  // Handle color press
  const handleColorPress = useCallback(
    async (colorId) => {
      if (gameState !== "playing") return;

      const expected = sequence[playerSequence.length];

      try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {}
      // Quick tap feedback, but do not queue stray timeouts (handled via flashColor + cancellation)
      flashColor(colorId, 250);

      const newPlayerSequence = [...playerSequence, colorId];
      setPlayerSequence(newPlayerSequence);

      // Wrong pick
      const idx = newPlayerSequence.length - 1;
      if (newPlayerSequence[idx] !== expected) {
        // Cancel any in-flight animations/timeouts and mark gameover
        clearAllTimers();
        const myRun = ++runIdRef.current;

        setGameState("gameover");
        const score = currentRound;
        setLastScore(score);

        if (score > bestScore) {
          setBestScore(score);
          saveScores(score, score);
        } else {
          saveScores(bestScore, score);
        }

        if (gameId) {
          try {
            gameTracker.endGame(gameId, score * 10);
          } catch (e) {
            console.warn("gameTracker.endGame failed:", e?.message || e);
          }
        }
        try {
          await Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Error
          );
        } catch {}

        if (!mountedRef.current) return;
        Alert.alert(
          "Game Over! 🎵",
          `You made it to round ${score}!${
            score > bestScore ? " New best score!" : ""
          }`,
          [
            { text: "Play Again", onPress: () => startNewGame() },
            { text: "Back to Hub", onPress: () => router.back() },
          ]
        );
        return;
      }

      // Completed round
      if (newPlayerSequence.length === sequence.length) {
        try {
          await Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Success
          );
        } catch {}

        setGameState("waiting"); // stop input immediately
        setPlayerSequence([]);
        setCurrentRound((prev) => prev + 1);

        // Build next sequence deterministically and show it using cancellable runner
        const nextColor = Math.floor(Math.random() * 4);
        const newSeq = [...sequence, nextColor];
        setSequence(newSeq);

        // small pause before showing new round
        await delay(700);
        const myRun = runIdRef.current; // do NOT increment here; keep same run
        if (mountedRef.current) {
          console.log(
            "🎵 New sequence:",
            newSeq.map((c) => COLORS[c].name)
          );
          await showSequence(newSeq, myRun);
        }
      }
    },
    [
      gameState,
      playerSequence,
      sequence,
      currentRound,
      bestScore,
      gameId,
      saveScores,
      startNewGame,
      flashColor,
      delay,
      showSequence,
      clearAllTimers,
    ]
  );

  // Format time
  const formatTime = useCallback((seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }, []);

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
            Simon Says
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

        {/* Game stats */}
        <View
          style={{
            borderRadius: 16,
            overflow: "hidden",
          }}
        >
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
                  Round
                </Text>
                <Text
                  style={{
                    fontFamily: "Inter_700Bold",
                    fontSize: 18,
                    color: colors.gameAccent1,
                  }}
                >
                  {currentRound}
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
                    color: colors.gameAccent1,
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
                    color: colors.gameAccent1,
                  }}
                >
                  {formatTime(timer)}
                </Text>
              </View>
            </View>
          </BlurView>
        </View>
      </View>

      {/* Game status */}
      <View style={{ paddingHorizontal: 20, marginBottom: 20 }}>
        <Text
          style={{
            fontFamily: "Inter_600SemiBold",
            fontSize: 16,
            color: colors.text,
            textAlign: "center",
          }}
        >
          {gameState === "waiting" &&
            (currentRound === 0 ? "Tap 'New Game' to start!" : "Get ready...")}
          {gameState === "showing" && "Watch the pattern..."}
          {gameState === "playing" && "Your turn! Repeat the pattern"}
          {gameState === "gameover" && "Game Over!"}
        </Text>
      </View>

      {/* Color pads */}
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
            width: screenWidth - 80,
            height: screenWidth - 80,
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 16,
          }}
        >
          {COLORS.map((colorData) => (
            <TouchableOpacity
              key={colorData.id}
              onPress={() => handleColorPress(colorData.id)}
              style={{
                width: (screenWidth - 80 - 16) / 2,
                height: (screenWidth - 80 - 16) / 2,
                borderRadius: 16,
                backgroundColor:
                  activeColor === colorData.id
                    ? colorData.lightColor
                    : colorData.color,
                justifyContent: "center",
                alignItems: "center",
                opacity: gameState === "playing" ? 1 : 0.7,
                transform: [{ scale: activeColor === colorData.id ? 0.95 : 1 }],
                shadowColor: colorData.color,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: activeColor === colorData.id ? 0.5 : 0.2,
                shadowRadius: 8,
                elevation: 8,
              }}
              activeOpacity={0.8}
              disabled={gameState !== "playing"}
            >
              <Text
                style={{
                  fontFamily: "Inter_700Bold",
                  fontSize: 18,
                  color: "white",
                  textShadowColor: "rgba(0, 0, 0, 0.3)",
                  textShadowOffset: { width: 0, height: 1 },
                  textShadowRadius: 2,
                }}
              >
                {colorData.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Start button */}
        {gameState === "waiting" && currentRound === 0 && (
          <TouchableOpacity
            onPress={startNewGame}
            style={{
              marginTop: 40,
              paddingHorizontal: 32,
              paddingVertical: 16,
              borderRadius: 16,
              backgroundColor: colors.gameAccent1,
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
              New Game
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Bottom padding */}
      <View style={{ height: insets.bottom + 20 }} />
    </View>
  );
}
