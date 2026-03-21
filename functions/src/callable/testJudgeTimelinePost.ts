import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { judgeTimelinePostLogic } from "../triggers/judgeTimelinePost";
import { Timeline } from "../common/types";

const db = admin.firestore();

export const testJudgeTimelinePost = onCall(
  async (request) => {
    // Optional: Authenticate the user if needed for local testing
    // if (!context.auth) {
    //   throw new functions.https.HttpsError(
    //     "unauthenticated",
    //     "User must be authenticated to call this function."
    //   );
    // }

    const { postId } = request.data;

    if (!postId) {
      throw new HttpsError(
        "invalid-argument",
        "The 'postId' argument is required."
      );
    }

    try {
      const timelineDoc = await db.collection("timelines").doc(postId).get();

      if (!timelineDoc.exists) {
        throw new HttpsError(
          "not-found",
          `Timeline post with ID ${postId} not found.`
        );
      }

      const timelineData = timelineDoc.data() as Timeline;

      logger.info(`Manually triggering AI judgment for postId: ${postId}`);
      await judgeTimelinePostLogic(postId, timelineData);

      return { success: true, message: `AI judgment triggered for post ${postId}.` };
    } catch (error) {
      logger.error(`Error triggering AI judgment for post ${postId}:`, error);
      throw new HttpsError(
        "internal",
        `Failed to trigger AI judgment: ${error}`
      );
    }
  }
);
