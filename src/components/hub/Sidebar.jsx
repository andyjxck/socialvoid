import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Animated,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../utils/theme";
import { X, Trophy, Award, Users, Code } from "lucide-react-native";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import AchievementsSection from "../AchievementsSection";
import LeaderboardsSection from "../LeaderboardsSection";
import FriendsSection from "../FriendsSection";
import DevRoadmap from "../DevRoadmap";

const { width: screenWidth } = Dimensions.get("window");
const SIDEBAR_WIDTH = screenWidth * 0.75;

const TABS = [
  { id: "achievements", icon: Award },
  { id: "leaderboards", icon: Trophy },
  { id: "friends", icon: Users },
  { id: "roadmap", icon: Code },
];

export default function Sidebar({ visible, onClose, playerId }) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const [activeTab, setActiveTab] = useState("achievements");
  const slideAnim = useState(new Animated.Value(screenWidth))[0];

  useEffect(() => {
    if (visible) {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: false,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: screenWidth,
        duration: 300,
        useNativeDriver: false,
      }).start();
    }
  }, [visible, slideAnim]);

  const handleClose = () => {
    if (visible) {
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="none"
      onRequestClose={handleClose}
    >
      <View style={{ flex: 1, flexDirection: "row" }}>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)" }}
          onPress={handleClose}
          activeOpacity={1}
        />

        <Animated.View
          style={{
            width: SIDEBAR_WIDTH,
            height: "100%",
            transform: [{ translateX: slideAnim }],
          }}
        >
          <View
            style={{
              flex: 1,
              borderTopLeftRadius: 28,
              borderBottomLeftRadius: 28,
              overflow: "hidden",
              backgroundColor: isDark
                ? "rgba(139, 92, 246, 0.15)"
                : "rgba(139, 92, 246, 0.08)",
              borderWidth: 1,
              borderRightWidth: 0,
              borderColor: isDark
                ? "rgba(139, 92, 246, 0.3)"
                : "rgba(139, 92, 246, 0.2)",
            }}
          >
            <BlurView
              intensity={isDark ? 80 : 100}
              tint={isDark ? "dark" : "light"}
              style={{
                flex: 1,
                borderTopLeftRadius: 28,
                borderBottomLeftRadius: 28,
              }}
            >
              <View
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: isDark
                    ? "rgba(139, 92, 246, 0.05)"
                    : "rgba(255, 255, 255, 0.1)",
                  borderTopLeftRadius: 28,
                  borderBottomLeftRadius: 28,
                }}
              />

              {/* Header */}
              <View
                style={{
                  paddingTop: insets.top + 24,
                  paddingHorizontal: 24,
                  paddingBottom: 24,
                  borderBottomWidth: 1,
                  borderBottomColor: isDark
                    ? "rgba(139, 92, 246, 0.2)"
                    : "rgba(139, 92, 246, 0.15)",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  backgroundColor: isDark
                    ? "rgba(139, 92, 246, 0.08)"
                    : "rgba(255, 255, 255, 0.15)",
                }}
              >
                <View>
                  <Text
                    style={{
                      fontSize: 24,
                      fontWeight: "800",
                      color: colors.text,
                      fontFamily: "Inter_700Bold",
                      textTransform: "capitalize",
                      marginBottom: 4,
                    }}
                  >
                    {activeTab}
                  </Text>
                  <View
                    style={{
                      height: 3,
                      width: 40,
                      backgroundColor: colors.gameAccent1,
                      borderRadius: 2,
                      opacity: 0.8,
                    }}
                  />
                </View>
                <TouchableOpacity
                  onPress={handleClose}
                  style={{
                    padding: 12,
                    borderRadius: 16,
                    backgroundColor: isDark
                      ? "rgba(139, 92, 246, 0.15)"
                      : "rgba(139, 92, 246, 0.1)",
                    borderWidth: 1,
                    borderColor: isDark
                      ? "rgba(139, 92, 246, 0.3)"
                      : "rgba(139, 92, 246, 0.2)",
                  }}
                >
                  <X size={22} color={colors.gameAccent1} />
                </TouchableOpacity>
              </View>

              {/* Content */}
              <View style={{ flex: 1 }}>
                {activeTab === "achievements" && (
                  <AchievementsSection playerId={playerId} />
                )}
                {activeTab === "leaderboards" && (
                  <LeaderboardsSection playerId={playerId} />
                )}
                {activeTab === "friends" && (
                  <FriendsSection playerId={playerId} />
                )}
                {activeTab === "roadmap" && <DevRoadmap />}
              </View>

              {/* Tabs */}
              <View
                style={{
                  paddingHorizontal: 24,
                  paddingBottom: insets.bottom + 16,
                  paddingTop: 16,
                  borderTopWidth: 1,
                  borderTopColor: isDark
                    ? "rgba(139, 92, 246, 0.2)"
                    : "rgba(139, 92, 246, 0.15)",
                  backgroundColor: isDark
                    ? "rgba(139, 92, 246, 0.08)"
                    : "rgba(255, 255, 255, 0.15)",
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    backgroundColor: isDark
                      ? "rgba(17, 24, 39, 0.6)"
                      : "rgba(255, 255, 255, 0.7)",
                    borderRadius: 18,
                    padding: 4,
                    gap: 4,
                    borderWidth: 1,
                    borderColor: isDark
                      ? "rgba(139, 92, 246, 0.25)"
                      : "rgba(139, 92, 246, 0.2)",
                  }}
                >
                  {TABS.map((tab) => {
                    const IconComponent = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                      <TouchableOpacity
                        key={tab.id}
                        onPress={() => {
                          setActiveTab(tab.id);
                          Haptics.impactAsync(
                            Haptics.ImpactFeedbackStyle.Light,
                          );
                        }}
                        style={{
                          flex: 1,
                          alignItems: "center",
                          paddingVertical: 10,
                          paddingHorizontal: 8,
                          borderRadius: 14,
                          backgroundColor: isActive
                            ? colors.gameAccent1
                            : "transparent",
                        }}
                      >
                        <IconComponent
                          size={20}
                          color={isActive ? "#FFFFFF" : colors.textSecondary}
                        />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </BlurView>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
