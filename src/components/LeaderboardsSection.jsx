import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { useTheme } from "../utils/theme";
import { BlurView } from "expo-blur";
import { Trophy, Users, Globe, Crown, Medal, Award, Clock } from "lucide-react-native";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import { supabase } from "../utils/supabase";

export default function LeaderboardsSection({ playerId }) {
  const { colors, isDark } = useTheme();

  const [selectedGame, setSelectedGame] = useState("overall"); // "overall" or gameId (string)
  const [leaderboardType, setLeaderboardType] = useState("global"); // "global" | "friends"
  const [scoreType, setScoreType] = useState("playtime"); // "playtime" | "scores"

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  const pid = Number(playerId) || 0;

  // ---- Helpers to decide what to show for each game
  const AI_TYPES = new Set(["chess", "connect_4", "dots_and_boxes", "mancala"]);
  const BEST_TIME_TYPES = new Set(["sudoku"]); // add more if you time them (e.g. word_search)

  const decideDisplayMode = (gameRow) => {
    if (!gameRow) return "HIGH_SCORE";
    // If your table has this boolean, prefer it.
    if (typeof gameRow.track_best_time === "boolean") {
      return gameRow.track_best_time ? "BEST_TIME" : "HIGH_SCORE";
    }
    // Fall back to game_type heuristics
    if (AI_TYPES.has(gameRow.game_type)) return "AI_WINS";
    if (BEST_TIME_TYPES.has(gameRow.game_type)) return "BEST_TIME";
    return "HIGH_SCORE";
  };

  // 1) Games
  const { data: games = [] } = useQuery({
    queryKey: ["games"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("games")
        .select("id, name, game_type, track_best_time") // track_best_time is optional; ok if null/absent
        .order("id", { ascending: true });
      if (error) {
        console.warn("games error:", error);
        return [];
      }
      return data || [];
    },
    staleTime: 60_000,
  });

  const selectedGameRow =
    selectedGame === "overall"
      ? null
      : games.find((g) => String(g.id) === String(selectedGame)) || null;

  const displayMode = selectedGame === "overall" ? null : decideDisplayMode(selectedGameRow);

  // 2) Friends (ids) from friendships (accepted, either side)
  const { data: friends = [] } = useQuery({
    queryKey: ["friends-ids", pid, leaderboardType],
    enabled: !!pid && leaderboardType === "friends",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("friendships")
        .select("player1_id, player2_id, status")
        .or(`player1_id.eq.${pid},player2_id.eq.${pid}`)
        .eq("status", "accepted");
      if (error) {
        console.warn("friends error:", error);
        return [];
      }
      const ids = (data || []).map((f) =>
        f.player1_id === pid ? f.player2_id : f.player1_id
      );
      return ids.map(Number).filter((n) => Number.isFinite(n));
    },
    staleTime: 60_000,
  });

  // 3) Leaderboard (per overall/per-game + correct stat/ordering)
  const { data: leaderboard = [], isLoading } = useQuery({
    queryKey: [
      "leaderboard",
      selectedGame,
      leaderboardType,
      scoreType,
      pid,
      friends.join(","),
      displayMode,
    ],
    enabled: !!pid,
    queryFn: async () => {
      // OVERALL (players)
      if (selectedGame === "overall") {
        if (scoreType === "playtime") {
          const { data, error } = await supabase
            .from("players")
            .select("id, username, profile_emoji, total_playtime_seconds")
            .order("total_playtime_seconds", { ascending: false, nullsFirst: false })
            .limit(50);
          if (error) {
            console.warn("overall playtime error:", error);
            return [];
          }
          return (data || []).map((row, idx) => ({
            player_id: row.id,
            username: row.username,
            profile_emoji: row.profile_emoji,
            total_playtime_seconds: row.total_playtime_seconds || 0,
            rank_position: idx + 1,
          }));
        } else {
          const { data, error } = await supabase
            .from("players")
            .select("id, username, profile_emoji, total_points")
            .order("total_points", { ascending: false, nullsFirst: false })
            .limit(50);
          if (error) {
            console.warn("overall scores error:", error);
            return [];
          }
          return (data || []).map((row, idx) => ({
            player_id: row.id,
            username: row.username,
            profile_emoji: row.profile_emoji,
            total_points: row.total_points || 0,
            rank_position: idx + 1,
          }));
        }
      }

      // PER-GAME (player_game_stats)
      const gameId = Number(selectedGame);
      if (!Number.isFinite(gameId)) return [];

      if (scoreType === "playtime") {
        // Per-game PLAYTIME (if you have this column)
        const { data: stats, error: sErr } = await supabase
          .from("player_game_stats")
          .select("player_id, total_playtime_seconds")
          .eq("game_id", gameId)
          .order("total_playtime_seconds", { ascending: false, nullsFirst: false })
          .limit(50);
        if (sErr) {
          console.warn("game playtime error:", sErr);
          return [];
        }
        const ids = Array.from(new Set((stats || []).map((s) => s.player_id)));
        let profiles = [];
        if (ids.length > 0) {
          const { data: players, error: pErr } = await supabase
            .from("players")
            .select("id, username, profile_emoji")
            .in("id", ids);
          if (!pErr) profiles = players || [];
          else console.warn("players hydrate error:", pErr);
        }
        const byId = new Map(profiles.map((p) => [p.id, p]));
        return (stats || []).map((s, idx) => ({
          player_id: s.player_id,
          username: byId.get(s.player_id)?.username ?? `Player ${s.player_id}`,
          profile_emoji: byId.get(s.player_id)?.profile_emoji ?? "🧩",
          total_playtime_seconds: s.total_playtime_seconds || 0,
          rank_position: idx + 1,
        }));
      } else {
        // Per-game SCORES
        if (displayMode === "BEST_TIME") {
          const { data: stats, error: sErr } = await supabase
            .from("player_game_stats")
            .select("player_id, best_time, total_plays")
            .eq("game_id", gameId)
            .order("best_time", { ascending: true, nullsFirst: false }) // lower is better
            .limit(50);
          if (sErr) {
            console.warn("game scores (best_time) error:", sErr);
            return [];
          }
          const ids = Array.from(new Set((stats || []).map((s) => s.player_id)));
          let profiles = [];
          if (ids.length > 0) {
            const { data: players, error: pErr } = await supabase
              .from("players")
              .select("id, username, profile_emoji")
              .in("id", ids);
            if (!pErr) profiles = players || [];
            else console.warn("players hydrate error:", pErr);
          }
          const byId = new Map(profiles.map((p) => [p.id, p]));
          return (stats || []).map((s, idx) => ({
            player_id: s.player_id,
            username: byId.get(s.player_id)?.username ?? `Player ${s.player_id}`,
            profile_emoji: byId.get(s.player_id)?.profile_emoji ?? "🧩",
            best_time: s.best_time,
            total_plays: s.total_plays,
            rank_position: idx + 1,
          }));
        } else {
          // HIGH_SCORE or AI_WINS both use high_score for ordering (desc)
          const { data: stats, error: sErr } = await supabase
            .from("player_game_stats")
            .select("player_id, high_score, total_plays")
            .eq("game_id", gameId)
            .order("high_score", { ascending: false, nullsFirst: false })
            .limit(50);
          if (sErr) {
            console.warn("game scores (high_score) error:", sErr);
            return [];
          }
          const ids = Array.from(new Set((stats || []).map((s) => s.player_id)));
          let profiles = [];
          if (ids.length > 0) {
            const { data: players, error: pErr } = await supabase
              .from("players")
              .select("id, username, profile_emoji")
              .in("id", ids);
            if (!pErr) profiles = players || [];
            else console.warn("players hydrate error:", pErr);
          }
          const byId = new Map(profiles.map((p) => [p.id, p]));
          return (stats || []).map((s, idx) => ({
            player_id: s.player_id,
            username: byId.get(s.player_id)?.username ?? `Player ${s.player_id}`,
            profile_emoji: byId.get(s.player_id)?.profile_emoji ?? "🧩",
            high_score: s.high_score,
            total_plays: s.total_plays,
            rank_position: idx + 1,
          }));
        }
      }
    },
    // Filter to friends view (after query)
    select: (rows) => {
      if (leaderboardType !== "friends") return rows;
      const set = new Set(friends);
      return rows.filter(
        (e) => Number(e.player_id) === pid || set.has(Number(e.player_id))
      );
    },
    staleTime: 60_000,
  });

  // ---- UI helpers
  const formatTime = (secs) => {
    if (!Number.isFinite(secs) || secs <= 0) return "—";
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
  };

  const formatScore = (entry) => {
    // Overall
    if (selectedGame === "overall") {
      if (scoreType === "playtime") {
        const s = entry.total_playtime_seconds || 0;
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
      }
      return (entry.total_points || 0).toLocaleString();
    }

    // Per-game
    if (scoreType === "playtime") {
      const s = entry.total_playtime_seconds || 0;
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      return h > 0 ? `${h}h ${m}m` : `${m}m`;
    }

    // Scores (per-game) — use displayMode
    if (displayMode === "BEST_TIME") {
      return formatTime(entry.best_time);
    }
    if (displayMode === "AI_WINS") {
      const wins = Number(entry.high_score || 0);
      const plays = Number(entry.total_plays || 0);
      return `${wins}/${plays} wins`;
    }
    // HIGH_SCORE
    return (entry.high_score || 0).toLocaleString();
  };

  const getRankIcon = (position) =>
    position === 1 ? Crown : position === 2 ? Medal : position === 3 ? Award : Trophy;
  const getRankColor = (position) =>
    position === 1 ? "#FFD700" : position === 2 ? "#C0C0C0" : position === 3 ? "#CD7F32" : colors.textSecondary;
  const getSelectedGameName = () =>
    selectedGame === "overall"
      ? "Overall"
      : games.find((g) => String(g.id) === String(selectedGame))?.name || "Unknown Game";
  const getCurrentPlayerRank = () =>
    leaderboard.find((e) => Number(e.player_id) === pid)?.rank_position || null;

  const handleGameSelect = (gameId) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedGame(gameId);
  };
  const handleTypeToggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLeaderboardType((t) => (t === "global" ? "friends" : "global"));
  };
  const handleScoreTypeToggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setScoreType((t) => (t === "playtime" ? "scores" : "playtime"));
  };

  if (!fontsLoaded) return null;

  return (
    <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 16 }}>
      {/* Header Controls */}
      <View style={{ marginBottom: 16 }}>
        <BlurView
          intensity={isDark ? 40 : 60}
          tint={isDark ? "dark" : "light"}
          style={{
            backgroundColor: isDark ? "rgba(31, 41, 55, 0.6)" : "rgba(255, 255, 255, 0.6)",
            borderRadius: 12,
            padding: 16,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          {/* Type Toggle */}
          <View style={{ flexDirection: "row", marginBottom: 12, gap: 8 }}>
            <TouchableOpacity
              onPress={handleTypeToggle}
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: colors.gameAccent1 + "20",
                borderRadius: 20,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderWidth: 1,
                borderColor: colors.gameAccent1,
              }}
            >
              {leaderboardType === "global" ? (
                <Globe size={14} color={colors.gameAccent1} />
              ) : (
                <Users size={14} color={colors.gameAccent1} />
              )}
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "600",
                  color: colors.gameAccent1,
                  marginLeft: 6,
                  fontFamily: "Inter_600SemiBold",
                }}
              >
                {leaderboardType === "global" ? "Global" : `Friends (${friends.length})`}
              </Text>
            </TouchableOpacity>

            {/* Score Type Toggle */}
            <TouchableOpacity
              onPress={handleScoreTypeToggle}
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: colors.gameAccent2 + "20",
                borderRadius: 20,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderWidth: 1,
                borderColor: colors.gameAccent2,
              }}
            >
              {scoreType === "playtime" ? (
                <Clock size={14} color={colors.gameAccent2} />
              ) : (
                <Trophy size={14} color={colors.gameAccent2} />
              )}
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "600",
                  color: colors.gameAccent2,
                  marginLeft: 6,
                  fontFamily: "Inter_600SemiBold",
                }}
              >
                {scoreType === "playtime" ? "Playtime" : "Scores"}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Game Selection */}
          <Text
            style={{
              fontSize: 13,
              fontWeight: "600",
              color: colors.text,
              marginBottom: 8,
              fontFamily: "Inter_600SemiBold",
            }}
          >
            Game: {getSelectedGameName()}
          </Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: "row", gap: 6 }}>
              <TouchableOpacity
                onPress={() => handleGameSelect("overall")}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 16,
                  backgroundColor:
                    selectedGame === "overall" ? colors.gameAccent2 + "20" : colors.glassSecondary,
                  borderWidth: selectedGame === "overall" ? 1 : 0,
                  borderColor: colors.gameAccent2,
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: selectedGame === "overall" ? "600" : "500",
                    color: selectedGame === "overall" ? colors.gameAccent2 : colors.text,
                    fontFamily:
                      selectedGame === "overall" ? "Inter_600SemiBold" : "Inter_500Medium",
                  }}
                >
                  Overall
                </Text>
              </TouchableOpacity>

              {games
                .filter((g) => g.name !== "Puzzle Wheel")
                .map((g) => (
                  <TouchableOpacity
                    key={g.id}
                    onPress={() => handleGameSelect(String(g.id))}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 16,
                      backgroundColor:
                        selectedGame === String(g.id)
                          ? colors.gameAccent2 + "20"
                          : colors.glassSecondary,
                      borderWidth: selectedGame === String(g.id) ? 1 : 0,
                      borderColor: colors.gameAccent2,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: selectedGame === String(g.id) ? "600" : "500",
                        color:
                          selectedGame === String(g.id) ? colors.gameAccent2 : colors.text,
                        fontFamily:
                          selectedGame === String(g.id)
                            ? "Inter_600SemiBold"
                            : "Inter_500Medium",
                      }}
                    >
                      {g.name}
                    </Text>
                  </TouchableOpacity>
                ))}
            </View>
          </ScrollView>

          <Text
            style={{
              fontSize: 13,
              fontWeight: "600",
              color: colors.text,
              marginBottom: 8,
              fontFamily: "Inter_600SemiBold",
            }}
          >
            All Time Rankings ({scoreType === "playtime" ? "by playtime" : "by scores"})
          </Text>
        </BlurView>
      </View>

      {/* Player's Current Rank */}
      {(() => {
        const r = getCurrentPlayerRank();
        return r ? (
          <View style={{ marginBottom: 16 }}>
            <BlurView
              intensity={isDark ? 40 : 60}
              tint={isDark ? "dark" : "light"}
              style={{
                backgroundColor: isDark ? "rgba(31, 41, 55, 0.6)" : "rgba(255, 255, 255, 0.6)",
                borderRadius: 12,
                padding: 12,
                borderWidth: 1,
                borderColor: colors.gameAccent1 + "40",
              }}
            >
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "600",
                  color: colors.text,
                  textAlign: "center",
                  fontFamily: "Inter_600SemiBold",
                }}
              >
                Your Rank: #{r}
              </Text>
            </BlurView>
          </View>
        ) : null;
      })()}

      {/* ===== Podium ===== */}
      <View style={{ marginBottom: 16 }}>
        <BlurView
          intensity={isDark ? 40 : 60}
          tint={isDark ? "dark" : "light"}
          style={{
            backgroundColor: isDark ? "rgba(31, 41, 55, 0.6)" : "rgba(255, 255, 255, 0.6)",
            borderRadius: 12,
            padding: 16,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text
            style={{
              fontSize: 16,
              fontWeight: "700",
              color: colors.text,
              textAlign: "center",
              marginBottom: 16,
              fontFamily: "Inter_700Bold",
            }}
          >
            👑 Top Players Podium 👑
          </Text>

          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-end",
              justifyContent: "center",
              gap: 12,
              marginBottom: 8,
            }}
          >
            {/* 2nd */}
            <View style={{ alignItems: "center", flex: 1 }}>
              <Text style={{ fontSize: 24, marginBottom: 6 }}>
                {leaderboard[1]?.profile_emoji || "❓"}
              </Text>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "600",
                  color: colors.text,
                  textAlign: "center",
                  fontFamily: "Inter_600SemiBold",
                  marginBottom: 6,
                }}
              >
                {leaderboard[1]?.username || "Empty"}
              </Text>
              <View
                style={{
                  backgroundColor: "#C0C0C0",
                  height: 50,
                  width: "100%",
                  borderRadius: 8,
                  justifyContent: "center",
                  alignItems: "center",
                  borderTopLeftRadius: 12,
                  borderTopRightRadius: 12,
                }}
              >
                <Text style={{ fontSize: 16, marginBottom: 2 }}>🥈</Text>
                <Text style={{ fontSize: 9, fontWeight: "700", color: "#FFFFFF" }}>2nd</Text>
              </View>
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: "700",
                  color: colors.gameAccent1,
                  marginTop: 4,
                  fontFamily: "Inter_700Bold",
                }}
              >
                {leaderboard[1] ? formatScore(leaderboard[1]) : "--"}
              </Text>
            </View>

            {/* 1st */}
            <View style={{ alignItems: "center", flex: 1 }}>
              <Text style={{ fontSize: 28, marginBottom: 6 }}>
                {leaderboard[0]?.profile_emoji || "❓"}
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "700",
                  color: colors.text,
                  textAlign: "center",
                  fontFamily: "Inter_700Bold",
                  marginBottom: 6,
                }}
              >
                {leaderboard[0]?.username || "Empty"}
              </Text>
              <View
                style={{
                  backgroundColor: "#FFD700",
                  height: 70,
                  width: "100%",
                  borderRadius: 8,
                  justifyContent: "center",
                  alignItems: "center",
                  borderTopLeftRadius: 12,
                  borderTopRightRadius: 12,
                }}
              >
                <Text style={{ fontSize: 20, marginBottom: 2 }}>👑</Text>
                <Text style={{ fontSize: 11, fontWeight: "700", color: "#FFFFFF" }}>1st</Text>
              </View>
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "700",
                  color: colors.gameAccent1,
                  marginTop: 4,
                  fontFamily: "Inter_700Bold",
                }}
              >
                {leaderboard[0] ? formatScore(leaderboard[0]) : "--"}
              </Text>
            </View>

            {/* 3rd */}
            <View style={{ alignItems: "center", flex: 1 }}>
              <Text style={{ fontSize: 20, marginBottom: 6 }}>
                {leaderboard[2]?.profile_emoji || "❓"}
              </Text>
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: "600",
                  color: colors.text,
                  textAlign: "center",
                  fontFamily: "Inter_600SemiBold",
                  marginBottom: 6,
                }}
              >
                {leaderboard[2]?.username || "Empty"}
              </Text>
              <View
                style={{
                  backgroundColor: "#CD7F32",
                  height: 40,
                  width: "100%",
                  borderRadius: 8,
                  justifyContent: "center",
                  alignItems: "center",
                  borderTopLeftRadius: 12,
                  borderTopRightRadius: 12,
                }}
              >
                <Text style={{ fontSize: 14, marginBottom: 1 }}>🥉</Text>
                <Text style={{ fontSize: 8, fontWeight: "700", color: "#FFFFFF" }}>3rd</Text>
              </View>
              <Text
                style={{
                  fontSize: 9,
                  fontWeight: "700",
                  color: colors.gameAccent1,
                  marginTop: 4,
                  fontFamily: "Inter_700Bold",
                }}
              >
                {leaderboard[2] ? formatScore(leaderboard[2]) : "--"}
              </Text>
            </View>
          </View>
        </BlurView>
      </View>

      {/* List */}
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 20 }}
      >
        {isLoading ? (
          <Text
            style={{
              textAlign: "center",
              color: colors.textSecondary,
              fontSize: 14,
              marginTop: 20,
              fontFamily: "Inter_400Regular",
            }}
          >
            Loading leaderboard...
          </Text>
        ) : leaderboard.length === 0 ? (
          <Text
            style={{
              textAlign: "center",
              color: colors.textSecondary,
              fontSize: 14,
              marginTop: 20,
              fontFamily: "Inter_400Regular",
            }}
          >
            {leaderboardType === "friends"
              ? "Start playing games to appear on the leaderboard!"
              : "No leaderboard data available"}
          </Text>
        ) : (
          leaderboard
            .slice(leaderboard.length >= 3 ? 3 : 0)
            .map((entry, index) => {
              const actualIndex = (leaderboard.length >= 3 ? 3 : 0) + index;
              const position = entry.rank_position || actualIndex + 1;
              const RankIcon = getRankIcon(position);
              const rankColor = getRankColor(position);
              const isCurrentPlayer = Number(entry.player_id) === pid;

              return (
                <View key={`${entry.player_id}-${index}`} style={{ marginBottom: 8 }}>
                  <BlurView
                    intensity={isDark ? 40 : 60}
                    tint={isDark ? "dark" : "light"}
                    style={{
                      backgroundColor: isDark
                        ? "rgba(31, 41, 55, 0.6)"
                        : "rgba(255, 255, 255, 0.6)",
                      borderRadius: 8,
                      padding: 12,
                      borderWidth: isCurrentPlayer ? 2 : 1,
                      borderColor: isCurrentPlayer ? colors.gameAccent1 : colors.border,
                      minHeight: 60,
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <View
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 16,
                          backgroundColor: rankColor + "20",
                          justifyContent: "center",
                          alignItems: "center",
                          marginRight: 12,
                        }}
                      >
                        <RankIcon size={16} color={rankColor} />
                      </View>

                      <View style={{ flex: 1 }}>
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            marginBottom: 2,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 14,
                              fontWeight: isCurrentPlayer ? "700" : "600",
                              color: colors.text,
                              flex: 1,
                              fontFamily: isCurrentPlayer
                                ? "Inter_700Bold"
                                : "Inter_600SemiBold",
                            }}
                          >
                            {isCurrentPlayer && "👤 "}
                            {entry.profile_emoji || "🧩"} {entry.username}
                          </Text>

                          <Text
                            style={{
                              fontSize: 13,
                              fontWeight: "700",
                              color: colors.gameAccent1,
                              fontFamily: "Inter_700Bold",
                            }}
                          >
                            {formatScore(entry)}
                          </Text>
                        </View>

                        <View
                          style={{ flexDirection: "row", justifyContent: "space-between" }}
                        >
                          <Text
                            style={{
                              fontSize: 11,
                              color: colors.textSecondary,
                              fontFamily: "Inter_400Regular",
                            }}
                          >
                            Rank #{position}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </BlurView>
                </View>
              );
            })
        )}

        {leaderboard.length > 0 &&
          leaderboardType === "friends" &&
          friends.length === 0 && (
            <View style={{ marginTop: 20 }}>
              <Text
                style={{
                  textAlign: "center",
                  color: colors.textSecondary,
                  fontSize: 12,
                  fontFamily: "Inter_400Regular",
                }}
              >
                Add friends to see them on the leaderboard!
              </Text>
            </View>
          )}
      </ScrollView>
    </View>
  );
}
