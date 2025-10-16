// components/InstagramGameCard.jsx  (CREATE THIS FILE)
import React, { useRef } from "react";
import { View, Text, Pressable, Linking, Alert, Animated, Easing, Image } from "react-native";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { useTheme } from "../utils/theme";
import { ChevronRight } from "lucide-react-native";

export default function InstagramGameCard({
  title = "Follow Us",
  subtitle = "Support us on instagram",
  url = "https://www.instagram.com/anandysocialgame",
  accent = "#E1306C", // Instagram brand accent
}) {
  const { colors } = useTheme();
  const pulse = useRef(new Animated.Value(0)).current;

  const startPulse = () => {
    pulse.setValue(0);
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1200, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ])
    ).start();
  };

  const stopPulse = () => {
    pulse.stopAnimation();
    pulse.setValue(0);
  };

  const handlePress = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) throw new Error("unsupported");
      await Linking.openURL(url);
    } catch {
      Alert.alert("Unable to open link", "Please try again later.");
    }
  };

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
          {/* Soft brand glow */}
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              inset: 0,
              opacity: glowOpacity,
              backgroundColor: `${accent}33`,
            }}
          />
          <View style={{ flex: 1, padding: 16 }}>
            {/* Icon + chevron */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <Animated.View
                style={{
                  transform: [{ scale }],
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  backgroundColor: `${accent}15`,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 0.5,
                  borderColor: `${accent}30`,
                }}
              >
                <Image
                  source={require("../../assets/images/instagram.png")} // put the logo here
                  style={{ width: 22, height: 22, borderRadius: 4 }}
                  resizeMode="contain"
                />
              </Animated.View>

              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: `${accent}20`,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 0.5,
                  borderColor: `${accent}40`,
                }}
              >
                <ChevronRight size={14} color={accent} />
              </View>
            </View>

            {/* Title, subtitle, CTA */}
            <View style={{ flex: 1, justifyContent: "space-between" }}>
              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 16, color: colors.text, marginBottom: 4 }}>
                {title}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ fontFamily: "Inter_500Medium", fontSize: 9, color: colors.textSecondary }} numberOfLines={1}>
                  {subtitle}
                </Text>
                <Text
                  style={{
                    fontFamily: "Inter_600SemiBold",
                    fontSize: 11,
                    color: accent,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    
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
