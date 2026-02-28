import { goBack } from '../src/utils/navigation';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Platform,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../src/store/authStore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

export default function ManageNotifications() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [targetType, setTargetType] = useState('all');
  const [targetRole, setTargetRole] = useState('');
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);

  // Student search
  const [studentSearch, setStudentSearch] = useState('');
  const [studentResults, setStudentResults] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [searchingStudents, setSearchingStudents] = useState(false);

  const getHeaders = async () => {
    const token = await AsyncStorage.getItem('token');
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    };
  };

  const fetchData = useCallback(async () => {
    try {
      const headers = await getHeaders();
      const [historyRes, statsRes] = await Promise.all([
        fetch(`${API_URL}/api/notifications/history`, { headers }),
        fetch(`${API_URL}/api/notifications/stats`, { headers }),
      ]);
      if (historyRes.ok) setHistory(await historyRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
    } catch (e) {
      console.error('Error fetching notifications data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Student search with debounce
  useEffect(() => {
    if (targetType !== 'student' || studentSearch.length < 2) {
      setStudentResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchingStudents(true);
      try {
        const headers = await getHeaders();
        const res = await fetch(`${API_URL}/api/notifications/search-students?q=${encodeURIComponent(studentSearch)}`, { headers });
        if (res.ok) setStudentResults(await res.json());
      } catch (e) {
        console.error('Student search error:', e);
      } finally {
        setSearchingStudents(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [studentSearch, targetType]);

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) {
      setMessage({ type: 'error', text: 'يرجى كتابة العنوان والنص' });
      return;
    }
    if (targetType === 'role' && !targetRole) {
      setMessage({ type: 'error', text: 'يرجى اختيار الدور' });
      return;
    }
    if (targetType === 'student' && !selectedStudent) {
      setMessage({ type: 'error', text: 'يرجى اختيار الطالب' });
      return;
    }

    setSending(true);
    setMessage(null);
    try {
      const headers = await getHeaders();
      const payload: any = {
        title: title.trim(),
        body: body.trim(),
        target_type: targetType,
      };
      if (targetType === 'role') payload.target_role = targetRole;
      if (targetType === 'student' && selectedStudent) {
        payload.student_user_id = selectedStudent.user_id;
        payload.student_name = selectedStudent.full_name;
      }

      const res = await fetch(`${API_URL}/api/notifications/send`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: data.message + ` (${data.devices || 0} جهاز)` });
        setTitle('');
        setBody('');
        setSelectedStudent(null);
        setStudentSearch('');
        fetchData();
      } else {
        setMessage({ type: 'error', text: data.detail || 'فشل الإرسال' });
      }
    } catch (e) {
      setMessage({ type: 'error', text: 'خطأ في الاتصال' });
    } finally {
      setSending(false);
    }
  };

  const roleOptions = [
    { key: 'admin', label: 'المديرين', icon: 'shield' },
    { key: 'teacher', label: 'المعلمين', icon: 'school' },
    { key: 'student', label: 'الطلاب', icon: 'people' },
    { key: 'employee', label: 'الموظفين', icon: 'briefcase' },
  ];

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
        <TouchableOpacity onPress={() => goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Ionicons name="notifications" size={24} color="#fff" />
          <Text style={styles.headerTitle}>إدارة الإشعارات</Text>
        </View>
      </View>

      {/* Stats Cards */}
      {stats && (
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: '#e3f2fd' }]}>
            <Text style={[styles.statNum, { color: '#1565c0' }]}>{stats.registered_devices}</Text>
            <Text style={styles.statLabel}>أجهزة مسجلة</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#e8f5e9' }]}>
            <Text style={[styles.statNum, { color: '#2e7d32' }]}>{stats.total_sent}</Text>
            <Text style={styles.statLabel}>إشعارات مرسلة</Text>
          </View>
        </View>
      )}

      {/* Send Form */}
      <View style={styles.card} data-testid="send-notification-form">
        <Text style={styles.cardTitle}>إرسال إشعار جديد</Text>

        <Text style={styles.label}>العنوان</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="عنوان الإشعار..."
          placeholderTextColor="#999"
          data-testid="notification-title-input"
        />

        <Text style={styles.label}>النص</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={body}
          onChangeText={setBody}
          placeholder="نص الإشعار..."
          placeholderTextColor="#999"
          multiline
          numberOfLines={3}
          data-testid="notification-body-input"
        />

        <Text style={styles.label}>إرسال إلى</Text>
        <View style={styles.targetRow}>
          <TouchableOpacity
            style={[styles.targetBtn, targetType === 'all' && styles.targetBtnActive]}
            onPress={() => { setTargetType('all'); setTargetRole(''); setSelectedStudent(null); }}
            data-testid="target-all"
          >
            <Ionicons name="globe" size={16} color={targetType === 'all' ? '#fff' : '#666'} />
            <Text style={[styles.targetText, targetType === 'all' && styles.targetTextActive]}>الكل</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.targetBtn, targetType === 'role' && styles.targetBtnActive]}
            onPress={() => { setTargetType('role'); setSelectedStudent(null); }}
            data-testid="target-role"
          >
            <Ionicons name="people-circle" size={16} color={targetType === 'role' ? '#fff' : '#666'} />
            <Text style={[styles.targetText, targetType === 'role' && styles.targetTextActive]}>حسب الدور</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.targetBtn, targetType === 'student' && styles.targetBtnActive]}
            onPress={() => { setTargetType('student'); setTargetRole(''); }}
            data-testid="target-student"
          >
            <Ionicons name="person" size={16} color={targetType === 'student' ? '#fff' : '#666'} />
            <Text style={[styles.targetText, targetType === 'student' && styles.targetTextActive]}>طالب بعينه</Text>
          </TouchableOpacity>
        </View>

        {/* Role Selection */}
        {targetType === 'role' && (
          <View style={styles.roleRow}>
            {roleOptions.map((r) => (
              <TouchableOpacity
                key={r.key}
                style={[styles.roleChip, targetRole === r.key && styles.roleChipActive]}
                onPress={() => setTargetRole(r.key)}
                data-testid={`role-${r.key}`}
              >
                <Ionicons name={r.icon as any} size={16} color={targetRole === r.key ? '#fff' : '#555'} />
                <Text style={[styles.roleChipText, targetRole === r.key && styles.roleChipTextActive]}>{r.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Student Search */}
        {targetType === 'student' && (
          <View style={styles.studentSearchContainer}>
            {selectedStudent ? (
              <View style={styles.selectedStudentCard}>
                <View style={styles.selectedStudentInfo}>
                  <Ionicons name="person-circle" size={32} color="#1565c0" />
                  <View>
                    <Text style={styles.selectedStudentName}>{selectedStudent.full_name}</Text>
                    <Text style={styles.selectedStudentId}>{selectedStudent.student_id}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => { setSelectedStudent(null); setStudentSearch(''); }}
                  style={styles.removeStudentBtn}
                >
                  <Ionicons name="close-circle" size={24} color="#e53935" />
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.searchInputRow}>
                  <Ionicons name="search" size={18} color="#888" />
                  <TextInput
                    style={styles.searchInput}
                    value={studentSearch}
                    onChangeText={setStudentSearch}
                    placeholder="ابحث باسم الطالب أو رقمه..."
                    placeholderTextColor="#999"
                    data-testid="student-search-input"
                  />
                  {searchingStudents && <ActivityIndicator size="small" color="#1565c0" />}
                </View>
                {studentResults.length > 0 && (
                  <View style={styles.searchResults}>
                    {studentResults.map((s: any) => (
                      <TouchableOpacity
                        key={s.student_id}
                        style={styles.searchResultItem}
                        onPress={() => {
                          setSelectedStudent(s);
                          setStudentSearch('');
                          setStudentResults([]);
                        }}
                        data-testid={`student-result-${s.student_id}`}
                      >
                        <Ionicons name="person" size={18} color="#1565c0" />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.resultName}>{s.full_name}</Text>
                          <Text style={styles.resultId}>{s.student_id}</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                {studentSearch.length >= 2 && studentResults.length === 0 && !searchingStudents && (
                  <Text style={styles.noResults}>لا توجد نتائج</Text>
                )}
              </>
            )}
          </View>
        )}

        {message && (
          <View style={[styles.messageBox, message.type === 'success' ? styles.successBox : styles.errorBox]}>
            <Ionicons
              name={message.type === 'success' ? 'checkmark-circle' : 'alert-circle'}
              size={18}
              color={message.type === 'success' ? '#2e7d32' : '#c62828'}
            />
            <Text style={[styles.messageText, message.type === 'success' ? styles.successText : styles.errorText]}>
              {message.text}
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.sendBtn, sending && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={sending}
          data-testid="send-notification-btn"
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="send" size={20} color="#fff" />
          )}
          <Text style={styles.sendBtnText}>{sending ? 'جاري الإرسال...' : 'إرسال الإشعار'}</Text>
        </TouchableOpacity>
      </View>

      {/* History */}
      <View style={styles.card} data-testid="notification-history">
        <Text style={styles.cardTitle}>سجل الإشعارات</Text>
        {history.length === 0 ? (
          <Text style={styles.emptyText}>لا توجد إشعارات مرسلة بعد</Text>
        ) : (
          history.map((item: any, index: number) => (
            <View key={index} style={styles.historyItem}>
              <View style={styles.historyHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.historyTitle}>{item.title}</Text>
                  <Text style={styles.historyBody}>{item.body}</Text>
                </View>
                <View style={styles.historyBadge}>
                  <Text style={styles.historyBadgeText}>{item.target_desc || 'الكل'}</Text>
                </View>
              </View>
              <View style={styles.historyMeta}>
                <Text style={styles.historyMetaText}>
                  {item.sent_by_name || 'غير معروف'}
                </Text>
                <Text style={styles.historyMetaText}>
                  {item.devices_count || 0} جهاز
                </Text>
                <Text style={styles.historyMetaText}>
                  {item.success || 0} نجح | {item.failure || 0} فشل
                </Text>
                <Text style={styles.historyMetaText}>
                  {item.created_at ? new Date(item.created_at).toLocaleString('ar') : ''}
                </Text>
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
    gap: 12,
  },
  backBtn: { padding: 6 },
  headerContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
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
    marginBottom: 0,
    borderRadius: 12,
    padding: 16,
  },
  cardTitle: { fontSize: 17, fontWeight: 'bold', color: '#333', marginBottom: 16 },
  label: { fontSize: 14, color: '#555', marginBottom: 6, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: '#333',
    backgroundColor: '#fafafa',
    textAlign: 'right',
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  targetRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  targetBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  targetBtnActive: {
    backgroundColor: '#1565c0',
    borderColor: '#1565c0',
  },
  targetText: { fontSize: 13, color: '#666' },
  targetTextActive: { color: '#fff', fontWeight: '600' },
  roleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  roleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  roleChipActive: {
    backgroundColor: '#1565c0',
    borderColor: '#1565c0',
  },
  roleChipText: { fontSize: 13, color: '#555' },
  roleChipTextActive: { color: '#fff', fontWeight: '600' },
  // Student search
  studentSearchContainer: {
    marginTop: 10,
  },
  searchInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fafafa',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#333',
    textAlign: 'right',
    padding: 4,
  },
  searchResults: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    marginTop: 4,
    backgroundColor: '#fff',
    maxHeight: 200,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  resultName: { fontSize: 14, fontWeight: '600', color: '#333' },
  resultId: { fontSize: 12, color: '#888' },
  noResults: { color: '#999', textAlign: 'center', padding: 12, fontSize: 13 },
  selectedStudentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#e3f2fd',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#bbdefb',
  },
  selectedStudentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  selectedStudentName: { fontSize: 15, fontWeight: '600', color: '#1565c0' },
  selectedStudentId: { fontSize: 12, color: '#666' },
  removeStudentBtn: { padding: 4 },
  // Messages
  messageBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  successBox: { backgroundColor: '#e8f5e9' },
  errorBox: { backgroundColor: '#ffebee' },
  messageText: { fontSize: 14, flex: 1 },
  successText: { color: '#2e7d32' },
  errorText: { color: '#c62828' },
  sendBtn: {
    backgroundColor: '#1565c0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
    marginTop: 16,
  },
  sendBtnDisabled: { opacity: 0.6 },
  sendBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  emptyText: { color: '#999', textAlign: 'center', paddingVertical: 20 },
  historyItem: {
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    paddingVertical: 12,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  historyTitle: { fontSize: 15, fontWeight: '600', color: '#333' },
  historyBody: { fontSize: 13, color: '#666', marginTop: 2 },
  historyBadge: {
    backgroundColor: '#e3f2fd',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  historyBadgeText: { fontSize: 11, color: '#1565c0', fontWeight: '600' },
  historyMeta: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  historyMetaText: { fontSize: 12, color: '#888' },
});
