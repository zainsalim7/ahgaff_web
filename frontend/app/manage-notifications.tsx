import { goBack } from '../src/utils/navigation';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import api from '../src/services/api';

export default function ManageNotifications() {
  const router = useRouter();
  const [history, setHistory] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [historyRes, statsRes] = await Promise.all([
        api.get('/notifications/history'),
        api.get('/notifications/stats'),
      ]);
      setHistory(historyRes.data);
      setStats(statsRes.data);
    } catch (e) {
      console.error('Error fetching notifications data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const deleteHistoryItem = async (index: number) => {
    const item = history[index];
    const doDelete = () => {
      setHistory(prev => prev.filter((_, i) => i !== index));
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`هل تريد حذف الإشعار "${item.title}"؟`)) {
        doDelete();
      }
    } else {
      Alert.alert('تأكيد الحذف', `هل تريد حذف الإشعار "${item.title}"؟`, [
        { text: 'إلغاء', style: 'cancel' },
        { text: 'حذف', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'الآن';
    if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
    if (diffHours < 24) return `منذ ${diffHours} ساعة`;
    if (diffDays < 7) return `منذ ${diffDays} يوم`;
    return date.toLocaleDateString('ar');
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1565c0" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBack()} style={styles.backBtn} data-testid="back-btn">
          <Ionicons name="arrow-forward" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Ionicons name="notifications" size={24} color="#fff" />
          <Text style={styles.headerTitle}>سجل الإشعارات</Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push('/send-notification')}
          style={styles.sendBtn}
          data-testid="go-send-notification"
        >
          <Ionicons name="send" size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Stats */}
      {stats && (
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: '#e8f5e9' }]}>
            <Text style={[styles.statNum, { color: '#2e7d32' }]}>{stats.total_sent}</Text>
            <Text style={styles.statLabel}>إشعارات مرسلة</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#e3f2fd' }]}>
            <Text style={[styles.statNum, { color: '#1565c0' }]}>{stats.registered_devices}</Text>
            <Text style={styles.statLabel}>أجهزة مسجلة</Text>
          </View>
        </View>
      )}

      {/* History */}
      <View style={styles.card} data-testid="notification-history">
        <Text style={styles.cardTitle}>الإشعارات المرسلة</Text>
        {history.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="mail-unread-outline" size={48} color="#ccc" />
            <Text style={styles.emptyText}>لا توجد إشعارات مرسلة بعد</Text>
          </View>
        ) : (
          history.map((item: any, index: number) => (
            <View key={index} style={styles.historyItem} data-testid={`history-item-${index}`}>
              <View style={styles.historyHeader}>
                <View style={styles.historyIcon}>
                  <Ionicons
                    name={item.target_type === 'all' ? 'globe' :
                          item.target_type === 'role' ? 'people-circle' :
                          item.target_type === 'student' ? 'person' :
                          item.target_type === 'teacher' ? 'school' :
                          item.target_type === 'course' ? 'book' : 'notifications'}
                    size={20}
                    color="#1565c0"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.historyTitle}>{item.title}</Text>
                  <Text style={styles.historyBody}>{item.body}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => deleteHistoryItem(index)}
                  style={styles.deleteBtn}
                  data-testid={`delete-history-${index}`}
                  accessibilityLabel="حذف"
                >
                  <Ionicons name="trash-outline" size={18} color="#d32f2f" />
                </TouchableOpacity>
              </View>
              <View style={styles.historyMeta}>
                <View style={styles.metaChip}>
                  <Ionicons name="people" size={12} color="#1565c0" />
                  <Text style={styles.metaChipText}>{item.target_desc || 'الكل'}</Text>
                </View>
                <View style={styles.metaChip}>
                  <Ionicons name="person" size={12} color="#666" />
                  <Text style={styles.metaChipText}>{item.sent_by_name || 'غير معروف'}</Text>
                </View>
                {(item.users_count || item.devices_count) > 0 && (
                  <View style={styles.metaChip}>
                    <Ionicons name="checkmark-circle" size={12} color="#4caf50" />
                    <Text style={styles.metaChipText}>{item.users_count || item.devices_count} مستخدم</Text>
                  </View>
                )}
                <Text style={styles.historyTime}>{formatDate(item.created_at)}</Text>
              </View>
            </View>
          ))
        )}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    backgroundColor: '#1565c0',
    paddingTop: Platform.OS === 'web' ? 16 : 50,
    paddingBottom: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: { padding: 6 },
  headerContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  sendBtn: {
    backgroundColor: '#4caf50',
    padding: 8,
    borderRadius: 8,
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  statNum: { fontSize: 28, fontWeight: 'bold' },
  statLabel: { fontSize: 13, color: '#555', marginTop: 4 },
  card: {
    backgroundColor: '#fff',
    margin: 16,
    borderRadius: 12,
    padding: 16,
  },
  cardTitle: { fontSize: 17, fontWeight: 'bold', color: '#333', marginBottom: 16 },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyText: { color: '#999', textAlign: 'center', marginTop: 12, fontSize: 15 },
  historyItem: {
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    paddingVertical: 14,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  historyIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#e3f2fd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyTitle: { fontSize: 15, fontWeight: '600', color: '#333' },
  historyBody: { fontSize: 13, color: '#666', marginTop: 3 },
  deleteBtn: {
    padding: 6,
  },
  historyMeta: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  metaChipText: { fontSize: 12, color: '#555' },
  historyTime: { fontSize: 12, color: '#999' },
});
