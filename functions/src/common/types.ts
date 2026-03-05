import * as admin from "firebase-admin";

export interface User {
  displayName: string;
  photoUrl: string;
  fcmToken?: string;
  groupId?: string;
  participatingQuestIds?: string[];
  blockedUserIds: string[];
  isDeleted: boolean;
}

export interface Author {
  displayName: string;
  photoUrl: string;
}

export interface Timeline {
  userId: string;
  questId: string;
  groupId: string;
  author: Author;
  mediaUrl: string;
  mediaType: string;
  comment: string;
  status?: "PENDING" | "APPROVED" | "REJECTED";
  votes?: Record<string, "APPROVED" | "REJECTED">; // key: uid, value: status
  createdAt: admin.firestore.Timestamp;
}

export interface Comment {
  userId: string;
  author: Author;
  text: string;
  createdAt: admin.firestore.Timestamp;
}

export interface Quest {
  description: string;
  frequency: string;
  groupId: string;
  threshold: number;
  title: string;
  type: string;
}

export type NotificationType =
  | "MEMBER_JOINED"
  | "QUEST_POSTED"
  | "COMMENT_ADDED"
  | "QUEST_REMINDER"
  | "QUEST_APPROVED"
  | "QUEST_REJECTED";

export interface AppNotification {
  id: string; // ドキュメントIDと同じ
  type: NotificationType;
  title: string;
  body: string;
  senderId?: string; // アクションを起こしたユーザーID
  targetId?: string; // 遷移先ID (groupId, postId, questIdなど)
  isRead: boolean; // 初期値は false
  createdAt: admin.firestore.FieldValue; // サーバータイムスタンプ
}
