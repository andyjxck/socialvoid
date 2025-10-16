// components/GameCard.jsx
import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import {
  View,
  Text,
  Pressable,
  Alert,
  Animated,
  Easing,
} from "react-native";
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

  const [totalPlays, setTotalPlays] = useState(0); // ← pull from player_game_stats
  const [gameId, setGameId] = useState(null);
  const gameName = game?.name || "";

  // ── Spooky season toggle (October) – only adds overlays, no color/text changes ──
  const isSpookySeason = useMemo(() => {
    const now = new Date();
    return now.getMonth() === 9; // October (0-indexed)
  }, []);

  // ---- Formatting ----
  const formatPlayed = (plays) => {
    const n = Math.max(0, Number(plays) || 0);
    if (n <= 0) return "Not Played Yet";
    return `Played ${n} ${n === 1 ? "time" : "times"}`;
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
      case "blockrise":
        return <Grid3X3 {...iconProps} />;
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
      case "tictactoe":
      case "fillthegrid":
        return <Grid3X3 {...iconProps} />;
      case "word_wheel":
      case "choices":
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
      console.warn(
        `[GameCard] Failed to resolve game_id for "${gameName}":`,
        error
      );
      return null;
    }
    return data?.id ?? null;
  }, [gameName]);

  // Pull total_plays from player_game_stats (same source as profile “Top Games”)
  const fetchTotalPlays = useCallback(
    async (gid) => {
      if (!playerId || !gid) {
        setTotalPlays(0);
        return;
      }
      const { data, error } = await supabase
        .from("player_game_stats")
        .select("total_plays")
        .eq("player_id", playerId)
        .eq("game_id", gid)
        .maybeSingle();

      if (error) {
        console.warn(
          `[GameCard] Failed to fetch total_plays for player_id=${playerId}, game_id=${gid}:`,
          error
        );
        setTotalPlays(0);
        return;
      }

      setTotalPlays(Number(data?.total_plays) || 0);
    },
    [playerId]
  );

  const resolveAndFetch = useCallback(async () => {
    const gid = gameId ?? (await fetchGameIdByName());
    if (gid && gid !== gameId) setGameId(gid);
    await fetchTotalPlays(gid);
  }, [gameId, fetchGameIdByName, fetchTotalPlays]);

  useEffect(() => {
    resolveAndFetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameName, playerId]);

  useFocusEffect(
    useCallback(() => {
      resolveAndFetch();
    }, [resolveAndFetch])
  );

  const handlePress = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (onPress) {
      onPress();
      return;
    }

    const gameRoutes = {
      "Memory Match": "games/memory_match",
      "Block Rise": "games/blockrise",
      2048: "games/2048-fixed",
      "Sliding Puzzle": "games/sliding_puzzle",
      Hangman: "games/hangman",
      "Word Tiles": "games/wordtiles",
      Sudoku: "games/sudoku",
      Choices: "games/choices",
      "Block Place": "games/block_blast",
      "Water Sort": "games/water_sort",
      Mancala: "games/mancala",
      "Word Search": "games/word_search",
      "Color Flow": "games/flow_connect",
      Snake: "games/snake",
      "Paddle Battle": "games/pong",
      "Smash Em": "games/smashem",
      "Stack Em": "games/stackem",
            "Void Invaders": "games/voidinvaders",

      "Hi-Lo": "games/hilo",
      "Mine Finder": "games/minesweeper",
      "Four in a Row": "games/connect_4",
      Solitaire: "games/solitaire",
      "Fill The Grid": "games/fillthegrid",
      "Pattern Match": "games/simon_says",
      "Whack-A-Tap": "games/whack_a_tap",
      "Dots & Boxes": "games/dots_and_boxes",
      "Word Wheel": "games/word_wheel",
      "Tic Tac Toe": "games/tictactoe",
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

  // ───────────────────── Spooky overlays (no color/text changes) ─────────────────────
  const CobwebCorners = () => {
    if (!isSpookySeason) return null;
    const web = (pos) => ({
      position: "absolute",
      width: 0,
      height: 0,
      borderStyle: "solid",
      borderRightWidth: 38,
      borderTopWidth: 38,
      borderRightColor: "transparent",
      borderTopColor: "rgba(255,255,255,0.06)", // subtle web
      ...pos,
    });
    return (
      <View pointerEvents="none" style={{ position: "absolute", inset: 0 }}>
        <View style={web({ top: 0, left: 0 })} />
        <View
          style={[web({ top: 0, right: 0 }), { transform: [{ scaleX: -1 }] }]}
        />
        <View
          style={[web({ bottom: 0, left: 0 }), { transform: [{ scaleY: -1 }] }]}
        />
        <View
          style={[
            web({ bottom: 0, right: 0 }),
            { transform: [{ scaleX: -1 }, { scaleY: -1 }] },
          ]}
        />
      </View>
    );
  };

  const Floater = ({ char, size, delay, duration, topPct, yJitter }) => {
    const x = useRef(new Animated.Value(-40)).current;
    const y = useRef(new Animated.Value(0)).current;
    const opacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
      if (!isSpookySeason) return;
      x.setValue(-40);
      y.setValue(0);
      opacity.setValue(0);

      const drift = Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0.9,
          duration: 800,
          delay,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(x, {
          toValue: 1,
          duration,
          delay,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(y, {
            toValue: 1,
            duration: duration / 2,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(y, {
            toValue: 0,
            duration: duration / 2,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      ]);

      const loop = Animated.loop(drift);
      loop.start();
      return () => loop.stop();
    }, [x, y, opacity, delay, duration]);

    if (!isSpookySeason) return null;

    const translateX = x.interpolate({
      inputRange: [-40, 1],
      outputRange: [-40, 360], // traverse the card width
    });
    const translateY = y.interpolate({
      inputRange: [0, 1],
      outputRange: [0, -yJitter],
    });

    return (
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: `${topPct}%`,
          transform: [{ translateX }, { translateY }],
          opacity,
        }}
      >
        <Text
          style={{
            fontSize: size,
            textShadowColor: "rgba(0,0,0,0.35)",
            textShadowOffset: { width: 0, height: 1 },
            textShadowRadius: 3,
          }}
        >
          {char}
        </Text>
      </Animated.View>
    );
  };
  // ────────────────────────────────────────────────────────────────────────────────

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
          {isSpookySeason && (
            <View pointerEvents="none" style={{ opacity: 0.25, position: "absolute", inset: 0 }}>
              <Floater char="👻" size={20} delay={1200} duration={11000} topPct={52} yJitter={200} />
              <Floater char="🎃" size={16} delay={2200} duration={10000} topPct={78} yJitter={100} />
            </View>
          )}

          {/* Original content (unchanged colors/text) */}
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
                  {formatPlayed(totalPlays)}
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
