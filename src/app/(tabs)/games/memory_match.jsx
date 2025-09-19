import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  Alert,
  Dimensions,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../../../utils/theme";
import { BlurView } from "expo-blur";
import { router } from "expo-router";
import { ArrowLeft, RotateCcw, Play, Pause, Trophy } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import gameTracker from "../../../utils/gameTracking";
import { getGameId, GAME_TYPES } from "../../../utils/gameUtils";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import NightSkyBackground from "../../../components/NightSkyBackground";

const { width: screenWidth } = Dimensions.get("window");
const BEST_TIME_KEY = "memory_match_best_time";

export default function MemoryMatchGame() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  // ---- tracking ids (safe, numeric) ----
  const [currentPlayerId, setCurrentPlayerId] = useState(null);
  const [gameTypeId, setGameTypeId] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const submittedRef = useRef(false);

  // Get player id
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

  // Start a session when we have player id
  useEffect(() => {
    let mounted = true;
    let localSessionId = null;

    const start = async () => {
      if (!currentPlayerId) return;
      try {
        const id = await getGameId(GAME_TYPES.MEMORY_MATCH); // must be numeric
        if (!mounted) return;
        if (typeof id !== "number") {
          console.warn("getGameId did not return a number for MEMORY_MATCH:", id);
          return;
        }
        setGameTypeId(id);
        const started = await gameTracker.startGame(id, currentPlayerId);
        localSessionId = started ?? id; // in case your tracker returns a run id
        setSessionId(localSessionId);
        submittedRef.current = false;
      } catch (e) {
        console.warn("Memory Match: startGame failed", e);
      }
    };

    start();

    // cancel on unmount if not submitted
    return () => {
      mounted = false;
      if (localSessionId && !submittedRef.current) {
        try {
          gameTracker.endGame(localSessionId, 0, {
            cancelled: true,
            reason: "unmount",
          });
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

  // ---- game state ----
  const [cards, setCards] = useState([]);
  const [flippedCards, setFlippedCards] = useState([]);
  const [matchedCards, setMatchedCards] = useState([]);
  const [moves, setMoves] = useState(0);

  const [timer, setTimer] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameCompleted, setGameCompleted] = useState(false);
  const [bestTime, setBestTime] = useState(null);

  const gridSize = 6; // 6x6
  const totalPairs = 18;
  const cardSize = (screenWidth - 80) / gridSize - 8;

  const symbols = [
    "🌟",
    "🎯",
    "🎨",
    "🎵",
    "🚀",
    "🎪",
    "🎭",
    "🎲",
    "🎮",
    "🏆",
    "💎",
    "🔥",
    "⚡",
    "🌈",
    "🎊",
    "🎈",
    "🎁",
    "🏅",
  ];

  // load best time
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(BEST_TIME_KEY);
        if (saved) setBestTime(parseInt(saved, 10));
      } catch {}
    })();
  }, []);

  const saveBestTime = useCallback(async (timeSeconds) => {
    try {
      const prev = await AsyncStorage.getItem(BEST_TIME_KEY);
      const prevVal = prev ? parseInt(prev, 10) : null;
      if (prevVal == null || timeSeconds < prevVal) {
        await AsyncStorage.setItem(BEST_TIME_KEY, String(timeSeconds));
        setBestTime(timeSeconds);
      }
    } catch {}
  }, []);

  // init game
  const initializeGame = useCallback(() => {
    const deckSymbols = symbols.slice(0, totalPairs);
    const shuffled = [...deckSymbols, ...deckSymbols]
      .map((s, i) => ({ s, r: Math.random(), i }))
      .sort((a, b) => a.r - b.r)
      .map((x, idx) => ({
        id: idx,
        symbol: x.s,
        isFlipped: false,
        isMatched: false,
      }));

    setCards(shuffled);
    setFlippedCards([]);
    setMatchedCards([]);
    setMoves(0);
    setTimer(0);
    setIsPlaying(false);
    setGameStarted(false);
    setGameCompleted(false);
  }, []);

  useEffect(() => {
    initializeGame();
  }, [initializeGame]);

  // timer
  useEffect(() => {
    let interval;
    if (isPlaying && gameStarted && !gameCompleted) {
      interval = setInterval(() => setTimer((t) => t + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [isPlaying, gameStarted, gameCompleted]);

  // complete?
  useEffect(() => {
    if (
      cards.length > 0 &&
      matchedCards.length > 0 &&
      matchedCards.length === cards.length
    ) {
      setGameCompleted(true);
      setIsPlaying(false);

      // save best time
      saveBestTime(timer);

      // submit session ONCE with time-focused scoring
      if (sessionId && !submittedRef.current) {
        try {
          const score = Math.max(1, 100000 - timer * 100 - moves * 10); // higher is better
          gameTracker.endGame(sessionId, score, {
            time_s: timer,
            moves,
            pairs: totalPairs,
            best_time: bestTime,
            result: "win",
          });
          submittedRef.current = true;
        } catch (e) {
          console.warn("endGame failed", e);
        }
      }

      Alert.alert(
        "Game Complete! 🎉",
        `Time: ${formatTime(timer)}\nMoves: ${moves}${
          bestTime != null && timer <= bestTime ? "\nNew Best Time! 🥇" : ""
        }`,
        [
          { text: "Play Again", onPress: initializeGame },
          {
            text: "Back to Hub",
            onPress: () => {
              router.back();
            },
          },
        ]
      );
    }
  }, [matchedCards, cards, moves, timer, sessionId, bestTime, saveBestTime, initializeGame]);

  // flip logic
  const handleCardFlip = async (cardId) => {
    if (gameCompleted) return;

    if (!gameStarted) {
      setGameStarted(true);
      setIsPlaying(true);
    }

    if (
      flippedCards.length >= 2 ||
      flippedCards.includes(cardId) ||
      (gameStarted && !isPlaying)
    ) {
      return;
    }

    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}

    // flip the tapped card
    setCards((prev) =>
      prev.map((c) => (c.id === cardId ? { ...c, isFlipped: true } : c))
    );
    const newerFlipped = [...flippedCards, cardId];
    setFlippedCards(newerFlipped);

    if (newerFlipped.length === 2) {
      setMoves((m) => m + 1);
      // find symbols from current cards list (safe enough here)
      const [aId, bId] = newerFlipped;
      const a = cards.find((c) => c.id === aId);
      const b = cards.find((c) => c.id === bId);

      setTimeout(() => {
        if (a && b && a.symbol === b.symbol) {
          try {
            Haptics.notificationAsync(
              Haptics.NotificationFeedbackType.Success
            );
          } catch {}
          setMatchedCards((prev) => [...prev, aId, bId]);
          setCards((prev) =>
            prev.map((c) =>
              c.id === aId || c.id === bId ? { ...c, isMatched: true } : c
            )
          );
        } else {
          try {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          } catch {}
          setCards((prev) =>
            prev.map((c) =>
              c.id === aId || c.id === bId ? { ...c, isFlipped: false } : c
            )
          );
        }
        setFlippedCards([]);
      }, 700);
    }
  };

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const ss = (s % 60).toString().padStart(2, "0");
    return `${m}:${ss}`;
  };

  const togglePause = async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
    setIsPlaying((p) => !p);
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
            onPress={() => {
              // Back: cancel session if not submitted
              if (sessionId && !submittedRef.current) {
                try {
                  gameTracker.endGame(sessionId, 0, {
                    cancelled: true,
                    reason: "back",
                  });
                } catch {}
              }
              router.back();
            }}
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
            Memory Match
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

        {/* Stats row */}
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
                  Moves
                </Text>
                <Text
                  style={{
                    fontFamily: "Inter_700Bold",
                    fontSize: 18,
                    color: colors.text,
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
                  {bestTime != null ? formatTime(bestTime) : "—"}
                </Text>
              </View>

              {gameStarted && !gameCompleted && (
                <TouchableOpacity
                  onPress={togglePause}
                  style={{
                    padding: 8,
                    borderRadius: 12,
                    backgroundColor: colors.gameAccent1 + "20",
                  }}
                >
                  {isPlaying ? (
                    <Pause size={20} color={colors.gameAccent1} />
                  ) : (
                    <Play size={20} color={colors.gameAccent1} />
                  )}
                </TouchableOpacity>
              )}
            </View>
          </BlurView>
        </View>
      </View>

      {/* Board */}
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
            flexDirection: "row",
            flexWrap: "wrap",
            justifyContent: "center",
            alignItems: "center",
            gap: 8,
          }}
        >
          {cards.map((card) => (
            <Pressable
              key={card.id}
              onPress={() => handleCardFlip(card.id)}
              disabled={
                card.isFlipped ||
                card.isMatched ||
                flippedCards.length >= 2 ||
                (gameStarted && !isPlaying)
              }
              style={({ pressed }) => ({
                width: cardSize,
                height: cardSize,
                borderRadius: 12,
                overflow: "hidden",
                transform: [{ scale: pressed ? 0.95 : 1 }],
                opacity: gameStarted && !isPlaying ? 0.5 : 1,
              })}
            >
              <BlurView
                intensity={isDark ? 60 : 80}
                tint={isDark ? "dark" : "light"}
                style={{
                  flex: 1,
                  backgroundColor: card.isMatched
                    ? colors.gameAccent1 + "40"
                    : isDark
                    ? "rgba(31, 41, 55, 0.7)"
                    : "rgba(255, 255, 255, 0.7)",
                  borderWidth: 1,
                  borderColor: card.isMatched
                    ? colors.gameAccent1
                    : colors.border,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                {card.isFlipped || card.isMatched ? (
                  <Text style={{ fontSize: cardSize * 0.4 }}>
                    {card.symbol}
                  </Text>
                ) : (
                  <View
                    style={{
                      width: cardSize * 0.3,
                      height: cardSize * 0.3,
                      borderRadius: cardSize * 0.15,
                      backgroundColor: colors.gameAccent1 + "30",
                    }}
                  />
                )}
              </BlurView>
            </Pressable>
          ))}
        </View>

        {gameCompleted && (
          <View
            style={{
              position: "absolute",
              top: "50%",
              left: 20,
              right: 20,
              transform: [{ translateY: -100 }],
              alignItems: "center",
            }}
          >
            <View
              style={{
                borderRadius: 20,
                overflow: "hidden",
                paddingHorizontal: 32,
                paddingVertical: 24,
              }}
            >
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
                  padding: 24,
                  alignItems: "center",
                }}
              >
                <Trophy
                  size={48}
                  color={colors.gameAccent1}
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
                  Congratulations!
                </Text>
                <Text
                  style={{
                    fontFamily: "Inter_500Medium",
                    fontSize: 16,
                    color: colors.textSecondary,
                    textAlign: "center",
                  }}
                >
                  Game complete! 🎉
                </Text>
              </BlurView>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}
