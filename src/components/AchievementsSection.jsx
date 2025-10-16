// src/components/AchievementsSection.jsx
import React, { useMemo, useState, useEffect } from "react";
import { View, Text, ScrollView, TextInput, TouchableOpacity } from "react-native";
import { BlurView } from "expo-blur";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Search, Trophy, Star, Lock, Target, Clock, Crown, RefreshCw } from "lucide-react-native";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import { useTheme } from "../utils/theme";
import { supabase } from "../utils/supabase";

/**
 * Per-game achievements panel (new-player friendly).
 * Shows ALL achievements for the game, then overlays player's progress.
 */
export default function AchievementsSection({
  playerId,
  gameId,
  autoRefreshMs = 15000,
  showSearchBar = true,
  showFilters = true,
}) {
  const { colors, isDark } = useTheme();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("all"); // all | completed | locked

  // Always call hooks (do NOT early-return before this)
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  const idsReady = !!playerId && !!gameId;
  const uiReady = idsReady && fontsLoaded;

  // Fetch ALL achievements for this game (new players will still see them)
  const {
    data: allAchievements = [],
    error: achErr,
    refetch: refetchAchievements,
  } = useQuery({
    queryKey: ["achievements:list", gameId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("achievements")
        .select("*")
        .eq("game_id", gameId)
        .order("points_reward", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!gameId,               // query defined every render, but idle until gameId is ready
    staleTime: 15000,
    refetchInterval: autoRefreshMs || false,
  });

  // Fetch player's progress rows (can be empty for new players)
  const {
    data: playerProgress = [],
    error: progErr,
    refetch: refetchProgress,
  } = useQuery({
    queryKey: ["achievements:progress", playerId, gameId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("player_achievements")
        .select("achievement_id, progress, is_completed, completed_at")
        .eq("player_id", playerId);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!playerId,             // query defined every render, but idle until playerId is ready
    staleTime: 15000,
    refetchInterval: autoRefreshMs || false,
  });

  // Optional soft refetch timer
  useEffect(() => {
    if (!autoRefreshMs) return;
    const id = setInterval(() => {
      refetchAchievements();
      refetchProgress();
    }, autoRefreshMs);
    return () => clearInterval(id);
  }, [autoRefreshMs, refetchAchievements, refetchProgress]);

  // Merge base achievement rows with player progress
  const merged = useMemo(() => {
    const map = new Map(playerProgress.map((r) => [r.achievement_id, r]));
    return (allAchievements || []).map((a) => {
      const p = map.get(a.id);
      return {
        id: a.id,
        name: a.name,
        description: a.description,
        game_id: a.game_id,
        achievement_type: a.achievement_type,
        target_value: a.target_value,
        points_reward: a.points_reward ?? 0,
        icon_name: a.icon_name,
        is_hidden: !!a.is_hidden,
        is_completed: !!p?.is_completed,
        completed_at: p?.completed_at ?? null,
        progress: typeof p?.progress === "number" ? p.progress : 0,
      };
    });
  }, [allAchievements, playerProgress]);

  const stats = useMemo(() => {
    const total = merged.length;
    const completed = merged.filter((a) => a.is_completed).length;
    const locked = total - completed;
    return { total, completed, locked, pct: total ? Math.round((completed / total) * 100) : 0 };
  }, [merged]);

  const filtered = useMemo(() => {
    const q = (searchQuery || "").trim().toLowerCase();
    return merged
      .filter((a) => {
        if (!q) return true;
        return (
          (a.name || "").toLowerCase().includes(q) ||
          (a.description || "").toLowerCase().includes(q)
        );
      })
      .filter((a) => {
        if (filterType === "completed") return a.is_completed;
        if (filterType === "locked") return !a.is_completed;
        return true;
      })
      .sort((a, b) => {
        if (a.is_completed !== b.is_completed) return a.is_completed ? -1 : 1;
        return (b.points_reward || 0) - (a.points_reward || 0);
      });
  }, [merged, searchQuery, filterType]);

  const IconFor = (name) => {
    const map = { trophy: Trophy, star: Star, crown: Crown, target: Target, clock: Clock, lock: Lock };
    return map[name] || Trophy;
  };

  const handleManualRefresh = async () => {
    try { await Haptics.impactAsync(Haptics.NotificationFeedbackStyle.Success); } catch {}
    refetchAchievements();
    refetchProgress();
  };

  // ---- RENDER ----
  // Don’t early-return before hooks; instead render a lightweight placeholder
  if (!uiReady) {
    return (
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <BlurView
          intensity={isDark ? 40 : 60}
          tint={isDark ? "dark" : "light"}
          style={{
            backgroundColor: isDark ? "rgba(31,41,55,0.6)" : "rgba(255,255,255,0.6)",
            borderRadius: 12,
            padding: 12,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: colors.textSecondary, textAlign: "center" }}>
            Loading achievements…
          </Text>
        </BlurView>
      </View>
    );
  }

  if (achErr || progErr) {
    return (
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <Text style={{ textAlign: "center", color: colors.textSecondary, fontFamily: "Inter_400Regular" }}>
          Failed to load achievements.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
      {/* Header / Progress */}
      <View style={{ marginBottom: 12 }}>
        <BlurView
          intensity={isDark ? 40 : 60}
          tint={isDark ? "dark" : "light"}
          style={{
            backgroundColor: isDark ? "rgba(31,41,55,0.6)" : "rgba(255,255,255,0.6)",
            borderRadius: 12,
            padding: 12,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: colors.text }}>
              Game Achievements
            </Text>
            <TouchableOpacity onPress={handleManualRefresh} hitSlop={10}>
              <RefreshCw size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
            <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.textSecondary }}>
              {stats.completed} of {stats.total} completed
            </Text>
            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: colors.gameAccent1 }}>
              {stats.pct}%
            </Text>
          </View>

          <View style={{ height: 6, backgroundColor: isDark ? "rgba(31,41,55,0.8)" : "rgba(0,0,0,0.1)", borderRadius: 3, marginTop: 8 }}>
            <View style={{ height: "100%", width: `${stats.pct}%`, backgroundColor: colors.gameAccent1 }} />
          </View>
        </BlurView>
      </View>

      {/* Search / Filters */}
      {(showSearchBar || showFilters) && (
        <View style={{ marginBottom: 12 }}>
          <BlurView
            intensity={isDark ? 40 : 60}
            tint={isDark ? "dark" : "light"}
            style={{
              backgroundColor: isDark ? "rgba(31,41,55,0.6)" : "rgba(255,255,255,0.6)",
              borderRadius: 12,
              padding: 10,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            {showSearchBar && (
              <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.glassSecondary, borderRadius: 8, paddingHorizontal: 8, marginBottom: showFilters ? 8 : 0 }}>
                <Search size={14} color={colors.textSecondary} />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search achievements..."
                  placeholderTextColor={colors.textSecondary}
                  style={{ flex: 1, paddingVertical: 8, paddingHorizontal: 6, color: colors.text, fontSize: 12, fontFamily: "Inter_400Regular" }}
                />
              </View>
            )}

            {showFilters && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  {[
                    { id: "all", label: "All", count: stats.total },
                    { id: "completed", label: "Completed", count: stats.completed },
                    { id: "locked", label: "Locked", count: stats.locked },
                  ].map((f) => (
                    <TouchableOpacity
                      key={f.id}
                      onPress={async () => {
                        setFilterType(f.id);
                        try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                      }}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 16,
                        backgroundColor: filterType === f.id ? colors.gameAccent1 + "20" : colors.glassSecondary,
                        borderWidth: filterType === f.id ? 1 : 0,
                        borderColor: colors.gameAccent1,
                      }}
                    >
                      <Text style={{ fontFamily: filterType === f.id ? "Inter_600SemiBold" : "Inter_500Medium", fontSize: 10, color: filterType === f.id ? colors.gameAccent1 : colors.text }}>
                        {f.label} ({f.count})
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            )}
          </BlurView>
        </View>
      )}

      {/* List */}
      <ScrollView showsVerticalScrollIndicator={false}>
        {allAchievements.length === 0 ? (
          <Text style={{ textAlign: "center", color: colors.textSecondary, fontFamily: "Inter_400Regular", marginTop: 16 }}>
            No achievements found
          </Text>
        ) : filtered.length === 0 ? (
          <Text style={{ textAlign: "center", color: colors.textSecondary, fontFamily: "Inter_400Regular", marginTop: 16 }}>
            Nothing matches your filters
          </Text>
        ) : (
          filtered.map((a) => {
            const Icon = IconFor(a.icon_name);
            const locked = !a.is_completed;
            return (
              <View key={a.id} style={{ marginBottom: 8 }}>
                <BlurView
                  intensity={isDark ? 40 : 60}
                  tint={isDark ? "dark" : "light"}
                  style={{
                    backgroundColor: isDark ? "rgba(31,41,55,0.6)" : "rgba(255,255,255,0.6)",
                    borderRadius: 8,
                    padding: 12,
                    borderWidth: 1,
                    borderColor: a.is_completed ? colors.gameAccent1 + "40" : colors.border,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: locked ? colors.overlay : colors.gameAccent1 + "20", justifyContent: "center", alignItems: "center", marginRight: 10 }}>
                      <Icon size={16} color={locked ? colors.textSecondary : colors.gameAccent1} />
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: locked ? colors.textSecondary : colors.text }} numberOfLines={1}>
                        {a.name}
                      </Text>
                      {!!a.description && (
                        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colors.textSecondary }} numberOfLines={2}>
                          {a.description}
                        </Text>
                      )}
                      <Text style={{ marginTop: 2, fontFamily: "Inter_600SemiBold", fontSize: 9, color: a.is_completed ? colors.gameAccent1 : colors.textSecondary }}>
                        {a.is_completed ? "✓ COMPLETED" : a.target_value ? `Target: ${a.target_value}` : "Locked"}
                      </Text>
                    </View>

                    <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: a.is_completed ? colors.gameAccent1 : colors.gameAccent2, marginLeft: 8 }}>
                      +{a.points_reward || 0}
                    </Text>
                  </View>
                </BlurView>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}
