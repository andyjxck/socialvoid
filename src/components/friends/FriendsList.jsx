// src/components/friends/FriendsList.jsx
import React, { useMemo, useCallback, useEffect, useState } from "react";
import { View, Text, ActivityIndicator, StyleSheet, Modal } from "react-native";
import PlayerCard from "./PlayerCard";
import { useTheme } from "../../utils/theme";
import { useFonts, Inter_400Regular } from "@expo-google-fonts/inter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../utils/supabase";

const ONLINE_WINDOW_MS = 2 * 60 * 1000; // 2 minutes

export default function FriendsList({
  friends,
  isLoading,
  onRemoveFriend,
  onChat,
  playerId, // me (players.id)
  onVisibleCountChange,
}) {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const [fontsLoaded] = useFonts({ Inter_400Regular });

  const [showGlobalSpinner, setShowGlobalSpinner] = useState(false);

  const provided = Array.isArray(friends) && friends.length > 0;
  const shouldSelfFetch = !!playerId && !provided;

  // 1) Self-fetch accepted friends (players rows incl. last_seen)
  const {
    data: fetchedFriends = [],
    isLoading: loadingFriends,
    error: fetchError,
  } = useQuery({
    queryKey: ["friends:self", playerId],
    enabled: shouldSelfFetch,
    refetchInterval: 15000,
    queryFn: async () => {
      const pid = Number(playerId);
      if (!pid) return [];

      const { data: links, error: fErr } = await supabase
        .from("friendships")
        .select("player1_id, player2_id, status")
        .or(`player1_id.eq.${pid},player2_id.eq.${pid}`)
        .eq("status", "accepted");
      if (fErr) throw fErr;

      const otherIds = (links || [])
        .map((f) =>
          Number(f.player1_id) === pid ? Number(f.player2_id) : Number(f.player1_id)
        )
        .filter((x) => Number.isFinite(x) && x !== pid);

      if (otherIds.length === 0) return [];

      const { data: players, error: pErr } = await supabase
        .from("players")
        .select("id, user_id, username, profile_emoji, total_points, last_seen")
        .in("id", otherIds)
        .order("username", { ascending: true });
      if (pErr) throw pErr;

      return players || [];
    },
  });

  // 2) Normalize provided friends (they might be { profile })
  const baseList = useMemo(() => {
    if (provided) {
      return friends.map((row) => {
        const p = row?.profile ? row.profile : row;
        return {
          id: Number(p.id),
          user_id: Number(p.user_id),
          username: p.username,
          profile_emoji: p.profile_emoji,
          total_points: p.total_points,
          last_seen: p.last_seen ?? null,
        };
      });
    }
    return (fetchedFriends || []).map((p) => ({
      id: Number(p.id),
      user_id: Number(p.user_id),
      username: p.username,
      profile_emoji: p.profile_emoji,
      total_points: p.total_points,
      last_seen: p.last_seen ?? null,
    }));
  }, [provided, friends, fetchedFriends]);

  // 3) If provided list lacks last_seen, enrich it once per 15s
  const idsNeedingPresence = useMemo(
    () =>
      provided
        ? baseList.filter((p) => p.last_seen == null && p.id).map((p) => p.id)
        : [],
    [provided, baseList]
  );

  const { data: presenceById = new Map() } = useQuery({
    queryKey: ["friends:presence", idsNeedingPresence],
    enabled: provided && idsNeedingPresence.length > 0,
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("players")
        .select("id, last_seen")
        .in("id", idsNeedingPresence);
      if (error) throw error;
      return new Map((data || []).map((r) => [Number(r.id), r.last_seen]));
    },
  });

  const enriched = useMemo(() => {
    if (!provided || idsNeedingPresence.length === 0) return baseList;
    return baseList.map((p) =>
      p.last_seen != null ? p : { ...p, last_seen: presenceById.get(p.id) ?? null }
    );
  }, [provided, baseList, presenceById, idsNeedingPresence.length]);

  // 4) Compute isOnline from last_seen
  const withOnline = useMemo(() => {
    const now = Date.now();
    return (enriched || []).map((p) => {
      let seenMs = NaN;
      if (p.last_seen) {
        const raw = String(p.last_seen);
        const iso = /Z$|[+\-]\d{2}:\d{2}$/.test(raw) ? raw : `${raw}Z`;
        seenMs = Date.parse(iso);
      }
      const isOnline = Number.isFinite(seenMs) && now - seenMs <= ONLINE_WINDOW_MS;
      return { ...p, isOnline };
    });
  }, [enriched]);

  // 5) Unread per friend (chat_messages.receiver_id = me, is_read = false)
  const {
    data: unreadMap = new Map(),
    isLoading: unreadLoading,
  } = useQuery({
    queryKey: ["chat_messages:unreadBySender", playerId],
    enabled: !!playerId,
    refetchInterval: 10000,
    staleTime: 5000,
    queryFn: async () => {
      const pid = Number(playerId);
      if (!pid) return new Map();

      const { data, error } = await supabase
        .from("chat_messages")
        .select("sender_id")
        .eq("receiver_id", pid)
        .eq("is_read", false);

      if (error) throw error;

      const m = new Map();
      for (const row of data || []) {
        const s = Number(row.sender_id);
        if (Number.isFinite(s)) m.set(s, (m.get(s) || 0) + 1);
      }
      return m;
    },
  });

  // 6) Open chat => mark messages read + zero badge locally
  const handleOpenChat = useCallback(
    async (friend) => {
      const fid = Number(friend?.id);
      const me = Number(playerId);
      if (fid && me) {
        await supabase
          .from("chat_messages")
          .update({ is_read: true })
          .eq("sender_id", fid)
          .eq("receiver_id", me)
          .eq("is_read", false);

        queryClient.setQueryData(["chat_messages:unreadBySender", me], (prev) => {
          if (!(prev instanceof Map)) return new Map();
          const next = new Map(prev);
          next.set(fid, 0);
          return next;
        });

        queryClient.invalidateQueries({ queryKey: ["chat_messages:unreadBySender", me] });
      }
      onChat?.(friend);
    },
    [onChat, playerId, queryClient]
  );

  // Loading state (don’t clear items). Drive a **global** spinner.
  const loading =
    typeof isLoading === "boolean"
      ? isLoading
      : shouldSelfFetch
      ? loadingFriends || unreadLoading
      : unreadLoading;

  useEffect(() => {
    setShowGlobalSpinner(!!loading);
  }, [loading]);

  // Let parent adjust "Friends (n)" if it wants
  useEffect(() => {
    onVisibleCountChange?.(withOnline?.length || 0);
  }, [withOnline, onVisibleCountChange]);

  if (!fontsLoaded) return null;

  const hasItems = withOnline && withOnline.length > 0;

  return (
    <View style={styles.container}>
      {hasItems ? (
        <View>
          {withOnline.map((player, index) => (
            <PlayerCard
              key={`${player.id}-${index}`}
              player={player}
              isFriend={true}
              isOnline={!!player.isOnline}
              unreadCount={unreadMap.get(player.id) || 0}
              onRemoveFriend={onRemoveFriend}
              onChat={handleOpenChat}
            />
          ))}
        </View>
      ) : !loading ? (
        shouldSelfFetch && fetchError ? (
          <Text style={styles.info(colors)}>Couldn't load friends.</Text>
        ) : (
          <Text style={styles.info(colors)}>
            No friends yet. Use "Find Friends" to add some!
          </Text>
        )
      ) : null}

      {/* Global, screen-fixed spinner (transparent, non-blocking) */}
      <Modal transparent visible={showGlobalSpinner} animationType="none">
        <View pointerEvents="none" style={styles.modalFill}>
          <View style={styles.modalCorner}>
            <ActivityIndicator size="small" color={colors.textSecondary} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
    minHeight: 1,
  },
  info: (colors) => ({
    textAlign: "center",
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: 20,
    fontFamily: "Inter_400Regular",
  }),
  // Fullscreen transparent layer for spinner placement
modalFill: {
  flex: 1,
  backgroundColor: "transparent",
},
modalCorner: {
  position: "absolute",
  // tweak these two numbers to move it up/right:
  bottom: 60,   // increase to go up
  left: 28,     // increase to move right
  backgroundColor: "transparent",
},

});
