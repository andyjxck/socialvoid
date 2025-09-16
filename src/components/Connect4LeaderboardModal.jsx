import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
} from "react-native";
import { BlurView } from "expo-blur";
import { X, Trophy, Medal, Award, Calendar, Target } from "lucide-react-native";
import { useTheme } from "../utils/theme";

export const Connect4LeaderboardModal = ({ visible, onClose }) => {
  const { colors, isDark } = useTheme();
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState("all_time");

  const periods = [
    { id: "all_time", label: "All Time" },
    { id: "monthly", label: "This Month" },
    { id: "weekly", label: "This Week" },
    { id: "daily", label: "Today" },
  ];

  const fetchLeaderboard = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/leaderboards/connect4?period=${period}&limit=10`,
      );
      const data = await response.json();
      setLeaderboard(data.leaderboard || []);
    } catch (error) {
      console.error("Failed to fetch leaderboard:", error);
      setLeaderboard([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      fetchLeaderboard();
    }
  }, [visible, period]);

  const getRankIcon = (rank) => {
    if (rank === 1) return <Trophy size={20} color="#FFD700" />;
    if (rank === 2) return <Medal size={20} color="#C0C0C0" />;
    if (rank === 3) return <Award size={20} color="#CD7F32" />;
    return (
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 10,
          backgroundColor: colors.textSecondary,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          style={{
            fontSize: 12,
            fontWeight: "bold",
            color: "white",
          }}
        >
          {rank}
        </Text>
      </View>
    );
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          justifyContent: "center",
          alignItems: "center",
          padding: 20,
        }}
      >
        <View
          style={{
            width: "100%",
            maxWidth: 400,
            maxHeight: "80%",
            borderRadius: 20,
            overflow: "hidden",
          }}
        >
          <BlurView
            intensity={isDark ? 80 : 90}
            tint={isDark ? "dark" : "light"}
            style={{
              backgroundColor: isDark
                ? "rgba(31, 41, 55, 0.95)"
                : "rgba(255, 255, 255, 0.95)",
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 20,
            }}
          >
            {/* Header */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                padding: 20,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}
            >
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: "bold",
                  color: colors.text,
                }}
              >
                🔴 Connect 4 Leaderboard
              </Text>
              <TouchableOpacity
                onPress={onClose}
                style={{
                  padding: 8,
                  borderRadius: 12,
                  backgroundColor: colors.glassSecondary,
                }}
              >
                <X size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            {/* Period Filter */}
            <View style={{ padding: 20, paddingBottom: 10 }}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ flexDirection: "row" }}
              >
                {periods.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => setPeriod(p.id)}
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 8,
                      borderRadius: 16,
                      backgroundColor:
                        period === p.id
                          ? colors.gameAccent3
                          : colors.glassSecondary,
                      marginRight: 8,
                      borderWidth: 1,
                      borderColor:
                        period === p.id ? colors.gameAccent3 : colors.border,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "600",
                        color:
                          period === p.id ? "white" : colors.textSecondary,
                      }}
                    >
                      {p.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Leaderboard List */}
            <ScrollView
              style={{ maxHeight: 400 }}
              showsVerticalScrollIndicator={false}
            >
              {loading ? (
                <View
                  style={{
                    padding: 40,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <ActivityIndicator size="large" color={colors.gameAccent3} />
                  <Text
                    style={{
                      marginTop: 16,
                      fontSize: 14,
                      color: colors.textSecondary,
                    }}
                  >
                    Loading leaderboard...
                  </Text>
                </View>
              ) : leaderboard.length === 0 ? (
                <View
                  style={{
                    padding: 40,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Target size={40} color={colors.textSecondary} />
                  <Text
                    style={{
                      marginTop: 16,
                      fontSize: 16,
                      fontWeight: "600",
                      color: colors.text,
                      textAlign: "center",
                    }}
                  >
                    No games yet
                  </Text>
                  <Text
                    style={{
                      marginTop: 8,
                      fontSize: 14,
                      color: colors.textSecondary,
                      textAlign: "center",
                    }}
                  >
                    Play your first game to appear here!
                  </Text>
                </View>
              ) : (
                <View style={{ padding: 20, paddingTop: 0 }}>
                  {leaderboard.map((entry, index) => (
                    <View
                      key={entry.playerId}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingVertical: 12,
                        paddingHorizontal: 16,
                        marginBottom: 8,
                        borderRadius: 16,
                        backgroundColor: colors.glassSecondary,
                        borderWidth: 0.5,
                        borderColor: colors.border,
                      }}
                    >
                      {/* Rank */}
                      <View style={{ marginRight: 16 }}>
                        {getRankIcon(entry.rank)}
                      </View>

                      {/* Player Info */}
                      <View style={{ flex: 1 }}>
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            marginBottom: 4,
                          }}
                        >
                          <Text style={{ fontSize: 18, marginRight: 8 }}>
                            {entry.profileEmoji}
                          </Text>
                          <Text
                            style={{
                              fontSize: 16,
                              fontWeight: "600",
                              color: colors.text,
                              flex: 1,
                            }}
                          >
                            {entry.username}
                          </Text>
                        </View>
                        <Text
                          style={{
                            fontSize: 12,
                            color: colors.textSecondary,
                          }}
                        >
                          {entry.totalGames} game{entry.totalGames !== 1 ? 's' : ''} played
                        </Text>
                      </View>

                      {/* Stats */}
                      <View style={{ alignItems: "flex-end" }}>
                        <Text
                          style={{
                            fontSize: 18,
                            fontWeight: "bold",
                            color: colors.gameAccent3,
                          }}
                        >
                          {entry.wins}
                        </Text>
                        <Text
                          style={{
                            fontSize: 12,
                            color: colors.textSecondary,
                          }}
                        >
                          wins
                        </Text>
                        <Text
                          style={{
                            fontSize: 11,
                            color: "#8B5CF6",
                            fontWeight: "600",
                            marginTop: 2,
                          }}
                        >
                          {entry.winPercentage}%
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
          </BlurView>
        </View>
      </View>
    </Modal>
  );
};