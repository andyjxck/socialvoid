import { usePathname, useRouter } from "expo-router";
import { App } from "expo-router/build/qualified-entry";
import React, { memo, useEffect } from "react";
import { ErrorBoundaryWrapper } from "./__create/SharedErrorBoundary";
import "./src/__create/polyfills";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Toaster } from "sonner-native";
import { AlertModal } from "./polyfills/web/alerts.web";
import "./global.css";
import { Platform, NativeModules } from "react-native";
import { requestTrackingPermissionsAsync, getTrackingPermissionsAsync } from "expo-tracking-transparency";

/* ──────────────────────────────────────────────
   GLOBAL DIAGNOSTIC LOGGER
   ────────────────────────────────────────────── */
const installGlobalErrorLogger = () => {
  const logDivider = "──────────────────────────────";

  const printError = (prefix, error, extra = {}) => {
    console.log("\n\n💥 " + prefix + " 💥");
    console.log(logDivider);
    console.log("Message:", error?.message || String(error));
    console.log("Name:", error?.name || "UnknownError");
    console.log("Stack:\n", error?.stack || "No stack available");
    if (Object.keys(extra).length) console.log("Extra:", extra);
    console.log(logDivider + "\n");
  };

  const onError = (error, isFatal) => {
    printError("JS ERROR", error, { isFatal });
  };

  const onUnhandledRejection = (reason) => {
    printError("UNHANDLED PROMISE REJECTION", reason);
  };

  const onConsoleError = (...args) => {
    if (args?.[0] instanceof Error) printError("CONSOLE ERROR", args[0]);
  };

  // Attach listeners
  if (global.ErrorUtils && typeof global.ErrorUtils.setGlobalHandler === "function") {
    global.ErrorUtils.setGlobalHandler(onError);
  }
  if (typeof window !== "undefined") {
    window.addEventListener("error", (e) => printError("WINDOW ERROR", e.error || e));
    window.addEventListener("unhandledrejection", (e) => printError("WINDOW PROMISE", e.reason));
  }
  process.on?.("unhandledRejection", onUnhandledRejection);
  console.error = (...args) => { onConsoleError(...args); console.log(...args); };

  // Native module inspection
  try {
    const nativeKeys = Object.keys(NativeModules || {});
    console.log("📦 Native Modules Loaded:", nativeKeys.slice(0, 20));
    console.log("🧱 RNScreens present:", !!NativeModules.RNScreens);
  } catch (err) {
    printError("NATIVE MODULE INSPECTION FAILED", err);
  }
};

/* ──────────────────────────────────────────────
   APP WRAPPER
   ────────────────────────────────────────────── */
const Wrapper = memo(() => {
  useEffect(() => {
    installGlobalErrorLogger();
  }, []);

  return (
    <ErrorBoundaryWrapper>
      <SafeAreaProvider
        initialMetrics={{
          insets: { top: 64, bottom: 34, left: 0, right: 0 },
          frame: {
            x: 0,
            y: 0,
            width: typeof window === "undefined" ? 390 : window.innerWidth,
            height: typeof window === "undefined" ? 844 : window.innerHeight,
          },
        }}
      >
        <App />
        <Toaster />
      </SafeAreaProvider>
    </ErrorBoundaryWrapper>
  );
});

/* ──────────────────────────────────────────────
   HEALTH CHECK (for Create sandbox)
   ────────────────────────────────────────────── */
const healthyResponse = {
  type: "sandbox:mobile:healthcheck:response",
  healthy: true,
};

const useHandshakeParent = () => {
  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data.type === "sandbox:mobile:healthcheck") {
        window.parent.postMessage(healthyResponse, "*");
      }
    };
    window.addEventListener("message", handleMessage);
    window.parent.postMessage(healthyResponse, "*");
    return () => window.removeEventListener("message", handleMessage);
  }, []);
};

/* ──────────────────────────────────────────────
   MAIN APP
   ────────────────────────────────────────────── */
const CreateApp = () => {
  const router = useRouter();
  const pathname = usePathname();
  useHandshakeParent();

  // Ask iOS for ATT permission once
  useEffect(() => {
    (async () => {
      if (Platform.OS !== "ios") return;
      try {
        const { status: existingStatus } = await getTrackingPermissionsAsync();
        if (existingStatus === "granted" || existingStatus === "denied") {
          console.log("ATT existing:", existingStatus);
          return;
        }
        const { status } = await requestTrackingPermissionsAsync();
        console.log("ATT request:", status);
      } catch (err) {
        console.log("ATT error:", err);
      }
    })();
  }, []);

  // Sandbox message-based navigation
  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data.type === "sandbox:navigation" && event.data.pathname !== pathname) {
        router.push(event.data.pathname);
      }
    };
    window.addEventListener("message", handleMessage);
    window.parent.postMessage({ type: "sandbox:mobile:ready" }, "*");
    return () => window.removeEventListener("message", handleMessage);
  }, [router, pathname]);

  useEffect(() => {
    window.parent.postMessage({ type: "sandbox:mobile:navigation", pathname }, "*");
  }, [pathname]);

  return (
    <>
      <Wrapper />
      <AlertModal />
    </>
  );
};

export default CreateApp;
