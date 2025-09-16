import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../utils/theme";

const ControlButton = ({ onPress, label }) => {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: colors.gameCard2,
        justifyContent: "center",
        alignItems: "center",
        borderWidth: 1.5,
        borderColor: colors.gameAccent2,
        opacity: 0.8,
      }}
    >
      <Text
        style={{
          fontFamily: "Inter_700Bold",
          fontSize: 14,
          color: colors.text,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
};

export default function GameControls({ onMove, onRotate }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-around",
        alignItems: "center",
        paddingHorizontal: 20,
        paddingBottom: insets.bottom + 80, // Moved controls down significantly
      }}
    >
      <ControlButton onPress={() => onMove("left")} label="←" />
      <ControlButton onPress={onRotate} label="↻" />
      <ControlButton onPress={() => onMove("down")} label="↓" />
      <ControlButton onPress={() => onMove("right")} label="→" />
    </View>
  );
}
