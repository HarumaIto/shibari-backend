import * as admin from "firebase-admin";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import { Timeline, Quest, User } from "../common/types";
import { sendAndSaveNotification } from "../common/sendAndSaveNotification";

const db = admin.firestore();

/**
 * Returns true if the two votes maps differ in any entry.
 * @param {Record<string, string>} before - Votes before the update.
 * @param {Record<string, string>} after - Votes after the update.
 * @return {boolean} Whether any vote entry changed.
 */
function votesChanged(
  before: Record<string, string>,
  after: Record<string, string>
): boolean {
  const beforeKeys = Object.keys(before);
  const afterKeys = Object.keys(after);
  if (beforeKeys.length !== afterKeys.length) return true;
  for (const key of afterKeys) {
    if (before[key] !== after[key]) return true;
  }
  return false;
}

/**
 * Triggered when a timeline document is updated.
 * If the `votes` map changed, recalculates `approvalCount`, `rejectCount`, and
 * `status` server-side, then writes the new values back.
 * Also sends QUEST_APPROVED / QUEST_REJECTED push notifications when the
 * status transitions for the first time.
 */
export const updateTimelineStatus = onDocumentUpdated(
  "timelines/{postId}",
  async (event) => {
    const before = event.data?.before.data() as Timeline | undefined;
    const after = event.data?.after.data() as Timeline | undefined;
    const postId = event.params.postId;

    if (!before || !after) {
      logger.info("Timeline data missing, exiting updateTimelineStatus.");
      return;
    }

    const beforeVotes = (before.votes ?? {}) as Record<string, string>;
    const afterVotes = (after.votes ?? {}) as Record<string, string>;

    // Only proceed when the votes map has actually changed
    if (!votesChanged(beforeVotes, afterVotes)) {
      logger.info(`No vote changes detected for post ${postId}, skipping.`);
      return;
    }

    // Tally votes
    const approvalCount = Object.values(afterVotes).filter(
      (v) => v === "APPROVE"
    ).length;
    const rejectCount = Object.values(afterVotes).filter(
      (v) => v === "REJECT"
    ).length;

    // Fetch the quest to determine the approval threshold (default: 1)
    let threshold = 1;
    try {
      const questDoc = await db.collection("quests").doc(after.questId).get();
      if (questDoc.exists) {
        const questData = questDoc.data() as Quest;
        if (questData.threshold != null) {
          threshold = questData.threshold;
        }
      }
    } catch (error) {
      logger.error(
        `Failed to fetch quest ${after.questId} for post ${postId}:`,
        error
      );
    }

    // Determine new status
    let newStatus: "PENDING" | "APPROVE" | "REJECT" = "PENDING";
    if (approvalCount >= threshold) {
      newStatus = "APPROVE";
    } else if (rejectCount >= threshold) {
      newStatus = "REJECT";
    }

    // Guard: skip write when nothing would change
    if (
      after.approvalCount === approvalCount &&
      after.rejectCount === rejectCount &&
      after.status === newStatus
    ) {
      logger.info(`No field changes needed for post ${postId}, skipping.`);
      return;
    }

    // Persist updated counts and status
    try {
      await db.collection("timelines").doc(postId).update({
        approvalCount,
        rejectCount,
        status: newStatus,
      });
      logger.info(
        `Updated post ${postId}: approvalCount=${approvalCount}, ` +
          `rejectCount=${rejectCount}, status=${newStatus}`
      );
    } catch (error) {
      logger.error(`Failed to update timeline ${postId}:`, error);
      throw error;
    }

    // ---- Notifications on status transitions ----

    const prevStatus = before.status ?? "PENDING";

    if (newStatus === prevStatus) return; // status did not change

    // Find the user whose vote triggered the transition (must match the new status)
    let actorId: string | undefined;
    for (const [uid, vote] of Object.entries(afterVotes)) {
      if (vote === newStatus && beforeVotes[uid] !== newStatus) {
        actorId = uid;
        break;
      }
    }

    const targetUserId = after.userId;

    try {
      const userDoc = await db.collection("users").doc(targetUserId).get();
      if (!userDoc.exists) {
        logger.warn(
          `User ${targetUserId} not found, skipping notification for post ${postId}.`
        );
        return;
      }
      const userData = userDoc.data() as User;

      if (newStatus === "APPROVE" && prevStatus !== "APPROVE") {
        await sendAndSaveNotification({
          targetUserId,
          fcmToken: userData.fcmToken,
          type: "QUEST_APPROVED",
          title: "承認されました",
          body: "あなたの提出したクエストが承認されました！",
          senderId: actorId,
          targetId: postId,
        });
        logger.info(
          `QUEST_APPROVED notification sent to user ${targetUserId} for post ${postId}`
        );
      } else if (newStatus === "REJECT" && prevStatus !== "REJECT") {
        await sendAndSaveNotification({
          targetUserId,
          fcmToken: userData.fcmToken,
          type: "QUEST_REJECTED",
          title: "却下されました",
          body: "提出したクエストが却下されました。確認してください。",
          senderId: actorId,
          targetId: postId,
        });
        logger.info(
          `QUEST_REJECTED notification sent to user ${targetUserId} for post ${postId}`
        );
      }
    } catch (error) {
      logger.error(
        `Failed to send status notification for post ${postId}:`,
        error
      );
    }
  }
);
