// src/hooks/useFriends.js
import { Alert } from "react-native";
import * as Haptics from "expo-haptics";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../utils/supabase";

const norm = (n) => {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
};
const nowIso = () => new Date().toISOString();

export function useFriends(playerId) {
  const pid = norm(playerId);
  const queryClient = useQueryClient();

  // ---------- FRIENDS (accepted) ----------
  const {
    data: friends = [],
    isLoading: friendsLoading,
  } = useQuery({
    queryKey: ["friends-detailed", pid],
    enabled: !!pid,
    refetchInterval: 10000,
    queryFn: async () => {
      const { data: fships, error: fErr } = await supabase
        .from("friendships")
        .select("player1_id, player2_id, status")
        .or(`player1_id.eq.${pid},player2_id.eq.${pid}`)
        .eq("status", "accepted");

      if (fErr) throw fErr;

      const otherIds = (fships || [])
        .map((f) => (f.player1_id === pid ? f.player2_id : f.player1_id))
        .filter((x) => typeof x === "number" && x !== pid);

      if (otherIds.length === 0) return [];

      const { data: players, error: pErr } = await supabase
        .from("players")
        .select("user_id, username, profile_emoji")
        .in("id", otherIds)
        .order("username", { ascending: true });

      if (pErr) throw pErr;

      return players || [];
    },
  });

  // ---------- INCOMING REQUESTS (pending) ----------
  const {
    data: requests = [],
    isLoading: requestsLoading,
  } = useQuery({
    queryKey: ["friend-requests", pid],
    enabled: !!pid,
    refetchInterval: 5000,
    queryFn: async () => {
      const { data: reqs, error: rErr } = await supabase
        .from("friend_requests")
        .select("id, sender_id, receiver_id, message, status, created_at")
        .eq("receiver_id", pid)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (rErr) throw rErr;

      const senderIds = Array.from(
        new Set((reqs || []).map((r) => r.sender_id).filter(Boolean))
      );

      let senders = [];
      if (senderIds.length > 0) {
        const { data: players, error: pErr } = await supabase
          .from("players")
          .select("id, username, profile_emoji")
          .in("id", senderIds);

        if (pErr) throw pErr;
        senders = players || [];
      }

      const byId = new Map(senders.map((p) => [p.id, p]));
      return (reqs || []).map((r) => ({
        id: r.id,
        sender_id: r.sender_id,
        receiver_id: r.receiver_id,
        message: r.message,
        status: r.status,
        created_at: r.created_at,
        sender:
          byId.get(r.sender_id) || {
            id: r.sender_id,
            username: `Player ${r.sender_id}`,
            profile_emoji: "🙂",
          },
      }));
    },
  });

  // ---------- MUTATIONS ----------

  // Send friend request (accepts many shapes)
  const sendRequestMutation = useMutation({
    mutationFn: async (arg) => {
      // Accept several argument shapes:
      const tid = norm(
        arg?.targetPlayerId ??
          arg?.targetId ??
          arg?.playerId /* careful: not the caller's playerId */ ??
          arg?.user_id ??
          arg?.id
      );

      console.log("[useFriends] sendRequest called with:", arg);
      console.log("[useFriends] computed pid, tid ->", pid, tid);

      if (!pid) throw new Error("Missing current playerId");
      if (!tid) throw new Error("Invalid target");
      if (pid === tid) throw new Error("Cannot friend yourself");

      // Ensure target exists (optional but helpful)
      const { data: target, error: tErr } = await supabase
        .from("players")
        .select("id")
        .eq("id", tid)
        .maybeSingle();
      if (tErr) throw tErr;
      if (!target) throw new Error("Target player not found");

      // already friends?
      const { data: existingF, error: fErr } = await supabase
        .from("friendships")
        .select("id")
        .or(
          `and(player1_id.eq.${pid},player2_id.eq.${tid}),and(player1_id.eq.${tid},player2_id.eq.${pid})`
        )
        .eq("status", "accepted")
        .limit(1)
        .maybeSingle();
      if (fErr) throw fErr;
      if (existingF) throw new Error("Already friends");

      // pending either way?
      const { data: pendingReq, error: prErr } = await supabase
        .from("friend_requests")
        .select("id")
        .or(
          `and(sender_id.eq.${pid},receiver_id.eq.${tid}),and(sender_id.eq.${tid},receiver_id.eq.${pid})`
        )
        .eq("status", "pending")
        .limit(1)
        .maybeSingle();
      if (prErr) throw prErr;
      if (pendingReq) throw new Error("Request already pending");

      // insert request
      const { error: insErr } = await supabase.from("friend_requests").insert({
        sender_id: pid,
        receiver_id: tid,
        message: arg?.message ?? "Would like to be friends!",
        status: "pending",
        created_at: nowIso(),
        updated_at: nowIso(),
      });
      if (insErr) throw insErr;

      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["friend-requests", pid] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success", "Friend request sent!");
    },
    onError: (error) => {
      Alert.alert("Error", error.message || "Failed to send friend request");
    },
  });

  // Remove friend
  const removeFriendMutation = useMutation({
    mutationFn: async (friendId) => {
      const fid = norm(friendId);
      if (!pid || !fid) throw new Error("Invalid friend");

      const { error: delErr } = await supabase
        .from("friendships")
        .delete()
        .or(
          `and(player1_id.eq.${pid},player2_id.eq.${fid}),and(player1_id.eq.${fid},player2_id.eq.${pid})`
        );
      if (delErr) throw delErr;

      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["friends-detailed", pid] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success", "Friend removed");
    },
    onError: (error) => {
      Alert.alert("Error", error.message || "Failed to remove friend");
    },
  });

  // Accept / Decline incoming request
  const respondToRequestMutation = useMutation({
    mutationFn: async ({ requestId, action }) => {
      if (!requestId || !action) throw new Error("Invalid request");

      const { data: req, error: getErr } = await supabase
        .from("friend_requests")
        .select("*")
        .eq("id", requestId)
        .maybeSingle();
      if (getErr) throw getErr;
      if (!req) throw new Error("Request not found");

      if (action === "accept") {
        const { error: updErr } = await supabase
          .from("friend_requests")
          .update({ status: "accepted", updated_at: nowIso() })
          .eq("id", requestId);
        if (updErr) throw updErr;

        const a = Math.min(pid, req.sender_id);
        const b = Math.max(pid, req.sender_id);

        const { data: existing, error: chkErr } = await supabase
          .from("friendships")
          .select("id")
          .eq("player1_id", a)
          .eq("player2_id", b)
          .limit(1)
          .maybeSingle();
        if (chkErr) throw chkErr;

        if (!existing) {
          const { error: insErr } = await supabase.from("friendships").insert({
            player1_id: a,
            player2_id: b,
            status: "accepted",
            created_at: nowIso(),
          });
          if (insErr) throw insErr;
        }
      } else if (action === "decline") {
        const { error: updErr } = await supabase
          .from("friend_requests")
          .update({ status: "declined", updated_at: nowIso() })
          .eq("id", requestId);
        if (updErr) throw updErr;
      } else {
        throw new Error("Unknown action");
      }

      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["friend-requests", pid] });
      queryClient.invalidateQueries({ queryKey: ["friends-detailed", pid] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (error) => {
      Alert.alert("Error", error.message || "Failed to update request");
    },
  });

  return {
    friends,
    friendsLoading,
    requests,
    requestsLoading,
    sendRequest: (args) => sendRequestMutation.mutate(args),
    isSendingRequest: sendRequestMutation.isLoading,
    removeFriend: (friendId) => removeFriendMutation.mutate(friendId),
    respondToRequest: (args) => respondToRequestMutation.mutate(args),
  };
}
