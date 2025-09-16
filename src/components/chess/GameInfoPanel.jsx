import React from "react";
import { View, Text } from "react-native";
import { BlurView } from "expo-blur";
import { useTheme } from "../../utils/theme";

const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

const InfoItem = ({ label, value, valueColor }) => {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: "center" }}>
      <Text
        style={{
          fontFamily: "Inter_500Medium",
          fontSize: 12,
          color: colors.textSecondary,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginBottom: 4,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontFamily: "Inter_700Bold",
          fontSize: 16,
          color: valueColor || colors.gameAccent5,
          textTransform: "capitalize",
        }}
      >
        {value}
      </Text>
    </View>
  );
};

export function GameInfoPanel({
  currentPlayer,
  aiThinking,
  timer,
  inCheck,
  playerStats = {},
}) {
  const { colors, isDark } = useTheme();

  const getTurnText = () => {
    if (currentPlayer === "white") return "You ♔";
    return aiThinking ? "AI 🤔" : "AI ♚";
  };

  const getStatusText = () => {
    if (inCheck.white) return "You in Check!";
    if (inCheck.black) return "AI in Check!";
    return "Playing";
  };

  const getStatusColor = () => {
    if (inCheck.white) return "#EF4444";
    if (inCheck.black) return "#10B981";
    return colors.text;
  };

  const getSkillLevelText = (skillLevel) => {
    if (skillLevel === undefined) return "Adaptive";
    if (skillLevel < 0.3) return "Beginner";
    if (skillLevel < 0.5) return "Learning";
    if (skillLevel < 0.7) return "Intermediate";
    if (skillLevel < 0.9) return "Advanced";
    return "Expert";
  };

  return (
    <View
      style={{ borderRadius: 16, overflow: "hidden", marginHorizontal: 20 }}
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
            justifyContent: "space-around",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <InfoItem label="Turn" value={getTurnText()} />
          <InfoItem label="Time" value={formatTime(timer)} />
          <InfoItem
            label="Status"
            value={getStatusText()}
            valueColor={getStatusColor()}
          />
        </View>

        <View
          style={{
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
            gap: 16,
          }}
        >
          <Text
            style={{
              fontSize: 10,
              color: colors.textSecondary,
              fontFamily: "Inter_500Medium",
            }}
          >
            AI Level: {getSkillLevelText(playerStats.skillLevel)}
          </Text>

          {playerStats.wins !== undefined && (
            <>
              <Text
                style={{
                  fontSize: 10,
                  color: colors.gameAccent5,
                  fontFamily: "Inter_500Medium",
                }}
              >
                W: {playerStats.wins}
              </Text>
              <Text
                style={{
                  fontSize: 10,
                  color: colors.gameAccent1,
                  fontFamily: "Inter_500Medium",
                }}
              >
                L: {playerStats.losses}
              </Text>
            </>
          )}
        </View>

        <Text
          style={{
            fontSize: 10,
            color: colors.textSecondary,
            textAlign: "center",
            marginTop: 4,
            fontFamily: "Inter_400Regular",
          }}
        >
          {currentPlayer === "white"
            ? "Castling & pawn promotion available • Select pieces to see moves"
            : aiThinking
              ? "AI is calculating the perfect move..."
              : "AI will move shortly..."}
        </Text>
      </BlurView>
    </View>
  );
}
