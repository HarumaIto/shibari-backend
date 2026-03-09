import * as admin from "firebase-admin";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const serviceAccount = require("./serviceAccountKey.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
});

const db = admin.firestore();

/**
 * 既存の投稿ドキュメントにcommentCountとlatestCommentsを付与するマイグレーションスクリプト。
 */
async function migratePosts() {
  console.log("🚀 マイグレーションを開始します...");

  try {
    // 1. postsコレクションの全ドキュメントを取得
    const postsSnapshot = await db.collection("timelines").get();
    console.log(`📄 処理対象の投稿数: ${postsSnapshot.size}件`);

    let batch = db.batch();
    let operationCount = 0;
    let totalUpdatedCount = 0;

    for (const postDoc of postsSnapshot.docs) {
      const postId = postDoc.id;

      // 2. 該当投稿のcommentsサブコレクションを取得（新しい順に並び替え）
      const commentsSnapshot = await db.collection("timelines")
        .doc(postId)
        .collection("comments")
        .orderBy("createdAt", "desc")
        .get();

      // コメント数を取得
      const commentCount = commentsSnapshot.size;

      // 最新3件のコメントを抽出し、文字列の配列に変換
      const latestComments: string[] = [];
      const previewLimit = Math.min(commentCount, 3); // 最大3件

      for (let i = 0; i < previewLimit; i++) {
        const commentData = commentsSnapshot.docs[i].data();
        const authorName = commentData.author.displayName || "名無し";
        const text = commentData.text || "";
        // "ユーザー名: コメント内容" の形式に整形
        latestComments.push(`${authorName}: ${text}`);
      }

      // 3. バッチに更新処理を積む
      batch.update(postDoc.ref, {
        commentCount: commentCount,
        latestComments: latestComments,
      });

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

    // 5. ループ終了後、500件に満たなかった残りのバッチをコミット
    if (operationCount > 0) {
      await batch.commit();
      console.log(`✅ 残りの ${operationCount}件コミット完了 (合計: ${totalUpdatedCount}件)`);
    }

    console.log("🎉 すべてのマイグレーションが正常に完了しました！");
  } catch (error) {
    console.error("❌ マイグレーション中にエラーが発生しました:", error);
  }
}

// スクリプトの実行
migratePosts();
