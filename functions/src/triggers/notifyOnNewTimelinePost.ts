import * as admin from "firebase-admin";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import { User, Timeline } from "../common/types";
import { sendAndSaveNotification } from "../common/sendAndSaveNotification";

const db = admin.firestore();

/**
 * Triggered when a new timeline post is created.
 * Notifies all users in the same group.
 */
export const notifyOnNewTimelinePost = onDocumentCreated(
  "timelines/{postId}",
  async (event) => {
    const timelineData = event.data?.data() as Timeline | undefined;
    const postId = event.data?.id;

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

      const notifications: Promise<void>[] = [];

      usersSnapshot.forEach((doc) => {
        const targetUserId = doc.id;
        // Don't notify the author
        if (targetUserId === userId) return;

        const userData = doc.data() as User;

        const notificationPromise = sendAndSaveNotification({
          targetUserId,
          fcmToken: userData.fcmToken,
          type: "QUEST_POSTED",
          title: "グループに新しい投稿がありました！",
          body: `${author.displayName}さんが新しく投稿しました。`,
          senderId: userId,
          targetId: postId,
        });

        notifications.push(notificationPromise);
      });

      if (notifications.length === 0) {
        logger.info(`No other users in group ${groupId}.`);
        return;
      }

      await Promise.all(notifications);
      logger.info(`QUEST_POSTED notifications sent for group ${groupId}.`);
    } catch (error) {
      logger.error(`Error sending timeline notification for groupId ${groupId}:`, error);
    }
  }
);
