import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { BlurView } from "expo-blur";
import { MessageCircle, Hash } from "lucide-react-native";
import { useTheme } from "../../utils/theme";

export default function FriendCard({ friend, onChat, onInvite }) {
  const { colors, isDark } = useTheme();

  return (
    <View style={{ marginBottom: 8 }}>
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
          borderColor: colors.border,
          minHeight: 60,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <View
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 20, marginRight: 10 }}>
              {friend.profile_emoji || "🧩"}
            </Text>
            <View>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "600",
                  color: colors.text,
                  fontFamily: "Inter_600SemiBold",
                }}
              >
                {friend.username}
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginTop: 2,
                }}
              >
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
              {friend.total_points && (
                <Text
                  style={{
                    fontSize: 10,
                    color: colors.gameAccent2,
                    fontFamily: "Inter_500Medium",
                  }}
                >
                  {friend.total_points.toLocaleString()} points
                </Text>
              )}
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 6 }}>
            <TouchableOpacity
              onPress={() => onChat(friend)}
              style={{
                padding: 6,
                borderRadius: 8,
                backgroundColor: colors.gameAccent2 + "20",
              }}
            >
              <MessageCircle size={14} color={colors.gameAccent2} />
            </TouchableOpacity>
          </View>
        </View>
      </BlurView>
    </View>
  );
}
