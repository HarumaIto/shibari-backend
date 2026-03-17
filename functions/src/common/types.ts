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

export interface QuestEmbed {
  title: string;
  type: string;
}

export interface AiJudgment {
  result: "PASS" | "FAIL" | "UNKNOWN";
  reason: string;
  judgedAt: admin.firestore.Timestamp;
}

export interface Timeline {
  userId: string;
  questId: string;
  groupId: string;
  author: Author;
  quest?: QuestEmbed;
  mediaUrl: string;
  mediaType: string;
  comment: string;
  status?: "PENDING" | "APPROVE" | "REJECT";
  approvalCount?: number;
  rejectCount?: number;
  votes?: Record<string, "APPROVE" | "REJECT">; // key: uid, value: status
  aiJudgment?: AiJudgment;
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
  createdAt: admin.firestore.FieldValue | admin.firestore.Timestamp; // サーバータイムスタンプ
}

export interface Group {
  memberIds: string[];
}
