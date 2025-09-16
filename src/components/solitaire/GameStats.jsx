import React from "react";
import { View, Text } from "react-native";
import { BlurView } from "expo-blur";
import { useTheme } from "../../utils/theme";

export const GameStats = ({ score, moves, stockCount, stockCycles }) => {
  const { colors, isDark } = useTheme();

  // Warning colors for stock cycles
  const getCycleColor = () => {
    if (stockCycles >= 4) return "#dc2626"; // Red for 4-5 cycles
    if (stockCycles >= 3) return "#f59e0b"; // Amber for 3 cycles
    return colors.text; // Default color
  };

  return (
    <View
      style={{
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
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <View style={{ alignItems: "center" }}>
            <Text
              style={{
                fontSize: 12,
                color: colors.textSecondary,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginBottom: 4,
              }}
            >
              Score
            </Text>
            <Text
              style={{
                fontSize: 18,
                fontWeight: "bold",
                color: colors.gameAccent3,
              }}
            >
              {score}
            </Text>
          </View>
          <View style={{ alignItems: "center" }}>
            <Text
              style={{
                fontSize: 12,
                color: colors.textSecondary,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginBottom: 4,
              }}
            >
              Moves
            </Text>
            <Text
              style={{
                fontSize: 18,
                fontWeight: "bold",
                color: colors.text,
              }}
            >
              {moves}
            </Text>
          </View>
          <View style={{ alignItems: "center" }}>
            <Text
              style={{
                fontSize: 12,
                color: colors.textSecondary,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginBottom: 4,
              }}
            >
              Stock
            </Text>
            <Text
              style={{
                fontSize: 18,
                fontWeight: "bold",
                color: colors.text,
              }}
            >
              {stockCount}
            </Text>
          </View>
          <View style={{ alignItems: "center" }}>
            <Text
              style={{
                fontSize: 12,
                color:
                  stockCycles >= 3 ? getCycleColor() : colors.textSecondary,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginBottom: 4,
                fontWeight: stockCycles >= 3 ? "bold" : "normal",
              }}
            >
              Cycles
            </Text>
            <Text
              style={{
                fontSize: 18,
                fontWeight: "bold",
                color: getCycleColor(),
              }}
            >
              {stockCycles}/5
            </Text>
          </View>
        </View>
      </BlurView>
    </View>
  );
};
