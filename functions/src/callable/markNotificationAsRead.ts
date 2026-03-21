import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";

export const markNotificationAsRead = onCall(async (request) => {
  // 1. 認証チェック
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "The function must be called while authenticated."
    );
  }

  // 2. パラメータチェック
  const { notificationId } = request.data;
  if (!notificationId || typeof notificationId !== "string") {
    throw new HttpsError(
      "invalid-argument",
      "The function must be called with a valid 'notificationId'."
    );
  }

  const uid = request.auth.uid;
  const db = admin.firestore();

  // 3. Firestoreの更新処理
  try {
    const notificationRef = db
      .collection("users")
      .doc(uid)
      .collection("notifications")
      .doc(notificationId);

    // ドキュメントが存在するか確認（更新前にエラーを出すために必要なら。今回はupdateでエラーになるのでキャッチする）
    // update はドキュメントが存在しない場合にエラーになります
    await notificationRef.update({ isRead: true });

    // 4. 戻り値
    return { success: true };
  } catch (error: unknown) {
    // 存在するドキュメントがない場合のエラーハンドリング
    if (error && typeof error === "object" && "code" in error) {
      if ((error as { code: number }).code === 5) {
        // 5 is NOT_FOUND in gRPC status codes used by Firestore
        throw new HttpsError(
          "not-found",
          "The requested notification does not exist."
        );
      }
    }

    // その他のエラー
    logger.error("Error marking notification as read:", error);
    throw new HttpsError(
      "internal",
      `An error occurred while updating the notification: ${error}`
    );
  }
});
