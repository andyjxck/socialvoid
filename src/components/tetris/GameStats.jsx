import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { BlurView } from "expo-blur";
import { useTheme } from "../../utils/theme";

export default function GameStats({ score, lines, isPaused, onTogglePause }) {
  const { colors, isDark } = useTheme();

  return (
    <View
      style={{ marginHorizontal: 20, borderRadius: 12, overflow: "hidden" }}
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
          borderRadius: 12,
          paddingHorizontal: 12,
          paddingVertical: 6,
          height: 40, // Fixed height equivalent to one board square
        }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            flex: 1,
          }}
        >
          <View style={{ alignItems: "center", flex: 1 }}>
            <Text
              style={{
                fontFamily: "Inter_500Medium",
                fontSize: 8,
                color: colors.textSecondary,
                textTransform: "uppercase",
                letterSpacing: 0.3,
                marginBottom: 1,
              }}
            >
              Score
            </Text>
            <Text
              style={{
                fontFamily: "Inter_700Bold",
                fontSize: 12,
                color: colors.gameAccent2,
              }}
            >
              {score.toLocaleString()}
            </Text>
          </View>

          <View style={{ alignItems: "center", flex: 1 }}>
            <Text
              style={{
                fontFamily: "Inter_500Medium",
                fontSize: 8,
                color: colors.textSecondary,
                textTransform: "uppercase",
                letterSpacing: 0.3,
                marginBottom: 1,
              }}
            >
              Lines
            </Text>
            <Text
              style={{
                fontFamily: "Inter_700Bold",
                fontSize: 12,
                color: colors.text,
              }}
            >
              {lines}
            </Text>
          </View>

          <TouchableOpacity
            onPress={onTogglePause}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 8,
              backgroundColor: colors.gameAccent2 + "20",
              borderWidth: 1,
              borderColor: colors.gameAccent2,
            }}
          >
            <Text
              style={{
                fontFamily: "Inter_600SemiBold",
                fontSize: 9,
                color: colors.gameAccent2,
              }}
            >
              {isPaused ? "PLAY" : "PAUSE"}
            </Text>
          </TouchableOpacity>
        </View>
      </BlurView>
    </View>
  );
}
