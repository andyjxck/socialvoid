import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../../utils/theme";
import { BlurView } from "expo-blur";
import { useQuery } from "@tanstack/react-query";
import {
  Trophy,
  Clock,
  Star,
  ArrowLeft,
  Users,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NightSkyBackground from "../../components/NightSkyBackground";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import { supabase } from "../../utils/supabase";

const { width: screenWidth } = Dimensions.get("window");

export default function LeaderboardsScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const [selectedGameId, setSelectedGameId] = useState(null);
  const [leaderboardType, setLeaderboardType] = useState("playtime");
  const [friendsOnly, setFriendsOnly] = useState(false);
  const [currentPlayerId, setCurrentPlayerId] = useState(null);

  useEffect(() => {
    const loadPlayerId = async () => {
      try {
        const savedPlayerId = await AsyncStorage.getItem("puzzle_hub_player_id");
        if (savedPlayerId) {
          setCurrentPlayerId(parseInt(savedPlayerId));
          console.log("✅ Loaded player ID:", savedPlayerId);
        } else {
          console.warn("⚠️ No player ID found in storage");
        }
      } catch (error) {
        console.error("❌ Failed to load player ID:", error);
      }
    };
    loadPlayerId();
  }, []);

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // 🎮 Fetch games
  const { data: games = [] } = useQuery({
    queryKey: ["games-list"],
    queryFn: async () => {
      console.log("🎮 Fetching games list...");
      const { data, error } = await supabase.from("games").select("*");
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 60000,
  });

  // 🏆 Fetch leaderboard
  const {
    data: players = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: [
      "leaderboards",
      selectedGameId,
      leaderboardType,
      friendsOnly,
      currentPlayerId,
    ],
    queryFn: async () => {
      if (!currentPlayerId) return [];

      let query;
      if (selectedGameId) {
        query = supabase
          .from("player_game_stats")
          .select("*, players(username, profile_emoji)")
          .eq("game_id", selectedGameId);

        if (leaderboardType === "playtime") {
          query = query.order("total_playtime_seconds", { ascending: false });
        } else {
          query = query.order("high_score", { ascending: false });
        }
      } else {
        query = supabase
          .from("players")
          .select("*")
          .order(
            leaderboardType === "playtime"
              ? "total_playtime_seconds"
              : "total_points",
            { ascending: false }
          );
      }

      if (friendsOnly) {
        console.log("👥 Friends-only filter active (placeholder)");
        // TODO: apply .in("player_id", friendsListIds)
      }

      const { data, error } = await query.limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentPlayerId,
    refetchInterval: 60000,
  });

  const formatPlaytime = (totalSeconds) => {
    if (!totalSeconds) return "0m";
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  const onRefresh = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await refetch();
  };

  const handleGameSelect = async (gameId) => {
    await Haptics.selectionAsync();
    setSelectedGameId(gameId);
  };

  const handleLeaderboardTypeChange = async (type) => {
    await Haptics.selectionAsync();
    setLeaderboardType(type);
  };

  const handleBack = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  const toggleFriendsFilter = async () => {
    await Haptics.selectionAsync();
    setFriendsOnly(!friendsOnly);
  };

  const topThree = players.slice(0, 3);
  const remainingPlayers = players.slice(3);

  // 🎖️ Podium
  const renderPedestal = () => {
    if (topThree.length === 0) return null;

    const displayOrder = [
      { player: topThree[1], rank: 2, height: 80 },
      { player: topThree[0], rank: 1, height: 120 },
      { player: topThree[2], rank: 3, height: 60 },
    ];

    const colors_accent = [
      colors.gameAccent2,
      colors.gameAccent5,
      colors.gameAccent3,
    ];
    const emojis = ["👑", "🥈", "🥉"];

    return (
      <View style={{ paddingHorizontal: 20, marginBottom: 40 }}>
        <Text
          style={{
            fontFamily: "Inter_700Bold",
            fontSize: 20,
            color: colors.text,
            textAlign: "center",
            marginBottom: 80,
          }}
        >
          🏆 Top 3 Players
        </Text>

        <View
          style={{
            height: 220,
            justifyContent: "flex-end",
            paddingTop: 20,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-end",
              justifyContent: "center",
              height: 200,
            }}
          >
            {displayOrder.map((item, idx) => {
              if (!item?.player) return <View key={idx} style={{ flex: 1 }} />;

              const { player, rank, height } = item;
              const emoji = emojis[rank - 1];
              const accentColor = colors_accent[rank - 1];
              const profileEmoji =
                player.profile_emoji || player.players?.profile_emoji || "🧩";
              const username =
                player.username || player.players?.username || "Unknown";

              return (
                <View
                  key={rank}
                  style={{
                    flex: 1,
                    alignItems: "center",
                    marginHorizontal: 6,
                    height: 200,
                    justifyContent: "flex-end",
                  }}
                >
                  <View style={{ alignItems: "center", marginBottom: 12 }}>
                    <View
                      style={{
                        width: rank === 1 ? 40 : 32,
                        height: rank === 1 ? 40 : 32,
                        borderRadius: rank === 1 ? 20 : 16,
                        backgroundColor: accentColor,
                        justifyContent: "center",
                        alignItems: "center",
                        marginBottom: 8,
                      }}
                    >
                      <Text style={{ fontSize: rank === 1 ? 22 : 18 }}>
                        {emoji}
                      </Text>
                    </View>

                    <View
                      style={{
                        width: rank === 1 ? 70 : 55,
                        height: rank === 1 ? 70 : 55,
                        borderRadius: rank === 1 ? 35 : 27.5,
                        backgroundColor: accentColor + "20",
                        borderWidth: 3,
                        borderColor: accentColor,
                        justifyContent: "center",
                        alignItems: "center",
                        marginBottom: 8,
                      }}
                    >
                      <Text style={{ fontSize: rank === 1 ? 28 : 22 }}>
                        {profileEmoji}
                      </Text>
                    </View>

                    <Text
                      style={{
                        fontFamily: "Inter_600SemiBold",
                        fontSize: rank === 1 ? 15 : 13,
                        color: colors.text,
                        textAlign: "center",
                        marginBottom: 4,
                      }}
                      numberOfLines={1}
                    >
                      {username}
                    </Text>

                    <Text
                      style={{
                        fontFamily: "Inter_700Bold",
                        fontSize: rank === 1 ? 17 : 15,
                        color: accentColor,
                        textAlign: "center",
                      }}
                    >
                      {leaderboardType === "scores"
                        ? selectedGameId
                          ? player.high_score?.toLocaleString() || "0"
                          : player.total_points?.toLocaleString() || "0"
                        : formatPlaytime(
                            selectedGameId
                              ? player.total_playtime_seconds
                              : player.total_playtime_seconds
                          )}
                    </Text>
                  </View>

                  <View
                    style={{
                      width: "100%",
                      height,
                      borderRadius: 12,
                      overflow: "hidden",
                    }}
                  >
                    <LinearGradient
                      colors={[accentColor + "50", accentColor + "30"]}
                      style={{
                        flex: 1,
                        justifyContent: "flex-end",
                        alignItems: "center",
                        paddingBottom: 16,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: "Inter_700Bold",
                          fontSize: rank === 1 ? 28 : 24,
                          color: accentColor,
                        }}
                      >
                        #{rank}
                      </Text>
                    </LinearGradient>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      </View>
    );
  };

  // 📊 Remaining ranks
  const renderPlayersList = () => {
    if (remainingPlayers.length === 0) return null;

    return (
      <View style={{ paddingHorizontal: 20 }}>
        <Text
          style={{
            fontFamily: "Inter_700Bold",
            fontSize: 18,
            color: colors.text,
            marginBottom: 16,
            textAlign: "center",
          }}
        >
          📊 Rankings 4-{Math.min(players.length, 50)}
        </Text>

        {remainingPlayers.map((player, idx) => {
          const rank = idx + 4;
          const profileEmoji =
            player.profile_emoji || player.players?.profile_emoji || "🧩";
          const username =
            player.username || player.players?.username || "Unknown";

          return (
            <View
              key={rank}
              style={{
                borderRadius: 16,
                overflow: "hidden",
                marginBottom: 12,
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
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor:
                          rank <= 10
                            ? colors.gameAccent1 + "30"
                            : colors.gameAccent1 + "15",
                        alignItems: "center",
                        justifyContent: "center",
                        marginRight: 12,
                        borderWidth: rank <= 10 ? 2 : 1,
                        borderColor:
                          rank <= 10
                            ? colors.gameAccent1
                            : colors.gameAccent1 + "50",
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: "Inter_700Bold",
                          fontSize: 14,
                          color:
                            rank <= 10
                              ? colors.gameAccent1
                              : colors.textSecondary,
                        }}
                      >
                        {rank}
                      </Text>
                    </View>

                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        backgroundColor: colors.gameAccent1 + "20",
                        justifyContent: "center",
                        alignItems: "center",
                        marginRight: 12,
                      }}
                    >
                      <Text style={{ fontSize: 16 }}>{profileEmoji}</Text>
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontFamily: "Inter_600SemiBold",
                          fontSize: 16,
                          color: colors.text,
                          marginBottom: 2,
                        }}
                      >
                        {username}
                      </Text>
                      {selectedGameId && (
                        <Text
                          style={{
                            fontFamily: "Inter_500Medium",
                            fontSize: 12,
                            color: colors.textSecondary,
                          }}
                        >
                          {player.total_plays || 0} plays •{" "}
                          {player.high_score?.toLocaleString() || "0"} best
                        </Text>
                      )}
                      {!selectedGameId && (
                        <Text
                          style={{
                            fontFamily: "Inter_500Medium",
                            fontSize: 12,
                            color: colors.textSecondary,
                          }}
                        >
                          {player.total_points?.toLocaleString() || 0} total points
                        </Text>
                      )}
                    </View>
                  </View>

                  <View style={{ alignItems: "flex-end" }}>
                    <Text
                      style={{
                        fontFamily: "Inter_700Bold",
                        fontSize: 16,
                        color: colors.gameAccent1,
                        marginBottom: 2,
                      }}
                    >
                      {leaderboardType === "scores"
                        ? selectedGameId
                          ? player.high_score?.toLocaleString() || "0"
                          : player.total_points?.toLocaleString() || "0"
                        : formatPlaytime(
                            selectedGameId
                              ? player.total_playtime_seconds
                              : player.total_playtime_seconds
                          )}
                    </Text>
                    <Text
                      style={{
                        fontFamily: "Inter_500Medium",
                        fontSize: 10,
                        color: colors.textSecondary,
                        textTransform: "uppercase",
                      }}
                    >
                      {leaderboardType === "scores"
                        ? selectedGameId
                          ? "High Score"
                          : "Total Points"
                        : selectedGameId
                          ? "Game Time"
                          : "Total Time"}
                    </Text>
                  </View>
                </View>
              </BlurView>
            </View>
          );
        })}
      </View>
    );
  };

  if (!fontsLoaded) return null;

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <NightSkyBackground />

      <LinearGradient
        colors={
          isDark
            ? ["rgba(17, 24, 39, 1)", "rgba(31, 41, 55, 0.8)"]
            : ["rgba(139, 92, 246, 0.1)", "rgba(255, 255, 255, 0.9)"]
        }
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      />

      {/* Header */}
      <View
        style={{
          paddingTop: insets.top + 20,
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
            onPress={handleBack}
            style={{
              padding: 12,
              borderRadius: 12,
              backgroundColor: colors.glassSecondary,
            }}
          >
            <ArrowLeft size={24} color={colors.text} />
          </TouchableOpacity>

          <Text
            style={{
              fontFamily: "Inter_700Bold",
              fontSize: 28,
              color: colors.text,
              flex: 1,
              textAlign: "center",
            }}
          >
            🏆 Leaderboards
          </Text>

          <TouchableOpacity
            onPress={toggleFriendsFilter}
            style={{
              padding: 12,
              borderRadius: 12,
              backgroundColor: friendsOnly
                ? colors.gameAccent1
                : colors.glassSecondary,
            }}
          >
            <Users size={24} color={friendsOnly ? "white" : colors.text} />
          </TouchableOpacity>
        </View>

        {/* Game Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <TouchableOpacity
            onPress={() => handleGameSelect(null)}
            style={{
              paddingHorizontal: 20,
              paddingVertical: 12,
              borderRadius: 20,
              backgroundColor: !selectedGameId
                ? colors.gameAccent1
                : colors.glassSecondary,
              marginHorizontal: 4,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <Star
              size={16}
              color={!selectedGameId ? "white" : colors.textSecondary}
              style={{ marginRight: 8 }}
            />
            <Text
              style={{
                fontFamily: "Inter_600SemiBold",
                fontSize: 14,
                color: !selectedGameId ? "white" : colors.textSecondary,
              }}
            >
              Overall
            </Text>
          </TouchableOpacity>

          {games.map((game) => (
            <TouchableOpacity
              key={game.id}
              onPress={() => handleGameSelect(game.id)}
              style={{
                paddingHorizontal: 20,
                paddingVertical: 12,
                borderRadius: 20,
                backgroundColor:
                  selectedGameId === game.id
                    ? colors.gameAccent1
                    : colors.glassSecondary,
                marginHorizontal: 4,
              }}
            >
              <Text
                style={{
                  fontFamily: "Inter_600SemiBold",
                  fontSize: 14,
                  color:
                    selectedGameId === game.id ? "white" : colors.textSecondary,
                }}
              >
                {game.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Content */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingBottom: insets.bottom + 20,
        }}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={onRefresh}
            tintColor={colors.gameAccent1}
            colors={[colors.gameAccent1]}
          />
        }
      >
        {renderPedestal()}
        {renderPlayersList()}

        {players.length === 0 && !isLoading && (
          <Text
            style={{
              textAlign: "center",
              color: colors.textSecondary,
              marginTop: 40,
              fontFamily: "Inter_500Medium",
            }}
          >
            No players yet
          </Text>
        )}
      </ScrollView>
    </View>
  );
}
