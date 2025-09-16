import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
} from "react-native";
import { useTheme } from "../utils/theme";
import { BlurView } from "expo-blur";
import {
  Search,
  Trophy,
  Star,
  Lock,
  Target,
  Clock,
  Crown,
  RefreshCw,
} from "lucide-react-native";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import { supabase } from "../utils/supabase";

export default function AchievementsSection({ playerId }) {
  const { colors, isDark } = useTheme();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("all"); // all, completed, locked

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // ✅ Fetch achievements from Supabase
  const {
    data: achievementsResponse,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["achievements-full", playerId],
    queryFn: async () => {
      console.log("🔄 Fetching achievements for player:", playerId);

      const { data, error } = await supabase
        .from("player_achievements")
        .select("*, achievements(*)")
        .eq("player_id", playerId);

      if (error) {
        console.error("❌ Failed to fetch achievements:", error);
        throw error;
      }

      console.log("✅ Achievements data loaded:", data?.length || 0);
      return data || [];
    },
    enabled: !!playerId,
    refetchInterval: 60000, // auto refresh every 60s
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    staleTime: 5000,
  });

  // Auto-refresh every 8 seconds for real-time updates
  useEffect(() => {
    if (!playerId) return;
    console.log("🏆 Achievements section mounted for player:", playerId);

    const interval = setInterval(() => {
      console.log("⏰ Auto-refreshing achievements...");
      refetch();
    }, 8000);

    return () => clearInterval(interval);
  }, [playerId, refetch]);

  // Manual refresh function
  const handleManualRefresh = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    console.log("🔄 Manual refresh triggered");
    refetch();
  };

  // ✅ Normalize achievements array
  const achievements = Array.isArray(achievementsResponse)
    ? achievementsResponse.map((a) => ({
        ...a.achievements,
        ...a,
      }))
    : [];

  // Stats
  const stats = {
    total: achievements.length,
    completed: achievements.filter((a) => a.is_completed).length,
    locked: achievements.filter((a) => !a.is_completed).length,
  };

  const completionPercentage =
    stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

  // ✅ Filter + search + sort
  const filteredAchievements = achievements
    .filter((a) => {
      if (!searchQuery.trim()) return true;
      const query = searchQuery.toLowerCase();
      return (
        a.name?.toLowerCase().includes(query) ||
        a.description?.toLowerCase().includes(query)
      );
    })
    .filter((a) => {
      switch (filterType) {
        case "completed":
          return a.is_completed;
        case "locked":
          return !a.is_completed;
        default:
          return true;
      }
    })
    .sort((a, b) => {
      if (a.is_completed && !b.is_completed) return -1;
      if (!a.is_completed && b.is_completed) return 1;
      return (b.points_reward || 0) - (a.points_reward || 0);
    });

  const getAchievementIcon = (iconName) => {
    const map = {
      trophy: Trophy,
      star: Star,
      crown: Crown,
      target: Target,
      clock: Clock,
      lock: Lock,
    };
    return map[iconName] || Trophy;
  };

  const getGameName = (gameId) => {
    const map = {
      131: "Memory Match",
      132: "Tetris",
      133: "2048",
      134: "Sliding Puzzle",
      135: "Chess",
      136: "Sudoku",
      137: "Block Blast",
      138: "Water Sort",
      139: "Mancala",
      140: "Word Search",
      141: "Snake",
      142: "Minesweeper",
      143: "Connect Lines",
    };
    return map[gameId] || "General";
  };

  const handleFilterPress = (filter) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFilterType(filter);
  };

  if (!fontsLoaded) return null;

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text
          style={{
            textAlign: "center",
            color: colors.textSecondary,
            fontFamily: "Inter_400Regular",
          }}
        >
          Failed to load achievements. Please try again.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 16 }}>
      {/* Stats Header */}
      <View style={{ marginBottom: 16 }}>
        <BlurView
          intensity={isDark ? 40 : 60}
          tint={isDark ? "dark" : "light"}
          style={{
            backgroundColor: isDark
              ? "rgba(31, 41, 55, 0.6)"
              : "rgba(255, 255, 255, 0.6)",
            borderRadius: 12,
            padding: 16,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text
            style={{
              fontFamily: "Inter_700Bold",
              fontSize: 14,
              color: colors.text,
              marginBottom: 8,
            }}
          >
            Achievement Progress
          </Text>

          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text
              style={{
                fontFamily: "Inter_500Medium",
                fontSize: 12,
                color: colors.textSecondary,
              }}
            >
              {stats.completed} of {stats.total} completed
            </Text>
            <Text
              style={{
                fontFamily: "Inter_600SemiBold",
                fontSize: 12,
                color: colors.gameAccent1,
              }}
            >
              {completionPercentage}%
            </Text>
          </View>

          {/* Progress Bar */}
          <View
            style={{
              height: 6,
              backgroundColor: isDark
                ? "rgba(31, 41, 55, 0.8)"
                : "rgba(0, 0, 0, 0.1)",
              borderRadius: 3,
              marginTop: 8,
            }}
          >
            <View
              style={{
                height: "100%",
                width: `${completionPercentage}%`,
                backgroundColor: colors.gameAccent1,
              }}
            />
          </View>
        </BlurView>
      </View>

      {/* Search & Filters */}
      <View style={{ marginBottom: 16 }}>
        <BlurView
          intensity={isDark ? 40 : 60}
          tint={isDark ? "dark" : "light"}
          style={{
            backgroundColor: isDark
              ? "rgba(31, 41, 55, 0.6)"
              : "rgba(255, 255, 255, 0.6)",
            borderRadius: 12,
            padding: 12,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          {/* Search Bar */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: colors.glassSecondary,
              borderRadius: 8,
              paddingHorizontal: 8,
              marginBottom: 8,
            }}
          >
            <Search size={14} color={colors.textSecondary} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search achievements..."
              placeholderTextColor={colors.textSecondary}
              style={{
                flex: 1,
                paddingVertical: 8,
                paddingHorizontal: 6,
                color: colors.text,
                fontSize: 12,
                fontFamily: "Inter_400Regular",
              }}
            />
            <TouchableOpacity onPress={handleManualRefresh}>
              <RefreshCw size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Filter Buttons */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {[
                { id: "all", label: "All", count: stats.total },
                { id: "completed", label: "Completed", count: stats.completed },
                { id: "locked", label: "Locked", count: stats.locked },
              ].map((filter) => (
                <TouchableOpacity
                  key={filter.id}
                  onPress={() => handleFilterPress(filter.id)}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 16,
                    backgroundColor:
                      filterType === filter.id
                        ? colors.gameAccent1 + "20"
                        : colors.glassSecondary,
                    borderWidth: filterType === filter.id ? 1 : 0,
                    borderColor: colors.gameAccent1,
                  }}
                >
                  <Text
                    style={{
                      fontFamily:
                        filterType === filter.id
                          ? "Inter_600SemiBold"
                          : "Inter_500Medium",
                      fontSize: 10,
                      color:
                        filterType === filter.id
                          ? colors.gameAccent1
                          : colors.text,
                    }}
                  >
                    {filter.label} ({filter.count})
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </BlurView>
      </View>

      {/* Achievements List */}
      <ScrollView showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <Text
            style={{
              textAlign: "center",
              color: colors.textSecondary,
              fontFamily: "Inter_400Regular",
              marginTop: 20,
            }}
          >
            Loading achievements...
          </Text>
        ) : filteredAchievements.length === 0 ? (
          <Text
            style={{
              textAlign: "center",
              color: colors.textSecondary,
              fontFamily: "Inter_400Regular",
              marginTop: 20,
            }}
          >
            No achievements found
          </Text>
        ) : (
          filteredAchievements.map((a) => {
            const Icon = getAchievementIcon(a.icon_name);
            const isLocked = !a.is_completed;

            return (
              <View key={a.id || a.achievement_id} style={{ marginBottom: 8 }}>
                <BlurView
                  intensity={isDark ? 40 : 60}
                  tint={isDark ? "dark" : "light"}
                  style={{
                    backgroundColor: isDark
                      ? "rgba(31, 41, 55, 0.6)"
                      : "rgba(255, 255, 255, 0.6)",
                    borderRadius: 8,
                    padding: 12,
                    borderWidth: 1,
                    borderColor: a.is_completed
                      ? colors.gameAccent1 + "40"
                      : colors.border,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    {/* Icon */}
                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 16,
                        backgroundColor: isLocked
                          ? colors.overlay
                          : colors.gameAccent1 + "20",
                        justifyContent: "center",
                        alignItems: "center",
                        marginRight: 10,
                      }}
                    >
                      <Icon
                        size={16}
                        color={
                          isLocked
                            ? colors.textSecondary
                            : colors.gameAccent1
                        }
                      />
                    </View>

                    {/* Content */}
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontFamily: "Inter_600SemiBold",
                          fontSize: 13,
                          color: isLocked ? colors.textSecondary : colors.text,
                        }}
                      >
                        {a.name}
                      </Text>
                      <Text
                        style={{
                          fontFamily: "Inter_400Regular",
                          fontSize: 11,
                          color: colors.textSecondary,
                        }}
                      >
                        {a.description}
                      </Text>
                      {a.game_id && (
                        <Text
                          style={{
                            fontFamily: "Inter_500Medium",
                            fontSize: 9,
                            color: colors.gameAccent2,
                          }}
                        >
                          {getGameName(a.game_id)}
                        </Text>
                      )}
                      <Text
                        style={{
                          fontFamily: "Inter_600SemiBold",
                          fontSize: 9,
                          color: a.is_completed
                            ? colors.gameAccent1
                            : colors.textSecondary,
                        }}
                      >
                        {a.is_completed
                          ? "✓ COMPLETED"
                          : a.target_value
                          ? `Target: ${a.target_value}`
                          : "Locked"}
                      </Text>
                    </View>

                    {/* Points */}
                    <Text
                      style={{
                        fontFamily: "Inter_600SemiBold",
                        fontSize: 11,
                        color: a.is_completed
                          ? colors.gameAccent1
                          : colors.gameAccent2,
                      }}
                    >
                      +{a.points_reward || 0}
                    </Text>
                  </View>
                </BlurView>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}
