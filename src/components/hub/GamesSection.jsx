// components/hub/GamesSection.jsx
import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useTheme } from "../../utils/theme";
import GameCard from "../GameCard";

export default function GamesSection({ games, isLoading, onRetry, playerId }) {
  const { colors } = useTheme();

  if (isLoading) {
    return (
      <View style={{ alignItems: "center", paddingVertical: 40, paddingHorizontal: 20 }}>
        <Text style={{ fontFamily: "Inter_500Medium", fontSize: 16, color: colors.textSecondary }}>
          Loading games...
        </Text>
      </View>
    );
  }

  if (!games || games.length === 0) {
    return (
      <View style={{ alignItems: "center", paddingVertical: 40, paddingHorizontal: 20 }}>
        <Text
          style={{
            fontFamily: "Inter_500Medium",
            fontSize: 16,
            color: colors.textSecondary,
            textAlign: "center",
            marginBottom: 8,
          }}
        >
          No games found. Check your connection and try again.
        </Text>
        <TouchableOpacity
          onPress={onRetry}
          style={{
            backgroundColor: colors.gameAccent1 + "20",
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: 8,
            marginTop: 8,
          }}
        >
          <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.gameAccent1 }}>
            Retry
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ marginTop: 8 }}>
      <Text
        style={{
          fontFamily: "Inter_500Medium",
          fontSize: 14,
          color: colors.textSecondary,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          paddingHorizontal: 20,
          marginBottom: 12,
        }}
      >
        All Games ({games.length})
      </Text>

      <View style={{ flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 20 }}>
        {games.map((game, index) => (
          <View
            key={game.id}
            style={{
              width: "47%",
              marginBottom: 16,
              marginRight: index % 2 === 0 ? "6%" : 0,
            }}
          >
            <GameCard game={{ ...game, is_unlocked: true }} playerId={playerId} />
          </View>
        ))}
      </View>
    </View>
  );
}
