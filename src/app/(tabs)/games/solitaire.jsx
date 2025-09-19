// src/app/(tabs)/games/solitaire.jsx
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

  // IDs
  const [currentPlayerId, setCurrentPlayerId] = useState(null);
  const [gameId, setGameId] = useState(null);

  // run/session control
  const gameStartedRef = useRef(false);
  const currentGameIdRef = useRef(null);
  const submittedRef = useRef(false); // prevent double endGame

  // local high score cache (to gate sending high_score)
  const [bestLocalScore, setBestLocalScore] = useState(0);
  const bestLocalRef = useRef(0);
  useEffect(() => {
    bestLocalRef.current = bestLocalScore;
  }, [bestLocalScore]);

  // Load cached best score
  useEffect(() => {
    const loadBest = async () => {
      try {
        const saved = await AsyncStorage.getItem("solitaire_scores");
        if (saved) {
          const { best = 0 } = JSON.parse(saved);
          setBestLocalScore(best);
        }
      } catch {}
    };
    loadBest();
  }, []);

  const saveBestLocal = async (best) => {
    try {
      await AsyncStorage.setItem("solitaire_scores", JSON.stringify({ best }));
    } catch {}
  };

  // Track latest score via ref for safe reads on unmount
  const scoreRef = useRef(0);
  useEffect(() => {
    scoreRef.current = game?.score || 0;
  }, [game.score]);

  // Double tap helper
  const handleCardDoublePress = (card, source, cardIndex) => {
    tryAutoPlaceInSafeZone(card, source, cardIndex);
  };

  // Persistent submit helper; attaches high_score only if beating local best
  const submitPersistent = async (finalScore, reason) => {
    if (!gameId || !currentGameIdRef.current || submittedRef.current) return;
    try {
      const meta = {
        result: reason === "win" ? "win" : "play",
        reason,
      };
      if (finalScore > bestLocalRef.current) {
        meta.high_score = finalScore;
      }
      await gameTracker.endGame(currentGameIdRef.current, finalScore, meta);
      submittedRef.current = true;

      if (finalScore > bestLocalRef.current) {
        setBestLocalScore(finalScore);
        saveBestLocal(finalScore);
      }
    } catch (e) {
      // keep quiet but guard prevents double spam
      // console.warn("Solitaire submitPersistent failed:", e?.message || e);
    }
  };

  // Reset handler: end current run as a play, then start a new run
  const handleReset = async () => {
    if (currentGameIdRef.current && gameStartedRef.current) {
      await submitPersistent(scoreRef.current, "reset");
      gameStartedRef.current = false;
    }

    // Reset local board state
    resetGame();
    submittedRef.current = false;

    // Start new tracking run
    if (currentPlayerId && gameId) {
      try {
        await gameTracker.startGame(gameId, currentPlayerId);
        gameStartedRef.current = true;
        currentGameIdRef.current = gameId;
      } catch {}
    }
  };

  // Load player id once
  useEffect(() => {
    const loadPlayerId = async () => {
      try {
        const savedPlayerId = await AsyncStorage.getItem("puzzle_hub_player_id");
        setCurrentPlayerId(savedPlayerId ? parseInt(savedPlayerId, 10) : 1);
      } catch (error) {
        setCurrentPlayerId(1);
      }
    };
    loadPlayerId();
  }, []);

  // Initial game setup - start a tracking run
  useEffect(() => {
    let mounted = true;
    const setupInitialGame = async () => {
      if (!currentPlayerId || gameStartedRef.current) return;

      try {
        const id = await getGameId(GAME_TYPES.SOLITAIRE);
        if (!mounted) return;
        if (id) {
          setGameId(id);
          await gameTracker.startGame(id, currentPlayerId);
          gameStartedRef.current = true;
          currentGameIdRef.current = id;
          submittedRef.current = false;
        }
      } catch {}
    };

    setupInitialGame();
    return () => {
      mounted = false;
    };
  }, [currentPlayerId]);

  // Watch for completion (all foundations full)
  useEffect(() => {
    const isGameWon = game.foundations.every((f) => f.length === 13);
    if (isGameWon && gameStartedRef.current && currentGameIdRef.current) {
      // end as win; include high_score only if higher
      submitPersistent(Math.max(100, game.score), "win");
      gameStartedRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.foundations, game.score]);

  // Submit on unmount as a play (not a win)
  useEffect(() => {
    return () => {
      if (currentGameIdRef.current && gameStartedRef.current && !submittedRef.current) {
        submitPersistent(scoreRef.current, "unmount");
        gameStartedRef.current = false;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        <GameHeader onReset={handleReset} onUndo={undoLastMove} canUndo={canUndo} />
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

      {/* Auto-completing overlay */}
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
