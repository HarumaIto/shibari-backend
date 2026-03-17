import * as admin from "firebase-admin";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import { genkit } from "genkit";
import { googleAI, gemini20Flash } from "@genkit-ai/googleai";
import { Timeline, Quest, AiJudgment } from "../common/types";

const db = admin.firestore();

const ai = genkit({ plugins: [googleAI()] });

const JUDGEABLE_QUEST_TYPES = ["PROHIBITION", "CHALLENGE", "ROUTINE"];
const MAX_FALLBACK_REASON_LENGTH = 200;

/**
 * Builds a prompt for the AI to judge whether the image satisfies the quest.
 * @param {string} questType - The type of the quest (PROHIBITION, CHALLENGE, or ROUTINE).
 * @param {string} questTitle - The title of the quest.
 * @param {string} questDescription - The description / conditions of the quest.
 * @return {string} The prompt string.
 */
function buildPrompt(
  questType: string,
  questTitle: string,
  questDescription: string
): string {
  if (questType === "PROHIBITION") {
    return (
      "あなたは行動監視AIです。以下の禁止クエストの条件を読み、添付された画像が" +
      "その禁止事項を守れているかどうかを判定してください。\n\n" +
      `クエスト名: ${questTitle}\n` +
      `禁止条件: ${questDescription}\n\n` +
      "画像を確認し、禁止条件が守られている場合は \"APPROVE\"、" +
      "守られていない場合は \"REJECT\"、判断できない場合は \"UNKNOWN\" と回答してください。" +
      "また、判定理由を1〜2文で説明してください。\n" +
      "必ず以下のJSON形式のみで返答してください（他のテキストは不要）:\n" +
      "{\"result\":\"APPROVE\"|\"REJECT\"|\"UNKNOWN\",\"reason\":\"理由\"}"
    );
  }
  if (questType === "ROUTINE") {
    return (
      "あなたは行動監視AIです。以下のルーティーンクエストの内容を読み、添付された画像が" +
      "そのルーティーンを実施した証拠になっているかどうかを判定してください。\n\n" +
      `クエスト名: ${questTitle}\n` +
      `ルーティーン内容: ${questDescription}\n\n` +
      "歩数計のスクリーンショット・アプリの完了画面・実施状況を示す写真など、" +
      "ルーティーンを行った事実が確認できる画像であれば \"APPROVE\"、" +
      "確認できない場合は \"REJECT\"、判断できない場合は \"UNKNOWN\" と回答してください。" +
      "また、判定理由を1〜2文で説明してください。\n" +
      "必ず以下のJSON形式のみで返答してください（他のテキストは不要）:\n" +
      "{\"result\":\"APPROVE\"|\"REJECT\"|\"UNKNOWN\",\"reason\":\"理由\"}"
    );
  }
  // CHALLENGE
  return (
    "あなたは行動監視AIです。以下の達成クエストの条件を読み、添付された画像が" +
    "そのクエストを達成している証拠になっているかどうかを判定してください。\n\n" +
    `クエスト名: ${questTitle}\n` +
    `達成条件: ${questDescription}\n\n` +
    "画像を確認し、クエストを達成していると判断できる場合は \"APPROVE\"、" +
    "達成していない場合は \"REJECT\"、判断できない場合は \"UNKNOWN\" と回答してください。" +
    "また、判定理由を1〜2文で説明してください。\n" +
    "必ず以下のJSON形式のみで返答してください（他のテキストは不要）:\n" +
    "{\"result\":\"APPROVE\"|\"REJECT\"|\"UNKNOWN\",\"reason\":\"理由\"}"
  );
}

/**
 * Parses the AI response text and extracts result and reason.
 * Falls back to UNKNOWN if the response cannot be parsed.
 * @param {string} text - Raw text response from the model.
 * @return {Object} Parsed judgment with result and reason fields.
 */
function parseAiResponse(text: string): {
  result: "APPROVE" | "REJECT" | "UNKNOWN";
  reason: string;
} {
  try {
    // Extract JSON even if surrounded by markdown code fences
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in response");
    const parsed = JSON.parse(jsonMatch[0]) as {
      result: string;
      reason: string;
    };
    const result =
      parsed.result === "APPROVE" || parsed.result === "REJECT" ?
        parsed.result :
        "UNKNOWN";
    return { result, reason: String(parsed.reason ?? "") };
  } catch {
    logger.warn("Failed to parse AI response, defaulting to UNKNOWN:", text);
    return { result: "UNKNOWN", reason: text.slice(0, MAX_FALLBACK_REASON_LENGTH) };
  }
}

/**
 * Triggered when a new timeline post is created.
 * For PROHIBITION, CHALLENGE, and ROUTINE quests with image media, calls Gemini via
 * GenKit to judge whether the image satisfies the quest conditions, and writes
 * the result back to the timeline document as `aiJudgment`.
 */
export const judgeTimelinePost = onDocumentCreated(
  "timelines/{postId}",
  async (event) => {
    const timelineData = event.data?.data() as Timeline | undefined;
    const postId = event.params.postId;

    if (!timelineData) {
      logger.info("Timeline data is missing, skipping AI judgment.");
      return;
    }

    const { questId, mediaType, mediaUrl } = timelineData;

    // Only process image media (skip videos)
    if (!mediaType.startsWith("image/")) {
      logger.info(
        `Post ${postId} has mediaType "${mediaType}", skipping AI judgment.`
      );
      return;
    }

    // Determine quest type — prefer the denormalized field on the timeline,
    // fall back to fetching the quest document.
    const questType: string | undefined = timelineData.quest?.type;
    let questTitle: string = timelineData.quest?.title ?? "";
    let questDescription = "";

    if (!questType || !questId) {
      logger.info(
        `Post ${postId} is missing quest type or questId, skipping AI judgment.`
      );
      return;
    }

    if (!JUDGEABLE_QUEST_TYPES.includes(questType)) {
      logger.info(
        `Post ${postId} has quest type "${questType}" which is not judgeable, skipping.`
      );
      return;
    }

    // Fetch quest for description
    try {
      const questDoc = await db.collection("quests").doc(questId).get();
      if (questDoc.exists) {
        const questData = questDoc.data() as Quest;
        questDescription = questData.description ?? "";
        if (!questTitle) questTitle = questData.title ?? "";
      } else {
        logger.warn(
          `Quest ${questId} not found, proceeding with available title only.`
        );
      }
    } catch (error) {
      logger.error(`Failed to fetch quest ${questId}:`, error);
    }

    const prompt = buildPrompt(questType, questTitle, questDescription);

    let aiResult: "APPROVE" | "REJECT" | "UNKNOWN" = "UNKNOWN";
    let aiReason = "";

    try {
      const { text } = await ai.generate({
        model: gemini20Flash,
        prompt: [
          { text: prompt },
          { media: { url: mediaUrl, contentType: mediaType } },
        ],
      });

      const parsed = parseAiResponse(text);
      aiResult = parsed.result;
      aiReason = parsed.reason;

      logger.info(
        `AI judgment for post ${postId}: result=${aiResult}, reason=${aiReason}`
      );
    } catch (error) {
      logger.error(`AI judgment failed for post ${postId}:`, error);
      aiResult = "UNKNOWN";
      aiReason = "AI判定中にエラーが発生しました。";
    }

    const aiJudgment: AiJudgment = {
      result: aiResult,
      reason: aiReason,
      judgedAt: admin.firestore.Timestamp.now(),
    };

    try {
      await db.collection("timelines").doc(postId).update({ aiJudgment });
      logger.info(`AI judgment written to timeline ${postId}.`);
    } catch (error) {
      logger.error(
        `Failed to write AI judgment to timeline ${postId}:`,
        error
      );
      throw error;
    }
  }
);
