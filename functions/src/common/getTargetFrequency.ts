export const getTargetFrequency = async () => {
  const jstNow = getJstNow();
  const targetFrequencies = ["DAILY"];

  // 日曜日の場合はWEEKLYも対象
  if (now.getDay() === 0) {
    targetFrequencies.push("WEEKLY");
  }

  const isEndOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() === now.getDate();
  if (isEndOfMonth) {
    targetFrequencies.push("MONTHLY");
  }

  return targetFrequencies;
}
