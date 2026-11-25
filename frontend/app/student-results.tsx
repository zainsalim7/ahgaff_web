import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import api from '../src/services/api';

interface Row {
  id: string; reg_no: string; level: number; student_name: string;
  s1_status: string | null; s1_gpa: string | null; s1_grade: string | null;
  s2_status: string | null; s2_gpa: string | null; s2_grade: string | null;
}

const confirmBox = async (msg: string): Promise<boolean> => {
  if (Platform.OS === 'web') return window.confirm(msg);
  return new Promise((r) => Alert.alert('تأكيد', msg, [{ text: 'إلغاء', onPress: () => r(false) }, { text: 'حذف', style: 'destructive', onPress: () => r(true) }]));
};

const v = (x: string | null) => x ?? '—';

type PRow = Row & { row: number; status: string; reason?: string };
type PreviewData = { counts: Record<string, number>; rows: PRow[] };

const BADGE: Record<string, { t: string; c: string; bg: string }> = {
  new: { t: 'جديد', c: '#2e7d32', bg: '#e8f5e9' },
  changed: { t: 'مُحدَّث', c: '#1565c0', bg: '#e3f2fd' },
  unchanged: { t: 'بلا تغيير', c: '#64748b', bg: '#f1f5f9' },
  invalid: { t: 'مرفوض', c: '#c62828', bg: '#ffebee' },
  out_of_scope: { t: 'مرفوض', c: '#c62828', bg: '#ffebee' },
  duplicate: { t: 'مكرر', c: '#ef6c00', bg: '#fff3e0' },
};

const PreviewRow = ({ r }: { r: PRow }) => {
  const b = BADGE[r.status];
  return (
    <View style={[st.pRow, { borderRightColor: b.c }]} testID={`preview-row-${r.row}`}>
      <View style={st.rowHead}>
        <Text style={[st.badge, { color: b.c, backgroundColor: b.bg }]} testID={`preview-status-${r.row}`}>{b.t}</Text>
        <Text style={st.rowTitle}>صف {r.row} · {r.reg_no || '—'} · المستوى {r.level ?? '—'}{r.student_name ? ` · ${r.student_name}` : ''}</Text>
      </View>
      {r.reason ? <Text style={st.reason}>{r.reason}</Text> : null}
      <SemCell title="الفصل الأول" s={r.s1_status} g={r.s1_gpa} gr={r.s1_grade} />
      <SemCell title="الفصل الثاني" s={r.s2_status} g={r.s2_gpa} gr={r.s2_grade} />
    </View>
  );
};

const PreviewPanel = ({ data, notify, setNotify, busy, onCommit, onCancel }: any) => {
  const c = data.counts;
  const saveable = (c.new || 0) + (c.changed || 0);
  const order = ['invalid', 'out_of_scope', 'duplicate', 'new', 'changed', 'unchanged'];
  const rows = [...data.rows].sort((a: PRow, b: PRow) => order.indexOf(a.status) - order.indexOf(b.status));
  return (
    <View style={[st.card, { borderColor: '#90caf9' }]} testID="results-preview-panel">
      <Text style={[st.rowTitle, { marginBottom: 8 }]}>معاينة الملف — لم يُحفظ شيء بعد</Text>
      <Text style={st.hint} testID="results-preview-counts">
        جديد: {c.new} · مُحدَّث: {c.changed} · بلا تغيير: {c.unchanged} · مرفوض: {(c.invalid || 0) + (c.out_of_scope || 0)} · مكرر: {c.duplicate}
      </Text>
      <TouchableOpacity style={st.check} onPress={() => setNotify(!notify)} testID="results-notify-toggle">
        <Ionicons name={notify ? 'checkbox' : 'square-outline'} size={20} color="#1565c0" />
        <Text style={{ color: '#1a2540', marginRight: 6 }}>إرسال إشعار «صدرت نتيجتك» للطلاب الذين أُضيفت أو تغيّرت نتيجتهم</Text>
      </TouchableOpacity>
      <View style={{ flexDirection: 'row-reverse', gap: 8, marginBottom: 10 }}>
        <TouchableOpacity style={[st.btn, { flex: 1, backgroundColor: '#2e7d32', opacity: busy || !saveable ? 0.5 : 1 }]} onPress={onCommit} disabled={busy || !saveable} testID="results-commit-btn">
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={st.btnTxt}>{saveable ? `اعتماد وحفظ (${saveable} صف)` : 'لا يوجد ما يُحفظ'}</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={[st.btn, { flex: 1, backgroundColor: '#78909c' }]} onPress={onCancel} testID="results-cancel-preview-btn">
          <Text style={st.btnTxt}>إلغاء</Text>
        </TouchableOpacity>
      </View>
      {rows.map((r: PRow) => <PreviewRow key={r.row} r={r} />)}
    </View>
  );
};

const SemCell = ({ title, s, g, gr }: { title: string; s: string | null; g: string | null; gr: string | null }) => (
  <View style={st.sem}>
    <Text style={st.semTitle}>{title}</Text>
    <Text style={st.semTxt}>{v(s)} · {v(g)} · {v(gr)}</Text>
  </View>
);

export default function StudentResultsPage() {
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [inputKey, setInputKey] = useState(0);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [notify, setNotify] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async (query = q) => {
    setLoading(true);
    try {
      const res = await api.get('/student-results', { params: { q: query } });
      setItems(res.data.items || []); setTotal(res.data.total || 0);
    } catch (e: any) {
      setMsg({ ok: false, text: e?.response?.data?.detail || 'تعذر جلب النتائج' });
    } finally { setLoading(false); }
  }, [q]);

  useEffect(() => { load(''); }, []);

  const downloadTemplate = async () => {
    try {
      const res = await api.get('/student-results/template', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a'); a.href = url; a.download = 'نموذج نتائج الطلاب.xlsx'; a.click();
      window.URL.revokeObjectURL(url);
    } catch { setMsg({ ok: false, text: 'فشل تنزيل النموذج' }); }
  };

  const upload = async (commit: boolean) => {
    if (!file) { setMsg({ ok: false, text: 'اختر ملف الإكسل أولاً' }); return; }
    setBusy(true); setMsg(null);
    try {
      const fd = new FormData(); fd.append('file', file);
      fd.append('commit', commit ? 'true' : 'false'); fd.append('notify', notify ? 'true' : 'false');
      const res = await api.post('/student-results/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (!commit) { setPreview(res.data); return; }
      setMsg({ ok: true, text: res.data?.message || 'تم الحفظ' });
      setFile(null); setPreview(null); setInputKey((k) => k + 1);
      await load();
    } catch (e: any) {
      setMsg({ ok: false, text: e?.response?.data?.detail || 'فشل الرفع' });
    } finally { setBusy(false); }
  };

  const remove = async (r: Row) => {
    if (!(await confirmBox(`حذف نتيجة القيد ${r.reg_no} — المستوى ${r.level}؟`))) return;
    try { await api.delete(`/student-results/${r.id}`); await load(); }
    catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.detail || 'فشل الحذف' }); }
  };

  return (
    <SafeAreaView style={st.container}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} testID="results-back-btn">
          <Ionicons name="arrow-forward" size={24} color="#1a2540" />
        </TouchableOpacity>
        <Text style={st.title}>نتائج الطلاب (تطبيق الطالب)</Text>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 60 }}>
        <View style={[st.card, { backgroundColor: '#eef6ff' }]}>
          <Text style={st.hint}>
            أعمدة الملف بالترتيب: رقم القيد | المستوى | حالة الفصل1 | معدل الفصل1 | تقدير الفصل1 | حالة الفصل2 | معدل الفصل2 | تقدير الفصل2.{'\n'}
            تُحفظ القيم وتُعرض للطالب حرفياً كما كُتبت دون أي حساب. الخلية الفارغة تظهر للطالب «لم تصدر بعد». إعادة الرفع تستبدل صف نفس الطالب والمستوى.
          </Text>
          <TouchableOpacity style={[st.btn, { backgroundColor: '#2e7d32' }]} onPress={downloadTemplate} testID="results-template-btn">
            <Text style={st.btnTxt}>تنزيل النموذج (Excel)</Text>
          </TouchableOpacity>
          {Platform.OS === 'web' && (
            <label style={{ display: 'block', margin: '10px 0', padding: 10, border: '1.5px dashed #90caf9', borderRadius: 10, textAlign: 'center', cursor: 'pointer', color: '#1565c0', fontWeight: 700, background: '#fff' }} data-testid="results-file-label">
              {file ? `الملف: ${file.name}` : 'اختر ملف الإكسل (xlsx / xls / csv)'}
              <input key={inputKey} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} data-testid="results-file-input"
                onChange={(e: any) => { setFile(e.target.files?.[0] || null); setPreview(null); }} />
            </label>
          )}
          {!preview && (
            <TouchableOpacity style={[st.btn, { backgroundColor: '#1565c0', opacity: busy ? 0.6 : 1 }]} onPress={() => upload(false)} disabled={busy} testID="results-preview-btn">
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={st.btnTxt}>معاينة الملف قبل الحفظ</Text>}
            </TouchableOpacity>
          )}
        </View>

        {preview && (
          <PreviewPanel data={preview} notify={notify} setNotify={setNotify} busy={busy}
            onCommit={() => upload(true)} onCancel={() => setPreview(null)} />
        )}

        {msg && (
          <View style={[st.msg, { backgroundColor: msg.ok ? '#e8f5e9' : '#ffebee' }]} testID="results-msg">
            <Text style={{ color: msg.ok ? '#2e7d32' : '#c62828', textAlign: 'right' }}>{msg.text}</Text>
          </View>
        )}

        <View style={st.searchRow}>
          <TextInput style={st.input} value={q} onChangeText={setQ} onSubmitEditing={() => load()} placeholder="بحث برقم القيد..." testID="results-search-input" />
          <TouchableOpacity style={[st.btn, { backgroundColor: '#455a64', paddingHorizontal: 16 }]} onPress={() => load()} testID="results-search-btn">
            <Ionicons name="search" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
        <Text style={st.count} testID="results-total">عدد الصفوف: {total}{total > items.length ? ` (يُعرض ${items.length})` : ''}</Text>

        {loading ? <ActivityIndicator style={{ marginTop: 20 }} /> : items.length === 0 ? (
          <Text style={st.empty} testID="results-empty">لا توجد نتائج مرفوعة</Text>
        ) : items.map((r) => (
          <View key={r.id} style={st.card} testID={`results-row-${r.id}`}>
            <View style={st.rowHead}>
              <TouchableOpacity onPress={() => remove(r)} testID={`results-delete-${r.id}`}>
                <Ionicons name="trash-outline" size={18} color="#c62828" />
              </TouchableOpacity>
              <Text style={st.rowTitle}>{r.reg_no} · المستوى {r.level}{r.student_name ? ` · ${r.student_name}` : ' · (غير مربوط بطالب)'}</Text>
            </View>
            <SemCell title="الفصل الأول" s={r.s1_status} g={r.s1_gpa} gr={r.s1_grade} />
            <SemCell title="الفصل الثاني" s={r.s2_status} g={r.s2_gpa} gr={r.s2_grade} />
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fb' },
  header: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', padding: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#e5e7eb' },
  title: { fontSize: 17, fontWeight: '800', color: '#1a2540' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#e5e7eb' },
  hint: { fontSize: 12.5, color: '#1e3a5f', textAlign: 'right', lineHeight: 20, marginBottom: 10 },
  btn: { borderRadius: 10, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  btnTxt: { color: '#fff', fontWeight: '700' },
  msg: { borderRadius: 10, padding: 10, marginBottom: 10 },
  searchRow: { flexDirection: 'row-reverse', gap: 8, marginBottom: 6 },
  input: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, textAlign: 'right' },
  count: { fontSize: 12, color: '#64748b', textAlign: 'right', marginBottom: 8 },
  empty: { textAlign: 'center', color: '#94a3b8', marginTop: 20 },
  rowHead: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  rowTitle: { fontWeight: '800', color: '#1a2540', textAlign: 'right', flex: 1, marginLeft: 8 },
  sem: { flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 4 },
  semTitle: { color: '#64748b', fontSize: 12.5 },
  semTxt: { color: '#1a2540', fontSize: 13, fontWeight: '600' },
  pRow: { borderWidth: 1, borderColor: '#e5e7eb', borderRightWidth: 4, borderRadius: 10, padding: 10, marginBottom: 8, backgroundColor: '#fff' },
  badge: { fontSize: 11.5, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, overflow: 'hidden' },
  reason: { color: '#c62828', fontSize: 12, textAlign: 'right', marginBottom: 4 },
  check: { flexDirection: 'row-reverse', alignItems: 'center', marginBottom: 10 },
});
