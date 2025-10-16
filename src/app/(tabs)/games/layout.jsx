// apps/mobile/app/(tabs)/games/_layout.jsx
import React from "react";
import { Stack } from "expo-router";

export default function GamesLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        // stop unfocused screens from rendering & remove their native views
        freezeOnBlur: true,
        detachPreviousScreen: true,
      }}
    >
      <Stack.Screen name="index" options={{ title: "Games" }} />
      <Stack.Screen name="2048-fixed" options={{ title: "2048 (Fixed)" }} />
      <Stack.Screen name="block_blast" options={{ title: "Block Place" }} />
      <Stack.Screen name="connect_4" options={{ title: "Four in a Row" }} />
      <Stack.Screen name="dots_and_boxes" options={{ title: "Dots and Boxes" }} />
      <Stack.Screen name="flow_connect" options={{ title: "Color Flow" }} />
      <Stack.Screen name="mancala" options={{ title: "Mancala" }} />
      <Stack.Screen name="voidinvaders" options={{ title: "voidinvaders" }} />

      <Stack.Screen name="memory_match" options={{ title: "Memory Match" }} />
      <Stack.Screen name="minesweeper" options={{ title: "Mine Finder" }} />
      <Stack.Screen name="simon_says" options={{ title: "Pattern Match" }} />
      <Stack.Screen name="sliding_puzzle" options={{ title: "Sliding Puzzle" }} />
      <Stack.Screen name="hangman" options={{ title: "Hangman" }} />
      <Stack.Screen name="wordtiles" options={{ title: "Word Tiles" }} />
      <Stack.Screen name="snake" options={{ title: "Snake" }} />
      <Stack.Screen name="stackem" options={{ title: "Stack Em" }} />
        <Stack.Screen name="pong" options={{ title: "Paddle Battle" }} />
        <Stack.Screen name="smashem" options={{ title: "Smash Em" }} />
        <Stack.Screen name="fillthegrid" options={{ title: "Fill The Grid" }} />
      <Stack.Screen name="hilo" options={{ title: "Hi-Lo"}} />
      <Stack.Screen name="solitaire" options={{ title: "Solitaire" }} />
      <Stack.Screen name="sudoku" options={{ title: "Sudoku" }} />
      <Stack.Screen name="choices" options={{ title: "Choices" }} />
      <Stack.Screen name="blockrise" options={{ title: "Block Rise" }} />
      <Stack.Screen name="water_sort" options={{ title: "Water Sort" }} />
      <Stack.Screen name="whack_a_tap" options={{ title: "Whack A Tap" }} />
      <Stack.Screen name="word_search" options={{ title: "Word Search" }} />
      <Stack.Screen name="tictactoe" options={{ title: "Tic Tac Toe" }} />
    </Stack>
  );
}
