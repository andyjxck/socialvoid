
// apps/mobile/app/(tabs)/games/index.jsx
import React from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { Link } from "expo-router";

export default function GamesIndexScreen() {
  const items = [
    ["2048", "/(tabs)/games/2048"],
    ["2048 (fixed)", "/(tabs)/games/2048-fixed"],
    ["Block Blast", "/(tabs)/games/block_blast"],
    ["Chess", "/(tabs)/games/chess"],
    ["Connect 4", "/(tabs)/games/connect_4"],
    ["Dots & Boxes", "/(tabs)/games/dots_and_boxes"],
    ["Flow Connect", "/(tabs)/games/flow_connect"],
    ["Kakuro", "/(tabs)/games/kakuro"],
    ["Mancala", "/(tabs)/games/mancala"],
    ["Memory Match", "/(tabs)/games/memory_match"],
    ["Minesweeper", "/(tabs)/games/minesweeper"],
    ["Simon Says", "/(tabs)/games/simon_says"],
    ["Sliding Puzzle", "/(tabs)/games/sliding_puzzle"],
    ["Snake", "/(tabs)/games/snake"],
    ["Solitaire", "/(tabs)/games/solitaire"],
    ["Sudoku", "/(tabs)/games/sudoku"],
    ["Tetris", "/(tabs)/games/tetris"],
    ["Water Sort", "/(tabs)/games/water_sort"],
    ["Whack A Tap", "/(tabs)/games/whack_a_tap"],
    ["Word Search", "/(tabs)/games/word_search"],
  ];

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: "700", marginBottom: 12 }}>
        Games
      </Text>
      {items.map(([label, href]) => (
        <Link key={href} href={href} asChild>
          <Pressable style={{ paddingVertical: 12 }}>
            <Text style={{ fontSize: 16 }}>{label}</Text>
          </Pressable>
        </Link>
      ))}
    </ScrollView>
  );
}
