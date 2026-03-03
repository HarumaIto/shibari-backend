import * as admin from "firebase-admin";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import { Timeline, User } from "../common/types";
import { sendAndSaveNotification } from "../common/sendAndSaveNotification";

const db = admin.firestore();

/**
 * Triggered when a timeline document is updated.
 * Checks if the post's status changed to 'REJECTED'.
 * Sends a QUEST_REJECTED notification to the author.
 */
export const notifyQuestRejected = onDocumentUpdated(
  "timelines/{postId}",
  async (event) => {
    const before = event.data?.before.data() as Timeline | undefined;
    const after = event.data?.after.data() as Timeline | undefined;
    const postId = event.params.postId;

    if (!before || !after) {
      logger.info("Timeline data missing, exiting notifyQuestRejected.");
      return;
    }

    // Check if status changed from something else to 'REJECTED'
    if (after.status === "REJECTED" && before.status !== "REJECTED") {
      const targetUserId = after.userId; // The original author of the post
      const rejectorId = after.processedBy; // Optional: whoever rejected it

      logger.info(`Post ${postId} rejected. Sending notification to user ${targetUserId}.`);

      try {
        const userDoc = await db.collection("users").doc(targetUserId).get();
        if (!userDoc.exists) {
          logger.warn(`User ${targetUserId} not found for QUEST_REJECTED notification`);
          return;
        }

        const userData = userDoc.data() as User;

        await sendAndSaveNotification({
          targetUserId,
          fcmToken: userData.fcmToken,
          type: "QUEST_REJECTED",
          title: "却下されました",
          body: "提出したクエストが却下されました。確認してください。",
          senderId: rejectorId, // Optional string
          targetId: postId,
        });

        logger.info(`QUEST_REJECTED notification sent to user ${targetUserId} for post ${postId}`);
      } catch (error) {
        logger.error("Failed to send QUEST_REJECTED notification:", error);
      }
    }
  }
);
