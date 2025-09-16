// screens/LoginScreen.debug.jsx
import React, { useState, useCallback } from "react";
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
  StyleSheet,
  SafeAreaView,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../utils/theme";
import { BlurView } from "expo-blur";
import { router } from "expo-router";
import { ArrowLeft, Hash, Eye, EyeOff } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQueryClient } from "@tanstack/react-query";
import AccountCreationModal from "../components/AccountCreationModal";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";

// ✅ Supabase client
import { supabase } from "../utils/supabase";

/**
 * Debug-friendly Login Screen (Supabase-only)
 *
 * - No API calls, no raw SQL
 * - Direct Supabase query to validate user_id + pin_code
 * - On-screen debug log to help trace flows
 * - Stores internal player.id in AsyncStorage under "puzzle_hub_player_id"
 */

// === Configure these if your schema differs ===
const SUPABASE_TABLE = "players";
const COL_USER_ID = "user_id";
const COL_PIN = "pin_code";
const COL_ID = "id";
const COL_USERNAME = "username";
// =============================================

const LOGIN_TIMEOUT_MS = 8000;

export default function LoginScreenDebug() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const queryClient = useQueryClient();

  const [userId, setUserId] = useState(""); // public user_id (string or numeric)
  const [pinCode, setPinCode] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);

  // On-screen debug log (keeps last ~12 entries)
  const [debugLog, setDebugLog] = useState([]);
  const pushLog = useCallback((line) => {
    console.log(line);
    setDebugLog((s) => {
      const next = [...s, `${new Date().toISOString()} — ${line}`];
      return next.slice(-12);
    });
  }, []);

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  const validateInputs = () => {
    pushLog("Validating inputs");
    if (!userId || userId.toString().trim().length === 0) {
      Alert.alert("Error", "Please enter your User ID");
      pushLog("Validation failed: missing userId");
      return false;
    }
    if (!/^\d+$/.test(userId.toString().trim())) {
      Alert.alert("Error", "User ID must be numeric");
      pushLog("Validation failed: userId not numeric");
      return false;
    }
    if (pinCode.length !== 4 || !/^\d{4}$/.test(pinCode)) {
      Alert.alert("Error", "PIN code must be exactly 4 digits");
      pushLog("Validation failed: pin code invalid");
      return false;
    }
    pushLog("Inputs valid");
    return true;
  };

  // Supabase login with timeout protection
  const supabaseLogin = async (user_id, pin, signal) => {
    pushLog("Attempting Supabase login (direct query)");
    try {
      // NOTE: Some schemas store user_id as text; we try numeric first and gracefully fall back.
      const numericUserId = Number.isFinite(+user_id) ? parseInt(user_id, 10) : user_id;

      const query = supabase
        .from(SUPABASE_TABLE)
        .select("*")
        .eq(COL_USER_ID, numericUserId)
        .eq(COL_PIN, pin)
        .maybeSingle();

      // AbortController shim for fetch-based clients (signal handled internally by supabase-js where supported)
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Login timed out")), LOGIN_TIMEOUT_MS)
      );

      // Race timeout vs query
      // supabase-js doesn't natively support AbortSignal everywhere; this keeps UX consistent
      const result = await Promise.race([query, timeout]);

      if (!result) {
        pushLog("Supabase: empty result object");
        return { success: false, error: "Unexpected empty response" };
      }

      const { data, error } = result;

      if (error) {
        pushLog(`Supabase error: ${JSON.stringify(error)}`);
        return { success: false, error: error.message || "Supabase error" };
      }
      if (!data) {
        pushLog("Supabase: no player found (invalid credentials)");
        return { success: false, error: "Invalid credentials" };
      }

      pushLog(`Supabase: found player ${data[COL_ID]} for user_id=${data[COL_USER_ID]}`);
      return { success: true, player: data };
    } catch (err) {
      pushLog(`Supabase login threw: ${err.message}`);
      return { success: false, error: err.message || "Supabase error" };
    }
  };

  const handleLogin = async () => {
    pushLog("HANDLE LOGIN CALLED");
    if (!validateInputs()) return;

    setIsLoading(true);
    Keyboard.dismiss();

    try {
      // Keep signature compatible in case you later wire an AbortController
      const result = await supabaseLogin(userId, pinCode, null);

      if (result.success) {
        const player = result.player;
        pushLog(`Logged in as player.id=${player[COL_ID]} user_id=${player[COL_USER_ID]}`);

        // Save internal id (player.id) — this is what the rest of app expects
        await AsyncStorage.setItem("puzzle_hub_player_id", player[COL_ID].toString());
        pushLog("Saved puzzle_hub_player_id to AsyncStorage");

        try {
          queryClient.clear();
          pushLog("Cleared React Query cache");
        } catch (e) {
          pushLog("Failed to clear React Query cache: " + e.message);
        }

        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        Alert.alert(
          "Login Successful 🎉",
          `Welcome back, ${player[COL_USERNAME] || "player"}!`,
          [{ text: "Continue", onPress: () => router.replace("/(tabs)/home") }]
        );
      } else {
        pushLog("Login failed: " + (result.error || "unknown"));
        Alert.alert("Login Failed", result.error || "Invalid credentials");
      }
    } catch (err) {
      pushLog("Unhandled login exception: " + (err.message || String(err)));
      console.error("Login error", err);
      Alert.alert("Error", "Unexpected error during login. See debug log in app.");
    } finally {
      setIsLoading(false);
      pushLog("handleLogin finished, isLoading=false");
    }
  };

  const handleAccountCreated = async (newPlayer) => {
    pushLog("handleAccountCreated called");
    await AsyncStorage.setItem("puzzle_hub_player_id", newPlayer[COL_ID].toString());
    try {
      queryClient.clear();
    } catch (e) {
      // ignore
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert("Account Created & Logged In 🎉", `Welcome ${newPlayer[COL_USERNAME]}!`, [
      { text: "Continue", onPress: () => router.replace("/(tabs)") },
    ]);
  };

  if (!fontsLoaded) return null;

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <LinearGradient
        colors={
          isDark
            ? ["rgba(17, 24, 39, 1)", "rgba(31, 41, 55, 0.8)"]
            : ["rgba(139, 92, 246, 0.1)", "rgba(255, 255, 255, 0.9)"]
        }
        style={StyleSheet.absoluteFill}
      />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingTop: insets.top + 16,
            paddingHorizontal: 20,
            paddingBottom: 24,
          }}
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
            <TouchableOpacity
              onPress={() => router.back()}
              style={{ padding: 8, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.06)" }}
            >
              <ArrowLeft size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 24, color: colors.text }}>Login</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Form */}
          <View style={{ borderRadius: 16, overflow: "hidden", marginBottom: 24 }}>
            <BlurView
              intensity={isDark ? 60 : 80}
              tint={isDark ? "dark" : "light"}
              style={{ padding: 20, borderRadius: 16 }}
            >
              <Text style={{ fontFamily: "Inter_600SemiBold", marginBottom: 8, color: colors.text }}>
                User ID
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: colors.glassSecondary,
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  marginBottom: 12,
                }}
              >
                <Hash size={20} color={colors.textSecondary} />
                <TextInput
                  value={userId}
                  onChangeText={setUserId}
                  placeholder="Enter your User ID"
                  placeholderTextColor={colors.textSecondary}
                  style={{ flex: 1, marginLeft: 12, color: colors.text }}
                  keyboardType="numeric"
                  returnKeyType="next"
                  autoCapitalize="none"
                />
              </View>

              <Text style={{ fontFamily: "Inter_600SemiBold", marginBottom: 8, color: colors.text }}>
                PIN Code
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: colors.glassSecondary,
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  marginBottom: 16,
                }}
              >
                <TextInput
                  value={pinCode}
                  onChangeText={setPinCode}
                  placeholder="Enter 4-digit PIN"
                  placeholderTextColor={colors.textSecondary}
                  style={{ flex: 1, color: colors.text }}
                  keyboardType="numeric"
                  maxLength={4}
                  secureTextEntry={!showPin}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                />
                <TouchableOpacity onPress={() => setShowPin((s) => !s)} style={{ padding: 6 }}>
                  {showPin ? (
                    <EyeOff size={20} color={colors.textSecondary} />
                  ) : (
                    <Eye size={20} color={colors.textSecondary} />
                  )}
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                onPress={handleLogin}
                disabled={isLoading}
                style={{
                  backgroundColor: isLoading ? colors.textSecondary : colors.primaryButton,
                  paddingVertical: 14,
                  borderRadius: 12,
                  alignItems: "center",
                  marginBottom: 12,
                }}
              >
                <Text style={{ fontFamily: "Inter_600SemiBold", color: colors.primaryButtonText }}>
                  {isLoading ? "Logging in..." : "Login"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setShowAccountModal(true)}
                style={{
                  backgroundColor: colors.secondaryButton,
                  paddingVertical: 12,
                  borderRadius: 12,
                  alignItems: "center",
                }}
              >
                <Text style={{ fontFamily: "Inter_600SemiBold", color: colors.secondaryButtonText }}>
                  Create New Account
                </Text>
              </TouchableOpacity>
            </BlurView>
          </View>

          {/* Debug Log */}
          {debugLog.length > 0 && (
            <View
              style={{
                borderRadius: 12,
                overflow: "hidden",
                backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
              }}
            >
              <Text
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  fontFamily: "Inter_600SemiBold",
                  color: colors.text,
                }}
              >
                Debug Log
              </Text>
              <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
                {debugLog.map((line, idx) => (
                  <Text
                    key={`${idx}-${line}`}
                    style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colors.textSecondary, marginBottom: 4 }}
                  >
                    {line}
                  </Text>
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <AccountCreationModal
        visible={showAccountModal}
        onClose={() => setShowAccountModal(false)}
        onSuccess={handleAccountCreated}
      />
    </SafeAreaView>
  );
}
