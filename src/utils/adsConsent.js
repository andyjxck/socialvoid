import { useEffect } from "react";
import mobileAds, { AdsConsent } from "react-native-google-mobile-ads";

export default function useAdsConsentBoot() {
  useEffect(() => {
    async function init() {
      try {
        // Ask Google if we need to show the message
        await AdsConsent.requestInfoUpdate();
        // If required, this will automatically show the form you just created in AdMob
        await AdsConsent.loadAndShowConsentFormIfRequired();
      } finally {
        // Initialise the Ads SDK after consent flow completes
        await mobileAds().initialize();
      }
    }
    init();
  }, []);
}
//
//  adsConsent.js
//  
//
//  Created by Andrew Blewett on 29/09/2025.
//

