import * as admin from "firebase-admin";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import { User } from "../common/types";
import { sendAndSaveNotification } from "../common/sendAndSaveNotification";

const db = admin.firestore();

interface Group {
  memberIds: string[]; // array of user IDs
  [key: string]: unknown;
}

/**
 * Triggered when a group document is updated.
 * Checks if new members were added to the group's `memberIds` array.
 * Sends a MEMBER_JOINED notification to existing group members for each new member.
 */
export const notifyMemberJoined = onDocumentUpdated(
  "groups/{groupId}",
  async (event) => {
    const before = event.data?.before.data() as Group | undefined;
    const after = event.data?.after.data() as Group | undefined;
    const groupId = event.params.groupId;

    if (!before || !after) {
      logger.info("Group data missing, exiting notifyMemberJoined.");
      return;
    }

    const beforeMembers = before.memberIds || [];
    const afterMembers = after.memberIds || [];

    // Find users who are in 'after' but not in 'before'
    const newMemberIds = afterMembers.filter((id) => !beforeMembers.includes(id));

    if (newMemberIds.length === 0) {
      logger.info(`No new members added to group ${groupId}.`);
      return;
    }

    // Existing members who should receive the notification
    const existingMemberIds = beforeMembers;

    if (existingMemberIds.length === 0) {
      logger.info(`No existing members to notify in group ${groupId}.`);
      return;
    }

    try {
      // We need to fetch user data for the existing members to get their FCM tokens
      // and user data for new members to get their display names.
      // Fetch all relevant users in one go (chunked if > 30, but usually group size is small)
      const allRelevantIds = [...new Set([...existingMemberIds, ...newMemberIds])];

      const usersData = new Map<string, User>();

      // Firestore 'in' query supports up to 30 items. Split if needed.
      for (let i = 0; i < allRelevantIds.length; i += 30) {
        const chunk = allRelevantIds.slice(i, i + 30);
        const usersSnapshot = await db
          .collection("users")
          .where(admin.firestore.FieldPath.documentId(), "in", chunk)
          .get();

        usersSnapshot.forEach((doc) => {
          usersData.set(doc.id, doc.data() as User);
        });
      }

      const notifications: Promise<void>[] = [];

      // For each new member, notify all existing members
      for (const newMemberId of newMemberIds) {
        const newMemberData = usersData.get(newMemberId);
        if (!newMemberData) {
          logger.warn(`User data not found for new member ${newMemberId}.`);
          continue;
        }

        const newMemberName = newMemberData.displayName || "新しいメンバー";
        logger.info(`User ${newMemberId} joined group ${groupId}. Sending notifications.`);

        for (const existingMemberId of existingMemberIds) {
          // Double check so we don't notify the new member themselves
          if (existingMemberId === newMemberId) continue;

          const targetUserData = usersData.get(existingMemberId);
          if (!targetUserData) continue;

          const notificationPromise = sendAndSaveNotification({
            targetUserId: existingMemberId,
            fcmToken: targetUserData.fcmToken,
            type: "MEMBER_JOINED",
            title: "新規メンバー参加",
            body: `${newMemberName}さんがグループに参加しました。`,
            senderId: newMemberId,
            targetId: groupId,
          });

          notifications.push(notificationPromise);
        }
      }

      if (notifications.length > 0) {
        await Promise.all(notifications);
        logger.info(`MEMBER_JOINED notifications sent for group ${groupId}`);
      }
    } catch (error) {
      logger.error("Failed to send MEMBER_JOINED notifications:", error);
    }
  }
);
