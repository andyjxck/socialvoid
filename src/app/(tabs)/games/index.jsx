// apps/mobile/app/(tabs)/games/index.jsx  (REPLACE ENTIRE FILE)
import React from "react";
import { ScrollView, Text, Pressable } from "react-native";
import { Link } from "expo-router";

const ITEMS = [
  ["2048 (Fixed)", "/games/2048-fixed"],
  ["Block Place", "/games/block_blast"],
  ["Block Rise", "/games/blockrise"],
  ["Four in a Row", "/games/connect_4"],
  ["Dots & Boxes", "/games/dots_and_boxes"],
  ["Color Flow", "/games/flow_connect"],
  ["Hangman", "/games/hangman"],
  ["Mancala", "/games/mancala"],
  ["Memory Match", "/games/memory_match"],
  ["Mine Finder", "/games/minesweeper"],
  ["Pattern Match", "/games/simon_says"],
  ["Sliding Puzzle", "/games/sliding_puzzle"],
  ["Snake", "/games/snake"],
  ["Paddle Battle", "/games/pong"],
    ["Smash Em", "/games/smashem"],
        ["Void Invaders", "/games/voidinvaders"],

    ["Stack Em", "/games/stackem"],
    ["Fill The Grid", "/games/fillthegrid"],
  ["Choices", "/games/choices"],

  ["Hi-Lo", "/games/hilo"],
  ["Solitaire", "/games/solitaire"],
  ["Sudoku", "/games/sudoku"],
  ["Tic Tac Toe", "/games/tictactoe"],
  ["Water Sort", "/games/water_sort"],
  ["Whack A Tap", "/games/whack_a_tap"],
  ["Word Search", "/games/word_search"],
  ["Word Tiles", "/games/wordtiles"],
];

export default function GamesIndexScreen() {
  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: "700", marginBottom: 12 }}>Games</Text>
      {ITEMS.map(([label, href]) => (
        <Link key={href} href={href} asChild>
          <Pressable style={{ paddingVertical: 12 }}>
            <Text style={{ fontSize: 16 }}>{label}</Text>
          </Pressable>
        </Link>
      ))}
    </ScrollView>
  );
}
