import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert, // 🔑 ADDED
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../../utils/theme";
import { BlurView } from "expo-blur";
import { router } from "expo-router";
import {
  ArrowLeft,
  Edit3,
  LogOut, // 🔑 ADDED
  Trophy,
  Clock,
  Target,
  Crown,
  Award,
  Star,
  Hash,
  Shield,
  Gamepad2,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import playtimeTracker from "../../utils/playtimeTracker";
import EmojiPicker from "../../components/EmojiPicker";
import NightSkyBackground from "../../components/NightSkyBackground";
import GameInvitationCard from "../../components/friends/GameInvitationCard";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import { supabase } from "../../utils/supabase"; // ✅ supabase client

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const queryClient = useQueryClient();
  const [currentPlayerId, setCurrentPlayerId] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // 🔑 ADDED: logout clears local player id + signs out of Supabase, then navigates to start/login
  const handleLogout = async () => {
    try {
      // If you use Supabase Auth anywhere, this safely signs out (no-op if already signed out)
      await supabase.auth.signOut();
      // Clear your local auto-login id so app opens logged out
      await AsyncStorage.removeItem("puzzle_hub_player_id");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/"); // ⬅️ change this to your login route if different
    } catch (e) {
      Alert.alert("Logout failed", e?.message || "Please try again.");
    }
  };

  // Load playerId
  useEffect(() => {
    const loadPlayerId = async () => {
      try {
        const savedPlayerId = await AsyncStorage.getItem("puzzle_hub_player_id");
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

  // ✅ Fetch player
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

  // ✅ Fetch invitations
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

  // ✅ Fetch achievements
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
    ? achievementsResponse.map((a) => ({
        ...a.achievements,
        ...a,
      }))
    : [];

  // ✅ Fetch sessions
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

// ⬇️ replace the current stats useQuery with this
const { data: stats = [] } = useQuery({
  queryKey: ["player-stats-with-names", currentPlayerId],
  enabled: !!currentPlayerId,
  queryFn: async () => {
    // a) raw stats for this player
    const { data: rawStats, error: sErr } = await supabase
      .from("player_game_stats")
      .select("game_id, total_plays, total_playtime_seconds")
      .eq("player_id", currentPlayerId);

    if (sErr) throw sErr;
    const rows = rawStats ?? [];
    if (rows.length === 0) return [];

    // b) fetch names for those game_ids
    const gameIds = Array.from(new Set(rows.map(r => r.game_id).filter(Boolean)));
    const { data: gameRows, error: gErr } = await supabase
      .from("games")
      .select("id, name")
      .in("id", gameIds);

    if (gErr) throw gErr;
    const nameById = new Map((gameRows ?? []).map(g => [g.id, g.name]));

    // c) attach game_name to each stat row
    return rows.map(r => ({
      ...r,
      game_name: nameById.get(r.game_id) ?? "Unknown",
    }));
  },
  refetchInterval: 60000,
  refetchIntervalInBackground: false,
});


  // ✅ Mutations
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

  // Helpers
  const formatPlaytime = (totalSeconds) => {
    if (!totalSeconds) return { hours: 0, minutes: 0, totalSeconds: 0 };
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return { hours, minutes, totalSeconds };
  };

  const calculateLevel = () => {
    const totalPlaytimeMinutes = Math.floor(
      (player?.total_playtime_seconds || 0) / 60,
    );
    return Math.floor(totalPlaytimeMinutes / 5) + 1; // ✅ 5 min per level
  };

  const getPlayerTitle = (level) => playtimeTracker.getPlayerTitle(level);

  const getTimeToNextLevel = () => {
    const totalPlaytimeSeconds = player?.total_playtime_seconds || 0;
    return playtimeTracker.getTimeToNextLevel(totalPlaytimeSeconds);
  };

 const getTopGames = () => {
  const played = (stats ?? []).filter(
    (s) => (s.total_playtime_seconds ?? 0) > 0
  );

  return played
    .sort(
      (a, b) =>
        (b.total_playtime_seconds ?? 0) -
        (a.total_playtime_seconds ?? 0)
    )
    .slice(0, 3)
    .map((row, idx) => ({
      gameId: row.game_id,
      gameName: row.game_name,                 // from the name-join you did above
      totalPlaytime: row.total_playtime_seconds ?? 0,
      totalPlays: row.total_plays ?? 0,
      rank: idx + 1,
    }));
};


  const groupAchievements = () => {
    const completed = achievements.filter((a) => a.is_completed);
    const inProgress = achievements.filter(
      (a) => !a.is_completed && a.progress > 0,
    );
    const locked = achievements.filter(
      (a) => !a.is_completed && a.progress === 0,
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
    0,
  );
  const { completed } = groupAchievements();

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={isDark ? "light" : "dark"} />

      {/* Night sky background gradient */}
      <NightSkyBackground />

      <LinearGradient
        colors={
          isDark
            ? ["rgba(17, 24, 39, 1)", "rgba(31, 41, 55, 0.8)"]
            : ["rgba(79, 70, 229, 0.1)", "rgba(255, 255, 255, 0.9)"]
        }
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
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
            Player Profile
          </Text>

          {/* Right-side actions: Logout + Edit */}
          <View style={{ flexDirection: "row", gap: 12 }}>
            {/* 🔑 ADDED: Logout button */}
            <TouchableOpacity
              onPress={handleLogout}
              style={{
                padding: 8,
                borderRadius: 12,
                backgroundColor: colors.glassSecondary,
              }}
            >
              <LogOut size={20} color={colors.text} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleEditName}
              style={{
                padding: 8,
                borderRadius: 12,
                backgroundColor: colors.glassSecondary,
              }}
            >
              <Edit3 size={20} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Game Invitations Section */}
        {gameInvitations.length > 0 && (
          <View style={{ marginBottom: 24 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <Gamepad2 size={20} color={colors.gameAccent1} />
              <Text
                style={{
                  fontFamily: "Inter_700Bold",
                  fontSize: 18,
                  color: colors.text,
                  marginLeft: 8,
                }}
              >
                Game Invitations ({gameInvitations.length})
              </Text>
            </View>
            {gameInvitations.map((invitation) => (
              <GameInvitationCard
                key={invitation.id}
                invitation={invitation}
                playerId={currentPlayerId}
              />
            ))}
          </View>
        )}

        {/* Player Info Card */}
        <View
          style={{ borderRadius: 20, overflow: "hidden", marginBottom: 24 }}
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
              borderRadius: 20,
              padding: 24,
              alignItems: "center",
            }}
          >
            {/* Avatar */}
            <TouchableOpacity
              onPress={() => setShowEmojiPicker(true)}
              style={{
                width: 80,
                height: 80,
                borderRadius: 40,
                backgroundColor: colors.gameAccent1 + "20",
                justifyContent: "center",
                alignItems: "center",
                marginBottom: 16,
                borderWidth: 2,
                borderColor: colors.gameAccent1 + "40",
              }}
            >
              <Text style={{ fontSize: 32 }}>
                {player?.profile_emoji || "🧩"}
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
                {player?.username || "Player"}
              </Text>
            )}

            {/* User ID and PIN (if they have an account) */}
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
                backgroundColor: colors.gameAccent1 + "20",
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 12,
                marginBottom: 16,
              }}
            >
              <Crown size={16} color={colors.gameAccent1} />
              <Text
                style={{
                  fontFamily: "Inter_600SemiBold",
                  fontSize: 14,
                  color: colors.gameAccent1,
                  marginLeft: 6,
                }}
              >
                {title}
              </Text>
            </View>

            {/* Level and Stats */}
            <Text
              style={{
                fontFamily: "Inter_600SemiBold",
                fontSize: 18,
                color: colors.text,
                marginBottom: 4,
              }}
            >
              Level {level}
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
                player?.total_playtime_seconds || 0,
              )}{" "}
              played
            </Text>
            <Text
              style={{
                fontFamily: "Inter_500Medium",
                fontSize: 12,
                color: colors.gameAccent2,
              }}
            >
              Next level in {timeToNext.minutes}m {timeToNext.seconds}s
            </Text>
            <Text
              style={{
                fontFamily: "Inter_500Medium",
                fontSize: 14,
                color: colors.gameAccent1,
                marginTop: 4,
              }}
            >
              {(player?.total_points || 0).toLocaleString()} total points
            </Text>
          </BlurView>
        </View>

        {/* Stats Cards */}
        <View
          style={{
            flexDirection: "row",
            gap: 12,
            marginBottom: 24,
          }}
        >
          <View style={{ flex: 1, borderRadius: 16, overflow: "hidden" }}>
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
                alignItems: "center",
              }}
            >
              <Target size={24} color={colors.gameAccent2} />
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
                  ? "rgba(31, 41, 55, 0.7)"
                  : "rgba(255, 255, 255, 0.7)",
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 16,
                padding: 16,
                alignItems: "center",
              }}
            >
              <Award size={24} color={colors.gameAccent3} />
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

        {/* Achievements Section */}
        <View
          style={{ borderRadius: 20, overflow: "hidden", marginBottom: 24 }}
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
              Recent Achievements
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
                        backgroundColor: colors.gameAccent3 + "20",
                        justifyContent: "center",
                        alignItems: "center",
                        marginRight: 12,
                      }}
                    >
                      <IconComponent size={20} color={colors.gameAccent3} />
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
                        color: colors.gameAccent3,
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
        <View
          style={{ borderRadius: 20, overflow: "hidden", marginBottom: 24 }}
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
              Top Games
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
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: colors.gameAccent1 + "20",
                      justifyContent: "center",
                      alignItems: "center",
                      marginRight: 12,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: "Inter_700Bold",
                        fontSize: 14,
                        color: colors.gameAccent1,
                      }}
                    >
                      {index + 1}
                    </Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontFamily: "Inter_600SemiBold",
                        fontSize: 16,
                        color: colors.text,
                      }}
                    >
                      {game.gameName}
                    </Text>
                    <Text
                      style={{
                        fontFamily: "Inter_500Medium",
                        fontSize: 12,
                        color: colors.textSecondary,
                      }}
                    >
                      {game.totalPlays} plays
                    </Text>
                  </View>

                  <Text
                    style={{
                      fontFamily: "Inter_700Bold",
                      fontSize: 16,
                      color: colors.gameAccent1,
                    }}
                  >
                    {playtimeTracker.formatPlaytime(game.totalPlaytime)}
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
      </ScrollView>

      {/* Emoji Picker Modal */}
      <EmojiPicker
        visible={showEmojiPicker}
        onClose={() => setShowEmojiPicker(false)}
        onSelect={handleEmojiSelect}
        currentEmoji={player?.profile_emoji || "🧩"}
      />
    </View>
  );
}
