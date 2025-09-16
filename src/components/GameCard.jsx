// components/GameCard.jsx
import React, { useState, useEffect, useCallback } from "react";
import { View, Text, Pressable, Alert } from "react-native";
import { router } from "expo-router";
import { useTheme } from "../utils/theme";
import { BlurView } from "expo-blur";
import {
  Brain,
  Grid3X3,
  ChevronRight,
  Zap,
  Target,
  Puzzle,
  Gamepad2,
  Dice1,
  Search,
  Trophy,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import { useFocusEffect } from "@react-navigation/native";
import { supabase } from "../utils/supabase";

export default function GameCard({ game, playerId, onPress }) {
  const { colors } = useTheme();

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  const [totalSeconds, setTotalSeconds] = useState(0);
  const [gameId, setGameId] = useState(null);
  const gameName = game?.name || "";

  // ---- Formatting ----
  const formatPlayed = (s) => {
    const seconds = Math.max(0, Math.floor(Number(s) || 0));
    if (seconds <= 0) return "Not played yet";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const sec = seconds % 60;
    if (h > 0) return `${h}h ${m}m Played`;
    if (m > 0 && sec > 0) return `${m}m ${sec}s Played`;
    if (m > 0) return `${m}m Played`;
    return `${sec}s Played`;
  };

  // ---- Accent & Icon ----
  const getAccentColor = (name) => {
    const hash = (name || "")
      .split("")
      .reduce((a, b) => ((a << 5) - a + b.charCodeAt(0)) | 0, 0);
    const idx = Math.abs(hash) % 6;
    return colors[`gameAccent${idx + 1}`];
  };
  const accentColor = getAccentColor(gameName);

  const getGameIcon = (gameType) => {
    const iconProps = { size: 20, color: accentColor };
    switch (gameType) {
      case "memory_match":
        return <Brain {...iconProps} />;
      case "tetris":
        return <Grid3X3 {...iconProps} />;
      case "chess":
        return <Target {...iconProps} />;
      case "block_blast":
        return <Zap {...iconProps} />;
      case "water_sort":
        return <Puzzle {...iconProps} />;
      case "mancala":
        return <Trophy {...iconProps} />;
      case "sudoku":
        return <Grid3X3 {...iconProps} />;
      case "sliding_puzzle":
        return <Puzzle {...iconProps} />;
      case "twenty48":
      case "2048":
        return <Dice1 {...iconProps} />;
      case "word_search":
        return <Search {...iconProps} />;
      case "connect_4":
        return <Target {...iconProps} />;
      case "solitaire":
        return <Trophy {...iconProps} />;
      case "simon_says":
        return <Brain {...iconProps} />;
      case "whack_a_tap":
        return <Zap {...iconProps} />;
      case "dots_and_boxes":
      case "kakuro":
        return <Grid3X3 {...iconProps} />;
      case "word_wheel":
        return <Brain {...iconProps} />;
      default:
        return <Gamepad2 {...iconProps} />;
    }
  };

  // ---- Supabase Fetchers ----
  const fetchGameIdByName = useCallback(async () => {
    if (!gameName) return null;
    const { data, error } = await supabase
      .from("games")
      .select("id")
      .eq("name", gameName)
      .single();

    if (error) {
      console.warn(`[GameCard] Failed to resolve game_id for "${gameName}":`, error);
      return null;
    }
    return data?.id ?? null;
  }, [gameName]);

  const fetchTotalDuration = useCallback(
    async (gid) => {
      if (!playerId || !gid) {
        setTotalSeconds(0);
        return;
      }
      const { data, error } = await supabase
        .from("game_sessions")
        .select("duration_seconds")
        .eq("player_id", playerId)
        .eq("game_id", gid);

      if (error) {
        console.warn(
          `[GameCard] Failed to fetch sessions for player_id=${playerId}, game_id=${gid}:`,
          error
        );
        setTotalSeconds(0);
        return;
      }

      const sum = (data || []).reduce((acc, row) => {
        const v = Number(row?.duration_seconds) || 0;
        return acc + (v > 0 ? v : 0);
        }, 0);
      setTotalSeconds(sum);
    },
    [playerId]
  );

  // Resolve game_id and then fetch total seconds
  const resolveAndFetch = useCallback(async () => {
    const gid = gameId ?? (await fetchGameIdByName());
    if (gid && gid !== gameId) setGameId(gid);
    await fetchTotalDuration(gid);
  }, [gameId, fetchGameIdByName, fetchTotalDuration]);

  // Initial load & when game name or playerId changes
  useEffect(() => {
    resolveAndFetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameName, playerId]);

  // Refresh on screen focus (updates after finishing a game and returning)
  useFocusEffect(
    useCallback(() => {
      resolveAndFetch();
      // no cleanup needed
    }, [resolveAndFetch])
  );

  // ---- Navigation ----
  const handlePress = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (onPress) {
      onPress();
      return;
    }

    const gameRoutes = {
      "Memory Match": "games/memory_match",
      Tetris: "games/tetris",
      2048: "games/2048-fixed",
      "Sliding Puzzle": "games/sliding_puzzle",
      Chess: "games/chess",
      Sudoku: "games/sudoku",
      "Block Blast": "games/block_blast",
      "Water Sort": "games/water_sort",
      Mancala: "games/mancala",
      "Word Search": "games/word_search",
      "Flow Connect": "games/flow_connect",
      Snake: "games/snake",
      Minesweeper: "games/minesweeper",
      "Connect Four": "games/connect_4",
      Solitaire: "games/solitaire",
      "Simon Says": "games/simon_says",
      "Whack-A-Tap": "games/whack_a_tap",
      "Dots & Boxes": "games/dots_and_boxes",
      Kakuro: "games/kakuro_fixed",
      "Word Wheel": "games/word_wheel",
    };

    const route = gameRoutes[gameName];
    if (route) {
      try {
        router.replace(route);
      } catch (error) {
        console.error("Navigation failed:", error);
        Alert.alert("Error", `Failed to open ${gameName}`);
      }
    } else {
      Alert.alert("Coming Soon! 🚧", `${gameName} is under development!`);
    }
  };

  if (!fontsLoaded) return null;

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => ({
        transform: [{ scale: pressed ? 0.98 : 1 }],
        marginBottom: 12,
      })}
    >
      <View
        style={{
          height: 120,
          borderRadius: 16,
          overflow: "hidden",
          backgroundColor: colors.glassSecondary,
          borderWidth: 0.5,
          borderColor: colors.border,
        }}
      >
        <BlurView intensity={40} tint="dark" style={{ flex: 1, borderRadius: 16 }}>
          <View style={{ flex: 1, padding: 16 }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  backgroundColor: `${accentColor}15`,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 0.5,
                  borderColor: `${accentColor}30`,
                }}
              >
                {getGameIcon(game?.game_type)}
              </View>

              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: `${accentColor}20`,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 0.5,
                  borderColor: `${accentColor}40`,
                }}
              >
                <ChevronRight size={14} color={accentColor} />
              </View>
            </View>

            <View style={{ flex: 1, justifyContent: "space-between" }}>
              <Text
                style={{
                  fontFamily: "Inter_600SemiBold",
                  fontSize: 16,
                  color: colors.text,
                  marginBottom: 4,
                }}
              >
                {gameName}
              </Text>

              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Text
                  style={{
                    fontFamily: "Inter_500Medium",
                    fontSize: 12,
                    color: colors.textSecondary,
                  }}
                >
                  {formatPlayed(totalSeconds)}
                </Text>

                <Text
                  style={{
                    fontFamily: "Inter_600SemiBold",
                    fontSize: 11,
                    color: accentColor,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  Play
                </Text>
              </View>
            </View>
          </View>
        </BlurView>
      </View>
    </Pressable>
  );
}
