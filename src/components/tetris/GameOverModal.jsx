// components/tetris/GameOverModal.jsx  (REPLACE ENTIRE FILE)
import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { BlurView } from "expo-blur";
import { useTheme } from "../../utils/theme";
import { router } from "expo-router";

export default function GameOverModal({
  score = 0,
  lines = 0,
  onPlayAgain,          // preferred
  onRestart,            // alias
  onReplay,             // alias
}) {
  const { colors, isDark } = useTheme();

  // Pick the first available handler
  const handlePlayAgain =
    onPlayAgain || onRestart || onReplay || (() => {});

  return (
    <View
      // Fullscreen overlay above the game
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
      pointerEvents="auto"
    >
      <View
        style={{ borderRadius: 20, overflow: "hidden", margin: 20 }}
        // Ensure this view starts a responder chain so touches don't get eaten
        onStartShouldSetResponder={() => true}
      >
        <BlurView
          intensity={isDark ? 80 : 100}
          tint={isDark ? "dark" : "light"}
          pointerEvents="auto"
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
            Score: {Number(score || 0).toLocaleString()}
          </Text>

          <Text
            style={{
              fontFamily: "Inter_500Medium",
              fontSize: 14,
              color: colors.textSecondary,
              marginBottom: 20,
            }}
          >
            Lines: {lines ?? 0}
          </Text>

          <View style={{ flexDirection: "row", gap: 12 }}>
            <TouchableOpacity
              onPress={() => {
                // surface in logs so we know tap is received
                try { console.log("▶️ Play Again pressed"); } catch {}
                try { handlePlayAgain(); } catch (e) { try { console.warn(e); } catch {} }
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
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
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
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
