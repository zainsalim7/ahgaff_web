import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import { ModalShell, downloadBlob } from '../results/resultsUi';
import { Btn, Msg, Badge, rc } from './rcUi';
import { ScrollBox } from '../ScrollBox';

type Cell = { points: number | null; letter: string | null; weighted: number | null; state: 'pass' | 'second' | 'pending' } | null;
type Tot = { points: number | null; units: number; gpa: number | null; label?: string | null; source?: string };
type Row = { student_db_id: string; name: string; reg_no: string; cells: Cell[]; sem: Tot; prev: Tot; cum: Tot };
type Data = { courses: { id: string; name: string; credits: any }[]; rows: Row[]; missing_credits: string[] };

const T: Record<string, any> = {
  table: { borderCollapse: 'separate', borderSpacing: 0, direction: 'rtl', fontFamily: 'inherit', minWidth: '100%' },
  g: { fontSize: 12, fontWeight: 800, color: '#1a2540', padding: '6px 4px', borderLeft: '1px solid #e3e7ee', borderBottom: '1px solid #e3e7ee', whiteSpace: 'nowrap', textAlign: 'center' },
  h: { fontSize: 11, fontWeight: 800, color: '#475569', padding: '6px 4px', background: '#f8fafc', borderLeft: '1px solid #eef1f6', borderBottom: '1px solid #e3e7ee', minWidth: 64, textAlign: 'center' },
  c: { fontSize: 12.5, color: '#1a2540', padding: '7px 4px', borderLeft: '1px solid #f0f2f7', borderBottom: '1px solid #f0f2f7', textAlign: 'center' },
  stick0: { position: 'sticky', top: 0, zIndex: 3 },
  stick1: { position: 'sticky', top: 30, zIndex: 3 },
};
const n = (v: any) => (v === null || v === undefined ? '-' : String(v));
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
  const exportX = async (fmt: 'xlsx' | 'pdf') => {
    try { downloadBlob((await api.get('/rc/level-sheet/export', { params: { ...params, fmt }, responseType: 'blob' })).data, `كشف الدور الأول - ${departmentName} م${level}.${fmt}`); } catch { setErr('فشل التصدير'); }
  };
  return (
    <View testID="rc-level-sheet">
      <View style={[rc.card, { padding: 14, flexDirection: 'row-reverse', alignItems: 'center', gap: 10, flexWrap: 'wrap' }]}>
        <TouchableOpacity onPress={onBack} testID="rc-level-back-btn"><Ionicons name="arrow-forward" size={22} color="#2962ff" /></TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: '800', color: '#1a2540' }}>كشف نتيجة الدور الأول · {departmentName} · المستوى {level}</Text>
        <View style={{ flex: 1 }} />
        {canImport && <Btn icon="cloud-upload-outline" label="رفع التراكمي السابق" color="#0f766e" onPress={() => setImp(true)} testID="rc-prev-open-btn" />}
        <Btn icon="download-outline" label="تصدير Excel" color="#475569" outline onPress={() => exportX('xlsx')} testID="rc-level-export-btn" />
        <Btn icon="document-outline" label="تصدير PDF" color="#b91c1c" outline onPress={() => exportX('pdf')} testID="rc-level-export-pdf-btn" />
      </View>
      {!!err && <Text style={{ color: '#c62828', textAlign: 'right', marginBottom: 8 }} testID="rc-level-error">{err}</Text>}
      {!!d?.missing_credits.length && <Text style={{ color: '#ef6c00', textAlign: 'right', marginBottom: 8 }} testID="rc-level-credits-warn">مقررات بلا وحدات دراسية مسجلة (تُحسب 0): {d.missing_credits.join('، ')}</Text>}
      {!d ? <ActivityIndicator style={{ marginTop: 20 }} /> : (
        <View style={[rc.card, { overflow: 'hidden' }]}>
          <ScrollBox testID="rc-level-table">
            <table style={T.table}>
              <thead>
                <tr>
                  <th style={{ ...T.g, ...T.stick0, background: '#fff' }} colSpan={2} rowSpan={1}></th>
                  {d.courses.map((c) => <th key={c.id} colSpan={3} style={{ ...T.g, ...T.stick0, background: '#eef4ff' }}>{c.name} · {c.credits || '-'} و</th>)}
                  {['التحصيل الفصلي الحالي', 'التحصيل التراكمي السابق', 'التحصيل التراكمي الحالي'].map((x) => <th key={x} colSpan={3} style={{ ...T.g, ...T.stick0, background: '#fff7e0' }}>{x}</th>)}
                </tr>
                <tr>
                  <th style={{ ...T.h, ...T.stick1, width: 36 }}>الرقم</th>
                  <th style={{ ...T.h, ...T.stick1, minWidth: 200, right: 0 }}>الاسم</th>
                  {d.courses.map((c) => <React.Fragment key={c.id}><th style={{ ...T.h, ...T.stick1 }}>المعدل بالنقاط</th><th style={{ ...T.h, ...T.stick1 }}>التقدير</th><th style={{ ...T.h, ...T.stick1 }}>النقاط المرجحة</th></React.Fragment>)}
                  {['المعدل الفصلي', 'المعدل السابق', 'المعدل التراكمي'].map((x) => <React.Fragment key={x}><th style={{ ...T.h, ...T.stick1 }}>مجموع النقاط المرجحة</th><th style={{ ...T.h, ...T.stick1 }}>مجموع الوحدات</th><th style={{ ...T.h, ...T.stick1 }}>{x}</th></React.Fragment>)}
                </tr>
              </thead>
              <tbody>
                {d.rows.map((r, i) => (
                  <tr key={r.student_db_id} style={{ background: i % 2 ? '#fbfcfe' : '#fff' }} data-testid={`rc-level-row-${r.student_db_id}`}>
                    <td style={{ ...T.c, color: '#94a3b8' }}>{i + 1}</td>
                    <td style={{ ...T.c, textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap', position: 'sticky', right: 0, background: i % 2 ? '#fbfcfe' : '#fff', zIndex: 1 }}>{r.name}</td>
                    {r.cells.map((c, j) => (
                      <React.Fragment key={j}>
                        <td style={{ ...T.c, color: '#c2410c', fontWeight: 800 }}>{!c || c.state === 'pending' ? '' : n(c.points)}</td>
                        <td style={{ ...T.c, fontWeight: 800, color: c?.state === 'second' ? '#c62828' : '#1a2540' }}>{c?.letter || ''}</td>
                        <td style={T.c}>{!c || c.state === 'pending' ? '' : n(c.weighted)}</td>
                      </React.Fragment>
                    ))}
                    {[r.sem, r.prev, r.cum].map((t, k) => (
                      <React.Fragment key={k}>
                        <td style={T.c}>{n(t.points)}</td><td style={T.c}>{n(t.units)}</td>
                        <td style={{ ...T.c, fontWeight: 800, color: t.label ? '#c62828' : '#1565c0' }}>{t.label || n(t.gpa)}</td>
                      </React.Fragment>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollBox>
        </View>
      )}
      <Text style={{ fontSize: 11.5, color: '#64748b', textAlign: 'right' }}>المعدل بالنقاط = المجموع ÷ 20 · أ ≥ 4.5 · ب ≥ 4 · ج ≥ 3.25 · د ≥ 2.5 · هـ أقل · من بقي له مقرر في الدور الثاني يظهر «دور ثان» مكان المعدل. التراكمي السابق من الملف المرفوع، وإلا من الفصول المعتمدة في النظام.</Text>
      {imp && <PrevImport params={params} onClose={() => setImp(false)} onDone={load} />}
    </View>
  );
};
