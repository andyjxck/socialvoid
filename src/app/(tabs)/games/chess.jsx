import React, { useState, useEffect } from "react";
import { View, Text, Dimensions, TouchableOpacity } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { ArrowLeft, RotateCcw } from "lucide-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { BlurView } from "expo-blur";

import { useTheme } from "../../../utils/theme";
import { useChessGame } from "../../../hooks/useChessGame";
import gameTracker from "../../../utils/gameTracking";
import { getGameId, GAME_TYPES } from "../../../utils/gameUtils";
import { useGameStats, GAME_STATS_TYPES } from "../../../hooks/useGameStats";
import { GameHeader } from "../../../components/chess/GameHeader";
import { GameInfoPanel } from "../../../components/chess/GameInfoPanel";
import { ChessBoard } from "../../../components/chess/ChessBoard";
import NightSkyBackground from "../../../components/NightSkyBackground";
import * as ChessLogic from "../../../utils/chess/logic";

const { width: screenWidth } = Dimensions.get("window");

export default function ChessGame() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const [currentPlayerId, setCurrentPlayerId] = useState(null);
  const [gameId, setGameId] = useState(null);

  // 🎯 USE PERSISTENT STATS!
  const {
    stats,
    isLoading: isLoadingStats,
    error: statsError,
  } = useGameStats(currentPlayerId, GAME_STATS_TYPES.CHESS);

  const {
    board,
    selectedSquare,
    availableMoves,
    currentPlayer,
    timer,
    aiThinking,
    inCheck,
    promotionData,
    initializeGame,
    handleSquarePress,
    handlePromotionChoice,
    playerStats,
  } = useChessGame(gameId);

  // Calculate persistent win/loss record
  const [persistentScore, setPersistentScore] = useState({ player: 0, ai: 0 });

  useEffect(() => {
    if (stats) {
      const playerWins = stats.high_score || 0; // wins stored in high_score
      const totalGames = stats.total_plays || 0;
      const aiWins = Math.max(0, totalGames - playerWins);

      setPersistentScore({ player: playerWins, ai: aiWins });
      console.log("🎮 Chess persistent stats:", {
        playerWins,
        aiWins,
        totalGames,
      });
    }
  }, [stats]);

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
    let currentGameId = null;

    const setupGame = async () => {
      if (!currentPlayerId) return;

      const id = await getGameId(GAME_TYPES.CHESS);
      if (id && currentPlayerId && mounted) {
        currentGameId = id;
        setGameId(id);
        await gameTracker.startGame(id, currentPlayerId);
        console.log("🎮 Chess tracking started:", id);
      } else if (mounted) {
        console.error("❌ Could not get Chess game ID or player ID");
      }
    };

    setupGame();

    return () => {
      mounted = false;
    };
  }, [currentPlayerId]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getSquareColor = (row, col) => {
    const isLight = (row + col) % 2 === 0;
    const isSelected =
      selectedSquare &&
      selectedSquare.row === row &&
      selectedSquare.col === col;
    const isAvailableMove = availableMoves.some(
      ([moveRow, moveCol]) => moveRow === row && moveCol === col,
    );

    if (isSelected) return "rgba(168, 85, 247, 0.6)";
    if (isAvailableMove) return "rgba(6, 214, 160, 0.4)";
    return isLight ? "rgba(224, 231, 255, 0.15)" : "rgba(139, 92, 246, 0.2)";
  };

  const getStatusText = () => {
    if (inCheck.white) return "⚠️ You in Check!";
    if (inCheck.black) return "⚠️ AI in Check!";
    if (currentPlayer === "white") return "Your Turn";
    return aiThinking ? "AI Thinking..." : "AI's Turn";
  };

  const getStatusColor = () => {
    if (inCheck.white) return "#EF4444";
    if (inCheck.black) return "#10B981";
    return "#E0E7FF";
  };

  const promotionPieces = [
    { piece: "Q", name: "Queen", symbol: "♕" },
    { piece: "R", name: "Rook", symbol: "♖" },
    { piece: "B", name: "Bishop", symbol: "♗" },
    { piece: "N", name: "Knight", symbol: "♘" },
  ];

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
            Chess
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

        {/* PERSISTENT SCORE DISPLAY - Shows real win/loss record! */}
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
              <Text
                style={{ fontSize: 12, fontWeight: "600", color: "#06D6A0" }}
              >
                You {isLoadingStats ? "..." : persistentScore.player}
              </Text>

              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "600",
                  color: getStatusColor(),
                  textAlign: "center",
                }}
              >
                {getStatusText()}
              </Text>

              <Text
                style={{ fontSize: 12, fontWeight: "600", color: "#F72585" }}
              >
                AI {isLoadingStats ? "..." : persistentScore.ai}
              </Text>
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
                  TIME
                </Text>
                <Text
                  style={{ fontSize: 12, fontWeight: "600", color: "#E0E7FF" }}
                >
                  {formatTime(timer)}
                </Text>
              </View>

              <View style={{ alignItems: "center" }}>
                <Text
                  style={{ fontSize: 10, fontWeight: "600", color: "#94A3B8" }}
                >
                  TURN
                </Text>
                <Text
                  style={{ fontSize: 12, fontWeight: "600", color: "#A855F7" }}
                >
                  {currentPlayer === "white" ? "You ♔" : "AI ♚"}
                </Text>
              </View>

              <View style={{ alignItems: "center" }}>
                <Text
                  style={{ fontSize: 10, fontWeight: "600", color: "#94A3B8" }}
                >
                  GAMES
                </Text>
                <Text
                  style={{ fontSize: 12, fontWeight: "600", color: "#06D6A0" }}
                >
                  {isLoadingStats ? "..." : stats?.total_plays || 0}
                </Text>
              </View>
            </View>
          </BlurView>
        </View>
      </View>

      {/* Chess Board */}
      <View
        style={{
          flex: 1,
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 20,
          justifyContent: "center",
        }}
      >
        <View
          style={{ borderRadius: 24, overflow: "hidden", marginBottom: 16 }}
        >
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
            <ChessBoard
              board={board}
              availableMoves={availableMoves}
              onSquarePress={handleSquarePress}
              getSquareColor={getSquareColor}
            />
          </BlurView>
        </View>

        <Text
          style={{
            fontSize: 14,
            color: "#94A3B8",
            textAlign: "center",
            marginTop: 8,
          }}
        >
          {currentPlayer === "white"
            ? "Select a piece to see legal moves"
            : aiThinking
              ? "AI is calculating the perfect move..."
              : "AI will move shortly..."}
        </Text>
      </View>

      {/* Glassmorphic Promotion Modal */}
      {promotionData && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 1000,
          }}
        >
          <View style={{ borderRadius: 24, overflow: "hidden", margin: 20 }}>
            <BlurView
              intensity={80}
              tint="dark"
              style={{
                backgroundColor: "rgba(139, 92, 246, 0.2)",
                borderWidth: 2,
                borderColor: "rgba(224, 231, 255, 0.3)",
                borderRadius: 24,
                padding: 32,
                alignItems: "center",
                shadowColor: "#8B5CF6",
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.3,
                shadowRadius: 20,
                elevation: 12,
              }}
            >
              <Text
                style={{
                  fontSize: 24,
                  fontWeight: "bold",
                  color: "#E0E7FF",
                  textAlign: "center",
                  marginBottom: 8,
                  textShadowColor: "#8B5CF6",
                  textShadowRadius: 10,
                }}
              >
                Pawn Promotion! 👑
              </Text>

              <Text
                style={{
                  fontSize: 16,
                  color: "#94A3B8",
                  textAlign: "center",
                  marginBottom: 24,
                }}
              >
                Choose what to promote your pawn to:
              </Text>

              <View
                style={{
                  flexDirection: "row",
                  gap: 16,
                  justifyContent: "center",
                }}
              >
                {promotionPieces.map(({ piece, name, symbol }) => (
                  <TouchableOpacity
                    key={piece}
                    onPress={async () => {
                      await Haptics.impactAsync(
                        Haptics.ImpactFeedbackStyle.Medium,
                      );
                      handlePromotionChoice(piece);
                    }}
                    style={{
                      alignItems: "center",
                      padding: 16,
                      borderRadius: 16,
                      backgroundColor: "rgba(168, 85, 247, 0.2)",
                      borderWidth: 2,
                      borderColor: "rgba(168, 85, 247, 0.4)",
                      minWidth: 80,
                    }}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={{
                        fontSize: 36,
                        marginBottom: 8,
                        color: "#E0E7FF",
                        textShadowColor: "#A855F7",
                        textShadowRadius: 4,
                      }}
                    >
                      {symbol}
                    </Text>
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "600",
                        color: "#E0E7FF",
                        textAlign: "center",
                      }}
                    >
                      {name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </BlurView>
          </View>
        </View>
      )}
    </View>
  );
}
