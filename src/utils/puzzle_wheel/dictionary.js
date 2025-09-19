// src/utils/puzzle_wheel/dictionary.js
import rawWords from "./listofwords";

export const WORD_DICTIONARY = new Set(
  (typeof rawWords === "string" ? rawWords : (rawWords?.default ?? ""))
    .split(/\r?\n/)
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean)
);
