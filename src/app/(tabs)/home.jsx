// screens/HubScreen.jsx
import React, { useState, useEffect, useCallback } from "react";
import { View, ScrollView, RefreshControl } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../../utils/theme";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NightSkyBackground from "../../components/NightSkyBackground";
import HubHeader from "../../components/hub/HubHeader";
import GamesSection from "../../components/hub/GamesSection";
import Sidebar from "../../components/hub/Sidebar";
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

export default function HubScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const [currentPlayerId, setCurrentPlayerId] = useState(null);
  const [sidebarVisible, setSidebarVisible] = useState(false);

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // Load player ID from AsyncStorage
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const savedPlayerId = await AsyncStorage.getItem("puzzle_hub_player_id");
        if (mounted && savedPlayerId) {
          setCurrentPlayerId(parseInt(savedPlayerId, 10));
        }
      } catch (error) {
        console.error("[HubScreen] Failed to load player ID:", error);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Fetch games from Supabase
  const {
    data: games = [],
    isLoading: gamesLoading,
    refetch: refetchGames,
  } = useQuery({
    queryKey: ["games"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("games")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
  });

  // Fetch current player from Supabase
  const {
    data: player,
    isLoading: playerLoading,
    refetch: refetchPlayer,
  } = useQuery({
    queryKey: ["player", currentPlayerId],
    queryFn: async () => {
      if (!currentPlayerId) return null;
      const { data, error } = await supabase
        .from("players")
        .select("*")
        .eq("id", currentPlayerId)
        .maybeSingle();
      if (error) throw error;
      return data || null;
    },
    enabled: !!currentPlayerId,
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
  });

  // Refetch when this screen regains focus (so GameCards can also refetch playtime)
  useFocusEffect(
    useCallback(() => {
      refetchGames();
      refetchPlayer();
    }, [refetchGames, refetchPlayer])
  );

  const onRefresh = useCallback(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Promise.allSettled([refetchGames(), refetchPlayer()]);
  }, [refetchGames, refetchPlayer]);

  const handleRetry = useCallback(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await refetchGames();
  }, [refetchGames]);

  const handleSidebarPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSidebarVisible(true);
  }, []);

  const handleCloseSidebar = useCallback(() => {
    setSidebarVisible(false);
  }, []);

  if (!fontsLoaded) return null;

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <NightSkyBackground />

      <LinearGradient
        colors={
          isDark
            ? ["rgba(17, 24, 39, 1)", "rgba(31, 41, 55, 0.8)"]
            : ["rgba(139, 92, 246, 0.1)", "rgba(255, 255, 255, 0.9)"]
        }
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={gamesLoading || playerLoading}
            onRefresh={onRefresh}
            tintColor={colors.gameAccent1}
            colors={[colors.gameAccent1]}
          />
        }
      >
        <HubHeader
          player={player}
          currentPlayerId={currentPlayerId}
          onAccountPress={() =>
            currentPlayerId ? router.push("/(tabs)/profile") : router.push("/login")
          }
          onSidebarPress={handleSidebarPress}
        />

        {/* Pass playerId down so GameCard can query Supabase per-game */}
        <GamesSection
          games={games}
          isLoading={gamesLoading}
          onRetry={handleRetry}
          playerId={currentPlayerId}
        />
      </ScrollView>

      <Sidebar
        visible={sidebarVisible}
        onClose={handleCloseSidebar}
        playerId={currentPlayerId}
      />
    </View>
  );
}
