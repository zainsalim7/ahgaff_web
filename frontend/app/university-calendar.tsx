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
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../src/services/api';
import { useAuth } from '../src/contexts/AuthContext';

interface CalendarEvent {
  id: string;
  event_name: string;
  event_type: string;
  notes?: string;
  gregorian_date: string;
  hijri_date: string;
  hijri_formatted: string;
  weekday_ar: string;
}

const EVENT_TYPES: { value: string; label: string; color: string }[] = [
  { value: 'general', label: 'عام', color: '#1565c0' },
  { value: 'holiday', label: 'إجازة', color: '#2e7d32' },
  { value: 'exam', label: 'امتحان', color: '#c62828' },
  { value: 'semester_start', label: 'بداية فصل', color: '#6a1b9a' },
  { value: 'semester_end', label: 'نهاية فصل', color: '#ef6c00' },
  { value: 'registration', label: 'تسجيل', color: '#00838f' },
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
      { text: 'تنفيذ', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
};

const API_URL =
  (typeof process !== 'undefined' && (process.env.EXPO_PUBLIC_BACKEND_URL || process.env.REACT_APP_BACKEND_URL)) ||
  '';

export default function UniversityCalendarScreen() {
  const { user } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [formDate, setFormDate] = useState('');
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState('general');
  const [formNotes, setFormNotes] = useState('');
  const [previewHijri, setPreviewHijri] = useState<string>('');

  const isAdmin = user?.role === 'admin';

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/calendar/events');
      setEvents(r.data || []);
    } catch (e: any) {
      showAlert('خطأ', e?.response?.data?.detail || 'تعذر جلب الأحداث');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    if (!isAdmin) {
      showAlert('غير مصرح', 'هذه الصفحة لمدير النظام فقط');
      return;
    }
    void fetchEvents();
  }, [user, isAdmin, fetchEvents]);

  // Live preview للتحويل عند تغيير التاريخ
  useEffect(() => {
    if (!formDate || !/^\d{4}-\d{2}-\d{2}$/.test(formDate)) {
      setPreviewHijri('');
      return;
    }
    const t = setTimeout(async () => {
      try {
        const r = await api.get(`/calendar/convert?date_str=${formDate}`);
        setPreviewHijri(`${r.data.weekday_ar} - ${r.data.hijri_formatted}`);
      } catch {
        setPreviewHijri('');
      }
    }, 200);
    return () => clearTimeout(t);
  }, [formDate]);

  const resetForm = () => {
    setEditingId(null);
    setFormDate('');
    setFormName('');
    setFormType('general');
    setFormNotes('');
    setPreviewHijri('');
  };

  const openAddModal = () => {
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (ev: CalendarEvent) => {
    setEditingId(ev.id);
    setFormDate(ev.gregorian_date);
    setFormName(ev.event_name);
    setFormType(ev.event_type || 'general');
    setFormNotes(ev.notes || '');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formDate || !/^\d{4}-\d{2}-\d{2}$/.test(formDate)) {
      showAlert('تنبيه', 'الرجاء إدخال تاريخ بصيغة YYYY-MM-DD');
      return;
    }
    if (!formName.trim()) {
      showAlert('تنبيه', 'اسم الحدث مطلوب');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        gregorian_date: formDate,
        event_name: formName.trim(),
        event_type: formType,
        notes: formNotes.trim(),
      };
      if (editingId) {
        await api.put(`/calendar/events/${editingId}`, payload);
      } else {
        await api.post('/calendar/events', payload);
      }
      setShowModal(false);
      resetForm();
      await fetchEvents();
    } catch (e: any) {
      showAlert('خطأ', e?.response?.data?.detail || 'فشل الحفظ');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (ev: CalendarEvent) => {
    const ok = await askConfirm('تأكيد الحذف', `هل تريد حذف "${ev.event_name}"؟`);
    if (!ok) return;
    try {
      await api.delete(`/calendar/events/${ev.id}`);
      await fetchEvents();
    } catch (e: any) {
      showAlert('خطأ', e?.response?.data?.detail || 'فشل الحذف');
    }
  };

  const handleClearAll = async () => {
    const ok = await askConfirm(
      'تحذير - حذف الكل',
      `سيتم حذف جميع الأحداث (${events.length} حدث). هل أنت متأكد؟ هذه العملية لا يمكن التراجع عنها.`,
    );
    if (!ok) return;
    try {
      await api.delete('/calendar/events');
      await fetchEvents();
    } catch (e: any) {
      showAlert('خطأ', e?.response?.data?.detail || 'فشل الحذف');
    }
  };

  const handleImportExcel = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
        ],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const file = result.assets[0];

      const replaceAll = events.length > 0 ? await askConfirm(
        'استيراد من Excel',
        `يوجد ${events.length} حدث حالياً. هل تريد:\n\n• تأكيد = حذف القديم واستيراد الجديد\n• إلغاء = إلغاء العملية\n\nلإضافة فقط بدون حذف، احذف الأحداث القديمة يدوياً أولاً.`,
      ) : false;

      setImporting(true);
      const token = await AsyncStorage.getItem('token');
      const formData = new FormData();
      if (Platform.OS === 'web' && (file as any).file) {
        formData.append('file', (file as any).file);
      } else {
        formData.append('file', {
          uri: file.uri,
          type:
            file.mimeType ||
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          name: file.name,
        } as any);
      }

      const url = `${API_URL}/api/calendar/import-excel?replace_all=${replaceAll ? 'true' : 'false'}`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data?.detail || 'فشل الاستيراد');
      }
      showAlert(
        'تم الاستيراد',
        `تم استيراد ${data.imported} حدث${data.failed_count > 0 ? `\nفشل: ${data.failed_count} صف` : ''}`,
      );
      await fetchEvents();
    } catch (e: any) {
      showAlert('خطأ', e?.message || 'فشل الاستيراد');
    } finally {
      setImporting(false);
    }
  };

  const getTypeMeta = (type: string) =>
    EVENT_TYPES.find((t) => t.value === type) || EVENT_TYPES[0];

  return (
    <>
      <Stack.Screen
        options={{ title: 'التقويم الجامعي', headerBackTitle: 'رجوع' }}
      />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        {/* Header */}
        <View style={styles.headerCard}>
          <Ionicons name="calendar" size={28} color="#fff" />
          <Text style={styles.headerTitle}>التقويم الجامعي</Text>
          <Text style={styles.headerSub}>
            {events.length} حدث | تحويل تلقائي للهجري
          </Text>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.btnPrimary]}
            onPress={openAddModal}
            testID="add-event-btn"
          >
            <Ionicons name="add-circle" size={20} color="#fff" />
            <Text style={styles.actionBtnText}>إضافة حدث</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.btnSuccess]}
            onPress={handleImportExcel}
            disabled={importing}
            testID="import-excel-btn"
          >
            {importing ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="document-attach" size={20} color="#fff" />
                <Text style={styles.actionBtnText}>استيراد Excel</Text>
              </>
            )}
          </TouchableOpacity>

          {events.length > 0 && (
            <TouchableOpacity
              style={[styles.actionBtn, styles.btnDanger]}
              onPress={handleClearAll}
              testID="clear-all-btn"
            >
              <Ionicons name="trash" size={20} color="#fff" />
              <Text style={styles.actionBtnText}>حذف الكل</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Help info */}
        <View style={styles.infoBox}>
          <Ionicons name="information-circle" size={18} color="#1565c0" />
          <Text style={styles.infoText}>
            ملف Excel يحتاج عمودين: "التاريخ" (ميلادي) و "الحدث". التحويل الهجري
            يتم تلقائياً. الصفحة العامة لعرض التقويم للمعلمين والطلاب:{' '}
            <Text style={styles.code}>/calendar</Text>
          </Text>
        </View>

        {/* Events List */}
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#1565c0" />
            </View>
          ) : events.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="calendar-outline" size={48} color="#bbb" />
              <Text style={styles.emptyText}>لا توجد أحداث بعد</Text>
              <Text style={styles.emptySub}>ابدأ بإضافة حدث أو استيراد Excel</Text>
            </View>
          ) : (
            events.map((ev) => {
              const meta = getTypeMeta(ev.event_type);
              return (
                <View key={ev.id} style={styles.eventCard} testID={`event-${ev.id}`}>
                  <View style={[styles.typeBadge, { backgroundColor: meta.color }]}>
                    <Text style={styles.typeBadgeText}>{meta.label}</Text>
                  </View>
                  <View style={styles.eventBody}>
                    <Text style={styles.eventName}>{ev.event_name}</Text>
                    <View style={styles.datesRow}>
                      <View style={styles.dateBox}>
                        <Ionicons name="calendar-clear-outline" size={14} color="#666" />
                        <Text style={styles.dateText}>{ev.weekday_ar} {ev.gregorian_date}</Text>
                      </View>
                      <View style={styles.dateBox}>
                        <Ionicons name="moon-outline" size={14} color="#6a1b9a" />
                        <Text style={[styles.dateText, { color: '#6a1b9a' }]}>{ev.hijri_formatted}</Text>
                      </View>
                    </View>
                    {ev.notes ? (
                      <Text style={styles.notesText}>{ev.notes}</Text>
                    ) : null}
                  </View>
                  <View style={styles.cardActions}>
                    <TouchableOpacity
                      onPress={() => openEditModal(ev)}
                      style={styles.iconBtn}
                      testID={`edit-${ev.id}`}
                    >
                      <Ionicons name="create-outline" size={20} color="#1565c0" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDelete(ev)}
                      style={styles.iconBtn}
                      testID={`delete-${ev.id}`}
                    >
                      <Ionicons name="trash-outline" size={20} color="#c62828" />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>

        {/* Add/Edit Modal */}
        <Modal visible={showModal} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modal}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {editingId ? 'تعديل الحدث' : 'إضافة حدث جديد'}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                >
                  <Ionicons name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>

              <ScrollView style={{ maxHeight: 500 }}>
                <View style={styles.formGroup}>
                  <Text style={styles.label}>التاريخ الميلادي *</Text>
                  <TextInput
                    style={styles.input}
                    value={formDate}
                    onChangeText={setFormDate}
                    placeholder="YYYY-MM-DD (مثال: 2026-09-01)"
                    placeholderTextColor="#aaa"
                    testID="form-date-input"
                  />
                  {Platform.OS === 'web' && (
                    <input
                      type="date"
                      value={formDate}
                      onChange={(e: any) => setFormDate(e.target.value)}
                      style={{
                        marginTop: 6,
                        padding: 10,
                        borderRadius: 8,
                        border: '1px solid #e0e0e0',
                        fontSize: 14,
                        width: '100%',
                        direction: 'ltr',
                      } as any}
                    />
                  )}
                  {previewHijri ? (
                    <View style={styles.hijriPreview}>
                      <Ionicons name="moon" size={14} color="#6a1b9a" />
                      <Text style={styles.hijriPreviewText}>{previewHijri}</Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.label}>اسم الحدث *</Text>
                  <TextInput
                    style={styles.input}
                    value={formName}
                    onChangeText={setFormName}
                    placeholder="مثال: بداية الفصل الأول"
                    placeholderTextColor="#aaa"
                    testID="form-name-input"
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.label}>النوع</Text>
                  <View style={styles.typesGrid}>
                    {EVENT_TYPES.map((t) => (
                      <TouchableOpacity
                        key={t.value}
                        style={[
                          styles.typeChip,
                          formType === t.value && { backgroundColor: t.color, borderColor: t.color },
                        ]}
                        onPress={() => setFormType(t.value)}
                      >
                        <Text
                          style={[
                            styles.typeChipText,
                            formType === t.value && { color: '#fff' },
                          ]}
                        >
                          {t.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.label}>ملاحظات (اختياري)</Text>
                  <TextInput
                    style={[styles.input, { height: 70, textAlignVertical: 'top' }]}
                    value={formNotes}
                    onChangeText={setFormNotes}
                    placeholder="أي تفاصيل إضافية..."
                    placeholderTextColor="#aaa"
                    multiline
                  />
                </View>
              </ScrollView>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.btnSecondary]}
                  onPress={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                >
                  <Text style={[styles.actionBtnText, { color: '#666' }]}>إلغاء</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.btnPrimary, saving && { opacity: 0.6 }]}
                  onPress={handleSave}
                  disabled={saving}
                  testID="save-event-btn"
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="save" size={18} color="#fff" />
                      <Text style={styles.actionBtnText}>حفظ</Text>
                    </>
                  )}
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
  headerCard: {
    backgroundColor: '#1565c0',
    padding: 16,
    alignItems: 'center',
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700', marginTop: 6 },
  headerSub: { color: '#bbdefb', fontSize: 12, marginTop: 4 },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    flexWrap: 'wrap',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    flex: 1,
    minWidth: 110,
  },
  btnPrimary: { backgroundColor: '#1565c0' },
  btnSuccess: { backgroundColor: '#2e7d32' },
  btnDanger: { backgroundColor: '#c62828' },
  btnSecondary: { backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#e0e0e0' },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#e3f2fd',
    marginHorizontal: 12,
    padding: 10,
    borderRadius: 8,
    gap: 6,
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  infoText: { flex: 1, color: '#1565c0', fontSize: 11, lineHeight: 17, textAlign: 'right' },
  code: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', backgroundColor: '#fff', paddingHorizontal: 4, borderRadius: 4 },
  empty: { alignItems: 'center', padding: 40 },
  emptyText: { color: '#666', fontSize: 16, fontWeight: '600', marginTop: 10 },
  emptySub: { color: '#999', fontSize: 13, marginTop: 4 },
  eventCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginVertical: 4,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#eee',
    alignItems: 'center',
    gap: 10,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    minWidth: 60,
    alignItems: 'center',
  },
  typeBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  eventBody: { flex: 1 },
  eventName: { fontSize: 14, fontWeight: '700', color: '#212121', textAlign: 'right' },
  datesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  dateBox: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dateText: { fontSize: 11, color: '#666' },
  notesText: { fontSize: 11, color: '#888', marginTop: 4, textAlign: 'right', fontStyle: 'italic' },
  cardActions: { flexDirection: 'row', gap: 4 },
  iconBtn: { padding: 6 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 16,
  },
  modal: { backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden' },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#1565c0' },
  formGroup: { padding: 14, paddingBottom: 0 },
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6, textAlign: 'right' },
  input: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: '#fafafa',
    textAlign: 'right',
  },
  hijriPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    backgroundColor: '#f3e5f5',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  hijriPreviewText: { color: '#6a1b9a', fontSize: 12, fontWeight: '600' },
  typesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  typeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#fafafa',
  },
  typeChipText: { fontSize: 12, color: '#555', fontWeight: '600' },
  modalActions: {
    flexDirection: 'row',
    gap: 8,
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
});
