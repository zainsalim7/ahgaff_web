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
