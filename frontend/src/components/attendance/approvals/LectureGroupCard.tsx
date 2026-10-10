import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ChangeRequest, ROLE_LABELS, fmtDateTime } from './types';
import { RequestCard } from './RequestCard';

export interface LectureGroup {
  lecture_id: string;
  items: ChangeRequest[];
}

export const groupByLecture = (items: ChangeRequest[]): LectureGroup[] => {
  const map = new Map<string, ChangeRequest[]>();
  items.forEach(i => {
    const arr = map.get(i.lecture_id) || [];
    arr.push(i);
    map.set(i.lecture_id, arr);
  });
  return Array.from(map.entries()).map(([lecture_id, items]) => ({ lecture_id, items }));
};

interface Props {
  group: LectureGroup;
  selectedIds: Set<string>;
  processing: boolean;
  onToggle: (id: string) => void;
  onToggleMany: (ids: string[], on: boolean) => void;
  onApprove: (ids: string[]) => void;
  onReject: (ids: string[]) => void;
}

export const LectureGroupCard: React.FC<Props> = ({ group, selectedIds, processing, onToggle, onToggleMany, onApprove, onReject }) => {
  const [open, setOpen] = useState(true);
  const first = group.items[0];
  const pendingIds = group.items.filter(i => i.status === 'pending').map(i => i.id);
  const allSelected = pendingIds.length > 0 && pendingIds.every(id => selectedIds.has(id));
  const scope = [first.faculty_name, first.department_name, first.level ? `م${first.level}` : '', first.section ? `شعبة ${first.section}` : ''].filter(Boolean).join(' · ');
  const toCounts = group.items.reduce<Record<string, number>>((acc, i) => { acc[i.new_status] = (acc[i.new_status] || 0) + 1; return acc; }, {});
  const toLabel: Record<string, string> = { present: 'حاضر', absent: 'غائب', late: 'متأخر', excused: 'مأذون' };

  return (
    <View style={st.group} testID={`lecture-group-${group.lecture_id}`}>
      <TouchableOpacity style={st.head} onPress={() => setOpen(o => !o)} activeOpacity={0.85} testID={`lecture-group-toggle-${group.lecture_id}`}>
        {pendingIds.length > 0 && (
          <TouchableOpacity onPress={() => onToggleMany(pendingIds, !allSelected)} style={[st.checkbox, allSelected && st.checkboxOn]} testID={`lecture-group-select-${group.lecture_id}`}>
            {allSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
          </TouchableOpacity>
        )}
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Text style={st.title}>{first.course_name} <Text style={st.code}>({first.course_code})</Text></Text>
          <Text style={st.meta}>{first.lecture_date} {first.lecture_start_time}{scope ? ` · ${scope}` : ''}</Text>
          <Text style={st.meta}>مقدّم الطلب: {first.requested_by_name} ({ROLE_LABELS[first.requested_by_role] || first.requested_by_role}) · {fmtDateTime(first.requested_at)}</Text>
          <View style={st.badges}>
            <View style={st.countBadge}><Text style={st.countText}>{group.items.length} طالب</Text></View>
            {Object.entries(toCounts).map(([k, n]) => (
              <View key={k} style={st.toBadge}><Text style={st.toText}>{n} → {toLabel[k] || k}</Text></View>
            ))}
            {pendingIds.length > 0 && pendingIds.length < group.items.length && (
              <View style={st.toBadge}><Text style={st.toText}>{pendingIds.length} معلّق</Text></View>
            )}
          </View>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color="#8a95a8" />
      </TouchableOpacity>

      {pendingIds.length > 0 && (
        <View style={st.actions}>
          <TouchableOpacity style={[st.btn, st.approve]} onPress={() => onApprove(pendingIds)} disabled={processing} testID={`lecture-group-approve-${group.lecture_id}`}>
            <Ionicons name="checkmark-done" size={15} color="#fff" /><Text style={st.btnText}>اعتماد المحاضرة كاملة ({pendingIds.length})</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[st.btn, st.reject]} onPress={() => onReject(pendingIds)} disabled={processing} testID={`lecture-group-reject-${group.lecture_id}`}>
            <Ionicons name="close-circle" size={15} color="#fff" /><Text style={st.btnText}>رفض المحاضرة كاملة</Text>
          </TouchableOpacity>
        </View>
      )}

      {open && (
        <View style={st.body}>
          {group.items.map(item => (
            <RequestCard key={item.id} item={item} compact selected={selectedIds.has(item.id)} processing={processing} onToggle={onToggle} onApprove={onApprove} onReject={onReject} />
          ))}
        </View>
      )}
    </View>
  );
};

const st = StyleSheet.create({
  group: { backgroundColor: '#fff', borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' },
  head: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 10, padding: 12, backgroundColor: '#f7f9fc' },
  checkbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderColor: '#c0c8d4', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  checkboxOn: { backgroundColor: '#1565c0', borderColor: '#1565c0' },
  title: { fontSize: 14, fontWeight: '800', color: '#1a2540', textAlign: 'right' },
  code: { fontSize: 12, color: '#5b6678', fontWeight: '600' },
  meta: { fontSize: 11, color: '#8a95a8', textAlign: 'right', marginTop: 2 },
  badges: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  countBadge: { backgroundColor: '#1565c0', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  countText: { fontSize: 11, color: '#fff', fontWeight: '800' },
  toBadge: { backgroundColor: '#eef1f6', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  toText: { fontSize: 11, color: '#334', fontWeight: '600' },
  actions: { flexDirection: 'row-reverse', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#eef1f6' },
  btn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 6 },
  approve: { backgroundColor: '#2e7d32' },
  reject: { backgroundColor: '#c62828' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  body: { padding: 10, paddingTop: 6 },
});
