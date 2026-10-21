import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  TextInput,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import api from '../src/services/api';
import { useAuth } from '../src/contexts/AuthContext';
import { useAuthStore } from '../src/store/authStore';

interface PrepPeriod {
  id: string;
  date_from: string;
  date_to: string;
  scope: string;
  scope_id?: string | null;
  scope_name: string;
  scope_label: string;
  reason: string;
  created_at?: string;
  created_by_name: string;
}

interface SimpleOption { id: string; name: string; }

const SCOPES: { value: string; label: string }[] = [
  { value: 'all', label: 'الجامعة بالكامل' },
  { value: 'faculty', label: 'كلية محددة' },
  { value: 'department', label: 'قسم محدد' },
  { value: 'course', label: 'مقرر محدد' },
];

const showAlert = (title: string, msg: string) => {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${msg}`);
  else Alert.alert(title, msg);
};

const askConfirm = async (title: string, msg: string): Promise<boolean> => {
  if (Platform.OS === 'web') return window.confirm(`${title}\n\n${msg}`);
  return new Promise((resolve) => {
    Alert.alert(title, msg, [
      { text: 'إلغاء', style: 'cancel', onPress: () => resolve(false) },
      { text: 'حذف', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
};

const DateField = ({ value, onChange, testID }: { value: string; onChange: (v: string) => void; testID: string }) => (
  Platform.OS === 'web' ? (
    <input
      type="date"
      value={value}
      onChange={(e: any) => onChange(e.target.value)}
      data-testid={testID}
      style={{ padding: 10, borderRadius: 8, border: '1px solid #e0e0e0', fontSize: 14, width: '100%', direction: 'ltr' } as any}
    />
  ) : (
    <TextInput
      style={styles.input}
      value={value}
      onChangeText={onChange}
      placeholder="YYYY-MM-DD"
      placeholderTextColor="#aaa"
      testID={testID}
    />
  )
);

export default function PrepLeavePeriodsScreen() {
  const { user: ctxUser } = useAuth();
  const storeUser = useAuthStore((s) => s.user);
  const user: any = ctxUser || storeUser;
  const [items, setItems] = useState<PrepPeriod[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const [faculties, setFaculties] = useState<SimpleOption[]>([]);
  const [departments, setDepartments] = useState<SimpleOption[]>([]);
  const [courses, setCourses] = useState<SimpleOption[]>([]);

  const [formFrom, setFormFrom] = useState('');
  const [formTo, setFormTo] = useState('');
  const [formScope, setFormScope] = useState('all');
  const [formScopeId, setFormScopeId] = useState('');
  const [formReason, setFormReason] = useState('');

  const canManage = user?.role === 'admin' || user?.role === 'dean' || user?.role === 'department_head';

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/prep-leave-periods');
      setItems(r.data.items || []);
    } catch (e: any) {
      showAlert('خطأ', e?.response?.data?.detail || 'تعذر جلب الفترات التحضيرية');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    if (!canManage) {
      showAlert('غير مصرح', 'هذه الصفحة للإدارة فقط');
      return;
    }
    void fetchItems();
    api.get('/faculties').then((r) => setFaculties((r.data || []).map((f: any) => ({ id: f.id, name: f.name })))).catch(() => {});
    api.get('/departments').then((r) => setDepartments((r.data || []).map((d: any) => ({ id: d.id, name: d.name })))).catch(() => {});
    api.get('/semesters/current').then((sr) => {
      const semId = sr?.data?.id;
      return api.get('/courses', semId ? { params: { semester_id: semId } } : undefined);
    }).then((r) => {
      const list = Array.isArray(r.data) ? r.data : (r.data?.items || []);
      setCourses(list.map((c: any) => ({ id: c.id, name: `${c.name}${c.code ? ` (${c.code})` : ''}` })));
    }).catch(() => {
      api.get('/courses').then((r) => {
        const list = Array.isArray(r.data) ? r.data : (r.data?.items || []);
        setCourses(list.map((c: any) => ({ id: c.id, name: `${c.name}${c.code ? ` (${c.code})` : ''}` })));
      }).catch(() => {});
    });
  }, [user, canManage, fetchItems]);

  const resetForm = () => {
    setFormFrom('');
    setFormTo('');
    setFormScope('all');
    setFormScopeId('');
    setFormReason('');
  };

  const scopeOptions = (): SimpleOption[] => {
    if (formScope === 'faculty') return faculties;
    if (formScope === 'department') return departments;
    if (formScope === 'course') return courses;
    return [];
  };

  const handleSave = async () => {
    if (!formFrom || !/^\d{4}-\d{2}-\d{2}$/.test(formFrom)) {
      showAlert('تنبيه', 'الرجاء إدخال تاريخ البداية بصيغة YYYY-MM-DD');
      return;
    }
    if (!formTo || !/^\d{4}-\d{2}-\d{2}$/.test(formTo)) {
      showAlert('تنبيه', 'الرجاء إدخال تاريخ النهاية بصيغة YYYY-MM-DD');
      return;
    }
    if (formTo < formFrom) {
      showAlert('تنبيه', 'تاريخ النهاية يجب أن يكون بعد البداية');
      return;
    }
    if (formScope !== 'all' && !formScopeId) {
      showAlert('تنبيه', 'حدد الكلية/القسم/المقرر المستهدف');
      return;
    }
    setSaving(true);
    try {
      const opt = scopeOptions().find((o) => o.id === formScopeId);
      await api.post('/prep-leave-periods', {
        date_from: formFrom,
        date_to: formTo,
        scope: formScope,
        scope_id: formScope === 'all' ? null : formScopeId,
        scope_name: opt?.name || '',
        reason: formReason.trim(),
      });
      setShowModal(false);
      resetForm();
      await fetchItems();
    } catch (e: any) {
      showAlert('خطأ', e?.response?.data?.detail || 'فشل الحفظ');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (p: PrepPeriod) => {
    const ok = await askConfirm('تأكيد الحذف', `حذف الفترة التحضيرية ${p.date_from} ← ${p.date_to}؟`);
    if (!ok) return;
    try {
      await api.delete(`/prep-leave-periods/${p.id}`);
      await fetchItems();
    } catch (e: any) {
      showAlert('خطأ', e?.response?.data?.detail || 'فشل الحذف');
    }
  };



  return (
    <>
      <Stack.Screen options={{ title: 'إجازة التحضير', headerBackTitle: 'رجوع' }} />
      <SafeAreaView style={styles.container} edges={['bottom']} testID="prep-leave-periods-screen">
        <View style={styles.headerCard}>
          <Ionicons name="book" size={28} color="#fff" />
          <Text style={styles.headerTitle}>إجازة التحضير</Text>
          <Text style={styles.headerSub}>إعفاء غياب الطلاب خلال أيام تحضيرية قبيل الاختبارات — قرار يدوي</Text>
        </View>

        <View style={styles.infoBox}>
          <Ionicons name="information-circle" size={18} color="#1565c0" />
          <Text style={styles.infoText}>
            أي محاضرة ضمن الفترة والنطاق المحدَّدين تُستبعد من احتساب الغياب لكل الطلاب تلقائياً (لا تُعد نقصاً ولا غياباً).
          </Text>
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity style={[styles.actionBtn, styles.btnPrimary]} onPress={() => { resetForm(); setShowModal(true); }} testID="add-prep-period-btn">
            <Ionicons name="add-circle" size={20} color="#fff" />
            <Text style={styles.actionBtnText}>إضافة فترة تحضيرية</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {loading ? (
            <View style={styles.center}><ActivityIndicator size="large" color="#1565c0" /></View>
          ) : items.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="book-outline" size={48} color="#bbb" />
              <Text style={styles.emptyText}>لا توجد فترات تحضيرية بعد</Text>
            </View>
          ) : (
            items.map((p) => (
              <View key={p.id} style={styles.card} testID={`prep-period-${p.id}`}>
                <View style={styles.scopeBadge}>
                  <Text style={styles.scopeBadgeText}>{p.scope_label}{p.scope_name ? `: ${p.scope_name}` : ''}</Text>
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.cardDates}>{p.date_from} ← {p.date_to}</Text>
                  {p.reason ? <Text style={styles.cardReason}>{p.reason}</Text> : null}
                  <Text style={styles.cardMeta}>بواسطة {p.created_by_name}</Text>
                </View>
                <TouchableOpacity onPress={() => handleDelete(p)} style={styles.iconBtn} testID={`delete-prep-period-${p.id}`}>
                  <Ionicons name="trash-outline" size={20} color="#c62828" />
                </TouchableOpacity>
              </View>
            ))
          )}
        </ScrollView>

        <Modal visible={showModal} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modal}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>إضافة فترة تحضيرية</Text>
                <TouchableOpacity onPress={() => { setShowModal(false); resetForm(); }}>
                  <Ionicons name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: 520 }}>
                <View style={styles.formGroup}>
                  <Text style={styles.label}>من تاريخ *</Text>
                  <DateField value={formFrom} onChange={setFormFrom} testID="form-from-input" />
                </View>
                <View style={styles.formGroup}>
                  <Text style={styles.label}>إلى تاريخ *</Text>
                  <DateField value={formTo} onChange={setFormTo} testID="form-to-input" />
                </View>
                <View style={styles.formGroup}>
                  <Text style={styles.label}>النطاق</Text>
                  <View style={styles.typesGrid}>
                    {SCOPES.map((s) => (
                      <TouchableOpacity
                        key={s.value}
                        style={[styles.typeChip, formScope === s.value && styles.typeChipActive]}
                        onPress={() => { setFormScope(s.value); setFormScopeId(''); }}
                        testID={`scope-chip-${s.value}`}
                      >
                        <Text style={[styles.typeChipText, formScope === s.value && { color: '#fff' }]}>{s.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                {formScope !== 'all' && (
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>اختر {SCOPES.find((s) => s.value === formScope)?.label}</Text>
                    <View style={styles.dropdownWrap}>
                      <Picker selectedValue={formScopeId} onValueChange={(v) => setFormScopeId(String(v))} testID="scope-id-picker">
                        <Picker.Item label="— اختر —" value="" />
                        {scopeOptions().map((o) => (
                          <Picker.Item key={o.id} label={o.name} value={o.id} />
                        ))}
                      </Picker>
                    </View>
                  </View>
                )}
                <View style={styles.formGroup}>
                  <Text style={styles.label}>السبب / القرار (اختياري)</Text>
                  <TextInput
                    style={[styles.input, { height: 70, textAlignVertical: 'top' }]}
                    value={formReason}
                    onChangeText={setFormReason}
                    placeholder="مثال: أيام تحضيرية قبل اختبارات الفصل الأول بقرار مجلس الكلية"
                    placeholderTextColor="#aaa"
                    multiline
                    testID="form-reason-input"
                  />
                </View>
              </ScrollView>
              <View style={styles.modalActions}>
                <TouchableOpacity style={[styles.actionBtn, styles.btnSecondary]} onPress={() => { setShowModal(false); resetForm(); }}>
                  <Text style={[styles.actionBtnText, { color: '#666' }]}>إلغاء</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtn, styles.btnPrimary, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving} testID="save-prep-period-btn">
                  {saving ? <ActivityIndicator color="#fff" /> : (<><Ionicons name="save" size={18} color="#fff" /><Text style={styles.actionBtnText}>حفظ</Text></>)}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fb' },
  center: { alignItems: 'center', padding: 32 },
  headerCard: { backgroundColor: '#7c3aed', padding: 16, alignItems: 'center', borderBottomLeftRadius: 18, borderBottomRightRadius: 18 },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700', marginTop: 6 },
  headerSub: { color: '#ede9fe', fontSize: 12, marginTop: 4, textAlign: 'center', paddingHorizontal: 16 },
  infoBox: { flexDirection: 'row', backgroundColor: '#e3f2fd', marginHorizontal: 12, marginTop: 10, padding: 10, borderRadius: 8, gap: 6, alignItems: 'flex-start' },
  infoText: { flex: 1, color: '#1565c0', fontSize: 11, lineHeight: 17, textAlign: 'right' },
  actionsRow: { flexDirection: 'row', gap: 8, padding: 12 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, flex: 1, minWidth: 110 },
  btnPrimary: { backgroundColor: '#7c3aed' },
  btnSecondary: { backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#e0e0e0' },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  empty: { alignItems: 'center', padding: 40 },
  emptyText: { color: '#666', fontSize: 16, fontWeight: '600', marginTop: 10 },
  card: { flexDirection: 'row', backgroundColor: '#fff', marginHorizontal: 12, marginVertical: 4, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#eee', alignItems: 'center', gap: 10 },
  scopeBadge: { backgroundColor: '#7c3aed', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, maxWidth: 110 },
  scopeBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700', textAlign: 'center' },
  cardBody: { flex: 1 },
  cardDates: { fontSize: 13, fontWeight: '700', color: '#212121', textAlign: 'right' },
  cardReason: { fontSize: 11, color: '#666', marginTop: 2, textAlign: 'right' },
  cardMeta: { fontSize: 10, color: '#999', marginTop: 2, textAlign: 'right' },
  iconBtn: { padding: 6 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modal: { backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden', width: '94%', maxWidth: 460, alignSelf: 'center' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: '#eee' },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#7c3aed' },
  formGroup: { padding: 14, paddingBottom: 0 },
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6, textAlign: 'right' },
  input: { borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, backgroundColor: '#fafafa', textAlign: 'right' },
  typesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  typeChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: '#e0e0e0', backgroundColor: '#fafafa' },
  typeChipActive: { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },
  typeChipText: { fontSize: 12, color: '#555', fontWeight: '600' },
  dropdownWrap: { borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, overflow: 'hidden', backgroundColor: '#fafafa' },
  modalActions: { flexDirection: 'row', gap: 8, padding: 14, borderTopWidth: 1, borderTopColor: '#eee' },
});
