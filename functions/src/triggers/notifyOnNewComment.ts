import * as admin from "firebase-admin";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import { User, Timeline, Comment } from "../common/types";

const db = admin.firestore();
const messaging = admin.messaging();

/**
 * Function 2: Send a push notification when a new comment is posted.
 * Triggered when a new document is created in a 'comments' subcollection.
 */
export const notifyOnNewComment = onDocumentCreated(
  "timelines/{postId}/comments/{commentId}",
  async (event) => {
    const commentData = event.data?.data() as Comment | undefined;
    const postId = event.params.postId;

    if (!commentData) {
      logger.info("Comment data is missing, exiting.");
      return;
    }

    const commentAuthorId = commentData.userId;

    try {
      // Get the parent timeline post
      const timelineDoc = await db.collection("timelines").doc(postId).get();
      const timelineData = timelineDoc.data() as Timeline | undefined;

      if (!timelineData) {
        logger.error(`Timeline post ${postId} not found.`);
        return;
      }

      const postAuthorId = timelineData.userId;

      // Do not send notification if the author comments on their own post
      if (commentAuthorId === postAuthorId) {
        logger.info("Author commented on their own post, no notification needed.");
        return;
      }

      // Get the post author's user document to find their FCM token
      const userDoc = await db.collection("users").doc(postAuthorId).get();
      const userData = userDoc.data() as User | undefined;

      if (userData?.fcmToken) {
        const message: admin.messaging.Message = {
          token: userData.fcmToken,
          notification: {
            title: "あなたの投稿にコメントがつきました！",
            body: commentData.text,
          },
        };

        await messaging.send(message);
        logger.info(`Notification sent to user ${postAuthorId}.`);
      } else {
        logger.info(`User ${postAuthorId} has no FCM token, no notification sent.`);
      }
    } catch (error) {
      logger.error(`Error sending comment notification for post ${postId}:`, error);
    }
  }
);
