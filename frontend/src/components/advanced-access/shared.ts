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
  view_audit: 'عرض سجل التدقيق', view_pilot: 'عرض نتائج التجربة التشغيلية (المرحلة 5)',
  manage_rollback: 'التحكم بمفاتيح التفعيل والتراجع (Phase 6B)',
  manage_role_review: 'مراجعة الأدوار والصلاحيات الحساسة (Phase 7-B)',
};

export const ROLLBACK_STOP_LABELS: { [key: string]: string } = {
  emergency_kill_switch: 'مفتاح الإيقاف الطارئ (متغير بيئة الخادم) — أولوية مطلقة',
  activation_locked: 'قفل برمجي للتفعيل (Phase 6B) — لم يُرفَع بعد',
  db_read_failure: 'فشل قراءة مفاتيح التحكم — سلوك آمن افتراضي (النظام القديم)',
  master_flag_off: 'المفتاح المركزي معطَّل (OFF)',
  scope_not_activated: 'النطاق غير مُفعَّل ضمن قائمة التفعيل',
  none: 'غير محجوب (لن يحدث في هذه المرحلة)',
};

export const REVIEW_STATUS_LABELS: { [key: string]: string } = {
  not_reviewed: 'لم يُراجع', in_review: 'قيد المراجعة', needs_changes: 'يحتاج إلى تعديل', ready_for_approval: 'جاهز للاعتماد',
};

export const REVIEW_STATUS_COLORS: { [key: string]: string } = {
  not_reviewed: COLORS.textMuted, in_review: COLORS.warning, needs_changes: COLORS.danger, ready_for_approval: COLORS.success,
};

export const USAGE_STATUS_LABELS: { [key: string]: string } = {
  active_in_use: 'مستخدَم حاليًا', unused_pending_review: 'غير مستخدم — قيد المراجعة',
};

export const DECISION_LABELS: { [key: string]: string } = {
  pending: 'معلَّق', approved: 'مقبول', rejected: 'مرفوض',
};
export const DECISION_COLORS: { [key: string]: string } = {
  pending: COLORS.textMuted, approved: COLORS.success, rejected: COLORS.danger,
};

export const PILOT_SEVERITY_LABELS: { [key: string]: { label: string; color: string } } = {
  critical: { label: 'حرجة', color: '#b71c1c' },
  high: { label: 'عالية', color: '#c62828' },
  medium: { label: 'متوسطة', color: '#ef6c00' },
  info: { label: 'معلوماتية', color: '#1565c0' },
};

export const PILOT_CATEGORY_LABELS: { [key: string]: string } = {
  both_allow: 'اتفاق — كلا النظامين يسمح', both_deny: 'اتفاق — كلا النظامين يرفض',
  old_allow_new_deny: 'اختلاف — القديم يسمح والجديد يرفض', new_allow_old_deny: 'اختلاف — الجديد يسمح والقديم يرفض',
  no_legacy_equivalent: 'لا يوجد مكافئ قديم', legacy_baseline_only: 'خط أساس قديم فقط (بلا تكليف تجريبي)',
};

export const PILOT_TEST_TYPE_LABELS: { [key: string]: string } = {
  scope_isolation_in: 'عزل النطاق — داخل النطاق', scope_isolation_out: 'عزل النطاق — خارج النطاق',
  permission_denial: 'رفض صلاحية غير ممنوحة', multi_role_own_permission: 'تعدد مناصب — صلاحية خاصة',
  multi_role_cross_isolation: 'تعدد مناصب — عزل متقاطع', compare: 'مقارنة بالنظام القديم',
  end_assignment_self_blocked: 'إنهاء تكليف — حجب فوري', end_assignment_others_unaffected: 'إنهاء تكليف — سلامة الباقي',
  security_impersonation: 'أمان — انتحال', security_escalation_self: 'أمان — تصعيد ذاتي',
  security_escalation_other_user: 'أمان — تصعيد لمستخدم آخر', security_imported_role_edit_block: 'أمان — حماية دور مستورد',
  security_idor_context: 'أمان — IDOR', legacy_baseline_only: 'خط أساس (president)',
};

export const PILOT_USER_LABELS: { [key: string]: string } = {
  Salim: 'Salim — عميد كلية الشريعة والقانون', Saeed: 'Saeed — رئيس قسم (3 مناصب متزامنة)',
  teacher180156: 'teacher180156 — أستاذ مقرر', president: 'president — رئيس الجامعة (خط أساس فقط)',
};
