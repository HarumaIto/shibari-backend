import * as admin from "firebase-admin";

export interface User {
  displayName: string;
  photoUrl: string;
  fcmToken?: string;
  groupId?: string;
  participatingQuestIds?: string[];
}

export interface Author {
  userId: string;
  displayName: string;
  photoUrl: string;
}

export interface Timeline {
  author: Author;
  createdAt: admin.firestore.Timestamp;
  // other fields...
}

export interface Comment {
  author: Author;
  text: string;
  // other fields...
}
