import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../utils/supabase"; // adjust path if different

export function usePlayer() {
  const [currentPlayerId, setCurrentPlayerId] = useState(null);
  const [hasAccount, setHasAccount] = useState(false);

  // Auto-create/load player on startup
  useEffect(() => {
    const initializePlayer = async () => {
      try {
        const savedPlayerId = await AsyncStorage.getItem(
          "puzzle_hub_player_id",
        );

        if (savedPlayerId) {
          const playerId = parseInt(savedPlayerId);
          setCurrentPlayerId(playerId);

          const { data: playerData, error } = await supabase
            .from("players")
            .select("*")
            .eq("id", playerId)
            .single();

          if (!error && playerData) {
            setHasAccount(!!playerData.user_id);
          }
        } else {
          // Create a new player row
          const { data: newPlayer, error } = await supabase
            .from("players")
            .insert([
              {
                username: `Player${Math.floor(Math.random() * 10000)}`,
              },
            ])
            .select()
            .single();

          if (!error && newPlayer) {
            setCurrentPlayerId(newPlayer.id);
            await AsyncStorage.setItem(
              "puzzle_hub_player_id",
              newPlayer.id.toString(),
            );
            setHasAccount(false);
          }
        }
      } catch (error) {
        console.error("Failed to initialize player:", error);
        setCurrentPlayerId(1); // Fallback to demo player
      }
    };

    initializePlayer();
  }, []);

  const {
    data: player,
    isLoading: playerLoading,
    refetch: refetchPlayer,
    error: playerError,
  } = useQuery({
    queryKey: ["player", currentPlayerId],
    queryFn: async () => {
      if (!currentPlayerId) return null;
      const { data, error } = await supabase
        .from("players")
        .select("*")
        .eq("id", currentPlayerId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!currentPlayerId,
    retry: 3,
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
  });

  // Update account status when player data changes
  useEffect(() => {
    if (player) {
      setHasAccount(!!player.user_id);
    }
  }, [player]);

  return {
    currentPlayerId,
    setCurrentPlayerId,
    player,
    playerLoading,
    refetchPlayer,
    playerError,
    hasAccount,
    setHasAccount,
  };
}
