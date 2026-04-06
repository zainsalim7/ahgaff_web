import { goBack } from '../src/utils/navigation';
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/contexts/AuthContext';
import api from '../src/services/api';
import { formatGregorianDate, formatDualDate } from '../src/utils/dateUtils';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'warning' | 'deprivation' | 'info' | 'reminder';
  course_id?: string;
  course_name?: string;
  absence_rate?: number;
  remaining_allowed?: number;
  is_read: boolean;
  created_at: string;
}

interface NotificationsResponse {
  notifications: Notification[];
  unread_count: number;
}

export default function NotificationsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = useCallback(async () => {
    try {
      const response = await api.get('/notifications/my');
      setNotifications(response.data.notifications);
      setUnreadCount(response.data.unread_count);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchNotifications();
  };

  const markAsRead = async (notificationId: string) => {
    try {
      await api.post(`/notifications/mark-read/${notificationId}`);
      setNotifications(prev =>
        prev.map(n =>
          n.id === notificationId ? { ...n, is_read: true } : n
        )
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.post('/notifications/mark-all-read');
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  const deleteNotification = async (notificationId: string) => {
    const doDelete = async () => {
      try {
        await api.delete(`/notifications/${notificationId}`);
        setNotifications(prev => prev.filter(n => n.id !== notificationId));
        const deleted = notifications.find(n => n.id === notificationId);
        if (deleted && !deleted.is_read) {
          setUnreadCount(prev => Math.max(0, prev - 1));
        }
      } catch (error) {
        console.error('Error deleting notification:', error);
        if (Platform.OS === 'web') {
          window.alert('فشل حذف الإشعار');
        } else {
          Alert.alert('خطأ', 'فشل حذف الإشعار');
        }
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm('هل تريد حذف هذا الإشعار؟')) {
        await doDelete();
      }
    } else {
      Alert.alert('تأكيد', 'هل تريد حذف هذا الإشعار؟', [
        { text: 'إلغاء', style: 'cancel' },
        { text: 'حذف', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'warning':
        return 'warning';
      case 'deprivation':
        return 'close-circle';
      case 'reminder':
        return 'time';
      default:
        return 'information-circle';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'warning':
        return '#f57c00';
      case 'deprivation':
        return '#d32f2f';
      case 'reminder':
        return '#1976d2';
      default:
        return '#666';
    }
  };

  const formatDate = (dateString: string) => {
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
    return formatGregorianDate(date, { includeYear: false });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1565c0" />
        <Text style={styles.loadingText}>جارٍ تحميل الإشعارات...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBack()} style={styles.backButton}>
          <Ionicons name="arrow-forward" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>الإشعارات</Text>
        {unreadCount > 0 && (
          <TouchableOpacity onPress={markAllAsRead} style={styles.markAllButton}>
            <Text style={styles.markAllText}>قراءة الكل</Text>
          </TouchableOpacity>
        )}
        {(user?.role === 'admin' || user?.permissions?.includes('send_notifications')) && (
          <TouchableOpacity onPress={() => router.push('/send-notification')} style={[styles.markAllButton, { backgroundColor: '#4caf50' }]} data-testid="send-notification-btn">
            <Ionicons name="send" size={16} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {/* Unread Badge */}
      {unreadCount > 0 && (
        <View style={styles.unreadBadge}>
          <Ionicons name="notifications" size={20} color="#1565c0" />
          <Text style={styles.unreadText}>
            لديك {unreadCount} إشعار غير مقروء
          </Text>
        </View>
      )}

      {/* Notifications List */}
      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1565c0']} />
        }
      >
        {notifications.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="notifications-off-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>لا توجد إشعارات</Text>
            <Text style={styles.emptySubtext}>ستظهر هنا التنبيهات المتعلقة بحضورك</Text>
          </View>
        ) : (
          notifications.map((notification) => (
            <TouchableOpacity
              key={notification.id}
              style={[
                styles.notificationCard,
                !notification.is_read && styles.unreadCard,
                { borderRightColor: getTypeColor(notification.type) }
              ]}
              onPress={() => {
                if (!notification.is_read) {
                  markAsRead(notification.id);
                }
              }}
            >
              <View style={styles.notificationHeader}>
                <View style={[styles.iconContainer, { backgroundColor: getTypeColor(notification.type) + '20' }]}>
                  <Ionicons
                    name={getTypeIcon(notification.type)}
                    size={24}
                    color={getTypeColor(notification.type)}
                  />
                </View>
                <View style={styles.titleContainer}>
                  <Text style={styles.notificationTitle}>{notification.title}</Text>
                  <Text style={styles.notificationTime}>{formatDate(notification.created_at)}</Text>
                </View>
                {!notification.is_read && <View style={styles.unreadDot} />}
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation?.();
                    deleteNotification(notification.id);
                  }}
                  style={styles.deleteBtn}
                  data-testid={`delete-notification-${notification.id}`}
                  accessibilityLabel="حذف"
                >
                  <Ionicons name="trash-outline" size={18} color="#d32f2f" />
                </TouchableOpacity>
              </View>

              <Text style={styles.notificationMessage}>{notification.message}</Text>

              {(notification.absence_rate !== undefined || notification.remaining_allowed !== undefined) && (
                <View style={styles.statsContainer}>
                  {notification.absence_rate !== undefined && (
                    <View style={styles.statBadge}>
                      <Text style={styles.statLabel}>نسبة الغياب</Text>
                      <Text style={[styles.statValue, { color: getTypeColor(notification.type) }]}>
                        {notification.absence_rate.toFixed(1)}%
                      </Text>
                    </View>
                  )}
                  {notification.remaining_allowed !== undefined && notification.remaining_allowed > 0 && (
                    <View style={styles.statBadge}>
                      <Text style={styles.statLabel}>الغياب المتبقي</Text>
                      <Text style={styles.statValue}>{notification.remaining_allowed}</Text>
                    </View>
                  )}
                </View>
              )}
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1565c0',
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  markAllButton: {
    padding: 8,
  },
  markAllText: {
    color: '#fff',
    fontSize: 14,
  },
  unreadBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e3f2fd',
    padding: 12,
    gap: 8,
  },
  unreadText: {
    color: '#1565c0',
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    color: '#999',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#bbb',
    marginTop: 8,
    textAlign: 'center',
  },
  notificationCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderRightWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  unreadCard: {
    backgroundColor: '#fafafa',
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleContainer: {
    flex: 1,
    marginLeft: 12,
  },
  notificationTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  notificationTime: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#1565c0',
  },
  deleteBtn: {
    padding: 6,
    marginLeft: 4,
  },
  notificationMessage: {
    fontSize: 14,
    color: '#666',
    lineHeight: 22,
  },
  statsContainer: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 12,
  },
  statBadge: {
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 11,
    color: '#999',
    marginBottom: 2,
  },
  statValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
});
