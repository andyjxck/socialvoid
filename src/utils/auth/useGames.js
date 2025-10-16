// hooks/useGames.js
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../supabase";

export function useGames(playerId) {
  const {
    data: games = [],
    isLoading: gamesLoading,
    refetch: refetchGames,
    error: gamesError,
  } = useQuery({
    queryKey: ["games", playerId],
    enabled: !!playerId,
    retry: 1,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      // 1) Base list of games
      const { data: baseGames, error: gErr } = await supabase
        .from("games")
        .select("id, name, game_type");
      if (gErr) throw new Error(`games: ${gErr.message}`);

      // Helper to merge totals
      const mergeTotals = (totalsByGame) =>
        (baseGames || []).map((g) => ({
          ...g,
          total_playtime_seconds: Number(totalsByGame.get(g.id) || 0),
        }));

      // 2) Try aggregate via SQL first
      try {
        // Some PostgREST versions accept either "duration_seconds.sum()" or "sum:duration_seconds".
        // We’ll try the modern one first, then fallback to the older one.
        let agg = await supabase
          .from("game_sessions")
          .select("game_id, total:duration_seconds.sum()")
          .eq("player_id", playerId)
          .group("game_id");

        if (agg.error) throw agg.error;

        let totals = agg.data || [];

        // If the driver didn’t like the .sum() syntax, try the alias style
        if (!totals.length) {
          const alt = await supabase
            .from("game_sessions")
            .select("game_id, sum:duration_seconds")
            .eq("player_id", playerId)
            .group("game_id");
          if (!alt.error && alt.data?.length) totals = alt.data;
        }

        console.log("🧮 aggregate totals:", totals);

        // If we got numbers, merge them
        const totalsByGame = new Map(
          totals
            .filter((r) => r && r.game_id != null)
            .map((r) => [r.game_id, Number(r.total ?? r.sum ?? 0)])
        );

        // If aggregate returned at least one row, use it
        if (totalsByGame.size > 0) {
          return mergeTotals(totalsByGame);
        }

        // Otherwise fall through to JS-sum
        console.warn("Aggregate returned no rows; falling back to JS-sum.");
      } catch (e) {
        console.warn("Aggregate failed; falling back to JS-sum.", e?.message || e);
      }

      // 3) Fallback: fetch sessions and sum in JS (works even if aggregate is blocked)
      const { data: sessions, error: sErr } = await supabase
        .from("game_sessions")
        .select("game_id, duration_seconds")
        .eq("player_id", playerId);

      if (sErr) {
        console.warn("JS-sum fetch failed:", sErr.message);
        // If we can’t read sessions (RLS), we still return the base games with zeros
        return (baseGames || []).map((g) => ({ ...g, total_playtime_seconds: 0 }));
      }

      console.log("📄 sessions fetched:", sessions?.length || 0);

      const totalsByGame = new Map();
      (sessions || []).forEach((row) => {
        const gid = row.game_id;
        const dur = Number(row.duration_seconds || 0);
        totalsByGame.set(gid, (totalsByGame.get(gid) || 0) + dur);
      });

      return mergeTotals(totalsByGame);
    },
  });

  return { games, gamesLoading, refetchGames, gamesError };
}
