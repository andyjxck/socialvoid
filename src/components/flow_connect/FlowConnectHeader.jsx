import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { BlurView } from "expo-blur";
import { ArrowLeft, RotateCcw, Undo } from "lucide-react-native";
import { useTheme } from "../../utils/theme";

export default function FlowConnectHeader({
  insets,
  level,
  moves,
  onUndo,
  onReset,
  undoDisabled,
  onBack,
}) {
  const { colors, isDark } = useTheme();

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
          onPress={onBack}
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
          Flow Connect
        </Text>

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

      <View style={{ borderRadius: 16, overflow: "hidden" }}>
        <BlurView
          intensity={isDark ? 60 : 80}
          tint={isDark ? "dark" : "light"}
          style={{
            backgroundColor: isDark
              ? "rgba(31, 41, 55, 0.7)"
              : "rgba(255, 255, 255, 0.7)",
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 16,
            padding: 16,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-around",
              alignItems: "center",
            }}
          >
            <View style={{ alignItems: "center" }}>
              <Text
                style={{
                  fontFamily: "Inter_500Medium",
                  fontSize: 12,
                  color: colors.textSecondary,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  marginBottom: 4,
                }}
              >
                Level
              </Text>
              <Text
                style={{
                  fontFamily: "Inter_700Bold",
                  fontSize: 18,
                  color: colors.gameAccent7,
                }}
              >
                {level}
              </Text>
            </View>

            <View style={{ alignItems: "center" }}>
              <Text
                style={{
                  fontFamily: "Inter_500Medium",
                  fontSize: 12,
                  color: colors.textSecondary,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  marginBottom: 4,
                }}
              >
                Moves
              </Text>
              <Text
                style={{
                  fontFamily: "Inter_700Bold",
                  fontSize: 18,
                  color: colors.gameAccent7,
                }}
              >
                {moves}
              </Text>
            </View>

            <TouchableOpacity
              onPress={onUndo}
              disabled={undoDisabled}
              style={{
                padding: 8,
                borderRadius: 8,
                backgroundColor: !undoDisabled
                  ? colors.gameAccent7
                  : colors.glassSecondary,
                opacity: !undoDisabled ? 1 : 0.5,
              }}
            >
              <Undo size={20} color={colors.text} />
            </TouchableOpacity>
          </View>
        </BlurView>
      </View>
    </View>
  );
}