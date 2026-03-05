import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { AppNotification, NotificationType } from "./types";

const db = admin.firestore();
const messaging = admin.messaging();

export interface SendNotificationParams {
  targetUserId: string;
  fcmToken?: string;
  type: NotificationType;
  title: string;
  body: string;
  senderId?: string;
  targetId?: string;
}

/**
 * Saves a notification to Firestore and sends it via FCM.
 * @param {SendNotificationParams} params - The parameters for the notification.
 */
export const sendAndSaveNotification = async (params: SendNotificationParams): Promise<void> => {
  const { targetUserId, fcmToken, type, title, body, senderId, targetId } = params;

  try {
    // 1. Save to Firestore
    const notificationsRef = db.collection(`users/${targetUserId}/notifications`);
    const newDocRef = notificationsRef.doc();

    const notificationData: AppNotification = {
      id: newDocRef.id,
      type,
      title,
      body,
      isRead: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (senderId) notificationData.senderId = senderId;
    if (targetId) notificationData.targetId = targetId;

    await newDocRef.set(notificationData);
    logger.info(`Notification saved to Firestore for user ${targetUserId}, notificationId: ${newDocRef.id}`);

    // 2. Send via FCM if token exists
    if (fcmToken) {
      const message: admin.messaging.Message = {
        token: fcmToken,
        notification: {
          title,
          body,
        },
        data: {
          type,
          notificationId: newDocRef.id,
          ...(senderId && { senderId }),
          ...(targetId && { targetId }),
        },
      };

      await messaging.send(message);
      logger.info(`FCM Notification sent to user ${targetUserId}`);
    } else {
      logger.info(`User ${targetUserId} has no FCM token, skipped FCM sending.`);
    }
  } catch (error) {
    logger.error(`Failed to send and save notification for user ${targetUserId}:`, error);
  }
};
