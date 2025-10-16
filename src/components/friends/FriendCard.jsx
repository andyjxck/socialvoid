// src/components/friends/FriendCard.jsx
import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { BlurView } from "expo-blur";
import { MessageCircle, Hash } from "lucide-react-native";
import { useTheme } from "../../utils/theme";

export default function FriendCard({ friend, onChat, onInvite, isOnline = false, unreadCount = 0 }) {
  const { colors, isDark } = useTheme();

  return (
    <View style={{ marginBottom: 8 }}>
      <BlurView
        intensity={isDark ? 40 : 60}
        tint={isDark ? "dark" : "light"}
        style={{
          backgroundColor: isDark ? "rgba(31, 41, 55, 0.6)" : "rgba(255, 255, 255, 0.6)",
          borderRadius: 8,
          padding: 12,
          borderWidth: 1,
          borderColor: colors.border,
          minHeight: 60,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center" }}>
            <View style={{ marginRight: 10 }}>
              {/* avatar + online dot */}
              <View style={{ position: "relative", alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 20 }}>
                  {friend.profile_emoji || "🧩"}
                </Text>
                {isOnline ? (
                  <View
                    style={{
                      position: "absolute",
                      right: -2,
                      bottom: -2,
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: "#34D399", // green
                      borderWidth: 1,
                      borderColor: isDark ? "rgba(31,41,55,1)" : "#fff",
                    }}
                  />
                ) : null}
              </View>
            </View>

            <View>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "600",
                  color: colors.text,
                  fontFamily: "Inter_600SemiBold",
                }}
                numberOfLines={1}
              >
                {friend.username}
              </Text>

              {friend.user_id ? (
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
                  <Hash size={10} color={colors.textSecondary} />
                  <Text
                    style={{
                      fontSize: 10,
                      color: colors.textSecondary,
                      marginLeft: 2,
                      fontFamily: "Inter_400Regular",
                    }}
                  >
                    {friend.user_id}
                  </Text>
                </View>
              ) : null}

              {Number(friend.total_points) > 0 && (
                <Text
                  style={{
                    fontSize: 10,
                    color: colors.gameAccent2,
                    fontFamily: "Inter_500Medium",
                    marginTop: 2,
                  }}
                >
                  {Number(friend.total_points).toLocaleString()} points
                </Text>
              )}
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 6 }}>
            <View style={{ position: "relative" }}>
              <TouchableOpacity
                onPress={() => onChat?.(friend)}
                style={{ padding: 6, borderRadius: 8, backgroundColor: colors.gameAccent2 + "20" }}
              >
                <MessageCircle size={14} color={colors.gameAccent2} />
              </TouchableOpacity>

              {unreadCount > 0 ? (
                <View
                  style={{
                    position: "absolute",
                    top: -4,
                    right: -4,
                    backgroundColor: colors.gameAccent1,
                    borderRadius: 8,
                    minWidth: 16,
                    height: 16,
                    paddingHorizontal: 4,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ fontSize: 10, color: "#fff", fontFamily: "Inter_600SemiBold" }}>
                    {unreadCount > 9 ? "9+" : String(unreadCount)}
                  </Text>
                </View>
              ) : null}
            </View>

            {onInvite ? (
              <TouchableOpacity
                onPress={() => onInvite(friend)}
                style={{ padding: 6, borderRadius: 8, backgroundColor: colors.gameAccent1 + "20" }}
              >
                <Text style={{ fontSize: 11, color: colors.gameAccent1, fontFamily: "Inter_600SemiBold" }}>
                  Invite
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </BlurView>
    </View>
  );
}
