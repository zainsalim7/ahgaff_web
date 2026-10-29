// أنماط ومتغيرات مشتركة لمركز الصلاحيات المتقدم (SHADOW MODE)
export const COLORS = {
  primary: '#1565c0',
  primaryLight: '#e3f2fd',
  bg: '#f5f5f5',
  card: '#ffffff',
  border: '#e0e0e0',
  text: '#212121',
  textMuted: '#757575',
  success: '#2e7d32',
  successBg: '#e8f5e9',
  danger: '#c62828',
  dangerBg: '#ffebee',
  warning: '#ef6c00',
  warningBg: '#fff3e0',
  shadow: '#6a1b9a',
  shadowBg: '#f3e5f5',
};

export const OP_TYPE_LABELS: { [key: string]: string } = {
  view_list: 'عرض قائمة', view_detail: 'عرض تفاصيل', add: 'إضافة', edit: 'تعديل', delete: 'حذف',
  export: 'تصدير', import: 'استيراد', print: 'طباعة', approve: 'اعتماد/مراجعة', publish: 'نشر/إرسال',
  restore: 'استعادة', bulk: 'عملية جماعية', clone: 'نسخ', reset: 'إعادة تعيين', sync: 'مزامنة/ترحيل',
  verify: 'تحقق', generate: 'توليد', other: 'عملية',
};

export const SENSITIVITY_LABELS: { [key: string]: { label: string; color: string } } = {
  low: { label: 'منخفضة', color: '#2e7d32' },
  medium: { label: 'متوسطة', color: '#ef6c00' },
  high: { label: 'عالية', color: '#c62828' },
  critical: { label: 'حرجة', color: '#b71c1c' },
};

export const STATUS_LABELS: { [key: string]: { label: string; color: string } } = {
  draft: { label: 'مسودة', color: '#757575' },
  shadow: { label: 'تجريبي (ظل)', color: '#6a1b9a' },
  ready_for_review: { label: 'جاهز للمراجعة', color: '#ef6c00' },
};

export const SCOPE_TYPE_LABELS: { [key: string]: string } = {
  university: 'الجامعة كاملة', faculty: 'كلية واحدة', multi_faculty: 'عدة كليات',
  department: 'قسم واحد', multi_department: 'عدة أقسام', unit: 'وحدة إدارية', multi_unit: 'عدة وحدات إدارية',
  course: 'مقرر دراسي',
};

export const SUB_PERMISSION_LABELS: { [key: string]: string } = {
  view: 'عرض الأدوار والصلاحيات', context_switch: 'تجربة تبديل سياق العمل',
  manage_roles: 'إدارة الأدوار التجريبية', manage_assignments: 'إدارة التكليفات',
  manage_permissions: 'تعديل الصلاحيات المباشرة', run_tests: 'تشغيل المحاكي والمقارنة',
  view_audit: 'عرض سجل التدقيق',
};
