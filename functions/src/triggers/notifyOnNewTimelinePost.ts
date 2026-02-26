import * as admin from "firebase-admin";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import { User, Timeline } from "../common/types";

const db = admin.firestore();
const messaging = admin.messaging();

/**
 * Triggered when a new timeline post is created.
 * Notifies all users in the same group.
 */
export const notifyOnNewTimelinePost = onDocumentCreated(
  "timelines/{postId}",
  async (event) => {
    const timelineData = event.data?.data() as Timeline | undefined;

    if (!timelineData) {
      logger.info("Timeline data is missing, exiting.");
      return;
    }

    const { groupId, userId, author } = timelineData;

    if (!groupId) {
      logger.info("Group ID is missing in timeline post, exiting.");
      return;
    }

    try {
      // Get all users in the same group
      const usersSnapshot = await db
        .collection("users")
        .where("groupId", "==", groupId)
        .get();

      const tokens: string[] = [];
      usersSnapshot.forEach((doc) => {
        const userData = doc.data() as User;
        // Don't notify the author and ensure token exists
        if (doc.id !== userId && userData.fcmToken) {
          tokens.push(userData.fcmToken);
        }
      });

      if (tokens.length === 0) {
        logger.info(`No other users with FCM tokens in group ${groupId}.`);
        return;
      }

      const message: admin.messaging.MulticastMessage = {
        tokens: tokens,
        notification: {
          title: "グループに新しい投稿がありました！",
          body: `${author.displayName}さんが新しく投稿しました。`,
        },
      };

      const response = await messaging.sendEachForMulticast(message);
      logger.info(
        `Sent ${response.successCount} notifications for group ${groupId}.`
      );
      if (response.failureCount > 0) {
        logger.warn(
          `Failed to send ${response.failureCount} notifications for group ${groupId}.`
        );
        const failed = response.responses
          .map((resp, index) => ({ resp, index }))
          .filter(({ resp }) => !resp.success);
        failed.forEach(({ resp, index }) => {
          const token = tokens[index];
          const errorCode = resp.error?.code ?? "unknown";
          const errorMessage = resp.error?.message ?? "No error message provided";
          logger.warn(
            `Notification to token ${token} failed with error ${errorCode}: ${errorMessage}`
          );
        });
      }
    } catch (error) {
      logger.error(`Error sending timeline notification for groupId ${groupId}:`, error);
    }
  }
);
