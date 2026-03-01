import { getJstNow } from './getJstNow';

export const getStartOfMonth = (): Date => {
  const jstNow = getJstNow();

  const startOfMonth = new Date(jstNow.getFullYear(), jstNow.getMonth(), 1);
  startOfMonth.setHours(0, 0, 0, 0);
  return startOfMonth;
};
