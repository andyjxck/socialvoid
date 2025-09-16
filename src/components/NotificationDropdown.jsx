import React, { useState, useEffect } from "react";
import { View, Text, Animated, TouchableOpacity } from "react-native";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../utils/theme";
import { Trophy, Users, Star, Crown, X, Gamepad2 } from "lucide-react-native";
import * as Haptics from "expo-haptics";

export default function NotificationDropdown({ notifications = [], playerId }) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const [visible, setVisible] = useState(false);
  const [currentNotification, setCurrentNotification] = useState(null);
  const slideAnim = useState(new Animated.Value(-100))[0];
  const opacityAnim = useState(new Animated.Value(0))[0];

  // Show new notifications
  useEffect(() => {
    if (notifications.length > 0 && !visible) {
      const latest = notifications[0];
      setCurrentNotification(latest);
      showNotification();
    }
  }, [notifications, visible]);

  const showNotification = () => {
    setVisible(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: false,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: false,
      }),
    ]).start();

    // Auto-hide after 5 seconds for game invitations, 4 seconds for others
    const hideDelay =
      currentNotification?.notification_type === "game_invitation"
        ? 5000
        : 4000;
    setTimeout(hideNotification, hideDelay);
  };

  const hideNotification = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -100,
        duration: 300,
        useNativeDriver: false,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: false,
      }),
    ]).start(() => {
      setVisible(false);
      setCurrentNotification(null);
      markAsRead();
    });
  };

  const markAsRead = async () => {
    if (!currentNotification || !playerId) return;

    try {
      await fetch(`/api/notifications/${currentNotification.id}/read`, {
        method: "PATCH",
      });
    } catch (error) {
      console.error("Failed to mark notification as read:", error);
    }
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case "achievement":
        return Trophy;
      case "level_up":
        return Crown;
      case "friend_request":
        return Users;
      case "game_invitation":
      case "game_session_started":
        return Gamepad2;
      default:
        return Star;
    }
  };

  const getNotificationColor = (type) => {
    switch (type) {
      case "achievement":
        return colors.gameAccent3;
      case "level_up":
        return colors.gameAccent1;
      case "friend_request":
        return colors.gameAccent2;
      case "game_invitation":
      case "game_session_started":
        return colors.gameAccent1;
      default:
        return colors.gameAccent1;
    }
  };

  if (!visible || !currentNotification) {
    return null;
  }

  const IconComponent = getNotificationIcon(
    currentNotification.notification_type,
  );
  const iconColor = getNotificationColor(currentNotification.notification_type);

  return (
    <Animated.View
      style={{
        position: "absolute",
        top: insets.top + 80,
        left: 16,
        right: 16,
        transform: [{ translateY: slideAnim }],
        opacity: opacityAnim,
        zIndex: 1000,
      }}
    >
      <BlurView
        intensity={isDark ? 80 : 60}
        tint={isDark ? "dark" : "light"}
        style={{
          borderRadius: 16,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <View
          style={{
            backgroundColor: isDark
              ? "rgba(31, 41, 55, 0.9)"
              : "rgba(255, 255, 255, 0.9)",
            padding: 16,
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          {/* Icon */}
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: iconColor + "20",
              justifyContent: "center",
              alignItems: "center",
              marginRight: 12,
            }}
          >
            <IconComponent size={20} color={iconColor} />
          </View>

          {/* Content */}
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 14,
                fontWeight: "600",
                color: colors.text,
                fontFamily: "Inter_600SemiBold",
              }}
            >
              {currentNotification.title}
            </Text>
            {currentNotification.message && (
              <Text
                style={{
                  fontSize: 12,
                  color: colors.textSecondary,
                  marginTop: 2,
                  fontFamily: "Inter_400Regular",
                }}
              >
                {currentNotification.message}
              </Text>
            )}
            {currentNotification.notification_type === "game_invitation" && (
              <Text
                style={{
                  fontSize: 10,
                  color: colors.gameAccent1,
                  marginTop: 4,
                  fontFamily: "Inter_400Regular",
                }}
              >
                Check your profile to respond
              </Text>
            )}
          </View>

          {/* Close Button */}
          <TouchableOpacity
            onPress={hideNotification}
            style={{
              padding: 4,
              borderRadius: 12,
              backgroundColor: colors.glassSecondary,
            }}
          >
            <X size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Progress bar for auto-hide */}
        <Animated.View
          style={{
            height: 2,
            backgroundColor: iconColor,
            width: "100%",
          }}
        />
      </BlurView>
    </Animated.View>
  );
}
