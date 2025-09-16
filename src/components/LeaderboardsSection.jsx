import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { useTheme } from "../utils/theme";
import { BlurView } from "expo-blur";
import {
  Trophy,
  Users,
  Globe,
  Crown,
  Medal,
  Award,
  Clock,
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

export default function LeaderboardsSection({ playerId }) {
  const { colors, isDark } = useTheme();

  const [selectedGame, setSelectedGame] = useState("overall");
  const [leaderboardType, setLeaderboardType] = useState("global");
  const [scoreType, setScoreType] = useState("playtime");

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // 🎮 Fetch games
  const { data: games = [] } = useQuery({
    queryKey: ["games"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "exec_sql",
        {
          sql: `SELECT id, name, game_type FROM games ORDER BY id ASC;`,
        }
      );
      if (error) throw error;
      return data;
    },
    refetchInterval: 60000,
  });

  // 👥 Fetch friends
  const { data: friends = [] } = useQuery({
    queryKey: ["friends", playerId],
    queryFn: async () => {
      if (!playerId || leaderboardType !== "friends") return [];
      const { data, error } = await supabase.rpc(
        "exec_sql",
        {
          sql: `
            SELECT f.friend_id AS id
            FROM friends f
            WHERE f.player_id = ${playerId};
          `,
        }
      );
      if (error) throw error;
      return data || [];
    },
    enabled: !!playerId && leaderboardType === "friends",
    refetchInterval: 60000,
  });

  // 🏆 Fetch leaderboard
  const { data: leaderboard = [], isLoading } = useQuery({
    queryKey: [
      "leaderboard",
      selectedGame,
      leaderboardType,
      scoreType,
      playerId,
      friends.length,
    ],
    queryFn: async () => {
      let sql;

      if (selectedGame === "overall") {
        if (scoreType === "playtime") {
          sql = `
            SELECT p.id as player_id, p.username, p.profile_emoji,
                   p.total_playtime_seconds,
                   RANK() OVER (ORDER BY p.total_playtime_seconds DESC) as rank_position
            FROM players p
            LIMIT 50;
          `;
        } else {
          sql = `
            SELECT p.id as player_id, p.username, p.profile_emoji,
                   p.total_points,
                   RANK() OVER (ORDER BY p.total_points DESC) as rank_position
            FROM players p
            LIMIT 50;
          `;
        }
      } else {
        if (scoreType === "playtime") {
          sql = `
            SELECT s.player_id, pl.username, pl.profile_emoji,
                   s.total_playtime_seconds,
                   RANK() OVER (ORDER BY s.total_playtime_seconds DESC) as rank_position
            FROM player_game_stats s
            JOIN players pl ON pl.id = s.player_id
            WHERE s.game_id = ${selectedGame}
            LIMIT 50;
          `;
        } else {
          sql = `
            SELECT s.player_id, pl.username, pl.profile_emoji,
                   s.high_score, s.best_time, s.total_plays,
                   RANK() OVER (ORDER BY s.high_score DESC NULLS LAST) as rank_position
            FROM player_game_stats s
            JOIN players pl ON pl.id = s.player_id
            WHERE s.game_id = ${selectedGame}
            LIMIT 50;
          `;
        }
      }

      const { data, error } = await supabase.rpc("exec_sql", { sql });
      if (error) throw error;

      // 👥 Friends filter
      if (leaderboardType === "friends") {
        const friendIds = friends.map((f) => f.id);
        return data.filter(
          (entry) => entry.player_id === playerId || friendIds.includes(entry.player_id)
        );
      }

      return data || [];
    },
    enabled: !!playerId,
    refetchInterval: 60000,
  });

  // ✅ Score helpers
  const getScoreForSorting = (entry) => {
    if (selectedGame === "overall") return entry.total_points || 0;
    const gameType = games.find((g) => g.id.toString() === selectedGame)?.game_type || "";
    if (["word_search", "kakuro", "sliding_puzzle", "sudoku", "minesweeper", "memory_match", "solitaire"].includes(gameType)) {
      return entry.best_time ? -entry.best_time : -999999;
    }
    return entry.high_score || 0;
  };

  const formatScore = (entry) => {
    if (selectedGame === "overall") {
      if (scoreType === "playtime") {
        const totalSeconds = entry.total_playtime_seconds || 0;
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
      }
      return (entry.total_points || 0).toLocaleString();
    }

    const gameType = games.find((g) => g.id.toString() === selectedGame)?.game_type || "";

    if (scoreType === "playtime") {
      const totalSeconds = entry.total_playtime_seconds || 0;
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
    }

    if (["word_search","kakuro","sliding_puzzle","sudoku","minesweeper","memory_match","solitaire"].includes(gameType)) {
      if (entry.best_time) {
        const minutes = Math.floor(entry.best_time / 60);
        const seconds = entry.best_time % 60;
        return minutes > 0 ? `${minutes}:${seconds.toString().padStart(2, "0")}` : `${seconds}s`;
      }
      return "--";
    }

    if (["connect_4","mancala","chess","dots_and_boxes"].includes(gameType)) {
      return `${entry.high_score || 0}/${entry.total_plays || 0} wins`;
    }

    if (["flow_connect","water_sort"].includes(gameType)) {
      return `Level ${entry.high_score || 0}`;
    }

    if (gameType === "word_wheel") {
      return `${entry.high_score || 0} words`;
    }

    return (entry.high_score || 0).toLocaleString();
  };

  // 🖐 UI Handlers
  const handleGameSelect = (gameId) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedGame(gameId);
  };

  const handleTypeToggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLeaderboardType(leaderboardType === "global" ? "friends" : "global");
  };

  const handleScoreTypeToggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setScoreType(scoreType === "playtime" ? "scores" : "playtime");
  };

  // 🎖️ UI Helpers
  const getRankIcon = (position) => position === 1 ? Crown : position === 2 ? Medal : position === 3 ? Award : Trophy;
  const getRankColor = (position) => position === 1 ? "#FFD700" : position === 2 ? "#C0C0C0" : position === 3 ? "#CD7F32" : colors.textSecondary;
  const getSelectedGameName = () => selectedGame === "overall" ? "Overall" : games.find((g) => g.id.toString() === selectedGame)?.name || "Unknown Game";
  const getCurrentPlayerRank = () => leaderboard.find((e) => e.player_id === playerId)?.rank_position || null;

  if (!fontsLoaded) return null;

  
  return (
    <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 16 }}>
      {/* Header Controls */}
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
          {/* Type Toggle */}
          <View style={{ flexDirection: "row", marginBottom: 12, gap: 8 }}>
            <TouchableOpacity
              onPress={handleTypeToggle}
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: colors.gameAccent1 + "20",
                borderRadius: 20,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderWidth: 1,
                borderColor: colors.gameAccent1,
              }}
            >
              {leaderboardType === "global" ? (
                <Globe size={14} color={colors.gameAccent1} />
              ) : (
                <Users size={14} color={colors.gameAccent1} />
              )}
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "600",
                  color: colors.gameAccent1,
                  marginLeft: 6,
                  fontFamily: "Inter_600SemiBold",
                }}
              >
                {leaderboardType === "global"
                  ? "Global"
                  : `Friends (${friends.length})`}
              </Text>
            </TouchableOpacity>

            {/* NEW - Score Type Toggle */}
            <TouchableOpacity
              onPress={handleScoreTypeToggle}
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: colors.gameAccent2 + "20",
                borderRadius: 20,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderWidth: 1,
                borderColor: colors.gameAccent2,
              }}
            >
              {scoreType === "playtime" ? (
                <Clock size={14} color={colors.gameAccent2} />
              ) : (
                <Trophy size={14} color={colors.gameAccent2} />
              )}
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "600",
                  color: colors.gameAccent2,
                  marginLeft: 6,
                  fontFamily: "Inter_600SemiBold",
                }}
              >
                {scoreType === "playtime" ? "Playtime" : "Scores"}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Game Selection */}
          <Text
            style={{
              fontSize: 13,
              fontWeight: "600",
              color: colors.text,
              marginBottom: 8,
              fontFamily: "Inter_600SemiBold",
            }}
          >
            Game: {getSelectedGameName()}
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginBottom: 12 }}
          >
            <View style={{ flexDirection: "row", gap: 6 }}>
              <TouchableOpacity
                onPress={() => handleGameSelect("overall")}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 16,
                  backgroundColor:
                    selectedGame === "overall"
                      ? colors.gameAccent2 + "20"
                      : colors.glassSecondary,
                  borderWidth: selectedGame === "overall" ? 1 : 0,
                  borderColor: colors.gameAccent2,
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: selectedGame === "overall" ? "600" : "500",
                    color:
                      selectedGame === "overall"
                        ? colors.gameAccent2
                        : colors.text,
                    fontFamily:
                      selectedGame === "overall"
                        ? "Inter_600SemiBold"
                        : "Inter_500Medium",
                  }}
                >
                  Overall
                </Text>
              </TouchableOpacity>

              {games
                .filter((game) => game.name !== "Puzzle Wheel") // Remove Puzzle Wheel
                .map((game) => (
                  <TouchableOpacity
                    key={game.id}
                    onPress={() => handleGameSelect(game.id.toString())}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 16,
                      backgroundColor:
                        selectedGame === game.id.toString()
                          ? colors.gameAccent2 + "20"
                          : colors.glassSecondary,
                      borderWidth: selectedGame === game.id.toString() ? 1 : 0,
                      borderColor: colors.gameAccent2,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight:
                          selectedGame === game.id.toString() ? "600" : "500",
                        color:
                          selectedGame === game.id.toString()
                            ? colors.gameAccent2
                            : colors.text,
                        fontFamily:
                          selectedGame === game.id.toString()
                            ? "Inter_600SemiBold"
                            : "Inter_500Medium",
                      }}
                    >
                      {game.name}
                    </Text>
                  </TouchableOpacity>
                ))}
            </View>
          </ScrollView>

          {/* Time Period Label */}
          <Text
            style={{
              fontSize: 13,
              fontWeight: "600",
              color: colors.text,
              marginBottom: 8,
              fontFamily: "Inter_600SemiBold",
            }}
          >
            All Time Rankings (
            {scoreType === "playtime" ? "by playtime" : "by scores"})
          </Text>
        </BlurView>
      </View>

      {/* Player's Current Rank */}
      {getCurrentPlayerRank() && (
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
              borderColor: colors.gameAccent1 + "40",
            }}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: "600",
                color: colors.text,
                textAlign: "center",
                fontFamily: "Inter_600SemiBold",
              }}
            >
              Your Rank: #{getCurrentPlayerRank()}
            </Text>
          </BlurView>
        </View>
      )}

      {/* Podium */}
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
              fontSize: 16,
              fontWeight: "700",
              color: colors.text,
              textAlign: "center",
              marginBottom: 16,
              fontFamily: "Inter_700Bold",
            }}
          >
            👑 Top Players Podium 👑
          </Text>

          <View
            style={{
              flexDirection: "row",
              alignItems: "end",
              justifyContent: "center",
              gap: 12,
              marginBottom: 8,
            }}
          >
            {/* 2nd Place - Silver */}
            <View style={{ alignItems: "center", flex: 1 }}>
              <Text style={{ fontSize: 24, marginBottom: 6 }}>
                {leaderboard[1]?.profile_emoji || "❓"}
              </Text>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "600",
                  color: colors.text,
                  textAlign: "center",
                  fontFamily: "Inter_600SemiBold",
                  marginBottom: 6,
                }}
              >
                {leaderboard[1]?.username || "Empty"}
              </Text>
              <View
                style={{
                  backgroundColor: "#C0C0C0",
                  height: 50,
                  width: "100%",
                  borderRadius: 8,
                  justifyContent: "center",
                  alignItems: "center",
                  borderTopLeftRadius: 12,
                  borderTopRightRadius: 12,
                  shadowColor: "#C0C0C0",
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.3,
                  shadowRadius: 4,
                  elevation: 4,
                }}
              >
                <Text style={{ fontSize: 16, marginBottom: 2 }}>🥈</Text>
                <Text
                  style={{
                    fontSize: 9,
                    fontWeight: "700",
                    color: "#FFFFFF",
                    fontFamily: "Inter_700Bold",
                  }}
                >
                  2nd
                </Text>
              </View>
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: "700",
                  color: colors.gameAccent1,
                  marginTop: 4,
                  fontFamily: "Inter_700Bold",
                }}
              >
                {leaderboard[1] ? formatScore(leaderboard[1]) : "--"}
              </Text>
            </View>

            {/* 1st Place - Gold Crown */}
            <View style={{ alignItems: "center", flex: 1 }}>
              <Text style={{ fontSize: 28, marginBottom: 6 }}>
                {leaderboard[0]?.profile_emoji || "❓"}
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "700",
                  color: colors.text,
                  textAlign: "center",
                  fontFamily: "Inter_700Bold",
                  marginBottom: 6,
                }}
              >
                {leaderboard[0]?.username || "Empty"}
              </Text>
              <View
                style={{
                  backgroundColor: "#FFD700",
                  height: 70,
                  width: "100%",
                  borderRadius: 8,
                  justifyContent: "center",
                  alignItems: "center",
                  borderTopLeftRadius: 12,
                  borderTopRightRadius: 12,
                  shadowColor: "#FFD700",
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.4,
                  shadowRadius: 8,
                  elevation: 8,
                }}
              >
                <Text style={{ fontSize: 20, marginBottom: 2 }}>👑</Text>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "700",
                    color: "#FFFFFF",
                    fontFamily: "Inter_700Bold",
                  }}
                >
                  1st
                </Text>
              </View>
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "700",
                  color: colors.gameAccent1,
                  marginTop: 4,
                  fontFamily: "Inter_700Bold",
                }}
              >
                {leaderboard[0] ? formatScore(leaderboard[0]) : "--"}
              </Text>
            </View>

            {/* 3rd Place - Bronze */}
            <View style={{ alignItems: "center", flex: 1 }}>
              <Text style={{ fontSize: 20, marginBottom: 6 }}>
                {leaderboard[2]?.profile_emoji || "❓"}
              </Text>
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: "600",
                  color: colors.text,
                  textAlign: "center",
                  fontFamily: "Inter_600SemiBold",
                  marginBottom: 6,
                }}
              >
                {leaderboard[2]?.username || "Empty"}
              </Text>
              <View
                style={{
                  backgroundColor: "#CD7F32",
                  height: 40,
                  width: "100%",
                  borderRadius: 8,
                  justifyContent: "center",
                  alignItems: "center",
                  borderTopLeftRadius: 12,
                  borderTopRightRadius: 12,
                  shadowColor: "#CD7F32",
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.3,
                  shadowRadius: 4,
                  elevation: 4,
                }}
              >
                <Text style={{ fontSize: 14, marginBottom: 1 }}>🥉</Text>
                <Text
                  style={{
                    fontSize: 8,
                    fontWeight: "700",
                    color: "#FFFFFF",
                    fontFamily: "Inter_700Bold",
                  }}
                >
                  3rd
                </Text>
              </View>
              <Text
                style={{
                  fontSize: 9,
                  fontWeight: "700",
                  color: colors.gameAccent1,
                  marginTop: 4,
                  fontFamily: "Inter_700Bold",
                }}
              >
                {leaderboard[2] ? formatScore(leaderboard[2]) : "--"}
              </Text>
            </View>
          </View>
        </BlurView>
      </View>

      {/* Leaderboard List */}
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 20 }}
      >
        {isLoading ? (
          <Text
            style={{
              textAlign: "center",
              color: colors.textSecondary,
              fontSize: 14,
              marginTop: 20,
              fontFamily: "Inter_400Regular",
            }}
          >
            Loading leaderboard...
          </Text>
        ) : leaderboard.length === 0 ? (
          <Text
            style={{
              textAlign: "center",
              color: colors.textSecondary,
              fontSize: 14,
              marginTop: 20,
              fontFamily: "Inter_400Regular",
            }}
          >
            {leaderboardType === "friends"
              ? "Start playing games to appear on the leaderboard!"
              : "No leaderboard data available"}
          </Text>
        ) : (
          leaderboard
            .slice(leaderboard.length >= 3 ? 3 : 0)
            .map((entry, index) => {
              const actualIndex = (leaderboard.length >= 3 ? 3 : 0) + index;
              const RankIcon = getRankIcon(
                entry.rank_position || actualIndex + 1,
              );
              const rankColor = getRankColor(
                entry.rank_position || actualIndex + 1,
              );
              const isCurrentPlayer = entry.player_id === playerId;

              return (
                <View
                  key={entry.player_id || index}
                  style={{ marginBottom: 8 }}
                >
                  <BlurView
                    intensity={isDark ? 40 : 60}
                    tint={isDark ? "dark" : "light"}
                    style={{
                      backgroundColor: isDark
                        ? "rgba(31, 41, 55, 0.6)"
                        : "rgba(255, 255, 255, 0.6)",
                      borderRadius: 8,
                      padding: 12,
                      borderWidth: isCurrentPlayer ? 2 : 1,
                      borderColor: isCurrentPlayer
                        ? colors.gameAccent1
                        : colors.border,
                      minHeight: 60,
                    }}
                  >
                    <View
                      style={{ flexDirection: "row", alignItems: "center" }}
                    >
                      {/* Rank Icon */}
                      <View
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 16,
                          backgroundColor: rankColor + "20",
                          justifyContent: "center",
                          alignItems: "center",
                          marginRight: 12,
                        }}
                      >
                        <RankIcon size={16} color={rankColor} />
                      </View>

                      {/* Player Info */}
                      <View style={{ flex: 1 }}>
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            marginBottom: 2,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 14,
                              fontWeight: isCurrentPlayer ? "700" : "600",
                              color: colors.text,
                              flex: 1,
                              fontFamily: isCurrentPlayer
                                ? "Inter_700Bold"
                                : "Inter_600SemiBold",
                            }}
                          >
                            {isCurrentPlayer && "👤 "}
                            {entry.profile_emoji || "🧩"} {entry.username}
                          </Text>

                          <Text
                            style={{
                              fontSize: 13,
                              fontWeight: "700",
                              color: colors.gameAccent1,
                              fontFamily: "Inter_700Bold",
                            }}
                          >
                            {formatScore(entry)}
                          </Text>
                        </View>

                        <View
                          style={{
                            flexDirection: "row",
                            justifyContent: "space-between",
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 11,
                              color: colors.textSecondary,
                              fontFamily: "Inter_400Regular",
                            }}
                          >
                            Rank #{entry.rank_position || actualIndex + 1}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </BlurView>
                </View>
              );
            })
        )}

        {leaderboard.length > 0 &&
          leaderboardType === "friends" &&
          friends.length === 0 && (
            <View style={{ marginTop: 20 }}>
              <Text
                style={{
                  textAlign: "center",
                  color: colors.textSecondary,
                  fontSize: 12,
                  fontFamily: "Inter_400Regular",
                }}
              >
                Add friends to see them on the leaderboard!
              </Text>
            </View>
          )}
      </ScrollView>
    </View>
  );
}
