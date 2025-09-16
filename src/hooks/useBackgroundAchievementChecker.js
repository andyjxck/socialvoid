import { useEffect } from "react";
import { Alert } from "react-native";
import { useQueryClient } from "@tanstack/react-query";

export function useBackgroundAchievementChecker(playerId) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!playerId) return;

    const checkAchievements = async () => {
      try {
        const response = await fetch("/api/achievements/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            playerId: playerId,
            action: "background_check",
            value: 1,
            gameData: {},
            sessionData: {
              timestamp: new Date().toISOString(),
              isBackgroundCheck: true,
            },
          }),
        });

        if (response.ok) {
          const result = await response.json();
          if (result.newlyCompleted?.length > 0) {
            result.newlyCompleted.forEach((achievement, i) => {
              setTimeout(() => {
                Alert.alert(
                  "Achievement Unlocked! 🏆",
                  `${achievement.name}\n${achievement.description}\n+${achievement.points_reward || 0} points!`,
                  [{ text: "Awesome! 🎉" }]
                );
              }, i * 1500);
            });
            queryClient.invalidateQueries(["player", playerId]);
          }
        }
      } catch (error) {
        console.error("Background achievement check failed:", error);
      }
    };

    const initialTimeout = setTimeout(checkAchievements, 3000);
    const interval = setInterval(checkAchievements, 10000);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [playerId, queryClient]);
}
