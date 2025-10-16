// components/PromoSocialVoidCard.jsx  (REPLACE ENTIRE FILE)
import React, { useRef } from "react";
import { View, Text, Pressable, Linking, Alert, Animated, Easing, Image } from "react-native";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import { useTheme } from "../utils/theme";
import { ChevronRight } from "lucide-react-native";

function normalizeUrl(u) {
  if (!u) return "";
  const s = String(u).trim();
  if (/^https?:\/\//i.test(s)) return s;
  if (/^www\./i.test(s)) return `https://${s}`;
  return `https://${s}`;
}

export default function PromoSocialVoidCard({
  title = "Social Void",
  subtitle = "Merge your way back to bed",
  url = "https://apps.apple.com/gb/app/social-void/id6751636874",
  badge = "FREE",
  logo = require("../../assets/images/logo.png"),
  accent = "#00D1B2",
}) {
  const { colors } = useTheme();
  const pulse = useRef(new Animated.Value(0)).current;

  const startPulse = () => {
    pulse.setValue(0);
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1100, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1100, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ])
    ).start();
  };
  const stopPulse = () => {
    pulse.stopAnimation();
    pulse.setValue(0);
  };

  const handlePress = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const finalUrl = normalizeUrl(url);

    try {
      // Try native Linking first
      await Linking.openURL(finalUrl);
    } catch (e) {
      // Fallback to in-app browser (more forgiving)
      try {
        await WebBrowser.openBrowserAsync(finalUrl);
      } catch {
        Alert.alert("Unable to open link", "Please try again later.");
      }
    }
  };

  const accentColor = accent;
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0.4] });

  return (
    <Pressable
      onPressIn={startPulse}
      onPressOut={stopPulse}
      onPress={handlePress}
      style={({ pressed }) => ({
        transform: [{ scale: pressed ? 0.98 : 1 }],
        marginBottom: 12,
      })}
    >
      <View
        style={{
          height: 120,
          borderRadius: 16,
          overflow: "hidden",
          backgroundColor: colors.glassSecondary,
          borderWidth: 0.5,
          borderColor: colors.border,
        }}
      >
        <BlurView intensity={40} tint="dark" style={{ flex: 1, borderRadius: 16 }}>
          {/* Soft glow */}
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              inset: 0,
              opacity: glowOpacity,
              backgroundColor: `${accentColor}33`,
            }}
          />
          <View style={{ flex: 1, padding: 16 }}>
            {/* Top row: logo box + badge + chevron */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <Animated.View
                style={{
                  transform: [{ scale }],
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  backgroundColor: `${accentColor}15`,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 0.5,
                  borderColor: `${accentColor}30`,
                }}
              >
                <Image source={logo} resizeMode="contain" style={{ width: 22, height: 22 }} />
              </Animated.View>

              <View style={{ flexDirection: "row", alignItems: "center" }}>
                {!!badge && (
                  <View
                    style={{
                      paddingHorizontal: 8,
                      height: 22,
                      borderRadius: 11,
                      backgroundColor: `${accentColor}26`,
                      alignItems: "center",
                      justifyContent: "center",
                      borderWidth: 0.5,
                      borderColor: `${accentColor}55`,
                      marginRight: 6,
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: "700", color: accentColor, letterSpacing: 0.4 }}>
                      {badge}
                    </Text>
                  </View>
                )}
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: `${accentColor}20`,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 0.5,
                    borderColor: `${accentColor}40`,
                  }}
                >
                  <ChevronRight size={14} color={accentColor} />
                </View>
              </View>
            </View>

            {/* Title + subtitle + CTA label */}
            <View style={{ flex: 1, justifyContent: "space-between" }}>
              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 16, color: colors.text, marginBottom: 4 }}>
                {title}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.textSecondary }} numberOfLines={1}>
                  {subtitle}
                </Text>
                <Text
                  style={{
                    fontFamily: "Inter_600SemiBold",
                    fontSize: 11,
                    color: accentColor,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    marginLeft: 5,
                  }}
                >
                  Open
                </Text>
              </View>
            </View>
          </View>
        </BlurView>
      </View>
    </Pressable>
  );
}
