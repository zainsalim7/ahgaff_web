import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth, PERMISSIONS } from '../../contexts/AuthContext';
import { useAuthStore } from '../../store/authStore';
import { NUM_FONT } from './dashTheme';

type Category = 'academic' | 'administrative' | 'reports' | 'system';

interface ModuleDef {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  category: Category;
  perms: string[];
  route: string;
  subtitle: string;
  numbersKey?: 'students' | 'teachers' | 'courses' | 'departments';
}

interface Numbers {
  students?: number; teachers?: number; courses?: number; departments?: number; faculties?: number;
}

const CATEGORY_COLORS: Record<Category, { bg: string; text: string; border: string; label: string }> = {
  academic: { bg: '#EFF6FF', text: '#2563EB', border: '#BFDBFE', label: 'أكاديمي' },
  administrative: { bg: '#ECFDF5', text: '#059669', border: '#A7F3D0', label: 'إداري' },
  reports: { bg: '#F5F3FF', text: '#7C3AED', border: '#DDD6FE', label: 'تقارير' },
  system: { bg: '#FFF7ED', text: '#EA580C', border: '#FED7AA', label: 'نظام' },
};

// 🧩 كل وحدة مربوطة بصلاحياتها الخاصة فقط (مطابقة لـ SideMenu) — البطاقة تظهر إن امتلك المستخدم أي صلاحية من القائمة
const MODULES: ModuleDef[] = [
  { id: 'courses', label: 'المقررات', icon: 'book', category: 'academic', perms: [PERMISSIONS.MANAGE_COURSES, 'view_courses'], route: '/(tabs)/courses', subtitle: 'مقرر دراسي نشط', numbersKey: 'courses' },
  { id: 'students', label: 'الطلاب', icon: 'people', category: 'academic', perms: [PERMISSIONS.MANAGE_STUDENTS, 'view_students'], route: '/students', subtitle: 'طالب مسجَّل', numbersKey: 'students' },
  { id: 'teachers', label: 'المعلمون', icon: 'person', category: 'academic', perms: [PERMISSIONS.MANAGE_TEACHERS, 'view_teachers'], route: '/manage-teachers', subtitle: 'عضو هيئة تدريس', numbersKey: 'teachers' },
  { id: 'departments', label: 'الأقسام', icon: 'business', category: 'academic', perms: [PERMISSIONS.MANAGE_DEPARTMENTS, 'view_departments'], route: '/add-department', subtitle: 'قسم أكاديمي', numbersKey: 'departments' },
  { id: 'faculties', label: 'الكليات', icon: 'school', category: 'academic', perms: [PERMISSIONS.MANAGE_FACULTIES, 'view_faculties'], route: '', subtitle: 'كلية جامعية' },
  { id: 'curriculum', label: 'الخطة الدراسية', icon: 'library', category: 'academic', perms: [PERMISSIONS.MANAGE_CURRICULUM, PERMISSIONS.VIEW_CURRICULUM], route: '/curriculum', subtitle: 'الخطة المعتمَدة للمقررات' },
  { id: 'enrollments', label: 'التسجيلات', icon: 'clipboard', category: 'academic', perms: [PERMISSIONS.MANAGE_ENROLLMENTS, 'view_enrollments'], route: '/manage-enrollments', subtitle: 'تسجيل الطلاب بالمقررات' },
  { id: 'manage-attendance', label: 'إدارة الحضور', icon: 'checkbox', category: 'academic', perms: [PERMISSIONS.MANAGE_ATTENDANCE, 'record_attendance', 'take_attendance', 'edit_attendance', 'view_attendance'], route: '/manage-attendance', subtitle: 'تسجيل حضور المحاضرات' },
  { id: 'lecture-swaps', label: 'تبادل المحاضرات', icon: 'swap-horizontal', category: 'administrative', perms: [PERMISSIONS.MANAGE_LECTURE_SWAPS], route: '/lecture-swaps', subtitle: 'طلبات تبادل وإنابة المحاضرات' },
  { id: 'student-excuses', label: 'أعذار الطلاب', icon: 'document-attach', category: 'administrative', perms: [PERMISSIONS.MANAGE_STUDENT_EXCUSES], route: '/student-excuses', subtitle: 'أعذار غياب الطلاب' },
  { id: 'users', label: 'المستخدمون', icon: 'people-circle', category: 'administrative', perms: [PERMISSIONS.MANAGE_USERS, 'view_users'], route: '/manage-users', subtitle: 'حسابات وصلاحيات النظام' },
  { id: 'notifications', label: 'الإشعارات', icon: 'notifications', category: 'administrative', perms: [PERMISSIONS.SEND_NOTIFICATIONS, 'manage_notifications'], route: '/manage-notifications', subtitle: 'إرسال وإدارة الإشعارات' },
  { id: 'hr-employees', label: 'شؤون الموظفين', icon: 'id-card', category: 'administrative', perms: [PERMISSIONS.HR_VIEW_EMPLOYEES, PERMISSIONS.HR_MANAGE_EMPLOYEES], route: '/hr-employees', subtitle: 'سجل الموظفين الإداريين' },
  { id: 'letters', label: 'المراسلات', icon: 'mail-open', category: 'administrative', perms: ['issue_letters', 'hr_manage_correspondence', 'hr_manage_employees'], route: '/letters', subtitle: 'المراسلات والخطابات الرسمية' },
  { id: 'reports', label: 'التقارير', icon: 'bar-chart', category: 'reports', perms: [PERMISSIONS.VIEW_REPORTS, PERMISSIONS.EXPORT_REPORTS], route: '/reports', subtitle: 'التقارير والإحصائيات' },
  { id: 'roles', label: 'الأدوار والصلاحيات', icon: 'key', category: 'system', perms: [PERMISSIONS.MANAGE_ROLES], route: '/manage-roles', subtitle: 'صلاحيات المستخدمين' },
  { id: 'trash', label: 'سلة المحذوفات', icon: 'trash', category: 'system', perms: ['manage_trash', 'purge_trash'], route: '/trash', subtitle: 'العناصر المحذوفة مؤقتاً' },
  { id: 'activity-logs', label: 'سجلات النشاط', icon: 'list', category: 'system', perms: ['view_activity_logs'], route: '/activity-logs', subtitle: 'سجل نشاط المستخدمين' },
];

/** 🧩 لوحة البطاقات التحليلية — تعرض فقط الوحدات التي يملك المستخدم صلاحية الوصول إليها */
export const DashModulesGrid = ({ numbers }: { numbers?: Numbers }) => {
  const router = useRouter();
  const { hasAnyPermission } = useAuth();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';

  const visible = useMemo(
    () => MODULES
      .filter((m) => hasAnyPermission(m.perms))
      .map((m) => (m.id === 'faculties' ? { ...m, route: isAdmin ? '/general-settings' : '' } : m)),
    [hasAnyPermission, isAdmin]
  );

  if (visible.length === 0) {
    return (
      <View style={styles.empty} testID="dash-modules-empty">
        <Ionicons name="lock-closed-outline" size={48} color="#cbd5e1" />
        <Text style={styles.emptyTitle}>لا توجد وحدات متاحة</Text>
        <Text style={styles.emptyText}>ليس لديك صلاحية الوصول لأي وحدة حالياً. يرجى التواصل مع الإدارة.</Text>
      </View>
    );
  }

  return (
    <View style={styles.grid} testID="dash-modules-grid">
      {visible.map((m) => {
        const c = CATEGORY_COLORS[m.category];
        const value = m.numbersKey && numbers ? (numbers[m.numbersKey] ?? 0) : '—';
        return (
          <TouchableOpacity
            key={m.id}
            style={[styles.card, { borderColor: c.border }]}
            onPress={() => { if (m.route) router.push(m.route as any); }}
            activeOpacity={m.route ? 0.75 : 1}
            testID={`dash-module-${m.id}`}
          >
            <View style={styles.topRow}>
              <View style={[styles.pill, { backgroundColor: c.bg }]}>
                <Text style={[styles.pillText, { color: c.text }]}>{c.label}</Text>
              </View>
              <View style={[styles.iconWrap, { backgroundColor: c.bg }]}>
                <Ionicons name={m.icon} size={20} color={c.text} />
              </View>
            </View>
            <Text style={[styles.value, NUM_FONT, { color: c.text }]} testID={`dash-module-${m.id}-value`}>{value}</Text>
            <Text style={styles.title} numberOfLines={1}>{m.label}</Text>
            <Text style={styles.subtitle} numberOfLines={1}>{m.subtitle}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  grid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 14 },
  card: { width: '23%', minWidth: 190, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, padding: 16 },
  topRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  pillText: { fontSize: 10.5, fontWeight: '800' },
  iconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  value: { fontSize: 26, fontWeight: '900', textAlign: 'right' },
  title: { fontSize: 14, fontWeight: '800', color: '#0f172a', textAlign: 'right', marginTop: 4 },
  subtitle: { fontSize: 11.5, color: '#64748b', textAlign: 'right', marginTop: 2 },
  empty: { backgroundColor: '#fff', borderRadius: 16, padding: 40, alignItems: 'center', gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  emptyText: { fontSize: 13, color: '#94a3b8', textAlign: 'center' },
});
