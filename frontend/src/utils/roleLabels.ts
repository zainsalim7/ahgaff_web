/**
 * roleLabels.ts - مصدر الحقيقة الوحيد لأسماء الأدوار العربية
 * يُستخدم في كل أنحاء التطبيق لضمان اتساق التسميات.
 */

export const ROLE_LABELS: Record<string, string> = {
  admin: 'مدير النظام',
  university_president: 'رئيس الجامعة',
  dean: 'عميد كلية',
  department_head: 'رئيس قسم',
  registration_manager: 'مدير التسجيل',
  registrar: 'مسجِّل',
  teacher: 'مدرس',
  employee: 'موظف',
  student: 'طالب',
  custom: 'دور مخصص',
};

export const ROLE_COLORS: Record<string, string> = {
  admin: '#9c27b0',
  university_president: '#1a237e',
  dean: '#0d47a1',
  department_head: '#1565c0',
  registration_manager: '#00838f',
  registrar: '#00695c',
  teacher: '#2e7d32',
  employee: '#ff9800',
  student: '#4caf50',
  custom: '#607d8b',
};

/**
 * إرجاع الاسم العربي للدور.
 * - يقبل القيمة المباشرة (admin, registrar, ...)
 * - يقبل اسم دور مخصَّص من الباك إند ويُرجعه كما هو
 * - يُرجع "مستخدم" كقيمة افتراضية للقيم غير المعروفة
 */
export function getRoleLabel(role?: string | null, fallback: string = 'مستخدم'): string {
  if (!role) return fallback;
  if (ROLE_LABELS[role]) return ROLE_LABELS[role];
  // إن لم يكن المفتاح من الأدوار النظامية، فقد يكون اسم دور مخصص بالعربية أصلاً
  return role;
}

/**
 * إرجاع لون الدور (للـ badges)
 */
export function getRoleColor(role?: string | null, fallback: string = '#607d8b'): string {
  if (!role) return fallback;
  return ROLE_COLORS[role] || fallback;
}
