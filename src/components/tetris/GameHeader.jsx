// components/GameHeader.jsx  (REPLACE ENTIRE FILE)
import React, { useRef } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ArrowLeft, RotateCcw, Trophy } from "lucide-react-native";
import { useTheme } from "../../utils/theme";

/**
 * Props:
 * - title?: string                // header title (default "Block Rise")
 * - onRestart?: () => void        // restart callback
 * - onBack?: () => Promise<void> | void // called before navigating back (end session etc.)
 * - onShowAchievements?: () => void     // open achievements modal
 */
export default function GameHeader({ title = "Block Rise", onRestart, onBack, onShowAchievements }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const backInFlight = useRef(false);
  const achInFlight = useRef(false);

  const handleBackPress = async () => {
    if (backInFlight.current) return;
    backInFlight.current = true;
    try {
      if (typeof onBack === "function") {
        await onBack(); // ensure endGame/session close happens before leaving
      }
    } catch {
      // swallow; still navigate back
    } finally {
      try { router.back(); } catch {}
      backInFlight.current = false;
    }
  };

  const handleRestartPress = () => {
    if (typeof onRestart === "function") onRestart();
  };

  const handleAchievementsPress = async () => {
    if (achInFlight.current) return;
    achInFlight.current = true;
    try {
      if (typeof onShowAchievements === "function") onShowAchievements();
    } finally {
      achInFlight.current = false;
    }
  };

  return (
    <View
      style={{
        paddingTop: insets.top + 16,
        paddingHorizontal: 20,
        marginBottom: 20,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        {/* Back */}
        <TouchableOpacity
          onPress={handleBackPress}
          style={{
            padding: 8,
            borderRadius: 12,
            backgroundColor: colors.glassSecondary,
          }}
          accessibilityLabel="Back"
        >
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>

        {/* Title */}
        <Text
          style={{
            fontFamily: "Inter_700Bold",
            fontSize: 20,
            color: colors.text,
          }}
          numberOfLines={1}
        >
          {title}
        </Text>

        {/* Actions: Achievements + Restart */}
        <View style={{ flexDirection: "row", columnGap: 8 }}>
          <TouchableOpacity
            onPress={handleAchievementsPress}
            style={{
              padding: 8,
              borderRadius: 12,
              backgroundColor: colors.glassSecondary,
            }}
            accessibilityLabel="Achievements"
          >
            <Trophy size={22} color={colors.text} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleRestartPress}
            style={{
              padding: 8,
              borderRadius: 12,
              backgroundColor: colors.glassSecondary,
            }}
            accessibilityLabel="Restart"
          >
            <RotateCcw size={24} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
