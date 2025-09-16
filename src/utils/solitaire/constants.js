import { Dimensions } from "react-native";

const { width: screenWidth } = Dimensions.get("window");
export const CARD_WIDTH = Math.min(45, (screenWidth - 60) / 7);
export const CARD_HEIGHT = CARD_WIDTH * 1.4;
