import * as admin from "firebase-admin";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import { User } from "../common/types";
import { sendAndSaveNotification } from "../common/sendAndSaveNotification";

const db = admin.firestore();

/**
 * Triggered when a user document is updated.
 * Specifically checks if the user has joined a new group (groupId changed).
 * Sends a MEMBER_JOINED notification to all other group members.
 */
export const notifyMemberJoined = onDocumentUpdated(
  "users/{userId}",
  async (event) => {
    const before = event.data?.before.data() as User | undefined;
    const after = event.data?.after.data() as User | undefined;
    const newMemberId = event.params.userId;

    if (!before || !after) {
      logger.info("User data missing, exiting notifyMemberJoined.");
      return;
    }

    // Check if groupId has changed and is not null/undefined
    if (after.groupId && after.groupId !== before.groupId) {
      const groupId = after.groupId;
      const newMemberName = after.displayName;

      logger.info(`User ${newMemberId} joined group ${groupId}. Sending notifications.`);

      try {
        // Get all members in the new group except the user who just joined
        const usersSnapshot = await db
          .collection("users")
          .where("groupId", "==", groupId)
          .get();

        const notifications: Promise<void>[] = [];

        usersSnapshot.forEach((doc) => {
          const targetUserId = doc.id;
          if (targetUserId === newMemberId) return; // Don't notify the new member

          const userData = doc.data() as User;

          const notificationPromise = sendAndSaveNotification({
            targetUserId,
            fcmToken: userData.fcmToken,
            type: "MEMBER_JOINED",
            title: "新規メンバー参加",
            body: `${newMemberName}さんがグループに参加しました。`,
            senderId: newMemberId,
            targetId: groupId,
          });

          notifications.push(notificationPromise);
        });

        await Promise.all(notifications);
        logger.info(`MEMBER_JOINED notifications sent for group ${groupId}`);
      } catch (error) {
        logger.error("Failed to send MEMBER_JOINED notifications:", error);
      }
    }
  }
);
