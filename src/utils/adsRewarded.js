// mobile/src/utils/adsRewarded.js
// Rewarded ads helper that mirrors your AdBanner pattern.
// - Expo Go: shows a simple placeholder prompt (so flows work without native ads)
// - Dev/Prod builds: uses react-native-google-mobile-ads (RewardedAd)
// Exports:
//   preloadRewarded(): silently preloads (no-op in Expo Go)
//   showRewardedOnce(): resolves true only if user earns/simulates reward

import { Alert, Platform } from "react-native";
import Constants from "expo-constants";
import * as Haptics from "expo-haptics";

// ─── Your production rewarded unit ────────────────────────────────
const PROD_REWARDED_UNIT = "ca-app-pub-1505977777207758/9665797799";

// Google test rewarded units
const IOS_TEST_REWARDED = "ca-app-pub-3940256099942544/1712485313";
const ANDROID_TEST_REWARDED = "ca-app-pub-3940256099942544/5224354917";

// Expo Go detection (same style as your AdBanner)
const isExpoGo =
  Constants?.appOwnership === "expo" ||
  Constants?.executionEnvironment === "storeClient";

// Internal state
let rewardedAdInstance = null;
let currentUnitId = null;
let isLoading = false;
let isShowing = false;

function getUnitId() {
  if (__DEV__) {
    return Platform.OS === "ios" ? IOS_TEST_REWARDED : ANDROID_TEST_REWARDED;
  }
  return PROD_REWARDED_UNIT;
}

// Lazy require to avoid breaking Expo Go bundles at import time
function requireAds() {
  // eslint-disable-next-line global-require
  const ads = require("react-native-google-mobile-ads");
  return ads;
}

function ensureInstance() {
  const { RewardedAd } = requireAds();
  const unitId = getUnitId();
  if (!rewardedAdInstance || currentUnitId !== unitId) {
    currentUnitId = unitId;
    rewardedAdInstance = RewardedAd.createForAdRequest(unitId, {
      requestNonPersonalizedAdsOnly: false,
    });
  }
  return rewardedAdInstance;
}

// ──────────────────────────────────────────────────────────────────
// PUBLIC: Preload (no-op in Expo Go)
export async function preloadRewarded() {
  if (isExpoGo) return;

  try {
    if (isLoading || isShowing) return;
    const { default: mobileAds } = requireAds();
    await mobileAds().initialize().catch(() => {});
    const ad = ensureInstance();
    isLoading = true;
    ad.load();
  } catch {
    // ignore; retry next time
  } finally {
    isLoading = false;
  }
}

// ──────────────────────────────────────────────────────────────────
// PUBLIC: Show once → resolve true only if reward earned (or simulated in Expo Go)
export function showRewardedOnce() {
  if (isExpoGo) {
    // Expo Go placeholder — simple confirm to simulate reward
    return new Promise(async (resolve) => {
      try {
        await Haptics.selectionAsync();
      } catch {}
      Alert.alert(
        "Rewarded Ad (Expo Placeholder)",
        "Simulate a rewarded ad to continue?",
        [
          { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
          {
            text: "Simulate Reward",
            style: "default",
            onPress: () => resolve(true),
          },
        ]
      );
    });
  }

  return new Promise(async (resolve) => {
    try {
      const {
        default: mobileAds,
        AdEventType,
        RewardedAdEventType,
      } = requireAds();

      await mobileAds().initialize().catch(() => {});
      const ad = ensureInstance();

      if (isShowing) {
        // already showing; don't stack
        return resolve(false);
      }
      isShowing = true;

      let earned = false;

      const subLoaded = ad.addAdEventListener(AdEventType.LOADED, () => {
        ad.show().catch(() => cleanup(false));
      });

      const subClosed = ad.addAdEventListener(AdEventType.CLOSED, () => {
        cleanup(earned);
      });

      const subError = ad.addAdEventListener(AdEventType.ERROR, () => {
        cleanup(false);
      });

      const subEarned = ad.addAdEventListener(
        RewardedAdEventType.EARNED_REWARD,
        () => {
          earned = true;
        }
      );

      // Start load; show happens after LOADED
      ad.load();

      function cleanup(result) {
        try { subLoaded(); } catch {}
        try { subClosed(); } catch {}
        try { subError(); } catch {}
        try { subEarned(); } catch {}
        isShowing = false;

        // Queue next load for smoother UX
        try { ad.load(); } catch {}

        resolve(result);
      }
    } catch {
      isShowing = false;
      resolve(false);
    }
  });
}
