import React from "react";
import { View, Text } from "react-native";
import RequestCard from "./RequestCard";
import { useTheme } from "../../utils/theme";
import { useFonts, Inter_400Regular } from "@expo-google-fonts/inter";

export default function FriendRequests({ requests, onRespond }) {
  const { colors } = useTheme();
  const [fontsLoaded] = useFonts({ Inter_400Regular });

  if (!fontsLoaded) {
    return null;
  }

  if (requests.length === 0) {
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
        No pending friend requests
      </Text>
    );
  }

  return (
    <View>
      {requests.map((request) => (
        <RequestCard
          key={request.id}
          request={request}
          onRespond={onRespond}
        />
      ))}
    </View>
  );
}
