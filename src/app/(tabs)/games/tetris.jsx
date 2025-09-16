import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ArrowLeft, RotateCcw } from "lucide-react-native";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

import { useTheme } from "../../../utils/theme";
import { useGameStats, GAME_STATS_TYPES } from "../../../hooks/useGameStats";
import gameTracker from "../../../utils/gameTracking";
import { getGameId, GAME_TYPES } from "../../../utils/gameUtils";
import NightSkyBackground from "../../../components/NightSkyBackground";
import { useTetrisGame } from "../../../hooks/useTetrisGame";

import TetrisBoard from "../../../components/tetris/TetrisBoard";
import ControlInstructions from "../../../components/tetris/ControlInstructions";
import GameControls from "../../../components/tetris/GameControls";
import PauseModal from "../../../components/tetris/PauseModal";
import GameOverModal from "../../../components/tetris/GameOverModal";

export default function TetrisGame() {
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [currentPlayerId, setCurrentPlayerId] = useState(null);
  const [gameId, setGameId] = useState(null);

  // 🎯 USE PERSISTENT STATS!
  const {
    stats,
    isLoading: isLoadingStats,
    error: statsError,
  } = useGameStats(currentPlayerId, GAME_STATS_TYPES.TETRIS);

  const {
    board,
    score,
    lines,
    gameOver,
    paused,
    initializeGame,
    movePiece,
    rotatePiece,
    togglePause,
  } = useTetrisGame();

  // Load player ID and setup game tracking
  useEffect(() => {
    const loadPlayerId = async () => {
      try {
        const savedPlayerId = await AsyncStorage.getItem(
          "puzzle_hub_player_id",
        );
        setCurrentPlayerId(savedPlayerId ? parseInt(savedPlayerId) : 1);
      } catch (error) {
        console.error("Failed to load player ID:", error);
        setCurrentPlayerId(1);
      }
    };
    loadPlayerId();
  }, []);

  useEffect(() => {
    let mounted = true;

    const setupGame = async () => {
      if (!currentPlayerId) return;
      const id = await getGameId(GAME_TYPES.TETRIS);
      if (id && currentPlayerId && mounted) {
        setGameId(id);
        await gameTracker.startGame(id, currentPlayerId);
        console.log("🎮 Tetris tracking started:", id);
      }
    };

    setupGame();
    return () => {
      mounted = false;
    };
  }, [currentPlayerId]);

  // Update database when game ends
  useEffect(() => {
    if (gameOver && gameId && currentPlayerId && score > 0) {
      gameTracker.endGame(gameId, score);
      console.log("🎯 Tetris game completed with score:", score);
    }
  }, [gameOver, gameId, currentPlayerId, score]);

  const panGesture = Gesture.Pan().onEnd((event) => {
    if (gameOver || paused) return;

    const { velocityX, velocityY, translationX, translationY } = event;
    const minVelocity = 300;
    const minDistance = 30;
    const absVelX = Math.abs(velocityX);
    const absVelY = Math.abs(velocityY);
    const absTransX = Math.abs(translationX);
    const absTransY = Math.abs(translationY);

    if (absVelX > absVelY && absVelX > minVelocity && absTransX > minDistance) {
      if (velocityX > 0) movePiece("right");
      else movePiece("left");
    } else if (
      absVelY > absVelX &&
      velocityY > minVelocity &&
      absTransY > minDistance
    ) {
      movePiece("down");
    }
  });

  const tapGesture = Gesture.Tap().onStart(() => {
    if (!gameOver && !paused) {
      rotatePiece();
    }
  });

  const gestures = Gesture.Exclusive(panGesture, tapGesture);

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="light" />

      {/* Cosmic background */}
      <LinearGradient
        colors={["#1a0b2e", "#16213e", "#0f3460", "#533a7d"]}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      />

      {/* Animated stars */}
      <NightSkyBackground />

      {/* Header */}
      <View
        style={{
          paddingTop: insets.top + 16,
          paddingHorizontal: 20,
          marginBottom: 16,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <TouchableOpacity
            onPress={() => router.back()}
            style={{
              padding: 12,
              borderRadius: 16,
              backgroundColor: "rgba(255, 255, 255, 0.1)",
              borderWidth: 1,
              borderColor: "rgba(255, 255, 255, 0.2)",
            }}
          >
            <ArrowLeft size={24} color="#E0E7FF" />
          </TouchableOpacity>

          <Text
            style={{
              fontSize: 22,
              fontWeight: "bold",
              color: "#E0E7FF",
              textShadowColor: "#8B5CF6",
              textShadowOffset: { width: 0, height: 0 },
              textShadowRadius: 10,
            }}
          >
            Tetris
          </Text>

          <TouchableOpacity
            onPress={async () => {
              await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
              initializeGame();
            }}
            style={{
              padding: 12,
              borderRadius: 16,
              backgroundColor: "rgba(255, 255, 255, 0.1)",
              borderWidth: 1,
              borderColor: "rgba(255, 255, 255, 0.2)",
            }}
          >
            <RotateCcw size={24} color="#E0E7FF" />
          </TouchableOpacity>
        </View>

        {/* PERSISTENT STATS DISPLAY */}
        <View style={{ borderRadius: 16, overflow: "hidden" }}>
          <BlurView
            intensity={40}
            tint="dark"
            style={{
              backgroundColor: "rgba(139, 92, 246, 0.2)",
              borderWidth: 1,
              borderColor: "rgba(224, 231, 255, 0.3)",
              borderRadius: 16,
              paddingHorizontal: 16,
              paddingVertical: 8,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <View style={{ alignItems: "center" }}>
                <Text
                  style={{ fontSize: 10, fontWeight: "600", color: "#94A3B8" }}
                >
                  HIGH SCORE
                </Text>
                <Text
                  style={{ fontSize: 12, fontWeight: "600", color: "#06D6A0" }}
                >
                  {isLoadingStats
                    ? "..."
                    : (stats?.high_score || 0).toLocaleString()}
                </Text>
              </View>

              <View style={{ alignItems: "center" }}>
                <Text
                  style={{ fontSize: 10, fontWeight: "600", color: "#94A3B8" }}
                >
                  CURRENT
                </Text>
                <Text
                  style={{ fontSize: 12, fontWeight: "600", color: "#E0E7FF" }}
                >
                  {score.toLocaleString()}
                </Text>
              </View>

              <View style={{ alignItems: "center" }}>
                <Text
                  style={{ fontSize: 10, fontWeight: "600", color: "#94A3B8" }}
                >
                  LINES
                </Text>
                <Text
                  style={{ fontSize: 12, fontWeight: "600", color: "#F72585" }}
                >
                  {lines}
                </Text>
              </View>
            </View>
          </BlurView>
        </View>
      </View>

      {/* Game Info */}
      <View
        style={{
          marginHorizontal: 20,
          marginBottom: 16,
        }}
      >
        <View style={{ borderRadius: 12, overflow: "hidden" }}>
          <BlurView
            intensity={30}
            tint="dark"
            style={{
              backgroundColor: "rgba(30, 41, 59, 0.4)",
              borderWidth: 1,
              borderColor: "rgba(148, 163, 184, 0.3)",
              borderRadius: 12,
              paddingHorizontal: 16,
              paddingVertical: 8,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <View style={{ alignItems: "center" }}>
                <Text
                  style={{ fontSize: 10, fontWeight: "600", color: "#94A3B8" }}
                >
                  GAMES
                </Text>
                <Text
                  style={{ fontSize: 12, fontWeight: "600", color: "#E0E7FF" }}
                >
                  {isLoadingStats ? "..." : stats?.total_plays || 0}
                </Text>
              </View>

              <TouchableOpacity
                onPress={togglePause}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  borderRadius: 12,
                  backgroundColor: paused
                    ? "rgba(6, 214, 160, 0.3)"
                    : "rgba(168, 85, 247, 0.3)",
                  borderWidth: 1,
                  borderColor: paused ? "#06D6A0" : "#A855F7",
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "600",
                    color: paused ? "#06D6A0" : "#A855F7",
                  }}
                >
                  {paused ? "RESUME" : "PAUSE"}
                </Text>
              </TouchableOpacity>

              <View style={{ alignItems: "center" }}>
                <Text
                  style={{ fontSize: 10, fontWeight: "600", color: "#94A3B8" }}
                >
                  LEVEL
                </Text>
                <Text
                  style={{ fontSize: 12, fontWeight: "600", color: "#A855F7" }}
                >
                  {Math.floor(lines / 10) + 1}
                </Text>
              </View>
            </View>
          </BlurView>
        </View>
      </View>

      {/* Game board */}
      <View
        style={{
          flex: 1,
          justifyContent: "flex-start",
          alignItems: "center",
          paddingHorizontal: 20,
          paddingBottom: 160,
        }}
      >
        <View style={{ borderRadius: 24, overflow: "hidden" }}>
          <BlurView
            intensity={60}
            tint="dark"
            style={{
              backgroundColor: "rgba(139, 92, 246, 0.15)",
              borderWidth: 2,
              borderColor: "rgba(224, 231, 255, 0.3)",
              borderRadius: 24,
              padding: 16,
              shadowColor: "#8B5CF6",
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.3,
              shadowRadius: 16,
              elevation: 10,
            }}
          >
            <GestureDetector gesture={gestures}>
              <TetrisBoard boardData={board} />
            </GestureDetector>
          </BlurView>
        </View>
      </View>

      {/* Bottom controls */}
      <View
        style={{
          paddingHorizontal: 20,
          paddingBottom: Math.max(insets.bottom + 16, 32),
          paddingTop: 8,
        }}
      >
        <ControlInstructions />
        <GameControls onMove={movePiece} onRotate={rotatePiece} />
      </View>

      {paused && !gameOver && <PauseModal onResume={togglePause} />}
      {gameOver && (
        <GameOverModal
          score={score}
          lines={lines}
          onPlayAgain={initializeGame}
        />
      )}
    </View>
  );
}
