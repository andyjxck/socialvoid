import React from "react";
import { View, Text } from "react-native";
import { BlurView } from "expo-blur";
import { useTheme } from "../../utils/theme";

export const Instructions = () => {
  const { colors, isDark } = useTheme();

  return (
    <View
      style={{
        marginHorizontal: 20,
        borderRadius: 16,
        overflow: "hidden",
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
        <Text
          style={{
            color: colors.text,
            fontSize: 13,
            textAlign: "center",
            lineHeight: 18,
            fontWeight: "500",
          }}
        >
          🎯 Tap to select, tap destination to move{"\n"}🃏 Tap stock to
          draw cards{"\n"}
          🏗️ Build down alternating colors, up by suit
        </Text>
      </BlurView>
    </View>
  );
};
