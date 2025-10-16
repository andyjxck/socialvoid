// src/hooks/usePresencePing.js
import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { supabase } from "../utils/supabase";

export default function usePresencePing(userId, { intervalMs = 30000 } = {}) {
  const timerRef = useRef(null);
  const lastWriteRef = useRef(0);

  useEffect(() => {
    if (!Number.isFinite(Number(userId)) || Number(userId) <= 0) return;

    const write = async () => {
      const now = Date.now();
      if (now - lastWriteRef.current < 2500) return; // simple throttle
      lastWriteRef.current = now;

      try {
        const { error } = await supabase
          .from("players")
          .update({ last_seen: new Date().toISOString() })
          .eq("user_id", Number(userId));

        if (error) console.warn("[presence] update failed:", error.message);
      } catch (err) {
        console.warn("[presence] exception:", err?.message || err);
      }
    };

    const start = () => {
      if (timerRef.current) return;
      write(); // fire immediately
      timerRef.current = setInterval(write, intervalMs);
    };

    const stop = () => {
      clearInterval(timerRef.current);
      timerRef.current = null;
    };

    start();
    const sub = AppState.addEventListener("change", (s) => (s === "active" ? start() : stop()));

    return () => {
      stop();
      sub.remove?.();
    };
  }, [userId, intervalMs]);
}
