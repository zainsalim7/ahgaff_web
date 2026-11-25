import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import { PickerField, SEMS, Opt, Fac, facultyMeta, rs, val, downloadBlob } from './resultsUi';

type PRow = { row: number; reg_no: string | null; student_name?: string; status: string | null; gpa: string | null; grade: string | null; status_code: string; reason?: string; warning?: string; old?: any };

const BADGE: Record<string, { t: string; c: string; bg: string }> = {
  new: { t: 'جديد', c: '#2e7d32', bg: '#e8f5e9' }, changed: { t: 'مُحدَّث', c: '#1565c0', bg: '#e3f2fd' },
  unchanged: { t: 'بلا تغيير', c: '#64748b', bg: '#f1f5f9' }, invalid: { t: 'مرفوض', c: '#c62828', bg: '#ffebee' },
  out_of_scope: { t: 'مرفوض', c: '#c62828', bg: '#ffebee' }, duplicate: { t: 'مكرر', c: '#ef6c00', bg: '#fff3e0' },
};
const ORDER = ['invalid', 'out_of_scope', 'duplicate', 'new', 'changed', 'unchanged'];

const PreviewRow = ({ r }: { r: PRow }) => {
  const b = BADGE[r.status_code];
  return (
    <View style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRightWidth: 4, borderRightColor: b.c, borderRadius: 10, padding: 8, marginBottom: 6 }} testID={`preview-row-${r.row}`}>
      <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
        <Text style={rs.title}>صف {r.row} · {r.reg_no || '—'}{r.student_name ? ` · ${r.student_name}` : ''}</Text>
        <Text style={{ color: b.c, backgroundColor: b.bg, fontWeight: '800', fontSize: 11.5, paddingHorizontal: 8, borderRadius: 8 }} testID={`preview-status-${r.row}`}>{b.t}</Text>
      </View>
      <Text style={{ textAlign: 'right', color: '#1a2540', marginTop: 2 }}>{val(r.status)} · {val(r.gpa)} · {val(r.grade)}</Text>
      {r.old && <Text style={{ textAlign: 'right', color: '#64748b', fontSize: 11.5 }}>السابق: {val(r.old.status)} · {val(r.old.gpa)} · {val(r.old.grade)}</Text>}
      {r.reason && <Text style={{ textAlign: 'right', color: '#c62828', fontSize: 12 }}>{r.reason}</Text>}
      {r.warning && <Text style={{ textAlign: 'right', color: '#ef6c00', fontSize: 12 }} testID={`preview-warning-${r.row}`}>⚠ {r.warning}</Text>}
    </View>
  );
};

export const ResultsUploadWizard = ({ years, faculties, departments, restrictedFaculty, onDone, allFaculties }: {
  years: string[]; faculties: Fac[]; departments: (Opt & { faculty_id?: string })[]; restrictedFaculty: boolean; onDone: () => void; allFaculties?: Fac[];
}) => {
  const [p, setP] = useState({ academic_year: years[0] || '', level: '', semester: '', scope: restrictedFaculty ? 'department' : 'faculty', scope_id: '', section: '' });
  const [file, setFile] = useState<File | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const [preview, setPreview] = useState<{ counts: any; rows: PRow[] } | null>(null);
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: string, v: string) => { setP({ ...p, [k]: v, ...(k === 'scope' ? { scope_id: '', level: '', section: '' } : {}), ...(k === 'scope_id' ? { level: '', section: '' } : {}) }); setPreview(null); };
  const facId = p.scope === 'faculty' ? p.scope_id : (departments.find((d) => d.id === p.scope_id)?.faculty_id || '');
  const meta = facultyMeta(allFaculties || faculties, facId);
  const ready = p.academic_year && p.level && p.semester && p.scope_id;
  const params = Object.fromEntries(Object.entries(p).filter(([, v]) => v));

  const template = async () => {
    if (!ready) { setMsg({ ok: false, text: 'حدد السنة والمستوى والفصل والكلية/القسم أولاً' }); return; }
    try {
      const res = await api.get('/results/template', { params, responseType: 'blob' });
      downloadBlob(res.data, `نتائج المستوى ${p.level} الفصل ${p.semester}.xlsx`);
    } catch { setMsg({ ok: false, text: 'فشل تنزيل النموذج' }); }
  };

  const blank = async () => {
    try { downloadBlob((await api.get('/results/template/blank', { responseType: 'blob' })).data, 'نموذج نتائج فارغ.xlsx'); }
    catch { setMsg({ ok: false, text: 'فشل تنزيل النموذج' }); }
  };

  const send = async (commit: boolean) => {
    if (!ready) { setMsg({ ok: false, text: 'حدد السنة والمستوى والفصل والكلية/القسم أولاً' }); return; }
    if (!file) { setMsg({ ok: false, text: 'اختر ملف الإكسل أولاً' }); return; }
    setBusy(true); setMsg(null);
    try {
      const fd = new FormData(); fd.append('file', file);
      Object.entries(params).forEach(([k, v]) => fd.append(k, v as string));
      fd.append('commit', commit ? 'true' : 'false'); fd.append('notify', notify ? 'true' : 'false');
      const res = await api.post('/results/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (!commit) { setPreview(res.data); return; }
      setMsg({ ok: true, text: res.data?.message || 'تم الحفظ' });
      setPreview(null); setFile(null); setInputKey((k) => k + 1); onDone();
    } catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.detail || 'فشل الرفع' }); } finally { setBusy(false); }
  };

  const scopeOpts = p.scope === 'faculty' ? faculties : departments;
  const c = preview?.counts;
  const saveable = c ? (c.new || 0) + (c.changed || 0) : 0;
  return (
    <View>
      <View style={rs.card}>
        <Text style={[rs.title, { marginBottom: 10 }]}>1. حدّد النتيجة المرفوعة</Text>
        <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 12 }}>
          <PickerField label="السنة الدراسية" options={years.map((y) => ({ id: y, name: y }))} value={p.academic_year} onChange={(v) => set('academic_year', v)} testID="up-year" />
          <PickerField label="الفصل" options={SEMS} value={p.semester} onChange={(v) => set('semester', v)} testID="up-sem" />
          <PickerField label="الرفع على" options={[...(restrictedFaculty ? [] : [{ id: 'faculty', name: 'كلية كاملة' }]), { id: 'department', name: 'قسم' }]} value={p.scope} onChange={(v) => set('scope', v)} testID="up-scope" placeholder="اختر..." />
          <PickerField label={p.scope === 'faculty' ? 'الكلية' : 'القسم'} options={scopeOpts} value={p.scope_id} onChange={(v) => set('scope_id', v)} testID="up-target" />
          <PickerField label="المستوى" options={meta.levels} value={p.level} onChange={(v) => set('level', v)} testID="up-level" enabled={!!p.scope_id} placeholder={p.scope_id ? 'اختر...' : 'اختر الكلية/القسم أولاً'} />
          {meta.sections.length > 0 && <PickerField label="الشعبة (اختياري)" options={meta.sections} value={p.section} onChange={(v) => set('section', v)} testID="up-section" allLabel="كل الشعب" />}
        </View>
      </View>
      <View style={rs.card}>
        <Text style={[rs.title, { marginBottom: 6 }]}>2. الملف</Text>
        <Text style={rs.hint}>أعمدة الملف: رقم القيد | الحالة | المعدل | التقدير. تُحفظ القيم حرفياً دون أي حساب، والخلية الفارغة تظهر للطالب «لم تصدر بعد». النموذج يحتوي أسماء طلاب النطاق والمستوى المختار للمرجع.</Text>
        <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <TouchableOpacity style={[rs.btn, { flex: 1, minWidth: 180, backgroundColor: '#22c55e', flexDirection: 'row-reverse', gap: 6 }]} onPress={template} testID="up-template-btn">
            <Ionicons name="people-outline" size={16} color="#fff" /><Text style={rs.btnTxt}>نموذج بأسماء الطلاب</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[rs.btn, { flex: 1, minWidth: 180, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e3e7ee', flexDirection: 'row-reverse', gap: 6 }]} onPress={blank} testID="up-blank-template-btn">
            <Ionicons name="document-outline" size={16} color="#1a2540" /><Text style={{ color: '#1a2540', fontWeight: '700' }}>نموذج فارغ</Text>
          </TouchableOpacity>
        </View>
        {Platform.OS === 'web' && (
          <label style={{ display: 'block', margin: '10px 0', padding: 10, border: '1.5px dashed #90caf9', borderRadius: 10, textAlign: 'center', cursor: 'pointer', color: '#1565c0', fontWeight: 700, background: '#fff' }} data-testid="up-file-label">
            {file ? `الملف: ${file.name}` : 'اختر ملف الإكسل (xlsx / xls / csv)'}
            <input key={inputKey} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} data-testid="up-file-input"
              onChange={(e: any) => { setFile(e.target.files?.[0] || null); setPreview(null); }} />
          </label>
        )}
        {!preview && (
          <TouchableOpacity style={[rs.btn, { backgroundColor: '#1565c0', opacity: busy ? 0.6 : 1 }]} onPress={() => send(false)} disabled={busy} testID="up-preview-btn">
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={rs.btnTxt}>معاينة الملف قبل الحفظ</Text>}
          </TouchableOpacity>
        )}
      </View>
      {msg && <View style={[rs.card, { backgroundColor: msg.ok ? '#e8f5e9' : '#ffebee' }]} testID="up-msg"><Text style={{ color: msg.ok ? '#2e7d32' : '#c62828', textAlign: 'right' }}>{msg.text}</Text></View>}
      {preview && (
        <View style={[rs.card, { borderColor: '#90caf9' }]} testID="up-preview-panel">
          <Text style={[rs.title, { marginBottom: 6 }]}>معاينة — لم يُحفظ شيء بعد</Text>
          <Text style={rs.hint} testID="up-preview-counts">جديد: {c.new} · مُحدَّث: {c.changed} · بلا تغيير: {c.unchanged} · مرفوض: {c.invalid + c.out_of_scope} · مكرر: {c.duplicate} · تنبيهات مستوى: {c.warnings}</Text>
          <TouchableOpacity style={{ flexDirection: 'row-reverse', alignItems: 'center', marginVertical: 8 }} onPress={() => setNotify(!notify)} testID="up-notify-toggle">
            <Ionicons name={notify ? 'checkbox' : 'square-outline'} size={20} color="#1565c0" />
            <Text style={{ marginRight: 6, color: '#1a2540' }}>إرسال إشعار «صدرت نتيجتك» للطلاب الذين أُضيفت أو تغيّرت نتيجتهم</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row-reverse', gap: 8, marginBottom: 8 }}>
            <TouchableOpacity style={[rs.btn, { flex: 1, backgroundColor: '#2e7d32', opacity: busy || !saveable ? 0.5 : 1 }]} onPress={() => send(true)} disabled={busy || !saveable} testID="up-commit-btn">
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={rs.btnTxt}>{saveable ? `اعتماد وحفظ (${saveable} صف)` : 'لا يوجد ما يُحفظ'}</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={[rs.btn, { flex: 1, backgroundColor: '#78909c' }]} onPress={() => setPreview(null)} testID="up-cancel-btn"><Text style={rs.btnTxt}>إلغاء</Text></TouchableOpacity>
          </View>
          {[...preview.rows].sort((a, b) => ORDER.indexOf(a.status_code) - ORDER.indexOf(b.status_code)).map((r) => <PreviewRow key={r.row} r={r} />)}
        </View>
      )}
    </View>
  );
};
