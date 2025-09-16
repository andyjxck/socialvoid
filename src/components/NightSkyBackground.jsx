import React, { useEffect, useRef } from "react";
import { View, Animated, Dimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

const { width: screenWidth, height: screenHeight } = Dimensions.get("window");

export default function NightSkyBackground() {
  // Only very subtle moon glow animation - extremely slow
  const moonGlow = useRef(new Animated.Value(0.3)).current;

  // Create static stars with extremely rare twinkling
  const starAnimations = useRef(
    Array.from({ length: 25 }, () => ({
      opacity: new Animated.Value(0.7 + Math.random() * 0.3), // Static opacity between 0.7-1.0
    })),
  ).current;

  useEffect(() => {
    // Very subtle moon glow - extremely slow (40 seconds cycle)
    const pulseMoon = () => {
      Animated.sequence([
        Animated.timing(moonGlow, {
          toValue: 0.4,
          duration: 40000, // 40 seconds
          useNativeDriver: true,
        }),
        Animated.timing(moonGlow, {
          toValue: 0.3,
          duration: 40000, // 40 seconds
          useNativeDriver: true,
        }),
      ]).start(() => pulseMoon());
    };
    pulseMoon();

    // Extremely rare star twinkling - once every 2-3 minutes per star
    starAnimations.forEach((star, index) => {
      const twinkleStar = () => {
        const delay = 120000 + Math.random() * 60000; // 2-3 minutes between twinkles
        setTimeout(() => {
          const currentOpacity = 0.7 + Math.random() * 0.3;
          const targetOpacity = Math.max(
            0.5,
            Math.min(1, currentOpacity + (Math.random() - 0.5) * 0.2),
          );

          Animated.timing(star.opacity, {
            toValue: targetOpacity,
            duration: 4000, // 4 second gentle transition
            useNativeDriver: true,
          }).start(() => twinkleStar());
        }, delay);
      };
      // Start each star's twinkling cycle at a random time to spread them out
      setTimeout(twinkleStar, Math.random() * 180000); // Spread over 3 minutes
    });
  }, []);

  // Generate static star positions (reduced count for performance)
  const stars = Array.from({ length: 25 }, (_, index) => ({
    id: index,
    x: Math.random() * screenWidth,
    y: Math.random() * (screenHeight * 0.6), // Stars across 60% of screen
    size: 1.5 + Math.random() * 1.5,
  }));

  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: -10, // Far behind all UI elements
      }}
    >
      {/* Night sky gradient background */}
      <LinearGradient
        colors={[
          "#0A0F1C", // Deep night at top
          "#1E293B", // Slightly lighter
          "#334155", // Lighter at horizon
          "#0F172A", // Back to dark at bottom
        ]}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: -10,
        }}
      />

      {/* Static stars with minimal twinkling */}
      {stars.map((star, index) => (
        <Animated.View
          key={star.id}
          style={{
            position: "absolute",
            left: star.x,
            top: star.y,
            width: star.size * 2,
            height: star.size * 2,
            opacity:
              index < starAnimations.length
                ? starAnimations[index].opacity
                : 0.8,
            zIndex: -9,
          }}
        >
          <View
            style={{
              width: "100%",
              height: "100%",
              backgroundColor: "#E0E7FF",
              borderRadius: star.size,
              shadowColor: "#E0E7FF",
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.6,
              shadowRadius: 2,
              elevation: 1,
            }}
          />
        </Animated.View>
      ))}

      {/* Static Moon */}
      <View
        style={{
          position: "absolute",
          right: 30,
          top: 80,
          width: 50,
          height: 50,
          zIndex: -8,
        }}
      >
        {/* Subtle moon glow */}
        <Animated.View
          style={{
            position: "absolute",
            top: -10,
            left: -10,
            right: -10,
            bottom: -10,
            borderRadius: 35,
            backgroundColor: "rgba(248, 250, 252, 0.08)",
            opacity: moonGlow,
          }}
        />
        {/* Moon body */}
        <View
          style={{
            width: 50,
            height: 50,
            borderRadius: 25,
            backgroundColor: "#F8FAFC",
            shadowColor: "#E0E7FF",
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.6,
            shadowRadius: 15,
            elevation: 2,
          }}
        >
          {/* Moon craters - static */}
          <View
            style={{
              position: "absolute",
              top: 10,
              left: 12,
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: "#E2E8F0",
            }}
          />
          <View
            style={{
              position: "absolute",
              bottom: 15,
              right: 10,
              width: 5,
              height: 5,
              borderRadius: 2.5,
              backgroundColor: "#E2E8F0",
            }}
          />
          <View
            style={{
              position: "absolute",
              top: 20,
              right: 15,
              width: 3,
              height: 3,
              borderRadius: 1.5,
              backgroundColor: "#E2E8F0",
            }}
          />
        </View>
      </View>
    </View>
  );
}
