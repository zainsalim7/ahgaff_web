import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, ActivityIndicator, Platform, Alert, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api, { courseGroupsAPI } from '../services/api';
import { groupColor } from './CourseGroupsModal';

interface Props {
  visible: boolean;
  studentIds: string[];
  onClose: () => void;
  onDone?: () => void;
}

/** تعيين الطلاب المحددين إلى مجموعة داخل أحد المقررات المسجّلين فيها */
export const AssignGroupModal: React.FC<Props> = ({ visible, studentIds, onClose, onDone }) => {
  const [courses, setCourses] = useState<any[]>([]);
  const [courseId, setCourseId] = useState('');
  const [groups, setGroups] = useState<Array<{ key: string; name: string; count: number }>>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setCourseId(''); setGroups([]);
    setLoading(true);
    api.post('/enrollments/of-students', { student_ids: studentIds })
      .then(r => setCourses(r.data || []))
      .catch(() => setCourses([]))
      .finally(() => setLoading(false));
  }, [visible]);

  useEffect(() => {
    if (!courseId) { setGroups([]); return; }
    courseGroupsAPI.get(courseId).then(r => setGroups(r.data.groups || [])).catch(() => setGroups([]));
  }, [courseId]);

  const assign = async (group: string | null) => {
    setBusy(true);
    try {
      const r = await courseGroupsAPI.assign(courseId, studentIds, group);
      const msg = r.data?.message || 'تم';
      Platform.OS === 'web' ? window.alert(msg) : Alert.alert('تم', msg);
      onDone?.();
      onClose();
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'فشل التعيين';
      Platform.OS === 'web' ? window.alert(msg) : Alert.alert('خطأ', msg);
    } finally { setBusy(false); }
  };

  const selected = courses.find(c => c.id === courseId);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={st.overlay}>
        <View style={st.card} testID="assign-group-modal">
          <View style={st.header}>
            <TouchableOpacity onPress={onClose} testID="assign-group-close"><Ionicons name="close" size={22} color="#5b6678" /></TouchableOpacity>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={st.title}>👥 تعيين مجموعة</Text>
              <Text style={st.sub}>{studentIds.length} طالب محدد</Text>
            </View>
          </View>
          {loading ? <ActivityIndicator style={{ margin: 30 }} color="#1565c0" /> : (
            <ScrollView style={{ padding: 16 }}>
              <Text style={st.lbl}>1) اختر المقرر</Text>
              {courses.length === 0 && <Text style={st.empty}>الطلاب المحددون غير مسجلين في أي مقرر.</Text>}
              {courses.map(c => (
                <TouchableOpacity key={c.id} onPress={() => setCourseId(c.id)} style={[st.row, courseId === c.id && st.rowOn]} testID={`assign-group-course-${c.id}`}>
                  <Text style={st.rowSub}>{c.enrolled_count}/{studentIds.length} مسجّل</Text>
                  <Text style={st.rowTxt}>{c.name} <Text style={{ color: '#90a4ae' }}>({c.code})</Text></Text>
                </TouchableOpacity>
              ))}
              {courseId ? (
                <>
                  <Text style={[st.lbl, { marginTop: 14 }]}>2) اختر المجموعة في «{selected?.name}»</Text>
                  {groups.length === 0 ? (
                    <Text style={st.empty}>لا توجد مجموعات معرّفة لهذا المقرر — أنشئها من صفحة طلاب المقرر (زر المجموعات).</Text>
                  ) : (
                    <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 }}>
                      {groups.map(g => (
                        <TouchableOpacity key={g.key} disabled={busy} onPress={() => assign(g.key)} style={[st.gChip, { backgroundColor: groupColor(g.key, groups) }]} testID={`assign-group-pick-${g.key}`}>
                          <Text style={st.gTxt}>{g.name}</Text>
                          <Text style={st.gCount}>{g.count} طالب</Text>
                        </TouchableOpacity>
                      ))}
                      <TouchableOpacity disabled={busy} onPress={() => assign(null)} style={[st.gChip, { backgroundColor: '#78909c' }]} testID="assign-group-pick-none">
                        <Text style={st.gTxt}>إزالة من المجموعات</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              ) : null}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
};

const st = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(20,30,55,0.5)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  card: { backgroundColor: '#fff', borderRadius: 14, width: '100%', maxWidth: 520, maxHeight: '88%', overflow: 'hidden' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eef1f6' },
  title: { fontSize: 17, fontWeight: '800', color: '#1a2540' },
  sub: { fontSize: 12, color: '#5b6678', marginTop: 2 },
  lbl: { fontSize: 13, fontWeight: '800', color: '#334155', textAlign: 'right', marginBottom: 8 },
  empty: { fontSize: 12, color: '#90a4ae', textAlign: 'right', marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#eef1f6', marginBottom: 6, backgroundColor: '#fafbfd' },
  rowOn: { borderColor: '#1565c0', backgroundColor: '#e3f2fd' },
  rowTxt: { fontSize: 13, color: '#1a2540', fontWeight: '700', textAlign: 'right', flex: 1 },
  rowSub: { fontSize: 11, color: '#5b6678' },
  gChip: { borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14, alignItems: 'center', minWidth: 90 },
  gTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },
  gCount: { color: '#fff', fontSize: 10, opacity: 0.9 },
});
