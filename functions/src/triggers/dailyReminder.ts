import * as admin from "firebase-admin";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import { User, Timeline } from "../common/types";

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
      // 1. Calculate the start of the day in JST
      const now = new Date();
      const jstOffset = 9 * 60; // JST is UTC+9
      const localOffset = now.getTimezoneOffset();
      const jstNow = new Date(now.getTime() + (jstOffset + localOffset) * 60 * 1000);

      const startOfTodayJST = new Date(jstNow);
      startOfTodayJST.setHours(0, 0, 0, 0);

      const startOfTodayTimestamp = admin.firestore.Timestamp.fromDate(startOfTodayJST);

      // 2. Get all user IDs who have posted today
      const submittedUsers = new Set<string>();
      const timelinesSnap = await db
        .collection("timelines")
        .where("createdAt", ">=", startOfTodayTimestamp)
        .get();
      timelinesSnap.forEach((doc) => {
        const timeline = doc.data() as Timeline;
        submittedUsers.add(timeline.author.userId);
      });

      logger.info(`${submittedUsers.size} users have submitted today.`);

      // 3. Get all eligible users for notification
      const usersSnap = await db.collection("users").get();
      const notificationTokens: string[] = [];

      usersSnap.forEach((doc) => {
        const user = doc.data() as User;
        const userId = doc.id;

        const isEligible =
          user.fcmToken &&
          user.groupId &&
          user.participatingQuestIds &&
          user.participatingQuestIds.length > 0;

        if (isEligible && !submittedUsers.has(userId) && user.fcmToken) {
          notificationTokens.push(user.fcmToken);
        }
      });

      // 4. Send notifications
      if (notificationTokens.length > 0) {
        logger.info(`Sending reminders to ${notificationTokens.length} users.`);
        const message = {
          notification: {
            title: "🚨 本日のノルマ未達成",
            body: "証拠の提出がまだ確認されていません。チームメンバーが監視しています！",
          },
          tokens: notificationTokens,
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
