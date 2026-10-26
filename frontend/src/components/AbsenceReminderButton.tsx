import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Alert, Platform, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';

interface Props {
  lectureId: string;
  courseName: string;
  date: string;
  startTime: string;
  endTime: string;
  canSend: boolean;
  compact?: boolean;
}

// 🔔 زر "تنبيه الأستاذ" لمحاضرة غائب فيها الأستاذ — يُستخدم في أكثر من صفحة (تقرير غياب الأساتذة، جدول المقرر)
export default function AbsenceReminderButton({ lectureId, courseName, date, startTime, endTime, canSend, compact }: Props) {
  const [status, setStatus] = useState<{ sent: boolean; sent_at?: string; kind?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [windowHours, setWindowHours] = useState(72);

  useEffect(() => {
    if (!canSend) return;
    api.get(`/lectures/${lectureId}/absence-reminder`).then((r) => setStatus(r.data)).catch(() => setStatus({ sent: false }));
    api.get('/absence-justifications/meta').then((r) => setWindowHours(r.data?.window_hours || 72)).catch(() => {});
  }, [lectureId, canSend]);

  if (!canSend || status === null) return null;

  const previewMessage = () => {
    let deadlineText = '';
    try {
      const end = new Date(`${date}T${endTime}:00`);
      end.setHours(end.getHours() + windowHours);
      deadlineText = end.toISOString().slice(0, 16).replace('T', ' ');
    } catch {}
    return `لاحظنا غيابكم في محاضرة ${courseName} بتاريخ ${date} (${startTime} - ${endTime}). نرجو تقديم عذركم قبل ${deadlineText}. مع تحيات الإدارة`;
  };

  const send = async () => {
    setLoading(true);
    try {
      const r = await api.post(`/lectures/${lectureId}/absence-reminder`, {});
      setStatus({ sent: true, sent_at: r.data.sent_at, kind: r.data.kind });
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'تعذر إرسال التنبيه';
      if (Platform.OS === 'web') window.alert(msg); else Alert.alert('خطأ', msg);
    } finally {
      setLoading(false);
    }
  };

  const confirmAndSend = () => {
    const msg = `سيصل هذا النص للأستاذ:\n\n${previewMessage()}`;
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) send();
    } else {
      Alert.alert('تأكيد إرسال تنبيه الغياب', msg, [
        { text: 'إلغاء', style: 'cancel' },
        { text: 'إرسال', onPress: send },
      ]);
    }
  };

  if (status.sent) {
    const sentAt = (status.sent_at || '').slice(0, 16).replace('T', ' ');
    return (
      <View style={[styles.sentBadge, compact && styles.compact]} testID={`absence-reminder-sent-${lectureId}`}>
        <Ionicons name="checkmark-circle" size={13} color="#2e7d32" />
        <Text style={styles.sentText}>تم التنبيه {sentAt} ({status.kind === 'manual' ? 'يدوي' : 'تلقائي'})</Text>
      </View>
    );
  }

  return (
    <TouchableOpacity style={[styles.btn, compact && styles.compact]} onPress={confirmAndSend} disabled={loading} testID={`absence-reminder-btn-${lectureId}`}>
      {loading ? <ActivityIndicator size="small" color="#b45309" /> : <Ionicons name="notifications-outline" size={14} color="#b45309" />}
      <Text style={styles.btnText}>تنبيه الأستاذ</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#fff8e1', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#ffe0a3' },
  sentBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#e8f5e9', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  compact: { paddingHorizontal: 7, paddingVertical: 4 },
  btnText: { fontSize: 11.5, fontWeight: '700', color: '#b45309' },
  sentText: { fontSize: 11, fontWeight: '700', color: '#2e7d32' },
});
