import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { sendAndSaveNotification } from "./sendAndSaveNotification";
import { User } from "./types";

const db = admin.firestore();

/**
 * メンバー追加 (MEMBER_JOINED) 通知を送信する
 * @param {string} newMemberId - 参加したユーザーのID
 * @param {string} newMemberName - 参加したユーザーの名前
 * @param {string} groupId - 参加したグループのID
 */
export const notifyMemberJoined = async (
  newMemberId: string,
  newMemberName: string,
  groupId: string
): Promise<void> => {
  try {
    // 1. Get all members in the group except the new member
    const usersSnapshot = await db
      .collection("users")
      .where("groupId", "==", groupId)
      .get();

    const notifications: Promise<void>[] = [];

    usersSnapshot.forEach((doc) => {
      const targetUserId = doc.id;
      if (targetUserId === newMemberId) return;

      const userData = doc.data() as User;
      const fcmToken = userData.fcmToken;

      const notificationPromise = sendAndSaveNotification({
        targetUserId,
        fcmToken,
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
};

/**
 * クエスト承認 (QUEST_APPROVED) 通知を送信する
 * @param {string} targetUserId - クエストを提出したユーザー(承認されるユーザー)のID
 * @param {string} approverId - 承認したユーザーのID
 * @param {string} postId - 承認された投稿(Timeline)のID
 */
export const notifyQuestApproved = async (
  targetUserId: string,
  approverId: string,
  postId: string
): Promise<void> => {
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
      senderId: approverId,
      targetId: postId,
    });

    logger.info(`QUEST_APPROVED notification sent to user ${targetUserId} for post ${postId}`);
  } catch (error) {
    logger.error("Failed to send QUEST_APPROVED notification:", error);
  }
};

/**
 * クエスト却下 (QUEST_REJECTED) 通知を送信する
 * @param {string} targetUserId - クエストを提出したユーザー(却下されるユーザー)のID
 * @param {string} rejectorId - 却下したユーザーのID
 * @param {string} postId - 却下された投稿(Timeline)のID
 */
export const notifyQuestRejected = async (
  targetUserId: string,
  rejectorId: string,
  postId: string
): Promise<void> => {
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
      senderId: rejectorId,
      targetId: postId,
    });

    logger.info(`QUEST_REJECTED notification sent to user ${targetUserId} for post ${postId}`);
  } catch (error) {
    logger.error("Failed to send QUEST_REJECTED notification:", error);
  }
};
