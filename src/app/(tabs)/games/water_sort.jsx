import React, { useState, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, Dimensions, Alert } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../../../utils/theme";
import { BlurView } from "expo-blur";
import { router } from "expo-router";
import { ArrowLeft, RotateCcw, Trophy } from "lucide-react-native";
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

export default function WaterSortGame() {
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

      const id = await getGameId(GAME_TYPES.WATER_SORT);
      if (id && currentPlayerId && mounted) {
        currentGameId = id;
        setGameId(id);
        await gameTracker.startGame(id, currentPlayerId);
        console.log("🎮 Water Sort tracking started:", id);
      } else if (mounted) {
        console.error("❌ Could not get Water Sort game ID or player ID");
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

  const [bottles, setBottles] = useState([]);
  const [selectedBottle, setSelectedBottle] = useState(null);
  const [moves, setMoves] = useState(0);
  const [level, setLevel] = useState(1);
  const [gameWon, setGameWon] = useState(false);
  const [timer, setTimer] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);

  // Water colors - bright and distinct
  const waterColors = [
    "#FF0000", // Red
    "#00FF00", // Green
    "#0000FF", // Blue
    "#FFFF00", // Yellow
    "#FF00FF", // Magenta
    "#00FFFF", // Cyan
    "#FFA500", // Orange
    "#800080", // Purple
    "#FFC0CB", // Pink
    "#A52A2A", // Brown
  ];

  const BOTTLE_CAPACITY = 4;

  // Timer effect
  useEffect(() => {
    let interval;
    if (gameStarted && !gameWon) {
      interval = setInterval(() => {
        setTimer((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [gameStarted, gameWon]);

  // Generate level-based puzzle
  const generatePuzzle = (levelNum) => {
    const numColors = Math.min(3 + Math.floor(levelNum / 2), 8); // 3-8 colors
    const numBottles = numColors + 2; // Always 2 extra empty bottles

    const puzzle = [];

    // Create bottles with mixed colors
    for (let i = 0; i < numBottles - 2; i++) {
      puzzle.push([]);
    }

    // Add 2 empty bottles
    puzzle.push([]);
    puzzle.push([]);

    // Fill bottles with colors (4 units of each color)
    const colorUnits = [];
    for (let colorIndex = 0; colorIndex < numColors; colorIndex++) {
      for (let unit = 0; unit < BOTTLE_CAPACITY; unit++) {
        colorUnits.push(colorIndex);
      }
    }

    // Shuffle color units
    for (let i = colorUnits.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [colorUnits[i], colorUnits[j]] = [colorUnits[j], colorUnits[i]];
    }

    // Distribute colors into bottles (except the last 2 empty ones)
    let unitIndex = 0;
    for (let bottleIndex = 0; bottleIndex < numBottles - 2; bottleIndex++) {
      for (let slot = 0; slot < BOTTLE_CAPACITY; slot++) {
        if (unitIndex < colorUnits.length) {
          puzzle[bottleIndex].push(colorUnits[unitIndex]);
          unitIndex++;
        }
      }
    }

    return puzzle;
  };

  // Check if game is won
  const checkWinCondition = (bottleState) => {
    for (const bottle of bottleState) {
      if (bottle.length === 0) continue; // Empty bottles are ok

      // Check if bottle has exactly 4 of the same color
      if (bottle.length !== BOTTLE_CAPACITY) return false;

      const firstColor = bottle[0];
      if (!bottle.every((color) => color === firstColor)) return false;
    }
    return true;
  };

  // Get the top color from a bottle (single unit)
  const getTopColor = (bottle) => {
    if (bottle.length === 0) return null;
    return bottle[bottle.length - 1]; // Just the top color, no count
  };

  // Get consecutive same-colored units from the top of a bottle - FIXED
  const getTopConsecutiveUnits = (bottle) => {
    if (bottle.length === 0) return [];

    const topColor = bottle[bottle.length - 1];
    const consecutiveUnits = [];

    // Start from the top (end of array) and work down while colors match
    for (let i = bottle.length - 1; i >= 0; i--) {
      if (bottle[i] === topColor) {
        consecutiveUnits.push(bottle[i]); // All same color units from top
      } else {
        break; // Stop when we hit a different color
      }
    }

    return consecutiveUnits;
  };

  // Check if pouring is valid according to EXACT Water Sort rules
  const canPour = (fromBottle, toBottle) => {
    if (fromBottle.length === 0) return false;

    const unitsToMove = getTopConsecutiveUnits(fromBottle);
    if (unitsToMove.length === 0) return false;

    // If target bottle is empty, pouring is always allowed (if there's space)
    if (toBottle.length === 0) {
      return toBottle.length + unitsToMove.length <= BOTTLE_CAPACITY;
    }

    const toTopColor = toBottle[toBottle.length - 1];
    const fromTopColor = unitsToMove[0]; // Color of units being moved (they're all the same)

    // Can only pour if colors match AND there's enough space
    return (
      fromTopColor === toTopColor &&
      toBottle.length + unitsToMove.length <= BOTTLE_CAPACITY
    );
  };

  // Pour water according to EXACT Water Sort rules - FIXED to pour from TOP
  const pourWater = (fromIndex, toIndex) => {
    const newBottles = [...bottles];
    const fromBottle = [...newBottles[fromIndex]];
    const toBottle = [...newBottles[toIndex]];

    if (!canPour(fromBottle, toBottle)) return false;

    // Get ALL consecutive units from the top of source bottle
    const unitsToMove = getTopConsecutiveUnits(fromBottle);

    // Calculate how many units we can actually pour based on space
    const spaceAvailable = BOTTLE_CAPACITY - toBottle.length;
    const unitsToPour = Math.min(unitsToMove.length, spaceAvailable);

    // CORRECTLY Remove units from the TOP of source bottle (from the end of array)
    for (let i = 0; i < unitsToPour; i++) {
      fromBottle.pop(); // Remove from top (end of array)
    }

    // Add units to the TOP of target bottle (to the end of array)
    for (let i = 0; i < unitsToPour; i++) {
      toBottle.push(unitsToMove[i]); // Add the units in the correct order
    }

    newBottles[fromIndex] = fromBottle;
    newBottles[toIndex] = toBottle;

    setBottles(newBottles);
    setMoves((prev) => prev + 1);

    // Check win condition
    if (checkWinCondition(newBottles)) {
      setGameWon(true);

      const score = Math.max(100, 1000 - moves * 10 + level * 100 - timer);

      // End game tracking with final score
      if (gameId) {
        gameTracker.endGame(gameId, score);
      }

      // Show win dialog with option to continue to next level
      Alert.alert(
        "Level Complete! 🎉",
        `Level ${level} solved in ${moves} moves!\nScore: ${score}`,
        [
          { text: "Next Level", onPress: nextLevel },
          { text: "Back to Hub", onPress: () => router.back() },
        ]
      );
    }

    return true;
  };

  // Initialize game
  const initializeGame = useCallback(() => {
    const newBottles = generatePuzzle(level);
    setBottles(newBottles);
    setSelectedBottle(null);
    setMoves(0);
    setGameWon(false);
    setTimer(0);
    setGameStarted(true);
  }, [level]);

  // Next level
  const nextLevel = () => {
    setLevel((prev) => prev + 1);
    setGameWon(false);
  };

  // Handle bottle press
  const handleBottlePress = (bottleIndex) => {
    if (gameWon) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (selectedBottle === null) {
      // Select bottle if it has water
      if (bottles[bottleIndex].length > 0) {
        setSelectedBottle(bottleIndex);
      }
    } else {
      if (selectedBottle === bottleIndex) {
        // Deselect if tapping same bottle
        setSelectedBottle(null);
      } else {
        // Try to pour water
        if (pourWater(selectedBottle, bottleIndex)) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
        setSelectedBottle(null);
      }
    }
  };

  // Format time
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Initialize game when level changes
  useEffect(() => {
    initializeGame();
  }, [initializeGame]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={isDark ? "light" : "dark"} />

      <LinearGradient
        colors={
          isDark
            ? ["rgba(17, 24, 39, 1)", "rgba(31, 41, 55, 0.8)"]
            : ["rgba(6, 182, 212, 0.1)", "rgba(255, 255, 255, 0.9)"]
        }
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      />

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
            Water Sort
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
                Level
              </Text>
              <Text
                style={{
                  fontFamily: "Inter_700Bold",
                  fontSize: 18,
                  color: colors.gameAccent2,
                }}
              >
                {level}
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
          </View>
        </BlurView>
      </View>

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
            flexDirection: "row",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: 12,
            maxWidth: 300,
          }}
        >
          {bottles.map((bottle, index) => (
            <TouchableOpacity
              key={index}
              onPress={() => handleBottlePress(index)}
              style={{
                width: 50,
                height: 140,
                backgroundColor:
                  selectedBottle === index
                    ? colors.gameAccent2 + "40"
                    : colors.glassSecondary,
                borderRadius: 8,
                borderWidth: 2,
                borderColor:
                  selectedBottle === index ? colors.gameAccent2 : colors.border,
                padding: 4,
                justifyContent: "flex-end",
                margin: 4,
              }}
            >
              {/* Water layers - render from bottom to top (normal array order) */}
              {Array.from({ length: BOTTLE_CAPACITY - bottle.length }).map(
                (_, emptyIndex) => (
                  <View
                    key={`empty-${emptyIndex}`}
                    style={{
                      height: 28,
                      backgroundColor: "transparent",
                      marginTop: 1,
                    }}
                  />
                )
              )}

              {/* Water units stacked from bottom up */}
              {bottle.map((colorIndex, index) => (
                <View
                  key={`water-${index}`}
                  style={{
                    height: 28,
                    backgroundColor: waterColors[colorIndex],
                    borderRadius: 3,
                    marginTop: 1,
                    borderWidth: 0.5,
                    borderColor: "rgba(0,0,0,0.1)",
                  }}
                />
              ))}
            </TouchableOpacity>
          ))}
        </View>

        <Text
          style={{
            fontFamily: "Inter_500Medium",
            fontSize: 14,
            color: colors.textSecondary,
            textAlign: "center",
            marginTop: 40,
            paddingHorizontal: 20,
          }}
        >
          Tap bottles to select and pour water. Sort all colors into separate
          bottles!
        </Text>

        <Text
          style={{
            fontFamily: "Inter_400Regular",
            fontSize: 12,
            color: colors.textSecondary,
            textAlign: "center",
            marginTop: 8,
            paddingHorizontal: 20,
          }}
        >
          All consecutive same colors pour together from the TOP!
        </Text>
      </View>
    </View>
  );
}