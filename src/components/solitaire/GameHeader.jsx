// src/components/solitaire/GameHeader.jsx
import React, { useRef } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { router } from "expo-router";
import { ArrowLeft, RotateCcw, Undo, Trophy } from "lucide-react-native";
import { useTheme } from "../../utils/theme";

export const GameHeader = ({ onReset, onUndo, canUndo, onBack, onTrophyPress }) => {
  const { colors } = useTheme();
  const backInFlight = useRef(false);

  const handleBackPress = async () => {
    if (backInFlight.current) return;
    backInFlight.current = true;
    try {
      if (typeof onBack === "function") {
        await onBack(); // ensure session ends before leaving
      }
    } catch {
      // ignore and still navigate back
    } finally {
      try { router.back(); } catch {}
      backInFlight.current = false;
    }
  };

  const pillStyle = {
    padding: 8,
    borderRadius: 12,
    backgroundColor: colors.glassSecondary,
  };

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 16,
      }}
    >
      {/* Back */}
      <TouchableOpacity onPress={handleBackPress} style={pillStyle}>
        <ArrowLeft size={24} color={colors.text} />
      </TouchableOpacity>

      {/* Title */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Text style={{ fontSize: 20, fontWeight: "bold", color: colors.text }}>
          Solitaire
        </Text>
      </View>

      {/* Actions: Trophy · Undo · Reset */}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <TouchableOpacity
          onPress={onTrophyPress}
          style={pillStyle}
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          accessibilityRole="button"
          accessibilityLabel="View achievements"
        >
          <Trophy size={22} color={colors.text} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onUndo}
          disabled={!canUndo}
          style={{
            ...pillStyle,
            backgroundColor: canUndo ? colors.glassSecondary : colors.glassTertiary,
            opacity: canUndo ? 1 : 0.5,
          }}
          accessibilityRole="button"
          accessibilityLabel="Undo last move"
        >
          <Undo size={24} color={colors.text} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onReset}
          style={pillStyle}
          accessibilityRole="button"
          accessibilityLabel="Restart game"
        >
          <RotateCcw size={24} color={colors.text} />
        </TouchableOpacity>
      </View>
    </View>
  );
};
