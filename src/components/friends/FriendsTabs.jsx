import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { useTheme } from "../../utils/theme";
import { Users, Clock, Search } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import {
  useFonts,
  Inter_500Medium,
  Inter_600SemiBold,
} from "@expo-google-fonts/inter";

export default function FriendsTabs({ activeTab, setActiveTab, friendsCount, requestsCount }) {
  const { colors } = useTheme();
  const [fontsLoaded] = useFonts({
    Inter_500Medium,
    Inter_600SemiBold,
  });

  const tabs = [
    { id: "friends", label: `Friends (${friendsCount})`, icon: Users },
    { id: "requests", label: `Requests (${requestsCount})`, icon: Clock },
    { id: "search", label: "Find Friends", icon: Search },
  ];

  if (!fontsLoaded) {
    return null;
  }

  return (
    <View style={{ marginBottom: 16 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {tabs.map((tab) => {
            const IconComponent = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <TouchableOpacity
                key={tab.id}
                onPress={() => {
                  setActiveTab(tab.id);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  borderRadius: 20,
                  backgroundColor: isActive
                    ? colors.gameAccent1 + "20"
                    : colors.glassSecondary,
                  borderWidth: isActive ? 1 : 0,
                  borderColor: colors.gameAccent1,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <IconComponent
                  size={14}
                  color={isActive ? colors.gameAccent1 : colors.textSecondary}
                />
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: isActive ? "600" : "500",
                    color: isActive ? colors.gameAccent1 : colors.text,
                    fontFamily: isActive
                      ? "Inter_600SemiBold"
                      : "Inter_500Medium",
                  }}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
