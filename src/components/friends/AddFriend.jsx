import React, { useState } from "react";
import { View, Text, TextInput } from "react-native";
import { useQuery } from "@tanstack/react-query";
import PlayerCard from "./PlayerCard";
import { useTheme } from "../../utils/theme";
import { Search } from "lucide-react-native";
import { useFonts, Inter_400Regular } from "@expo-google-fonts/inter";
import { supabase } from "../../utils/supabase";

export default function AddFriend({ playerId, onAddFriend, isAddingFriend }) {
  const { colors } = useTheme();
  const [searchQuery, setSearchQuery] = useState("");
  const [fontsLoaded] = useFonts({ Inter_400Regular });

  const pid = Number(playerId) || 0;

  // 👥 load my friends (accepted)
  const { data: friends = [] } = useQuery({
    queryKey: ["friends-ids", pid],
    enabled: !!pid,
    queryFn: async () => {
      // accepted friendships where I'm either side
      const { data: fships, error } = await supabase
        .from("friendships")
        .select("player1_id, player2_id, status")
        .or(`player1_id.eq.${pid},player2_id.eq.${pid}`)
        .eq("status", "accepted");

      if (error) throw error;

      const ids =
        fships?.map((f) => (f.player1_id === pid ? f.player2_id : f.player1_id)) || [];
      return ids.map((n) => Number(n)).filter((n) => Number.isFinite(n));
    },
  });

  // 📨 load pending requests (either direction)
  const { data: pendingWith = [] } = useQuery({
    queryKey: ["friend-pending-ids", pid],
    enabled: !!pid,
    queryFn: async () => {
      // pending requests where I'm sender or receiver
      const { data: reqs, error } = await supabase
        .from("friend_requests")
        .select("sender_id, receiver_id, status")
        .or(`sender_id.eq.${pid},receiver_id.eq.${pid}`)
        .eq("status", "pending");

      if (error) throw error;

      const ids =
        reqs?.map((r) => (r.sender_id === pid ? r.receiver_id : r.sender_id)) || [];
      return ids.map((n) => Number(n)).filter((n) => Number.isFinite(n));
    },
  });

  // 🔎 search players (username ilike OR numeric id), exclude me
  const { data: searchResults = [], isLoading: searchLoading } = useQuery({
    queryKey: ["player-search", searchQuery, pid],
    enabled: !!searchQuery && searchQuery.trim().length >= 1,
    queryFn: async () => {
      const q = searchQuery.trim();
      let query = supabase
        .from("players")
        .select("id, username, profile_emoji")
        .neq("id", pid)
        .order("username", { ascending: true })
        .limit(25);

      const numericId = /^\d+$/.test(q) ? Number(q) : null;

      if (numericId !== null) {
        // match by id OR username contains q
        // NOTE: .or() uses comma-separated conditions
        query = query.or(`id.eq.${numericId},username.ilike.*${q}*`);
      } else {
        query = query.ilike("username", `%${q}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  if (!fontsLoaded) return null;

  // helper: already friend or pending -> disable add
  const isBlocked = (id) => {
    const n = Number(id);
    return friends.includes(n) || pendingWith.includes(n);
  };

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

      {(!searchQuery || searchQuery.trim().length < 1) ? (
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
            isFriend={isBlocked(player.id)}          // block add if friend or pending
            onAddFriend={onAddFriend}
            isAddingFriend={isAddingFriend}
          />
        ))
      )}
    </View>
  );
}
