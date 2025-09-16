import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { User, LogIn, Menu } from "lucide-react-native";
import { useTheme } from "../../utils/theme";
import playtimeTracker from "../../utils/playtimeTracker";

export default function HubHeader({ player, hasAccount, onAccountPress, onSidebarPress }) {
  const { colors } = useTheme();

  const playerLevel = player
    ? Math.floor((player.total_playtime_seconds || 0) / 60 / 5) + 1
    : 1;

  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
        paddingHorizontal: 20,
        paddingTop: 65,
        paddingBottom: 24,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontFamily: "Inter_700Bold",
            fontSize: 28,
            color: colors.text,
            marginBottom: 8,
          }}
        >
          Game Void
        </Text>
        {player && (
          <View>
            <Text
              style={{
                fontFamily: "Inter_700Bold",
                fontSize: 18,
                color: colors.gameAccent1,
              }}
            >
              Level {playerLevel}
            </Text>
            <Text
              style={{
                fontFamily: "Inter_600SemiBold",
                fontSize: 14,
                color: colors.gameAccent2,
              }}
            >
              {playtimeTracker.getPlayerTitle(playerLevel)}
            </Text>
            <Text
              style={{
                fontFamily: "Inter_500Medium",
                fontSize: 12,
                color: colors.textSecondary,
                marginTop: 2,
              }}
            >
              {playtimeTracker.formatPlaytime(player.total_playtime_seconds || 0)} played
            </Text>
          </View>
        )}
      </View>

      <View style={{ flexDirection: "row", gap: 8 }}>
        <TouchableOpacity
          onPress={onAccountPress}
          style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: colors.gameAccent1 + "20",
            justifyContent: "center",
            alignItems: "center",
            borderWidth: 2,
            borderColor: colors.gameAccent1 + "40",
          }}
        >
          {player?.profile_emoji ? (
            <Text style={{ fontSize: 20 }}>{player.profile_emoji}</Text>
          ) : hasAccount ? (
            <User size={24} color={colors.gameAccent1} />
          ) : (
            <LogIn size={20} color={colors.text} />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onSidebarPress}
          style={{
            padding: 8,
            borderRadius: 12,
            backgroundColor: colors.glassSecondary,
          }}
        >
          <Menu size={24} color={colors.text} />
        </TouchableOpacity>
      </View>
    </View>
  );
}
