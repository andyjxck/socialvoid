// mobile/src/components/ads/RewardedCTA.jsx
import React, { useEffect, useRef, useState } from "react";
import { TouchableOpacity, Text, ActivityIndicator, View } from "react-native";
import * as Haptics from "expo-haptics";
import { preloadRewarded, showRewardedOnce } from "../../utils/adsRewarded";

export default function RewardedCTA({
  label = "Watch Ad",
  cooldownSec = 60,
  onReward = () => {},
  onUnavailable = () => {}, 
  style,
  textStyle,
}) {
  const [cooldown, setCooldown] = useState(0);
  const tickingRef = useRef(null);

  useEffect(() => {
    // Preload when the button mounts (safe to call multiple times).
    preloadRewarded();
    return () => {
      if (tickingRef.current) clearInterval(tickingRef.current);
    };
  }, []);

  useEffect(() => {
    if (cooldown <= 0 && tickingRef.current) {
      clearInterval(tickingRef.current);
      tickingRef.current = null;
    }
  }, [cooldown]);

  const startCooldown = () => {
    setCooldown(cooldownSec);
    if (tickingRef.current) clearInterval(tickingRef.current);
    tickingRef.current = setInterval(() => {
      setCooldown((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
  };

  const handlePress = async () => {
    if (cooldown > 0) return;
    try {
      await Haptics.selectionAsync();
      const earned = await showRewardedOnce();
      if (earned) {
        onReward();
        startCooldown();
      } else {
        onUnavailable();
      }
    } catch {
      onUnavailable();
    }
  };

  const labelText = cooldown > 0 ? `${label} (in ${cooldown}s)` : label;

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={cooldown > 0}
      style={[
        {
          paddingVertical: 12,
          paddingHorizontal: 16,
          borderRadius: 12,
          alignItems: "center",
          justifyContent: "center",
          opacity: cooldown > 0 ? 0.6 : 1,
          backgroundColor: "rgba(255,255,255,0.12)",
        },
        style,
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {cooldown > 0 ? <ActivityIndicator /> : null}
        <Text style={[{ fontWeight: "600" }, textStyle]}>{labelText}</Text>
      </View>
    </TouchableOpacity>
  );
}
