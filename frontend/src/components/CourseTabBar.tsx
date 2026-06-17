/**
 * شريط تبويبات المقرر — يُعرض في رأس صفحات: المحاضرات، الطلاب، الخطة الدراسية، نظرة عامة.
 * يعطي إحساس "تبويبات موحدة" مع الحفاظ على فصل المسارات (deep-linking).
 * يتضمن أيضاً: بطاقة معلومات المقرر، أزرار تعديل/حذف، breadcrumb.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, ActivityIndicator, ScrollView, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { coursesAPI } from '../services/api';

export type CourseTab = 'overview' | 'lectures' | 'students' | 'plan';

interface CourseTabBarProps {
  courseId: string;
  course?: any;
  activeTab: CourseTab;
  onCourseUpdated?: () => void;
  canManage?: boolean;
  hideEditDelete?: boolean;
}

const TABS: Array<{ key: CourseTab; label: string; icon: any; route: string }> = [
  { key: 'overview',  label: 'نظرة عامة',      icon: 'home-outline',         route: '/course-details' },
  { key: 'lectures',  label: 'المحاضرات',       icon: 'calendar-outline',     route: '/course-lectures' },
  { key: 'students',  label: 'الطلاب',          icon: 'people-outline',       route: '/course-students' },
  { key: 'plan',      label: 'الخطة الدراسية',  icon: 'library-outline',      route: '/manage-study-plan' },
];

export function CourseTabBar({ courseId, course, activeTab, onCourseUpdated, canManage = true, hideEditDelete = false }: CourseTabBarProps) {
  const router = useRouter();
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState<any>({
    name: course?.name || '',
    code: course?.code || '',
    credit_hours: String(course?.credit_hours || 3),
    level: String(course?.level || 1),
    description: course?.description || '',
  });

  React.useEffect(() => {
    if (course) {
      setEditForm({
        name: course.name || '',
        code: course.code || '',
        credit_hours: String(course.credit_hours || 3),
        level: String(course.level || 1),
        description: course.description || '',
      });
    }
  }, [course?.id]);  // eslint-disable-line react-hooks/exhaustive-deps

  const goToTab = (tab: CourseTab) => {
    if (tab === activeTab) return;
    const target = TABS.find(t => t.key === tab);
    if (!target) return;
    const courseName = course?.name ? encodeURIComponent(course.name) : '';
    const url = `${target.route}?courseId=${courseId}${courseName ? `&courseName=${courseName}` : ''}`;
    router.replace(url as any);
  };

  const handleEditSubmit = async () => {
    if (!editForm.name?.trim() || !editForm.code?.trim()) {
      if (Platform.OS === 'web') window.alert('الاسم والكود مطلوبان');
      else Alert.alert('خطأ', 'الاسم والكود مطلوبان');
      return;
    }
    setSaving(true);
    try {
      await coursesAPI.update(courseId, {
        name: editForm.name.trim(),
        code: editForm.code.trim(),
        credit_hours: parseInt(editForm.credit_hours) || 3,
        level: parseInt(editForm.level) || 1,
        description: editForm.description?.trim() || '',
      });
      setShowEdit(false);
      onCourseUpdated?.();
      if (Platform.OS === 'web') window.alert('تم حفظ التعديلات');
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'فشل التعديل';
      if (Platform.OS === 'web') window.alert(msg); else Alert.alert('خطأ', msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    setDeleting(true);
    try {
      await coursesAPI.delete(courseId);
      setShowDelete(false);
      if (Platform.OS === 'web') window.alert('تم حذف المقرر');
      router.replace('/(tabs)/courses' as any);
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'فشل الحذف';
      if (Platform.OS === 'web') window.alert(msg); else Alert.alert('خطأ', msg);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      {/* رأس الصفحة + breadcrumb + إجراءات */}
      <View style={s.headerRow}>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Text style={s.pageTitle}>{course?.name || 'تفاصيل المقرر'}</Text>
          <View style={s.breadcrumb}>
            <TouchableOpacity onPress={() => router.replace('/')}>
              <Text style={s.breadcrumbLink}>الرئيسية</Text>
            </TouchableOpacity>
            <Ionicons name="chevron-back" size={11} color="#8a95a8" />
            <TouchableOpacity onPress={() => router.replace('/(tabs)/courses' as any)}>
              <Text style={s.breadcrumbLink}>المقررات</Text>
            </TouchableOpacity>
            <Ionicons name="chevron-back" size={11} color="#8a95a8" />
            <Text style={s.breadcrumbCurrent} numberOfLines={1}>{course?.code || ''}</Text>
          </View>
        </View>
        {canManage && !hideEditDelete && (
          <View style={s.headerActions}>
            <TouchableOpacity style={[s.headerBtn, s.btnEdit]} onPress={() => setShowEdit(true)} testID="edit-course-btn">
              <Ionicons name="pencil-outline" size={15} color="#fff" />
              <Text style={s.headerBtnText}>تعديل</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.headerBtn, s.btnDelete]} onPress={() => setShowDelete(true)} testID="delete-course-btn">
              <Ionicons name="trash-outline" size={15} color="#fff" />
              <Text style={s.headerBtnText}>حذف</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* بطاقة معلومات المقرر */}
      {course && (
        <View style={s.courseInfoCard}>
          <View style={s.courseInfoIcon}>
            <Ionicons name="book" size={26} color="#fff" />
          </View>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <View style={s.courseInfoTopRow}>
              <View style={s.codeChip}>
                <Text style={s.codeChipText}>{course.code}</Text>
              </View>
              <Text style={s.courseInfoName} numberOfLines={2}>{course.name}</Text>
            </View>
            <View style={s.metaChipsRow}>
              {course.teacher_name && (
                <View style={s.metaChip}>
                  <Ionicons name="person-outline" size={11} color="#5b6678" />
                  <Text style={s.metaChipText}>{course.teacher_name}</Text>
                </View>
              )}
              {course.credit_hours != null && (
                <View style={s.metaChip}>
                  <Ionicons name="time-outline" size={11} color="#5b6678" />
                  <Text style={s.metaChipText}>{course.credit_hours} س.م</Text>
                </View>
              )}
              {course.level != null && (
                <View style={s.metaChip}>
                  <Ionicons name="school-outline" size={11} color="#5b6678" />
                  <Text style={s.metaChipText}>المستوى {course.level}</Text>
                </View>
              )}
              {course.department_name && (
                <View style={s.metaChip}>
                  <Ionicons name="business-outline" size={11} color="#5b6678" />
                  <Text style={s.metaChipText}>{course.department_name}</Text>
                </View>
              )}
              {course.semester_name && (
                <View style={[s.metaChip, { backgroundColor: '#fff3e0' }]}>
                  <Ionicons name="calendar-outline" size={11} color="#ef6c00" />
                  <Text style={[s.metaChipText, { color: '#ef6c00', fontWeight: '700' }]}>{course.semester_name}</Text>
                </View>
              )}
              {course.students_count != null && (
                <View style={s.metaChip}>
                  <Ionicons name="people-outline" size={11} color="#5b6678" />
                  <Text style={s.metaChipText}>{course.students_count} طالب</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      )}

      {/* شريط التبويبات */}
      <View style={s.tabsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {TABS.map((tab) => {
            const active = tab.key === activeTab;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[s.tabBtn, active && s.tabBtnActive]}
                onPress={() => goToTab(tab.key)}
                testID={`tab-${tab.key}`}
              >
                <Ionicons name={tab.icon} size={15} color={active ? '#fff' : '#5b6678'} />
                <Text style={[s.tabBtnText, active && s.tabBtnTextActive]}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Modal تعديل المقرر */}
      <Modal visible={showEdit} transparent animationType="fade" onRequestClose={() => setShowEdit(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>تعديل المقرر</Text>
              <TouchableOpacity onPress={() => setShowEdit(false)} style={s.modalCloseBtn}>
                <Ionicons name="close" size={20} color="#5b6678" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 460 }}>
              <Text style={s.label}>اسم المقرر <Text style={s.required}>*</Text></Text>
              <TextInput
                style={s.input}
                value={editForm.name}
                onChangeText={(v) => setEditForm({ ...editForm, name: v })}
                placeholder="اسم المقرر"
                placeholderTextColor="#a8b1c2"
                testID="edit-name"
              />

              <Text style={s.label}>الكود <Text style={s.required}>*</Text></Text>
              <TextInput
                style={s.input}
                value={editForm.code}
                onChangeText={(v) => setEditForm({ ...editForm, code: v })}
                placeholder="مثال: ISL101"
                placeholderTextColor="#a8b1c2"
                autoCapitalize="characters"
                testID="edit-code"
              />

              <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>الساعات المعتمدة</Text>
                  <TextInput
                    style={s.input}
                    value={editForm.credit_hours}
                    onChangeText={(v) => setEditForm({ ...editForm, credit_hours: v })}
                    keyboardType="numeric"
                    placeholder="3"
                    placeholderTextColor="#a8b1c2"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.label}>المستوى</Text>
                  <TextInput
                    style={s.input}
                    value={editForm.level}
                    onChangeText={(v) => setEditForm({ ...editForm, level: v })}
                    keyboardType="numeric"
                    placeholder="1"
                    placeholderTextColor="#a8b1c2"
                  />
                </View>
              </View>

              <Text style={s.label}>الوصف</Text>
              <TextInput
                style={[s.input, { height: 80, textAlignVertical: 'top' }]}
                value={editForm.description}
                onChangeText={(v) => setEditForm({ ...editForm, description: v })}
                placeholder="وصف مختصر للمقرر"
                placeholderTextColor="#a8b1c2"
                multiline
              />
            </ScrollView>

            <View style={s.modalActions}>
              <TouchableOpacity style={[s.modalBtn, s.modalBtnCancel]} onPress={() => setShowEdit(false)} disabled={saving}>
                <Text style={s.modalBtnCancelText}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modalBtn, s.modalBtnSave]} onPress={handleEditSubmit} disabled={saving} testID="save-edit-btn">
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.modalBtnSaveText}>حفظ التعديلات</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal حذف المقرر */}
      <Modal visible={showDelete} transparent animationType="fade" onRequestClose={() => setShowDelete(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalCard, { maxWidth: 420 }]}>
            <View style={s.deleteIconWrap}>
              <Ionicons name="warning" size={36} color="#c62828" />
            </View>
            <Text style={s.deleteTitle}>حذف المقرر</Text>
            <Text style={s.deleteText}>
              هل أنت متأكد من حذف المقرر &quot;<Text style={{ fontWeight: '800' }}>{course?.name}</Text>&quot;؟
            </Text>
            <Text style={s.deleteWarn}>سيتم حذف جميع المحاضرات والتسجيلات والخطة الدراسية المرتبطة. لا يمكن التراجع.</Text>
            <View style={s.modalActions}>
              <TouchableOpacity style={[s.modalBtn, s.modalBtnCancel]} onPress={() => setShowDelete(false)} disabled={deleting}>
                <Text style={s.modalBtnCancelText}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modalBtn, s.modalBtnDelete]} onPress={handleDeleteConfirm} disabled={deleting} testID="confirm-delete-course-btn">
                {deleting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.modalBtnSaveText}>تأكيد الحذف</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 },
  pageTitle: { fontSize: 24, fontWeight: '700', color: '#1a2540', textAlign: 'right', marginBottom: 4 },
  breadcrumb: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  breadcrumbLink: { fontSize: 12, color: '#2962ff', fontWeight: '500' },
  breadcrumbCurrent: { fontSize: 12, color: '#8a95a8', fontWeight: '500', maxWidth: 280 },
  headerActions: { flexDirection: 'row', gap: 8 },
  headerBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  btnEdit: { backgroundColor: '#1565c0' },
  btnDelete: { backgroundColor: '#c62828' },
  headerBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  courseInfoCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 14, flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 14, borderWidth: 1, borderColor: '#eef1f6' },
  courseInfoIcon: { width: 52, height: 52, borderRadius: 12, backgroundColor: '#2962ff', alignItems: 'center', justifyContent: 'center' },
  courseInfoTopRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' },
  courseInfoName: { fontSize: 17, fontWeight: '700', color: '#1a2540', textAlign: 'right', flex: 1, minWidth: 200 },
  codeChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: '#e3f2fd' },
  codeChipText: { fontSize: 12, color: '#1565c0', fontWeight: '800' },
  metaChipsRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6 },
  metaChip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, backgroundColor: '#f4f6fb' },
  metaChipText: { fontSize: 11, color: '#5b6678', fontWeight: '600' },

  tabsContainer: { backgroundColor: '#fff', borderRadius: 12, padding: 6, marginBottom: 16, borderWidth: 1, borderColor: '#eef1f6' },
  tabBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 },
  tabBtnActive: { backgroundColor: '#2962ff' },
  tabBtnText: { fontSize: 13, fontWeight: '700', color: '#5b6678' },
  tabBtnTextActive: { color: '#fff' },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(20,30,55,0.5)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  modalCard: { backgroundColor: '#fff', borderRadius: 14, padding: 22, width: '100%', maxWidth: 520 },
  modalHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#1a2540' },
  modalCloseBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f4f6fb' },
  label: { fontSize: 12, fontWeight: '600', color: '#1a2540', marginBottom: 5, marginTop: 8, textAlign: 'right' },
  required: { color: '#c62828' },
  input: { borderWidth: 1, borderColor: '#e3e7ee', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, marginBottom: 4, textAlign: 'right', backgroundColor: '#fff', color: '#1a2540', outlineStyle: 'none' as any },
  modalActions: { flexDirection: 'row-reverse', gap: 10, marginTop: 16 },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  modalBtnCancel: { backgroundColor: '#f4f6fb', borderWidth: 1, borderColor: '#e3e7ee' },
  modalBtnCancelText: { color: '#5b6678', fontWeight: '700', fontSize: 13 },
  modalBtnSave: { backgroundColor: '#1565c0' },
  modalBtnSaveText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  modalBtnDelete: { backgroundColor: '#c62828' },

  deleteIconWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#ffebee', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 14 },
  deleteTitle: { fontSize: 18, fontWeight: '800', color: '#c62828', textAlign: 'center', marginBottom: 8 },
  deleteText: { fontSize: 14, color: '#1a2540', textAlign: 'center', marginBottom: 8 },
  deleteWarn: { fontSize: 12, color: '#8a95a8', textAlign: 'center', lineHeight: 18 },
});
