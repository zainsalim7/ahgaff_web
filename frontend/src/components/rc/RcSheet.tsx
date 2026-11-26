import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import { downloadBlob } from '../results/resultsUi';
import { Sheet, RcRow, TABS, TabId, TAB_FIELD, Btn, Msg, confirmBox, rc } from './rcUi';
import { RcMarksTable, DecKind } from './RcMarksTable';
import { RcImportModal } from './RcImportModal';
import { RcDecisionModal } from './RcDecisionModal';
import { RcLogModal } from './RcLogModal';

export type RcPerms = { cw: boolean; unlock: boolean; exams: boolean; decide: boolean };

const Count = ({ label, value, color }: { label: string; value: number; color: string }) => (
  <View style={{ alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: `${color}12`, minWidth: 84 }}>
    <Text style={{ fontSize: 18, fontWeight: '800', color }}>{value}</Text>
    <Text style={{ fontSize: 11.5, color: '#475569' }}>{label}</Text>
  </View>
);

export const RcSheet = ({ courseId, perms, onBack, onFaculty }: { courseId: string; perms: RcPerms; onBack: () => void; onFaculty?: (id: string) => void }) => {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [tab, setTab] = useState<TabId>('coursework');
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [modal, setModal] = useState<'' | 'import' | 'log'>('');
  const [dec, setDec] = useState<{ row: RcRow; kind: DecKind } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { const d = (await api.get(`/rc/courses/${courseId}/sheet`)).data; setSheet(d); onFaculty?.(d.course.faculty_id || ''); }
    catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.detail || 'تعذر جلب الكشف' }); }
  }, [courseId]);
  useEffect(() => { load(); }, [load]);

  const switchTab = async (t: TabId) => {
    if (Object.keys(edits).length && !(await confirmBox('لديك تعديلات غير محفوظة ستُفقد. متابعة؟'))) return;
    setEdits({}); setErrors({}); setMsg(null); setTab(t);
  };
  const field = TAB_FIELD[tab];
  const canEdit = field === 'coursework' ? perms.cw : !!field && perms.exams;

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await api.put(`/rc/courses/${courseId}/marks`, { field, marks: Object.entries(edits).map(([student_db_id, value]) => ({ student_db_id, value })) });
      setErrors(Object.fromEntries((r.data.errors || []).map((e: any) => [e.student_db_id, e.error])));
      setEdits(Object.fromEntries(Object.entries(edits).filter(([k]) => (r.data.errors || []).some((e: any) => e.student_db_id === k))));
      setMsg({ ok: !(r.data.errors || []).length, text: r.data.message }); await load();
    } catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.detail || 'فشل الحفظ' }); } finally { setBusy(false); }
  };
  const lock = async (locked: boolean) => {
    if (!(await confirmBox(locked ? 'إقفال السعي واعتماد كشف الأهلية؟ لن يُعدَّل السعي بعدها إلا بصلاحية أعلى.' : 'فتح السعي للتعديل؟ قد تتغير أهلية الطلاب.'))) return;
    try { const r = await api.post(`/rc/courses/${courseId}/lock`, { locked }); setMsg({ ok: true, text: r.data.message }); await load(); }
    catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.detail || 'فشلت العملية' }); }
  };
  const exportX = async () => {
    try { downloadBlob((await api.get(`/rc/courses/${courseId}/export`, { responseType: 'blob' })).data, `كشف ${sheet?.course.name}.xlsx`); }
    catch { setMsg({ ok: false, text: 'فشل التصدير' }); }
  };

  if (!sheet) return <View style={{ padding: 30 }}>{msg ? <Msg m={msg} testID="rc-sheet-msg" /> : <ActivityIndicator />}</View>;
  const c = sheet.counts, s = sheet.settings, locked = sheet.sheet.coursework_locked, dirty = Object.keys(edits).length;
  return (
    <View testID="rc-sheet">
      <View style={[rc.card, { padding: 16 }]}>
        <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10 }}>
            <TouchableOpacity onPress={onBack} testID="rc-back-btn"><Ionicons name="arrow-forward" size={22} color="#2962ff" /></TouchableOpacity>
            <View>
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#1a2540', textAlign: 'right' }} testID="rc-sheet-title">{sheet.course.name}</Text>
              <Text style={{ fontSize: 12, color: '#64748b', textAlign: 'right' }}>السعي من {s.coursework_max} · الامتحان من {s.final_max} · التأهل {s.coursework_pass_pct}% من السعي · النجاح {s.pass_mark} · سقف الثاني {s.second_cap}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6 }}>
            <Ionicons name={locked ? 'lock-closed' : 'lock-open-outline'} size={16} color={locked ? '#2e7d32' : '#ef6c00'} />
            <Text style={{ color: locked ? '#2e7d32' : '#ef6c00', fontWeight: '700', fontSize: 12.5 }} testID="rc-lock-state">{locked ? `السعي مقفل${sheet.sheet.locked_by_name ? ` · ${sheet.sheet.locked_by_name}` : ''}` : 'السعي مفتوح للرصد'}</Text>
          </View>
        </View>
        <ScrollView horizontal contentContainerStyle={{ flexDirection: 'row-reverse', gap: 8, marginTop: 12 }}>
          <Count label="الطلاب" value={c.students} color="#2962ff" />
          <Count label="مؤهل" value={c.eligible} color="#2e7d32" />
          <Count label="غير مؤهل" value={c.not_eligible} color="#c62828" />
          <Count label="ناجح دور أول" value={c.pass1} color="#1565c0" />
          <Count label="دور ثان" value={c.in_second} color="#ef6c00" />
          <Count label="تصفية" value={c.in_exc} color="#6d28d9" />
          <Count label="ناجح" value={c.passed} color="#2e7d32" />
          <Count label="راسب" value={c.failed} color="#c62828" />
          <Count label="معلّق" value={c.pending} color="#64748b" />
        </ScrollView>
      </View>

      <ScrollView horizontal contentContainerStyle={{ flexDirection: 'row-reverse', gap: 6, marginBottom: 12 }}>
        {TABS.map((t) => (
          <TouchableOpacity key={t.id} onPress={() => switchTab(t.id)} testID={`rc-tab-${t.id}`}
            style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingVertical: 9, paddingHorizontal: 14, borderRadius: 10, backgroundColor: tab === t.id ? '#1a2540' : '#fff', borderWidth: 1, borderColor: tab === t.id ? '#1a2540' : '#e3e7ee' }}>
            <Ionicons name={t.icon as any} size={15} color={tab === t.id ? '#fff' : '#475569'} />
            <Text style={{ color: tab === t.id ? '#fff' : '#334155', fontWeight: '700', fontSize: 13 }}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={{ flexDirection: 'row-reverse', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        {field && canEdit && <Btn icon="save-outline" label={dirty ? `حفظ التعديلات (${dirty})` : 'حفظ التعديلات'} color="#2962ff" onPress={save} disabled={busy || !dirty} testID="rc-save-btn" />}
        {field && canEdit && <Btn icon="cloud-upload-outline" label="استيراد من Excel" color="#0f766e" onPress={() => setModal('import')} testID="rc-import-open-btn" disabled={field === 'coursework' && locked} />}
        {(tab === 'coursework' || tab === 'eligibility') && !locked && perms.cw && <Btn icon="lock-closed-outline" label="إقفال السعي واعتماد الأهلية" color="#2e7d32" onPress={() => lock(true)} testID="rc-lock-btn" />}
        {(tab === 'coursework' || tab === 'eligibility') && locked && perms.unlock && <Btn icon="lock-open-outline" label="فتح السعي" color="#ef6c00" outline onPress={() => lock(false)} testID="rc-unlock-btn" />}
        <Btn icon="download-outline" label="تصدير الكشف Excel" color="#475569" outline onPress={exportX} testID="rc-export-btn" />
        <Btn icon="time-outline" label="سجل التعديلات" color="#475569" outline onPress={() => setModal('log')} testID="rc-log-btn" />
      </View>
      <Msg m={msg} testID="rc-sheet-msg" />
      <View style={[rc.card, { overflow: 'hidden' }]}>
        <RcMarksTable tab={tab} sheet={sheet} edits={edits} errors={errors} canEdit={canEdit} canDecide={perms.decide}
          setEdit={(id, v) => setEdits({ ...edits, [id]: v })} onDecision={(row, kind) => setDec({ row, kind })} />
      </View>
      <Text style={{ fontSize: 11.5, color: '#64748b', textAlign: 'right' }}>اكتب «غ» لمن غاب عن امتحان الدور. حدود الغياب: بلا عذر أكبر من الحد · بعذر أكبر من الحد · الإجمالي يبلغ الحد = غير مؤهل (ما لم يستثنه مجلس الكلية).</Text>

      {modal === 'import' && field && <RcImportModal courseId={courseId} courseName={sheet.course.name} field={field} onClose={() => setModal('')} onDone={load} />}
      {modal === 'log' && <RcLogModal courseId={courseId} onClose={() => setModal('')} />}
      {dec && <RcDecisionModal courseId={courseId} row={dec.row} kind={dec.kind} cap={dec.kind === 'exceptional' ? s.exceptional_cap : s.second_cap}
        onClose={() => setDec(null)} onDone={() => { setDec(null); load(); }} />}
    </View>
  );
};
