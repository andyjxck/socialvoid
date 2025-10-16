// mobile/src/components/friends/AddFriend.jsx
import React, { useState, useMemo } from "react";
import { View, Text, TextInput } from "react-native";
import { useQuery } from "@tanstack/react-query";
import PlayerCard from "./PlayerCard";
import { useTheme } from "../../utils/theme";
import { Search } from "lucide-react-native";
import { useFonts, Inter_400Regular } from "@expo-google-fonts/inter";
import { supabase } from "../../utils/supabase";

/**
 * Props:
 *  - playerId (INTEGER, players.id for the signed-in user)
 *  - onAddFriend(number user_id)
 *  - isAddingFriend (boolean)
 *
 * Search returns ONLY user_id (plus display fields). Friend/pending checks use user_id.
 */
export default function AddFriend({ playerId, onAddFriend, isAddingFriend }) {
  const { colors } = useTheme();
  const [searchQuery, setSearchQuery] = useState("");
  const [fontsLoaded] = useFonts({ Inter_400Regular });

  const pid = useMemo(() => {
    if (typeof playerId === "number") return playerId;
    if (typeof playerId === "string" && /^\d+$/.test(playerId)) return Number(playerId);
    return 0;
  }, [playerId]);

  // My user_id for self-checks
  const { data: meUserId = 0 } = useQuery({
    queryKey: ["me-user_id-from-pid", pid || "none"],
    enabled: !!pid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("players")
        .select("user_id")
        .eq("id", pid)
        .maybeSingle();
      if (error) throw error;
      return Number(data?.user_id) || 0;
    },
    staleTime: 60_000,
  });

  // Accepted friendship player-ids where I'm involved
  const { data: friendPlayerIds = [] } = useQuery({
    queryKey: ["friends-accepted-player-ids", pid || "none"],
    enabled: !!pid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("friendships")
        .select("player1_id, player2_id, status")
        .or(`player1_id.eq.${pid},player2_id.eq.${pid}`)
        .eq("status", "accepted");
      if (error) throw error;
      const ids =
        (data || []).map((f) =>
          Number(f.player1_id) === pid ? Number(f.player2_id) : Number(f.player1_id)
        ) || [];
      return ids.filter((n) => Number.isFinite(n) && n > 0);
    },
    staleTime: 10_000,
  });

  // Map those player ids → user_ids
  const { data: friendUserIdSet = new Set() } = useQuery({
    queryKey: ["friends-accepted-user-ids", (friendPlayerIds || []).slice().sort()],
    enabled: (friendPlayerIds || []).length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("players")
        .select("id, user_id")
        .in("id", friendPlayerIds);
      if (error) throw error;
      return new Set(
        (data || [])
          .map((r) => Number(r.user_id))
          .filter((n) => Number.isFinite(n) && n > 0)
      );
    },
    staleTime: 10_000,
  });

  // Pending requests either way (by player ids)
  const { data: pendingLinks = [] } = useQuery({
    queryKey: ["friend-requests-pending-links", pid || "none"],
    enabled: !!pid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("friend_requests")
        .select("sender_id, receiver_id, status")
        .or(`sender_id.eq.${pid},receiver_id.eq.${pid}`)
        .eq("status", "pending");
      if (error) throw error;
      return data || [];
    },
    staleTime: 5_000,
  });

  // Map pending player ids → user_id sets
  const {
    data: pendingUserIdSets = { incoming: new Set(), outgoing: new Set() },
  } = useQuery({
    queryKey: ["friend-requests-pending-user-ids", (pendingLinks || []).map((r) => `${r.sender_id}-${r.receiver_id}`)],
    enabled: (pendingLinks || []).length > 0,
    queryFn: async () => {
      const incomingPids = [];
      const outgoingPids = [];
      for (const r of pendingLinks) {
        const s = Number(r.sender_id);
        const rc = Number(r.receiver_id);
        if (rc === pid) incomingPids.push(s);
        else if (s === pid) outgoingPids.push(rc);
      }
      const uniq = Array.from(new Set([...incomingPids, ...outgoingPids])).filter((n) =>
        Number.isFinite(n)
      );
      if (uniq.length === 0) return { incoming: new Set(), outgoing: new Set() };

      const { data, error } = await supabase
        .from("players")
        .select("id, user_id")
        .in("id", uniq);
      if (error) throw error;

      const byPid = new Map((data || []).map((r) => [Number(r.id), Number(r.user_id)]));
      const incomingSet = new Set(incomingPids.map((id) => byPid.get(id)).filter((n) => Number.isFinite(n)));
      const outgoingSet = new Set(outgoingPids.map((id) => byPid.get(id)).filter((n) => Number.isFinite(n)));
      return { incoming: incomingSet, outgoing: outgoingSet };
    },
    staleTime: 5_000,
  });

  // SEARCH: return ONLY user_id + display fields
  const {
    data: searchResults = [],
    isLoading: searchLoading,
  } = useQuery({
    queryKey: ["player-search-user-only", (searchQuery || "").trim(), pid || "none"],
    enabled: !!searchQuery && searchQuery.trim().length >= 1,
    queryFn: async () => {
      const q = searchQuery.trim();
      let query = supabase
        .from("players")
        .select("user_id, username, profile_emoji")
        .neq("id", pid)
        .order("username", { ascending: true })
        .limit(25);

      const numeric = /^\d+$/.test(q) ? Number(q) : null;
      if (numeric !== null) {
        query = query.or(`user_id.eq.${numeric},username.ilike.*${q}*`);
      } else {
        query = query.ilike("username", `%${q}%`);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data || []).map((p) => ({
        user_id: Number(p.user_id) || 0,
        username: p.username || null,
        profile_emoji: p.profile_emoji || null,
      }));
    },
  });

  if (!fontsLoaded) return null;

  const flags = (targetUserId) => {
    const t = Number(targetUserId);
    const isSelf = Number.isFinite(meUserId) && t === meUserId;
    const isFriendAccepted = friendUserIdSet.has(t);
    const isPendingIncoming = pendingUserIdSets.incoming.has(t);
    const isPendingOutgoing = pendingUserIdSets.outgoing.has(t);
    const disableAdd = isSelf || isFriendAccepted;
    return { isFriendAccepted, isPendingIncoming, isPendingOutgoing, disableAdd };
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

      {!searchQuery || searchQuery.trim().length < 1 ? (
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
        searchResults.map((p) => {
          const { isFriendAccepted, isPendingIncoming, isPendingOutgoing, disableAdd } =
            flags(p.user_id);

          return (
            <PlayerCard
              key={p.user_id}
              player={p} // { user_id, username?, profile_emoji? }
              isFriend={isFriendAccepted}
              isPending={isPendingIncoming || isPendingOutgoing}
              isPendingIncoming={isPendingIncoming}
              isPendingOutgoing={isPendingOutgoing}
              disableAdd={disableAdd}
              onAddFriend={onAddFriend}          // expects user_id number
              isAddingFriend={isAddingFriend}
            />
          );
        })
      )}
    </View>
  );
}
