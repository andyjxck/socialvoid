import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { BlurView } from "expo-blur";
import {
  UserPlus,
  MessageCircle,
  Hash,
  UserMinus,
  Trophy,
  Timer,
} from "lucide-react-native";
import { useTheme } from "../../utils/theme";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";

const formatPlaytime = (seconds) => {
  if (!seconds) return "0m";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

export default function PlayerCard({
  player,
  isFriend = false,
  onAddFriend,
  onRemoveFriend,
  onChat,
  isAddingFriend,
}) {
  const { colors, isDark } = useTheme();
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  if (!fontsLoaded) {
    return null;
  }

  // Prepare top games - always show 3 slots
  const topGames = player.topGames || [];
  const gameSlots = Array(3)
    .fill(null)
    .map((_, index) => topGames[index] || null);

  const getGameIcon = (index) => {
    switch (index) {
      case 0:
        return "🥇";
      case 1:
        return "🥈";
      case 2:
        return "🥉";
      default:
        return "🎮";
    }
  };

  const getGameColors = (index) => {
    switch (index) {
      case 0:
        return { bg: colors.gameAccent1 + "20", text: colors.gameAccent1 };
      case 1:
        return { bg: colors.gameAccent2 + "20", text: colors.gameAccent2 };
      case 2:
        return { bg: colors.gameAccent3 + "20", text: colors.gameAccent3 };
      default:
        return { bg: colors.glassSecondary, text: colors.textSecondary };
    }
  };

  return (
    <View style={{ marginBottom: 12 }}>
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
        {/* Header Section */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <Text style={{ fontSize: 24 }}>{player.profile_emoji || "🧩"}</Text>

          <View style={{ flex: 1 }}>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "700",
                  color: colors.text,
                  fontFamily: "Inter_700Bold",
                }}
              >
                {player.username}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Hash size={10} color={colors.textSecondary} />
                <Text
                  style={{
                    fontSize: 10,
                    color: colors.textSecondary,
                    fontFamily: "Inter_400Regular",
                  }}
                >
                  {player.user_id}
                </Text>
              </View>
            </View>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 16,
                marginTop: 8,
              }}
            >
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
              >
                <Trophy size={12} color={colors.gameAccent2} />
                <Text
                  style={{
                    fontSize: 12,
                    color: colors.gameAccent2,
                    fontFamily: "Inter_500Medium",
                  }}
                >
                  {player.total_points?.toLocaleString() || 0}
                </Text>
              </View>

              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
              >
                <Timer size={12} color={colors.textSecondary} />
                <Text
                  style={{
                    fontSize: 12,
                    color: colors.textSecondary,
                    fontFamily: "Inter_400Regular",
                  }}
                >
                  {formatPlaytime(player.total_playtime_seconds)}
                </Text>
              </View>
            </View>
          </View>

          <View style={{ alignItems: "flex-end", gap: 8 }}>
            {!isFriend ? (
              player.relationshipStatus === "friend" ? (
                <View
                  style={{
                    backgroundColor: colors.gameAccent1 + "20",
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 8,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 10,
                      color: colors.gameAccent1,
                      fontFamily: "Inter_600SemiBold",
                    }}
                  >
                    Friends
                  </Text>
                </View>
              ) : player.relationshipStatus === "pending" ? (
                <View
                  style={{
                    backgroundColor: colors.gameAccent3 + "20",
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 8,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 10,
                      color: colors.gameAccent3,
                      fontFamily: "Inter_600SemiBold",
                    }}
                  >
                    Pending
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={() => onAddFriend(player)}
                  disabled={isAddingFriend}
                  style={{
                    backgroundColor: colors.gameAccent1,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 8,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <UserPlus size={12} color="#FFFFFF" />
                  <Text
                    style={{
                      fontSize: 11,
                      color: "#FFFFFF",
                      fontFamily: "Inter_600SemiBold",
                    }}
                  >
                    Add Friend
                  </Text>
                </TouchableOpacity>
              )
            ) : (
              <View style={{ flexDirection: "row", gap: 6 }}>
                <TouchableOpacity
                  onPress={() => onChat(player)}
                  style={{
                    backgroundColor: colors.gameAccent2 + "20",
                    padding: 8,
                    borderRadius: 8,
                  }}
                >
                  <MessageCircle size={14} color={colors.gameAccent2} />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => onRemoveFriend(player.id, player.username)}
                  style={{
                    backgroundColor: colors.error + "20",
                    padding: 8,
                    borderRadius: 8,
                  }}
                >
                  <UserMinus size={14} color={colors.error} />
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {/* Top Games Pedestal Section - Always Show */}
        <View>
          <Text
            style={{
              fontSize: 13,
              fontWeight: "600",
              color: colors.text,
              marginBottom: 12,
              fontFamily: "Inter_600SemiBold",
              textAlign: "center",
            }}
          >
            🏆 Top Games
          </Text>

          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            {gameSlots.map((game, index) => {
              const gameColors = getGameColors(index);
              const gameIcon = getGameIcon(index);

              return (
                <View
                  key={index}
                  style={{
                    flex: 1,
                    alignItems: "center",
                  }}
                >
                  {/* Game Info */}
                  <View
                    style={{
                      backgroundColor: gameColors.bg,
                      borderRadius: 8,
                      padding: 8,
                      width: "100%",
                      minHeight: 60,
                      alignItems: "center",
                      justifyContent: "center",
                      borderWidth: 1,
                      borderColor: game
                        ? gameColors.text + "30"
                        : colors.border,
                    }}
                  >
                    <Text style={{ fontSize: 16, marginBottom: 4 }}>
                      {gameIcon}
                    </Text>

                    {game ? (
                      <>
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: "600",
                            color: colors.text,
                            textAlign: "center",
                            marginBottom: 2,
                            fontFamily: "Inter_600SemiBold",
                          }}
                          numberOfLines={1}
                        >
                          {game.game_name}
                        </Text>
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: "700",
                            color: gameColors.text,
                            fontFamily: "Inter_700Bold",
                          }}
                        >
                          {formatPlaytime(game.total_playtime_seconds)}
                        </Text>
                      </>
                    ) : (
                      <>
                        <Text
                          style={{
                            fontSize: 9,
                            color: colors.textSecondary,
                            textAlign: "center",
                            fontFamily: "Inter_400Regular",
                          }}
                        >
                          No game
                        </Text>
                        <Text
                          style={{
                            fontSize: 10,
                            color: colors.textSecondary,
                            fontFamily: "Inter_500Medium",
                          }}
                        >
                          0m
                        </Text>
                      </>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      </BlurView>
    </View>
  );
}
