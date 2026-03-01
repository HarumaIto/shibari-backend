export const getStartOfMonth = async (): Date => {
  const jstNow = getJstNow();

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  startOfMonth.setHours(0, 0, 0, 0);
  return startOfMonth;
}
