// screens/HubScreen.jsx
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  View,
  ScrollView,
  RefreshControl,
  Animated,
  Easing,
  Text,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
  PanResponder,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../../utils/theme";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NightSkyBackground from "../../components/NightSkyBackground";
import HubHeader from "../../components/hub/HubHeader";
import GamesSection from "../../components/hub/GamesSection";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import { router } from "expo-router";
import { supabase } from "../../utils/supabase";
import { useFocusEffect } from "@react-navigation/native";
import AdBanner from "../../components/AdBanner";
import usePresencePing from "../../hooks/usePresencePing";
import DevRoadmap from "../../components/DevRoadmap";
import { Lock, X } from "lucide-react-native";

/* ────────── Tiny seasonal bits (unchanged) ────────── */
function SpookyFloaters({ enabled }) {
  const items = useMemo(
    () => [{ char: "🎃", size: 24, speed: 30000, yJitter: 10, opacity: 0.9 }].map((it, idx) => ({
      ...it,
      delay: idx * 1200,
      topPct: 10 + (idx * 16) % 70,
    })),
    []
  );
  return (
    <View pointerEvents="none" style={{ position: "absolute", inset: 0 }}>
      {enabled && items.map((it, idx) => <Floater key={idx} config={it} />)}
    </View>
  );
}
function Floater({ config }) {
  const x = useRef(new Animated.Value(-60)).current;
  const y = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    x.setValue(-60); y.setValue(0); opacity.setValue(0);
    Animated.loop(
      Animated.parallel([
        Animated.timing(opacity, { toValue: config.opacity, duration: 1200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(x, { toValue: 1, duration: config.speed, delay: config.delay, easing: Easing.linear, useNativeDriver: true }),
        Animated.sequence([
          Animated.timing(y, { toValue: 1, duration: config.speed / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(y, { toValue: 0, duration: config.speed / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      ])
    ).start();
  }, [config, x, y, opacity]);
  const translateX = x.interpolate({ inputRange: [-60, 1], outputRange: [-60, 1200] });
  const translateY = y.interpolate({ inputRange: [0, 1], outputRange: [0, -config.yJitter] });
  return (
    <Animated.View style={{ position: "absolute", top: `${config.topPct}%`, transform: [{ translateX }, { translateY }], opacity }}>
      <Text style={{ fontSize: config.size, textShadowColor: "rgba(0,0,0,0.4)", textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 6 }}>
        {config.char}
      </Text>
    </Animated.View>
  );
}
function CobwebCorners({ enabled }) {
  if (!enabled) return null;
  const web = (pos) => ({
    position: "absolute", width: 0, height: 0, borderStyle: "solid",
    borderRightWidth: 90, borderTopWidth: 90, borderRightColor: "transparent",
    borderTopColor: "rgba(255,255,255,0.06)", ...pos,
  });
  return (
    <View pointerEvents="none" style={{ position: "absolute", inset: 0 }}>
      <View style={web({ top: 0, left: 0 })} />
      <View style={[web({ top: 0, right: 0 }), { transform: [{ scaleX: -1 }] }]} />
      <View style={[web({ bottom: 0, left: 0 }), { transform: [{ scaleY: -1 }] }]} />
      <View style={[web({ bottom: 0, right: 0 }), { transform: [{ scaleX: -1 }, { scaleY: -1 }] }]} />
    </View>
  );
}
function SpookyRibbon({ enabled, onPress }) {
  if (!enabled) return null;
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", top: 10, left: 0, right: 0, alignItems: "center", zIndex: 20 }}>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={onPress}
        style={{
          paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999,
          backgroundColor: "rgba(255,140,0,0.15)", borderWidth: 1, borderColor: "rgba(255,140,0,0.35)",
          shadowColor: "#000", shadowOpacity: 0.25, shadowOffset: { width: 0, height: 4 }, shadowRadius: 8,
        }}
      />
    </View>
  );
}

/* ────────── Screen ────────── */
export default function HubScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const queryClient = useQueryClient();

  const [currentPlayerId, setCurrentPlayerId] = useState(null);
  const [showRoadmap, setShowRoadmap] = useState(false);

  // bottom-sheet animation + drag to close
  const sheetOpen = useRef(new Animated.Value(0)).current; // 0=hidden, 1=shown
  const dragY = useRef(new Animated.Value(0)).current;

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: Animated.event([null, { dy: dragY }], { useNativeDriver: false }),
      onPanResponderRelease: (_, { dy, vy }) => {
        const shouldClose = dy > 80 || vy > 0.9;
        Animated.parallel([
          Animated.timing(dragY, { toValue: 0, duration: 160, useNativeDriver: true }),
          Animated.timing(sheetOpen, { toValue: shouldClose ? 0 : 1, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]).start(() => {
          if (shouldClose) setShowRoadmap(false);
        });
      },
    })
  ).current;

  const [fontsLoaded] = useFonts({
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
  });

  const isSpookySeason = useMemo(() => new Date().getMonth() === 9, []);

  useEffect(() => {
    let mounted = true;
    const loadId = async () => {
      try {
        const savedId = await AsyncStorage.getItem("puzzle_hub_player_id");
        if (mounted) setCurrentPlayerId(savedId ? parseInt(savedId, 10) : null);
      } catch {}
    };
    loadId();
    const sub = AsyncStorage.addListener?.("change", () => loadId());
    return () => { mounted = false; sub?.remove?.(); };
  }, []);

  const { data: games = [], isLoading: gamesLoading, refetch: refetchGames } = useQuery({
    queryKey: ["games"],
    queryFn: async () => {
      const { data, error } = await supabase.from("games").select("*").order("name", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 60000,
  });

  const { data: player, isLoading: playerLoading, refetch: refetchPlayer } = useQuery({
    queryKey: ["player", currentPlayerId],
    enabled: !!currentPlayerId,
    queryFn: async () => {
      if (!currentPlayerId) return null;
      const { data, error } = await supabase.from("players").select("*").eq("id", currentPlayerId).maybeSingle();
      if (error) throw error;
      return data || null;
    },
    refetchInterval: 60000,
  });

  usePresencePing(player?.user_id, { intervalMs: 30000 });

  const { data: stats = [], isLoading: statsLoading, refetch: refetchStats } = useQuery({
    queryKey: ["player_game_stats", currentPlayerId],
    enabled: !!currentPlayerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("player_game_stats")
        .select("game_id,total_plays")
        .eq("player_id", currentPlayerId);
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 60000,
  });

  const totalPlaysSum = (stats || []).reduce((sum, s) => sum + (Number(s.total_plays) || 0), 0);

  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries(["player", currentPlayerId]);
      queryClient.invalidateQueries(["player_game_stats", currentPlayerId]);
      refetchGames();
    }, [currentPlayerId, queryClient, refetchGames])
  );

  const onRefresh = useCallback(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Promise.allSettled([refetchGames(), refetchPlayer(), refetchStats()]);
  }, [refetchGames, refetchPlayer, refetchStats]);

  const bgGradient = isSpookySeason
    ? ["rgba(15, 10, 28, 1)", "rgba(67, 24, 94, 0.95)", "rgba(255, 120, 0, 0.08)"]
    : isDark
    ? ["rgba(17,24,39,1)", "rgba(31,41,55,0.8)"]
    : ["rgba(139,92,246,0.1)", "rgba(255,255,255,0.9)"];

  const openSheet = () => {
    setShowRoadmap(true);
    sheetOpen.setValue(0);
    dragY.setValue(0);
    requestAnimationFrame(() =>
      Animated.timing(sheetOpen, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start()
    );
  };
  const closeSheet = () => {
    Animated.timing(sheetOpen, {
      toValue: 0,
      duration: 200,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => setShowRoadmap(false));
  };

  if (!fontsLoaded) return null;

  // translateY from open progress + drag
  const translateY = Animated.add(
    sheetOpen.interpolate({ inputRange: [0, 1], outputRange: [600, 0] }),
    dragY.interpolate({ inputRange: [-40, 0, 200], outputRange: [-8, 0, 180], extrapolate: "clamp" })
  );

  return (
    <View style={{ flex: 1, backgroundColor: isSpookySeason ? "#0f0a1c" : undefined }}>
      <StatusBar style={isDark ? "light" : "dark"} />

      <NightSkyBackground />
      <LinearGradient colors={bgGradient} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
      <CobwebCorners enabled={isSpookySeason} />
      <SpookyFloaters enabled={isSpookySeason} />
      <SpookyRibbon
        enabled={isSpookySeason}
        onPress={() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20, paddingTop: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={gamesLoading || playerLoading || statsLoading}
            onRefresh={onRefresh}
            tintColor={isSpookySeason ? "#FF8C00" : colors.gameAccent1}
            colors={[isSpookySeason ? "#FF8C00" : colors.gameAccent1]}
          />
        }
      >
        <HubHeader
          player={player}
          hasAccount={!!currentPlayerId}
          totalPlays={totalPlaysSum}
          onAccountPress={() =>
            currentPlayerId ? router.push("/(tabs)/profile") : router.push("/login")
          }
        />

        <AdBanner />

        <GamesSection
          games={games}
          isLoading={gamesLoading}
          onRetry={refetchGames}
          playerId={currentPlayerId}
        />

        <AdBanner />

        {isSpookySeason && (
          <LinearGradient
            colors={["rgba(255,140,0,0.0)", "rgba(255,140,0,0.08)", "rgba(255,140,0,0.14)"]}
            style={{ height: 120, marginTop: 16, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}
          />
        )}
      </ScrollView>

      {/* Floating padlock (icon-only) */}
      <TouchableOpacity
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); openSheet(); }}
        activeOpacity={0.9}
        style={{
          position: "absolute",
          left: 14,
          bottom: insets.bottom + 14,
          width: 40, height: 40, borderRadius: 20,
          alignItems: "center", justifyContent: "center",
          backgroundColor: isDark ? "rgba(139,92,246,0.18)" : "rgba(139,92,246,0.12)",
          borderWidth: 1,
          borderColor: isDark ? "rgba(139,92,246,0.35)" : "rgba(139,92,246,0.28)",
        }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Lock size={18} color={colors.gameAccent1} />
      </TouchableOpacity>

      {/* Bottom-sheet Dev Roadmap (keyboard-aware, swipe-down, backdrop close) */}
{/* Dev Roadmap – full-height, notch-safe, scroll-friendly */}
<Modal
  visible={showRoadmap}
  transparent
  presentationStyle="overFullScreen"
  animationType="fade"
  onRequestClose={closeSheet}
>
  {/* Backdrop (tap to close) */}
  <TouchableOpacity
    activeOpacity={1}
    style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)" }}
    onPress={closeSheet}
  />

  {/* Sheet (NO swipe-to-close; scrolling is uninterrupted) */}
  <KeyboardAvoidingView
    behavior={Platform.OS === "ios" ? "padding" : undefined}
    style={{
      position: "absolute",
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      // full screen; we draw our own container inside
    }}
  >
    <View
      style={{
        flex: 1,
        marginTop: 0,
        marginBottom: 0,
        backgroundColor: isDark ? "rgba(17,24,39,0.98)" : "rgba(255,255,255,0.98)",
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
        overflow: "hidden",
      }}
    >
      {/* Header INSIDE the safe area so the notch never covers it */}
      <View
        style={{
          paddingTop: insets.top + 10,        // <- key: reserves space for notch/Dynamic Island
          paddingBottom: 8,
          alignItems: "center",
          borderBottomWidth: 1,
          borderBottomColor: isDark ? "rgba(148,163,184,0.15)" : "rgba(148,163,184,0.2)",
        }}
      >
        <View
          style={{
            width: 46,
            height: 5,
            borderRadius: 3,
            backgroundColor: isDark ? "rgba(255,255,255,0.24)" : "rgba(0,0,0,0.18)",
          }}
        />
        <TouchableOpacity
          onPress={closeSheet}
          style={{
            position: "absolute",
            right: 10,
            top: insets.top + 6,              // <- always below the notch
            width: 34,
            height: 34,
            borderRadius: 17,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: isDark ? "rgba(31,41,55,0.7)" : "rgba(0,0,0,0.05)",
            borderWidth: 1,
            borderColor: isDark ? "rgba(139,92,246,0.25)" : "rgba(139,92,246,0.25)",
          }}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <X size={18} color={colors.gameAccent1} />
        </TouchableOpacity>
      </View>

      {/* Content – your DevRoadmap has its own ScrollView; let it breathe */}
      <View style={{ flex: 1 }}>
        <DevRoadmap />
      </View>

      {/* Bottom Close button – always reachable above the home bar */}
      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: 10,
          paddingBottom: Math.max(insets.bottom, 12),
          borderTopWidth: 1,
          borderTopColor: isDark ? "rgba(148,163,184,0.15)" : "rgba(148,163,184,0.2)",
          backgroundColor: isDark ? "rgba(17,24,39,0.98)" : "rgba(255,255,255,0.98)",
        }}
      >
        <TouchableOpacity
          onPress={closeSheet}
          activeOpacity={0.9}
          style={{
            height: 44,
            borderRadius: 12,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: isDark ? "rgba(148,163,184,0.25)" : "rgba(148,163,184,0.35)",
            backgroundColor: isDark ? "rgba(31,41,55,0.6)" : "rgba(0,0,0,0.04)",
          }}
        >
          <Text style={{ fontWeight: "700", color: colors.text }}>Close</Text>
        </TouchableOpacity>
      </View>
    </View>
  </KeyboardAvoidingView>
</Modal>

    </View>
  );
}
