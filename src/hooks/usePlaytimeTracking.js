// hooks/usePlaytimeTracking.js
import { useEffect, useRef, useCallback } from "react";
import { AppState } from "react-native";
import { supabase } from "../utils/supabase";

/**
 * Tracks "online" time (app in foreground/active) and updates
 * players.total_playtime_seconds in Supabase.
 *
 * Behavior:
 * - +1 second counted for every real second the app is ACTIVE
 * - Flushes to Supabase once per minute with the accumulated seconds
 * - Also flushes on background/inactive and on unmount with any leftover seconds
 *
 * Requirements:
 * - `players` table with `id` PK and `total_playtime_seconds` int
 */
export function usePlaytimeTracking(playerId) {
  const appStateRef = useRef(AppState.currentState);
  const isActiveRef = useRef(appStateRef.current === "active");
  const secondsSinceFlushRef = useRef(0);
  const secondTickerRef = useRef(null);

  // ---- Supabase: add seconds to players.total_playtime_seconds ----
  const flushToSupabase = useCallback(
    async (deltaSeconds) => {
      const delta = Math.max(0, Math.floor(Number(deltaSeconds) || 0));
      if (!playerId || delta <= 0) return;

      try {
        // Read current total (simple & safe for single-client updates)
        const { data: row, error: selErr } = await supabase
          .from("players")
          .select("total_playtime_seconds")
          .eq("id", playerId)
          .maybeSingle();

        if (selErr) {
          console.warn("[usePlaytimeTracking] SELECT failed:", selErr);
          return;
        }

        const current = Number(row?.total_playtime_seconds) || 0;
        const next = current + delta;

        const { error: updErr } = await supabase
          .from("players")
          .update({
            total_playtime_seconds: next,
            updated_at: new Date().toISOString(),
          })
          .eq("id", playerId);

        if (updErr) {
          console.warn("[usePlaytimeTracking] UPDATE failed:", updErr);
          return;
        }

        // Reset local counter after successful flush
        secondsSinceFlushRef.current = 0;
        // Optional: console.log for visibility
        console.log(`⏱️ Flushed +${delta}s -> total_playtime_seconds=${next}`);
      } catch (e) {
        console.warn("[usePlaytimeTracking] Flush error:", e);
      }
    },
    [playerId]
  );

  // Start ticking 1s when active; stop when not
  const startSecondTicker = useCallback(() => {
    if (secondTickerRef.current) return;
    secondTickerRef.current = setInterval(() => {
      if (!playerId) return;

      if (isActiveRef.current) {
        secondsSinceFlushRef.current += 1;

        // Flush every full minute
        if (secondsSinceFlushRef.current >= 60) {
          const delta = secondsSinceFlushRef.current;
          // fire & forget; no await inside interval
          flushToSupabase(delta);
        }
      }
    }, 1000);
  }, [playerId, flushToSupabase]);

  const stopSecondTicker = useCallback(() => {
    if (secondTickerRef.current) {
      clearInterval(secondTickerRef.current);
      secondTickerRef.current = null;
    }
  }, []);

  // Manually start/stop (exposed API – optional)
  const startTracking = useCallback(() => {
    isActiveRef.current = true;
    startSecondTicker();
  }, [startSecondTicker]);

  const stopTracking = useCallback(async () => {
    isActiveRef.current = false;
    // Flush any remaining seconds immediately
    const leftover = secondsSinceFlushRef.current;
    if (leftover > 0) {
      await flushToSupabase(leftover);
    }
    stopSecondTicker();
  }, [flushToSupabase, stopSecondTicker]);

  // Effect: wire AppState + lifecycle
  useEffect(() => {
    if (!playerId) return;

    // Initialize based on current state
    isActiveRef.current = AppState.currentState === "active";
    if (isActiveRef.current) {
      startSecondTicker();
    }

    const handleAppStateChange = async (next) => {
      const wasActive = isActiveRef.current;
      const nowActive = next === "active";

      isActiveRef.current = nowActive;

      // If moving to background/inactive – flush any partial seconds
      if (wasActive && !nowActive) {
        const leftover = secondsSinceFlushRef.current;
        if (leftover > 0) {
          await flushToSupabase(leftover);
        }
      }

      // Manage the second ticker
      if (nowActive) {
        startSecondTicker();
      } else {
        // we keep ticker running to keep 1s cadence consistent,
        // but you can stop it if you prefer to be extra conservative:
        // stopSecondTicker();
      }
    };

    const subscription = AppState.addEventListener("change", handleAppStateChange);

    return () => {
      subscription?.remove();
      // Flush any remaining seconds on unmount
      (async () => {
        const leftover = secondsSinceFlushRef.current;
        if (leftover > 0) {
          await flushToSupabase(leftover);
        }
        stopSecondTicker();
      })();
    };
  }, [playerId, flushToSupabase, startSecondTicker, stopSecondTicker]);

  return { startTracking, stopTracking };
}
