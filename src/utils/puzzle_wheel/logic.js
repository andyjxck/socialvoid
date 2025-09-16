import { WORD_DICTIONARY } from "./dictionary";

// Safe random wheel generator - no infinite loops
export const generateWordWheel = () => {
  const presetWheels = [
    { center: "A", outer: ["R", "T", "S", "N", "G", "C", "H"] },
    { center: "E", outer: ["R", "T", "S", "N", "L", "D", "M"] },
    { center: "I", outer: ["R", "T", "S", "N", "L", "G", "H"] },
    { center: "O", outer: ["R", "T", "S", "N", "L", "P", "M"] },
    { center: "U", outer: ["R", "T", "S", "N", "L", "P", "B"] },
    { center: "S", outer: ["R", "T", "A", "E", "I", "N", "L"] },
    { center: "T", outer: ["R", "A", "E", "I", "N", "L", "H"] },
    { center: "R", outer: ["A", "E", "I", "T", "S", "N", "L"] },
    { center: "N", outer: ["A", "E", "I", "T", "S", "R", "L"] },
    { center: "L", outer: ["A", "E", "I", "T", "S", "R", "N"] },
  ];

  // Pick a random preset
  const wheel = presetWheels[Math.floor(Math.random() * presetWheels.length)];

  return {
    center: wheel.center,
    outer: wheel.outer,
    allLetters: [wheel.center, ...wheel.outer],
  };
};

// Check if word is valid using the wheel letters
export const isValidWord = (word, wheelLetters, centerLetter) => {
  try {
    if (!word || word.length < 3) return false;
    if (!word.toUpperCase().includes(centerLetter)) return false;
    if (!WORD_DICTIONARY.has(word.toLowerCase())) return false;

    const letterCount = {};
    for (let letter of wheelLetters) {
      letterCount[letter] = (letterCount[letter] || 0) + 1;
    }

    for (let letter of word.toUpperCase()) {
      if (!letterCount[letter] || letterCount[letter] === 0) {
        return false;
      }
      letterCount[letter]--;
    }

    return true;
  } catch (error) {
    console.error("Error in isValidWord:", error);
    return false;
  }
};

// Generate crossword puzzle for Puzzle Wheel game
export const generateCrosswordPuzzle = () => {
  try {
    const gridSize = 6;
    const grid = Array(gridSize)
      .fill(null)
      .map(() =>
        Array(gridSize)
          .fill(null)
          .map(() => null),
      );

    // Select words from dictionary (shorter words for small grid)
    const availableWords = Array.from(WORD_DICTIONARY).filter(
      (word) => word.length >= 3 && word.length <= 5,
    );

    const selectedWords = [];
    const targetWords = [];
    let wordNumber = 1;

    // Pick random words for the puzzle
    const shuffled = availableWords.sort(() => Math.random() - 0.5);

    // Try to place first word horizontally
    const firstWord = shuffled[0].toUpperCase();
    const startRow = 1;
    const startCol = 1;

    // Place first word
    for (let i = 0; i < firstWord.length && startCol + i < gridSize; i++) {
      grid[startRow][startCol + i] = {
        letter: firstWord[i],
        wordNumber: i === 0 ? wordNumber : null,
        letterIndex: i,
        preFilled: true,
        solved: false,
      };
    }

    targetWords.push({
      word: firstWord,
      number: wordNumber++,
      direction: "across",
      startRow,
      startCol,
    });

    // Try to place second word vertically
    if (shuffled.length > 1) {
      const secondWord = shuffled[1].toUpperCase();
      const intersectCol = startCol + 1; // Intersect at second letter of first word
      const intersectRow = startRow;
      const secondStartRow = Math.max(0, intersectRow - 1);

      if (secondStartRow + secondWord.length <= gridSize) {
        for (
          let i = 0;
          i < secondWord.length && secondStartRow + i < gridSize;
          i++
        ) {
          const currentRow = secondStartRow + i;
          if (grid[currentRow][intersectCol] === null) {
            grid[currentRow][intersectCol] = {
              letter: secondWord[i],
              wordNumber: i === 0 ? wordNumber : null,
              letterIndex: i,
              preFilled: true,
              solved: false,
            };
          }
        }

        targetWords.push({
          word: secondWord,
          number: wordNumber++,
          direction: "down",
          startRow: secondStartRow,
          startCol: intersectCol,
        });
      }
    }

    // Create wheel from all letters used in the puzzle
    const allLetters = new Set();
    targetWords.forEach((word) => {
      for (let letter of word.word) {
        allLetters.add(letter);
      }
    });

    const lettersArray = Array.from(allLetters);
    const centerLetter =
      lettersArray[Math.floor(Math.random() * lettersArray.length)];
    const outerLetters = lettersArray.filter((l) => l !== centerLetter);

    // Add some additional common letters if we need more
    while (outerLetters.length < 7) {
      const commonLetters = ["E", "A", "R", "I", "O", "T", "N", "S"];
      const newLetter =
        commonLetters[Math.floor(Math.random() * commonLetters.length)];
      if (!outerLetters.includes(newLetter) && newLetter !== centerLetter) {
        outerLetters.push(newLetter);
      }
    }

    const wheel = {
      center: centerLetter,
      outer: outerLetters.slice(0, 7),
      allLetters: [centerLetter, ...outerLetters.slice(0, 7)],
    };

    return {
      grid,
      targetWords,
      wheel,
    };
  } catch (error) {
    console.error("Error generating crossword puzzle:", error);

    // Fallback simple puzzle
    const grid = Array(6)
      .fill(null)
      .map(() =>
        Array(6)
          .fill(null)
          .map(() => null),
      );

    // Simple fallback word
    const word = "CAT";
    for (let i = 0; i < word.length; i++) {
      grid[1][1 + i] = {
        letter: word[i],
        wordNumber: i === 0 ? 1 : null,
        letterIndex: i,
        preFilled: true,
        solved: false,
      };
    }

    return {
      grid,
      targetWords: [
        {
          word: "CAT",
          number: 1,
          direction: "across",
          startRow: 1,
          startCol: 1,
        },
      ],
      wheel: {
        center: "A",
        outer: ["C", "T", "R", "S", "N", "L", "E"],
        allLetters: ["A", "C", "T", "R", "S", "N", "L", "E"],
      },
    };
  }
};
