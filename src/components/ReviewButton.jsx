// /components/ReviewButton.jsx
import React from "react";
import { View, Text, TouchableOpacity, Platform, Linking, Alert } from "react-native";
import * as StoreReview from "expo-store-review";
import { BlurView } from "expo-blur";

export default function ReviewButton() {
  const handleReview = async () => {
    try {
      const isAvailable = await StoreReview.isAvailableAsync();
      if (isAvailable) {
        await StoreReview.requestReview();
      } else {
        // Fallback: open store listing manually
        const iosUrl = "https://apps.apple.com/app/idYOUR_APP_ID_HERE";
        const androidUrl = "https://play.google.com/store/apps/details?id=YOUR_PACKAGE_NAME_HERE";
        const storeUrl = Platform.OS === "ios" ? iosUrl : androidUrl;
        await Linking.openURL(storeUrl);
      }
    } catch (err) {
      Alert.alert("Error", "Could not open the review page.");
    }
  };

  return (
    <BlurView
      intensity={50}
      tint="dark"
      style={{
        borderRadius: 16,
        overflow: "hidden",
        marginTop: 20,
      }}
    >
      <TouchableOpacity
        onPress={handleReview}
        style={{
          paddingVertical: 12,
          paddingHorizontal: 20,
          alignItems: "center",
        }}
      >
        <Text
          style={{
            color: "white",
            fontWeight: "600",
            fontSize: 16,
          }}
        >
          ⭐ Enjoying the game? Review us!
        </Text>
      </TouchableOpacity>
    </BlurView>
  );
}
