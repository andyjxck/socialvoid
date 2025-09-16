// apps/mobile/app/(tabs)/games/_layout.jsx
import React from "react";
import { Stack } from "expo-router";

export default function GamesLayout() {
  return (
    <Stack screenOptions={{ headerShown: true }}>
      <Stack.Screen name="index" options={{ title: "Games" }} />
      <Stack.Screen name="2048" options={{ title: "2048" }} />
      <Stack.Screen name="2048-fixed" options={{ title: "2048 (Fixed)" }} />
      <Stack.Screen name="block_blast" options={{ title: "Block Blast" }} />
      <Stack.Screen name="chess" options={{ title: "Chess" }} />
      <Stack.Screen name="connect_4" options={{ title: "Connect 4" }} />
      <Stack.Screen name="dots_and_boxes" options={{ title: "Dots and Boxes" }} />
      <Stack.Screen name="flow_connect" options={{ title: "Flow Connect" }} />
      <Stack.Screen name="kakuro" options={{ title: "Kakuro" }} />
      <Stack.Screen name="mancala" options={{ title: "Mancala" }} />
      <Stack.Screen name="memory_match" options={{ title: "Memory Match" }} />
      <Stack.Screen name="minesweeper" options={{ title: "Minesweeper" }} />
      <Stack.Screen name="simon_says" options={{ title: "Simon Says" }} />
      <Stack.Screen name="sliding_puzzle" options={{ title: "Sliding Puzzle" }} />
      <Stack.Screen name="snake" options={{ title: "Snake" }} />
      <Stack.Screen name="solitaire" options={{ title: "Solitaire" }} />
      <Stack.Screen name="sudoku" options={{ title: "Sudoku" }} />
      <Stack.Screen name="tetris" options={{ title: "Tetris" }} />
      <Stack.Screen name="water_sort" options={{ title: "Water Sort" }} />
      <Stack.Screen name="whack_a_tap" options={{ title: "Whack A Tap" }} />
      <Stack.Screen name="word_search" options={{ title: "Word Search" }} />
    </Stack>
  );
}

