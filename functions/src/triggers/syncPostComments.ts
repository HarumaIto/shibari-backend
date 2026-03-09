import * as admin from "firebase-admin";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";

const db = admin.firestore();

/**
 * Triggered when a comment is added, updated, or deleted.
 * Syncs the comment count and the latest 3 comments to the parent post document.
 */
export const syncPostComments = onDocumentWritten(
  "posts/{postId}/comments/{commentId}",
  async (event) => {
    const postId = event.params.postId;
    const beforeExists = event.data?.before?.exists;
    const afterExists = event.data?.after?.exists;

    // Determine count change
    let incrementValue = 0;
    if (!beforeExists && afterExists) {
      // Created
      incrementValue = 1;
    } else if (beforeExists && !afterExists) {
      // Deleted
      incrementValue = -1;
    }

    try {
      // Fetch latest 3 comments (newest first)
      const commentsSnapshot = await db
        .collection("timelines")
        .doc(postId)
        .collection("comments")
        .orderBy("createdAt", "desc")
        .limit(3)
        .get();

      // Format them and reverse the array to display from oldest to newest among the latest 3
      const latestComments = commentsSnapshot.docs
        .map((doc) => {
          const data = doc.data();
          const authorName = data.author.displayName ?? "不明";
          const text = data.text ?? "";
          return `${authorName}: ${text}`;
        })
        .reverse();

      // Prepare update payload
      const updateData: Record<string, unknown> = {
        latestComments,
      };

      if (incrementValue !== 0) {
        updateData.commentCount = admin.firestore.FieldValue.increment(incrementValue);
      }

      // Update the parent post document
      // Use set with merge: true to avoid errors if the parent document somehow doesn't exist
      await db.collection("timelines").doc(postId).set(updateData, { merge: true });

      logger.info(`Successfully synced comment data for post ${postId}`);
    } catch (error) {
      logger.error(`Error syncing comment data for post ${postId}:`, error);
    }
  }
);
