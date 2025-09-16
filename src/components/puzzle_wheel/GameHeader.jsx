import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { ArrowLeft, RotateCcw, HelpCircle, Clock } from "lucide-react-native";
import { useTheme } from "../../utils/theme";
import { router } from "expo-router";

const GameHeader = ({
  score,
  timeLeft,
  onShowHelp,
  onRestart,
  formatTime,
}) => {
  const { colors } = useTheme();

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        padding: 16,
        backgroundColor: colors.glassSecondary,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      <TouchableOpacity onPress={() => router.back()}>
        <ArrowLeft size={24} color={colors.text} />
      </TouchableOpacity>

      <View style={{ alignItems: "center" }}>
        <Text
          style={{
            fontSize: 20,
            fontWeight: "bold",
            color: colors.text,
            fontFamily: "Nunito-Bold",
          }}
        >
          Word Wheel
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Clock
            size={16}
            color={timeLeft <= 10 ? "#FF4444" : colors.textSecondary}
          />
          <Text
            style={{
              fontSize: 16,
              fontWeight: "bold",
              color: timeLeft <= 10 ? "#FF4444" : colors.textSecondary,
              fontFamily: "Nunito-SemiBold",
            }}
          >
            {formatTime(timeLeft)}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
        <Text
          style={{
            fontSize: 18,
            fontWeight: "bold",
            color: colors.primary,
            fontFamily: "Nunito-Bold",
          }}
        >
          {score}
        </Text>
        <TouchableOpacity onPress={onShowHelp}>
          <HelpCircle size={24} color={colors.text} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onRestart}>
          <RotateCcw size={24} color={colors.text} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default GameHeader;
