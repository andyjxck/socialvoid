// mobile/src/components/friends/PlayerCard.jsx
import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { BlurView } from "expo-blur";
import {
  UserPlus,
  MessageCircle,
  Hash,
  UserMinus,
  Trophy,
  Timer,
  Award,
} from "lucide-react-native";
import { useTheme } from "../../utils/theme";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../utils/supabase";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";

/*──────── helpers ────────*/
const fmtPlay = (s) => {
  const sec = Number(s) || 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

/**
 * Props:
 *  - player: { id (players.id), user_id (required), username?, profile_emoji?, total_points?, last_seen? }
 *  - isFriend (bool)
 *  - isPending (bool)
 *  - disableAdd (bool)
 *  - onAddFriend(number user_id)
 *  - onRemoveFriend(playerId, username)
 *  - onChat(player)
 *  - isAddingFriend (bool)
 *  - isOnline (bool)         <-- shows green dot (friends only)
 *  - unreadCount (number)    <-- red badge on chat button if > 0
 */
export default function PlayerCard({
  player,
  isFriend = false,
  isPending = false,
  disableAdd = false,
  onAddFriend,
  onRemoveFriend,
  onChat,
  isAddingFriend = false,
  isOnline = false,
  unreadCount = 0,
}) {
  const { colors, isDark } = useTheme();

  // Fonts
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const F400 = fontsLoaded ? "Inter_400Regular" : undefined;
  const F500 = fontsLoaded ? "Inter_500Medium" : undefined;
  const F600 = fontsLoaded ? "Inter_600SemiBold" : undefined;
  const F700 = fontsLoaded ? "Inter_700Bold" : undefined;

  // Prefer what we were passed; fall back to lookups to stay robust.
  const passedPid = Number(player?.id) || null;
  const userIdInt = Number(player?.user_id);
  const hasValidUserId = Number.isFinite(userIdInt) && userIdInt > 0;

  // Resolve player row by user_id (for stable display + totals)
  const { data: playerRow } = useQuery({
    queryKey: ["players:by-user_id", userIdInt],
    enabled: hasValidUserId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("players")
        .select(
          "id, user_id, username, profile_emoji, total_points, total_playtime_seconds"
        )
        .eq("user_id", userIdInt)
        .maybeSingle();
      if (error) throw error;
      return data || null;
    },
    staleTime: 60_000,
  });

  // Use the passed players.id first; else use the resolved one for stats
  const playerPid = passedPid || Number(playerRow?.id) || null;

  /* Top game stats (attach names) — requires players.id */
  const { data: topGameStats = [] } = useQuery({
    queryKey: ["player-stats-with-game-names", playerPid],
    enabled: !!playerPid,
    queryFn: async () => {
      const { data: rawStats, error: sErr } = await supabase
        .from("player_game_stats")
        .select("game_id,total_plays,total_playtime_seconds")
        .eq("player_id", playerPid);
      if (sErr) throw sErr;

      const rows = rawStats ?? [];
      if (rows.length === 0) return [];

      const gameIds = Array.from(
        new Set(rows.map((r) => r.game_id).filter((x) => x != null))
      );
      if (gameIds.length === 0) {
        return rows.map((r) => ({ ...r, game_name: "Unknown" }));
      }

      const { data: gameRows, error: gErr } = await supabase
        .from("games")
        .select("id,name")
        .in("id", gameIds);
      if (gErr) throw gErr;

      const nameById = new Map((gameRows ?? []).map((g) => [g.id, g.name]));
      return rows.map((r) => ({
        game_id: r.game_id,
        total_plays: r.total_plays ?? 0,
        total_playtime_seconds: r.total_playtime_seconds ?? 0,
        game_name: nameById.get(r.game_id) ?? "Unknown",
      }));
    },
    staleTime: 60_000,
  });

  /* Achievements count — requires players.id */
  const { data: completedAchCount = 0 } = useQuery({
    queryKey: ["player_achievements:completed-count", playerPid],
    enabled: !!playerPid,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("player_achievements")
        .select("id", { count: "exact", head: true })
        .eq("player_id", playerPid)
        .eq("is_completed", true);
      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 60_000,
  });

  /* Derived display */
  const headerUsername =
    playerRow?.username ||
    player?.username ||
    (hasValidUserId ? `Player ${userIdInt}` : "Player");

  const headerEmoji =
    playerRow?.profile_emoji || player?.profile_emoji || "🧩";

  const totalPoints =
    Number(playerRow?.total_points) ??
    Number(player?.total_points) ??
    0;

  const totalPlaytimeSeconds =
    Number(playerRow?.total_playtime_seconds) ??
    Number(player?.total_playtime_seconds) ??
    (Array.isArray(topGameStats)
      ? topGameStats.reduce(
          (sum, r) => sum + (Number(r.total_playtime_seconds) || 0),
          0
        )
      : 0);

  const top3 = React.useMemo(() => {
    if (!Array.isArray(topGameStats) || topGameStats.length === 0) return [];
    return [...topGameStats]
      .sort(
        (a, b) =>
          (b.total_playtime_seconds || 0) - (a.total_playtime_seconds || 0)
      )
      .slice(0, 3);
  }, [topGameStats]);

  const gameSlots = React.useMemo(
    () => [0, 1, 2].map((i) => top3[i] || null),
    [top3]
  );

  /* Add-friend button state + handler */
  const canAdd = hasValidUserId && !isFriend && !isAddingFriend && !disableAdd;

  const handleAdd = () => {
    if (!hasValidUserId) return;
    onAddFriend?.(userIdInt); // send integer user_id ONLY
  };

  // Badge content (cap at 99)
  const badgeText = unreadCount > 99 ? "99+" : String(unreadCount);

  if (!fontsLoaded) return null;

  return (
    <View style={{ marginBottom: 12 }}>
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
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <Text style={{ fontSize: 24 }}>{headerEmoji}</Text>

          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "700",
                  color: colors.text,
                  fontFamily: F700,
                }}
                numberOfLines={1}
              >
                {headerUsername}
              </Text>

              {/* ONLINE DOT — only if you’re friends */}
              {isFriend && (
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: isOnline ? "#22C55E" : colors.textSecondary + "66",
                    marginTop: 2,
                  }}
                />
              )}

              {hasValidUserId && (
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Hash size={10} color={colors.textSecondary} />
                  <Text
                    style={{
                      fontSize: 10,
                      color: colors.textSecondary,
                      fontFamily: F400,
                    }}
                    numberOfLines={1}
                  >
                    {userIdInt}
                  </Text>
                </View>
              )}
            </View>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                marginTop: 25,
              }}
            >
              {/* Total Points */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Trophy size={12} color={colors.gameAccent2} />
                <Text
                  style={{
                    fontSize: 12,
                    color: colors.gameAccent2,
                    fontFamily: F500,
                  }}
                >
                  {Number(totalPoints || 0).toLocaleString()}
                </Text>
              </View>

              {/* Total Playtime */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Timer size={12} color={colors.textSecondary} />
                <Text
                  style={{
                    fontSize: 12,
                    color: colors.textSecondary,
                    fontFamily: F400,
                  }}
                >
                  {fmtPlay(totalPlaytimeSeconds)}
                </Text>
              </View>

              {/* Completed Achievements */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Award size={12} color={colors.gameAccent1} />
                <Text
                  style={{
                    fontSize: 12,
                    color: colors.gameAccent1,
                    fontFamily: F500,
                  }}
                >
                  {completedAchCount}
                </Text>
              </View>
            </View>
          </View>

          <View style={{ alignItems: "flex-end", gap: 8 }}>
            {!isFriend ? (
              isPending ? (
                <View
                  style={{
                    backgroundColor: colors.gameAccent3 + "20",
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 8,
                  }}
                >
                  <Text
                    style={{ fontSize: 10, color: colors.gameAccent3, fontFamily: F600 }}
                  >
                    Pending
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={handleAdd}
                  disabled={!canAdd}
                  style={{
                    backgroundColor: colors.gameAccent1,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 8,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    opacity: canAdd ? 1 : 0.6,
                  }}
                >
                  <UserPlus size={12} color="#FFFFFF" />
                  <Text style={{ fontSize: 11, color: "#FFFFFF", fontFamily: F600 }}>
                    Add Friend
                  </Text>
                </TouchableOpacity>
              )
            ) : (
              <View style={{ flexDirection: "row", gap: 6 }}>
                {/* Chat button with UNREAD BADGE */}
                <View style={{ position: "relative" }}>
                  <TouchableOpacity
                    onPress={() => onChat?.(player)}
                    style={{
                      backgroundColor: colors.gameAccent2 + "20",
                      padding: 8,
                      borderRadius: 8,
                    }}
                  >
                    <MessageCircle size={14} color={colors.gameAccent2} />
                  </TouchableOpacity>

                  {unreadCount > 0 && (
                    <View
                      style={{
                        position: "absolute",
                        top: -2,
                        right: -2,
                        minWidth: 16,
                        height: 16,
                        paddingHorizontal: 3,
                        borderRadius: 8,
                        backgroundColor: "#EF4444",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text
                        style={{
                          color: "#fff",
                          fontSize: 10,
                          fontFamily: F700,
                        }}
                        numberOfLines={1}
                      >
                        {badgeText}
                      </Text>
                    </View>
                  )}
                </View>

                <TouchableOpacity
                  onPress={() => onRemoveFriend?.(playerPid, headerUsername)}
                  style={{
                    backgroundColor: colors.error + "20",
                    padding: 8,
                    borderRadius: 8,
                  }}
                  disabled={!playerPid}
                >
                  <UserMinus size={14} color={colors.error} />
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {/* Top Games */}
        <View>
          <Text
            style={{
              fontSize: 13,
              fontWeight: "600",
              color: colors.text,
              marginBottom: 12,
              fontFamily: F600,
              textAlign: "center",
            }}
          >
            🏆 Top Games
          </Text>

          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            {[0, 1, 2].map((index) => {
              const game = gameSlots[index];
              const accent =
                index === 0
                  ? colors.gameAccent1
                  : index === 1
                  ? colors.gameAccent2
                  : colors.gameAccent3;
              const isFilled = !!game;
              const key = isFilled
                ? `slot-${index}-${game.game_id}`
                : `slot-${index}-empty`;

              return (
                <View key={key} style={{ flex: 1, alignItems: "center" }}>
                  <View
                    style={{
                      backgroundColor: isFilled
                        ? accent + "20"
                        : colors.glassSecondary,
                      borderRadius: 8,
                      padding: 8,
                      width: "100%",
                      minHeight: 60,
                      alignItems: "center",
                      justifyContent: "center",
                      borderWidth: 1,
                      borderColor: isFilled ? `${accent}30` : colors.border,
                    }}
                  >
                    <Text style={{ fontSize: 16, marginBottom: 4 }}>
                      {index === 0 ? "🥇" : index === 1 ? "🥈" : "🥉"}
                    </Text>

                    {isFilled ? (
                      <>
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: "600",
                            color: colors.text,
                            textAlign: "center",
                            marginBottom: 2,
                            fontFamily: F600,
                          }}
                          numberOfLines={1}
                        >
                          {game.game_name}
                        </Text>
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: "700",
                            color: accent,
                            fontFamily: F700,
                          }}
                        >
                          {fmtPlay(game.total_playtime_seconds)}
                        </Text>
                      </>
                    ) : (
                      <>
                        <Text
                          style={{
                            fontSize: 9,
                            color: colors.textSecondary,
                            textAlign: "center",
                            fontFamily: F400,
                          }}
                        >
                          No game
                        </Text>
                        <Text
                          style={{
                            fontSize: 10,
                            color: colors.textSecondary,
                            fontFamily: F500,
                          }}
                        >
                          0m
                        </Text>
                      </>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      </BlurView>
    </View>
  );
}
