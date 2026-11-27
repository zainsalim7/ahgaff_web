import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import { ModalShell, downloadBlob } from '../results/resultsUi';
import { Btn, Msg, Badge, rc } from './rcUi';

type Cell = { points: number | null; letter: string | null; weighted: number | null; state: 'pass' | 'second' | 'pending' } | null;
type Tot = { points: number | null; units: number; gpa: number | null; label?: string | null; source?: string };
type Row = { student_db_id: string; name: string; reg_no: string; cells: Cell[]; sem: Tot; prev: Tot; cum: Tot };
type Data = { courses: { id: string; name: string; credits: any }[]; rows: Row[]; missing_credits: string[] };

const W = 68;
const n = (v: any) => (v === null || v === undefined ? '-' : String(v));
const H = ({ t, w = W, bg = '#f8fafc' }: { t: string; w?: number; bg?: string }) => (
  <Text style={{ width: w, fontSize: 11, fontWeight: '800', color: '#475569', textAlign: 'center', backgroundColor: bg, paddingVertical: 6, borderLeftWidth: 1, borderColor: '#eef1f6' }} numberOfLines={2}>{t}</Text>
);
const C = ({ t, w = W, color = '#1a2540', bold }: { t: string; w?: number; color?: string; bold?: boolean }) => (
  <Text style={{ width: w, fontSize: 12.5, color, fontWeight: bold ? '800' : '500', textAlign: 'center', paddingVertical: 8, borderLeftWidth: 1, borderColor: '#f0f2f7' }}>{t}</Text>
);
const Group = ({ title, w, bg }: { title: string; w: number; bg: string }) => (
  <Text style={{ width: w, textAlign: 'center', fontWeight: '800', fontSize: 12, color: '#1a2540', backgroundColor: bg, paddingVertical: 6, borderLeftWidth: 1, borderColor: '#e3e7ee' }} numberOfLines={1}>{title}</Text>
);
const TotCells = ({ t, gpaRed }: { t: Tot; gpaRed?: boolean }) => (
  <>
    <C t={n(t.points)} /><C t={n(t.units)} />
    <C t={t.label || n(t.gpa)} bold color={t.label ? '#c62828' : gpaRed ? '#c62828' : '#1565c0'} />
  </>
);

const PrevImport = ({ params, onClose, onDone }: { params: any; onClose: () => void; onDone: () => void }) => {
  const [file, setFile] = useState<File | null>(null);
  const [prev, setPrev] = useState<any>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const send = async (commit: boolean) => {
    if (!file) return;
    const fd = new FormData(); fd.append('file', file); Object.entries(params).forEach(([k, v]) => fd.append(k, String(v))); fd.append('commit', commit ? 'true' : 'false');
    try { const r = await api.post('/rc/prev-totals/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } }); commit ? (setMsg({ ok: true, text: r.data.message }), setPrev(null), onDone()) : setPrev(r.data); }
    catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.detail || 'فشل الرفع' }); }
  };
  return (
    <ModalShell title="رفع التحصيل التراكمي السابق" icon="cloud-upload-outline" onClose={onClose} testID="rc-prev-modal">
      <Text style={[rc.td, { color: '#475569', marginBottom: 8 }]}>الأعمدة: رقم القيد | مجموع النقاط المرجحة السابق | مجموع الوحدات السابق. تُستبدل به قيم النظام لهذا الفصل.</Text>
      {Platform.OS === 'web' && (
        <label style={{ display: 'block', margin: '6px 0 10px', padding: 10, border: '1.5px dashed #90caf9', borderRadius: 10, textAlign: 'center', cursor: 'pointer', color: '#1565c0', fontWeight: 700 }} data-testid="rc-prev-file-label">
          {file ? `الملف: ${file.name}` : 'اختر ملف الإكسل'}
          <input type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} data-testid="rc-prev-file-input" onChange={(e: any) => { setFile(e.target.files?.[0] || null); setPrev(null); }} />
        </label>
      )}
      <Msg m={msg} testID="rc-prev-msg" />
      {!prev ? <Btn icon="eye-outline" label="معاينة" color="#1565c0" onPress={() => send(false)} disabled={!file} testID="rc-prev-preview-btn" /> : (
        <View>
          <Text style={[rc.td, { fontWeight: '800', marginBottom: 6 }]} testID="rc-prev-counts">يُحفظ: {prev.counts.ok} · مرفوض: {prev.counts.rejected}</Text>
          <Btn icon="checkmark-done" label="اعتماد وحفظ" color="#2e7d32" onPress={() => send(true)} disabled={!prev.counts.ok} testID="rc-prev-commit-btn" />
          {prev.rows.map((r: any, i: number) => (
            <View key={i} style={rc.tr}>
              <Text style={[rc.td, { flex: 1 }]}>{r.reg_no}</Text><Text style={[rc.td, { flex: 2 }]} numberOfLines={1}>{r.name || '—'}</Text>
              <Text style={[rc.td, { flex: 1 }]}>{r.points} / {r.units}</Text>
              <View style={{ flex: 2 }}><Badge text={r.reason || 'يُحفظ'} color={r.status === 'ok' ? '#2e7d32' : '#c62828'} /></View>
            </View>
          ))}
        </View>
      )}
    </ModalShell>
  );
};

export const RcLevelSheet = ({ departmentId, departmentName, level, semesterId, canImport, onBack }: {
  departmentId: string; departmentName: string; level: string; semesterId: string; canImport: boolean; onBack: () => void;
}) => {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState('');
  const [imp, setImp] = useState(false);
  const params = { department_id: departmentId, level, semester_id: semesterId };
  const load = useCallback(async () => {
    try { setD((await api.get('/rc/level-sheet', { params })).data); } catch (e: any) { setErr(e?.response?.data?.detail || 'تعذر جلب الكشف'); }
  }, [departmentId, level, semesterId]);
  useEffect(() => { load(); }, [load]);
  const exportX = async () => {
    try { downloadBlob((await api.get('/rc/level-sheet/export', { params, responseType: 'blob' })).data, `كشف الدور الأول - ${departmentName} م${level}.xlsx`); } catch { setErr('فشل التصدير'); }
  };
  const tot = W * 3;
  return (
    <View testID="rc-level-sheet">
      <View style={[rc.card, { padding: 14, flexDirection: 'row-reverse', alignItems: 'center', gap: 10, flexWrap: 'wrap' }]}>
        <TouchableOpacity onPress={onBack} testID="rc-level-back-btn"><Ionicons name="arrow-forward" size={22} color="#2962ff" /></TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: '800', color: '#1a2540' }}>كشف نتيجة الدور الأول · {departmentName} · المستوى {level}</Text>
        <View style={{ flex: 1 }} />
        {canImport && <Btn icon="cloud-upload-outline" label="رفع التراكمي السابق" color="#0f766e" onPress={() => setImp(true)} testID="rc-prev-open-btn" />}
        <Btn icon="download-outline" label="تصدير Excel" color="#475569" outline onPress={exportX} testID="rc-level-export-btn" />
      </View>
      {!!err && <Text style={{ color: '#c62828', textAlign: 'right', marginBottom: 8 }} testID="rc-level-error">{err}</Text>}
      {!!d?.missing_credits.length && <Text style={{ color: '#ef6c00', textAlign: 'right', marginBottom: 8 }} testID="rc-level-credits-warn">مقررات بلا وحدات دراسية مسجلة (تُحسب 0): {d.missing_credits.join('، ')}</Text>}
      {!d ? <ActivityIndicator style={{ marginTop: 20 }} /> : (
        <View style={[rc.card, { overflow: 'hidden' }]}>
          <ScrollView horizontal>
            <View testID="rc-level-table" style={{ direction: 'rtl' } as any}>
              <View style={{ flexDirection: 'row-reverse' }}>
                <Group title="" w={36 + 200} bg="#fff" />
                {d.courses.map((c) => <Group key={c.id} title={`${c.name} · ${c.credits || '-'} و`} w={tot} bg="#eef4ff" />)}
                <Group title="التحصيل الفصلي الحالي" w={tot} bg="#fff7e0" />
                <Group title="التحصيل التراكمي السابق" w={tot} bg="#fff7e0" />
                <Group title="التحصيل التراكمي الحالي" w={tot} bg="#fff7e0" />
              </View>
              <View style={{ flexDirection: 'row-reverse' }}>
                <H t="الرقم" w={36} /><H t="الاسم" w={200} />
                {d.courses.map((c) => <React.Fragment key={c.id}><H t="المعدل بالنقاط" /><H t="التقدير" /><H t="النقاط المرجحة" /></React.Fragment>)}
                {[0, 1, 2].map((i) => <React.Fragment key={i}><H t="مجموع النقاط المرجحة" /><H t="مجموع الوحدات" /><H t={i === 0 ? 'المعدل الفصلي' : i === 1 ? 'المعدل السابق' : 'المعدل التراكمي'} /></React.Fragment>)}
              </View>
              {d.rows.map((r, i) => (
                <View key={r.student_db_id} style={{ flexDirection: 'row-reverse', borderTopWidth: 1, borderColor: '#f0f2f7', backgroundColor: i % 2 ? '#fbfcfe' : '#fff' }} testID={`rc-level-row-${r.student_db_id}`}>
                  <C t={String(i + 1)} w={36} color="#94a3b8" />
                  <Text style={{ width: 200, fontSize: 13, fontWeight: '700', color: '#1a2540', textAlign: 'right', paddingHorizontal: 8, paddingVertical: 8 }} numberOfLines={1}>{r.name}</Text>
                  {r.cells.map((c, j) => (
                    <React.Fragment key={j}>
                      <C t={!c || c.state === 'pending' ? '' : n(c.points)} color="#c2410c" bold />
                      <C t={c?.letter || ''} color={c?.state === 'second' ? '#c62828' : '#1a2540'} bold />
                      <C t={!c || c.state === 'pending' ? '' : n(c.weighted)} />
                    </React.Fragment>
                  ))}
                  <TotCells t={r.sem} /><TotCells t={r.prev} /><TotCells t={r.cum} />
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      )}
      <Text style={{ fontSize: 11.5, color: '#64748b', textAlign: 'right' }}>المعدل بالنقاط = المجموع ÷ 20 · أ ≥ 4.5 · ب ≥ 4 · ج ≥ 3.25 · د ≥ 2.5 · هـ أقل · من بقي له مقرر في الدور الثاني يظهر «دور ثان» مكان المعدل. التراكمي السابق من الملف المرفوع، وإلا من الفصول المعتمدة في النظام.</Text>
      {imp && <PrevImport params={params} onClose={() => setImp(false)} onDone={load} />}
    </View>
  );
};
