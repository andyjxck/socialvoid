// src/components/friends/RequestCard.jsx
import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { BlurView } from "expo-blur";
import { Check, X } from "lucide-react-native";
import { useTheme } from "../../utils/theme";
import { useFonts, Inter_400Regular, Inter_600SemiBold } from "@expo-google-fonts/inter";

export default function RequestCard({ request, onRespond }) {
  const { colors, isDark } = useTheme();
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_600SemiBold });
  if (!fontsLoaded) return null;

  // be defensive: support multiple shapes
  const senderUsername =
    request?.sender?.username ??
    request?.sender_username ??
    request?.username ??
    (request?.sender_id ? `Player ${request.sender_id}` : "Player");
  const senderEmoji =
    request?.sender?.profile_emoji ??
    request?.sender_profile_emoji ??
    request?.profile_emoji ??
    "🧩";
  const message = request?.message || "Wants to be friends";

  const handleAccept = () => onRespond?.(request.id, "accept");   // hook expects "accept"
  const handleDecline = () => onRespond?.(request.id, "decline"); // hook expects "decline"

  return (
    <View style={{ marginBottom: 8 }}>
      <BlurView
        intensity={isDark ? 40 : 60}
        tint={isDark ? "dark" : "light"}
        style={{
          backgroundColor: isDark ? "rgba(31, 41, 55, 0.6)" : "rgba(255, 255, 255, 0.6)",
          borderRadius: 8,
          padding: 12,
          borderWidth: 1,
          borderColor: colors.gameAccent3 + "40",
          minHeight: 60,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center" }}>
            <Text style={{ fontSize: 20, marginRight: 10 }}>{senderEmoji}</Text>
            <View>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "600",
                  color: colors.text,
                  fontFamily: "Inter_600SemiBold",
                }}
                numberOfLines={1}
              >
                {senderUsername}
              </Text>
              <Text
                style={{
                  fontSize: 11,
                  color: colors.textSecondary,
                  fontFamily: "Inter_400Regular",
                }}
                numberOfLines={2}
              >
                {message}
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 6 }}>
            <TouchableOpacity
              onPress={handleAccept}
              style={{ padding: 6, borderRadius: 8, backgroundColor: colors.gameAccent1 + "20" }}
            >
              <Check size={14} color={colors.gameAccent1} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleDecline}
              style={{ padding: 6, borderRadius: 8, backgroundColor: colors.error + "20" }}
            >
              <X size={14} color={colors.error} />
            </TouchableOpacity>
          </View>
        </View>
      </BlurView>
    </View>
  );
}
