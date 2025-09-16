const createCard = (suit, value, color) => ({
  id: `${suit}${value}`,
  suit,
  value,
  color,
  faceUp: false,
});

const createDeck = () => {
  const deck = [];
  const suits = ["♠", "♥", "♦", "♣"];
  const colors = ["black", "red", "red", "black"];
  const values = [
    "A",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "J",
    "Q",
    "K",
  ];

  suits.forEach((suit, suitIndex) => {
    values.forEach((value, valueIndex) => {
      deck.push({
        ...createCard(suit, value, colors[suitIndex]),
        numValue: valueIndex + 1,
      });
    });
  });

  // Shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
};

export const setupGame = () => {
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    attempts++;

    const deck = createDeck();
    let index = 0;

    // Setup tableau (7 columns)
    const tableau = [];
    for (let col = 0; col < 7; col++) {
      const column = [];
      for (let row = 0; row <= col; row++) {
        const card = { ...deck[index++] };
        card.faceUp = row === col; // Only top card face up
        column.push(card);
      }
      tableau.push(column);
    }

    // Remaining cards go to stock
    const stock = deck.slice(index).map((card) => ({ ...card, faceUp: false }));

    const gameState = {
      tableau,
      stock,
      waste: [],
      foundations: [[], [], [], []],
      selected: null,
      score: 0,
      moves: 0,
    };

    // Basic solvability check - ensure we have some good sequences
    if (isLikelyWinnable(gameState)) {
      return gameState;
    }
  }

  // If all attempts fail, just return the last one
  const deck = createDeck();
  let index = 0;

  const tableau = [];
  for (let col = 0; col < 7; col++) {
    const column = [];
    for (let row = 0; row <= col; row++) {
      const card = { ...deck[index++] };
      card.faceUp = row === col;
      column.push(card);
    }
    tableau.push(column);
  }

  const stock = deck.slice(index).map((card) => ({ ...card, faceUp: false }));

  return {
    tableau,
    stock,
    waste: [],
    foundations: [[], [], [], []],
    selected: null,
    score: 0,
    moves: 0,
  };
};

// Basic check to see if game is likely winnable
const isLikelyWinnable = (gameState) => {
  let goodMoves = 0;

  // Check for kings that can be moved to empty spaces
  for (let col = 0; col < gameState.tableau.length; col++) {
    const column = gameState.tableau[col];
    if (column.length > 0) {
      const topCard = column[column.length - 1];
      if (topCard.faceUp && topCard.value === "K") {
        // Kings can always potentially be moved
        goodMoves++;
      }
    }
  }

  // Check for aces that can go to foundations
  for (let col = 0; col < gameState.tableau.length; col++) {
    const column = gameState.tableau[col];
    if (column.length > 0) {
      const topCard = column[column.length - 1];
      if (topCard.faceUp && topCard.value === "A") {
        goodMoves++;
      }
    }
  }

  // Check for immediate tableau moves
  for (let fromCol = 0; fromCol < gameState.tableau.length; fromCol++) {
    const fromColumn = gameState.tableau[fromCol];
    if (fromColumn.length === 0) continue;

    const topCard = fromColumn[fromColumn.length - 1];
    if (!topCard.faceUp) continue;

    for (let toCol = 0; toCol < gameState.tableau.length; toCol++) {
      if (fromCol === toCol) continue;

      const toColumn = gameState.tableau[toCol];
      if (canPlaceOnTableau(topCard, toColumn)) {
        goodMoves++;
      }
    }
  }

  // Game is likely winnable if we have at least 2 good moves available
  return goodMoves >= 2;
};

// Helper function to check if a card can be placed on a tableau column
const canPlaceOnTableau = (card, column) => {
  if (column.length === 0) {
    return card.value === "K"; // Only kings on empty columns
  }

  const topCard = column[column.length - 1];
  if (!topCard.faceUp) return false;

  const cardValue = getCardNumValue(card.value);
  const topValue = getCardNumValue(topCard.value);

  return cardValue === topValue - 1 && card.color !== topCard.color;
};

const getCardNumValue = (value) => {
  const values = [
    "A",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "J",
    "Q",
    "K",
  ];
  return values.indexOf(value) + 1;
};
