import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, Platform, ActivityIndicator, StyleSheet } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import api from '../services/api';

interface Room {
  id: string;
  name: string;
  building?: string;
  capacity?: number;
}

export interface RoomOccurrence {
  date: string;       // YYYY-MM-DD
  start_time: string; // HH:MM
  end_time: string;   // HH:MM
}

interface RoomAvailability {
  name: string;
  total: number;
  busy_count: number;
  conflicts: { date: string; start_time: string; end_time: string; course_name: string }[];
}

interface RoomPickerProps {
  value: string; // اسم القاعة المخزَّن (نص)
  onChange: (roomName: string) => void;
  testID?: string;
  /** مواعيد لفحص إشغال القاعات (🟢 متاحة / 🔴 مشغولة). موعد واحد لمحاضرة، أو عدة مواعيد للتوليد */
  occurrences?: RoomOccurrence[];
  /** استثناء محاضرة معينة من الفحص (عند تغيير قاعة محاضرة قائمة) */
  excludeLectureId?: string;
}

const occValid = (occ?: RoomOccurrence[]) =>
  !!occ && occ.length > 0 && occ.every(o => o.date && o.start_time && o.end_time);

/**
 * قائمة منسدلة موحّدة لاختيار القاعة من القاعات المسجلة في النظام
 * (نفس قاعات الجدول الأسبوعي - GET /api/rooms).
 * عند تمرير occurrences تُعرض حالة الإشغال لحظياً:
 *   🟢 متاحة | 🔴 مشغولة (مع اسم المقرر الحاجز أو عدد المواعيد المشغولة)
 * القاعة المشغولة تبقى قابلة للاختيار مع تحذير أحمر (لحالة دمج شعبتين لنفس المعلم).
 */
export default function RoomPicker({ value, onChange, testID = 'room-picker', occurrences, excludeLectureId }: RoomPickerProps) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [availability, setAvailability] = useState<Record<string, RoomAvailability>>({});
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let mounted = true;
    api.get('/rooms')
      .then(res => { if (mounted) setRooms(res.data || []); })
      .catch(() => { if (mounted) setRooms([]); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  // فحص الإشغال كلما تغيّرت المواعيد
  const occKey = JSON.stringify(occurrences || []);
  useEffect(() => {
    if (!occValid(occurrences)) {
      setAvailability({});
      return;
    }
    let mounted = true;
    setChecking(true);
    const timer = setTimeout(() => {
      api.post('/rooms/availability', { occurrences, exclude_lecture_id: excludeLectureId || null })
        .then(res => {
          if (!mounted) return;
          const map: Record<string, RoomAvailability> = {};
          (res.data.results || []).forEach((r: RoomAvailability) => { map[r.name] = r; });
          setAvailability(map);
        })
        .catch(() => { if (mounted) setAvailability({}); })
        .finally(() => { if (mounted) setChecking(false); });
    }, 350); // debounce بسيط عند تغيير الوقت بسرعة
    return () => { mounted = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [occKey, excludeLectureId]);

  const hasAvail = Object.keys(availability).length > 0;

  const labelFor = (r: Room) => {
    const base = r.building ? `${r.name} (${r.building})` : r.name;
    if (!hasAvail) return base;
    const av = availability[r.name];
    if (!av) return base;
    if (av.busy_count === 0) return `🟢 ${base} — متاحة`;
    if (av.total <= 1) {
      const c = av.conflicts[0];
      return `🔴 ${base} — مشغولة: ${c?.course_name || ''} ${c?.start_time || ''}-${c?.end_time || ''}`;
    }
    return `🔴 ${base} — مشغولة في ${av.busy_count} من ${av.total} موعداً`;
  };

  const selectedAvail = hasAvail && value ? availability[value] : undefined;

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

  const statusBox = (
    <>
      {checking && (
        <Text style={styles.checkingText}>جاري فحص إشغال القاعات...</Text>
      )}
      {!checking && selectedAvail && selectedAvail.busy_count > 0 && (
        <View style={styles.busyBox} testID={`${testID}-busy-warning`}>
          <Text style={styles.busyTitle}>⚠️ القاعة "{value}" مشغولة!</Text>
          {selectedAvail.total <= 1 ? (
            <Text style={styles.busyDetail}>
              محجوزة لمقرر "{selectedAvail.conflicts[0]?.course_name}" من {selectedAvail.conflicts[0]?.start_time} إلى {selectedAvail.conflicts[0]?.end_time}
            </Text>
          ) : (
            <Text style={styles.busyDetail}>
              مشغولة في {selectedAvail.busy_count} من {selectedAvail.total} موعداً — أول تعارض: {selectedAvail.conflicts[0]?.course_name} يوم {selectedAvail.conflicts[0]?.date}
            </Text>
          )}
          <Text style={styles.busyHint}>
            يمكنك المتابعة إن كان دمج شعبتين لنفس المعلم — وإلا سيرفض النظام الحفظ
          </Text>
        </View>
      )}
      {!checking && selectedAvail && selectedAvail.busy_count === 0 && (
        <Text style={styles.freeText} testID={`${testID}-free-badge`}>✓ القاعة متاحة في هذا الموعد</Text>
      )}
    </>
  );

  if (Platform.OS === 'web') {
    return (
      <View>
        <select
          value={value}
          onChange={(e: any) => onChange(e.target.value)}
          data-testid={testID}
          style={{
            width: '100%', padding: '12px', borderRadius: 8,
            border: selectedAvail && selectedAvail.busy_count > 0 ? '2px solid #e53935' : '1px solid #e0e0e0',
            fontSize: 15,
            backgroundColor: '#f9f9f9', color: '#333',
            direction: 'rtl', boxSizing: 'border-box' as any,
          }}
        >
          <option value="">-- اختر القاعة --</option>
          {legacyValue && <option value={legacyValue}>{legacyValue} (قاعة قديمة)</option>}
          {rooms.map(r => (
            <option key={r.id} value={r.name}>{labelFor(r)}</option>
          ))}
        </select>
        {statusBox}
      </View>
    );
  }

  return (
    <View>
      <View style={[styles.pickerWrapper, selectedAvail && selectedAvail.busy_count > 0 && styles.pickerBusy]}>
        <Picker selectedValue={value} onValueChange={(v) => onChange(v)} testID={testID}>
          <Picker.Item label="-- اختر القاعة --" value="" />
          {legacyValue && <Picker.Item label={`${legacyValue} (قاعة قديمة)`} value={legacyValue} />}
          {rooms.map(r => (
            <Picker.Item key={r.id} label={labelFor(r)} value={r.name} />
          ))}
        </Picker>
      </View>
      {statusBox}
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
  pickerBusy: { borderWidth: 2, borderColor: '#e53935' },
  checkingText: { fontSize: 12, color: '#888', textAlign: 'center', marginTop: 6 },
  busyBox: {
    backgroundColor: '#ffebee', borderRadius: 8, borderWidth: 1, borderColor: '#ef9a9a',
    padding: 10, marginTop: 8,
  },
  busyTitle: { color: '#c62828', fontWeight: '700', fontSize: 13, textAlign: 'right' },
  busyDetail: { color: '#b71c1c', fontSize: 12, marginTop: 4, textAlign: 'right' },
  busyHint: { color: '#8d6e63', fontSize: 11, marginTop: 6, textAlign: 'right' },
  freeText: {
    color: '#2e7d32', fontSize: 12, fontWeight: '600', textAlign: 'center', marginTop: 6,
  },
});
