// src/components/friends/ChatModal.jsx
import React, { useState, useRef, useEffect, useMemo } from "react";
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
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../../utils/supabase";

export default function ChatModal({ visible, onClose, friend, playerId }) {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const scrollViewRef = useRef(null);
  const [chatMessage, setChatMessage] = useState("");
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_700Bold });

  /* ─────────────────────────────────────────────
     1) Resolve YOUR player id (pid)
     - If prop missing, load from AsyncStorage
     ───────────────────────────────────────────── */
  const [pidFromStorage, setPidFromStorage] = useState(null);
  useEffect(() => {
    if (playerId != null) return; // we already have it
    (async () => {
      const v = await AsyncStorage.getItem("puzzle_hub_player_id");
      if (v != null) {
        const n = parseInt(String(v), 10);
        if (!Number.isNaN(n)) setPidFromStorage(n);
      }
    })();
  }, [playerId]);

  const pidRaw = playerId ?? pidFromStorage ?? null;

  /* ─────────────────────────────────────────────
     2) Resolve FRIEND player id (fid)
     - Try friend.id
     - Try friend.player_id
     - Try lookup by user_id
     - Try lookup by username
     ───────────────────────────────────────────── */
  const friendIdHint =
    friend?.id ??
    friend?.player_id ??
    null;

  const friendUserId = friend?.user_id ?? null;
  const friendUsername = friend?.username ?? null;

  // a) resolve by user_id if we don't have a direct id
  const { data: fidByUser } = useQuery({
    queryKey: ["chat:resolve-fid:user_id", friendUserId],
    enabled: !friendIdHint && !!friendUserId && !!visible,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("players")
        .select("id")
        .eq("user_id", friendUserId)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data?.id ?? null;
    },
    staleTime: 60_000,
  });

  // b) resolve by username if still no id (last resort; usernames are not guaranteed unique unless you enforce it)
  const { data: fidByUsername } = useQuery({
    queryKey: ["chat:resolve-fid:username", friendUsername],
    enabled:
      !friendIdHint && !fidByUser && !!friendUsername && !!visible,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("players")
        .select("id")
        .ilike("username", friendUsername) // exact match preferred; change to .eq if you enforce uniqueness
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data?.id ?? null;
    },
    staleTime: 60_000,
  });

  const fidRaw = friendIdHint ?? fidByUser ?? fidByUsername ?? null;

  // Helpful debug (kept tiny)
  useEffect(() => {
    if (!visible) return;
    // eslint-disable-next-line no-console
    console.log("[ChatModal] ids", { pidRaw, fidRaw, friend });
  }, [visible, pidRaw, fidRaw, friend]);

  /* ─────────────────────────────────────────────
     3) Normalize ids at the LAST moment (for DB insert)
     ───────────────────────────────────────────── */
  const pid = useMemo(() => {
    if (pidRaw == null) return null;
    const n = parseInt(String(pidRaw), 10);
    return Number.isNaN(n) ? null : n;
  }, [pidRaw]);

  const fid = useMemo(() => {
    if (fidRaw == null) return null;
    const n = parseInt(String(fidRaw), 10);
    return Number.isNaN(n) ? null : n;
  }, [fidRaw]);

  /* ─────────────────────────────────────────────
     4) Load messages
     ───────────────────────────────────────────── */
  const { data: chatMessages = [] } = useQuery({
    queryKey: ["chat-messages", pid, fid],
    enabled: Boolean(pid && fid && visible),
    refetchInterval: visible ? 1000 : false,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("id, sender_id, receiver_id, message, is_read, created_at")
        .or(
          `and(sender_id.eq.${pid},receiver_id.eq.${fid}),and(sender_id.eq.${fid},receiver_id.eq.${pid})`
        )
        .order("created_at", { ascending: true })
        .limit(500);

      if (error) throw error;

      // Mark unread incoming as read (fire-and-forget)
      const hasUnread = (data || []).some(
        (m) => m.receiver_id === pid && m.is_read === false
      );
      if (hasUnread) {
        supabase
          .from("chat_messages")
          .update({ is_read: true })
          .eq("receiver_id", pid)
          .eq("sender_id", fid)
          .eq("is_read", false);
      }

      return data || [];
    },
  });

  /* ─────────────────────────────────────────────
     5) Send message
     ───────────────────────────────────────────── */
  const sendMessageMutation = useMutation({
    mutationFn: async (messageText) => {
      const text = (messageText || "").trim();
      if (!pid || !fid || !text) {
        // eslint-disable-next-line no-console
        console.log("[ChatModal] blocked send", { pid, fid, textLength: text.length });
        throw new Error("Invalid message");
      }

      const { error } = await supabase.from("chat_messages").insert({
        sender_id: pid,
        receiver_id: fid,
        message: text,
        is_read: false,
        created_at: new Date().toISOString(),
      });

      if (error) throw error;
      return true;
    },
    onSuccess: () => {
      setChatMessage("");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      queryClient.invalidateQueries({ queryKey: ["chat-messages", pid, fid] });
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 120);
    },
    onError: (err) => {
      // eslint-disable-next-line no-console
      console.error("[ChatModal] Failed to send:", err);
    },
  });

  const canSend = Boolean(pid && fid && chatMessage.trim() && !sendMessageMutation.isLoading);

  const sendMessage = () => {
    if (!canSend) return;
    sendMessageMutation.mutate(chatMessage);
  };

  /* ─────────────────────────────────────────────
     6) Auto-scroll
     ───────────────────────────────────────────── */
  useEffect(() => {
    if (chatMessages.length > 0 && scrollViewRef.current) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [chatMessages.length]);

  if (!fontsLoaded) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
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
            {/* Header */}
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

            {/* Messages */}
            <ScrollView
              ref={scrollViewRef}
              style={{ flex: 1, padding: 16 }}
              showsVerticalScrollIndicator={false}
            >
              {chatMessages.length === 0 ? (
                <View style={{ alignItems: "center", paddingVertical: 40 }}>
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
                chatMessages.map((message) => (
                  <View
                    key={message.id}
                    style={{
                      alignSelf:
                        message.sender_id === pid ? "flex-end" : "flex-start",
                      backgroundColor:
                        message.sender_id === pid
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
                          message.sender_id === pid ? "#FFFFFF" : colors.text,
                        fontSize: 14,
                        fontFamily: "Inter_400Regular",
                      }}
                    >
                      {message.message}
                    </Text>
                    <Text
                      style={{
                        color:
                          message.sender_id === pid
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

            {/* Composer */}
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
                disabled={!canSend}
                style={{
                  backgroundColor: colors.gameAccent1,
                  borderRadius: 20,
                  padding: 10,
                  opacity: canSend ? 1 : 0.5,
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
