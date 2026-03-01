import { getJstNow } from './getJstNow';

export const getStartOfWeek = (): Date => {
  const jstNow = getJstNow();
  const startOfWeek = new Date(jstNow.getTime());

  const dayOfWeek = startOfWeek.getDay();

  const diffToMonday = startOfWeek.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
  
  startOfWeek.setDate(diffToMonday);
  startOfWeek.setHours(0, 0, 0, 0);
  return startOfWeek;
};
