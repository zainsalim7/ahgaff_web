import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import api from '../../services/api';
import { ModalShell, downloadBlob } from '../results/resultsUi';
import { Field, FIELD_AR, Btn, Msg, Badge, rc } from './rcUi';

type PRow = { reg_no: string; name: string; value: string | null; old: any; status: 'ok' | 'unchanged' | 'exists' | 'rejected'; reason?: string };
const ST = { ok: { t: 'يُحفظ', c: '#2e7d32' }, unchanged: { t: 'بلا تغيير', c: '#64748b' }, exists: { t: 'موجودة — تُركت', c: '#1565c0' }, rejected: { t: 'مرفوض', c: '#c62828' } };

export const RcImportModal = ({ courseId, courseName, field, onClose, onDone }: { courseId: string; courseName: string; field: Field; onClose: () => void; onDone: () => void }) => {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ rows: PRow[]; counts: any } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const template = async () => {
    try { downloadBlob((await api.get(`/rc/courses/${courseId}/template`, { params: { field }, responseType: 'blob' })).data, `${FIELD_AR[field]} - ${courseName}.xlsx`); }
    catch { setMsg({ ok: false, text: 'فشل تنزيل النموذج' }); }
  };
  const send = async (commit: boolean) => {
    if (!file) { setMsg({ ok: false, text: 'اختر ملف الإكسل أولاً' }); return; }
    setBusy(true); setMsg(null);
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('field', field); fd.append('commit', commit ? 'true' : 'false');
      const r = await api.post(`/rc/courses/${courseId}/import`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (!commit) { setPreview(r.data); return; }
      setMsg({ ok: true, text: r.data.message }); setPreview(null); setFile(null); onDone();
    } catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.detail || 'فشل الرفع' }); } finally { setBusy(false); }
  };
  const c = preview?.counts;
  return (
    <ModalShell title={`استيراد ${FIELD_AR[field]} من Excel · ${courseName}`} icon="cloud-upload-outline" onClose={onClose} testID="rc-import-modal">
      <Text style={[rc.td, { marginBottom: 8, color: '#475569' }]}>الأعمدة: رقم القيد | الدرجة. اكتب «غ» للغائب عن الامتحان. تُضاف الدرجات الجديدة فقط، ومن له درجة مرصودة تُترك درجته كما هي (عدّلها يدوياً إن لزم). يُرفض أي طالب غير مسجّل في المقرر أو غير مسموح له في هذه المرحلة.</Text>
      <View style={{ flexDirection: 'row-reverse', gap: 8, marginBottom: 8 }}>
        <Btn icon="download-outline" label="تنزيل النموذج بأسماء الطلاب" color="#22c55e" onPress={template} testID="rc-import-template-btn" />
      </View>
      {Platform.OS === 'web' && (
        <label style={{ display: 'block', margin: '6px 0 10px', padding: 10, border: '1.5px dashed #90caf9', borderRadius: 10, textAlign: 'center', cursor: 'pointer', color: '#1565c0', fontWeight: 700, background: '#fff' }} data-testid="rc-import-file-label">
          {file ? `الملف: ${file.name}` : 'اختر ملف الإكسل (xlsx / xls / csv)'}
          <input type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} data-testid="rc-import-file-input" onChange={(e: any) => { setFile(e.target.files?.[0] || null); setPreview(null); }} />
        </label>
      )}
      <Msg m={msg} testID="rc-import-msg" />
      {!preview ? (
        <TouchableOpacity style={[rc.btn, { backgroundColor: '#1565c0', justifyContent: 'center' }]} onPress={() => send(false)} disabled={busy} testID="rc-import-preview-btn">
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={rc.btnTxt}>معاينة قبل الحفظ</Text>}
        </TouchableOpacity>
      ) : (
        <View testID="rc-import-preview">
          <Text style={[rc.td, { fontWeight: '800', marginBottom: 6 }]} testID="rc-import-counts">يُحفظ (جديد): {c.ok} · موجودة وتُركت: {c.exists} · بلا تغيير: {c.unchanged} · مرفوض: {c.rejected}</Text>
          <View style={{ flexDirection: 'row-reverse', gap: 8, marginBottom: 10 }}>
            <Btn icon="checkmark-done" label={`اعتماد وحفظ (${c.ok})`} color="#2e7d32" onPress={() => send(true)} disabled={busy || !c.ok} testID="rc-import-commit-btn" />
            <Btn icon="close" label="إلغاء" color="#78909c" onPress={() => setPreview(null)} testID="rc-import-cancel-btn" />
          </View>
          {preview.rows.map((r, i) => (
            <View key={i} style={[rc.tr, { borderRightWidth: 3, borderRightColor: ST[r.status].c }]}>
              <Text style={[rc.td, { flex: 1 }]}>{r.reg_no}</Text>
              <Text style={[rc.td, { flex: 2 }]} numberOfLines={1}>{r.name || '—'}</Text>
              <Text style={[rc.td, { flex: 1, fontWeight: '800' }]}>{r.value ?? '—'}{r.old !== null && r.old !== undefined && r.status === 'ok' ? `  (السابق ${r.old})` : ''}</Text>
              <View style={{ flex: 2 }}><Badge text={r.reason ? `${ST[r.status].t}: ${r.reason}` : ST[r.status].t} color={ST[r.status].c} /></View>
            </View>
          ))}
        </View>
      )}
    </ModalShell>
  );
};
