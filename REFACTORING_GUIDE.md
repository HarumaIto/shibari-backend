# 既存の通知機能の修正方針 (ビフォーアフター)

今回の改修により、FCMで直接通知を送信していた箇所を、共通関数 `sendAndSaveNotification` を用いて「Firestoreへの保存＋FCMへの送信」に置き換えることができます。
以下に、対象となる既存の各トリガー関数について修正のビフォーアフター（例）を示します。

---

## 1. クエスト投稿 (`notifyOnNewTimelinePost.ts` / `QUEST_POSTED`)

グループメンバー全員に投稿の通知を送る処理です。現在は `admin.messaging().sendEachForMulticast(message)` を使って一括でFCM送信を行っていますが、各ユーザーのFirestoreにも通知ドキュメントを作成するため、`sendAndSaveNotification` をループで呼び出す形に変更します。

### 修正前 (Before)
```typescript
      const tokens: string[] = [];
      usersSnapshot.forEach((doc) => {
        const userData = doc.data() as User;
        // Don't notify the author and ensure token exists
        if (doc.id !== userId && userData.fcmToken) {
          tokens.push(userData.fcmToken);
        }
      });

      if (tokens.length === 0) { ... return; }

      const message: admin.messaging.MulticastMessage = {
        tokens: tokens,
        notification: {
          title: "グループに新しい投稿がありました！",
          body: `${author.displayName}さんが新しく投稿しました。`,
        },
      };

      const response = await messaging.sendEachForMulticast(message);
```

### 修正後 (After)
```typescript
      import { sendAndSaveNotification } from "../common/sendAndSaveNotification";

      const notifications: Promise<void>[] = [];

      usersSnapshot.forEach((doc) => {
        const targetUserId = doc.id;
        if (targetUserId === userId) return; // 投稿者本人には通知しない

        const userData = doc.data() as User;

        // トークンが無くてもFirestoreには保存するため、fcmTokenの有無にかかわらず呼び出す
        const notificationPromise = sendAndSaveNotification({
          targetUserId,
          fcmToken: userData.fcmToken,
          type: "QUEST_POSTED",
          title: "グループに新しい投稿がありました！",
          body: `${author.displayName}さんが新しく投稿しました。`,
          senderId: userId,
          targetId: event.params.postId, // 投稿のIDを遷移先とする
        });

        notifications.push(notificationPromise);
      });

      await Promise.all(notifications);
      logger.info(`QUEST_POSTED notifications sent for group ${groupId}.`);
```

---

## 2. コメント追加 (`notifyOnNewComment.ts` / `COMMENT_ADDED`)

自分の投稿に対してコメントがついた時に通知する処理です。現在は対象ユーザー（投稿者）へ `messaging.send(message)` でFCMのみ送信しています。

### 修正前 (Before)
```typescript
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
```

### 修正後 (After)
```typescript
      import { sendAndSaveNotification } from "../common/sendAndSaveNotification";

      // トークンの有無に関わらず、Firestoreに通知を保存する
      await sendAndSaveNotification({
        targetUserId: postAuthorId,
        fcmToken: userData?.fcmToken,
        type: "COMMENT_ADDED",
        title: "あなたの投稿にコメントがつきました！",
        body: commentData.text,
        senderId: commentAuthorId,
        targetId: postId,
      });

      logger.info(`Notification logic completed for user ${postAuthorId}.`);
```

---

## 3. クエスト未達成リマインド (`dailyReminder.ts` / `QUEST_REMINDER`)

本日のノルマを達成していないユーザーに対して一括で送信する処理です。これも投稿通知と同様に `sendEachForMulticast` から `sendAndSaveNotification` の並列実行に変更します。

### 修正前 (Before)
```typescript
      const fcmTokensToNotify: string[] = [];

      for await (const userDoc of usersStream) {
        const user = userDoc.data();
        // ... 通知条件の判定 ...
        if (shouldNotify && user.fcmToken) {
          fcmTokensToNotify.push(user.fcmToken);
        }
      }

      if (fcmTokensToNotify.length > 0) {
        const message = {
          notification: {
            title: "🚨 本日のノルマ未達成",
            body: "証拠の提出がまだ確認されていません。チームメンバーが監視しています！",
          },
          tokens: fcmTokensToNotify,
        };
        const response = await messaging.sendEachForMulticast(message);
      }
```

### 修正後 (After)
```typescript
      import { sendAndSaveNotification } from "../common/sendAndSaveNotification";

      const notifications: Promise<void>[] = [];

      for await (const userDoc of usersStream) {
        const user = userDoc.data() as User;
        // ... 通知条件の判定 ...

        // FCMトークンがなくても、DBにはリマインド通知を保存する
        if (shouldNotify) {
          const targetUserId = userDoc.id;
          const notificationPromise = sendAndSaveNotification({
            targetUserId,
            fcmToken: user.fcmToken,
            type: "QUEST_REMINDER",
            title: "🚨 本日のノルマ未達成",
            body: "証拠の提出がまだ確認されていません。チームメンバーが監視しています！",
            // targetId: questId を入れたい場合はループ内で対象となったquestIdを保持して渡す
          });
          notifications.push(notificationPromise);
        }
      }

      if (notifications.length > 0) {
        await Promise.all(notifications);
        logger.info(`Successfully processed ${notifications.length} reminder notifications.`);
      } else {
        logger.info("No users to remind today.");
      }
```
