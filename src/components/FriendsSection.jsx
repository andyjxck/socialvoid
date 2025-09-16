import React, { useState } from "react";
import { View, ScrollView, Alert } from "react-native";
import * as Haptics from "expo-haptics";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";

import { useFriends } from "../hooks/useFriends";
import FriendsTabs from "./friends/FriendsTabs";
import FriendsList from "./friends/FriendsList";
import FriendRequests from "./friends/FriendRequests";
import AddFriend from "./friends/AddFriend";
import ChatModal from "./friends/ChatModal";

export default function FriendsSection({ playerId }) {
  const [activeTab, setActiveTab] = useState("friends");
  const [chatModalVisible, setChatModalVisible] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState(null);

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  const {
    friends,
    friendsLoading,
    requests,
    sendRequest,
    isSendingRequest,
    removeFriend,
    respondToRequest,
  } = useFriends(playerId);

  const handleRemoveFriend = (friendId, friendName) => {
    Alert.alert(
      "Remove Friend",
      `Are you sure you want to remove ${friendName} from your friends?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => removeFriend(friendId),
        },
      ],
    );
  };

  const handleRequestResponse = (requestId, action) => {
    respondToRequest({ requestId, action });
  };

  const openChat = (friend) => {
    setSelectedFriend(friend);
    setChatModalVisible(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  if (!fontsLoaded) {
    return null;
  }

  const renderContent = () => {
    switch (activeTab) {
      case "friends":
        return (
          <FriendsList
            friends={friends}
            isLoading={friendsLoading}
            onRemoveFriend={handleRemoveFriend}
            onChat={openChat}
          />
        );
      case "requests":
        return (
          <FriendRequests
            requests={requests}
            onRespond={handleRequestResponse}
          />
        );
      case "search":
        return (
          <AddFriend
            playerId={playerId}
            onAddFriend={sendRequest}
            isAddingFriend={isSendingRequest}
          />
        );
      default:
        return null;
    }
  };

  return (
    <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 16 }}>
      <FriendsTabs
        activeTab={activeTab}
        setActiveTab={handleTabChange}
        friendsCount={friends.length}
        requestsCount={requests.length}
      />

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 20 }}
      >
        {renderContent()}
      </ScrollView>

      {selectedFriend && (
        <ChatModal
          visible={chatModalVisible}
          onClose={() => setChatModalVisible(false)}
          friend={selectedFriend}
          playerId={playerId}
        />
      )}
    </View>
  );
}
