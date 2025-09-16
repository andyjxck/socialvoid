import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useTheme } from "../../utils/theme";

const WordWheel = ({ wheel, onLetterPress }) => {
  const { colors } = useTheme();

  return (
    <View
      style={{
        alignItems: "center",
        marginBottom: 30,
        backgroundColor: "rgba(138, 43, 226, 0.1)",
        borderRadius: 120,
        padding: 20,
      }}
    >
      <View
        style={{
          width: 200,
          height: 200,
          position: "relative",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Center Letter */}
        <TouchableOpacity
          onPress={() => onLetterPress(wheel.center)}
          style={{
            width: 70,
            height: 70,
            borderRadius: 35,
            backgroundColor: colors.primary,
            alignItems: "center",
            justifyContent: "center",
            position: "absolute",
            zIndex: 10,
            shadowColor: colors.primary,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 8,
          }}
        >
          <Text
            style={{
              fontSize: 28,
              fontWeight: "bold",
              color: "white",
              fontFamily: "Nunito-Bold",
            }}
          >
            {wheel.center}
          </Text>
        </TouchableOpacity>

        {/* Outer Letters */}
        {wheel.outer?.map((letter, index) => {
          const angle = (index * 360) / wheel.outer.length;
          const radian = (angle * Math.PI) / 180;
          const x = Math.cos(radian) * 70;
          const y = Math.sin(radian) * 70;

          return (
            <TouchableOpacity
              key={index}
              onPress={() => onLetterPress(letter)}
              style={{
                width: 55,
                height: 55,
                borderRadius: 27.5,
                backgroundColor: colors.glassSecondary,
                borderWidth: 2,
                borderColor: colors.primary,
                alignItems: "center",
                justifyContent: "center",
                position: "absolute",
                left: 100 + x - 27.5,
                top: 100 + y - 27.5,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.1,
                shadowRadius: 4,
                elevation: 4,
              }}
            >
              <Text
                style={{
                  fontSize: 22,
                  fontWeight: "bold",
                  color: colors.text,
                  fontFamily: "Nunito-Bold",
                }}
              >
                {letter}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

export default WordWheel;
