import * as admin from "firebase-admin";

admin.initializeApp();

import { syncUserProfile } from "./triggers/syncUserProfile";
import { notifyOnNewComment } from "./triggers/notifyOnNewComment";
import { dailyReminder } from "./triggers/dailyReminder";
import { notifyOnNewTimelinePost } from "./triggers/notifyOnNewTimelinePost";

export {
  syncUserProfile,
  notifyOnNewComment,
  dailyReminder,
  notifyOnNewTimelinePost,
};
