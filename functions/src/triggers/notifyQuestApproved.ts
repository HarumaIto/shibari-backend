import * as admin from "firebase-admin";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import { Timeline, User } from "../common/types";
import { sendAndSaveNotification } from "../common/sendAndSaveNotification";

const db = admin.firestore();

/**
 * Triggered when a timeline document is updated.
 * Checks if the post's status changed to 'APPROVED'.
 * Sends a QUEST_APPROVED notification to the author.
 */
export const notifyQuestApproved = onDocumentUpdated(
  "timelines/{postId}",
  async (event) => {
    const before = event.data?.before.data() as Timeline | undefined;
    const after = event.data?.after.data() as Timeline | undefined;
    const postId = event.params.postId;

    if (!before || !after) {
      logger.info("Timeline data missing, exiting notifyQuestApproved.");
      return;
    }

    // Check if status changed from something else to 'APPROVED'
    if (after.status === "APPROVED" && before.status !== "APPROVED") {
      const targetUserId = after.userId; // The original author of the post
      const approverId = after.processedBy; // Optional: whoever approved it

      logger.info(`Post ${postId} approved. Sending notification to user ${targetUserId}.`);

      try {
        const userDoc = await db.collection("users").doc(targetUserId).get();
        if (!userDoc.exists) {
          logger.warn(`User ${targetUserId} not found for QUEST_APPROVED notification`);
          return;
        }

        const userData = userDoc.data() as User;

        await sendAndSaveNotification({
          targetUserId,
          fcmToken: userData.fcmToken,
          type: "QUEST_APPROVED",
          title: "承認されました",
          body: "あなたの提出したクエストが承認されました！",
          senderId: approverId, // Optional string
          targetId: postId,
        });

        logger.info(`QUEST_APPROVED notification sent to user ${targetUserId} for post ${postId}`);
      } catch (error) {
        logger.error("Failed to send QUEST_APPROVED notification:", error);
      }
    }
  }
);
