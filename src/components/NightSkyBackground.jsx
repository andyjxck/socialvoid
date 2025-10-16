// components/NightSkyBackground.jsx
import React from "react";
import { View, Dimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

const { width: W, height: H } = Dimensions.get("window");

/**
 * STATIC, DETERMINISTIC, EXCITING NIGHT SKY
 * - No animations
 * - No randomness
 * - Same output on every render
 * - Big moon centered horizontally, placed at ~40% of screen height (i.e., "up 60%")
 *   Change MOON_Y_N to 0.6 if you prefer it lower; it's a single constant.
 */

// -------------------- Layout constants --------------------
const MOON_DIAMETER = Math.min(W * 0.42, 260); // responsive but capped
const MOON_X = W / 2;
const MOON_Y_N = 0.25; // 0.40 = 40% from top (i.e., up 60% vertically)
const MOON_Y = MOON_Y_N * H;

// Starfield: normalized coords (x, y, size, opacity)
const STARS = [
  [0.07, 0.10, 2.2, 0.95], [0.13, 0.06, 1.4, 0.75], [0.19, 0.14, 1.8, 0.82],
  [0.24, 0.05, 2.4, 0.90], [0.30, 0.12, 1.6, 0.76], [0.36, 0.08, 1.2, 0.64],
  [0.41, 0.15, 2.0, 0.86], [0.46, 0.03, 1.5, 0.72], [0.51, 0.11, 1.9, 0.80],
  [0.57, 0.07, 1.3, 0.68], [0.62, 0.04, 2.3, 0.90], [0.68, 0.13, 1.7, 0.78],
  [0.73, 0.06, 1.4, 0.70], [0.78, 0.09, 2.1, 0.88], [0.83, 0.05, 1.2, 0.62],
  [0.88, 0.12, 1.6, 0.74], [0.92, 0.08, 1.3, 0.66],

  [0.10, 0.22, 1.5, 0.72], [0.17, 0.25, 1.3, 0.68], [0.25, 0.21, 2.2, 0.90],
  [0.33, 0.27, 1.4, 0.70], [0.40, 0.23, 1.8, 0.80], [0.48, 0.26, 1.2, 0.62],
  [0.55, 0.24, 2.0, 0.86], [0.63, 0.22, 1.5, 0.74], [0.70, 0.29, 1.7, 0.78],
  [0.77, 0.26, 1.3, 0.66], [0.85, 0.21, 2.1, 0.88], [0.92, 0.28, 1.4, 0.70],

  [0.08, 0.36, 1.3, 0.64], [0.20, 0.39, 1.6, 0.72], [0.34, 0.37, 1.4, 0.68],
  [0.50, 0.41, 1.8, 0.78], [0.66, 0.38, 1.5, 0.74], [0.80, 0.36, 1.2, 0.62],
  [0.92, 0.40, 1.7, 0.80],
];

// Simple crater layout relative to the moon circle
const CRATERS = [
  // offsetX, offsetY, size
  [-MOON_DIAMETER * 0.18, -MOON_DIAMETER * 0.12, MOON_DIAMETER * 0.10],
  [ MOON_DIAMETER * 0.10, -MOON_DIAMETER * 0.20, MOON_DIAMETER * 0.06],
  [ MOON_DIAMETER * 0.22,  MOON_DIAMETER * 0.06, MOON_DIAMETER * 0.08],
  [-MOON_DIAMETER * 0.05,  MOON_DIAMETER * 0.18, MOON_DIAMETER * 0.05],
  [ MOON_DIAMETER * 0.00,  0,                        MOON_DIAMETER * 0.045],
];

/**
 * Tip: if you want to move the moon slightly, just tweak MOON_Y_N or MOON_DIAMETER.
 */
export default function NightSkyBackground() {
  return (
    <View
      pointerEvents="none"
      style={{ position: "absolute", inset: 0, zIndex: -10 }}
    >
      {/* Deep space gradient */}
      <LinearGradient
        colors={["#05070D", "#0A1122", "#101B33", "#0C1020"]}
        start={{ x: 0.5, y: 0.0 }}
        end={{ x: 0.5, y: 1.0 }}
        style={{ position: "absolute", inset: 0 }}
      />

      {/* Milky Way diagonal band (static) */}
      <LinearGradient
        colors={["rgba(160,190,255,0.10)", "rgba(160,190,255,0.06)", "transparent"]}
        start={{ x: -0.2, y: 0.0 }}
        end={{ x: 1.2, y: 1.0 }}
        style={{
          position: "absolute",
          inset: 0,
          transform: [{ rotateZ: "-20deg" }],
          opacity: 1,
        }}
      />

      {/* Vignette to pull focus to the center */}
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.25)"]}
        start={{ x: 0.5, y: 0.3 }}
        end={{ x: 0.5, y: 1.0 }}
        style={{ position: "absolute", inset: 0 }}
      />

      {/* Static Starfield (upper 60% of the screen) */}
      {STARS.map(([nx, ny, size, opacity], i) => (
        <View
          key={`star-${i}`}
          style={{
            position: "absolute",
            left: nx * W,
            top: ny * (H * 0.60),
            width: size * 2,
            height: size * 2,
            opacity,
          }}
        >
          <View
            style={{
              width: "100%",
              height: "100%",
              borderRadius: size,
              backgroundColor: "#EAF0FF",
              shadowColor: "#D6E2FF",
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.6,
              shadowRadius: 2,
              elevation: 1,
            }}
          />
        </View>
      ))}

      {/* Moon Glow (soft halo behind the moon) */}
      <View
        style={{
          position: "absolute",
          left: MOON_X - MOON_DIAMETER * 0.65,
          top: MOON_Y - MOON_DIAMETER * 0.65,
          width: MOON_DIAMETER * 1.30,
          height: MOON_DIAMETER * 1.30,
          borderRadius: (MOON_DIAMETER * 1.30) / 2,
          backgroundColor: "rgba(230, 236, 255, 0.12)",
          shadowColor: "#DDE7FF",
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.7,
          shadowRadius: 20,
        }}
      />

      {/* Moon Body */}
      <View
        style={{
          position: "absolute",
          left: MOON_X - MOON_DIAMETER / 2,
          top: MOON_Y - MOON_DIAMETER / 2,
          width: MOON_DIAMETER,
          height: MOON_DIAMETER,
          borderRadius: MOON_DIAMETER / 2,
          overflow: "hidden",
        }}
      >
        {/* Subtle limb shading */}
        <LinearGradient
          colors={["#F8FAFF", "#E9EEF8"]}
          start={{ x: 0.3, y: 0.2 }}
          end={{ x: 0.8, y: 0.9 }}
          style={{ position: "absolute", inset: 0 }}
        />
        {/* Inner vignette for depth */}
        <LinearGradient
          colors={["rgba(0,0,0,0.06)", "transparent", "rgba(0,0,0,0.10)"]}
          start={{ x: 0.0, y: 0.0 }}
          end={{ x: 1.0, y: 1.0 }}
          style={{ position: "absolute", inset: 0 }}
        />
        {/* Craters */}
        {CRATERS.map(([dx, dy, d], idx) => (
          <View
            key={`crater-${idx}`}
            style={{
              position: "absolute",
              left: MOON_DIAMETER / 2 + dx - d / 2,
              top: MOON_DIAMETER / 2 + dy - d / 2,
              width: d,
              height: d,
              borderRadius: d / 2,
              backgroundColor: "#D7DEEA",
            }}
          >
            {/* crater shadow highlight */}
            <LinearGradient
              colors={["rgba(0,0,0,0.10)", "rgba(0,0,0,0.02)"]}
              start={{ x: 0.2, y: 0.2 }}
              end={{ x: 0.9, y: 0.9 }}
              style={{ position: "absolute", inset: 0, borderRadius: d / 2 }}
            />
          </View>
        ))}
        {/* Subtle terminator line (suggests light direction) */}
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.14)"]}
          start={{ x: 0.2, y: 0.2 }}
          end={{ x: 1.0, y: 1.0 }}
          style={{ position: "absolute", inset: 0 }}
        />
      </View>

      {/* Cross flare for a little drama (under the moon, very subtle) */}
      <View
        style={{
          position: "absolute",
          left: MOON_X - MOON_DIAMETER * 0.6,
          top: MOON_Y - 1,
          width: MOON_DIAMETER * 1.2,
          height: 2,
          backgroundColor: "rgba(240,245,255,0.12)",
        }}
      />
      <View
        style={{
          position: "absolute",
          left: MOON_X - 1,
          top: MOON_Y - MOON_DIAMETER * 0.6,
          width: 2,
          height: MOON_DIAMETER * 1.2,
          backgroundColor: "rgba(240,245,255,0.10)",
        }}
      />

      {/* Gentle horizon haze */}
      <LinearGradient
        colors={["transparent", "rgba(160,180,220,0.10)", "transparent"]}
        start={{ x: 0, y: 0.58 }}
        end={{ x: 0, y: 0.82 }}
        style={{ position: "absolute", inset: 0 }}
      />

      {/* Layered silhouettes (static “mountains” for depth) */}
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: H * 0.22,
          backgroundColor: "transparent",
        }}
      >
        {/* Back ridge */}
        <View
          style={{
            position: "absolute",
            left: -W * 0.1,
            right: -W * 0.1,
            bottom: H * 0.10,
            height: H * 0.20,
            borderTopLeftRadius: W,
            borderTopRightRadius: W,
            backgroundColor: "rgba(30, 40, 70, 0.55)",
          }}
        />
        {/* Mid ridge */}
        <View
          style={{
            position: "absolute",
            left: -W * 0.05,
            right: -W * 0.05,
            bottom: H * 0.04,
            height: H * 0.18,
            borderTopLeftRadius: W * 0.9,
            borderTopRightRadius: W * 0.9,
            backgroundColor: "rgba(20, 28, 52, 0.70)",
          }}
        />
        {/* Front ridge */}
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: H * 0.14,
            borderTopLeftRadius: W * 0.8,
            borderTopRightRadius: W * 0.8,
            backgroundColor: "rgba(12, 18, 36, 0.95)",
          }}
        />
      </View>
    </View>
  );
}
