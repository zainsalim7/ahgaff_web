// 📁 تسمية ملفات التصدير: «المحتوى - التفاصيل - YYYY-MM-DD HH-MM.ext»
const pad = (n: number) => String(n).padStart(2, '0');

export const exportStamp = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}-${pad(d.getMinutes())}`;
};

export const exportName = (parts: (string | number | null | undefined)[], ext: string): string => {
  const clean: string[] = [];
  parts.forEach((p) => {
    const s = String(p ?? '').trim().replace(/[\\/:*?"<>|]/g, '-');
    if (s && !clean.includes(s)) clean.push(s);
  });
  return `${clean.join(' - ')} - ${exportStamp()}.${ext}`;
};

// يفضّل اسم الملف الذي يرسله الباكند (X-Filename) وإلا يستخدم الاسم الاحتياطي
export const filenameFromResponse = (res: any, fallback: string): string => {
  const xf = res?.headers?.['x-filename'] || res?.headers?.['X-Filename'];
  if (xf) {
    try { return decodeURIComponent(xf); } catch { return xf; }
  }
  return fallback;
};
