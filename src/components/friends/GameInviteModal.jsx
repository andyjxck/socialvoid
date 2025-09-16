import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  Alert,
} from "react-native";
import { useTheme } from "../../utils/theme";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import {
  useFonts,
  Inter_400Regular,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";

export default function GameInviteModal({
  visible,
  onClose,
  friend,
  playerId,
}) {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  const { data: multiplayerGames = [] } = useQuery({
    queryKey: ["multiplayer-games"],
    queryFn: async () => {
      const response = await fetch("/api/games");
      if (!response.ok) return [];
      const games = await response.json();
      // Filter only games that support multiplayer
      return games.filter((game) => game.supports_multiplayer);
    },
  });

  const sendInvitationMutation = useMutation({
    mutationFn: async ({ friendId, gameId }) => {
      console.log("Sending invitation:", { friendId, gameId, playerId });

      const response = await fetch("/api/game-invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderId: playerId,
          receiverId: friendId,
          gameId,
          message: "Would you like to play a game?",
        }),
      });

      const responseData = await response.json();
      console.log("API response:", responseData);

      if (!response.ok) {
        throw new Error(
          responseData.error ||
            `HTTP ${response.status}: Failed to send invitation`,
        );
      }

      return responseData;
    },
    onSuccess: (data) => {
      console.log("Invitation sent successfully:", data);
      onClose();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Show success message that the invite was sent
      Alert.alert(
        "Invitation Sent!",
        `Game invitation sent to ${friend.username}. Entering game...`,
        [
          {
            text: "OK",
            onPress: () => {
              // Navigate the sender to the game immediately
              const gameType = data.session.gameType;
              router.push(
                `/(tabs)/games/${gameType}?sessionId=${data.session.id}&sessionCode=${data.session.sessionCode}&multiplayer=true`,
              );
            },
          },
        ],
      );

      // Refresh notifications and invitations
      queryClient.invalidateQueries(["notifications"]);
      queryClient.invalidateQueries(["game-invitations"]);
    },
    onError: (error) => {
      console.error("Invitation error:", error);
      Alert.alert("Error", error.message || "Failed to send invitation");
    },
  });

  const sendGameInvite = (gameId) => {
    sendInvitationMutation.mutate({ friendId: friend.id, gameId });
  };

  if (!fontsLoaded) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.5)",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <View
          style={{
            width: "80%",
            backgroundColor: colors.background,
            borderRadius: 20,
            padding: 20,
            maxHeight: "60%",
          }}
        >
          <Text
            style={{
              fontSize: 18,
              fontWeight: "700",
              color: colors.text,
              marginBottom: 8,
              textAlign: "center",
              fontFamily: "Inter_700Bold",
            }}
          >
            Invite {friend?.username} to Play
          </Text>

          <Text
            style={{
              fontSize: 12,
              color: colors.textSecondary,
              marginBottom: 16,
              textAlign: "center",
              fontFamily: "Inter_400Regular",
            }}
          >
            You'll enter the game immediately and wait for them to join
          </Text>

          {multiplayerGames.length === 0 ? (
            <Text
              style={{
                fontSize: 14,
                color: colors.textSecondary,
                textAlign: "center",
                marginVertical: 20,
                fontFamily: "Inter_400Regular",
              }}
            >
              No multiplayer games available yet.
            </Text>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              {multiplayerGames.map((game) => (
                <TouchableOpacity
                  key={game.id}
                  onPress={() => sendGameInvite(game.id)}
                  disabled={sendInvitationMutation.isLoading}
                  style={{
                    backgroundColor: colors.glassSecondary,
                    borderRadius: 12,
                    padding: 16,
                    marginBottom: 12,
                    borderWidth: 1,
                    borderColor: colors.border,
                    opacity: sendInvitationMutation.isLoading ? 0.5 : 1,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: "600",
                      color: colors.text,
                      fontFamily: "Inter_600SemiBold",
                    }}
                  >
                    {game.name}
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: colors.textSecondary,
                      marginTop: 4,
                      fontFamily: "Inter_400Regular",
                    }}
                  >
                    {sendInvitationMutation.isLoading
                      ? "Sending invite..."
                      : "Tap to invite and start playing"}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          <TouchableOpacity
            onPress={onClose}
            style={{
              backgroundColor: colors.glassSecondary,
              borderRadius: 12,
              paddingVertical: 12,
              paddingHorizontal: 20,
              marginTop: 16,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: "600",
                color: colors.text,
                fontFamily: "Inter_600SemiBold",
              }}
            >
              Cancel
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
