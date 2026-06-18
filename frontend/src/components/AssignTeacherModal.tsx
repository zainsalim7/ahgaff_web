/**
 * AssignTeacherModal — مودال إسناد معلم لمقرر مع البحث والفلترة العابرة للقسم.
 *
 * المميزات:
 * - بحث فوري بالاسم/الرقم.
 * - badge أخضر "نفس القسم" / برتقالي "قسم آخر — عابر" / رمادي "بدون قسم".
 * - فلتر toggle: "إظهار معلمي القسم فقط" (افتراضياً off لإتاحة العبور).
 * - زر "إزالة الإسناد" لمسح teacher_id.
 * - الحفظ عبر PUT /api/courses/{id} → يقوم الخادم تلقائياً بمزامنة teaching_loads.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';

export interface AssignTeacherTeacher {
  id: string;
  teacher_id?: string;
  full_name: string;
  department_id?: string;
  department_ids?: string[];
}

export interface AssignTeacherDepartment {
  id: string;
  name: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  courseId: string;
  courseName?: string;
  courseDepartmentId?: string;
  currentTeacherId?: string;
  teachers: AssignTeacherTeacher[];
  departments: AssignTeacherDepartment[];
  onSaved: (newTeacherId: string | null, teacherName: string) => void;
  /** Form mode: skip API call, only return selection to caller (for embedded use in forms). */
  formMode?: boolean;
}

export function AssignTeacherModal({
  visible,
  onClose,
  courseId,
  courseName,
  courseDepartmentId,
  currentTeacherId,
  teachers,
  departments,
  onSaved,
  formMode = false,
}: Props) {
  const [query, setQuery] = useState('');
  const [pickedId, setPickedId] = useState<string>('');
  const [sameDeptOnly, setSameDeptOnly] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setPickedId(currentTeacherId || '');
      setQuery('');
      setSameDeptOnly(false);
    }
  }, [visible, currentTeacherId]);

  const deptNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const d of departments) map[d.id] = d.name;
    return map;
  }, [departments]);

  const getTeacherDeptName = (t: AssignTeacherTeacher) => {
    const ids = t.department_ids && t.department_ids.length > 0
      ? t.department_ids
      : (t.department_id ? [t.department_id] : []);
    return ids.map(id => deptNameById[id]).filter(Boolean).join(' / ');
  };

  const isSameDept = (t: AssignTeacherTeacher) => {
    if (!courseDepartmentId) return false;
    const ids = t.department_ids && t.department_ids.length > 0
      ? t.department_ids
      : (t.department_id ? [t.department_id] : []);
    return ids.includes(courseDepartmentId);
  };

  const filtered = useMemo(() => {
    const q = query.trim();
    let list = teachers;
    if (sameDeptOnly && courseDepartmentId) {
      list = list.filter(isSameDept);
    }
    if (q) {
      list = list.filter(t =>
        t.full_name?.includes(q) || t.teacher_id?.includes(q)
      );
    }
    // Sort: same-dept first, then by name
    return [...list].sort((a, b) => {
      const aSame = isSameDept(a) ? 0 : 1;
      const bSame = isSameDept(b) ? 0 : 1;
      if (aSame !== bSame) return aSame - bSame;
      return a.full_name.localeCompare(b.full_name, 'ar');
    });
  }, [teachers, query, sameDeptOnly, courseDepartmentId, deptNameById]);

  const showMsg = (title: string, message: string) => {
    if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
    else Alert.alert(title, message);
  };

  const handleSave = async () => {
    if (!courseId) return;
    // Detect cross-dept assignment for confirmation
    const target = teachers.find(t => t.id === pickedId);
    if (target && courseDepartmentId && !isSameDept(target)) {
      const teacherDept = getTeacherDeptName(target) || 'غير معروف';
      const confirmMsg = `المعلم "${target.full_name}" ينتمي لقسم "${teacherDept}" — هل تؤكد الإسناد العابر للقسم؟`;
      const ok = Platform.OS === 'web' ? window.confirm(confirmMsg) : await new Promise<boolean>(resolve => {
        Alert.alert('إسناد عابر للقسم', confirmMsg, [
          { text: 'إلغاء', style: 'cancel', onPress: () => resolve(false) },
          { text: 'تأكيد', onPress: () => resolve(true) },
        ]);
      });
      if (!ok) return;
    }

    try {
      setSaving(true);
      if (formMode) {
        // وضع النموذج: لا نحفظ على الخادم — فقط نُرجع الاختيار
        const name = pickedId ? (teachers.find(t => t.id === pickedId)?.full_name || '') : '';
        onSaved(pickedId || null, name);
        onClose();
        return;
      }
      await api.put(`/courses/${courseId}`, { teacher_id: pickedId || null });
      const name = pickedId ? (teachers.find(t => t.id === pickedId)?.full_name || '') : '';
      onSaved(pickedId || null, name);
      onClose();
    } catch (e: any) {
      showMsg('خطأ', e?.response?.data?.detail || 'فشل حفظ الإسناد');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={styles.card} testID="assign-teacher-modal">
          <View style={styles.header}>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <Text style={styles.title}>إسناد معلم للمقرر</Text>
              {!!courseName && <Text style={styles.subtitle} numberOfLines={1}>{courseName}</Text>}
            </View>
            <TouchableOpacity onPress={onClose} testID="close-assign-teacher-modal">
              <Ionicons name="close" size={22} color="#5b6678" />
            </TouchableOpacity>
          </View>

          {/* البحث */}
          <View style={styles.searchBox}>
            <Ionicons name="search" size={16} color="#8a95a8" />
            <TextInput
              style={styles.searchInput}
              placeholder="ابحث بالاسم أو رقم المعلم..."
              placeholderTextColor="#a8b1c2"
              value={query}
              onChangeText={setQuery}
              testID="teacher-search-input"
            />
            {!!query && (
              <TouchableOpacity onPress={() => setQuery('')} testID="clear-search-btn">
                <Ionicons name="close-circle" size={16} color="#a8b1c2" />
              </TouchableOpacity>
            )}
          </View>

          {/* فلتر نفس القسم */}
          {!!courseDepartmentId && (
            <TouchableOpacity
              style={styles.filterToggle}
              onPress={() => setSameDeptOnly(v => !v)}
              testID="same-dept-toggle"
            >
              <Ionicons
                name={sameDeptOnly ? 'checkbox' : 'square-outline'}
                size={16}
                color={sameDeptOnly ? '#2962ff' : '#8a95a8'}
              />
              <Text style={styles.filterToggleText}>إظهار معلمي القسم فقط</Text>
            </TouchableOpacity>
          )}

          {/* القائمة */}
          <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: 8 }}>
            {/* خيار "بدون معلم" */}
            <TouchableOpacity
              style={[styles.row, pickedId === '' && styles.rowActive]}
              onPress={() => setPickedId('')}
              testID="pick-no-teacher"
            >
              <Ionicons
                name={pickedId === '' ? 'radio-button-on' : 'radio-button-off'}
                size={20}
                color={pickedId === '' ? '#e53935' : '#a8b1c2'}
              />
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <Text style={[styles.rowName, { color: '#e53935' }]}>إزالة الإسناد (بدون معلم)</Text>
              </View>
            </TouchableOpacity>

            {filtered.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="person-outline" size={32} color="#cfd6e1" />
                <Text style={styles.emptyText}>
                  {query ? 'لا يوجد معلم مطابق' : 'لا توجد نتائج'}
                </Text>
              </View>
            ) : (
              filtered.map((t) => {
                const same = isSameDept(t);
                const deptName = getTeacherDeptName(t);
                const isPicked = t.id === pickedId;
                return (
                  <TouchableOpacity
                    key={t.id}
                    style={[styles.row, isPicked && styles.rowActive]}
                    onPress={() => setPickedId(t.id)}
                    testID={`pick-teacher-${t.id}`}
                  >
                    <Ionicons
                      name={isPicked ? 'radio-button-on' : 'radio-button-off'}
                      size={20}
                      color={isPicked ? '#2962ff' : '#a8b1c2'}
                    />
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      <View style={styles.rowTopLine}>
                        {courseDepartmentId ? (
                          same ? (
                            <View style={[styles.badge, styles.badgeSame]}>
                              <Ionicons name="checkmark-circle" size={10} color="#1b5e20" />
                              <Text style={[styles.badgeText, { color: '#1b5e20' }]}>نفس القسم</Text>
                            </View>
                          ) : (
                            <View style={[styles.badge, styles.badgeCross]}>
                              <Ionicons name="swap-horizontal" size={10} color="#bf360c" />
                              <Text style={[styles.badgeText, { color: '#bf360c' }]}>عابر للقسم</Text>
                            </View>
                          )
                        ) : null}
                        <Text style={styles.rowName} numberOfLines={1}>{t.full_name}</Text>
                      </View>
                      <View style={styles.rowMetaLine}>
                        {!!t.teacher_id && <Text style={styles.rowMeta}>#{t.teacher_id}</Text>}
                        {!!deptName && <Text style={styles.rowMeta}>{deptName}</Text>}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.btn, styles.btnGhost]}
              onPress={onClose}
              disabled={saving}
              testID="cancel-assign-btn"
            >
              <Text style={styles.btnGhostText}>إلغاء</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary, saving && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saving}
              testID="save-assign-teacher-btn"
            >
              {saving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={16} color="#fff" />
                  <Text style={styles.btnPrimaryText}>حفظ</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  card: { backgroundColor: '#fff', borderRadius: 12, width: '100%', maxWidth: 560, maxHeight: '90%', display: 'flex', overflow: 'hidden' },
  header: { flexDirection: 'row-reverse', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eef1f5' },
  title: { fontSize: 16, fontWeight: '700', color: '#1f2a37', textAlign: 'right' },
  subtitle: { fontSize: 12, color: '#5b6678', marginTop: 2, textAlign: 'right' },
  searchBox: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, marginHorizontal: 16, marginTop: 12, backgroundColor: '#f6f8fb', borderRadius: 8, borderWidth: 1, borderColor: '#eef1f5' },
  searchInput: { flex: 1, fontSize: 13, color: '#1f2a37', textAlign: 'right', paddingVertical: 4, outlineWidth: 0 as any },
  filterToggle: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, padding: 12, marginHorizontal: 16, marginTop: 8, backgroundColor: '#f6f8fb', borderRadius: 8 },
  filterToggleText: { fontSize: 12, color: '#1f2a37' },
  list: { marginTop: 8, paddingHorizontal: 16, maxHeight: 380 },
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#eef1f5', marginBottom: 6 },
  rowActive: { borderColor: '#2962ff', backgroundColor: '#eef4ff' },
  rowTopLine: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  rowMetaLine: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' },
  rowName: { fontSize: 14, fontWeight: '700', color: '#1f2a37', textAlign: 'right' },
  rowMeta: { fontSize: 11, color: '#5b6678' },
  badge: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgeSame: { backgroundColor: '#e8f5e9' },
  badgeCross: { backgroundColor: '#ffebe9' },
  badgeText: { fontSize: 10, fontWeight: '700' },
  empty: { alignItems: 'center', padding: 24, gap: 8 },
  emptyText: { fontSize: 12, color: '#8a95a8' },
  footer: { flexDirection: 'row-reverse', justifyContent: 'flex-end', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: '#eef1f5' },
  btn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  btnPrimary: { backgroundColor: '#2962ff' },
  btnPrimaryText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  btnGhost: { backgroundColor: '#f6f8fb', borderWidth: 1, borderColor: '#eef1f5' },
  btnGhostText: { color: '#5b6678', fontSize: 13, fontWeight: '700' },
});
