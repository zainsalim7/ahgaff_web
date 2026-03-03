import { goBack } from '../src/utils/navigation';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  FlatList,
  Platform,
  ActivityIndicator,
  Modal,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LoadingScreen } from '../src/components/LoadingScreen';

interface TrashItem {
  id: string;
  item_type: string;
  item_name: string;
  deleted_by: string;
  deleted_at: string;
  expires_at: string;
  days_remaining: number;
}

const showMessage = (title: string, message: string) => {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
};

const TYPE_LABELS: Record<string, string> = {
  course: 'مقرر',
  teacher: 'معلم',
  student: 'طالب',
};

const TYPE_ICONS: Record<string, string> = {
  course: 'book',
  teacher: 'school',
  student: 'person',
};

const TYPE_COLORS: Record<string, string> = {
  course: '#ff9800',
  teacher: '#9c27b0',
  student: '#1565c0',
};

export default function TrashScreen() {
  const router = useRouter();
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearing, setClearing] = useState(false);

  const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

  const fetchTrash = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/trash`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setItems(data);
      }
    } catch (error) {
      console.error('Error fetching trash:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [API_URL]);

  useEffect(() => {
    fetchTrash();
  }, [fetchTrash]);

  const handleRestore = async (item: TrashItem) => {
    if (Platform.OS === 'web') {
      if (!window.confirm(`استعادة "${item.item_name}"؟`)) return;
    }
    
    setActionLoading(item.id);
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/trash/${item.id}/restore`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      
      if (res.ok) {
        showMessage('نجاح', `تم استعادة "${item.item_name}" بنجاح`);
        fetchTrash();
      } else {
        showMessage('خطأ', data.detail || 'فشل في الاستعادة');
      }
    } catch (error) {
      showMessage('خطأ', 'فشل في الاستعادة');
    } finally {
      setActionLoading(null);
    }
  };

  const handlePermanentDelete = async (item: TrashItem) => {
    if (Platform.OS === 'web') {
      if (!window.confirm(`حذف "${item.item_name}" نهائياً؟\n\nلن يمكن استعادته بعد ذلك.`)) return;
    }
    
    setActionLoading(item.id);
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/trash/${item.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      if (res.ok) {
        showMessage('تم', `تم الحذف النهائي لـ "${item.item_name}"`);
        fetchTrash();
      } else {
        showMessage('خطأ', 'فشل في الحذف');
      }
    } catch (error) {
      showMessage('خطأ', 'فشل في الحذف');
    } finally {
      setActionLoading(null);
    }
  };

  const handleClearAll = async () => {
    setClearing(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/trash`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      
      if (res.ok) {
        showMessage('تم', data.message);
        setShowClearModal(false);
        fetchTrash();
      } else {
        showMessage('خطأ', 'فشل في تفريغ السلة');
      }
    } catch (error) {
      showMessage('خطأ', 'فشل في تفريغ السلة');
    } finally {
      setClearing(false);
    }
  };

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return `${d.getFullYear()}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getDate().toString().padStart(2,'0')} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
    } catch {
      return isoString;
    }
  };

  const renderItem = ({ item }: { item: TrashItem }) => {
    const typeColor = TYPE_COLORS[item.item_type] || '#666';
    const typeIcon = TYPE_ICONS[item.item_type] || 'document';
    const typeLabel = TYPE_LABELS[item.item_type] || item.item_type;
    const isActionLoading = actionLoading === item.id;
    
    return (
      <View style={styles.itemCard} data-testid={`trash-item-${item.id}`}>
        <View style={styles.itemHeader}>
          <View style={[styles.typeBadge, { backgroundColor: typeColor + '18' }]}>
            <Ionicons name={typeIcon as any} size={16} color={typeColor} />
            <Text style={[styles.typeBadgeText, { color: typeColor }]}>{typeLabel}</Text>
          </View>
          <Text style={styles.daysLeft}>
            {item.days_remaining > 0 ? `${item.days_remaining} يوم متبقي` : 'ينتهي اليوم'}
          </Text>
        </View>
        
        <Text style={styles.itemName}>{item.item_name}</Text>
        
        <View style={styles.itemMeta}>
          <Ionicons name="time-outline" size={14} color="#999" />
          <Text style={styles.metaText}>{formatDate(item.deleted_at)}</Text>
          {item.deleted_by ? (
            <>
              <Ionicons name="person-outline" size={14} color="#999" style={{ marginLeft: 12 }} />
              <Text style={styles.metaText}>{item.deleted_by}</Text>
            </>
          ) : null}
        </View>
        
        {/* Progress bar for remaining days */}
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { 
            width: `${Math.max(3, (item.days_remaining / 30) * 100)}%`,
            backgroundColor: item.days_remaining > 10 ? '#4caf50' : item.days_remaining > 3 ? '#ff9800' : '#f44336'
          }]} />
        </View>
        
        <View style={styles.itemActions}>
          <TouchableOpacity
            style={[styles.restoreBtn]}
            onPress={() => handleRestore(item)}
            disabled={isActionLoading}
            data-testid={`restore-btn-${item.id}`}
          >
            {isActionLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="refresh" size={18} color="#fff" />
                <Text style={styles.restoreBtnText}>استعادة</Text>
              </>
            )}
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.permanentDeleteBtn}
            onPress={() => handlePermanentDelete(item)}
            disabled={isActionLoading}
            data-testid={`permanent-delete-btn-${item.id}`}
          >
            <Ionicons name="close-circle" size={18} color="#f44336" />
            <Text style={styles.permanentDeleteBtnText}>حذف نهائي</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-forward" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>سلة المحذوفات</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.content}>
        {/* معلومات */}
        <View style={styles.infoBar}>
          <View style={styles.infoLeft}>
            <Ionicons name="trash" size={20} color="#666" />
            <Text style={styles.infoText}>
              {items.length} عنصر في السلة
            </Text>
          </View>
          {items.length > 0 && (
            <TouchableOpacity
              style={styles.clearAllBtn}
              onPress={() => setShowClearModal(true)}
              data-testid="clear-all-trash-btn"
            >
              <Ionicons name="trash-bin" size={16} color="#f44336" />
              <Text style={styles.clearAllBtnText}>تفريغ الكل</Text>
            </TouchableOpacity>
          )}
        </View>
        
        <Text style={styles.retentionNote}>
          يتم حذف العناصر تلقائياً بعد 30 يوم من تاريخ الحذف
        </Text>

        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchTrash(); }} />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="checkmark-circle-outline" size={80} color="#ccc" />
              <Text style={styles.emptyTitle}>سلة المحذوفات فارغة</Text>
              <Text style={styles.emptySubtext}>لا توجد عناصر محذوفة حالياً</Text>
            </View>
          }
        />
      </View>

      {/* نافذة تأكيد تفريغ السلة */}
      <Modal visible={showClearModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Ionicons name="warning" size={48} color="#f44336" style={{ alignSelf: 'center', marginBottom: 16 }} />
            <Text style={styles.modalTitle}>تفريغ سلة المحذوفات</Text>
            <Text style={styles.modalMessage}>
              سيتم حذف {items.length} عنصر نهائياً ولن يمكن استعادتها.{'\n'}هل أنت متأكد؟
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowClearModal(false)}
              >
                <Text style={styles.modalCancelText}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={handleClearAll}
                disabled={clearing}
              >
                {clearing ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalConfirmText}>تفريغ الكل</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1565c0',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  content: {
    flex: 1,
  },
  infoBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  infoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  clearAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffebee',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  clearAllBtnText: {
    color: '#f44336',
    fontSize: 13,
    fontWeight: '600',
  },
  retentionNote: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    paddingVertical: 8,
    backgroundColor: '#fafafa',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  itemCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#eee',
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  typeBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  daysLeft: {
    fontSize: 12,
    color: '#999',
    fontWeight: '500',
  },
  itemName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginBottom: 8,
    textAlign: 'right',
  },
  itemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 10,
  },
  metaText: {
    fontSize: 12,
    color: '#999',
  },
  progressBar: {
    height: 4,
    backgroundColor: '#eee',
    borderRadius: 2,
    marginBottom: 12,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  itemActions: {
    flexDirection: 'row',
    gap: 10,
  },
  restoreBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4caf50',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  restoreBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  permanentDeleteBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffebee',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  permanentDeleteBtnText: {
    color: '#f44336',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 80,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '90%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    textAlign: 'center',
    marginBottom: 12,
  },
  modalMessage: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancelBtn: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#666',
    fontWeight: '600',
  },
  modalConfirmBtn: {
    flex: 1,
    backgroundColor: '#f44336',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  modalConfirmText: {
    color: '#fff',
    fontWeight: '700',
  },
});
