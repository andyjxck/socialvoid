import React, { useState, useEffect, useRef } from "react";
import { View, ScrollView, Text } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useTheme } from "../../../utils/theme";
import gameTracker from "../../../utils/gameTracking";
import { getGameId, GAME_TYPES } from "../../../utils/gameUtils";
import NightSkyBackground from "../../../components/NightSkyBackground";

import { useSolitaireGame } from "../../../hooks/useSolitaireGame";
import { GameHeader } from "../../../components/solitaire/GameHeader";
import { GameStats } from "../../../components/solitaire/GameStats";
import { TopSection } from "../../../components/solitaire/TopSection";
import { Tableau } from "../../../components/solitaire/Tableau";
import { Instructions } from "../../../components/solitaire/Instructions";

export default function SolitaireGame() {
  const insets = useSafeAreaInsets();
  const { isDark, colors } = useTheme();
  const {
    game,
    resetGame,
    undoLastMove,
    canUndo,
    stockCycles,
    isAutoCompleting,
    handleCardPress,
    handleEmptySpacePress,
    handleStockPress,
    isSelected,
    tryAutoPlaceInSafeZone,
  } = useSolitaireGame();

  const [currentPlayerId, setCurrentPlayerId] = useState(null);
  const [gameId, setGameId] = useState(null);
  const gameStartedRef = useRef(false);
  const currentGameIdRef = useRef(null);

  // Handle double-tap to auto-place cards in safe zone
  const handleCardDoublePress = (card, source, cardIndex) => {
    tryAutoPlaceInSafeZone(card, source, cardIndex);
  };

  // Enhanced reset function that properly ends and starts a new game
  const handleReset = async () => {
    // End current game if one is active
    if (currentGameIdRef.current && gameStartedRef.current) {
      await gameTracker.endGame(currentGameIdRef.current, 0); // 0 score for reset
      gameStartedRef.current = false;
    }

    // Reset the game
    resetGame();

    // Start new game tracking
    if (currentPlayerId && gameId) {
      await gameTracker.startGame(gameId, currentPlayerId);
      gameStartedRef.current = true;
      currentGameIdRef.current = gameId;
    }
  };

  useEffect(() => {
    const loadPlayerId = async () => {
      try {
        const savedPlayerId = await AsyncStorage.getItem(
          "puzzle_hub_player_id"
        );
        setCurrentPlayerId(savedPlayerId ? parseInt(savedPlayerId) : 1);
      } catch (error) {
        console.error("Failed to load player ID:", error);
        setCurrentPlayerId(1);
      }
    };
    loadPlayerId();
  }, []);

  // Initial game setup - only runs once when player ID is loaded
  useEffect(() => {
    let mounted = true;

    const setupInitialGame = async () => {
      if (!currentPlayerId || gameStartedRef.current) return;

      const id = await getGameId(GAME_TYPES.SOLITAIRE);
      if (id && currentPlayerId && mounted) {
        setGameId(id);
        await gameTracker.startGame(id, currentPlayerId);
        gameStartedRef.current = true;
        currentGameIdRef.current = id;
      }
    };

    setupInitialGame();

    return () => {
      mounted = false;
    };
  }, [currentPlayerId]);

  // Check for game completion
  useEffect(() => {
    const isGameWon = game.foundations.every((f) => f.length === 13);

    if (isGameWon && gameStartedRef.current && currentGameIdRef.current) {
      // Game won! End with score
      gameTracker.endGame(currentGameIdRef.current, Math.max(100, game.score));
      gameStartedRef.current = false;
      currentGameIdRef.current = null;
    }
  }, [game.foundations, game.score]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (currentGameIdRef.current && gameStartedRef.current) {
        // End game when component unmounts (player leaves)
        gameTracker.endGame(currentGameIdRef.current, game.score);
      }
    };
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <NightSkyBackground />

      <View
        style={{
          paddingTop: insets.top + 16,
          paddingHorizontal: 20,
          marginBottom: 20,
        }}
      >
        <GameHeader
          onReset={handleReset}
          onUndo={undoLastMove}
          canUndo={canUndo}
        />
        <GameStats
          score={game.score}
          moves={game.moves}
          stockCount={game.stock.length}
          stockCycles={stockCycles}
        />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
        showsVerticalScrollIndicator={false}
      >
        <TopSection
          game={game}
          onStockPress={handleStockPress}
          onCardPress={handleCardPress}
          onEmptySpacePress={handleEmptySpacePress}
          onCardDoublePress={handleCardDoublePress}
          isSelected={isSelected}
        />
        <Tableau
          tableau={game.tableau}
          onCardPress={handleCardPress}
          onEmptySpacePress={handleEmptySpacePress}
          onCardDoublePress={handleCardDoublePress}
          isSelected={isSelected}
        />
        <Instructions />
      </ScrollView>

      {/* Auto-completion indicator */}
      {isAutoCompleting && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.3)",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <View
            style={{
              backgroundColor: isDark
                ? "rgba(31, 41, 55, 0.9)"
                : "rgba(255, 255, 255, 0.9)",
              padding: 20,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text
              style={{
                color: colors.text,
                fontSize: 16,
                fontWeight: "bold",
                textAlign: "center",
              }}
            >
              Auto-completing game...
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}