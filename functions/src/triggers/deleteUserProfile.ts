import * as admin from "firebase-admin";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import { User } from "../common/types";
import { getStorage } from "firebase-admin/storage";

const db = admin.firestore();
const storage = getStorage();

/**
 * Triggered when a user's `isDeleted` flag is set to true.
 * This function handles the deletion of associated user data.
 */
export const deleteUserProfile = onDocumentUpdated("users/{userId}", async (event) => {
  const before = event.data?.before.data() as User | undefined;
  const after = event.data?.after.data() as User | undefined;
  const userId = event.params.userId;

  if (!before || !after) {
    logger.info("User data is missing for deletion, exiting.");
    return;
  }

  // Only proceed if the user is marked as deleted and was not deleted before
  if (after.isDeleted === true && before.isDeleted !== true) {
    logger.info(`User ${userId} marked for deletion. Starting deletion process.`);
    try {
      // 1. Delete user's profile photo from Storage if it exists and is not an external URL
      const photoUrl = before.photoUrl;
      if (photoUrl && photoUrl.includes("firebasestorage.googleapis.com")) {
        try {
          // Regex to decode and extract file path (full path) from URL
          // Example: .../o/profile_images%2Fuser123.jpg?alt=... -> profile_images/user123.jpg
          const match = photoUrl.match(/\/o\/(.+?)\?/);
          if (match && match[1]) {
            const filePath = decodeURIComponent(match[1]);
            const bucket = storage.bucket(); // Use default bucket
            await bucket.file(filePath).delete();
            logger.info(`Successfully deleted Storage image for user ${userId}: ${filePath}`);
          }
        } catch (error) {
          logger.warn(`Failed to delete Storage image for user ${userId}. Skipping: ${error}`);
        }
      } else if (photoUrl) {
        logger.info(`Skipping Storage image deletion for user ${userId} as it's an external URL or not found.`);
      }

      // 2. Remove user from any groups they are a member of
      const groupsSnapshot = await db.collection("groups")
        .where("members", "array-contains", userId).get();

      const batch = db.batch();
      groupsSnapshot.forEach((doc) => {
        batch.update(doc.ref, {
          members: admin.firestore.FieldValue.arrayRemove(userId),
        });
      });
      await batch.commit();
      logger.info(`Successfully removed user ${userId} from groups.`);

      // 3. Delete the user from Firebase Authentication
      await admin.auth().deleteUser(userId);
      logger.info(`Successfully deleted user ${userId} from Firebase Auth.`);
    } catch (error) {
      logger.error(`Error during deletion process for user ${userId}:`, error);
    }
  } else {
    logger.info(`User ${userId} update does not trigger deletion.`);
  }
});
