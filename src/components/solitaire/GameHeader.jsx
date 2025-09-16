import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { router } from "expo-router";
import { ArrowLeft, RotateCcw, Undo } from "lucide-react-native";
import { useTheme } from "../../utils/theme";

export const GameHeader = ({ onReset, onUndo, canUndo }) => {
  const { colors } = useTheme();

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 16,
      }}
    >
      <TouchableOpacity
        onPress={() => router.back()}
        style={{
          padding: 8,
          borderRadius: 12,
          backgroundColor: colors.glassSecondary,
        }}
      >
        <ArrowLeft size={24} color={colors.text} />
      </TouchableOpacity>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Text
          style={{
            fontSize: 20,
            fontWeight: "bold",
            color: colors.text,
          }}
        >
          Solitaire
        </Text>
      </View>

      <View style={{ flexDirection: "row", gap: 8 }}>
        <TouchableOpacity
          onPress={onUndo}
          disabled={!canUndo}
          style={{
            padding: 8,
            borderRadius: 12,
            backgroundColor: canUndo
              ? colors.glassSecondary
              : colors.glassTertiary,
            opacity: canUndo ? 1 : 0.5,
          }}
        >
          <Undo size={24} color={colors.text} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onReset}
          style={{
            padding: 8,
            borderRadius: 12,
            backgroundColor: colors.glassSecondary,
          }}
        >
          <RotateCcw size={24} color={colors.text} />
        </TouchableOpacity>
      </View>
    </View>
  );
};
