import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Animated,
  Easing,
  Modal,
} from "react-native";
import AdBanner from "../../components/AdBanner";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../../utils/theme";
import { BlurView } from "expo-blur";
import { router } from "expo-router";
import {
  ArrowLeft,
  Edit3,
  LogOut,
  Trophy,
  Clock,
  Target,
  Crown,
  Award,
  Star,
  Hash,
  Shield,
  Users,
  X,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import playtimeTracker from "../../utils/playtimeTracker";
import EmojiPicker from "../../components/EmojiPicker";
import NightSkyBackground from "../../components/NightSkyBackground";
import GameInvitationCard from "../../components/friends/GameInvitationCard";
import FriendsSection from "../../components/FriendsSection";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import { supabase } from "../../utils/supabase";

/** ────────────────────────────────────────────────────────────────
 *  Spooky overlays (unchanged)
 *  ─────────────────────────────────────────────────────────────── */
function SpookyFloaters({ enabled }) {
  const items = useMemo(
    () =>
      [
        { char: "🦇", size: 22, speed: 12000, yJitter: 12, opacity: 0.9 },
        { char: "👻", size: 26, speed: 14000, yJitter: 18, opacity: 0.85 },
        { char: "🎃", size: 24, speed: 16000, yJitter: 10, opacity: 0.9 },
        { char: "🦇", size: 18, speed: 11000, yJitter: 14, opacity: 0.8 },
        { char: "🕸️", size: 20, speed: 15000, yJitter: 8, opacity: 0.7 },
      ].map((it, idx) => ({
        ...it,
        delay: idx * 1200,
        topPct: 10 + (idx * 16) % 70,
      })),
    []
  );

  if (!enabled) return null;

  return (
    <View pointerEvents="none" style={{ position: "absolute", inset: 0 }}>
      {items.map((it, idx) => (
        <Floater key={idx} config={it} />
      ))}
    </View>
  );
}

function Floater({ config }) {
  const x = useRef(new Animated.Value(-60)).current;
  const y = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const loopAnim = useCallback(() => {
    x.setValue(-60);
    y.setValue(0);
    opacity.setValue(0);

    const drift = Animated.parallel([
      Animated.timing(opacity, {
        toValue: config.opacity,
        duration: 1200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(x, {
        toValue: 1,
        duration: config.speed,
        delay: config.delay,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(y, {
          toValue: 1,
          duration: config.speed / 2,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(y, {
          toValue: 0,
          duration: config.speed / 2,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    ]);

    Animated.loop(drift).start();
  }, [x, y, opacity, config]);

  useEffect(() => {
    loopAnim();
  }, [loopAnim]);

  const translateX = x.interpolate({
    inputRange: [-60, 1],
    outputRange: [-60, 1200],
  });

  const translateY = y.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -config.yJitter],
  });

  return (
    <Animated.View
      style={{
        position: "absolute",
        top: `${config.topPct}%`,
        transform: [{ translateX }, { translateY }],
        opacity,
      }}
    >
      <Text
        style={{
          fontSize: config.size,
          textShadowColor: "rgba(0,0,0,0.4)",
          textShadowOffset: { width: 0, height: 2 },
          textShadowRadius: 6,
        }}
      >
        {config.char}
      </Text>
    </Animated.View>
  );
}

function CobwebCorners({ enabled }) {
  if (!enabled) return null;
  const web = (pos) => ({
    position: "absolute",
    width: 0,
    height: 0,
    borderStyle: "solid",
    borderRightWidth: 90,
    borderTopWidth: 90,
    borderRightColor: "transparent",
    borderTopColor: "rgba(255,255,255,0.06)",
    ...pos,
  });
  return (
    <View pointerEvents="none" style={{ position: "absolute", inset: 0 }}>
      <View style={web({ top: 0, left: 0 })} />
      <View style={[web({ top: 0, right: 0 }), { transform: [{ scaleX: -1 }] }]} />
      <View style={[web({ bottom: 0, left: 0 }), { transform: [{ scaleY: -1 }] }]} />
      <View
        style={[
          web({ bottom: 0, right: 0 }),
          { transform: [{ scaleX: -1 }, { scaleY: -1 }] },
        ]}
      />
    </View>
  );
}

function SpookyRibbon({ enabled, onPress }) {
  if (!enabled) return null;
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        top: 10,
        left: 0,
        right: 0,
        alignItems: "center",
        zIndex: 20,
      }}
    >
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onPress}
        style={{
          paddingVertical: 8,
          paddingHorizontal: 14,
          borderRadius: 999,
          backgroundColor: "rgba(255,140,0,0.15)",
          borderWidth: 1,
          borderColor: "rgba(255,140,0,0.35)",
          shadowColor: "#000",
          shadowOpacity: 0.25,
          shadowOffset: { width: 0, height: 4 },
          shadowRadius: 8,
        }}
      />
    </View>
  );
}
/** ─────────────────────────────────────────────────────────────── */

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const queryClient = useQueryClient();
  const [currentPlayerId, setCurrentPlayerId] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showFriends, setShowFriends] = useState(false);

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // Auto-enable in October
  const isSpookySeason = useMemo(() => {
    const now = new Date();
    return now.getMonth() === 9; // October
  }, []);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      await AsyncStorage.removeItem("puzzle_hub_player_id");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/");
    } catch (e) {
      Alert.alert("Logout failed", e?.message || "Please try again.");
    }
  };

  useEffect(() => {
    const loadPlayerId = async () => {
      try {
        const savedPlayerId = await AsyncStorage.getItem("puzzle_hub_player_id");
        if (savedPlayerId) setCurrentPlayerId(parseInt(savedPlayerId));
        else setCurrentPlayerId(1);
      } catch (error) {
        console.error("Failed to load player ID:", error);
        setCurrentPlayerId(1);
      }
    };
    loadPlayerId();
  }, []);

  // Player
  const { data: player } = useQuery({
    queryKey: ["player", currentPlayerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("players")
        .select("*")
        .eq("id", currentPlayerId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!currentPlayerId,
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
  });

  // Unread DM count (any sender -> me)
  const { data: unreadCount = 0 } = useQuery({
    queryKey: ["chat_messages:unread-total", currentPlayerId],
    enabled: !!currentPlayerId,
    refetchInterval: 10000,
    staleTime: 5000,
    queryFn: async () => {
      const pid = Number(currentPlayerId);
      if (!pid) return 0;
      const { count, error } = await supabase
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .eq("receiver_id", pid)
        .eq("is_read", false);
      if (error) return 0;
      return count ?? 0;
    },
  });

  // Invitations (kept, even if not displayed)
  const { data: gameInvitations = [] } = useQuery({
    queryKey: ["game-invitations", currentPlayerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("game_invitations")
        .select("*")
        .eq("recipient_id", currentPlayerId);
      if (error) return [];
      return data || [];
    },
    enabled: !!currentPlayerId,
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });

  // Achievements
  const { data: achievementsResponse = [] } = useQuery({
    queryKey: ["player-achievements", currentPlayerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("player_achievements")
        .select("*, achievements(*)")
        .eq("player_id", currentPlayerId);
      if (error) throw error;
      return data;
    },
    enabled: !!currentPlayerId,
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
  });
  const achievements = Array.isArray(achievementsResponse)
    ? achievementsResponse.map((a) => ({ ...a.achievements, ...a }))
    : [];

  // Sessions
  const { data: gameSessions = [] } = useQuery({
    queryKey: ["player-sessions", currentPlayerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("game_sessions")
        .select("*")
        .eq("player_id", currentPlayerId);
      if (error) throw error;
      return data;
    },
    enabled: !!currentPlayerId,
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
  });

  // Stats (joined to names)
  const { data: stats = [] } = useQuery({
    queryKey: ["player-stats-with-names", currentPlayerId],
    enabled: !!currentPlayerId,
    queryFn: async () => {
      const { data: rawStats, error: sErr } = await supabase
        .from("player_game_stats")
        .select("game_id, total_plays, total_playtime_seconds")
        .eq("player_id", currentPlayerId);
      if (sErr) throw sErr;

      const rows = rawStats ?? [];
      if (rows.length === 0) return [];

      const gameIds = Array.from(new Set(rows.map((r) => r.game_id).filter(Boolean)));
      const { data: gameRows, error: gErr } = await supabase
        .from("games")
        .select("id, name")
        .in("id", gameIds);
      if (gErr) throw gErr;

      const nameById = new Map((gameRows ?? []).map((g) => [g.id, g.name]));
      return rows.map((r) => ({
        ...r,
        game_name: nameById.get(r.game_id) ?? "Unknown",
      }));
    },
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
  });

  // Mutations
  const updatePlayerMutation = useMutation({
    mutationFn: async (newName) => {
      const { data, error } = await supabase
        .from("players")
        .update({ username: newName })
        .eq("id", currentPlayerId)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["player", currentPlayerId]);
      setIsEditing(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const updateEmojiMutation = useMutation({
    mutationFn: async (newEmoji) => {
      const { data, error } = await supabase
        .from("players")
        .update({ profile_emoji: newEmoji })
        .eq("id", currentPlayerId)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["player", currentPlayerId]);
      setShowEmojiPicker(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  // Helpers (unchanged)
  const formatPlaytime = (totalSeconds) => {
    if (!totalSeconds) return { hours: 0, minutes: 0, totalSeconds: 0 };
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return { hours, minutes, totalSeconds };
  };

  const calculateLevel = () => {
    const totalPlaytimeMinutes = Math.floor(
      (player?.total_playtime_seconds || 0) / 60
    );
    return Math.floor(totalPlaytimeMinutes / 5) + 1;
  };

  const getPlayerTitle = (level) => playtimeTracker.getPlayerTitle(level);

  const getTimeToNextLevel = () => {
    const totalPlaytimeSeconds = player?.total_playtime_seconds || 0;
    return playtimeTracker.getTimeToNextLevel(totalPlaytimeSeconds);
  };

  // Top games by plays
  const getTopGames = () => {
    const played = (stats ?? []).filter((s) => (s.total_plays ?? 0) > 0);

    return played
      .sort((a, b) => (b.total_plays ?? 0) - (a.total_plays ?? 0))
      .slice(0, 3)
      .map((row, idx) => ({
        gameId: row.game_id,
        gameName: row.game_name,
        totalPlays: row.total_plays ?? 0,
        rank: idx + 1,
      }));
  };

  const groupAchievements = () => {
    const completed = achievements.filter((a) => a.is_completed);
    const inProgress = achievements.filter(
      (a) => !a.is_completed && a.progress > 0
    );
    const locked = achievements.filter(
      (a) => !a.is_completed && a.progress === 0
    );
    return { completed, inProgress, locked };
  };

  const getRecentAchievements = () => {
    const completed = achievements.filter((a) => a.is_completed);
    return completed
      .sort((a, b) => {
        if (a.completed_at && b.completed_at) {
          return new Date(b.completed_at) - new Date(a.completed_at);
        }
        return (b.achievement_id || b.id || 0) - (a.achievement_id || a.id || 0);
      })
      .slice(0, 3);
  };

  const getAchievementIcon = (iconName) => {
    const iconMap = {
      trophy: Trophy,
      award: Award,
      star: Star,
      crown: Crown,
      target: Target,
      clock: Clock,
      shield: Shield,
    };
    return iconMap[iconName] || Award;
  };

  const handleEditName = () => {
    if (isEditing) {
      if (editName.trim()) {
        updatePlayerMutation.mutate(editName.trim());
      } else {
        setIsEditing(false);
      }
    } else {
      setEditName(player?.username || "");
      setIsEditing(true);
    }
  };

  const handleEmojiSelect = (emoji) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateEmojiMutation.mutate(emoji);
  };

  if (!fontsLoaded) return null;

  const { hours, minutes } = formatPlaytime(player?.total_playtime_seconds);
  const level = calculateLevel();
  const title = getPlayerTitle(level);
  const topGames = getTopGames();
  const timeToNext = getTimeToNextLevel();
  const totalGamesPlayed = (stats ?? []).reduce(
    (sum, s) => sum + (s.total_plays ?? 0),
    0
  );
  const totalScore = gameSessions.reduce(
    (total, session) => total + session.score,
    0
  );
  const { completed } = groupAchievements();

  // Halloween vs normal gradient
  const bgGradient = isSpookySeason
    ? [
        "rgba(15,10,28,1)",
        "rgba(67,24,94,0.95)",
        "rgba(255,120,0,0.08)",
      ]
    : isDark
    ? ["rgba(17, 24, 39, 1)", "rgba(31, 41, 55, 0.8)"]
    : ["rgba(79, 70, 229, 0.1)", "rgba(255, 255, 255, 0.9)"];

  return (
    <View style={{ flex: 1, backgroundColor: isSpookySeason ? "#0f0a1c" : undefined }}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <NightSkyBackground />

      <LinearGradient
        colors={bgGradient}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      />

      {/* Halloween overlays */}
      <CobwebCorners enabled={isSpookySeason} />
      <SpookyFloaters enabled={isSpookySeason} />
      <SpookyRibbon
        enabled={isSpookySeason}
        onPress={() =>
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        }
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 20,
          paddingHorizontal: 20,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 32,
          }}
        >
          <TouchableOpacity
            onPress={() => router.back()}
            style={{
              padding: 8,
              borderRadius: 12,
              backgroundColor: isSpookySeason
                ? "rgba(255,140,0,0.12)"
                : colors.glassSecondary,
              borderWidth: isSpookySeason ? 1 : 0,
              borderColor: "rgba(255,140,0,0.25)",
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
            {isSpookySeason ? "Haunted Profile" : "Player Profile"}
          </Text>

          <View style={{ flexDirection: "row", gap: 12 }}>
            {/* FRIENDS BUTTON (opens separate view) + unread badge */}
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowFriends(true);
              }}
              style={{
                padding: 8,
                borderRadius: 12,
                backgroundColor: isSpookySeason
                  ? "rgba(255,140,0,0.12)"
                  : colors.glassSecondary,
                borderWidth: isSpookySeason ? 1 : 0,
                borderColor: "rgba(255,140,0,0.25)",
              }}
            >
              <View style={{ position: "relative" }}>
                <Users size={20} color={colors.text} />
                {unreadCount > 0 && (
                  <View
                    style={{
                      position: "absolute",
                      top: -3,
                      right: -3,
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: "#EF4444",
                      borderWidth: 1,
                      borderColor: isDark ? "#111827" : "#ffffff",
                    }}
                  />
                )}
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleLogout}
              style={{
                padding: 8,
                borderRadius: 12,
                backgroundColor: isSpookySeason
                  ? "rgba(255,140,0,0.12)"
                  : colors.glassSecondary,
                borderWidth: isSpookySeason ? 1 : 0,
                borderColor: "rgba(255,140,0,0.25)",
              }}
            >
              <LogOut size={20} color={colors.text} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleEditName}
              style={{
                padding: 8,
                borderRadius: 12,
                backgroundColor: isSpookySeason
                  ? "rgba(255,140,0,0.12)"
                  : colors.glassSecondary,
                borderWidth: isSpookySeason ? 1 : 0,
                borderColor: "rgba(255,140,0,0.25)",
              }}
            >
              <Edit3 size={20} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        <AdBanner />

        {/* Player Info Card */}
        <View style={{ borderRadius: 20, overflow: "hidden", marginBottom: 24 }}>
          <BlurView
            intensity={isDark ? 60 : 80}
            tint={isDark ? "dark" : "light"}
            style={{
              backgroundColor: isDark
                ? "rgba(31,41,55,0.7)"
                : "rgba(255,255,255,0.7)",
              borderWidth: 1,
              borderColor: isSpookySeason ? "rgba(255,140,0,0.25)" : colors.border,
              borderRadius: 20,
              padding: 24,
              alignItems: "center",
            }}
          >
            {/* Avatar */}
            <TouchableOpacity
              onPress={() => setShowEmojiPicker(true)}
              style={{
                width: 84,
                height: 84,
                borderRadius: 42,
                backgroundColor: isSpookySeason
                  ? "rgba(255,140,0,0.10)"
                  : colors.gameAccent1 + "20",
                justifyContent: "center",
                alignItems: "center",
                marginBottom: 16,
                borderWidth: 2,
                borderColor: isSpookySeason
                  ? "rgba(255,140,0,0.35)"
                  : colors.gameAccent1 + "40",
                shadowColor: "#000",
                shadowOpacity: 0.25,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 6 },
              }}
            >
              <Text style={{ fontSize: 34 }}>
                {player?.profile_emoji || (isSpookySeason ? "🎃" : "🧩")}
              </Text>
            </TouchableOpacity>

            {/* Name */}
            {isEditing ? (
              <TextInput
                value={editName}
                onChangeText={setEditName}
                onSubmitEditing={handleEditName}
                style={{
                  fontFamily: "Inter_700Bold",
                  fontSize: 24,
                  color: colors.text,
                  backgroundColor: colors.background,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  marginBottom: 8,
                  minWidth: 200,
                  textAlign: "center",
                  borderWidth: isSpookySeason ? 1 : 0,
                  borderColor: "rgba(255,140,0,0.25)",
                }}
                autoFocus
              />
            ) : (
              <Text
                style={{
                  fontFamily: "Inter_700Bold",
                  fontSize: 24,
                  color: colors.text,
                  marginBottom: 8,
                }}
              >
                {player?.username || (isSpookySeason ? "Mysterious Soul" : "Player")}
              </Text>
            )}

            {/* User ID */}
            {player?.user_id && (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <Hash size={14} color={colors.textSecondary} />
                <Text
                  style={{
                    fontFamily: "Inter_500Medium",
                    fontSize: 14,
                    color: colors.textSecondary,
                    marginLeft: 4,
                  }}
                >
                  ID: {player.user_id}
                </Text>
              </View>
            )}

            {/* Title */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: isSpookySeason
                  ? "rgba(255,140,0,0.15)"
                  : colors.gameAccent1 + "20",
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 12,
                marginBottom: 16,
                borderWidth: isSpookySeason ? 1 : 0,
                borderColor: "rgba(255,140,0,0.25)",
              }}
            >
              <Crown
                size={16}
                color={isSpookySeason ? "#FF8C00" : colors.gameAccent1}
              />
              <Text
                style={{
                  fontFamily: "Inter_600SemiBold",
                  fontSize: 14,
                  color: isSpookySeason ? "#FF8C00" : colors.gameAccent1,
                  marginLeft: 6,
                }}
              >
                {title}
              </Text>
            </View>

            {/* Level & Timer */}
            <Text
              style={{
                fontFamily: "Inter_600SemiBold",
                fontSize: 18,
                color: colors.text,
                marginBottom: 4,
              }}
            >
              {isSpookySeason ? "Spirit Level" : "Level"} {level}
            </Text>
            <Text
              style={{
                fontFamily: "Inter_500Medium",
                fontSize: 14,
                color: colors.textSecondary,
                marginBottom: 8,
            }}
            >
              {playtimeTracker.formatPlaytime(
                player?.total_playtime_seconds || 0
              )}{" "}
              played
            </Text>
            <Text
              style={{
                fontFamily: "Inter_500Medium",
                fontSize: 12,
                color: isSpookySeason ? "#FF8C00" : colors.gameAccent2,
              }}
            >
              Next level in {timeToNext.minutes}m {timeToNext.seconds}s
            </Text>
            <Text
              style={{
                fontFamily: "Inter_500Medium",
                fontSize: 14,
                color: isSpookySeason ? "#FF8C00" : colors.gameAccent1,
                marginTop: 4,
              }}
            >
              {(player?.total_points || 0).toLocaleString()} total points
            </Text>
          </BlurView>
        </View>

        {/* Stats Cards */}
        <View style={{ flexDirection: "row", gap: 12, marginBottom: 24 }}>
          <View style={{ flex: 1, borderRadius: 16, overflow: "hidden" }}>
            <BlurView
              intensity={isDark ? 60 : 80}
              tint={isDark ? "dark" : "light"}
              style={{
                backgroundColor: isDark
                  ? "rgba(31,41,55,0.7)"
                  : "rgba(255,255,255,0.7)",
                borderWidth: 1,
                borderColor: isSpookySeason ? "rgba(255,140,0,0.25)" : colors.border,
                borderRadius: 16,
                padding: 16,
                alignItems: "center",
              }}
            >
              <Target size={24} color={isSpookySeason ? "#FF8C00" : colors.gameAccent2} />
              <Text
                style={{
                  fontFamily: "Inter_700Bold",
                  fontSize: 20,
                  color: colors.text,
                  marginTop: 8,
                }}
              >
                {totalGamesPlayed}
              </Text>
              <Text
                style={{
                  fontFamily: "Inter_500Medium",
                  fontSize: 12,
                  color: colors.textSecondary,
                  textAlign: "center",
                }}
              >
                Games Played
              </Text>
            </BlurView>
          </View>

          <View style={{ flex: 1, borderRadius: 16, overflow: "hidden" }}>
            <BlurView
              intensity={isDark ? 60 : 80}
              tint={isDark ? "dark" : "light"}
              style={{
                backgroundColor: isDark
                  ? "rgba(31,41,55,0.7)"
                  : "rgba(255,255,255,0.7)",
                borderWidth: 1,
                borderColor: isSpookySeason ? "rgba(255,140,0,0.25)" : colors.border,
                borderRadius: 16,
                padding: 16,
                alignItems: "center",
              }}
            >
              <Award size={24} color={isSpookySeason ? "#FF8C00" : colors.gameAccent3} />
              <Text
                style={{
                  fontFamily: "Inter_700Bold",
                  fontSize: 20,
                  color: colors.text,
                  marginTop: 8,
                }}
              >
                {completed.length}
              </Text>
              <Text
                style={{
                  fontFamily: "Inter_500Medium",
                  fontSize: 12,
                  color: colors.textSecondary,
                  textAlign: "center",
                }}
              >
                Achievements
              </Text>
            </BlurView>
          </View>
        </View>

        {/* Recent Achievements */}
        <View style={{ borderRadius: 20, overflow: "hidden", marginBottom: 24 }}>
          <BlurView
            intensity={isDark ? 60 : 80}
            tint={isDark ? "dark" : "light"}
            style={{
              backgroundColor: isDark
                ? "rgba(31,41,55,0.7)"
                : "rgba(255,255,255,0.7)",
              borderWidth: 1,
              borderColor: isSpookySeason ? "rgba(255,140,0,0.25)" : colors.border,
              borderRadius: 20,
              padding: 20,
            }}
          >
            <Text
              style={{
                fontFamily: "Inter_700Bold",
                fontSize: 18,
                color: colors.text,
                marginBottom: 16,
              }}
            >
              {isSpookySeason ? "Recent Conquests" : "Recent Achievements"}
            </Text>

            {completed.length > 0 ? (
              getRecentAchievements().map((achievement, index) => {
                const IconComponent = getAchievementIcon(achievement.icon_name);
                return (
                  <View
                    key={achievement.achievement_id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingVertical: 12,
                      borderBottomWidth:
                        index < Math.min(completed.length, 3) - 1 ? 1 : 0,
                      borderBottomColor: colors.overlay,
                    }}
                  >
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: isSpookySeason
                          ? "rgba(255,140,0,0.15)"
                          : colors.gameAccent3 + "20",
                        justifyContent: "center",
                        alignItems: "center",
                        marginRight: 12,
                        borderWidth: isSpookySeason ? 1 : 0,
                        borderColor: "rgba(255,140,0,0.25)",
                      }}
                    >
                      <IconComponent
                        size={20}
                        color={isSpookySeason ? "#FF8C00" : colors.gameAccent3}
                      />
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontFamily: "Inter_600SemiBold",
                          fontSize: 16,
                          color: colors.text,
                        }}
                      >
                        {achievement.name}
                      </Text>
                      <Text
                        style={{
                          fontFamily: "Inter_500Medium",
                          fontSize: 12,
                          color: colors.textSecondary,
                        }}
                      >
                        {achievement.description}
                      </Text>
                    </View>

                    <Text
                      style={{
                        fontFamily: "Inter_700Bold",
                        fontSize: 14,
                        color: isSpookySeason ? "#FF8C00" : colors.gameAccent3,
                      }}
                    >
                      +{achievement.points_reward}
                    </Text>
                  </View>
                );
              })
            ) : (
              <Text
                style={{
                  fontFamily: "Inter_500Medium",
                  fontSize: 14,
                  color: colors.textSecondary,
                  textAlign: "center",
                  paddingVertical: 20,
                }}
              >
                Keep playing to unlock achievements!
              </Text>
            )}
          </BlurView>
        </View>

        {/* Top Games */}
        <View style={{ borderRadius: 20, overflow: "hidden", marginBottom: 24 }}>
          <BlurView
            intensity={isDark ? 60 : 80}
            tint={isDark ? "dark" : "light"}
            style={{
              backgroundColor: isDark
                ? "rgba(31,41,55,0.7)"
                : "rgba(255,255,255,0.7)",
              borderWidth: 1,
              borderColor: isSpookySeason ? "rgba(255,140,0,0.25)" : colors.border,
              borderRadius: 20,
              padding: 20,
            }}
          >
            <Text
              style={{
                fontFamily: "Inter_700Bold",
                fontSize: 18,
                color: colors.text,
                marginBottom: 16,
              }}
            >
              {isSpookySeason ? "Most Haunted Games" : "Top Games"}
            </Text>

            {topGames.length > 0 ? (
              topGames.map((game, index) => (
                <View
                  key={game.gameId}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 12,
                    borderBottomWidth: index < topGames.length - 1 ? 1 : 0,
                    borderBottomColor: colors.overlay,
                  }}
                >
                  {/* Rank badge */}
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: isSpookySeason
                        ? "rgba(255,140,0,0.15)"
                        : colors.gameAccent1 + "20",
                      justifyContent: "center",
                      alignItems: "center",
                      marginRight: 12,
                      borderWidth: isSpookySeason ? 1 : 0,
                      borderColor: "rgba(255,140,0,0.25)",
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: "Inter_700Bold",
                        fontSize: 14,
                        color: isSpookySeason ? "#FF8C00" : colors.gameAccent1,
                      }}
                    >
                      {index + 1}
                    </Text>
                  </View>

                  {/* Name (left) */}
                  <Text
                    style={{
                      flex: 1,
                      fontFamily: "Inter_600SemiBold",
                      fontSize: 16,
                      color: colors.text,
                    }}
                    numberOfLines={1}
                  >
                    {game.gameName}
                  </Text>

                  {/* >>> Total Plays (right) */}
                  <Text
                    style={{
                      fontFamily: "Inter_700Bold",
                      fontSize: 16,
                      color: isSpookySeason ? "#FF8C00" : colors.gameAccent1,
                    }}
                  >
                    {game.totalPlays} plays
                  </Text>
                </View>
              ))
            ) : (
              <Text
                style={{
                  fontFamily: "Inter_500Medium",
                  fontSize: 14,
                  color: colors.textSecondary,
                  textAlign: "center",
                  paddingVertical: 20,
                }}
              >
                Play some games to see your most played!
              </Text>
            )}
          </BlurView>
        </View>

        <AdBanner />

        {/* Candle glow footer */}
        {isSpookySeason && (
          <LinearGradient
            colors={[
              "rgba(255,140,0,0.00)",
              "rgba(255,140,0,0.08)",
              "rgba(255,140,0,0.14)",
            ]}
            style={{
              height: 120,
              marginTop: 16,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
            }}
          />
        )}
      </ScrollView>

      {/* FRIENDS FULL-SCREEN VIEW INSIDE PROFILE */}
      <Modal
        visible={showFriends}
        transparent
        animationType="slide"
        onRequestClose={() => setShowFriends(false)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }}>
          <View style={{ flex: 1, paddingTop: insets.top + 8 }}>
            <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
              <BlurView
                intensity={isDark ? 70 : 90}
                tint={isDark ? "dark" : "light"}
                style={{
                  borderRadius: 16,
                  padding: 12,
                  borderWidth: 1,
                  borderColor: isSpookySeason ? "rgba(255,140,0,0.25)" : colors.border,
                  backgroundColor: isDark
                    ? "rgba(31,41,55,0.7)"
                    : "rgba(255,255,255,0.7)",
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "Inter_700Bold",
                      fontSize: 18,
                      color: colors.text,
                    }}
                  >
                    Friends
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setShowFriends(false);
                    }}
                    style={{
                      padding: 8,
                      borderRadius: 10,
                      backgroundColor: isSpookySeason
                        ? "rgba(255,140,0,0.12)"
                        : colors.glassSecondary,
                      borderWidth: isSpookySeason ? 1 : 0,
                      borderColor: "rgba(255,140,0,0.25)",
                    }}
                  >
                    <X size={18} color={colors.text} />
                  </TouchableOpacity>
                </View>
              </BlurView>
            </View>

            <View style={{ flex: 1, paddingHorizontal: 16, paddingBottom: insets.bottom + 12 }}>
              <BlurView
                intensity={isDark ? 60 : 80}
                tint={isDark ? "dark" : "light"}
                style={{
                  flex: 1,
                  borderRadius: 16,
                  overflow: "hidden",
                  borderWidth: 1,
                  borderColor: isSpookySeason ? "rgba(255,140,0,0.25)" : colors.border,
                  backgroundColor: isDark
                    ? "rgba(31,41,55,0.7)"
                    : "rgba(255,255,255,0.7)",
                }}
              >
                <FriendsSection
                  userId={player?.user_id}     // players.user_id (INTEGER)
                  playerId={currentPlayerId}   // players.id (INTEGER)
                />
              </BlurView>
            </View>
          </View>
        </View>
      </Modal>

      <EmojiPicker
        visible={showEmojiPicker}
        onClose={() => setShowEmojiPicker(false)}
        onSelect={handleEmojiSelect}
        currentEmoji={player?.profile_emoji || (isSpookySeason ? "🎃" : "🧩")}
      />
    </View>
  );
}
