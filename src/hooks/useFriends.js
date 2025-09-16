import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert } from "react-native";
import * as Haptics from "expo-haptics";

export function useFriends(playerId) {
  const queryClient = useQueryClient();

  // Fetch friends list with detailed info
  const { data: friends = [], isLoading: friendsLoading } = useQuery({
    queryKey: ["friends-detailed", playerId],
    queryFn: async () => {
      if (!playerId) return [];
      const response = await fetch(
        `/api/friends?playerId=${playerId}&status=accepted`,
      );
      if (!response.ok) return [];
      const friendsList = await response.json();

      const friendsWithDetails = await Promise.all(
        friendsList.map(async (friend) => {
          const detailsResponse = await fetch(
            `/api/players/search?q=${friend.user_id}&playerId=${playerId}`,
          );
          if (detailsResponse.ok) {
            const details = await detailsResponse.json();
            return details[0] || friend;
          }
          return friend;
        }),
      );

      return friendsWithDetails;
    },
    enabled: !!playerId,
    refetchInterval: 10000,
  });

  // Fetch friend requests
  const { data: requests = [], isLoading: requestsLoading } = useQuery({
    queryKey: ["friend-requests", playerId],
    queryFn: async () => {
      if (!playerId) return [];
      const response = await fetch(
        `/api/friend-requests?playerId=${playerId}&type=incoming`,
      );
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!playerId,
    refetchInterval: 5000,
  });

  // Send friend request mutation
  const sendRequestMutation = useMutation({
    mutationFn: async (userToAdd) => {
      const response = await fetch("/api/friend-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderId: playerId,
          receiverUserId: userToAdd.user_id,
          message: "Would like to be friends!",
        }),
      });
      if (!response.ok) throw new Error("Failed to send friend request");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["friend-requests", playerId]);
      // Invalidate the search to update relationship status
      queryClient.invalidateQueries(["player-search"]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success", "Friend request sent!");
    },
    onError: (error) => {
      Alert.alert("Error", error.message || "Failed to send friend request");
    },
  });

  // Remove friend mutation
  const removeFriendMutation = useMutation({
    mutationFn: async (friendId) => {
      const response = await fetch("/api/friends/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId,
          friendId,
        }),
      });
      if (!response.ok) throw new Error("Failed to remove friend");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["friends-detailed", playerId]);
      queryClient.invalidateQueries(["friends", playerId]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success", "Friend removed");
    },
    onError: (error) => {
      Alert.alert("Error", error.message || "Failed to remove friend");
    },
  });

  // Accept/reject friend request mutations
  const respondToRequestMutation = useMutation({
    mutationFn: async ({ requestId, action }) => {
      const response = await fetch(`/api/friend-requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: action }),
      });
      if (!response.ok) throw new Error("Failed to respond to request");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["friend-requests", playerId]);
      queryClient.invalidateQueries(["friends-detailed", playerId]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  return {
    friends,
    friendsLoading,
    requests,
    requestsLoading,
    sendRequest: sendRequestMutation.mutate,
    isSendingRequest: sendRequestMutation.isLoading,
    removeFriend: removeFriendMutation.mutate,
    respondToRequest: respondToRequestMutation.mutate,
  };
}
