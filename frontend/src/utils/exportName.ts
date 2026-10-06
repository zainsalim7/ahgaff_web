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

export const downloadBlob = (data: any, filename: string, mime: string) => {
  const blob = new Blob([data], { type: mime });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.style.display = 'none';
  document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); window.URL.revokeObjectURL(url); }, 100);
};
