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
