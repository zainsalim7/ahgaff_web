import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
}

export const Pagination: React.FC<Props> = ({ page, pages, total, pageSize, onChange }) => {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const nums: number[] = [];
  for (let p = Math.max(1, page - 2); p <= Math.min(pages, page + 2); p++) nums.push(p);
  return (
    <View style={st.bar} testID="pagination">
      <Text style={st.info} testID="pagination-info">عرض {from}–{to} من {total}</Text>
      <View style={st.btns}>
        <TouchableOpacity style={[st.btn, page <= 1 && st.off]} disabled={page <= 1} onPress={() => onChange(page - 1)} testID="pagination-prev">
          <Ionicons name="chevron-forward" size={16} color={page <= 1 ? '#c0c8d4' : '#1565c0'} />
        </TouchableOpacity>
        {nums[0] > 1 && <Text style={st.dots}>…</Text>}
        {nums.map(p => (
          <TouchableOpacity key={p} style={[st.num, p === page && st.numOn]} onPress={() => onChange(p)} testID={`pagination-page-${p}`}>
            <Text style={[st.numText, p === page && { color: '#fff' }]}>{p}</Text>
          </TouchableOpacity>
        ))}
        {nums[nums.length - 1] < pages && <Text style={st.dots}>…</Text>}
        <TouchableOpacity style={[st.btn, page >= pages && st.off]} disabled={page >= pages} onPress={() => onChange(page + 1)} testID="pagination-next">
          <Ionicons name="chevron-back" size={16} color={page >= pages ? '#c0c8d4' : '#1565c0'} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const st = StyleSheet.create({
  bar: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#eef1f6' },
  info: { fontSize: 12, color: '#5b6678', fontWeight: '600' },
  btns: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4 },
  btn: { padding: 6, borderRadius: 6, backgroundColor: '#e3f0ff' },
  off: { backgroundColor: '#f0f2f5' },
  num: { minWidth: 28, paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6, alignItems: 'center', backgroundColor: '#f0f2f5' },
  numOn: { backgroundColor: '#1565c0' },
  numText: { fontSize: 12, fontWeight: '700', color: '#1a2540' },
  dots: { color: '#8a95a8', paddingHorizontal: 2 },
});
