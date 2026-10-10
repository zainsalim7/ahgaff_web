import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ChangeRequest, STATUS_LABELS, REQ_STATUS, ROLE_LABELS, fmtDateTime } from './types';

interface Props {
  item: ChangeRequest;
  selected: boolean;
  processing: boolean;
  compact?: boolean;
  onToggle: (id: string) => void;
  onApprove: (ids: string[]) => void;
  onReject: (ids: string[]) => void;
}

export const StatusDiff = ({ oldStatus, newStatus }: { oldStatus: string | null; newStatus: string }) => {
  const o = oldStatus ? STATUS_LABELS[oldStatus] : { label: '—', color: '#8a95a8', bg: '#f0f2f5' };
  const n = STATUS_LABELS[newStatus] || { label: newStatus, color: '#333', bg: '#eee' };
  return (
    <View style={st.diffRow}>
      <View style={[st.pill, { backgroundColor: o.bg }]}><Text style={[st.pillText, { color: o.color }]}>{o.label}</Text></View>
      <Ionicons name="arrow-back" size={14} color="#8a95a8" />
      <View style={[st.pill, { backgroundColor: n.bg }]}><Text style={[st.pillText, { color: n.color }]}>{n.label}</Text></View>
    </View>
  );
};

export const RequestCard: React.FC<Props> = ({ item, selected, processing, compact, onToggle, onApprove, onReject }) => {
  const isPending = item.status === 'pending';
  const rs = REQ_STATUS[item.status] || REQ_STATUS.all;
  const scope = [item.faculty_name, item.department_name, item.level ? `م${item.level}` : '', item.section ? `شعبة ${item.section}` : ''].filter(Boolean).join(' · ');

  return (
    <TouchableOpacity
      style={[st.card, compact && st.cardCompact, selected && st.cardSelected]}
      onPress={() => isPending && onToggle(item.id)}
      activeOpacity={0.85}
      testID={`request-row-${item.id}`}
    >
      <View style={st.header}>
        {isPending && (
          <View style={[st.checkbox, selected && st.checkboxOn]}>{selected && <Ionicons name="checkmark" size={14} color="#fff" />}</View>
        )}
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <View style={st.nameRow}>
            <Text style={st.studentName}>{item.student_name}</Text>
            {!!item.student_number && <Text style={st.studentNo} testID={`student-number-${item.id}`}>{item.student_number}</Text>}
          </View>
          {!compact && (
            <>
              <Text style={st.courseText}>{item.course_name} ({item.course_code})</Text>
              <Text style={st.metaText}>محاضرة: {item.lecture_date} {item.lecture_start_time}{scope ? ` · ${scope}` : ''}</Text>
            </>
          )}
        </View>
        {!isPending && (
          <View style={[st.pill, { backgroundColor: rs.bg }]}><Text style={[st.pillText, { color: rs.color }]}>{rs.label}</Text></View>
        )}
      </View>
      <StatusDiff oldStatus={item.old_status} newStatus={item.new_status} />
      {!compact && (
        <Text style={st.byText}>
          طلب: {item.requested_by_name} ({ROLE_LABELS[item.requested_by_role] || item.requested_by_role}) · {fmtDateTime(item.requested_at)}{item.reason ? ` • ${item.reason}` : ''}
        </Text>
      )}
      {compact && !!item.reason && <Text style={st.byText}>السبب: {item.reason}</Text>}
      {!isPending && (item.reviewed_by_name || item.review_notes) && (
        <View style={[st.reviewBox, { backgroundColor: rs.bg }]} testID={`review-info-${item.id}`}>
          <Text style={[st.reviewText, { color: rs.color }]}>
            {item.reviewed_by_name ? `${rs.label} بواسطة ${item.reviewed_by_name}` : rs.label}{item.reviewed_at ? ` · ${fmtDateTime(item.reviewed_at)}` : ''}
            {item.review_notes ? `\nملاحظات: ${item.review_notes}` : ''}
          </Text>
        </View>
      )}
      {isPending && (
        <View style={st.actionsRow}>
          <TouchableOpacity style={[st.actionBtn, st.approveBtn]} onPress={() => onApprove([item.id])} disabled={processing} testID={`approve-btn-${item.id}`}>
            <Ionicons name="checkmark-circle" size={16} color="#fff" /><Text style={st.actionText}>اعتماد</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[st.actionBtn, st.rejectBtn]} onPress={() => onReject([item.id])} disabled={processing} testID={`reject-btn-${item.id}`}>
            <Ionicons name="close-circle" size={16} color="#fff" /><Text style={st.actionText}>رفض</Text>
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
};

const st = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#eef1f6' },
  cardCompact: { padding: 10, marginBottom: 6, backgroundColor: '#fafbfd' },
  cardSelected: { borderColor: '#1565c0', borderWidth: 2 },
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 8 },
  checkbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderColor: '#c0c8d4', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  checkboxOn: { backgroundColor: '#1565c0', borderColor: '#1565c0' },
  nameRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  studentName: { fontSize: 14, fontWeight: '700', color: '#1a2540', textAlign: 'right' },
  studentNo: { fontSize: 11, color: '#1565c0', fontWeight: '700', backgroundColor: '#e3f0ff', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 },
  courseText: { fontSize: 12, color: '#555', textAlign: 'right', marginTop: 2 },
  metaText: { fontSize: 11, color: '#8a95a8', textAlign: 'right', marginTop: 2 },
  diffRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, marginTop: 8 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  pillText: { fontSize: 12, fontWeight: '600' },
  byText: { fontSize: 11, color: '#8a95a8', textAlign: 'right', marginTop: 6 },
  reviewBox: { marginTop: 8, borderRadius: 8, padding: 8 },
  reviewText: { fontSize: 11.5, fontWeight: '600', textAlign: 'right', lineHeight: 18 },
  actionsRow: { flexDirection: 'row-reverse', gap: 8, marginTop: 10 },
  actionBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6 },
  approveBtn: { backgroundColor: '#2e7d32' },
  rejectBtn: { backgroundColor: '#c62828' },
  actionText: { color: '#fff', fontWeight: '600', fontSize: 13 },
});
