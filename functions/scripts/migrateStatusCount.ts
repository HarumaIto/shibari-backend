import * as admin from "firebase-admin";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const serviceAccount = require("./serviceAccountKey.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
});

const db = admin.firestore();

/**
 * 既存の投稿ドキュメントのvotesフィールドからapprovalCountとrejectCountを計算し、
 * 付与または更新するマイグレーションスクリプト。
 */
async function migrateStatusCount() {
  console.log("🚀 approvalCountとrejectCountのマイグレーションを開始します...");

  try {
    // 1. timelinesコレクションの全ドキュメントを取得
    const postsSnapshot = await db.collection("timelines").get();
    console.log(`📄 処理対象の投稿数: ${postsSnapshot.size}件`);

    let batch = db.batch();
    let operationCount = 0;
    let totalUpdatedCount = 0;

    for (const postDoc of postsSnapshot.docs) {
      const postData = postDoc.data();
      const updateData: { [key: string]: number } = {};
      let needsUpdate = false;

      const votes = (postData.votes ?? {}) as Record<string, string>;

      const approvalCount = Object.values(votes).filter(
        (v) => v === "APPROVE"
      ).length;
      const rejectCount = Object.values(votes).filter(
        (v) => v === "REJECT"
      ).length;

      // approvalCountが現在の値と異なる場合、または存在しない場合に更新
      if (postData.approvalCount !== approvalCount) {
        updateData.approvalCount = approvalCount;
        needsUpdate = true;
      }

      // rejectCountが現在の値と異なる場合、または存在しない場合に更新
      if (postData.rejectCount !== rejectCount) {
        updateData.rejectCount = rejectCount;
        needsUpdate = true;
      }

      if (needsUpdate) {
        batch.update(postDoc.ref, updateData);
        operationCount++;
        totalUpdatedCount++;

        // 4. Firestoreのバッチ上限（500件）に達したらコミット
        if (operationCount === 500) {
          await batch.commit();
          console.log(`✅ 500件コミット完了 (合計: ${totalUpdatedCount}件)`);
          // バッチとカウンターをリセット
          batch = db.batch();
          operationCount = 0;
        }
      }
    }

    // 5. ループ終了後、500件に満たなかった残りのバッチをコミット
    if (operationCount > 0) {
      await batch.commit();
      console.log(`✅ 残りの ${operationCount}件コミット完了 (合計: ${totalUpdatedCount}件)`);
    }

    console.log("🎉 すべてのapprovalCountとrejectCountのマイグレーションが正常に完了しました！");
  } catch (error) {
    console.error("❌ approvalCountとrejectCountのマイグレーション中にエラーが発生しました:", error);
  }
}

// スクリプトの実行
migrateStatusCount();
