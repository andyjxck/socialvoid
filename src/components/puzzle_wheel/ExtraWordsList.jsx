import React from "react";
import { View, Text, ScrollView } from "react-native";
import { useTheme } from "../../utils/theme";

const ExtraWordsList = ({ foundWords }) => {
  const { colors } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.glassSecondary,
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: colors.border,
        maxHeight: 200,
      }}
    >
      <Text
        style={{
          fontSize: 18,
          fontWeight: "bold",
          color: colors.text,
          marginBottom: 12,
          fontFamily: "Nunito-Bold",
        }}
      >
        Found Words ({foundWords.length})
      </Text>

      {foundWords.length === 0 ? (
        <Text
          style={{
            fontSize: 14,
            color: colors.textSecondary,
            textAlign: "center",
            fontStyle: "italic",
            fontFamily: "Nunito-Regular",
          }}
        >
          No words found yet
        </Text>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            {foundWords.map((item, index) => (
              <View
                key={index}
                style={{
                  backgroundColor: colors.primary + "20",
                  borderRadius: 6,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    color: colors.text,
                    fontWeight: "500",
                    fontFamily: "Nunito-Medium",
                  }}
                >
                  {item.word}
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    color: colors.primary,
                    fontWeight: "bold",
                    fontFamily: "Nunito-Bold",
                  }}
                >
                  +{item.points}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
};
export default ExtraWordsList;
