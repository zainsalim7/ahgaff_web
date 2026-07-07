import React, { useState, useEffect } from 'react';
import { View, Text, Platform, ActivityIndicator, StyleSheet } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import api from '../services/api';

interface Room {
  id: string;
  name: string;
  building?: string;
  capacity?: number;
}

interface RoomPickerProps {
  value: string; // اسم القاعة المخزَّن (نص)
  onChange: (roomName: string) => void;
  testID?: string;
}

/**
 * قائمة منسدلة موحّدة لاختيار القاعة من القاعات المسجلة في النظام
 * (نفس قاعات الجدول الأسبوعي - GET /api/rooms).
 * تخزّن اسم القاعة كنص للتوافق مع بيانات المحاضرات القديمة،
 * وإذا كانت القيمة الحالية قاعة قديمة غير مسجلة تُعرض كخيار إضافي.
 */
export default function RoomPicker({ value, onChange, testID = 'room-picker' }: RoomPickerProps) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    api.get('/rooms')
      .then(res => { if (mounted) setRooms(res.data || []); })
      .catch(() => { if (mounted) setRooms([]); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  if (loading) {
    return (
      <View style={styles.loadingBox}>
        <ActivityIndicator size="small" color="#1565c0" />
        <Text style={styles.loadingText}>جاري تحميل القاعات...</Text>
      </View>
    );
  }

  if (rooms.length === 0) {
    return (
      <Text style={styles.emptyText}>
        لا توجد قاعات مسجلة — أضف القاعات من صفحة الجدول الأسبوعي أولاً
      </Text>
    );
  }

  // القيمة الحالية قاعة قديمة (نص حر) غير موجودة في السجل → نعرضها كخيار حتى لا تُفقد
  const legacyValue = value && !rooms.some(r => r.name === value) ? value : null;
  const label = (r: Room) => r.building ? `${r.name} (${r.building})` : r.name;

  if (Platform.OS === 'web') {
    return (
      <select
        value={value}
        onChange={(e: any) => onChange(e.target.value)}
        data-testid={testID}
        style={{
          width: '100%', padding: '12px', borderRadius: 8,
          border: '1px solid #e0e0e0', fontSize: 15,
          backgroundColor: '#f9f9f9', color: '#333',
          direction: 'rtl', boxSizing: 'border-box' as any,
        }}
      >
        <option value="">-- اختر القاعة --</option>
        {legacyValue && <option value={legacyValue}>{legacyValue} (قاعة قديمة)</option>}
        {rooms.map(r => (
          <option key={r.id} value={r.name}>{label(r)}</option>
        ))}
      </select>
    );
  }

  return (
    <View style={styles.pickerWrapper}>
      <Picker selectedValue={value} onValueChange={(v) => onChange(v)} testID={testID}>
        <Picker.Item label="-- اختر القاعة --" value="" />
        {legacyValue && <Picker.Item label={`${legacyValue} (قاعة قديمة)`} value={legacyValue} />}
        {rooms.map(r => (
          <Picker.Item key={r.id} label={label(r)} value={r.name} />
        ))}
      </Picker>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingBox: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, padding: 14, backgroundColor: '#f9f9f9', borderRadius: 8,
    borderWidth: 1, borderColor: '#e0e0e0',
  },
  loadingText: { fontSize: 13, color: '#888' },
  emptyText: {
    fontSize: 13, color: '#e65100', textAlign: 'center', padding: 12,
    backgroundColor: '#fff3e0', borderRadius: 8, borderWidth: 1, borderColor: '#ffe0b2',
  },
  pickerWrapper: {
    backgroundColor: '#f9f9f9', borderRadius: 8,
    borderWidth: 1, borderColor: '#e0e0e0', overflow: 'hidden',
  },
});
