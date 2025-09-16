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
import { supabase } from "../utils/supabase"; // <-- make sure you export client here

const { height: screenHeight } = Dimensions.get("window");

export default function AccountCreationModal({ visible, onClose, onSuccess }) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [userId, setUserId] = useState("");
  const [pinCode, setPinCode] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [username, setUsername] = useState("");
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

  // When modal opens: suggest next ID + random username
  useEffect(() => {
    if (visible) {
      fetchNextUserId();
      setUsername(`Player${Math.floor(Math.random() * 10000)}`);
      setPinCode("");
      setConfirmPin("");
      setKeyboardHeight(0);
    }
  }, [visible]);

  const fetchNextUserId = async () => {
    try {
      const { data, error } = await supabase
        .from("players")
        .select("id")
        .order("id", { ascending: false })
        .limit(1)
        .single();

      if (error) throw error;

      const next = (data?.id || 0) + 1;
      setSuggestedUserId(next.toString());
      setUserId(next.toString());
    } catch (err) {
      console.error("Failed to fetch next user ID:", err);
      setSuggestedUserId("1");
      setUserId("1");
    }
  };

  const validateInputs = () => {
    if (!username.trim()) {
      Alert.alert("Error", "Please enter a username");
      return false;
    }
    if (username.length < 3) {
      Alert.alert("Error", "Username must be at least 3 characters long");
      return false;
    }
    if (!userId || parseInt(userId) < 1) {
      Alert.alert("Error", "Please enter a valid User ID (1 or higher)");
      return false;
    }
    if (pinCode.length !== 4 || !/^\d{4}$/.test(pinCode)) {
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
      const { data, error } = await supabase.from("players").insert([
        {
          id: parseInt(userId),
          username: username.trim(),
          pin_code: pinCode,
        },
      ]).select().single();

      if (error) {
        if (error.code === "23505") {
          Alert.alert("Error", "User ID or Username already exists");
        } else {
          Alert.alert("Error", error.message || "Failed to create account");
        }
        return;
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      Alert.alert(
        "Account Created! 🎉",
        `Welcome ${username}!\n\nYour User ID: ${userId}\nYour PIN: ${pinCode}\n\nPlease remember these for logging in!`,
        [
          {
            text: "Got it!",
            onPress: () => {
              onSuccess(data);
              onClose();
            },
          },
        ]
      );
    } catch (err) {
      console.error("Account creation error:", err);
      Alert.alert("Error", "Failed to create account. Please try again.");
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
        {/* the rest of your UI is unchanged */}
      </KeyboardAvoidingView>
    </View>
  );
}
