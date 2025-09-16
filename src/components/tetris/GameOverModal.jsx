import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { BlurView } from "expo-blur";
import { useTheme } from "../../utils/theme";
import { router } from "expo-router";

export default function GameOverModal({ score, lines, onPlayAgain }) {
  const { colors, isDark } = useTheme();

  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.7)",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <View style={{ borderRadius: 20, overflow: "hidden", margin: 20 }}>
        <BlurView
          intensity={isDark ? 80 : 100}
          tint={isDark ? "dark" : "light"}
          style={{
            backgroundColor: isDark
              ? "rgba(31, 41, 55, 0.9)"
              : "rgba(255, 255, 255, 0.9)",
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 20,
            padding: 32,
            alignItems: "center",
          }}
        >
          <Text
            style={{
              fontFamily: "Inter_700Bold",
              fontSize: 24,
              color: colors.text,
              textAlign: "center",
              marginBottom: 8,
            }}
          >
            Game Over
          </Text>

          <Text
            style={{
              fontFamily: "Inter_600SemiBold",
              fontSize: 18,
              color: colors.gameAccent2,
              marginBottom: 8,
            }}
          >
            Score: {score.toLocaleString()}
          </Text>

          <Text
            style={{
              fontFamily: "Inter_500Medium",
              fontSize: 14,
              color: colors.textSecondary,
              marginBottom: 20,
            }}
          >
            Lines: {lines}
          </Text>

          <View style={{ flexDirection: "row", gap: 12 }}>
            <TouchableOpacity
              onPress={onPlayAgain}
              style={{
                backgroundColor: colors.secondaryButton,
                paddingHorizontal: 20,
                paddingVertical: 12,
                borderRadius: 12,
              }}
            >
              <Text
                style={{
                  fontFamily: "Inter_600SemiBold",
                  fontSize: 14,
                  color: colors.secondaryButtonText,
                }}
              >
                Play Again
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.back()}
              style={{
                backgroundColor: colors.primaryButton,
                paddingHorizontal: 20,
                paddingVertical: 12,
                borderRadius: 12,
              }}
            >
              <Text
                style={{
                  fontFamily: "Inter_600SemiBold",
                  fontSize: 14,
                  color: colors.primaryButtonText,
                }}
              >
                Back to Hub
              </Text>
            </TouchableOpacity>
          </View>
        </BlurView>
      </View>
    </View>
  );
}
