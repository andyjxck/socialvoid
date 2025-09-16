import React from "react";
import { View, Text, TouchableOpacity, Animated } from "react-native";
import { useTheme } from "../../utils/theme";

const CurrentWordDisplay = ({
  currentWord,
  onClear,
  onSubmit,
  shakeAnimation,
}) => {
  const { colors } = useTheme();
  return (
    <Animated.View
      style={{
        backgroundColor: colors.glassSecondary,
        borderRadius: 12,
        padding: 16,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: colors.border,
        transform: [{ translateX: shakeAnimation }],
      }}
    >
      <Text
        style={{
          fontSize: 18,
          color: colors.textSecondary,
          textAlign: "center",
          marginBottom: 8,
          fontFamily: "Nunito-Medium",
        }}
      >
        Current Word
      </Text>
      <Text
        style={{
          fontSize: 24,
          fontWeight: "bold",
          color: colors.text,
          textAlign: "center",
          minHeight: 30,
          fontFamily: "Nunito-Bold",
        }}
      >
        {currentWord || "..."}
      </Text>

      <View
        style={{
          flexDirection: "row",
          justifyContent: "center",
          gap: 12,
          marginTop: 16,
        }}
      >
        <TouchableOpacity
          onPress={onClear}
          style={{
            backgroundColor: colors.surfaceSecondary,
            borderRadius: 8,
            paddingHorizontal: 20,
            paddingVertical: 10,
          }}
        >
          <Text
            style={{
              fontSize: 16,
              fontWeight: "bold",
              color: colors.text,
              fontFamily: "Nunito-Bold",
            }}
          >
            Clear
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onSubmit}
          disabled={currentWord.length < 3}
          style={{
            backgroundColor:
              currentWord.length >= 3
                ? colors.primary
                : colors.surfaceSecondary,
            borderRadius: 8,
            paddingHorizontal: 20,
            paddingVertical: 10,
          }}
        >
          <Text
            style={{
              fontSize: 16,
              fontWeight: "bold",
              color:
                currentWord.length >= 3 ? "white" : colors.textSecondary,
              fontFamily: "Nunito-Bold",
            }}
          >
            Submit
          </Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};
export default CurrentWordDisplay;
