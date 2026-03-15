# Firebase Functions プロジェクト

このプロジェクトには、アプリケーション用のFirebase Functionsが含まれています。

## マイグレーションスクリプト

このディレクトリには、Firestoreのデータを更新するために使用できるマイグレーションスクリプトが含まれています。

**重要:** マイグレーションスクリプトを実行する前に、`scripts/`ディレクトリに`serviceAccountKey.json`ファイルがあること、およびFirebaseプロジェクトが正しく構成されていることを確認してください。

### マイグレーションスクリプトの実行方法

マイグレーションスクリプトを実行するには、`functions`ディレクトリに移動し、`npx ts-node`の後にスクリプトへのパスを指定して実行します。

例:

- **投稿のマイグレーション (commentCount, latestComments):**
  ```bash
  npx ts-node scripts/migratePosts.ts
  ```

- **ステータスカウントのマイグレーション (approvalCount, rejectCount):**
  ```bash
  npx ts-node scripts/migrateStatusCount.ts
  ```
