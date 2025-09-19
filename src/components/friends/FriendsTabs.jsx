import React from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { useTheme } from "../../utils/theme";
import { Users, Clock, Search } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useFonts, Inter_500Medium, Inter_600SemiBold } from "@expo-google-fonts/inter";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../utils/supabase";

/**
 * Props:
 * - activeTab: "friends" | "requests" | "search"
 * - setActiveTab: fn(tabId)
 * - friendsCount?: number (optional; if omitted and playerId provided, this component will self-fetch)
 * - requestsCount?: number (optional; if omitted and playerId provided, this component will self-fetch)
 * - playerId?: number (optional; enables self-fetch when counts are not provided)
 */
export default function FriendsTabs({
  activeTab,
  setActiveTab,
  friendsCount,
  requestsCount,
  playerId, // optional: if provided AND counts not passed, we self-fetch
}) {
  const { colors } = useTheme();
  const [fontsLoaded] = useFonts({
    Inter_500Medium,
    Inter_600SemiBold,
  });

  const shouldFetchCounts =
    !!playerId &&
    (typeof friendsCount !== "number" || typeof requestsCount !== "number");

  // Friends = count of accepted friendships where I'm either side
  const {
    data: fetchedFriendsCount = 0,
    isError: friendsErr,
  } = useQuery({
    queryKey: ["friends-count", playerId],
    enabled: shouldFetchCounts,
    queryFn: async () => {
      const pid = Number(playerId);
      if (!pid) return 0;

      // Supabase count-only query (no RPC)
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

  // Requests = count of incoming pending friend_requests for me
  const {
    data: fetchedRequestsCount = 0,
    isError: requestsErr,
  } = useQuery({
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

  // Prefer props if provided, otherwise use fetched counts
  const friendsC =
    typeof friendsCount === "number" ? friendsCount : fetchedFriendsCount;
  const requestsC =
    typeof requestsCount === "number" ? requestsCount : fetchedRequestsCount;

  const tabs = [
    { id: "friends", label: `Friends (${friendsC})`, icon: Users },
    { id: "requests", label: `Requests (${requestsC})`, icon: Clock },
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
