import * as admin from "firebase-admin";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import { Timeline, Quest, User } from "../common/types";
import { getJstNow } from "../common/getJstNow";
import { getTargetFrequency } from "../common/getTargetFrequency";
import { getStartOfWeek } from "../common/getStartOfWeek";
import { getStartOfMonth } from "../common/getStartOfMonth";
const db = admin.firestore();
const messaging = admin.messaging();

/**
 * Function 3: Send a daily reminder to users who have not posted.
 * Triggered on a schedule.
 */
export const dailyReminder = onSchedule(
  { schedule: "every day 20:00", timeZone: "Asia/Tokyo" },
  async () => {
    logger.info("Executing daily reminder function.");

    try {
      const targetFrequencies = getTargetFrequency();

      const questsSnapshot = await db.collection("quests").get();
      const questFreqMap = new Map<string, string>();

      questsSnapshot.forEach((doc) => {
        const data = doc.data() as Quest;
        questFreqMap.set(doc.id, data.frequency);
      });

      const completedSet = new Set<string>();

      const jstNow = getJstNow();
      const startOfDay = new Date(jstNow);
      startOfDay.setHours(0, 0, 0, 0);
      const dailyPosts = await db.collection("timelines")
        .where("createdAt", ">=", startOfDay)
        .get();

      dailyPosts.forEach((doc) => {
        const data = doc.data() as Timeline;
        // 誰がどのクエストを達成したかを記録
        completedSet.add(`${data.userId}_${data.questId}`);
      });

      if (targetFrequencies.includes("WEEKLY")) {
        const startOfWeek = getStartOfWeek();
        const weeklyPosts = await db.collection("timelines")
          .where("createdAt", ">=", startOfWeek)
          .get();
        weeklyPosts.forEach((doc) => completedSet.add(`${doc.data().userId}_${doc.data().questId}`));
      }

      if (targetFrequencies.includes("MONTHLY")) {
        const startOfMonth = getStartOfMonth();
        const monthlyPosts = await db.collection("timelines")
          .where("createdAt", ">=", startOfMonth)
          .get();
        monthlyPosts.forEach((doc) => completedSet.add(`${doc.data().userId}_${doc.data().questId}`));
      }

      const usersStream = db.collection("users").stream() as AsyncIterable<admin.firestore.QueryDocumentSnapshot>;

      const fcmTokensToNotify: string[] = [];

      for await (const userDoc of usersStream) {
        const user = userDoc.data() as User;
        if (!user.participatingQuestIds || user.participatingQuestIds.length === 0) continue;

        let shouldNotify = false;

        // 参加しているクエストを1つずつチェック
        for (const questId of user.participatingQuestIds) {
          const freq = questFreqMap.get(questId);

          // そのクエストが今日の通知対象Frequencyでなければ無視
          if (!freq || !targetFrequencies.includes(freq)) continue;

          // 期間内に該当のクエストの投稿（達成）がなければ、通知フラグを立ててループを抜ける
          if (!completedSet.has(`${userDoc.id}_${questId}`)) {
            shouldNotify = true;
            break; // 1つでも未達成があれば通知するので、以降のチェックは不要
          }
        }

        if (shouldNotify && user.fcmToken) {
          fcmTokensToNotify.push(user.fcmToken);
        }
      }

      if (fcmTokensToNotify.length > 0) {
        logger.info(`Sending reminders to ${fcmTokensToNotify.length} users.`);
        const message = {
          notification: {
            title: "🚨 本日のノルマ未達成",
            body: "証拠の提出がまだ確認されていません。チームメンバーが監視しています！",
          },
          tokens: fcmTokensToNotify,
        };

        const response = await messaging.sendEachForMulticast(message);
        logger.info(`Successfully sent ${response.successCount} reminder messages.`);
        if (response.failureCount > 0) {
          logger.warn(`Failed to send ${response.failureCount} reminder messages.`);
        }
      } else {
        logger.info("No users to remind today.");
      }
    } catch (error) {
      logger.error("Error executing daily reminder:", error);
    }
  }
);
