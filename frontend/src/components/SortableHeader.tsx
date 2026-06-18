/**
 * SortableHeader — رأس عمود قابل للفرز بسهم صغير.
 * يتدوّر بين: none → asc → desc → none.
 */
import React from 'react';
import { Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  label: string;
  field: string;
  currentSort: string | null;  // مثل 'name_asc' أو 'name_desc' أو null
  onSort: (next: string | null) => void;
  containerStyle?: ViewStyle | ViewStyle[];
  testID?: string;
}

export function SortableHeader({ label, field, currentSort, onSort, containerStyle, testID }: Props) {
  const ascKey = `${field}_asc`;
  const descKey = `${field}_desc`;
  const isAsc = currentSort === ascKey;
  const isDesc = currentSort === descKey;
  const active = isAsc || isDesc;

  const handleClick = () => {
    if (isAsc) onSort(descKey);
    else if (isDesc) onSort(null);
    else onSort(ascKey);
  };

  return (
    <TouchableOpacity
      style={[s.row, containerStyle]}
      onPress={handleClick}
      testID={testID || `sort-${field}`}
    >
      <Text style={[s.label, active && s.labelActive]}>{label}</Text>
      <Ionicons
        name={isAsc ? 'arrow-up' : isDesc ? 'arrow-down' : 'swap-vertical'}
        size={12}
        color={active ? '#2962ff' : '#a8b1c2'}
      />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4 },
  label: { fontSize: 12, fontWeight: '600', color: '#5b6678', textAlign: 'right' },
  labelActive: { color: '#2962ff' },
});
