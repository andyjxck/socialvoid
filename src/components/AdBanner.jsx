// /components/AdBanner.jsx
import React, { useMemo } from "react";
import { Platform, View, Text } from "react-native";
import Constants from "expo-constants";

const IOS_TEST_BANNER = "ca-app-pub-3940256099942544/2934735716";
const IOS_PROD_BANNER = "ca-app-pub-1505977777207758/7054084507";

const ANDROID_TEST_BANNER = "ca-app-pub-3940256099942544/6300978111";
const ANDROID_PROD_BANNER = "ca-app-pub-1505977777207758/7757997362";

export default function AdBanner() {
  const isExpoGo =
    Constants?.appOwnership === "expo" ||
    Constants?.executionEnvironment === "storeClient";

  const adUnitId = useMemo(() => {
    if (isExpoGo) return null;

    if (__DEV__) {
      return Platform.OS === "ios" ? IOS_TEST_BANNER : ANDROID_TEST_BANNER;
    }
    return Platform.OS === "ios" ? IOS_PROD_BANNER : ANDROID_PROD_BANNER;
  }, [isExpoGo]);

  // Placeholder while running in Expo Go
  if (!adUnitId) {
    return (
      <View
        style={{
          alignItems: "center",
          justifyContent: "center",
          width: "95%",
          marginHorizontal: "2.5%",
          paddingVertical: 6,
        }}
      >
        <View
          style={{
            height: 50,
            width: "100%",
            borderRadius: 8,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.2)",
            backgroundColor: "rgba(255,255,255,0.06)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: "rgba(255,255,255,0.7)" }}>
            [Ad Placeholder — Expo Go]
          </Text>
        </View>
      </View>
    );
  }

  const { BannerAd, BannerAdSize } = require("react-native-google-mobile-ads");

  return (
    <View
      style={{
        alignItems: "center",
        justifyContent: "center",
        width: "95%",
        marginHorizontal: "2.5%",
      }}
    >
      <BannerAd
        unitId={adUnitId}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{ requestNonPersonalizedAdsOnly: false }}
        onAdLoaded={() => console.log("[AdBanner] loaded")}
        onAdFailedToLoad={(e) =>
          console.warn("[AdBanner] failed to load:", e?.message || e)
        }
      />
    </View>
  );
}
