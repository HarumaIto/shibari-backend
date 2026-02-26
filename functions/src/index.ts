import * as admin from "firebase-admin";

admin.initializeApp();

import { syncUserProfile } from "./triggers/syncUserProfile";
import { deleteUserProfile } from "./triggers/deleteUserProfile";
import { notifyOnNewComment } from "./triggers/notifyOnNewComment";
import { dailyReminder } from "./triggers/dailyReminder";
import { notifyOnNewTimelinePost } from "./triggers/notifyOnNewTimelinePost";

export {
  syncUserProfile,
  deleteUserProfile,
  notifyOnNewComment,
  dailyReminder,
  notifyOnNewTimelinePost,
};
