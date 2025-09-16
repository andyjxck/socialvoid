import React, { useState, useEffect, useCallback } from "react";
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

export default function MemoryMatchGame() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const [currentPlayerId, setCurrentPlayerId] = useState(null);
  const [gameId, setGameId] = useState(null);

  // Get player ID from AsyncStorage
  useEffect(() => {
    const loadPlayerId = async () => {
      try {
        const savedPlayerId = await AsyncStorage.getItem(
          "puzzle_hub_player_id"
        );
        if (savedPlayerId) {
          setCurrentPlayerId(parseInt(savedPlayerId));
        } else {
          setCurrentPlayerId(1);
        }
      } catch (error) {
        console.error("Failed to load player ID:", error);
        setCurrentPlayerId(1);
      }
    };
    loadPlayerId();
  }, []);

  // Get the correct game ID and start tracking
  useEffect(() => {
    let mounted = true;
    let currentGameId = null;

    const setupGame = async () => {
      if (!currentPlayerId) return;

      const id = await getGameId(GAME_TYPES.MEMORY_MATCH);
      if (id && currentPlayerId && mounted) {
        currentGameId = id;
        setGameId(id);
        await gameTracker.startGame(id, currentPlayerId);
        console.log("🎮 Memory Match tracking started:", id);
      } else if (mounted) {
        console.error("❌ Could not get Memory Match game ID or player ID");
      }
    };

    setupGame();

    // Cleanup when component unmounts or effect re-runs
    return () => {
      mounted = false;
      if (currentGameId) {
        gameTracker.endGame(currentGameId, 0);
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
  const [cards, setCards] = useState([]);
  const [flippedCards, setFlippedCards] = useState([]);
  const [matchedCards, setMatchedCards] = useState([]);
  const [moves, setMoves] = useState(0);
  const [timer, setTimer] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameCompleted, setGameCompleted] = useState(false);

  // Game configuration
  const gridSize = 6; // 6x6 grid = 36 cards (18 pairs)
  const cardSize = (screenWidth - 80) / gridSize - 8;

  // Card symbols/emojis - need 18 different symbols for 18 pairs
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

  // Initialize game
  const initializeGame = useCallback(() => {
    // Create pairs of symbols for matching
    const gamePairs = symbols.slice(0, 18); // Use 18 symbols for 36 cards
    const shuffledSymbols = [...gamePairs, ...gamePairs].sort(
      () => Math.random() - 0.5
    );

    const gameCards = shuffledSymbols.map((symbol, index) => ({
      id: index,
      symbol,
      isFlipped: false,
      isMatched: false,
    }));

    setCards(gameCards);
    setFlippedCards([]);
    setMatchedCards([]);
    setMoves(0);
    setTimer(0);
    setIsPlaying(false);
    setGameStarted(false);
    setGameCompleted(false);

    console.log("Game initialized with cards:", gameCards.length); // Debug log
  }, []);

  // Timer effect
  useEffect(() => {
    let interval;
    if (isPlaying && gameStarted && !gameCompleted) {
      interval = setInterval(() => {
        setTimer((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isPlaying, gameStarted, gameCompleted]);

  // Initialize game on mount
  useEffect(() => {
    initializeGame();
  }, [initializeGame]);

  // Check for game completion
  useEffect(() => {
    if (
      matchedCards.length === cards.length &&
      cards.length > 0 &&
      matchedCards.length > 0
    ) {
      setGameCompleted(true);
      setIsPlaying(false);

      // End game tracking and submit session automatically
      if (gameId) {
        gameTracker.endGame(gameId, 100); // Fixed score of 100 for completion
      }

      // Show completion alert
      Alert.alert(
        "Game Complete! 🎉",
        `Points earned: 100\nMoves: ${moves}\nTime: ${formatTime(timer)}`,
        [
          { text: "Play Again", onPress: initializeGame },
          { text: "Back to Hub", onPress: () => router.back() },
        ]
      );
    }
  }, [matchedCards, cards, moves, timer, gameId, initializeGame]);

  // Handle card flip
  const handleCardFlip = async (cardId) => {
    if (!gameStarted) {
      setGameStarted(true);
      setIsPlaying(true);
    }

    if (flippedCards.length >= 2 || flippedCards.includes(cardId)) {
      return;
    }

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const newFlippedCards = [...flippedCards, cardId];
    setFlippedCards(newFlippedCards);

    // Update card state to show as flipped
    setCards((prev) =>
      prev.map((card) =>
        card.id === cardId ? { ...card, isFlipped: true } : card
      )
    );

    if (newFlippedCards.length === 2) {
      setMoves((prev) => prev + 1);

      const [firstCard, secondCard] = newFlippedCards.map((id) =>
        cards.find((card) => card.id === id)
      );

      setTimeout(() => {
        if (firstCard.symbol === secondCard.symbol) {
          // Match found
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setMatchedCards((prev) => [...prev, ...newFlippedCards]);
          setCards((prev) =>
            prev.map((card) =>
              newFlippedCards.includes(card.id)
                ? { ...card, isMatched: true }
                : card
            )
          );
        } else {
          // No match, flip cards back
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setCards((prev) =>
            prev.map((card) =>
              newFlippedCards.includes(card.id)
                ? { ...card, isFlipped: false }
                : card
            )
          );
        }
        setFlippedCards([]);
      }, 1000);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const togglePause = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsPlaying(!isPlaying);
  };

  if (!fontsLoaded) {
    return null;
  }

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