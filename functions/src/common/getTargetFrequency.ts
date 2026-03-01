export const getTargetFrequency = (): string[] => {
  const jstNow = getJstNow();
  const targetFrequencies = ["DAILY"];

  // 日曜日の場合はWEEKLYも対象
  if (jstNow.getDay() === 0) {
    targetFrequencies.push("WEEKLY");
  }

  const isEndOfMonth = new Date(jstNow.getFullYear(), jstNow.getMonth() + 1, 0).getDate() === jstNow.getDate();
  if (isEndOfMonth) {
    targetFrequencies.push("MONTHLY");
  }

  return targetFrequencies;
};
