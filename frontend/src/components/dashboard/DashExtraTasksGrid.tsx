import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth, PERMISSIONS } from '../../contexts/AuthContext';
import { useAuthStore } from '../../store/authStore';
import { dashboardAPI } from '../../services/api';

interface ExtraTask {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
  route: string;
  perms?: string[];
  roles?: string[];
  adminOnly?: boolean;
  alwaysVisible?: boolean; // ⚠️ بلا أي تحقق صلاحية — تُستخدم فقط لأدوات تحقّق/عرض عامة لا تحمل بيانات حساسة
}

// 🧩 مهام إضافية — كل مهمة مربوطة بصلاحيتها الفعلية الصريحة (لا صلاحيات افتراضية بالدور)
const EXTRA_TASKS: ExtraTask[] = [
  // 🎓 أكاديمي
  { id: 'manage-study-plan', label: 'إدارة الخطة الدراسية', icon: 'library', color: '#1565c0', bg: '#dbeafe', route: '/study-plans-overview', perms: [PERMISSIONS.MANAGE_CURRICULUM, PERMISSIONS.VIEW_CURRICULUM, PERMISSIONS.MANAGE_COURSES, 'view_courses'] },
  { id: 'teacher-courses', label: 'مقررات المعلم', icon: 'book', color: '#0ea5e9', bg: '#e0f2fe', route: '/teacher-courses', perms: [PERMISSIONS.MANAGE_COURSES, PERMISSIONS.MANAGE_TEACHERS, 'view_courses', 'view_teachers'] },
  { id: 'student-references', label: 'مراجع الطلاب', icon: 'document-text', color: '#7c3aed', bg: '#ede9fe', route: '/student-references', perms: [PERMISSIONS.MANAGE_STUDENTS, 'view_students'] },
  { id: 'student-statuses', label: 'حالات الطالب', icon: 'people-circle', color: '#0369a1', bg: '#e0f2fe', route: '/student-statuses', perms: [PERMISSIONS.MANAGE_STUDENTS, 'view_students'] },
  { id: 'university-calendar', label: 'إدارة التقويم الجامعي', icon: 'calendar', color: '#f97316', bg: '#ffedd5', route: '/university-calendar', perms: ['manage_calendar'] },
  { id: 'view-calendar', label: 'عرض التقويم الجامعي', icon: 'calendar-outline', color: '#22c55e', bg: '#dcfce7', route: '/calendar', perms: ['manage_calendar', PERMISSIONS.VIEW_REPORTS, PERMISSIONS.MANAGE_SCHEDULE, 'view_schedule'] },
  { id: 'prep-leave-periods', label: 'إجازة التحضير', icon: 'book', color: '#7c3aed', bg: '#ede9fe', route: '/prep-leave-periods', perms: ['manage_prep_leave'] },
  { id: 'faculty-board', label: 'مجلس الكلية', icon: 'shield-checkmark', color: '#831843', bg: '#fce7f3', route: '/faculty-board', perms: ['manage_faculty_board'] },
  { id: 'availability-report', label: 'تقرير توفّر القاعات', icon: 'business', color: '#0891b2', bg: '#cffafe', route: '/availability-report', perms: [PERMISSIONS.VIEW_REPORTS, PERMISSIONS.MANAGE_SCHEDULE, 'view_schedule'] },
  { id: 'verify-report', label: 'التحقّق من التقارير', icon: 'shield-checkmark', color: '#0f766e', bg: '#ccfbf1', route: '/verify-report', alwaysVisible: true },
  { id: 'take-attendance', label: 'تسجيل الحضور', icon: 'checkbox', color: '#16a34a', bg: '#dcfce7', route: '/take-attendance', perms: [PERMISSIONS.MANAGE_ATTENDANCE, 'record_attendance', 'take_attendance'] },
  { id: 'qr-scanner', label: 'ماسح QR', icon: 'qr-code', color: '#9333ea', bg: '#f3e8ff', route: '/qr-scanner', perms: [PERMISSIONS.MANAGE_ATTENDANCE, 'record_attendance', 'take_attendance'] },
  { id: 'attendance-approvals', label: 'اعتماد تعديلات الحضور', icon: 'shield-checkmark', color: '#ff9800', bg: '#fff3d6', route: '/attendance-approvals', perms: [PERMISSIONS.APPROVE_ATTENDANCE_CHANGES] },
  { id: 'my-attendance-requests', label: 'طلباتي لتعديل الحضور', icon: 'time', color: '#0891b2', bg: '#cffafe', route: '/my-attendance-requests', perms: [PERMISSIONS.EDIT_ATTENDANCE, PERMISSIONS.MANAGE_ATTENDANCE] },

  // 📊 تقارير
  { id: 'report-course', label: 'تقرير المقرر', icon: 'book', color: '#06b6d4', bg: '#cffafe', route: '/report-course', perms: [PERMISSIONS.REPORT_COURSE, PERMISSIONS.VIEW_REPORTS] },
  { id: 'report-absent-students', label: 'تقرير غياب الطلاب', icon: 'people', color: '#ef4444', bg: '#fee2e2', route: '/report-absent-students', perms: [PERMISSIONS.REPORT_ABSENT_STUDENTS, PERMISSIONS.VIEW_REPORTS] },
  { id: 'report-teacher-summary', label: 'ملخّص أداء المعلم', icon: 'person', color: '#7c3aed', bg: '#ede9fe', route: '/report-teacher-summary', perms: [PERMISSIONS.REPORT_TEACHER_WORKLOAD, PERMISSIONS.VIEW_REPORTS] },
  { id: 'report-lesson-completion', label: 'اكتمال الدروس', icon: 'checkmark-done', color: '#16a34a', bg: '#dcfce7', route: '/report-lesson-completion', perms: [PERMISSIONS.REPORT_LESSON_COMPLETION, PERMISSIONS.VIEW_REPORTS] },
  { id: 'report-daily', label: 'التقرير اليومي', icon: 'today', color: '#f59e0b', bg: '#fef3c7', route: '/report-daily', perms: [PERMISSIONS.REPORT_DAILY, PERMISSIONS.VIEW_REPORTS] },
  { id: 'report-attendance-overview', label: 'الحضور الشامل', icon: 'stats-chart', color: '#1565c0', bg: '#dbeafe', route: '/report-attendance-overview', perms: [PERMISSIONS.REPORT_ATTENDANCE_OVERVIEW, PERMISSIONS.VIEW_REPORTS] },
  { id: 'report-warnings', label: 'الإنذارات والحرمان', icon: 'warning', color: '#ff9800', bg: '#fff3e0', route: '/report-warnings', perms: [PERMISSIONS.REPORT_WARNINGS, PERMISSIONS.VIEW_REPORTS] },
  { id: 'report-student', label: 'تقرير طالب', icon: 'person', color: '#9c27b0', bg: '#f3e5f5', route: '/report-student', perms: [PERMISSIONS.REPORT_STUDENT, PERMISSIONS.VIEW_REPORTS] },
  { id: 'report-teacher-workload', label: 'نصاب المدرس', icon: 'time', color: '#e91e63', bg: '#fce4ec', route: '/report-teacher-workload', perms: [PERMISSIONS.REPORT_TEACHER_WORKLOAD, PERMISSIONS.VIEW_REPORTS] },
  { id: 'report-teacher-delays', label: 'تأخر المعلمين', icon: 'alarm', color: '#d32f2f', bg: '#ffebee', route: '/report-teacher-delays', perms: [PERMISSIONS.REPORT_TEACHER_DELAYS, PERMISSIONS.VIEW_REPORTS] },
  { id: 'report-teacher-attendance', label: 'حضور الأساتذة', icon: 'clipboard', color: '#2e7d32', bg: '#e8f5e9', route: '/report-teacher-attendance', perms: [PERMISSIONS.REPORT_DAILY, PERMISSIONS.VIEW_REPORTS] },
  { id: 'overtime-letters', label: 'خطابات الساعات الإضافية', icon: 'albums', color: '#be185d', bg: '#fce7f3', route: '/overtime-letters', perms: [PERMISSIONS.REPORT_TEACHER_WORKLOAD] },

  // 📨 إداري
  { id: 'send-final-results', label: 'إرسال النتائج النهائية', icon: 'paper-plane', color: '#16a34a', bg: '#dcfce7', route: '/send-final-results', perms: [PERMISSIONS.SEND_NOTIFICATIONS, PERMISSIONS.MANAGE_COURSES, 'manage_grades'] },
  { id: 'send-department-results', label: 'إرسال نتائج القسم', icon: 'send', color: '#1565c0', bg: '#dbeafe', route: '/send-department-results', perms: [PERMISSIONS.SEND_NOTIFICATIONS, PERMISSIONS.MANAGE_DEPARTMENTS, 'manage_grades'] },
  { id: 'send-notification', label: 'إرسال إشعار', icon: 'notifications', color: '#f97316', bg: '#ffedd5', route: '/send-notification', perms: [PERMISSIONS.SEND_NOTIFICATIONS, PERMISSIONS.MANAGE_NOTIFICATIONS] },
  { id: 'offline-sync-report', label: 'تقرير مزامنة الأوفلاين', icon: 'time', color: '#0891b2', bg: '#cffafe', route: '/offline-sync-report', adminOnly: true },
  { id: 'fee-receipts', label: 'السندات المالية', icon: 'cash', color: '#f57f17', bg: '#fff8e1', route: '/fee-receipts', perms: ['manage_fee_receipts', 'view_fee_receipts'] },
  { id: 'grades', label: 'الدرجات وبيانات الطلاب', icon: 'ribbon', color: '#5e35b1', bg: '#ede7f6', route: '/grades', perms: ['manage_grades'] },
  { id: 'statements-log', label: 'سجل الإفادات', icon: 'document-text', color: '#00796b', bg: '#e0f2f1', route: '/statements-log', perms: ['issue_statements'] },
  { id: 'letter-new', label: 'رسالة جديدة', icon: 'flash', color: '#d97706', bg: '#fef3c7', route: '/letter-new', perms: [PERMISSIONS.ISSUE_LETTERS, 'hr_manage_correspondence', 'hr_manage_employees'] },
  { id: 'photo-approvals', label: 'اعتماد صور الطلاب', icon: 'images', color: '#f9a825', bg: '#fff8e1', route: '/photo-approvals', perms: ['approve_student_photos'] },
  { id: 'batch-print', label: 'طباعة البطاقات', icon: 'print', color: '#3949ab', bg: '#e8eaf6', route: '/batch-print', perms: ['print_student_cards'] },
  { id: 'card-settings', label: 'تصميم البطاقة', icon: 'color-palette', color: '#00796b', bg: '#e0f2f1', route: '/card-settings', perms: ['print_student_cards'] },

  // ⚙️ نظام وصيانة
  { id: 'permissions-tree', label: 'شجرة الصلاحيات', icon: 'git-branch', color: '#7c3aed', bg: '#ede9fe', route: '/permissions', perms: [PERMISSIONS.MANAGE_ROLES] },
  { id: 'offline-sync', label: 'مزامنة الأوفلاين', icon: 'cloud-offline', color: '#0891b2', bg: '#cffafe', route: '/offline-sync', adminOnly: true },
  { id: 'student-autofill', label: 'الإدخال التلقائي للطلاب', icon: 'cloud-upload', color: '#1565c0', bg: '#dbeafe', route: '/student-autofill', adminOnly: true },
  { id: 'backfill-lecture-semesters', label: 'معالجة بيانات الفصول', icon: 'sync', color: '#f59e0b', bg: '#fef3c7', route: '/backfill-lecture-semesters', adminOnly: true },
  { id: 'repair-group-lectures', label: 'استعادة محاضرات المجموعات', icon: 'bandage', color: '#7c3aed', bg: '#ede9fe', route: '/repair-group-lectures', adminOnly: true },
  { id: 'backfill-sections', label: 'معالجة الشُعب', icon: 'people-circle', color: '#0ea5e9', bg: '#e0f2fe', route: '/backfill-sections', adminOnly: true },
  { id: 'cleanup-ghost-completions', label: 'تنظيف حصص يتيمة', icon: 'trash-bin', color: '#dc2626', bg: '#fee2e2', route: '/cleanup-ghost-completions', adminOnly: true },
  { id: 'cleanup-orphan-attendance', label: 'تنظيف حضور يتيم', icon: 'trash', color: '#ef4444', bg: '#fee2e2', route: '/cleanup-orphan-attendance', adminOnly: true },
];

/** 🧩 شبكة المهام الإضافية — بطاقات صغيرة لكل صلاحيات المستخدم المتبقية، مع إمكانية الإخفاء/الإعادة (مُزامَنة على الحساب) */
export const DashExtraTasksGrid = () => {
  const router = useRouter();
  const { hasAnyPermission } = useAuth();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';

  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    dashboardAPI.getModulesPrefs()
      .then((res) => setHiddenIds(res.data?.hidden_tasks || []))
      .catch(() => setHiddenIds([]))
      .finally(() => setLoaded(true));
  }, []);

  const persist = async (next: string[]) => {
    const prev = hiddenIds;
    setHiddenIds(next);
    setSaving(true);
    try {
      await dashboardAPI.updateModulesPrefs(next);
    } catch {
      setHiddenIds(prev);
    } finally {
      setSaving(false);
    }
  };

  const hideTask = (id: string) => persist(hiddenIds.includes(id) ? hiddenIds : [...hiddenIds, id]);
  const restoreTask = (id: string) => persist(hiddenIds.filter((h) => h !== id));

  const visibleTasks = useMemo(
    () => EXTRA_TASKS.filter((t) => {
      if (t.alwaysVisible) return true;
      if (t.roles) return t.roles.includes(user?.role || '');
      if (t.adminOnly) return isAdmin;
      if (isAdmin) return true;
      if (!t.perms || t.perms.length === 0) return false;
      return hasAnyPermission(t.perms);
    }),
    [hasAnyPermission, isAdmin, user]
  );

  const shown = visibleTasks.filter((t) => !hiddenIds.includes(t.id));
  const hidden = visibleTasks.filter((t) => hiddenIds.includes(t.id));

  if (!loaded || visibleTasks.length === 0) return null;

  return (
    <View style={styles.wrap} testID="dash-extra-tasks-grid">
      <View style={styles.header}>
        <TouchableOpacity
          style={[styles.editBtn, editMode && styles.editBtnOn]}
          onPress={() => setEditMode((e) => !e)}
          testID="dash-extra-tasks-toggle-edit"
        >
          {saving ? <ActivityIndicator size="small" color={editMode ? '#fff' : '#475569'} /> : (
            <Ionicons name={editMode ? 'checkmark' : 'create-outline'} size={14} color={editMode ? '#fff' : '#475569'} />
          )}
          <Text style={[styles.editBtnText, editMode && styles.editBtnTextOn]}>{editMode ? 'تم' : 'تخصيص'}</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>مهام إضافية</Text>
          <Text style={styles.subtitle}>{shown.length} من أصل {visibleTasks.length} — يمكنك إخفاء ما لا تحتاجه</Text>
        </View>
      </View>

      <View style={styles.grid}>
        {shown.map((t) => (
          <View key={t.id} style={styles.tileWrap}>
            <TouchableOpacity
              style={styles.tile}
              onPress={() => { if (!editMode) router.push(t.route as any); }}
              activeOpacity={editMode ? 1 : 0.75}
              testID={`dash-extra-task-${t.id}`}
            >
              <View style={[styles.tileIcon, { backgroundColor: t.bg }]}>
                <Ionicons name={t.icon} size={20} color={t.color} />
              </View>
              <Text style={styles.tileLabel} numberOfLines={2}>{t.label}</Text>
            </TouchableOpacity>
            {editMode && (
              <TouchableOpacity
                style={styles.hideBadge}
                onPress={() => hideTask(t.id)}
                testID={`dash-extra-task-${t.id}-hide-btn`}
              >
                <Ionicons name="close" size={12} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        ))}
      </View>

      {editMode && hidden.length > 0 && (
        <View style={styles.hiddenTray} testID="dash-extra-tasks-hidden-tray">
          <Text style={styles.hiddenTrayTitle}>عناصر مخفية ({hidden.length}) — اضغط لإعادتها</Text>
          <View style={styles.hiddenTrayGrid}>
            {hidden.map((t) => (
              <TouchableOpacity
                key={t.id}
                style={styles.hiddenChip}
                onPress={() => restoreTask(t.id)}
                testID={`dash-extra-task-${t.id}-restore-btn`}
              >
                <Ionicons name="add-circle" size={14} color="#16a34a" />
                <Ionicons name={t.icon} size={14} color={t.color} />
                <Text style={styles.hiddenChipText} numberOfLines={1}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { marginTop: 18 },
  header: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginBottom: 12 },
  title: { fontSize: 15, fontWeight: '800', color: '#0f172a', textAlign: 'right' },
  subtitle: { fontSize: 11.5, color: '#64748b', textAlign: 'right', marginTop: 2 },
  editBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  editBtnOn: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  editBtnText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  editBtnTextOn: { color: '#fff' },
  grid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 },
  tileWrap: { position: 'relative' },
  tile: { width: 108, alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 6, borderWidth: 1, borderColor: '#eef1f6' },
  tileIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 7 },
  tileLabel: { fontSize: 10.5, fontWeight: '700', color: '#0f172a', textAlign: 'center', lineHeight: 13.5, minHeight: 27 },
  hideBadge: { position: 'absolute', top: -6, left: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  hiddenTray: { marginTop: 14, backgroundColor: '#f8fafc', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  hiddenTrayTitle: { fontSize: 11.5, fontWeight: '700', color: '#64748b', textAlign: 'right', marginBottom: 8 },
  hiddenTrayGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  hiddenChip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, maxWidth: 180 },
  hiddenChipText: { fontSize: 11, fontWeight: '600', color: '#334155' },
});
