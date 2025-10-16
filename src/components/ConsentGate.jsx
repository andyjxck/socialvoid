// apps/mobile/src/components/ConsentGate.jsx
import { useEffect } from 'react';
import mobileAds, { AdsConsent } from 'react-native-google-mobile-ads';

export default function ConsentGate() {
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // Ask Google if consent is needed (EEA/UK/CH users)
        await AdsConsent.requestInfoUpdate();
        // This will show the GDPR message you created in AdMob, if required
        await AdsConsent.loadAndShowConsentFormIfRequired();
      } catch (e) {
        console.warn('ConsentGate error:', e);
      } finally {
        if (mounted) {
          try {
            await mobileAds().initialize(); // init after consent flow
          } catch (e) {
            console.warn('MobileAds init error:', e);
          }
        }
      }
    })();
    return () => { mounted = false; };
  }, []);

  return null; // shows nothing, just runs once on mount
}

