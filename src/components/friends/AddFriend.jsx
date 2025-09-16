import React, { useState } from "react";
import { View, Text, TextInput } from "react-native";
import { useQuery } from "@tanstack/react-query";
import PlayerCard from "./PlayerCard";
import { useTheme } from "../../utils/theme";
import { Search } from "lucide-react-native";
import { useFonts, Inter_400Regular } from "@expo-google-fonts/inter";

export default function AddFriend({ playerId, onAddFriend, isAddingFriend }) {
  const { colors } = useTheme();
  const [searchQuery, setSearchQuery] = useState("");
  const [fontsLoaded] = useFonts({ Inter_400Regular });

  const { data: searchResults = [], isLoading: searchLoading } = useQuery({
    queryKey: ["player-search", searchQuery, playerId],
    queryFn: async () => {
      if (!searchQuery || searchQuery.length < 1) return [];
      const response = await fetch(
        `/api/players/search?q=${encodeURIComponent(
          searchQuery,
        )}&playerId=${playerId}`,
      );
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!searchQuery && searchQuery.length >= 1,
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <View>
      <View style={{ marginBottom: 16 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: colors.glassSecondary,
            borderRadius: 12,
            paddingHorizontal: 12,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Search size={16} color={colors.textSecondary} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search by username or user ID..."
            placeholderTextColor={colors.textSecondary}
            style={{
              flex: 1,
              paddingVertical: 12,
              paddingHorizontal: 8,
              color: colors.text,
              fontSize: 14,
              fontFamily: "Inter_400Regular",
            }}
          />
        </View>
      </View>

      {searchQuery.length < 1 ? (
        <Text
          style={{
            textAlign: "center",
            color: colors.textSecondary,
            fontSize: 14,
            marginTop: 20,
            fontFamily: "Inter_400Regular",
          }}
        >
          Enter a character to search for players
        </Text>
      ) : searchLoading ? (
        <Text
          style={{
            textAlign: "center",
            color: colors.textSecondary,
            fontSize: 14,
            marginTop: 20,
            fontFamily: "Inter_400Regular",
          }}
        >
          Searching...
        </Text>
      ) : searchResults.length === 0 ? (
        <Text
          style={{
            textAlign: "center",
            color: colors.textSecondary,
            fontSize: 14,
            marginTop: 20,
            fontFamily: "Inter_400Regular",
          }}
        >
          No players found matching "{searchQuery}"
        </Text>
      ) : (
        searchResults.map((player) => (
          <PlayerCard
            key={player.id}
            player={player}
            isFriend={false}
            onAddFriend={onAddFriend}
            isAddingFriend={isAddingFriend}
          />
        ))
      )}
    </View>
  );
}
