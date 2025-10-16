// src/components/friends/FriendsTabs.jsx
import React from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { useTheme } from "../../utils/theme";
import { Users, Clock, Search } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useFonts, Inter_500Medium, Inter_600SemiBold } from "@expo-google-fonts/inter";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../utils/supabase";

export default function FriendsTabs({
  activeTab,
  setActiveTab,
  friendsCount,
  requestsCount,
  playerId,
}) {
  const { colors } = useTheme();
  const [fontsLoaded] = useFonts({ Inter_500Medium, Inter_600SemiBold });

  const shouldFetchCounts =
    !!playerId &&
    (typeof friendsCount !== "number" || typeof requestsCount !== "number");

  const { data: fetchedFriendsCount = 0 } = useQuery({
    queryKey: ["friends-count", playerId],
    enabled: shouldFetchCounts,
    queryFn: async () => {
      const pid = Number(playerId);
      if (!pid) return 0;
      const { count, error } = await supabase
        .from("friendships")
        .select("id", { count: "exact", head: true })
        .or(`player1_id.eq.${pid},player2_id.eq.${pid}`)
        .eq("status", "accepted");
      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 60_000,
  });

  const { data: fetchedRequestsCount = 0 } = useQuery({
    queryKey: ["requests-count", playerId],
    enabled: shouldFetchCounts,
    queryFn: async () => {
      const pid = Number(playerId);
      if (!pid) return 0;
      const { count, error } = await supabase
        .from("friend_requests")
        .select("id", { count: "exact", head: true })
        .eq("receiver_id", pid)
        .eq("status", "pending");
      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 60_000,
  });

  const friendsC =
    typeof friendsCount === "number" ? friendsCount : fetchedFriendsCount;
  const requestsC =
    typeof requestsCount === "number" ? requestsCount : fetchedRequestsCount;

  // Don’t show (0). Only show a badge/count when > 0.
  const friendsLabel = friendsC > 0 ? `Friends (${friendsC})` : "Friends";
  const requestsLabel = requestsC > 0 ? `Requests (${requestsC})` : "Requests";

  const tabs = [
    { id: "friends", label: friendsLabel, icon: Users },
    { id: "requests", label: requestsLabel, icon: Clock },
    { id: "search", label: "Find Friends", icon: Search },
  ];

  if (!fontsLoaded) return null;

  return (
    <View style={{ marginBottom: 16 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {tabs.map((tab) => {
            const IconComponent = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                onPress={() => {
                  setActiveTab(tab.id);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  borderRadius: 20,
                  backgroundColor: isActive
                    ? colors.gameAccent1 + "20"
                    : colors.glassSecondary,
                  borderWidth: isActive ? 1 : 0,
                  borderColor: colors.gameAccent1,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <IconComponent
                  size={14}
                  color={isActive ? colors.gameAccent1 : colors.textSecondary}
                />
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: isActive ? "600" : "500",
                    color: isActive ? colors.gameAccent1 : colors.text,
                    fontFamily: isActive ? "Inter_600SemiBold" : "Inter_500Medium",
                  }}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
