// components/hub/GamesSection.jsx  (REPLACE ENTIRE FILE)
import React, { useMemo, useCallback } from "react";
import { View, Text, TouchableOpacity, FlatList, useWindowDimensions } from "react-native";
import { useTheme } from "../../utils/theme";
import GameCard from "../GameCard";
import PromoGameCard from "../PromoGameCard";     // 1) Discord
import PromoGameCard2 from "../PromoGameCard2";   // 2) Social Void
import PromoCard3 from "../PromoGameCard3";           // 3) Instagram

const H_PADDING = 20; // horizontal screen padding (match the page)
const ROW_GAP = 16;   // vertical gap between rows
const COL_GAP = 12;   // horizontal gap between the 2 cards

// Where to insert each promo (counted in list order; NOT zero-based index in UI terms).
// We clamp to the end if the list is shorter.
const PROMO_INSERTS = {
  1: 4,   // after two rows
  2: 10,  // later down the list
  3: 16,  // even later
};


export default function GamesSection({ games, isLoading, onRetry, playerId }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();

  // Card width for two-column grid
  const cardWidth = useMemo(() => {
    const inner = width - H_PADDING * 2;
    return Math.floor((inner - COL_GAP) / 2);
  }, [width]);

  // Build a combined list with up to three promo cards injected.
  const dataWithPromos = useMemo(() => {
    if (!Array.isArray(games) || games.length === 0) return [];

    // Work on a shallow copy
    const arr = [...games];

    // Compute safe insert indices (clamped to current length)
    const insert1 = Math.max(0, Math.min(PROMO_INSERTS[1], arr.length));
    const insert2 = Math.max(0, Math.min(PROMO_INSERTS[2], arr.length));
    const insert3 = Math.max(0, Math.min(PROMO_INSERTS[3], arr.length));

    // Insert in descending order so earlier indices don't shift
    const inserts = [
      { pos: insert3, item: { __promo: 3, id: "promo-3" } },
      { pos: insert2, item: { __promo: 2, id: "promo-2" } },
      { pos: insert1, item: { __promo: 1, id: "promo-1" } },
    ].filter(Boolean).sort((a, b) => b.pos - a.pos);

    inserts.forEach(({ pos, item }) => {
      const p = Math.max(0, Math.min(pos, arr.length));
      arr.splice(p, 0, item);
    });

    return arr;
  }, [games]);

  const renderItem = useCallback(
    ({ item }) => {
      // Promo cards
      if (item?.__promo === 1) {
        // Discord
        return (
          <View style={{ width: cardWidth, marginBottom: ROW_GAP }}>
            <PromoGameCard
              // All props are optional — component has defaults.
              // You can override here if you want custom copy:
              // title="Join the Discord"
              // subtitle="Feedback, updates & sneak peeks"
              // url="https://discord.gg/PmWMEH8RWJ"
              // badge="JOIN"
            />
          </View>
        );
      }
      if (item?.__promo === 2) {
        // Social Void
        return (
          <View style={{ width: cardWidth, marginBottom: ROW_GAP }}>
            <PromoGameCard2
              // Optional overrides:
              // title="Social Void"
              // subtitle="Merge your way back to bed"
              // url="https://apps.apple.com/gb/app/social-void/id6751636874"
              // badge="FREE"
              // accent="#00D1B2"
            />
          </View>
        );
      }
      if (item?.__promo === 3) {
        // Instagram
        return (
          <View style={{ width: cardWidth, marginBottom: ROW_GAP }}>
            <PromoCard3
              // Optional overrides:
              // title="Follow Us"
              // subtitle="Support us on instagram"
              // url="https://www.instagram.com/anandysocialgame"
              // accent="#E1306C"
            />
          </View>
        );
      }

      // Normal game card
      return (
        <View style={{ width: cardWidth, marginBottom: ROW_GAP }}>
          <GameCard game={{ ...item, is_unlocked: true }} playerId={playerId} />
        </View>
      );
    },
    [cardWidth, playerId]
  );

  const keyExtractor = useCallback((g, i) => {
    if (g?.__promo === 1) return "promo-1";
    if (g?.__promo === 2) return "promo-2";
    if (g?.__promo === 3) return "promo-3";
    return String(g?.id ?? i);
  }, []);

  // Body
  let body = null;

  if (isLoading) {
    body = (
      <View style={{ alignItems: "center", paddingVertical: 40, paddingHorizontal: 20 }}>
        <Text style={{ fontFamily: "Inter_500Medium", fontSize: 16, color: colors.textSecondary }}>
          Loading games...
        </Text>
      </View>
    );
  } else if (!Array.isArray(games) || games.length === 0) {
    body = (
      <View style={{ alignItems: "center", paddingVertical: 40, paddingHorizontal: 20 }}>
        <Text
          style={{
            fontFamily: "Inter_500Medium",
            fontSize: 16,
            color: colors.textSecondary,
            textAlign: "center",
            marginBottom: 8,
          }}
        >
          No games found. Check your connection and try again.
        </Text>
        <TouchableOpacity
          onPress={onRetry}
          style={{
            backgroundColor: colors.gameAccent1 + "20",
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: 8,
            marginTop: 8,
          }}
        >
          <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.gameAccent1 }}>
            Retry
          </Text>
        </TouchableOpacity>
      </View>
    );
  } else {
    body = (
      <FlatList
        data={dataWithPromos}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        numColumns={2}
        contentContainerStyle={{ paddingHorizontal: H_PADDING, paddingBottom: 24 }}
        columnWrapperStyle={{ justifyContent: "space-between" }} // sets the single horizontal gap
        scrollEnabled={false} // outer ScrollView owns scrolling; set true if needed
        removeClippedSubviews
        initialNumToRender={12}
        windowSize={9}
      />
    );
  }

  return (
    <View style={{ marginTop: 8 }}>
      <Text
        style={{
          fontFamily: "Inter_500Medium",
          fontSize: 14,
          color: colors.textSecondary,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          paddingHorizontal: H_PADDING,
          marginBottom: 12,
        }}
      >
        All Games ({games?.length ?? 0})
      </Text>

      {body}
    </View>
  );
}
