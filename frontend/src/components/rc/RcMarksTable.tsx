import React from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RcRow, Sheet, TabId, TAB_FIELD, Field, fmt, Badge, resultColor, rc } from './rcUi';

type Col = { label: string; flex: number; render: (r: RcRow) => React.ReactNode };
export type DecKind = 'second_uncapped' | 'exceptional';

const pct = (v: number, over: boolean) => <Text style={[rc.td, over && { color: '#c62828', fontWeight: '800' }]}>{v ?? 0}%</Text>;
const res = (t: string, id: string) => <Badge text={t} color={resultColor(t)} testID={id} />;

export const rowsForTab = (tab: TabId, rows: RcRow[]) =>
  tab === 'first' ? rows.filter((r) => r.eligible) : tab === 'second' ? rows.filter((r) => r.in_second)
    : tab === 'exceptional' ? rows.filter((r) => r.pass2 === false) : rows;

export const editable = (tab: TabId, r: RcRow, locked: boolean) =>
  tab === 'coursework' ? !locked : r.coursework === null && !(tab === 'second' && r.in_second) ? false : tab === 'first' ? r.eligible : tab === 'second' ? r.in_second : tab === 'exceptional' ? r.in_exc : false;

export const ekey = (f: Field, id: string) => `${f}:${id}`;

const MarkCell = ({ field, r, can, edits, setEdit }: { field: Field; r: RcRow; can: boolean; edits: Record<string, string>; setEdit: (k: string, v: string) => void }) => {
  const k = ekey(field, r.student_db_id);
  if (!can) return <Text style={[rc.td, { fontWeight: '700', minWidth: 40, textAlign: 'center', color: r[field] === null ? '#cbd5e1' : '#1a2540' }]} testID={`mark-ro-${field}-${r.student_db_id}`}>{fmt(r[field])}</Text>;
  return <TextInput style={[rc.input, edits[k] !== undefined && { borderColor: '#f59e0b', backgroundColor: '#fffbeb' }]}
    value={edits[k] ?? (r[field] === null ? '' : String(r[field]))} onChangeText={(v) => setEdit(k, v)} placeholder="—" testID={`mark-${field}-${r.student_db_id}`} />;
};

type CellFn = (f: Field, r: RcRow, can: boolean) => React.ReactNode;

const columns = (tab: TabId, s: Sheet, onDecision: (r: RcRow, k: DecKind) => void, canDecide: boolean, cell: CellFn, canExams: boolean): Col[] => {
  const cfg = s.settings;
  switch (tab) {
    case 'coursework': return [
      { label: `الدور الأول (من ${cfg.final_max})`, flex: 0.9, render: (r) => cell('first_exam', r, canExams && r.coursework !== null && r.eligible) },
      { label: 'الدور الثاني (من 100)', flex: 0.9, render: (r) => cell('second_exam', r, canExams && r.in_second) },
      { label: 'المجموع', flex: 0.7, render: (r) => <Text style={[rc.td, { fontWeight: '800', fontSize: 15 }]} testID={`cw-total-${r.student_db_id}`}>{fmt(r.pass1 !== null ? r.total1 : r.final2 ?? r.total1)}</Text> },
      { label: 'الأهلية', flex: 1.1, render: (r) => r.coursework === null && r.att_ok ? res('لم يُرصد', `cw-st-${r.student_db_id}`)
        : <View><Badge text={r.eligible ? 'مؤهل للأول' : 'دور ثان'} color={r.eligible ? '#2e7d32' : '#ef6c00'} testID={`cw-st-${r.student_db_id}`} />
            {!r.eligible && <Text style={{ fontSize: 10.5, color: '#c62828', textAlign: 'right' }} numberOfLines={1}>{r.reasons.join('، ')}</Text>}</View> },
      { label: 'النتيجة', flex: 1.1, render: (r) => r.coursework === null && r.att_ok ? <Text style={rc.td}>—</Text> : res(r.result, `cw-res-${r.student_db_id}`) },
    ];
    case 'eligibility': return [
      { label: 'أهلية الحضور', flex: 1.1, render: (r) => <Badge text={r.att_eligibility} color={r.att_ok ? '#2e7d32' : '#c62828'} testID={`att-elig-${r.student_db_id}`} /> },
      { label: 'السعي', flex: 0.7, render: (r) => <Text style={[rc.td, !r.cw_ok && { color: '#c62828' }]}>{fmt(r.coursework)}</Text> },
      { label: 'بلا عذر', flex: 0.7, render: (r) => pct(r.att.pct_unexcused, r.att.exceeded_unexcused) },
      { label: 'بعذر', flex: 0.7, render: (r) => pct(r.att.pct_excused, r.att.exceeded_excused) },
      { label: 'الإجمالي', flex: 0.7, render: (r) => pct(r.att.pct_total, r.att.exceeded_total) },
      { label: 'حالة الغياب', flex: 1.3, render: (r) => <Text style={[rc.td, { fontSize: 12 }]} numberOfLines={2}>{r.att.status_ar}</Text> },
      { label: 'الأهلية', flex: 1, render: (r) => res(r.eligibility, `elig-${r.student_db_id}`) },
      { label: 'السبب', flex: 1.5, render: (r) => <Text style={[rc.td, { color: '#c62828', fontSize: 12 }]}>{r.reasons.join('، ') || '—'}</Text> },
    ];
    case 'first': return [
      { label: 'السعي', flex: 0.7, render: (r) => <Text style={rc.td}>{fmt(r.coursework)}</Text> },
      { label: 'يحتاج للنجاح', flex: 0.9, render: (r) => <Text style={[rc.td, { color: '#1565c0' }]}>{r.need_first ?? '—'}</Text> },
      { label: 'المجموع', flex: 0.8, render: (r) => <Text style={[rc.td, { fontWeight: '800' }]}>{fmt(r.total1)}</Text> },
      { label: 'النتيجة', flex: 1, render: (r) => r.pass1 === null ? <Text style={rc.td}>—</Text> : res(r.pass1 ? 'ناجح' : 'راسب', `p1-${r.student_db_id}`) },
    ];
    case 'second': return [
      { label: 'سبب الدخول', flex: 1.4, render: (r) => <Text style={[rc.td, { fontSize: 12 }]}>{r.eligible ? 'راسب في الدور الأول' : `غير مؤهل: ${r.reasons.join('، ')}`}</Text> },
      { label: `المعتمد (سقف ${cfg.second_cap})`, flex: 0.9, render: (r) => <Text style={[rc.td, { fontWeight: '800' }]}>{fmt(r.final2)}</Text> },
      { label: 'قرار المجلس', flex: 1.3, render: (r) => r.decisions.second_uncapped
        ? <TouchableOpacity onPress={() => onDecision(r, 'second_uncapped')} disabled={!canDecide} testID={`dec-unc-${r.student_db_id}`}><Badge text="تُحتسب كاملة" color="#6d28d9" /></TouchableOpacity>
        : canDecide ? <TouchableOpacity onPress={() => onDecision(r, 'second_uncapped')} testID={`dec-unc-add-${r.student_db_id}`}><Text style={{ color: '#6d28d9', fontSize: 12, fontWeight: '700', textAlign: 'right' }}>+ احتساب كامل</Text></TouchableOpacity> : <Text style={rc.td}>—</Text> },
      { label: 'النتيجة', flex: 0.9, render: (r) => r.pass2 === null ? <Text style={rc.td}>—</Text> : res(r.pass2 ? 'ناجح' : 'راسب', `p2-${r.student_db_id}`) },
    ];
    case 'exceptional': return [
      { label: 'الدور الثاني', flex: 0.8, render: (r) => <Text style={rc.td}>{fmt(r.second_exam)}</Text> },
      { label: 'قرار المجلس', flex: 1.6, render: (r) => r.decisions.exceptional
        ? <TouchableOpacity onPress={() => onDecision(r, 'exceptional')} disabled={!canDecide} testID={`dec-exc-${r.student_db_id}`}>
            <Badge text={r.decisions.exceptional.capped ? `مقبول للتصفية · سقف ${cfg.exceptional_cap}` : 'مقبول للتصفية · بلا سقف'} color="#6d28d9" />
            <Text style={{ fontSize: 11, color: '#64748b', textAlign: 'right' }} numberOfLines={1}>{r.decisions.exceptional.reason}</Text>
          </TouchableOpacity>
        : canDecide ? <TouchableOpacity onPress={() => onDecision(r, 'exceptional')} testID={`dec-exc-add-${r.student_db_id}`}><Text style={{ color: '#6d28d9', fontSize: 12, fontWeight: '700', textAlign: 'right' }}>+ قرار دخول التصفية</Text></TouchableOpacity> : <Text style={rc.td}>لا يوجد قرار</Text> },
      { label: 'المعتمد', flex: 0.8, render: (r) => <Text style={[rc.td, { fontWeight: '800' }]}>{fmt(r.final3)}</Text> },
      { label: 'النتيجة', flex: 0.9, render: (r) => r.pass3 === null ? <Text style={rc.td}>—</Text> : res(r.pass3 ? 'ناجح' : 'راسب', `p3-${r.student_db_id}`) },
    ];
    default: return [
      { label: 'السعي', flex: 0.7, render: (r) => <Text style={rc.td}>{fmt(r.coursework)}</Text> },
      { label: 'الدرجة النهائية', flex: 0.9, render: (r) => <Text style={[rc.td, { fontWeight: '800', fontSize: 15 }]} testID={`final-${r.student_db_id}`}>{fmt(r.final)}</Text> },
      { label: 'التقدير', flex: 0.9, render: (r) => <Text style={rc.td}>{r.letter || '—'}</Text> },
      { label: 'النتيجة', flex: 1.2, render: (r) => res(r.result, `res-${r.student_db_id}`) },
      { label: 'الدور', flex: 0.8, render: (r) => ['first', 'second', 'tasfiya'].includes(r.stage) ? <Badge text={r.stage_label} color={r.stage === 'first' ? '#1565c0' : r.stage === 'second' ? '#ef6c00' : '#6d28d9'} /> : <Text style={rc.td}>—</Text> },
    ];
  }
};

export const RcMarksTable = ({ tab, sheet, q = '', edits, setEdit, errors, onDecision, canEdit, canDecide, canExams }: {
  tab: TabId; q?: string; sheet: Sheet; edits: Record<string, string>; setEdit: (k: string, v: string) => void; errors: Record<string, string>;
  onDecision: (r: RcRow, k: DecKind) => void; canEdit: boolean; canDecide: boolean; canExams: boolean;
}) => {
  const field = TAB_FIELD[tab];
  const term = q.trim().toLowerCase();
  const rows = rowsForTab(tab, sheet.rows).filter((r) => !term || r.name.toLowerCase().includes(term) || r.reg_no.includes(term));
  const cell: CellFn = (f, r, can) => <MarkCell field={f} r={r} can={can} edits={edits} setEdit={setEdit} />;
  const cols = columns(tab, sheet, onDecision, canDecide, cell, canExams);
  const locked = sheet.sheet.coursework_locked;
  const mx = field === 'coursework' ? sheet.settings.coursework_max : field === 'first_exam' ? sheet.settings.final_max : 100;
  return (
    <ScrollView horizontal contentContainerStyle={{ minWidth: '100%' }}>
      <View style={{ minWidth: 900, flex: 1 }} testID={`rc-table-${tab}`}>
        <View style={[rc.tr, { backgroundColor: '#f8fafc' }]}>
          <Text style={[rc.th, { width: 30 }]}>#</Text>
          <Text style={[rc.th, { flex: 2 }]}>اسم الطالب</Text>
          <Text style={[rc.th, { flex: 0.9 }]}>رقم القيد</Text>
          {field && <Text style={[rc.th, { width: 96 }]}>{tab === 'coursework' ? `السعي (من ${mx})` : `الدرجة (من ${mx})`}</Text>}
          {cols.map((c) => <Text key={c.label} style={[rc.th, { flex: c.flex }]}>{c.label}</Text>)}
        </View>
        {rows.length === 0 && <Text style={{ textAlign: 'center', color: '#94a3b8', padding: 24 }} testID={`rc-empty-${tab}`}>{{ first: 'لا يوجد مؤهلون بعد — يظهر هنا من نجح في السعي ولم يتجاوز حد الغياب', second: 'لا يوجد طلاب دور ثانٍ بعد — يظهر هنا غير المؤهلين (بعد رصد سعيهم) والراسبون في الدور الأول', exceptional: 'يظهر هنا من رسب في الدور الثاني بعد رصد درجته' }[tab as string] || 'لا يوجد طلاب في هذه المرحلة'}</Text>}
        {rows.map((r, i) => {
          const can = !!field && canEdit && editable(tab, r, locked);
          return (
            <View key={r.student_db_id} style={[rc.tr, i % 2 === 1 && { backgroundColor: '#fbfcfe' }]} testID={`rc-row-${r.student_db_id}`}>
              <Text style={[rc.td, { width: 30, color: '#94a3b8' }]}>{i + 1}</Text>
              <View style={{ flex: 2 }}>
                <Text style={[rc.td, { fontWeight: '700' }]} numberOfLines={1}>{r.name}</Text>
                {errors[r.student_db_id] && <Text style={{ color: '#c62828', fontSize: 11, textAlign: 'right' }}>{errors[r.student_db_id]}</Text>}
              </View>
              <Text style={[rc.td, { flex: 0.9, color: '#475569' }]}>{r.reg_no}</Text>
              {field && (
                <View style={{ width: 96, flexDirection: 'row-reverse', alignItems: 'center', gap: 4 }}>
                  {cell(field, r, can)}
                  {tab === 'coursework' && locked && <Ionicons name="lock-closed" size={12} color="#94a3b8" />}
                </View>
              )}
              {cols.map((c) => <View key={c.label} style={{ flex: c.flex }}>{c.render(r)}</View>)}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
};
