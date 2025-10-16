import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import playtimeTracker from "../utils/playtimeTracker";

/**
 * Fixes:
 * - No double-start: only start/resume when transitioning to 'active'
 * - No double-end: guard end/submission so it runs once per background/cleanup
 * - Periodic submit every 60s only when app is active
 * - Flush offline queue on return to active
 * - Safe cleanup order: stop timer -> end -> submit (guarded)
 */
export function usePlaytimeTracking(playerId) {
  useEffect(() => {
    if (!playerId) return;

    const lastAppStateRef = useRef(AppState.currentState || "active");
    const submittingRef = useRef(false);
    const intervalRef = useRef(null);
    const endedThisStateRef = useRef(false); // prevents double end on 'inactive' -> 'background' chain
    const mountedRef = useRef(true);

    const submitDuration = async (durationSecs) => {
      if (!durationSecs || durationSecs <= 0) return { success: true };
      if (submittingRef.current) {
        // Avoid overlapping submissions
        return { success: false, reason: "busy" };
      }
      submittingRef.current = true;
      try {
        const result = await playtimeTracker.submitSessionWithAchievements(
          playerId,
          durationSecs
        );
        if (!result?.success) {
          await playtimeTracker.storeOfflineSession(playerId, durationSecs);
        }
        return result || { success: false };
      } catch (err) {
        console.error("📱 submitDuration failed:", err);
        try {
          await playtimeTracker.storeOfflineSession(playerId, durationSecs);
        } catch (e2) {
          console.error("📱 storeOfflineSession failed:", e2);
        }
        return { success: false, error: err };
      } finally {
        submittingRef.current = false;
      }
    };

    const startActiveLoop = () => {
      if (intervalRef.current) return; // already running
      intervalRef.current = setInterval(async () => {
        try {
          // Only act if still active
          if (!mountedRef.current || AppState.currentState !== "active") return;

          const currentDuration = playtimeTracker.getCurrentSessionDuration?.();
          if (typeof currentDuration === "number" && currentDuration >= 60) {
            // Close and submit the current 60s chunk
            const chunk = playtimeTracker.endSession?.();
            if (chunk && chunk > 0) {
              const res = await submitDuration(chunk);
              if (res?.success) {
                console.log("📱 Periodic session submitted:", chunk + "s");
              }
            }
            // Immediately start the next chunk
            playtimeTracker.startSession?.();
          }
        } catch (e) {
          console.error("📱 periodic loop error:", e);
        }
      }, 60_000);
    };

    const stopActiveLoop = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    const onBecameActive = async () => {
      endedThisStateRef.current = false;
      try {
        // Resume or start; flush anything queued while offline
        playtimeTracker.startSession?.();
        playtimeTracker.resumeSession?.();
        await playtimeTracker.submitOfflineSessions?.();
      } catch (e) {
        console.error("📱 active/resume error:", e);
      }
      startActiveLoop();
    };

    const endAndSubmitOnce = async (reason = "background") => {
      if (endedThisStateRef.current) return;
      endedThisStateRef.current = true;
      try {
        playtimeTracker.pauseSession?.();
        const sessionDuration = playtimeTracker.endSession?.();
        if (sessionDuration && sessionDuration > 0) {
          const res = await submitDuration(sessionDuration);
          if (!res?.success) {
            await playtimeTracker.storeOfflineSession?.(
              playerId,
              sessionDuration
            );
          }
          console.log(
            `📱 Session submitted on ${reason}:`,
            sessionDuration + "s"
          );
        }
      } catch (e) {
        console.error(`📱 endAndSubmitOnce(${reason}) failed:`, e);
        try {
          // If endSession threw after measuring time, attempt to store a minimal offline chunk
          const fallback = playtimeTracker.getCurrentSessionDuration?.();
          if (fallback && fallback > 0) {
            await playtimeTracker.storeOfflineSession?.(playerId, fallback);
          }
        } catch (e2) {
          console.error("📱 fallback storeOfflineSession failed:", e2);
        }
      }
    };

    const handleAppStateChange = async (nextState) => {
      // iOS often goes 'active' -> 'inactive' -> 'background'
      if (nextState === "active" && lastAppStateRef.current !== "active") {
        await onBecameActive();
      } else if (
        nextState === "inactive" ||
        nextState === "background"
      ) {
        // Stop periodic loop immediately so it doesn't race with our end/submit
        stopActiveLoop();
        await endAndSubmitOnce(nextState);
      }
      lastAppStateRef.current = nextState;
    };

    // INITIALIZE
    // Align to current state at mount
    if (AppState.currentState === "active") {
      onBecameActive();
    } else {
      // Not active at mount: ensure no stray loop is running
      stopActiveLoop();
    }

    const subscription = AppState.addEventListener("change", handleAppStateChange);

    // CLEANUP
    return () => {
      mountedRef.current = false;
      subscription?.remove?.();
      // Ensure loop is stopped before final end/submit
      stopActiveLoop();
      // Final guarded submission on unmount
      endAndSubmitOnce("unmount").catch((e) =>
        console.error("📱 cleanup submit failed:", e)
      );
    };
  }, [playerId]);
}
