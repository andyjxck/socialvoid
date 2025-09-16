import { useState, useEffect } from "react";
import { Alert } from "react-native";
import * as Haptics from "expo-haptics";
import { setupGame } from "../utils/solitaire/logic";

/**
 * Minimal “playable start” check helpers
 */
const localCanMoveTo = (card, target, targetType) => {
  if (targetType === "foundation") {
    if (target.length === 0) return card.numValue === 1;
    const top = target[target.length - 1];
    return card.suit === top.suit && card.numValue === top.numValue + 1;
  }
  if (targetType === "tableau") {
    if (target.length === 0) return card.numValue === 13;
    const top = target[target.length - 1];
    return card.color !== top.color && card.numValue === top.numValue - 1;
  }
  return false;
};

const localGetMovableCards = (column, cardIndex) => {
  const cards = [];
  for (let i = cardIndex; i < column.length; i++) {
    if (!column[i].faceUp) break;
    if (cards.length > 0) {
      const prev = cards[cards.length - 1];
      if (
        column[i].color === prev.color ||
        column[i].numValue !== prev.numValue - 1
      )
        break;
    }
    cards.push(column[i]);
  }
  return cards;
};

const hasAnyMoves = (game) => {
  // waste -> foundation/tableau
  if (game.waste.length > 0) {
    const topWaste = game.waste[game.waste.length - 1];
    for (let i = 0; i < game.foundations.length; i++) {
      if (localCanMoveTo(topWaste, game.foundations[i], "foundation"))
        return true;
    }
    for (let i = 0; i < game.tableau.length; i++) {
      if (localCanMoveTo(topWaste, game.tableau[i], "tableau")) return true;
    }
  }
  // tableau top -> foundation
  for (let col = 0; col < game.tableau.length; col++) {
    const column = game.tableau[col];
    if (column.length === 0) continue;
    const topCard = column[column.length - 1];
    if (topCard.faceUp) {
      for (let i = 0; i < game.foundations.length; i++) {
        if (localCanMoveTo(topCard, game.foundations[i], "foundation"))
          return true;
      }
    }
  }
  // tableau stacks -> tableau targets
  for (let s = 0; s < game.tableau.length; s++) {
    const sourceCol = game.tableau[s];
    for (let start = 0; start < sourceCol.length; start++) {
      if (!sourceCol[start].faceUp) continue;
      const movable = localGetMovableCards(sourceCol, start);
      if (!movable.length) continue;
      const lead = movable[0];
      for (let t = 0; t < game.tableau.length; t++) {
        if (t === s) continue;
        if (localCanMoveTo(lead, game.tableau[t], "tableau")) return true;
      }
    }
  }
  return false;
};

/**
 * Re-deal up to 10x until the initial layout has at least one legal move.
 */
const generatePlayableGame = () => {
  for (let attempts = 0; attempts < 10; attempts++) {
    const g = setupGame();
    if (hasAnyMoves(g)) return g;
  }
  return setupGame();
};

export const useSolitaireGame = () => {
  // stockCycles = "number of waste->stock recycles since last PROGRESS"
  const [game, setGame] = useState(generatePlayableGame());
  const [gameHistory, setGameHistory] = useState([]);
  const [stockCycles, setStockCycles] = useState(0);
  const [isAutoCompleting, setIsAutoCompleting] = useState(false);

  const resetCycleOnProgress = () => setStockCycles(0);

  // Save game state for undo functionality
  const saveGameState = (currentGame) => {
    setGameHistory((prev) => [
      ...prev.slice(-19),
      {
        ...currentGame,
        foundations: currentGame.foundations.map((f) => [...f]),
        tableau: currentGame.tableau.map((t) => [...t]),
        stock: [...currentGame.stock],
        waste: [...currentGame.waste],
        selected: null,
      },
    ]);
  };

  // ✅ Change you asked for: ONLY allow auto-complete when waste pile is empty
  const canAutoComplete = (gameState) => {
    // All tableau cards must be face-up
    for (const column of gameState.tableau) {
      for (const card of column) {
        if (!card.faceUp) return false;
      }
    }
    // Waste must be empty
    if (gameState.waste.length > 0) return false;
    // Not already won
    if (gameState.foundations.every((f) => f.length === 13)) return false;
    return true;
  };

  const canMoveTo = (card, target, targetType) => {
    if (targetType === "foundation") {
      if (target.length === 0) return card.numValue === 1; // Ace
      const top = target[target.length - 1];
      return card.suit === top.suit && card.numValue === top.numValue + 1;
    }
    if (targetType === "tableau") {
      if (target.length === 0) return card.numValue === 13; // King
      const top = target[target.length - 1];
      return card.color !== top.color && card.numValue === top.numValue - 1;
    }
    return false;
  };

  const getMovableCards = (column, cardIndex) => {
    const cards = [];
    for (let i = cardIndex; i < column.length; i++) {
      if (!column[i].faceUp) break;
      if (cards.length > 0) {
        const prev = cards[cards.length - 1];
        if (
          column[i].color === prev.color ||
          column[i].numValue !== prev.numValue - 1
        ) {
          break;
        }
      }
      cards.push(column[i]);
    }
    return cards;
  };

  const autoCompleteGame = async (gameState) => {
    if (isAutoCompleting) return;
    setIsAutoCompleting(true);

    let currentGame = { ...gameState };
    let movesMade = true;

    while (
      movesMade &&
      !currentGame.foundations.every((f) => f.length === 13)
    ) {
      movesMade = false;

      // Waste -> Foundation
      if (currentGame.waste.length > 0) {
        const topWaste = currentGame.waste[currentGame.waste.length - 1];
        for (let i = 0; i < currentGame.foundations.length; i++) {
          if (canMoveTo(topWaste, currentGame.foundations[i], "foundation")) {
            currentGame.foundations[i] = [
              ...currentGame.foundations[i],
              topWaste,
            ];
            currentGame.waste = currentGame.waste.slice(0, -1);
            currentGame.score += 10;
            currentGame.moves++;
            movesMade = true;
            resetCycleOnProgress();
            break;
          }
        }
      }

      // Tableau top -> Foundation
      if (!movesMade) {
        for (
          let colIndex = 0;
          colIndex < currentGame.tableau.length;
          colIndex++
        ) {
          const column = currentGame.tableau[colIndex];
          if (column.length > 0) {
            const topCard = column[column.length - 1];
            for (let i = 0; i < currentGame.foundations.length; i++) {
              if (
                canMoveTo(topCard, currentGame.foundations[i], "foundation")
              ) {
                currentGame.foundations[i] = [
                  ...currentGame.foundations[i],
                  topCard,
                ];
                currentGame.tableau[colIndex] = column.slice(0, -1);
                currentGame.score += 10;
                currentGame.moves++;
                movesMade = true;
                resetCycleOnProgress();
                break;
              }
            }
            if (movesMade) break;
          }
        }
      }

      if (movesMade) {
        setGame({ ...currentGame });
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }

    setIsAutoCompleting(false);
  };

  // Win/Lose + Auto-complete prompt logic
  useEffect(() => {
    // Win
    if (game.foundations.every((f) => f.length === 13)) {
      Alert.alert("🎉 You Won!", `Congratulations! Score: ${game.score}`);
      return;
    }

    // LOSS: strictly after 5 recycles with NO progress in between.
    if (stockCycles >= 5) {
      Alert.alert(
        "😔 Game Over",
        "You've recycled the stock 5 times without making progress.",
        [{ text: "New Game", onPress: () => resetGame() }]
      );
      return;
    }

    // Auto-complete available (only if waste is empty per your request)
    if (canAutoComplete(game) && !isAutoCompleting) {
      Alert.alert(
        "🎉 Auto-Complete Available!",
        "All tableau cards are face up and the waste pile is empty. Auto-complete the game?",
        [
          { text: "Continue Playing", style: "cancel" },
          { text: "Auto-Complete", onPress: () => autoCompleteGame(game) },
        ]
      );
    }
  }, [
    game.foundations,
    stockCycles,
    game.stock.length,
    game.waste.length,
    isAutoCompleting,
  ]);

  // Undo last move
  const undoLastMove = async () => {
    if (gameHistory.length === 0) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const previousState = gameHistory[gameHistory.length - 1];
    setGame(previousState);
    setGameHistory((prev) => prev.slice(0, -1));
    // We don't touch stockCycles on undo.
  };

  // Try auto-placing a card into a foundation
  const tryAutoPlaceInSafeZone = async (card, source, cardIndex) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    for (let i = 0; i < game.foundations.length; i++) {
      const foundation = game.foundations[i];
      if (canMoveTo(card, foundation, "foundation")) {
        setGame((prevGame) => {
          saveGameState(prevGame);
          const newGame = { ...prevGame };

          // Add to foundation
          const newFoundations = [...newGame.foundations];
          newFoundations[i] = [...foundation, card];
          newGame.foundations = newFoundations;

          // Remove from source
          if (source.type === "tableau") {
            const sourceIndex = newGame.tableau.indexOf(source.column);
            const newSourceColumn = [...source.column];
            newSourceColumn.splice(cardIndex, 1);
            newGame.tableau[sourceIndex] = newSourceColumn;

            // Flip top if needed (progress)
            const topCard = newSourceColumn[newSourceColumn.length - 1];
            if (topCard && !topCard.faceUp) {
              topCard.faceUp = true;
              newGame.score += 5;
            }
          } else if (source.type === "waste") {
            newGame.waste = [...newGame.waste];
            newGame.waste.pop();
          }

          newGame.score += 10;
          newGame.moves++;
          newGame.selected = null;

          resetCycleOnProgress(); // PROGRESS!
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          return newGame;
        });
        return true;
      }
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    return false;
  };

  const handleCardPress = async (card, source, cardIndex) => {
    if (isAutoCompleting) return;

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (!game.selected) {
      if (!card.faceUp) return;
      let cards = [card];
      if (source.type === "tableau") {
        cards = getMovableCards(source.column, cardIndex);
      }
      setGame({ ...game, selected: { cards, source, cardIndex } });
      return;
    }

    // Try to move selected cards to this location
    setGame((prevGame) => {
      const newGame = { ...prevGame };
      const { cards: selectedCards, source: selectedSource } = newGame.selected;
      let canMove = false;

      if (source.type === "foundation") {
        if (
          selectedCards.length === 1 &&
          canMoveTo(selectedCards[0], source.column, "foundation")
        ) {
          saveGameState(prevGame);
          const newFoundations = [...newGame.foundations];
          const foundationIndex = newGame.foundations.indexOf(source.column);
          newFoundations[foundationIndex] = [
            ...source.column,
            selectedCards[0],
          ];
          newGame.foundations = newFoundations;
          canMove = true;
          newGame.score += 10;
        }
      } else if (source.type === "tableau") {
        if (canMoveTo(selectedCards[0], source.column, "tableau")) {
          saveGameState(prevGame);
          const newTableau = [...newGame.tableau];
          const tableauIndex = newGame.tableau.indexOf(source.column);
          newTableau[tableauIndex] = [...source.column, ...selectedCards];
          newGame.tableau = newTableau;
          canMove = true;
          newGame.score += 5;
        }
      }

      if (canMove) {
        if (selectedSource.type === "tableau") {
          const sourceIndex = newGame.tableau.indexOf(selectedSource.column);
          const newSourceColumn = [...selectedSource.column];
          newSourceColumn.splice(-selectedCards.length);
          newGame.tableau[sourceIndex] = newSourceColumn;

          const topCard = newSourceColumn[newSourceColumn.length - 1];
          if (topCard && !topCard.faceUp) {
            topCard.faceUp = true;
            newGame.score += 5;
          }
        } else if (selectedSource.type === "waste") {
          newGame.waste = [...newGame.waste];
          newGame.waste.pop();
        }
        newGame.moves++;
        resetCycleOnProgress(); // PROGRESS!
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }

      newGame.selected = null;
      return newGame;
    });
  };

  const handleEmptySpacePress = async (target, targetType) => {
    if (!game.selected || isAutoCompleting) return;

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    setGame((prevGame) => {
      const newGame = { ...prevGame };
      const { cards: selectedCards, source: selectedSource } = newGame.selected;
      let canMove = false;

      if (targetType === "foundation" && selectedCards.length === 1) {
        if (canMoveTo(selectedCards[0], target, "foundation")) {
          saveGameState(prevGame);
          const newFoundations = [...newGame.foundations];
          const foundationIndex = newGame.foundations.indexOf(target);
          newFoundations[foundationIndex] = [...target, selectedCards[0]];
          newGame.foundations = newFoundations;
          canMove = true;
          newGame.score += 10;
        }
      } else if (targetType === "tableau") {
        if (canMoveTo(selectedCards[0], target, "tableau")) {
          saveGameState(prevGame);
          const newTableau = [...newGame.tableau];
          const tableauIndex = newGame.tableau.indexOf(target);
          newTableau[tableauIndex] = [...target, ...selectedCards];
          newGame.tableau = newTableau;
          canMove = true;
          newGame.score += 5;
        }
      }

      if (canMove) {
        if (selectedSource.type === "tableau") {
          const sourceIndex = newGame.tableau.indexOf(selectedSource.column);
          const newSourceColumn = [...selectedSource.column];
          newSourceColumn.splice(-selectedCards.length);
          newGame.tableau[sourceIndex] = newSourceColumn;

          const topCard = newSourceColumn[newSourceColumn.length - 1];
          if (topCard && !topCard.faceUp) {
            topCard.faceUp = true;
            newGame.score += 5;
          }
        } else if (selectedSource.type === "waste") {
          newGame.waste = [...newGame.waste];
          newGame.waste.pop();
        }
        newGame.moves++;
        resetCycleOnProgress(); // PROGRESS!
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }

      newGame.selected = null;
      return newGame;
    });
  };

  const handleStockPress = async () => {
    if (isAutoCompleting) return;

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    setGame((prevGame) => {
      const newGame = {
        ...prevGame,
        stock: [...prevGame.stock],
        waste: [...prevGame.waste],
        selected: null,
      };

      if (newGame.stock.length > 0) {
        // Draw up to 3 cards to waste (drawing is not "progress" yet)
        saveGameState(prevGame);
        const cardsToDraw = Math.min(3, newGame.stock.length);
        for (let i = 0; i < cardsToDraw; i++) {
          const drawnCard = { ...newGame.stock.pop() };
          drawnCard.faceUp = true;
          newGame.waste.push(drawnCard);
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else if (newGame.waste.length > 0) {
        // Recycle waste -> stock (this increments the "since progress" counter)
        saveGameState(prevGame);
        newGame.stock = newGame.waste
          .map((card) => ({ ...card, faceUp: false }))
          .reverse();
        newGame.waste = [];
        newGame.score = Math.max(0, newGame.score - 10);
        setStockCycles((prev) => prev + 1);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }

      return newGame;
    });
  };

  const resetGame = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setGame(generatePlayableGame());
    setGameHistory([]);
    setStockCycles(0);
    setIsAutoCompleting(false);
  };

  const isSelected = (card) => {
    return game.selected?.cards.some((c) => c.id === card.id) || false;
  };

  return {
    game,
    resetGame,
    undoLastMove,
    canUndo: gameHistory.length > 0,
    stockCycles, // recycles since last progress
    isAutoCompleting,
    handleCardPress,
    handleEmptySpacePress,
    handleStockPress,
    isSelected,
    tryAutoPlaceInSafeZone,
  };
};