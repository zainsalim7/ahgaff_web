import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';
import { DateField } from '../AttendanceFilterBar';
import { Filters, FilterOptions, STATUS_LABELS, SORT_LABELS, ROLE_LABELS } from './types';

interface Props {
  filters: Filters;
  options: FilterOptions | null;
  activeCount: number;
  onChange: (patch: Partial<Filters>) => void;
  onReset: () => void;
}

const Field = ({ label, children, testID }: { label: string; children: React.ReactNode; testID: string }) => (
  <View style={st.field} testID={testID}>
    <Text style={st.label}>{label}</Text>
    <View style={st.pickerWrap}>{children}</View>
  </View>
);

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const dateShortcut = (kind: 'today' | 'week' | 'month') => {
  const now = new Date();
  if (kind === 'today') return { lecture_from: iso(now), lecture_to: iso(now) };
  if (kind === 'week') {
    const dow = (now.getDay() + 1) % 7; // السبت = 0
    const start = new Date(now); start.setDate(now.getDate() - dow);
    const end = new Date(start); end.setDate(start.getDate() + 6);
    return { lecture_from: iso(start), lecture_to: iso(end) };
  }
  return { lecture_from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), lecture_to: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
};

export const ApprovalFilterBar: React.FC<Props> = ({ filters, options, activeCount, onChange, onReset }) => {
  const [open, setOpen] = useState(true);

  const departments = useMemo(() => (options?.departments || []).filter(d => !filters.faculty_id || d.faculty_id === filters.faculty_id), [options, filters.faculty_id]);
  const courses = useMemo(() => (options?.courses || []).filter(c =>
    (!filters.faculty_id || c.faculty_id === filters.faculty_id) &&
    (!filters.department_id || c.department_id === filters.department_id) &&
    (!filters.level || String(c.level ?? '') === filters.level) &&
    (!filters.section || (c.section || '') === filters.section)
  ), [options, filters.faculty_id, filters.department_id, filters.level, filters.section]);
  const levels = useMemo(() => Array.from(new Set((options?.courses || [])
    .filter(c => (!filters.faculty_id || c.faculty_id === filters.faculty_id) && (!filters.department_id || c.department_id === filters.department_id))
    .map(c => c.level).filter((l): l is number => l !== null && l !== undefined))).sort((a, b) => a - b), [options, filters.faculty_id, filters.department_id]);
  const sections = useMemo(() => Array.from(new Set((options?.courses || [])
    .filter(c => (!filters.department_id || c.department_id === filters.department_id) && (!filters.level || String(c.level ?? '') === filters.level))
    .map(c => c.section || '').filter(Boolean))).sort(), [options, filters.department_id, filters.level]);

  const chips: { key: keyof Filters | 'lecture_range' | 'requested_range'; label: string; clear: Partial<Filters> }[] = [];
  const name = (arr: { id: string; name: string }[] | undefined, id: string) => arr?.find(x => x.id === id)?.name || id;
  if (filters.faculty_id) chips.push({ key: 'faculty_id', label: `الكلية: ${name(options?.faculties, filters.faculty_id)}`, clear: { faculty_id: '' } });
  if (filters.department_id) chips.push({ key: 'department_id', label: `القسم: ${name(options?.departments, filters.department_id)}`, clear: { department_id: '' } });
  if (filters.level) chips.push({ key: 'level', label: `المستوى: م${filters.level}`, clear: { level: '' } });
  if (filters.section) chips.push({ key: 'section', label: `الشعبة: ${filters.section}`, clear: { section: '' } });
  if (filters.course_id) chips.push({ key: 'course_id', label: `المقرر: ${name(options?.courses, filters.course_id)}`, clear: { course_id: '' } });
  if (filters.semester_id) chips.push({ key: 'semester_id', label: `الفصل: ${name(options?.semesters, filters.semester_id)}`, clear: { semester_id: '' } });
  if (filters.requested_by) chips.push({ key: 'requested_by', label: `مقدّم الطلب: ${name(options?.requesters, filters.requested_by)}`, clear: { requested_by: '' } });
  if (filters.new_status) chips.push({ key: 'new_status', label: `التغيير إلى: ${STATUS_LABELS[filters.new_status]?.label || filters.new_status}`, clear: { new_status: '' } });
  if (filters.q) chips.push({ key: 'q', label: `بحث: ${filters.q}`, clear: { q: '' } });
  if (filters.lecture_from || filters.lecture_to) chips.push({ key: 'lecture_range', label: `المحاضرة: ${filters.lecture_from || '…'} → ${filters.lecture_to || '…'}`, clear: { lecture_from: '', lecture_to: '' } });
  if (filters.requested_from || filters.requested_to) chips.push({ key: 'requested_range', label: `الطلب: ${filters.requested_from || '…'} → ${filters.requested_to || '…'}`, clear: { requested_from: '', requested_to: '' } });

  return (
    <View style={st.wrap} testID="approval-filter-bar">
      <View style={st.topRow}>
        <View style={st.searchBox}>
          <Ionicons name="search" size={16} color="#8a95a8" />
          <TextInput
            style={st.searchInput}
            value={filters.q}
            onChangeText={q => onChange({ q })}
            placeholder="بحث: اسم الطالب / الرقم الجامعي / المقرر / مقدّم الطلب"
            placeholderTextColor="#a8b1c2"
            textAlign="right"
            testID="approval-search-input"
          />
          {!!filters.q && (
            <TouchableOpacity onPress={() => onChange({ q: '' })} testID="approval-search-clear">
              <Ionicons name="close-circle" size={16} color="#8a95a8" />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={st.toggleBtn} onPress={() => setOpen(o => !o)} testID="approval-filters-toggle">
          <Ionicons name={open ? 'chevron-up' : 'options-outline'} size={16} color="#1565c0" />
          <Text style={st.toggleText}>الفلاتر{activeCount ? ` (${activeCount})` : ''}</Text>
        </TouchableOpacity>
        {activeCount > 0 && (
          <TouchableOpacity style={st.resetBtn} onPress={onReset} testID="approval-filters-reset">
            <Ionicons name="refresh" size={14} color="#c62828" />
            <Text style={st.resetText}>مسح الكل</Text>
          </TouchableOpacity>
        )}
      </View>

      {open && (
        <>
          <View style={st.row}>
            <Field label="الكلية" testID="filter-faculty">
              <Picker selectedValue={filters.faculty_id} onValueChange={v => onChange({ faculty_id: v })} style={st.picker}>
                <Picker.Item label="الكل" value="" />
                {(options?.faculties || []).map(f => <Picker.Item key={f.id} label={f.name} value={f.id} />)}
              </Picker>
            </Field>
            <Field label="القسم" testID="filter-department">
              <Picker selectedValue={filters.department_id} onValueChange={v => onChange({ department_id: v })} style={st.picker}>
                <Picker.Item label="الكل" value="" />
                {departments.map(d => <Picker.Item key={d.id} label={d.name} value={d.id} />)}
              </Picker>
            </Field>
            <Field label="المستوى" testID="filter-level">
              <Picker selectedValue={filters.level} onValueChange={v => onChange({ level: v })} style={st.picker}>
                <Picker.Item label="الكل" value="" />
                {levels.map(l => <Picker.Item key={l} label={`م${l}`} value={String(l)} />)}
              </Picker>
            </Field>
            <Field label="الشعبة" testID="filter-section">
              <Picker selectedValue={filters.section} onValueChange={v => onChange({ section: v })} style={st.picker}>
                <Picker.Item label="الكل" value="" />
                {sections.map(s => <Picker.Item key={s} label={s} value={s} />)}
              </Picker>
            </Field>
            <Field label="المقرر" testID="filter-course">
              <Picker selectedValue={filters.course_id} onValueChange={v => onChange({ course_id: v })} style={[st.picker, { minWidth: 200 }]}>
                <Picker.Item label="الكل" value="" />
                {courses.map(c => <Picker.Item key={c.id} label={`${c.name} (${c.code}) · ${c.count}`} value={c.id} />)}
              </Picker>
            </Field>
          </View>
          <View style={st.row}>
            <Field label="الفصل الدراسي" testID="filter-semester">
              <Picker selectedValue={filters.semester_id} onValueChange={v => onChange({ semester_id: v })} style={st.picker}>
                <Picker.Item label="الكل" value="" />
                {(options?.semesters || []).map(s => <Picker.Item key={s.id} label={`${s.name}${s.is_active ? ' (النشط)' : ''}`} value={s.id} />)}
              </Picker>
            </Field>
            <Field label="مقدّم الطلب" testID="filter-requester">
              <Picker selectedValue={filters.requested_by} onValueChange={v => onChange({ requested_by: v })} style={[st.picker, { minWidth: 180 }]}>
                <Picker.Item label="الكل" value="" />
                {(options?.requesters || []).map(r => <Picker.Item key={r.id} label={`${r.name} (${ROLE_LABELS[r.role] || r.role}) · ${r.count}`} value={r.id} />)}
              </Picker>
            </Field>
            <Field label="التغيير إلى" testID="filter-new-status">
              <Picker selectedValue={filters.new_status} onValueChange={v => onChange({ new_status: v })} style={st.picker}>
                <Picker.Item label="الكل" value="" />
                {Object.entries(STATUS_LABELS).map(([k, v]) => <Picker.Item key={k} label={v.label} value={k} />)}
              </Picker>
            </Field>
            <Field label="الترتيب" testID="filter-sort">
              <Picker selectedValue={filters.sort} onValueChange={v => onChange({ sort: v })} style={st.picker}>
                {Object.entries(SORT_LABELS).map(([k, v]) => <Picker.Item key={k} label={v} value={k} />)}
              </Picker>
            </Field>
          </View>
          <View style={st.row}>
            <Text style={st.groupLabel}>تاريخ المحاضرة:</Text>
            <DateField label="من" value={filters.lecture_from} onChange={v => onChange({ lecture_from: v })} testID="filter-lecture-from" />
            <DateField label="إلى" value={filters.lecture_to} onChange={v => onChange({ lecture_to: v })} testID="filter-lecture-to" />
            {(['today', 'week', 'month'] as const).map(k => (
              <TouchableOpacity key={k} style={st.shortcut} onPress={() => onChange(dateShortcut(k))} testID={`filter-shortcut-${k}`}>
                <Text style={st.shortcutText}>{k === 'today' ? 'اليوم' : k === 'week' ? 'هذا الأسبوع' : 'هذا الشهر'}</Text>
              </TouchableOpacity>
            ))}
            <View style={st.sep} />
            <Text style={st.groupLabel}>تاريخ الطلب:</Text>
            <DateField label="من" value={filters.requested_from} onChange={v => onChange({ requested_from: v })} testID="filter-requested-from" />
            <DateField label="إلى" value={filters.requested_to} onChange={v => onChange({ requested_to: v })} testID="filter-requested-to" />
          </View>
        </>
      )}

      {chips.length > 0 && (
        <View style={st.chips} testID="active-filter-chips">
          {chips.map(c => (
            <TouchableOpacity key={c.key} style={st.chip} onPress={() => onChange(c.clear)} testID={`chip-${c.key}`}>
              <Text style={st.chipText}>{c.label}</Text>
              <Ionicons name="close" size={12} color="#1565c0" />
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
};

const st = StyleSheet.create({
  wrap: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eef1f6', paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  topRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  searchBox: { flex: 1, minWidth: 260, flexDirection: 'row-reverse', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#f7f9fc' },
  searchInput: { flex: 1, fontSize: 13, color: '#0f2440', paddingVertical: 2 },
  toggleBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, backgroundColor: '#e3f0ff' },
  toggleText: { fontSize: 12, color: '#1565c0', fontWeight: '700' },
  resetBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, backgroundColor: '#ffebee' },
  resetText: { fontSize: 12, color: '#c62828', fontWeight: '700' },
  row: { flexDirection: 'row-reverse', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  field: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4 },
  label: { fontSize: 11.5, color: '#5b6678', fontWeight: '700' },
  pickerWrap: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, backgroundColor: '#fff', overflow: 'hidden' },
  picker: { minWidth: 130, height: 32, fontSize: 12, color: '#0f2440', borderWidth: 0, backgroundColor: 'transparent' } as any,
  groupLabel: { fontSize: 11.5, color: '#1a2540', fontWeight: '800' },
  shortcut: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, backgroundColor: '#f0f2f5' },
  shortcutText: { fontSize: 11, color: '#334', fontWeight: '600' },
  sep: { width: 1, height: 20, backgroundColor: '#e2e8f0', marginHorizontal: 4 },
  chips: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14, backgroundColor: '#e3f0ff' },
  chipText: { fontSize: 11.5, color: '#1565c0', fontWeight: '600' },
});
