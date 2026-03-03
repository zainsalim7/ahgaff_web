/**
 * أدوات التاريخ والتوقيت - توقيت عدن (UTC+3)
 * التقويم الأساسي: ميلادي
 * التقويم المساعد: هجري
 */

// توقيت عدن UTC+3
export const ADEN_TIMEZONE = 'Asia/Aden';
export const TIMEZONE_OFFSET = 3; // +3 hours

// أسماء الأشهر الميلادية بالعربية
export const GREGORIAN_MONTHS_AR = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

// أسماء الأشهر الهجرية بالعربية
export const HIJRI_MONTHS_AR = [
  'محرم', 'صفر', 'ربيع الأول', 'ربيع الثاني', 'جمادى الأولى', 'جمادى الآخرة',
  'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'
];

// أسماء أيام الأسبوع بالعربية
export const WEEKDAYS_AR = [
  'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'
];

export const WEEKDAYS_AR_SHORT = [
  'أحد', 'إثن', 'ثلا', 'أرب', 'خمي', 'جمع', 'سبت'
];

/**
 * الحصول على التاريخ الحالي بتوقيت عدن
 */
export function getAdenDate(): Date {
  const now = new Date();
  // تحويل لتوقيت عدن
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utc + (TIMEZONE_OFFSET * 3600000));
}

/**
 * تحويل التاريخ الميلادي إلى هجري
 * باستخدام خوارزمية تقريبية
 */
export function gregorianToHijri(date: Date): { year: number; month: number; day: number } {
  const gregorianYear = date.getFullYear();
  const gregorianMonth = date.getMonth() + 1;
  const gregorianDay = date.getDate();

  // حساب عدد الأيام من تاريخ مرجعي
  const a = Math.floor((14 - gregorianMonth) / 12);
  const y = gregorianYear + 4800 - a;
  const m = gregorianMonth + (12 * a) - 3;
  
  let julianDay = gregorianDay + Math.floor((153 * m + 2) / 5) + (365 * y) + 
                  Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;

  // تحويل من يوليان إلى هجري
  const l = julianDay - 1948440 + 10632;
  const n = Math.floor((l - 1) / 10631);
  const remainingL = l - 10631 * n + 354;
  const j = (Math.floor((10985 - remainingL) / 5316)) * (Math.floor((50 * remainingL) / 17719)) + 
            (Math.floor(remainingL / 5670)) * (Math.floor((43 * remainingL) / 15238));
  const finalL = remainingL - (Math.floor((30 - j) / 15)) * (Math.floor((17719 * j) / 50)) - 
                 (Math.floor(j / 16)) * (Math.floor((15238 * j) / 43)) + 29;
  
  const hijriMonth = Math.floor((24 * finalL) / 709);
  const hijriDay = finalL - Math.floor((709 * hijriMonth) / 24);
  const hijriYear = 30 * n + j - 30;

  return {
    year: hijriYear,
    month: hijriMonth,
    day: hijriDay
  };
}

/**
 * تنسيق التاريخ الميلادي بالعربية
 * مثال: 23 فبراير 2026
 */
export function formatGregorianDate(date: Date, options?: { includeYear?: boolean; includeWeekday?: boolean }): string {
  const day = date.getDate();
  const month = GREGORIAN_MONTHS_AR[date.getMonth()];
  const year = date.getFullYear();
  const weekday = WEEKDAYS_AR[date.getDay()];

  let result = `${day} ${month}`;
  
  if (options?.includeYear !== false) {
    result += ` ${year}`;
  }
  
  if (options?.includeWeekday) {
    result = `${weekday}، ${result}`;
  }

  return result;
}

/**
 * تنسيق التاريخ الهجري بالعربية
 * مثال: 23 شعبان 1447
 */
export function formatHijriDate(date: Date, options?: { includeYear?: boolean }): string {
  const hijri = gregorianToHijri(date);
  const day = hijri.day;
  const month = HIJRI_MONTHS_AR[hijri.month - 1] || HIJRI_MONTHS_AR[0];
  const year = hijri.year;

  let result = `${day} ${month}`;
  
  if (options?.includeYear !== false) {
    result += ` ${year} هـ`;
  }

  return result;
}

/**
 * تنسيق التاريخ مع الميلادي والهجري معاً
 * مثال: 23 فبراير 2026 (23 شعبان 1447 هـ)
 */
export function formatDualDate(date: Date, options?: { includeYear?: boolean; includeWeekday?: boolean }): string {
  const gregorian = formatGregorianDate(date, options);
  const hijri = formatHijriDate(date, { includeYear: options?.includeYear });
  
  return `${gregorian} (${hijri})`;
}

/**
 * تنسيق التاريخ المختصر
 * مثال: 23/02/2026
 */
export function formatShortDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  
  return `${day}/${month}/${year}`;
}

/**
 * تنسيق الوقت
 * مثال: 09:30 ص
 */
export function formatTime(time: string | Date): string {
  let hours: number;
  let minutes: number;

  if (typeof time === 'string') {
    const parts = time.split(':');
    hours = parseInt(parts[0], 10);
    minutes = parseInt(parts[1], 10);
  } else {
    hours = time.getHours();
    minutes = time.getMinutes();
  }

  const period = hours >= 12 ? 'م' : 'ص';
  const displayHours = hours % 12 || 12;
  const displayMinutes = String(minutes).padStart(2, '0');

  return `${displayHours}:${displayMinutes} ${period}`;
}

/**
 * تنسيق الشهر والسنة
 * مثال: فبراير 2026 (شعبان 1447 هـ)
 */
export function formatMonthYear(date: Date, includeHijri: boolean = true): string {
  const month = GREGORIAN_MONTHS_AR[date.getMonth()];
  const year = date.getFullYear();
  
  let result = `${month} ${year}`;
  
  if (includeHijri) {
    const hijri = gregorianToHijri(date);
    const hijriMonth = HIJRI_MONTHS_AR[hijri.month - 1] || HIJRI_MONTHS_AR[0];
    result += ` (${hijriMonth} ${hijri.year} هـ)`;
  }
  
  return result;
}

/**
 * الحصول على اسم الشهر الميلادي
 */
export function getGregorianMonthName(monthIndex: number): string {
  return GREGORIAN_MONTHS_AR[monthIndex] || '';
}

/**
 * الحصول على اسم اليوم
 */
export function getWeekdayName(dayIndex: number, short: boolean = false): string {
  return short ? WEEKDAYS_AR_SHORT[dayIndex] : WEEKDAYS_AR[dayIndex];
}

/**
 * تحويل تاريخ YYYY-MM-DD إلى كائن Date
 */
export function parseDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * تنسيق التاريخ لـ API (YYYY-MM-DD)
 */
export function toAPIDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * المقارنة بين تاريخين (بدون الوقت)
 */
export function isSameDay(date1: Date, date2: Date): boolean {
  return date1.getFullYear() === date2.getFullYear() &&
         date1.getMonth() === date2.getMonth() &&
         date1.getDate() === date2.getDate();
}

/**
 * هل التاريخ اليوم؟
 */
export function isToday(date: Date): boolean {
  return isSameDay(date, getAdenDate());
}

/**
 * هل التاريخ في الماضي؟
 */
export function isPast(date: Date): boolean {
  const today = getAdenDate();
  today.setHours(0, 0, 0, 0);
  const compareDate = new Date(date);
  compareDate.setHours(0, 0, 0, 0);
  return compareDate < today;
}

/**
 * هل التاريخ في المستقبل؟
 */
export function isFuture(date: Date): boolean {
  const today = getAdenDate();
  today.setHours(0, 0, 0, 0);
  const compareDate = new Date(date);
  compareDate.setHours(0, 0, 0, 0);
  return compareDate > today;
}
