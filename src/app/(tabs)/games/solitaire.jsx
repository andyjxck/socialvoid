import React, { useState, useEffect, useRef, useCallback } from "react";
import { View, ScrollView, Text, PanResponder, Modal, TouchableOpacity, ScrollView as RNScrollView } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useIsFocused } from "@react-navigation/native";
import { Trophy } from "lucide-react-native";
import { BlurView } from "expo-blur";

import { useTheme } from "../../../utils/theme";
import gameTracker from "../../../utils/gameTracking";
import { getGameId, GAME_TYPES } from "../../../utils/gameUtils";
import NightSkyBackground from "../../../components/NightSkyBackground";
import AchievementsSection from "../../../components/AchievementsSection";

import { useSolitaireGame } from "../../../hooks/useSolitaireGame";
import { GameHeader } from "../../../components/solitaire/GameHeader";
import { GameStats } from "../../../components/solitaire/GameStats";
import { TopSection } from "../../../components/solitaire/TopSection";
import { Tableau } from "../../../components/solitaire/Tableau";
import { Instructions } from "../../../components/solitaire/Instructions";
import { Card } from "../../../components/solitaire/Card"; // for drag overlay

export default function SolitaireGame() {
  const insets = useSafeAreaInsets();
  const { isDark, colors } = useTheme();
  const isFocused = useIsFocused();

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

  // Achievements UI
  const [showAchievements, setShowAchievements] = useState(false);

  // drag & drop
  const [dragging, setDragging] = useState(null); // { cards, source, cardIndex, x, y }
  const [dropZones, setDropZones] = useState({ tableau: {}, foundation: {}, waste: {} });
  const registerDropZone = useCallback((type, index, layout) => {
    setDropZones((prev) => ({ ...prev, [type]: { ...prev[type], [index]: layout } }));
  }, []);
  const beginDrag = useCallback((card, source, cardIndex) => {
    if (!card?.faceUp) return;
    // Note: for stacks, we rely on the hook to compute final move; here we just show a ghost with the one card.
    setDragging({ cards: [card], source, cardIndex, x: 0, y: 0 });
  }, []);
  const hitTest = (x, y) => {
    const check = (map, type) => {
      for (const [k, r] of Object.entries(map)) {
        const { x: rx, y: ry, width, height } = r;
        if (x >= rx && x <= rx + width && y >= ry && y <= ry + height) return { type, index: Number(k) };
      }
      return null;
    };
    return check(dropZones.foundation, "foundation") || check(dropZones.tableau, "tableau") || null;
  };
  const handleDrop = (payload) => {
    const target = hitTest(payload.x, payload.y);
    if (!target) {
      setDragging(null);
      return;
    }
    if (target.type === "foundation") {
      handleEmptySpacePress(game.foundations[target.index], "foundation");
    } else if (target.type === "tableau") {
      handleEmptySpacePress(game.tableau[target.index], "tableau");
    }
    setDragging(null);
  };
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !!dragging,
      onPanResponderMove: (_, g) => dragging && setDragging((d) => ({ ...d, x: g.moveX, y: g.moveY })),
      onPanResponderRelease: (_, g) => dragging && handleDrop({ ...dragging, x: g.moveX, y: g.moveY }),
      onPanResponderTerminate: () => setDragging(null),
    })
  ).current;

  // run/session control
  const gameStartedRef = useRef(false);
  const currentGameIdRef = useRef(null);
  const submittedRef = useRef(false);

  const [bestLocalScore, setBestLocalScore] = useState(0);
  const bestLocalRef = useRef(0);
  useEffect(() => {
    bestLocalRef.current = bestLocalScore;
  }, [bestLocalScore]);

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem("solitaire_scores");
        if (saved) {
          const { best = 0 } = JSON.parse(saved);
          setBestLocalScore(best);
        }
      } catch {}
    })();
  }, []);
  const saveBestLocal = async (best) => {
    try {
      await AsyncStorage.setItem("solitaire_scores", JSON.stringify({ best }));
    } catch {}
  };

  const scoreRef = useRef(0);
  useEffect(() => {
    scoreRef.current = game?.score || 0;
  }, [game.score]);

  const handleCardDoublePress = (card, source, cardIndex) => {
    tryAutoPlaceInSafeZone(card, source, cardIndex);
  };

  // load player id
  useEffect(() => {
    (async () => {
      try {
        const savedPlayerId = await AsyncStorage.getItem("puzzle_hub_player_id");
        setCurrentPlayerId(savedPlayerId ? parseInt(savedPlayerId, 10) : 1);
      } catch {
        setCurrentPlayerId(1);
      }
    })();
  }, []);

  // resolve numeric game id
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!currentPlayerId) return;
      try {
        const id = await getGameId(GAME_TYPES.SOLITAIRE);
        if (alive) setGameId(id);
      } catch {}
    })();
    return () => {
      alive = false;
    };
  }, [currentPlayerId]);

  const endRunOnce = useCallback(
    async (finalScore, reason) => {
      if (!gameId || !currentGameIdRef.current || submittedRef.current) return;
      submittedRef.current = true;
      try {
        const meta = { result: reason === "win" ? "win" : "play", reason };
        if (finalScore > bestLocalRef.current) meta.high_score = finalScore;
        await gameTracker.endGame(currentGameIdRef.current, finalScore, meta);
        if (finalScore > bestLocalRef.current) {
          setBestLocalScore(finalScore);
          saveBestLocal(finalScore);
        }
      } catch {}
      gameStartedRef.current = false;
      currentGameIdRef.current = null;
    },
    [gameId]
  );

  const startFreshRun = useCallback(() => {
    if (gameStartedRef.current) return;
    submittedRef.current = false;
    resetGame();
    gameStartedRef.current = true;
    currentGameIdRef.current = gameId;
    (async () => {
      try {
        await gameTracker.startGame(gameId, currentPlayerId);
      } catch {}
    })();
  }, [resetGame, gameId, currentPlayerId]);

  // Focus/Blur lifecycle
  useEffect(() => {
    if (!gameId || !currentPlayerId) return;
    if (isFocused) {
      startFreshRun();
    } else {
      endRunOnce(scoreRef.current, "blur");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused, gameId, currentPlayerId]);

  // Unmount safety
  useEffect(() => {
    return () => {
      endRunOnce(scoreRef.current, "unmount");
    };
  }, [endRunOnce]);

  // Win watcher
  useEffect(() => {
    const isGameWon = game.foundations.every((f) => f.length === 13);
    if (isGameWon && gameStartedRef.current && currentGameIdRef.current) {
      endRunOnce(Math.max(100, game.score), "win");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.foundations, game.score]);

  const handleReset = useCallback(async () => {
    await endRunOnce(scoreRef.current, "reset");
    gameStartedRef.current = false;
    startFreshRun();
  }, [endRunOnce, startFreshRun]);

  const handleBack = useCallback(async () => {
    await endRunOnce(scoreRef.current, "back");
  }, [endRunOnce]);

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <NightSkyBackground />

      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, marginBottom: 10 }}>
        <GameHeader
  onReset={handleReset}
  onUndo={undoLastMove}
  canUndo={canUndo}
  onBack={handleBack}
  onTrophyPress={() => setShowAchievements(true)} // or whatever opens your modal
/>

        <GameStats score={game.score} moves={game.moves} stockCount={game.stock.length} stockCycles={stockCycles} />


        <Text style={{ marginTop: 6, textAlign: "center", color: colors.primary, fontWeight: "600" }}>
          Tip: Double-tap a top card to send it to the Safe Zone. Long-press to drag & drop.
        </Text>
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
          registerDropZone={registerDropZone}
          beginDrag={beginDrag}
        />
        <Tableau
          tableau={game.tableau}
          onCardPress={handleCardPress}
          onEmptySpacePress={handleEmptySpacePress}
          onCardDoublePress={handleCardDoublePress}
          isSelected={isSelected}
          registerDropZone={registerDropZone}
          beginDrag={beginDrag}
        />
        <Instructions />
      </ScrollView>

      {/* Drag overlay */}
      {dragging && (
        <View
          {...panResponder.panHandlers}
          pointerEvents="box-none"
          style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }}
        >
          <View
            style={{
              position: "absolute",
              transform: [{ translateX: (dragging.x || 0) - 40 }, { translateY: (dragging.y || 0) - 60 }],
            }}
            pointerEvents="none"
          >
            {dragging.cards.map((c, idx) => (
              <View key={c.id} style={{ marginTop: idx === 0 ? 0 : -18, zIndex: idx }}>
                <Card card={c} isSelected />
              </View>
            ))}
          </View>
        </View>
      )}

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
              backgroundColor: isDark ? "rgba(31, 41, 55, 0.9)" : "rgba(255, 255, 255, 0.9)",
              padding: 20,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: "bold", textAlign: "center" }}>
              Auto-completing game...
            </Text>
          </View>
        </View>
      )}

      {/* Achievements Modal */}
      <Modal
        visible={showAchievements}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAchievements(false)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", paddingHorizontal: 16 }}>
          <View
            style={{
              borderRadius: 16,
              overflow: "hidden",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.15)",
              backgroundColor: isDark ? "rgba(0,0,0,0.9)" : "rgba(255,255,255,0.95)",
              maxHeight: "80%",
            }}
          >
            <View
              style={{
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderBottomColor: "rgba(255,255,255,0.12)",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Text style={{ fontWeight: "700", fontSize: 16, color: colors.text }}>
                Solitaire Achievements
              </Text>
              <TouchableOpacity onPress={() => setShowAchievements(false)} hitSlop={10}>
                <Text style={{ fontWeight: "600", fontSize: 14, color: colors.textSecondary }}>
                  Close
                </Text>
              </TouchableOpacity>
            </View>

            <RNScrollView contentContainerStyle={{ padding: 12 }}>
              {currentPlayerId != null && gameId != null ? (
                <AchievementsSection
                  key={`${gameId}-${currentPlayerId}`}
                  playerId={currentPlayerId}
                  gameId={gameId}
                  autoRefreshMs={15000}
                  showSearchBar
                  showFilters
                />
              ) : (
                <View style={{ padding: 16 }}>
                  <Text style={{ color: colors.textSecondary, textAlign: "center", fontWeight: "500" }}>
                    Loading achievements…
                  </Text>
                </View>
              )}
            </RNScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
