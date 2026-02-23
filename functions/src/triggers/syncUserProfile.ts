import * as admin from "firebase-admin";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import { User } from "../common/types";

const db = admin.firestore();

/**
 * Function 1: Sync denormalized user profile data across the database.
 * Triggered when a user's profile is updated.
 */
export const syncUserProfile = onDocumentUpdated("users/{userId}", async (event) => {
  const before = event.data?.before.data() as User | undefined;
  const after = event.data?.after.data() as User | undefined;
  const userId = event.params.userId;

  if (!before || !after) {
    logger.info("User data is missing, exiting.");
    return;
  }

  const hasProfileChanged =
    before.displayName !== after.displayName || before.photoUrl !== after.photoUrl;

  if (!hasProfileChanged) {
    logger.info(`User profile for ${userId} has not changed, exiting.`);
    return;
  }

  logger.info(`User profile for ${userId} changed, starting sync.`);

  const updateData = {
    "author.displayName": after.displayName,
    "author.photoUrl": after.photoUrl || null,
  };

  const batchCommit = async (batch: admin.firestore.WriteBatch) => {
    await batch.commit();
    return db.batch(); // Return a new batch
  };

  try {
    let batch = db.batch();
    let writeCount = 0;

    // 1. Update user's posts in 'timelines'
    const timelinesQuery = db.collection("timelines").where("userId", "==", userId);
    const timelinesSnap = await timelinesQuery.get();
    for (const doc of timelinesSnap.docs) {
      batch.update(doc.ref, updateData);
      writeCount++;
      if (writeCount >= 500) {
        batch = await batchCommit(batch);
        writeCount = 0;
      }
    }

    // 2. Update user's comments across all timelines
    const commentsQuery = db.collectionGroup("comments").where("userId", "==", userId);
    const commentsSnap = await commentsQuery.get();
    for (const doc of commentsSnap.docs) {
      batch.update(doc.ref, updateData);
      writeCount++;
      if (writeCount >= 500) {
        batch = await batchCommit(batch);
        writeCount = 0;
      }
    }

    // Commit any remaining writes
    if (writeCount > 0) {
      await batch.commit();
    }

    logger.info(`Successfully synced profile for user ${userId}.`);
  } catch (error) {
    logger.error(`Error syncing profile for user ${userId}:`, error);
  }
});
