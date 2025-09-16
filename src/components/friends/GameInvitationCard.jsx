import React from "react";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import { useTheme } from "../../utils/theme";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Check, X, Gamepad2 } from "lucide-react-native";
import {
  useFonts,
  Inter_400Regular,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import { router } from "expo-router";

export default function GameInvitationCard({ invitation, playerId }) {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  const respondToInvitationMutation = useMutation({
    mutationFn: async ({ action }) => {
      const response = await fetch("/api/game-invitations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invitationId: invitation.id,
          action,
          playerId,
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to respond to invitation");
      }
      return response.json();
    },
    onSuccess: (data, variables) => {
      if (variables.action === "accept" && data.session) {
        // Navigate to the multiplayer game
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(
          "Game Starting!",
          `Your ${invitation.game_name} game is starting!`,
          [
            {
              text: "Play Now",
              onPress: () => {
                // Navigate to the specific game with multiplayer session
                router.push({
                  pathname: `/games/${invitation.game_type}`,
                  params: {
                    sessionId: data.session.id,
                    sessionCode: data.session.sessionCode,
                    multiplayer: "true",
                  },
                });
              },
            },
          ]
        );
      } else if (variables.action === "decline") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      
      // Refresh queries
      queryClient.invalidateQueries(["game-invitations"]);
      queryClient.invalidateQueries(["notifications"]);
    },
    onError: (error) => {
      Alert.alert("Error", error.message);
    },
  });

  const acceptInvitation = () => {
    respondToInvitationMutation.mutate({ action: "accept" });
  };

  const declineInvitation = () => {
    Alert.alert(
      "Decline Invitation",
      "Are you sure you want to decline this game invitation?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Decline",
          style: "destructive",
          onPress: () => {
            respondToInvitationMutation.mutate({ action: "decline" });
          },
        },
      ]
    );
  };

  if (!fontsLoaded) {
    return null;
  }

  return (
    <View
      style={{
        backgroundColor: colors.glassSecondary,
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <View
          style={{
            backgroundColor: colors.gameAccent1,
            borderRadius: 12,
            padding: 8,
            marginRight: 12,
          }}
        >
          <Gamepad2 size={20} color="#FFFFFF" />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 16,
              fontWeight: "700",
              color: colors.text,
              fontFamily: "Inter_700Bold",
            }}
          >
            Game Invitation
          </Text>
          <Text
            style={{
              fontSize: 12,
              color: colors.textSecondary,
              fontFamily: "Inter_400Regular",
            }}
          >
            {new Date(invitation.created_at).toLocaleDateString()} at{" "}
            {new Date(invitation.created_at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
        </View>
      </View>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <Text
          style={{
            fontSize: 20,
            marginRight: 8,
          }}
        >
          {invitation.sender_profile_emoji}
        </Text>
        <Text
          style={{
            fontSize: 14,
            color: colors.text,
            fontFamily: "Inter_400Regular",
          }}
        >
          <Text
            style={{
              fontWeight: "600",
              fontFamily: "Inter_600SemiBold",
            }}
          >
            {invitation.sender_username}
          </Text>{" "}
          invited you to play{" "}
          <Text
            style={{
              fontWeight: "600",
              color: colors.gameAccent1,
              fontFamily: "Inter_600SemiBold",
            }}
          >
            {invitation.game_name}
          </Text>
        </Text>
      </View>

      {invitation.message && (
        <Text
          style={{
            fontSize: 13,
            color: colors.textSecondary,
            fontStyle: "italic",
            marginBottom: 16,
            fontFamily: "Inter_400Regular",
          }}
        >
          "{invitation.message}"
        </Text>
      )}

      <View
        style={{
          flexDirection: "row",
          gap: 12,
        }}
      >
        <TouchableOpacity
          onPress={acceptInvitation}
          disabled={respondToInvitationMutation.isLoading}
          style={{
            flex: 1,
            backgroundColor: colors.gameAccent1,
            borderRadius: 12,
            paddingVertical: 12,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            opacity: respondToInvitationMutation.isLoading ? 0.5 : 1,
          }}
        >
          <Check size={16} color="#FFFFFF" />
          <Text
            style={{
              color: "#FFFFFF",
              fontSize: 14,
              fontWeight: "600",
              marginLeft: 8,
              fontFamily: "Inter_600SemiBold",
            }}
          >
            Accept
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={declineInvitation}
          disabled={respondToInvitationMutation.isLoading}
          style={{
            flex: 1,
            backgroundColor: colors.glassSecondary,
            borderRadius: 12,
            paddingVertical: 12,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: colors.border,
            opacity: respondToInvitationMutation.isLoading ? 0.5 : 1,
          }}
        >
          <X size={16} color={colors.text} />
          <Text
            style={{
              color: colors.text,
              fontSize: 14,
              fontWeight: "600",
              marginLeft: 8,
              fontFamily: "Inter_600SemiBold",
            }}
          >
            Decline
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}