// src/hooks/useFriends.js
import { Alert } from "react-native";
import * as Haptics from "expo-haptics";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../utils/supabase";

/* ───────── helpers ───────── */
const toNum = (v) => (Number.isFinite(+v) ? +v : 0);
const nowIso = () => new Date().toISOString();

/**
 * Normalize a "person reference" that might be:
 *  - raw number (player id or user id)
 *  - object with { id } (player id)
 *  - object with { user_id } (auth/user id)
 * We return both forms when possible.
 */
function normalizePersonRef(x) {
  if (x && typeof x === "object") {
    const pid = toNum(x.id);
    const uid = toNum(x.user_id);
    return { playerId: pid, userId: uid };
  }
  // If it's just a number we don't know if it's userId or playerId.
  // Callers will specify which they mean when resolving.
  return { playerId: 0, userId: toNum(x) };
}

/**
 * Resolve current player row by userId (players.user_id).
 * Returns { playerId, userId, row } or { playerId:0 } if not found.
 */
async function resolveCurrentPlayerByUserId(userId) {
  const uid = toNum(userId);
  if (!uid) return { playerId: 0, userId: 0, row: null };
  const { data, error } = await supabase
    .from("players")
    .select("id, user_id, username, profile_emoji")
    .eq("user_id", uid)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) return { playerId: 0, userId: uid, row: null };
  return { playerId: toNum(data.id), userId: toNum(data.user_id), row: data };
}

/**
 * Given a userId, find that player's id (players.id).
 * Returns 0 if not found.
 */
async function getPlayerIdFromUserId(userId) {
  const uid = toNum(userId);
  if (!uid) return 0;
  const { data, error } = await supabase
    .from("players")
    .select("id")
    .eq("user_id", uid)
    .maybeSingle();
  if (error) throw error;
  return toNum(data?.id);
}

/**
 * Fetch minimal player profiles by player ids.
 */
async function fetchPlayersByIds(ids = []) {
  const uniq = Array.from(new Set(ids.map(toNum).filter((x) => x > 0)));
  if (!uniq.length) return [];
  const { data, error } = await supabase
    .from("players")
    .select("id, user_id, username, profile_emoji")
    .in("id", uniq);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

/* ───────── main hook (TAKES userId, not players.id) ───────── */
export function useFriends(userId) {
  const uid = toNum(userId);
  const queryClient = useQueryClient();

  /* 1) Resolve current player by userId */
  const {
    data: me = { playerId: 0, userId: uid, row: null },
    isLoading: meLoading,
    error: meError,
  } = useQuery({
    queryKey: ["me-player-by-userId", uid],
    enabled: !!uid,
    queryFn: async () => resolveCurrentPlayerByUserId(uid),
    staleTime: 60_000,
  });

  const pid = toNum(me?.playerId);
  const enabled = !!pid;

  /* 2) ACCEPTED FRIENDS */
  const {
    data: friends = [],
    isLoading: friendsLoading,
    isRefetching: friendsRefetching,
    error: friendsError,
  } = useQuery({
    queryKey: ["friends-detailed", pid],
    enabled,
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data: links, error } = await supabase
        .from("friendships")
        .select("id, player1_id, player2_id, status, created_at, updated_at")
        .or(`player1_id.eq.${pid},player2_id.eq.${pid}`)
        .eq("status", "accepted");
      if (error) throw error;

      const otherIds = (links ?? [])
        .map((f) => (toNum(f.player1_id) === pid ? toNum(f.player2_id) : toNum(f.player1_id)))
        .filter((x) => x > 0 && x !== pid);

      if (!otherIds.length) return [];

      const profiles = await fetchPlayersByIds(otherIds);
      const byId = new Map(profiles.map((p) => [toNum(p.id), p]));

      // Unique by friend_id
      const unique = [];
      const seen = new Set();
      for (const r of links ?? []) {
        const fid = toNum(r.player1_id) === pid ? toNum(r.player2_id) : toNum(r.player1_id);
        if (!seen.has(fid) && fid > 0) {
          seen.add(fid);
          unique.push({
            friendship_id: r.id,
            friend_id: fid,
            status: r.status,
            created_at: r.created_at,
            updated_at: r.updated_at,
            profile:
              byId.get(fid) || { id: fid, user_id: 0, username: "Unknown Player", profile_emoji: "🙂" },
          });
        }
      }
      // Sort by username (optional)
      return unique.sort((a, b) =>
        String(a.profile?.username || "").localeCompare(String(b.profile?.username || ""), undefined, {
          sensitivity: "base",
        }),
      );
    },
  });

  /* 3) INCOMING PENDING (requests sent TO me) */
  const {
    data: requests = [],
    isLoading: requestsLoading,
    isRefetching: requestsRefetching,
    error: requestsError,
  } = useQuery({
    queryKey: ["friend-requests-incoming", pid],
    enabled,
    refetchInterval: 5_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("friend_requests")
        .select("id, sender_id, receiver_id, message, status, created_at")
        .eq("receiver_id", pid)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const senderIds = [...new Set((data ?? []).map((r) => toNum(r.sender_id)).filter((x) => x > 0))];
      const senders = await fetchPlayersByIds(senderIds);
      const byId = new Map(senders.map((p) => [toNum(p.id), p]));

      return (data ?? []).map((r) => ({
        ...r,
        sender:
          byId.get(toNum(r.sender_id)) || {
            id: toNum(r.sender_id),
            user_id: 0,
            username: `Player ${r.sender_id}`,
            profile_emoji: "🙂",
          },
      }));
    },
  });

  /* 4) OUTGOING PENDING (requests I sent) */
  const {
    data: outgoing = [],
    isLoading: outgoingLoading,
    isRefetching: outgoingRefetching,
    error: outgoingError,
  } = useQuery({
    queryKey: ["friend-requests-outgoing", pid],
    enabled,
    refetchInterval: 5_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("friend_requests")
        .select("id, sender_id, receiver_id, status, created_at")
        .eq("sender_id", pid)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  /* ───────── helpers for UI (accept both userId or player id) ───────── */
  const isFriend = (target) => {
    const ref = normalizePersonRef(target);
    const targetPid = toNum(ref.playerId);
    const targetUid = toNum(ref.userId);

    if (targetPid) return friends.some((f) => toNum(f.friend_id) === targetPid);

    if (targetUid) {
      return friends.some((f) => toNum(f.profile?.user_id) === targetUid);
    }
    return false;
  };

  const hasPendingWith = (target) => {
    const ref = normalizePersonRef(target);
    const targetPid = toNum(ref.playerId);
    const targetUid = toNum(ref.userId);

    if (targetPid) {
      const incomingHit = requests.some(
        (r) => toNum(r.sender_id) === targetPid && r.status === "pending",
      );
      const outgoingHit = outgoing.some(
        (r) => toNum(r.receiver_id) === targetPid && r.status === "pending",
      );
      return incomingHit || outgoingHit;
    }

    if (targetUid) {
      const incomingHit = requests.some(
        (r) => toNum(r.sender?.user_id) === targetUid && r.status === "pending",
      );
      return incomingHit;
    }

    return false;
  };

  const canAdd = (target) => {
    if (!enabled) return false;
    const ref = normalizePersonRef(target);
    const targetPid = toNum(ref.playerId);
    const targetUid = toNum(ref.userId);

    if (targetPid && targetPid === pid) return false;
    if (targetUid && targetUid === uid) return false;

    return !isFriend(target) && !hasPendingWith(target);
  };

  /* ───────── mutations ───────── */
  const sendRequestMutation = useMutation({
    mutationFn: async (arg) => {
      if (!enabled) throw new Error("You are not signed in as a player.");
      const targetUserId =
        toNum(arg?.targetUserId ?? arg?.user_id ?? (typeof arg === "number" ? arg : 0));
      const targetPlayerIdInput = toNum(arg?.targetPlayerId ?? arg?.id ?? 0);

      // Resolve target player id (prefer explicit player id; else map userId -> player id)
      let targetPid = targetPlayerIdInput;
      if (!targetPid) {
        targetPid = await getPlayerIdFromUserId(targetUserId);
      }

      if (!targetPid) throw new Error("Target player not found");
      if (targetPid === pid) throw new Error("You cannot send a request to yourself.");

      // Already friends?
      const { data: alreadyFriends, error: fErr } = await supabase
        .from("friendships")
        .select("id")
        .or(
          `and(player1_id.eq.${pid},player2_id.eq.${targetPid}),and(player1_id.eq.${targetPid},player2_id.eq.${pid})`,
        )
        .eq("status", "accepted")
        .maybeSingle();
      if (fErr) throw fErr;
      if (alreadyFriends) throw new Error("You are already friends.");

      // Pending either direction?
      const { data: pending, error: pErr } = await supabase
        .from("friend_requests")
        .select("id")
        .or(
          `and(sender_id.eq.${pid},receiver_id.eq.${targetPid}),and(sender_id.eq.${targetPid},receiver_id.eq.${pid})`,
        )
        .eq("status", "pending")
        .maybeSingle();
      if (pErr) throw pErr;
      if (pending) throw new Error("A friend request is already pending.");

      const { error: insErr } = await supabase.from("friend_requests").insert({
        sender_id: pid,
        receiver_id: targetPid,
        message: arg?.message ?? "Wants to be friends!",
        status: "pending",
        created_at: nowIso(),
        updated_at: nowIso(),
      });
      if (insErr) throw insErr;

      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["friend-requests-outgoing", pid] });
      queryClient.invalidateQueries({ queryKey: ["friend-requests-incoming", pid] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success", "Friend request sent.");
    },
    onError: (e) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Error", e?.message || "Failed to send request.");
    },
  });

  const respondToRequestMutation = useMutation({
    mutationFn: async ({ requestId, action }) => {
      if (!enabled) throw new Error("Not ready.");
      const rid = toNum(requestId);
      if (!rid) throw new Error("Invalid request id.");
      if (!["accept", "decline"].includes(String(action))) throw new Error("Invalid action.");

      const { data: req, error: getErr } = await supabase
        .from("friend_requests")
        .select("*")
        .eq("id", rid)
        .maybeSingle();
      if (getErr) throw getErr;
      if (!req) throw new Error("Request not found.");
      if (toNum(req.receiver_id) !== pid && toNum(req.sender_id) !== pid) {
        throw new Error("You cannot modify this request.");
      }

      if (action === "accept") {
        const { error: updErr } = await supabase
          .from("friend_requests")
          .update({ status: "accepted", updated_at: nowIso() })
          .eq("id", rid);
        if (updErr) throw updErr;

        // Insert friendship (store smaller id as player1_id to avoid dupes)
        const a = Math.min(pid, toNum(req.sender_id));
        const b = Math.max(pid, toNum(req.sender_id));

        const { data: existing, error: chkErr } = await supabase
          .from("friendships")
          .select("id")
          .eq("player1_id", a)
          .eq("player2_id", b)
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
      } else {
        const { error: updErr } = await supabase
          .from("friend_requests")
          .update({ status: "declined", updated_at: nowIso() })
          .eq("id", rid);
        if (updErr) throw updErr;
      }

      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["friend-requests-incoming", pid] });
      queryClient.invalidateQueries({ queryKey: ["friend-requests-outgoing", pid] });
      queryClient.invalidateQueries({ queryKey: ["friends-detailed", pid] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Error", e?.message || "Failed to update request.");
    },
  });

  const removeFriendMutation = useMutation({
    mutationFn: async (target) => {
      if (!enabled) throw new Error("Not ready.");
      const ref = normalizePersonRef(target);
      let targetPid = toNum(ref.playerId);
      if (!targetPid && ref.userId) {
        targetPid = await getPlayerIdFromUserId(ref.userId);
      }
      if (!targetPid) throw new Error("Target player not found.");

      const { error } = await supabase
        .from("friendships")
        .delete()
        .or(
          `and(player1_id.eq.${pid},player2_id.eq.${targetPid}),and(player1_id.eq.${targetPid},player2_id.eq.${pid})`,
        )
        .eq("status", "accepted");
      if (error) throw error;

      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["friends-detailed", pid] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Removed", "Friend removed.");
    },
    onError: (e) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Error", e?.message || "Failed to remove friend.");
    },
  });

  /* ───────── return API ───────── */
  return {
    // me
    me,
    meLoading,
    meError,

    // lists
    friends,
    friendsLoading: friendsLoading || friendsRefetching,
    friendsError,

    requests,
    requestsLoading: requestsLoading || requestsRefetching,
    requestsError,

    outgoingPending: outgoing,
    outgoingLoading: outgoingLoading || outgoingRefetching,
    outgoingError,

    // actions
    sendRequest: (args) => sendRequestMutation.mutate(args),
    respondToRequest: (args) => respondToRequestMutation.mutate(args),
    removeFriend: (target) => removeFriendMutation.mutate(target),

    // action states
    isSendingRequest: !!sendRequestMutation.isPending,

    // helpers
    isFriend,
    hasPendingWith,
    canAdd,
  };
}
