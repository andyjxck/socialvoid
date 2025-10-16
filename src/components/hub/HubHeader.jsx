// components/hub/HubHeader.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TouchableOpacity, Animated, Easing, Pressable, ScrollView, Modal } from "react-native";
import { User, UserPlus, Menu, Volume2, VolumeX, Music2, FastForward, Minus, Plus, X, Repeat, SkipForward, Shuffle, PlusCircle } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { BlurView } from "expo-blur";
import { useTheme } from "../../utils/theme";
import playtimeTracker from "../../utils/playtimeTracker";
import * as musicBus from "../../utils/musicBus";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../utils/supabase";

const formatMs = (ms) => {
  const s = Math.max(0, Math.floor((ms || 0) / 1000));
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, "0");
  return `${m}:${ss}`;
};

const safeSub = (sub, handler) =>
  typeof sub === "function" ? sub(handler) : () => {};

const safeCall = (fn, ...args) =>
  typeof fn === "function" ? fn(...args) : undefined;

export default function HubHeader({ player, hasAccount, onAccountPress, onSidebarPress, totalPlays }) {
  const { colors } = useTheme();

  const playerLevel = player
    ? Math.floor((player.total_playtime_seconds || 0) / 60 / 5) + 1
    : 1;
  const allPlays = Number.isFinite(Number(totalPlays))
    ? Number(totalPlays)
    : Number(player?.total_plays_sum || 0);

  // Header state
  const [muted, setMuted] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [volume, setVolume] = useState(0.18);
  const [loopOne, setLoopOne] = useState(false);
  const [shuffle, setShuffle] = useState(true);

  // Now Playing

  const [nowPlaying, setNowPlaying] = useState({
    index: null,
    title: null,
    durationMs: 0,
    positionMs: 0,
    isPlaying: false,
  });

  // Queue (indices)
  const [queue, setQueue] = useState([]);

  // Anim
  const sheetScale = useRef(new Animated.Value(0.98)).current;
  const sheetOpacity = useRef(new Animated.Value(0)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  // Sliders
  const volSliderWRef = useRef(1);
  const seekSliderWRef = useRef(1);

  // Tracks list
  const tracks = useMemo(
    () => (Array.isArray(musicBus.TRACK_TITLES) ? musicBus.TRACK_TITLES.map((t, i) => ({ idx: i, title: t })) : []),
    []
  );

  // ── UNREAD DM COUNT → badge on profile icon ─────────────────────
  const playerId = Number(player?.id) || null; // players.id
  const { data: unreadTotal = 0 } = useQuery({
    queryKey: ["chat_messages:unread-total", playerId],
    enabled: !!playerId,
    refetchInterval: 10000,
    staleTime: 5000,
    queryFn: async () => {
      const pid = Number(playerId);
      if (!pid) return 0;
      const { count, error } = await supabase
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .eq("receiver_id", pid)
        .eq("is_read", false);
      if (error) return 0;
      return count ?? 0;
    },
  });

  // Bus hookups — init from getters, then subscribe
  useEffect(() => {
    try {
      setMuted(!!musicBus.getMuted?.());
      setVolume(Number(musicBus.getVolume?.() ?? 0.18));
      setShuffle(!!musicBus.getShuffle?.());
      setLoopOne(!!musicBus.getLoop?.());
      const np = musicBus.getNowPlaying?.();
      if (np) setNowPlaying((prev) => ({ ...prev, ...np }));
      setQueue(musicBus.getQueue?.() || []);
    } catch {}

    const unsubNP     = safeSub(musicBus.subscribeNowPlaying, (np) => setNowPlaying((prev) => ({ ...prev, ...np })));
    const unsubVol    = safeSub(musicBus.subscribeVolume, (v) => setVolume(Number(v) || 0));
    const unsubMuted  = safeSub(musicBus.subscribeMuted, (m) => setMuted(!!m));
    const unsubShuf   = safeSub(musicBus.subscribeShuffleSet, (v) => setShuffle(!!v));
    const unsubLoop   = safeSub(musicBus.subscribeLoopSet, (v) => setLoopOne(!!v));
    const unsubQueue  = safeSub(musicBus.subscribeQueueState, (q) => setQueue(Array.isArray(q) ? q : []));

    return () => {
      unsubNP?.(); unsubVol?.(); unsubMuted?.(); unsubShuf?.(); unsubLoop?.(); unsubQueue?.();
    };
  }, []);

  // Reflect local toggles to bus
  useEffect(() => { safeCall(musicBus.publishMuted, muted); }, [muted]);
  useEffect(() => { safeCall(musicBus.publishLoopSet, loopOne); }, [loopOne]);

  // Modal open/close
  const openControls = async () => {
    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    setShowControls(true);
    sheetScale.setValue(0.98); sheetOpacity.setValue(0); backdropOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(sheetScale, { toValue: 1, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(sheetOpacity, { toValue: 1, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 1, duration: 160, useNativeDriver: true }),
    ]).start();
  };
  const closeControls = () => {
    Animated.parallel([
      Animated.timing(sheetScale, { toValue: 0.98, duration: 140, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      Animated.timing(sheetOpacity, { toValue: 0, duration: 140, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 0, duration: 120, useNativeDriver: true }),
    ]).start(({ finished }) => { if (finished) setShowControls(false); });
  };

  // Volume slider
  const handleVolPos = (x) => {
    const w = volSliderWRef.current || 1;
    const v = Math.max(0, Math.min(1, x / w));
    setVolume(v);
    safeCall(musicBus.publishVolume, v);
  };

  // Seek slider
  const doSeekFromX = (x) => {
    const w = seekSliderWRef.current || 1;
    const pct = Math.max(0, Math.min(1, x / w));
    const targetMs = (nowPlaying.durationMs || 0) * pct;
    safeCall(musicBus.publishSeekMs, targetMs);
  };

  const progressPct =
    nowPlaying.durationMs > 0
      ? Math.max(0, Math.min(1, (nowPlaying.positionMs || 0) / (nowPlaying.durationMs || 0)))
      : 0;

  const pickTrack = async (idx) => {
    safeCall(musicBus.publishPlayByIndex, idx);
    try { await Haptics.selectionAsync(); } catch {}
  };

  // Queue ops (bus-backed)
  const moveInQueue = (from, to) => {
    safeCall(musicBus.publishQueueMove, from, to);
    try { Haptics.selectionAsync(); } catch {}
  };
  const removeFromQueue = (pos) => {
    safeCall(musicBus.publishQueueRemoveAt, pos);
    try { Haptics.selectionAsync(); } catch {}
  };
  const clearQueue = () => {
    safeCall(musicBus.publishQueueClear);
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
  };

  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingHorizontal: 20, paddingTop: 65, paddingBottom: 24 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 28, color: colors.text, marginBottom: 8 }}>Game Void</Text>
        {player && (
          <View>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.gameAccent1 }}>Level {playerLevel}</Text>
            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.gameAccent2 }}>{playtimeTracker.getPlayerTitle(playerLevel)}</Text>
            <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>{allPlays.toLocaleString()} plays</Text>
          </View>
        )}
      </View>

      <View style={{ flexDirection: "row", gap: 8 }}>
        <TouchableOpacity
          onPress={showControls ? undefined : () => setMuted((m) => !m)}
          onLongPress={showControls ? undefined : openControls}
          delayLongPress={300}
          style={{
            width: 48, height: 48, borderRadius: 24,
            backgroundColor: colors.glassSecondary, justifyContent: "center", alignItems: "center",
            borderWidth: 2, borderColor: (muted ? colors.textSecondary : colors.gameAccent2) + "40", marginRight: 8,
          }}
          accessibilityRole="button"
          accessibilityLabel={muted ? "Unmute music" : "Mute music"}
        >
          {showControls ? <X size={18} color={colors.text} /> : muted ? <VolumeX size={22} color={colors.text} /> : <Volume2 size={22} color={colors.text} />}
        </TouchableOpacity>

        {/* PROFILE ICON with unread badge */}
        <TouchableOpacity
          onPress={onAccountPress}
          style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.gameAccent1 + "20", justifyContent: "center", alignItems: "center", borderWidth: 2, borderColor: colors.gameAccent1 + "40" }}
        >
          <View style={{ position: "relative" }}>
            {player?.profile_emoji ? (
              <Text style={{ fontSize: 20 }}>{player.profile_emoji}</Text>
            ) : hasAccount ? (
              <User size={24} color={colors.gameAccent1} />
            ) : (
              <UserPlus size={20} color={colors.text} />
            )}

            {unreadTotal > 0 && (
              <View
                // tweak these to move it “right and up a bit”
                style={{
                  position: "absolute",
                  top: -2,
                  right: -2,
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: "#EF4444",
                  borderWidth: 1,
                  borderColor: "#FFFFFF",
                }}
              />
            )}
          </View>
        </TouchableOpacity>
      </View>

      <Modal animationType="fade" transparent visible={showControls} onRequestClose={closeControls}>
        <Animated.View style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, opacity: backdropOpacity }}>
          <BlurView intensity={60} tint="light" style={{ position: "absolute", inset: 0 }} />
        </Animated.View>

        <Pressable onPress={closeControls} style={{ position: "absolute", inset: 0 }} />

        <Animated.View
          style={{
            position: "absolute", top: 60, left: 12, right: 12, bottom: 24,
            borderRadius: 18, overflow: "hidden", transform: [{ scale: sheetScale }], opacity: sheetOpacity,
            backgroundColor: "rgba(82, 62, 120, 0.6)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
            shadowColor: "#000", shadowOpacity: 0.5, shadowOffset: { width: 0, height: 10 }, shadowRadius: 24, elevation: 20,
          }}
        >
          {/* Header */}
          <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.08)", flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "rgba(12,12,14,0.55)" }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Music2 size={18} color={colors.text} />
              <Text style={{ marginLeft: 10, fontFamily: "Inter_700Bold", fontSize: 16, color: colors.text }}>DJ Controls</Text>
            </View>
            <TouchableOpacity onPress={closeControls} hitSlop={10}><X size={20} color={colors.text} /></TouchableOpacity>
          </View>

          {/* Content */}
          <ScrollView contentContainerStyle={{ padding: 14 }}>
            {/* NOW PLAYING + SEEK */}
            <View style={{ borderRadius: 14, padding: 14, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: colors.textSecondary, marginBottom: 8 }}>Now Playing</Text>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: colors.text }} numberOfLines={1}>{nowPlaying.title ?? "—"}</Text>

              <View style={{ marginTop: 10 }}>
                <View
                  onLayout={(e) => { seekSliderWRef.current = e.nativeEvent.layout.width; }}
                  onStartShouldSetResponder={() => true}
                  onResponderGrant={(evt) => doSeekFromX(evt.nativeEvent.locationX)}
                  onResponderMove={(evt) => doSeekFromX(evt.nativeEvent.locationX)}
                  style={{ height: 16, borderRadius: 8, backgroundColor: "#1a1a1a", justifyContent: "center", overflow: "hidden" }}
                >
                  <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.round(progressPct * 100)}%`, height: "100%", backgroundColor: colors.gameAccent2 }} />
                  <View style={{ position: "absolute", top: -2, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.text, borderWidth: 2, borderColor: colors.gameAccent2, transform: [{ translateX: Math.max(0, Math.min(1, progressPct)) * (seekSliderWRef.current || 0) - 10 }] }} />
                </View>
                <View style={{ marginTop: 6, flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.textSecondary }}>{formatMs(nowPlaying.positionMs)}</Text>
                  <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.textSecondary }}>{formatMs(nowPlaying.durationMs)}</Text>
                </View>
              </View>
            </View>

            {/* CONTROLS */}
            <View style={{ marginTop: 12, borderRadius: 14, padding: 12, backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" }}>
              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: colors.textSecondary, marginBottom: 8 }}>Controls</Text>

              {/* Volume slider */}
              <View style={{ flex: 1, height: 34, justifyContent: "center" }}>
                <View
                  onLayout={(e) => { volSliderWRef.current = e.nativeEvent.layout.width; }}
                  onStartShouldSetResponder={() => true}
                  onResponderGrant={(evt) => handleVolPos(evt.nativeEvent.locationX)}
                  onResponderMove={(evt) => handleVolPos(evt.nativeEvent.locationX)}
                  style={{ height: 16, borderRadius: 8, backgroundColor: "#1a1a1a", justifyContent: "center", overflow: "hidden" }}
                >
                  <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.round(volume * 100)}%`, backgroundColor: colors.gameAccent2 }} />
                  <Animated.View style={{ position: "absolute", top: -2, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.text, borderWidth: 2, borderColor: colors.gameAccent2, transform: [{ translateX: Math.max(0, Math.min(1, volume)) * (volSliderWRef.current || 0) - 10 }] }} />
                </View>
              </View>

              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <TouchableOpacity onPress={() => { const v = Math.max(0, volume - 0.025); setVolume(v); safeCall(musicBus.publishVolume, v); }} style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.04)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", marginRight: 3 }}>
                  <Minus size={16} color={colors.text} />
                </TouchableOpacity>

                <TouchableOpacity onPress={() => { const v = Math.min(1, volume + 0.025); setVolume(v); safeCall(musicBus.publishVolume, v); }} style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.04)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", marginLeft: 3 }}>
                  <Plus size={16} color={colors.text} />
                </TouchableOpacity>

                <TouchableOpacity onPress={() => { const next = !loopOne; setLoopOne(next); safeCall(musicBus.publishLoopSet, next); Haptics.selectionAsync().catch(() => {}); }} style={{ marginLeft: 3, paddingHorizontal: 10, height: 34, borderRadius: 8, backgroundColor: loopOne ? "rgba(122,63,179,0.28)" : "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: loopOne ? colors.gameAccent2 : "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center", flexDirection: "row" }}>
                  <Repeat size={14} color={colors.text} />
                  <Text style={{ marginLeft: 3, fontFamily: "Inter_600SemiBold", fontSize: 12, color: colors.text }}>{loopOne ? "Loop" : "No Loop"}</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => { const next = !shuffle; setShuffle(next); safeCall(musicBus.publishShuffleSet, next); Haptics.selectionAsync().catch(() => {}); }} style={{ marginLeft: 3, paddingHorizontal: 10, height: 34, borderRadius: 8, backgroundColor: shuffle ? "rgba(122,63,179,0.28)" : "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: shuffle ? colors.gameAccent2 : "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center", flexDirection: "row" }}>
                  <Shuffle size={14} color={colors.text} />
                  <Text style={{ marginLeft: 3, fontFamily: "Inter_600SemiBold", fontSize: 12, color: colors.text }}>{shuffle ? "Shuffle" : "Ordered"}</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => { safeCall(musicBus.publishSkipNext); Haptics.selectionAsync().catch(() => {}); }} style={{ marginLeft: 3, paddingHorizontal: 10, height: 34, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center", flexDirection: "row" }} accessibilityLabel="Skip to next track">
                  <SkipForward size={14} color={colors.text} />
                  <Text style={{ marginLeft: 3, fontFamily: "Inter_600SemiBold", fontSize: 12, color: colors.text }}>Skip</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* QUEUE EDITOR */}
            <View style={{ marginTop: 12, borderRadius: 14, padding: 12, backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: colors.textSecondary }}>Queue</Text>
                <TouchableOpacity onPress={clearQueue} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
                  <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: colors.text }}>Clear</Text>
                </TouchableOpacity>
              </View>

              {queue.length === 0 ? (
                <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.textSecondary }}>No queued tracks.</Text>
              ) : (
                queue.map((idx, i) => (
                  <View key={`${idx}-${i}`} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", marginBottom: 6 }}>
                    <Text style={{ flex: 1, fontFamily: "Inter_600SemiBold", fontSize: 12, color: colors.text }} numberOfLines={1}>
                      {musicBus.TRACK_TITLES?.[idx] ?? `Track-${idx + 1}`}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <TouchableOpacity onPress={() => i > 0 && moveInQueue(i, i - 1)} style={{ paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", marginRight: 6 }}>
                        <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: colors.text }}>↑</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => i < queue.length - 1 && moveInQueue(i, i + 1)} style={{ paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", marginRight: 6 }}>
                        <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: colors.text }}>↓</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => removeFromQueue(i)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
                        <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: colors.text }}>Remove</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </View>

            {/* TRACKS */}
            <View style={{ marginTop: 12, borderRadius: 14, padding: 12, backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" }}>
              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: colors.textSecondary, marginBottom: 8 }}>Tracks (tap title to play)</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                {tracks.map((t) => {
                  const isActive = nowPlaying?.index === t.idx;
                  return (
                    <View key={t.idx} style={{ width: "48%", margin: "1%", borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: isActive ? "rgba(96,82,150,0.18)" : "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: isActive ? colors.gameAccent2 : "rgba(255,255,255,0.08)", shadowColor: "#000", shadowOpacity: 0.25, shadowOffset: { width: 0, height: 8 }, shadowRadius: 12, elevation: 6 }}>
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <View style={{ minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 999, alignItems: "center", justifyContent: "center", marginRight: 8, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)" }}>
                          <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: colors.text }}>{t.idx + 1}</Text>
                        </View>
                        <TouchableOpacity onPress={() => pickTrack(t.idx)} style={{ flex: 1 }} accessibilityLabel={`Play ${t.title}`} activeOpacity={0.8}>
                          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 10.5, color: colors.text }} numberOfLines={1}>{t.title}</Text>
                          <Text style={{ marginTop: 2, fontFamily: "Inter_500Medium", fontSize: 11, color: isActive ? colors.gameAccent2 : colors.textSecondary }} numberOfLines={1}>
                            {isActive ? "Now playing" : "Tap to play"}
                          </Text>
                        </TouchableOpacity>
                      </View>
                      <TouchableOpacity
                        onPress={() => { safeCall(musicBus.publishQueueAdd, t.idx); Haptics.selectionAsync().catch(() => {}); }}
                        style={{ marginTop: 10, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)" }}
                        accessibilityLabel={`Add ${t.title} to queue`}
                        activeOpacity={0.85}
                      >
                        <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: colors.text, marginRight: 6 }}>Add to queue</Text>
                        <PlusCircle size={16} color={colors.text} />
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>

              <View style={{ flexDirection: "row", justifyContent: "flex-end", paddingTop: 6 }}>
                <TouchableOpacity
                  onPress={() => {
                    const nextIdx = Math.floor(Math.random() * tracks.length);
                    safeCall(musicBus.publishPlayByIndex, nextIdx);
                    Haptics.selectionAsync().catch(() => {});
                  }}
                  style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" }}
                >
                  <FastForward size={14} color={colors.text} />
                  <Text style={{ marginLeft: 6, fontFamily: "Inter_600SemiBold", fontSize: 12, color: colors.text }}>Random</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </Animated.View>
      </Modal>
    </View>
  );
}
