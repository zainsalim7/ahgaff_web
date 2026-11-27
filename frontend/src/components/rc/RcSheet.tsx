import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import { downloadBlob } from '../results/resultsUi';
import { Sheet, RcRow, TABS, TabId, TAB_FIELD, Field, FIELD_AR, Btn, Msg, confirmBox, rc } from './rcUi';
import { RcMarksTable, DecKind, visibleRows, canField, ekey } from './RcMarksTable';
import { RcBulkBar } from './RcBulkBar';
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

export const RcSheet = ({ courseId, perms, onBack, onFaculty, onPublish }: { courseId: string; perms: RcPerms; onBack: () => void; onFaculty?: (id: string) => void; onPublish?: (c: Sheet['course']) => void }) => {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [tab, setTab] = useState<TabId>('eligibility');
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [modal, setModal] = useState<'' | 'import' | 'log'>('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [dec, setDec] = useState<{ row: RcRow; kind: DecKind } | null>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    try { const d = (await api.get(`/rc/courses/${courseId}/sheet`)).data; setSheet(d); onFaculty?.(d.course.faculty_id || ''); }
    catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.detail || 'تعذر جلب الكشف' }); }
  }, [courseId]);
  useEffect(() => { load(); }, [load]);

  const switchTab = async (t: TabId) => {
    if (Object.keys(edits).length && !(await confirmBox('لديك تعديلات غير محفوظة ستُفقد. متابعة؟'))) return;
    setEdits({}); setErrors({}); setMsg(null); setSel(new Set()); setTab(t);
  };
  const field = TAB_FIELD[tab];
  const canEdit = field === 'coursework' ? perms.cw : !!field && perms.exams;
  const canSave = canEdit || (tab === 'coursework' && perms.exams);

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      const errs: Record<string, string> = {}; const keep: Record<string, string> = {}; const texts: string[] = [];
      const isClear = (v: string) => ['', '-', '—', '–'].includes(v.trim());
      const order: [Field, boolean][] = [['exceptional_exam', true], ['second_exam', true], ['first_exam', true], ['coursework', true],
        ['coursework', false], ['first_exam', false], ['second_exam', false], ['exceptional_exam', false]];
      for (const [fld, clear] of order) {
        const items = Object.entries(edits).filter(([k, v]) => k.startsWith(`${fld}:`) && isClear(v) === clear).map(([k, value]) => ({ student_db_id: k.slice(fld.length + 1), value }));
        if (!items.length) continue;
        const r = await api.put(`/rc/courses/${courseId}/marks`, { field: fld, marks: items });
        if (r.data.saved) texts.push(r.data.message.replace('تم حفظ', clear ? 'تم إلغاء رصد' : 'تم حفظ'));
        else if ((r.data.errors || []).length) texts.push(r.data.message);
        (r.data.errors || []).forEach((e: any) => { errs[e.student_db_id] = `${FIELD_AR[fld]}: ${e.error}`; const k = `${fld}:${e.student_db_id}`; if (edits[k] !== undefined) keep[k] = edits[k]; });
      }
      setErrors(errs); setEdits(keep);
      setMsg({ ok: !Object.keys(errs).length, text: texts.join(' · ') }); await load();
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
              <Text style={{ fontSize: 12, color: '#64748b', textAlign: 'right' }}>السعي من {s.coursework_max} · الامتحان من {s.final_max} · التأهل {s.coursework_pass_pct}% من السعي · نجاح الأول {(s as any).exam_pass_pct ?? 50}% من الامتحان + التعويض · نجاح الثاني {s.pass_mark} · سقف الثاني {s.second_cap}</Text>
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
        {field && canSave && <Btn icon="save-outline" label={dirty ? `حفظ التعديلات (${dirty})` : 'حفظ التعديلات'} color="#2962ff" onPress={save} disabled={busy || !dirty} testID="rc-save-btn" />}
        {field && canEdit && <Btn icon="cloud-upload-outline" label="استيراد من Excel" color="#0f766e" onPress={() => setModal('import')} testID="rc-import-open-btn" disabled={field === 'coursework' && locked} />}
        {(tab === 'coursework' || tab === 'eligibility') && !locked && perms.cw && <Btn icon="lock-closed-outline" label="إقفال السعي واعتماد الأهلية" color="#2e7d32" onPress={() => lock(true)} testID="rc-lock-btn" />}
        {(tab === 'coursework' || tab === 'eligibility') && locked && perms.unlock && <Btn icon="lock-open-outline" label="فتح السعي" color="#ef6c00" outline onPress={() => lock(false)} testID="rc-unlock-btn" />}
        {onPublish && <Btn icon="checkmark-done-outline" label={locked ? 'اعتماد هذا المقرر ← النتائج' : 'اعتماد ← النتائج (أقفل السعي أولاً)'} color="#2e7d32" onPress={() => onPublish(sheet.course)} disabled={!locked || !sheet.course.department_id || !sheet.course.semester_id} testID="rc-course-publish-btn" />}
        <Btn icon="download-outline" label="تصدير الكشف Excel" color="#475569" outline onPress={exportX} testID="rc-export-btn" />
        <Btn icon="time-outline" label="سجل التعديلات" color="#475569" outline onPress={() => setModal('log')} testID="rc-log-btn" />
      </View>
      <Msg m={msg} testID="rc-sheet-msg" />
      <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e3e7ee', borderRadius: 10, paddingHorizontal: 12, height: 40, maxWidth: 420, marginBottom: 10 }}>
        <Ionicons name="search" size={16} color="#8a95a8" />
        <TextInput style={{ flex: 1, textAlign: 'right', fontSize: 14, color: '#1a2540', outlineStyle: 'none' as any }} value={q} onChangeText={setQ}
          placeholder="ابحث عن طالب بالاسم أو رقم القيد" placeholderTextColor="#94a3b8" testID="rc-student-search" />
        {!!q && <TouchableOpacity onPress={() => setQ('')} testID="rc-student-search-clear"><Ionicons name="close-circle" size={16} color="#94a3b8" /></TouchableOpacity>}
      </View>
      {sel.size > 0 && field && (
        <RcBulkBar count={sel.size} onClear={() => setSel(new Set())}
          fields={(tab === 'coursework' ? ['coursework', 'first_exam', 'second_exam'] : [field]).filter((x) => (x === 'coursework' ? perms.cw && !locked : perms.exams)) as Field[]}
          onApply={(fl, val) => {
            const ok = sheet.rows.filter((r) => sel.has(r.student_db_id) && canField(fl, r, locked, perms.cw, perms.exams));
            setEdits({ ...edits, ...Object.fromEntries(ok.map((r) => [ekey(fl, r.student_db_id), val])) });
            setMsg({ ok: ok.length === sel.size, text: `عُبّئت ${ok.length} خانة (${FIELD_AR[fl]})${ok.length < sel.size ? ` · تُخطّي ${sel.size - ok.length} طالب غير مسموح له في هذه الخانة` : ''} — اضغط «حفظ التعديلات»` });
          }} />
      )}
      <View style={[rc.card, { overflow: 'hidden' }]}>
        <RcMarksTable sel={sel} onSel={(id) => { const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); setSel(n); }}
          onSelAll={(ids) => { const all = ids.every((i) => sel.has(i)); const n = new Set(sel); ids.forEach((i) => (all ? n.delete(i) : n.add(i))); setSel(n); }} tab={tab} sheet={sheet} q={q} edits={edits} errors={errors} canEdit={canEdit} canDecide={perms.decide} canExams={perms.exams}
          setEdit={(id, v) => setEdits({ ...edits, [id]: v })} onDecision={(row, kind) => setDec({ row, kind })} />
      </View>
      <Text style={{ fontSize: 11.5, color: '#64748b', textAlign: 'right' }}>اكتب «غ» لمن غاب عن امتحان الدور، واكتب «-» لإلغاء الرصد (تعود الخانة «لم يُرصد») ثم «حفظ التعديلات». للتحديد المتعدد استخدم المربعات بجانب الأسماء. حدود الغياب: بلا عذر أكبر من الحد · بعذر أكبر من الحد · الإجمالي يبلغ الحد = غير مؤهل (ما لم يستثنه مجلس الكلية).</Text>

      {modal === 'import' && field && <RcImportModal courseId={courseId} courseName={sheet.course.name} field={field} onClose={() => setModal('')} onDone={load} />}
      {modal === 'log' && <RcLogModal courseId={courseId} onClose={() => setModal('')} onChanged={load} canUndo={false} />}
      {dec && <RcDecisionModal courseId={courseId} row={dec.row} kind={dec.kind} cap={dec.kind === 'exceptional' ? s.exceptional_cap : s.second_cap}
        onClose={() => setDec(null)} onDone={() => { setDec(null); load(); }} />}
    </View>
  );
};
