import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useTheme } from "../../utils/theme";
import { X, Send } from "lucide-react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import {
  useFonts,
  Inter_400Regular,
  Inter_700Bold,
} from "@expo-google-fonts/inter";

export default function ChatModal({ visible, onClose, friend, playerId }) {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const scrollViewRef = useRef(null);
  const [chatMessage, setChatMessage] = useState("");
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_700Bold,
  });

  const { data: chatMessages = [] } = useQuery({
    queryKey: ["chat-messages", playerId, friend?.id],
    queryFn: async () => {
      if (!playerId || !friend?.id) return [];
      const response = await fetch(
        `/api/chat?playerId=${playerId}&friendId=${friend.id}`,
      );
      if (!response.ok) {
        throw new Error("Failed to fetch messages");
      }
      return response.json();
    },
    enabled: !!playerId && !!friend && visible,
    refetchInterval: visible ? 1000 : false, // Poll every second when visible
    refetchIntervalInBackground: false,
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (message) => {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderId: playerId,
          receiverId: friend.id,
          message,
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to send message");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["chat-messages", playerId, friend?.id]);
      setChatMessage("");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    onError: (error) => {
      console.error("Failed to send message:", error);
      // Could show an error indicator here
    },
  });

  const sendMessage = () => {
    if (!chatMessage.trim() || sendMessageMutation.isLoading) return;
    sendMessageMutation.mutate(chatMessage.trim());
  };

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (chatMessages.length > 0 && scrollViewRef.current) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [chatMessages.length]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }}>
          <View
            style={{
              flex: 1,
              marginTop: 100,
              backgroundColor: colors.background,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
            }}
          >
            <View
              style={{
                padding: 20,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <View>
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: "700",
                    color: colors.text,
                    fontFamily: "Inter_700Bold",
                  }}
                >
                  {friend?.profile_emoji} {friend?.username}
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    color: colors.textSecondary,
                    fontFamily: "Inter_400Regular",
                  }}
                >
                  {chatMessages.length} messages
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} style={{ padding: 8 }}>
                <X size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView
              ref={scrollViewRef}
              style={{ flex: 1, padding: 16 }}
              showsVerticalScrollIndicator={false}
              onContentSizeChange={() => {
                scrollViewRef.current?.scrollToEnd({ animated: true });
              }}
            >
              {chatMessages.length === 0 ? (
                <View
                  style={{
                    flex: 1,
                    justifyContent: "center",
                    alignItems: "center",
                    paddingVertical: 40,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 16,
                      color: colors.textSecondary,
                      textAlign: "center",
                      fontFamily: "Inter_400Regular",
                    }}
                  >
                    Start a conversation with {friend?.username}!
                  </Text>
                </View>
              ) : (
                chatMessages.map((message, index) => (
                  <View
                    key={message.id || index}
                    style={{
                      alignSelf:
                        message.sender_id === playerId
                          ? "flex-end"
                          : "flex-start",
                      backgroundColor:
                        message.sender_id === playerId
                          ? colors.gameAccent1
                          : colors.glassSecondary,
                      borderRadius: 12,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      marginBottom: 8,
                      maxWidth: "80%",
                    }}
                  >
                    <Text
                      style={{
                        color:
                          message.sender_id === playerId
                            ? "#FFFFFF"
                            : colors.text,
                        fontSize: 14,
                        fontFamily: "Inter_400Regular",
                      }}
                    >
                      {message.message}
                    </Text>
                    <Text
                      style={{
                        color:
                          message.sender_id === playerId
                            ? "#FFFFFF80"
                            : colors.textSecondary,
                        fontSize: 10,
                        marginTop: 2,
                        fontFamily: "Inter_400Regular",
                      }}
                    >
                      {new Date(message.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Text>
                  </View>
                ))
              )}
            </ScrollView>

            <View
              style={{
                padding: 16,
                borderTopWidth: 1,
                borderTopColor: colors.border,
                flexDirection: "row",
                alignItems: "flex-end",
                gap: 12,
              }}
            >
              <TextInput
                value={chatMessage}
                onChangeText={setChatMessage}
                placeholder={`Message ${friend?.username}...`}
                placeholderTextColor={colors.textSecondary}
                style={{
                  flex: 1,
                  backgroundColor: colors.glassSecondary,
                  borderRadius: 20,
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  color: colors.text,
                  fontSize: 14,
                  fontFamily: "Inter_400Regular",
                  maxHeight: 100,
                }}
                multiline
                onSubmitEditing={sendMessage}
                blurOnSubmit={false}
              />
              <TouchableOpacity
                onPress={sendMessage}
                disabled={!chatMessage.trim() || sendMessageMutation.isLoading}
                style={{
                  backgroundColor: colors.gameAccent1,
                  borderRadius: 20,
                  padding: 10,
                  opacity:
                    !chatMessage.trim() || sendMessageMutation.isLoading
                      ? 0.5
                      : 1,
                }}
              >
                <Send size={16} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
