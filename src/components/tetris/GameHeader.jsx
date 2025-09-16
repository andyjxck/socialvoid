import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ArrowLeft, RotateCcw } from "lucide-react-native";
import { useTheme } from "../../utils/theme";

export default function GameHeader({ onRestart }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  return (
    <View
      style={{
        paddingTop: insets.top + 16,
        paddingHorizontal: 20,
        marginBottom: 20,
      }}
    >
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

        <Text
          style={{
            fontFamily: "Inter_700Bold",
            fontSize: 20,
            color: colors.text,
          }}
        >
          Tetris
        </Text>

        <TouchableOpacity
          onPress={onRestart}
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
}
