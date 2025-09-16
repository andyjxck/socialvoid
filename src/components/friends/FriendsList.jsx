import React from "react";
import { View, Text } from "react-native";
import PlayerCard from "./PlayerCard";
import { useTheme } from "../../utils/theme";
import { useFonts, Inter_400Regular } from "@expo-google-fonts/inter";

export default function FriendsList({
  friends,
  isLoading,
  onRemoveFriend,
  onChat,
}) {
  const { colors } = useTheme();
  const [fontsLoaded] = useFonts({ Inter_400Regular });

  if (!fontsLoaded) {
    return null;
  }

  if (isLoading) {
    return (
      <Text
        style={{
          textAlign: "center",
          color: colors.textSecondary,
          fontSize: 14,
          marginTop: 20,
          fontFamily: "Inter_400Regular",
        }}
      >
        Loading friends...
      </Text>
    );
  }

  if (friends.length === 0) {
    return (
      <Text
        style={{
          textAlign: "center",
          color: colors.textSecondary,
          fontSize: 14,
          marginTop: 20,
          fontFamily: "Inter_400Regular",
        }}
      >
        No friends yet. Use "Find Friends" to add some!
      </Text>
    );
  }

  return (
    <View>
      {friends.map((friend) => (
        <PlayerCard
          key={friend.id}
          player={friend}
          isFriend={true}
          onRemoveFriend={onRemoveFriend}
          onChat={onChat}
        />
      ))}
    </View>
  );
}
