import { useColorScheme } from "react-native";

export const useTheme = () => {
  const colorScheme = useColorScheme();

  const colors = {
    light: {
      // Much darker background but keep all the beautiful colors
      background: "rgba(2, 6, 23, 0.98)", // Very dark night sky
      surface: "rgba(15, 23, 42, 0.85)",
      surfaceSecondary: "rgba(30, 41, 59, 0.9)",
      surfaceElevated: "rgba(15, 23, 42, 0.95)",

      // Restore the beautiful glassmorphism
      glassPrimary: "rgba(248, 250, 252, 0.1)",
      glassSecondary: "rgba(148, 163, 184, 0.08)",
      glassAccent: "rgba(139, 92, 246, 0.15)",

      // Text for dark background
      text: "#F8FAFC",
      textSecondary: "#CBD5E1",
      textTertiary: "#94A3B8",

      // Borders and overlays
      border: "rgba(148, 163, 184, 0.12)",
      overlay: "rgba(0, 0, 0, 0.6)",

      // Restore all the beautiful game category colors
      puzzle: {
        primary: "#A78BFA",
        glass: "rgba(167, 139, 250, 0.15)",
        glow: "rgba(167, 139, 250, 0.4)",
        shadow: "rgba(167, 139, 250, 0.6)",
      },
      board: {
        primary: "#34D399",
        glass: "rgba(52, 211, 153, 0.15)",
        glow: "rgba(52, 211, 153, 0.4)",
        shadow: "rgba(52, 211, 153, 0.6)",
      },
      memory: {
        primary: "#FBBF24",
        glass: "rgba(251, 191, 36, 0.15)",
        glow: "rgba(251, 191, 36, 0.4)",
        shadow: "rgba(251, 191, 36, 0.6)",
      },
      action: {
        primary: "#F87171",
        glass: "rgba(248, 113, 113, 0.15)",
        glow: "rgba(248, 113, 113, 0.4)",
        shadow: "rgba(248, 113, 113, 0.6)",
      },
      strategy: {
        primary: "#22D3EE",
        glass: "rgba(34, 211, 238, 0.15)",
        glow: "rgba(34, 211, 238, 0.4)",
        shadow: "rgba(34, 211, 238, 0.6)",
      },

      // Legacy support - brighter for dark background
      gameAccent1: "#A78BFA", // Lighter Purple - Puzzle
      gameAccent2: "#34D399", // Lighter Green - Board
      gameAccent3: "#FBBF24", // Lighter Amber - Memory
      gameAccent4: "#F87171", // Lighter Red - Action
      gameAccent5: "#22D3EE", // Lighter Cyan - Strategy
      gameAccent6: "#F472B6", // Lighter Pink - Special

      gameCard1: "rgba(167, 139, 250, 0.15)",
      gameCard2: "rgba(52, 211, 153, 0.15)",
      gameCard3: "rgba(251, 191, 36, 0.15)",
      gameCard4: "rgba(248, 113, 113, 0.15)",
      gameCard5: "rgba(34, 211, 238, 0.15)",
      gameCard6: "rgba(244, 114, 182, 0.15)",

      // Keep beautiful glassy buttons
      primaryButton: "rgba(167, 139, 250, 0.85)",
      primaryButtonText: "#FFFFFF",
      secondaryButton: "rgba(248, 250, 252, 0.08)",
      secondaryButtonText: "#F8FAFC",

      // Status colors
      success: "#34D399",
      warning: "#FBBF24",
      error: "#F87171",
      info: "#22D3EE",
    },
    dark: {
      // Much darker base colors
      background: "rgba(2, 6, 23, 0.98)", // Almost black night sky
      surface: "rgba(15, 23, 42, 0.85)",
      surfaceSecondary: "rgba(30, 41, 59, 0.9)",
      surfaceElevated: "rgba(15, 23, 42, 0.95)",

      // Beautiful glassmorphism for dark mode
      glassPrimary: "rgba(248, 250, 252, 0.08)",
      glassSecondary: "rgba(148, 163, 184, 0.05)",
      glassAccent: "rgba(167, 139, 250, 0.12)",

      // Text
      text: "#F8FAFC",
      textSecondary: "#CBD5E1",
      textTertiary: "#94A3B8",

      // Borders and overlays
      border: "rgba(148, 163, 184, 0.08)",
      overlay: "rgba(0, 0, 0, 0.6)",

      // Game category colors - brighter for dark mode
      puzzle: {
        primary: "#A78BFA",
        glass: "rgba(167, 139, 250, 0.15)",
        glow: "rgba(167, 139, 250, 0.4)",
        shadow: "rgba(167, 139, 250, 0.6)",
      },
      board: {
        primary: "#34D399",
        glass: "rgba(52, 211, 153, 0.15)",
        glow: "rgba(52, 211, 153, 0.4)",
        shadow: "rgba(52, 211, 153, 0.6)",
      },
      memory: {
        primary: "#FBBF24",
        glass: "rgba(251, 191, 36, 0.15)",
        glow: "rgba(251, 191, 36, 0.4)",
        shadow: "rgba(251, 191, 36, 0.6)",
      },
      action: {
        primary: "#F87171",
        glass: "rgba(248, 113, 113, 0.15)",
        glow: "rgba(248, 113, 113, 0.4)",
        shadow: "rgba(248, 113, 113, 0.6)",
      },
      strategy: {
        primary: "#22D3EE",
        glass: "rgba(34, 211, 238, 0.15)",
        glow: "rgba(34, 211, 238, 0.4)",
        shadow: "rgba(34, 211, 238, 0.6)",
      },

      // Legacy support - brighter for dark mode
      gameAccent1: "#A78BFA", // Lighter Purple - Puzzle
      gameAccent2: "#34D399", // Lighter Green - Board
      gameAccent3: "#FBBF24", // Lighter Amber - Memory
      gameAccent4: "#F87171", // Lighter Red - Action
      gameAccent5: "#22D3EE", // Lighter Cyan - Strategy
      gameAccent6: "#F472B6", // Lighter Pink - Special

      gameCard1: "rgba(167, 139, 250, 0.15)",
      gameCard2: "rgba(52, 211, 153, 0.15)",
      gameCard3: "rgba(251, 191, 36, 0.15)",
      gameCard4: "rgba(248, 113, 113, 0.15)",
      gameCard5: "rgba(34, 211, 238, 0.15)",
      gameCard6: "rgba(244, 114, 182, 0.15)",

      // Much more glassy buttons
      primaryButton: "rgba(167, 139, 250, 0.85)",
      primaryButtonText: "#020617",
      secondaryButton: "rgba(248, 250, 252, 0.08)",
      secondaryButtonText: "#F8FAFC",

      // Status colors
      success: "#34D399",
      warning: "#FBBF24",
      error: "#F87171",
      info: "#22D3EE",
    },
  };

  return {
    colors: colors.dark, // Always use dark theme for night sky
    isDark: true, // Always dark mode
    getGameCategory: (gameType) => getGameCategory(gameType),
    getCategoryColors: (gameType) => getCategoryColors(gameType, colors.dark),
  };
};

// Game type categorization - remove labels, just call them puzzle games
export const getGameCategory = (gameType) => {
  const categoryMap = {
    sudoku: "puzzle",
    word_search: "puzzle",
    sliding_puzzle: "puzzle",
    minesweeper: "puzzle",

    chess: "board",
    mancala: "board",

    memory_match: "memory",

    tetris: "action", // Still puzzle games, just different colors
    snake: "action",
    block_blast: "action",

    2048: "strategy", // Still puzzle games, just different colors
    water_sort: "strategy",
    flow_connect: "strategy",
  };

  return categoryMap[gameType?.toLowerCase()] || "puzzle";
};

// Get colors for a specific category
export const getCategoryColors = (gameType, colors) => {
  const category = getGameCategory(gameType);
  return colors[category] || colors.puzzle;
};

// Enhanced glassmorphic style generator with glow effects - KEEP THIS BEAUTIFUL!
export const createGlassStyle = (
  colors,
  category = "puzzle",
  intensity = 0.8,
) => {
  const categoryColors = colors[category] || colors.puzzle;

  return {
    backgroundColor: categoryColors.glass,
    borderWidth: 1,
    borderColor: `${categoryColors.primary}20`,
    shadowColor: categoryColors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
  };
};

// Particle effect colors - keep these beautiful colors!
export const getParticleColors = (isDark) => {
  return ["#A78BFA40", "#34D39940", "#FBBF2440", "#F8717140", "#22D3EE40"];
};
