import React from "react";
import { View, Text } from "react-native";
import PlayerCard from "./PlayerCard";
import { useTheme } from "../../utils/theme";
import { useFonts, Inter_400Regular } from "@expo-google-fonts/inter";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../utils/supabase";

/**
 * Props:
 * - friends: optional array [{ id, username, profile_emoji, ... }]
 * - isLoading: optional boolean
 * - onRemoveFriend: fn
 * - onChat: fn
 * - playerId: optional number -> if provided AND no friends passed, this component will self-fetch friends
 */
export default function FriendsList({
  friends,
  isLoading,
  onRemoveFriend,
  onChat,
  playerId, // optional: enables self-fetch
}) {
  const { colors } = useTheme();
  const [fontsLoaded] = useFonts({ Inter_400Regular });

  const shouldSelfFetch = !!playerId && (!friends || friends.length === 0);

  // Self-fetch: 1) get friendships where I'm either side and accepted
  //             2) map to the "other" player id
  //             3) load those players
  const {
    data: fetchedFriends = [],
    isLoading: loadingFriends,
    error,
  } = useQuery({
    queryKey: ["friends-list", playerId],
    enabled: shouldSelfFetch,
    queryFn: async () => {
      const pid = Number(playerId);
      if (!pid) return [];

      // 1) accepted friendships where I'm player1 or player2
      const { data: fships, error: fErr } = await supabase
        .from("friendships")
        .select("player1_id, player2_id, status")
        .or(`player1_id.eq.${pid},player2_id.eq.${pid}`)
        .eq("status", "accepted");

      if (fErr) throw fErr;

      // 2) other player ids
      const otherIds = (fships || [])
        .map((f) => (f.player1_id === pid ? f.player2_id : f.player1_id))
        .filter((x) => typeof x === "number" && x !== pid);

      if (otherIds.length === 0) return [];

      // 3) load players
      const { data: players, error: pErr } = await supabase
        .from("players")
        .select("id, username, profile_emoji")
        .in("id", otherIds)
        .order("username", { ascending: true });

      if (pErr) throw pErr;

      return players || [];
    },
  });

  const list = shouldSelfFetch ? fetchedFriends : (friends || []);
  const loading =
    typeof isLoading === "boolean"
      ? isLoading
      : shouldSelfFetch
      ? loadingFriends
      : false;

  if (!fontsLoaded) return null;

  if (loading) {
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

  if (error) {
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
        Couldn't load friends.
      </Text>
    );
  }

  if (!list || list.length === 0) {
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
      {list.map((friend) => (
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
