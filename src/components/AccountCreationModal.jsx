import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Dimensions,
} from "react-native";
import { BlurView } from "expo-blur";
import { useTheme } from "../utils/theme";
import { X, User, Hash, Eye, EyeOff } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import { supabase } from "../utils/supabase";

const { height: screenHeight } = Dimensions.get("window");

export default function AccountCreationModal({ visible, onClose, onSuccess }) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [userId, setUserId] = useState("");          // players.user_id (INTEGER)
  const [pinCode, setPinCode] = useState("");        // players.pin_code (VARCHAR(4))
  const [confirmPin, setConfirmPin] = useState("");
  const [username, setUsername] = useState("");      // players.username (TEXT)
  const [showPin, setShowPin] = useState(false);
  const [showConfirmPin, setShowConfirmPin] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [suggestedUserId, setSuggestedUserId] = useState("");
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // Keyboard listeners
  useEffect(() => {
    const showListener = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      (e) => setKeyboardHeight(e.endCoordinates.height)
    );
    const hideListener = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setKeyboardHeight(0)
    );
    return () => {
      showListener.remove();
      hideListener.remove();
    };
  }, []);

  // When modal opens: suggest next lowest available user_id + random username
  useEffect(() => {
    if (visible) {
      suggestLowestAvailableUserId();
      setUsername(`Player${Math.floor(Math.random() * 10000)}`);
      setPinCode("");
      setConfirmPin("");
      setKeyboardHeight(0);
    }
  }, [visible]);

  // Find LOWEST available user_id (fills gaps 1..N)
  const suggestLowestAvailableUserId = async () => {
    try {
      const { data, error } = await supabase
        .from("players")
        .select("user_id")
        .order("user_id", { ascending: true });

      if (error) throw error;

      let expected = 1;
      for (const row of data || []) {
        const uid = Number(row.user_id);
        if (!Number.isFinite(uid)) continue;
        if (uid > expected) break;        // gap found
        if (uid === expected) expected++; // keep scanning
      }

      const nextId = String(expected);
      setSuggestedUserId(nextId);
      setUserId(nextId);
    } catch (err) {
      console.error("Failed to compute lowest available user_id:", err);
      setSuggestedUserId("1");
      setUserId("1");
    }
  };

  const validateInputs = () => {
    const cleanUsername = username.trim();

    if (!cleanUsername) {
      Alert.alert("Error", "Please enter a username");
      return false;
    }
    if (cleanUsername.length < 3) {
      Alert.alert("Error", "Username must be at least 3 characters long");
      return false;
    }
    if (!/^\d+$/.test(userId)) {
      Alert.alert("Error", "User ID must be a positive integer");
      return false;
    }
    const numericId = Number(userId);
    if (!Number.isFinite(numericId) || numericId < 1) {
      Alert.alert("Error", "Please enter a valid User ID (1 or higher)");
      return false;
    }
    if (!/^\d{4}$/.test(pinCode)) {
      Alert.alert("Error", "PIN code must be exactly 4 digits");
      return false;
    }
    if (pinCode !== confirmPin) {
      Alert.alert("Error", "PIN codes don't match");
      return false;
    }
    return true;
  };

  const handleCreateAccount = async () => {
    if (!validateInputs()) return;

    setIsLoading(true);
    Keyboard.dismiss();

    try {
      const numericId = Number(userId);

      // 1) PRE-CHECK user_id so we fail fast with a clear message
      const { data: existing, error: existErr } = await supabase
        .from("players")
        .select("user_id")
        .eq("user_id", numericId)
        .maybeSingle();

      if (existErr) throw existErr;
      if (existing) {
        Alert.alert("Error", `User ID ${numericId} is already taken. Choose another.`);
        setIsLoading(false);
        return;
      }

      // 2) INSERT with correct types (cast user_id to number)
      const { data, error } = await supabase
        .from("players")
        .insert([
          {
            user_id: numericId,            // INTEGER (explicitly numeric)
            username: username.trim(),     // TEXT (duplicates allowed)
            pin_code: pinCode,             // VARCHAR(4)
          },
        ])
        .select()
        .single();

      if (error) {
        // Show the real DB error so we know exactly what's failing
        Alert.alert("Error", `${error.code || ""} ${error.message || "Insert failed"}`.trim());
        setIsLoading(false);
        return;
      }

      try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}

      Alert.alert(
        "Account Created! 🎉",
        `Welcome ${username}!\n\nYour User ID: ${userId}\nYour PIN: ${pinCode}\n\nPlease remember these for logging in!`,
        [
          {
            text: "Got it!",
            onPress: () => {
              onSuccess?.(data);
              onClose?.();
            },
          },
        ]
      );
    } catch (err) {
      console.error("Account creation error:", err);
      const msg = typeof err?.message === "string" ? err.message : "Failed to create account. Please try again.";
      Alert.alert("Error", msg);
    } finally {
      setIsLoading(false);
    }
  };

  if (!visible || !fontsLoaded) return null;

  const modalMaxHeight =
    screenHeight - insets.top - insets.bottom - keyboardHeight - 40;
  const modalTopOffset =
    keyboardHeight > 0
      ? Math.max(
          insets.top + 20,
          (screenHeight - modalMaxHeight - keyboardHeight) / 3
        )
      : undefined;

  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.7)",
        justifyContent: keyboardHeight > 0 ? "flex-start" : "center",
        alignItems: "center",
        zIndex: 1000,
        paddingTop: modalTopOffset,
      }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "position" : "height"}
        style={{ width: "100%", alignItems: "center" }}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <View
          style={{
            borderRadius: 20,
            overflow: "hidden",
            margin: 20,
            width: "90%",
            maxWidth: 400,
            maxHeight: modalMaxHeight,
          }}
        >
          <BlurView
            intensity={isDark ? 80 : 100}
            tint={isDark ? "dark" : "light"}
            style={{
              backgroundColor: isDark
                ? "rgba(31, 41, 55, 0.95)"
                : "rgba(255, 255, 255, 0.95)",
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 20,
            }}
          >
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ padding: 24 }}
              keyboardShouldPersistTaps="handled"
            >
              {/* Header */}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 24,
                }}
              >
                <Text
                  style={{
                    fontFamily: "Inter_700Bold",
                    fontSize: 20,
                    color: colors.text,
                  }}
                >
                  Create Account
                </Text>

                <TouchableOpacity
                  onPress={onClose}
                  style={{
                    padding: 8,
                    borderRadius: 12,
                    backgroundColor: colors.glassSecondary,
                  }}
                >
                  <X size={20} color={colors.text} />
                </TouchableOpacity>
              </View>

              {/* Username */}
              <View style={{ marginBottom: 20 }}>
                <Text
                  style={{
                    fontFamily: "Inter_600SemiBold",
                    fontSize: 14,
                    color: colors.text,
                    marginBottom: 8,
                  }}
                >
                  Username
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: colors.glassSecondary,
                    borderRadius: 12,
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <User size={20} color={colors.textSecondary} />
                  <TextInput
                    value={username}
                    onChangeText={setUsername}
                    placeholder="Enter username"
                    placeholderTextColor={colors.textSecondary}
                    style={{
                      flex: 1,
                      marginLeft: 12,
                      fontFamily: "Inter_500Medium",
                      fontSize: 16,
                      color: colors.text,
                    }}
                    maxLength={20}
                    autoCapitalize="none"
                    returnKeyType="next"
                  />
                </View>
              </View>

              {/* User ID */}
              <View style={{ marginBottom: 20 }}>
                <Text
                  style={{
                    fontFamily: "Inter_600SemiBold",
                    fontSize: 14,
                    color: colors.text,
                    marginBottom: 8,
                  }}
                >
                  User ID
                </Text>
                <Text
                  style={{
                    fontFamily: "Inter_400Regular",
                    fontSize: 12,
                    color: colors.textSecondary,
                    marginBottom: 8,
                  }}
                >
                  Lowest available: {suggestedUserId} (you can customize this)
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: colors.glassSecondary,
                    borderRadius: 12,
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Hash size={20} color={colors.textSecondary} />
                  <TextInput
                    value={userId}
                    onChangeText={(v) => {
                      const onlyDigits = v.replace(/\D+/g, "");
                      setUserId(onlyDigits);
                    }}
                    placeholder="Enter User ID"
                    placeholderTextColor={colors.textSecondary}
                    style={{
                      flex: 1,
                      marginLeft: 12,
                      fontFamily: "Inter_500Medium",
                      fontSize: 16,
                      color: colors.text,
                    }}
                    keyboardType="numeric"
                    returnKeyType="next"
                  />
                </View>
              </View>

              {/* PIN */}
              <View style={{ marginBottom: 20 }}>
                <Text
                  style={{
                    fontFamily: "Inter_600SemiBold",
                    fontSize: 14,
                    color: colors.text,
                    marginBottom: 8,
                  }}
                >
                  PIN Code (4 digits)
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: colors.glassSecondary,
                    borderRadius: 12,
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <TextInput
                    value={pinCode}
                    onChangeText={(v) => setPinCode(v.replace(/\D+/g, "").slice(0, 4))}
                    placeholder="Enter 4-digit PIN"
                    placeholderTextColor={colors.textSecondary}
                    style={{
                      flex: 1,
                      fontFamily: "Inter_500Medium",
                      fontSize: 16,
                      color: colors.text,
                    }}
                    keyboardType="numeric"
                    maxLength={4}
                    secureTextEntry={!showPin}
                    returnKeyType="next"
                  />
                  <TouchableOpacity onPress={() => setShowPin(!showPin)} style={{ padding: 4 }}>
                    {showPin ? (
                      <EyeOff size={20} color={colors.textSecondary} />
                    ) : (
                      <Eye size={20} color={colors.textSecondary} />
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {/* Confirm PIN */}
              <View style={{ marginBottom: 24 }}>
                <Text
                  style={{
                    fontFamily: "Inter_600SemiBold",
                    fontSize: 14,
                    color: colors.text,
                    marginBottom: 8,
                  }}
                >
                  Confirm PIN Code
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: colors.glassSecondary,
                    borderRadius: 12,
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <TextInput
                    value={confirmPin}
                    onChangeText={(v) => setConfirmPin(v.replace(/\D+/g, "").slice(0, 4))}
                    placeholder="Confirm 4-digit PIN"
                    placeholderTextColor={colors.textSecondary}
                    style={{
                      flex: 1,
                      fontFamily: "Inter_500Medium",
                      fontSize: 16,
                      color: colors.text,
                    }}
                    keyboardType="numeric"
                    maxLength={4}
                    secureTextEntry={!showConfirmPin}
                    returnKeyType="done"
                    onSubmitEditing={handleCreateAccount}
                  />
                  <TouchableOpacity onPress={() => setShowConfirmPin(!showConfirmPin)} style={{ padding: 4 }}>
                    {showConfirmPin ? (
                      <EyeOff size={20} color={colors.textSecondary} />
                    ) : (
                      <Eye size={20} color={colors.textSecondary} />
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {/* Buttons */}
              <View style={{ flexDirection: "row", gap: 12 }}>
                <TouchableOpacity
                  onPress={onClose}
                  style={{
                    flex: 1,
                    backgroundColor: colors.secondaryButton,
                    paddingVertical: 14,
                    borderRadius: 12,
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "Inter_600SemiBold",
                      fontSize: 16,
                      color: colors.secondaryButtonText,
                    }}
                  >
                    Cancel
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleCreateAccount}
                  disabled={isLoading}
                  style={{
                    flex: 1,
                    backgroundColor: isLoading ? colors.textSecondary : colors.primaryButton,
                    paddingVertical: 14,
                    borderRadius: 12,
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "Inter_600SemiBold",
                      fontSize: 16,
                      color: colors.primaryButtonText,
                    }}
                  >
                    {isLoading ? "Creating..." : "Create Account"}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </BlurView>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
