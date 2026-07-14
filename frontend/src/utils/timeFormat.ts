export function formatTimeArabic(t?: string): string {
  if (!t || !t.includes(':')) return t || '';
  const [hStr, mStr] = t.split(':');
  const h = parseInt(hStr, 10);
  if (isNaN(h)) return t;
  const period = h < 5 ? 'فجراً' : h < 12 ? 'صباحاً' : h < 15 ? 'ظهراً' : h < 18 ? 'عصراً' : 'مساءً';
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${mStr} ${period}`;
}

export function timeDiffMinutes(start?: string, end?: string): number | null {
  if (!start || !end || !start.includes(':') || !end.includes(':')) return null;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  if ([sh, sm, eh, em].some(isNaN)) return null;
  return eh * 60 + em - (sh * 60 + sm);
}

export function durationArabic(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const hTxt = h === 1 ? 'ساعة' : h === 2 ? 'ساعتان' : `${h} ساعات`;
  if (h > 0 && m > 0) return `${hTxt} و${m} دقيقة`;
  if (h > 0) return hTxt;
  return `${m} دقيقة`;
}

export function earlyMorningWarning(start?: string): string | null {
  if (!start || !start.includes(':')) return null;
  const h = parseInt(start.split(':')[0], 10);
  if (!isNaN(h) && h < 6) {
    return `اخترت توقيت فجر (${formatTimeArabic(start)}) — إن كنت تقصد بعد الظهر فاختر «م» بدل «ص»`;
  }
  return null;
}

export function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return time;
  let total = h * 60 + m + mins;
  if (total > 23 * 60 + 59) total = 23 * 60 + 59;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// اقتراح وقت النهاية تلقائياً: يحافظ على المدة السابقة إن كانت صالحة، وإلا 90 دقيقة
export function suggestEndTime(newStart: string, prevStart?: string, prevEnd?: string): string {
  const prevDiff = timeDiffMinutes(prevStart, prevEnd);
  const duration = prevDiff !== null && prevDiff > 0 ? prevDiff : 90;
  return addMinutes(newStart, duration);
}
