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
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/contexts/AuthContext';
import { departmentsAPI } from '../src/services/api';

interface DepartmentStats {
  id: string;
  name: string;
  code: string;
  faculty_name: string | null;
  students_count: number;
  courses_count: number;
  today_attendance_rate: number;
  warnings_count: number;
  deprivations_count: number;
}

interface Warning {
  student_id: string;
  student_name: string;
  course_name: string;
  course_code: string;
  department_id: string;
  department_name: string;
  total_lectures: number;
  absent_count: number;
  absence_rate: number;
  remaining_allowed: number;
  status: string;
}

interface DashboardData {
  departments: DepartmentStats[];
  summary: {
    total_departments: number;
    total_students: number;
    total_courses: number;
    total_warnings: number;
    total_deprivations: number;
  };
  warnings: Warning[];
  thresholds: {
    warning: number;
    deprivation: number;
  };
}

export default function DepartmentDashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'warnings'>('overview');

  const fetchData = useCallback(async () => {
    try {
      const response = await departmentsAPI.getDashboard();
      setData(response.data);
    } catch (error) {
      console.error('Error fetching dashboard:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const getStatusColor = (status: string) => {
    return status === 'محروم' ? '#d32f2f' : '#f57c00';
  };

  const getAttendanceColor = (rate: number) => {
    if (rate >= 80) return '#4caf50';
    if (rate >= 60) return '#ff9800';
    return '#f44336';
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1565c0" />
        <Text style={styles.loadingText}>جارٍ تحميل البيانات...</Text>
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
        <Text style={styles.headerTitle}>لوحة تحكم الأقسام</Text>
        <TouchableOpacity onPress={onRefresh} style={styles.refreshButton}>
          <Ionicons name="refresh" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Summary Cards */}
      {data && (
        <View style={styles.summaryContainer}>
          <View style={styles.summaryRow}>
            <View style={[styles.summaryCard, { backgroundColor: '#1565c0' }]}>
              <Ionicons name="business" size={28} color="#fff" />
              <Text style={styles.summaryNumber}>{data.summary.total_departments}</Text>
              <Text style={styles.summaryLabel}>الأقسام</Text>
            </View>
            <View style={[styles.summaryCard, { backgroundColor: '#2e7d32' }]}>
              <Ionicons name="people" size={28} color="#fff" />
              <Text style={styles.summaryNumber}>{data.summary.total_students}</Text>
              <Text style={styles.summaryLabel}>الطلاب</Text>
            </View>
            <View style={[styles.summaryCard, { backgroundColor: '#7b1fa2' }]}>
              <Ionicons name="book" size={28} color="#fff" />
              <Text style={styles.summaryNumber}>{data.summary.total_courses}</Text>
              <Text style={styles.summaryLabel}>المقررات</Text>
            </View>
          </View>
          
          {/* Alerts Summary */}
          {(data.summary.total_warnings > 0 || data.summary.total_deprivations > 0) && (
            <View style={styles.alertsSummary}>
              <View style={styles.alertItem}>
                <Ionicons name="warning" size={20} color="#f57c00" />
                <Text style={styles.alertCount}>{data.summary.total_warnings}</Text>
                <Text style={styles.alertLabel}>إنذار</Text>
              </View>
              <View style={styles.alertDivider} />
              <View style={styles.alertItem}>
                <Ionicons name="close-circle" size={20} color="#d32f2f" />
                <Text style={[styles.alertCount, { color: '#d32f2f' }]}>{data.summary.total_deprivations}</Text>
                <Text style={styles.alertLabel}>محروم</Text>
              </View>
            </View>
          )}
        </View>
      )}

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'overview' && styles.activeTab]}
          onPress={() => setActiveTab('overview')}
        >
          <Ionicons name="grid" size={20} color={activeTab === 'overview' ? '#1565c0' : '#666'} />
          <Text style={[styles.tabText, activeTab === 'overview' && styles.activeTabText]}>الأقسام</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'warnings' && styles.activeTab]}
          onPress={() => setActiveTab('warnings')}
        >
          <Ionicons name="alert-circle" size={20} color={activeTab === 'warnings' ? '#1565c0' : '#666'} />
          <Text style={[styles.tabText, activeTab === 'warnings' && styles.activeTabText]}>
            التنبيهات {data && data.warnings.length > 0 && `(${data.warnings.length})`}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1565c0']} />
        }
      >
        {activeTab === 'overview' && data && (
          <View style={styles.departmentsList}>
            {data.departments.map((dept) => (
              <TouchableOpacity
                key={dept.id}
                style={styles.departmentCard}
                onPress={() => router.push(`/students?department_id=${dept.id}`)}
              >
                <View style={styles.deptHeader}>
                  <View style={styles.deptTitleRow}>
                    <Ionicons name="school" size={24} color="#1565c0" />
                    <View style={styles.deptInfo}>
                      <Text style={styles.deptName}>{dept.name}</Text>
                      {dept.faculty_name && (
                        <Text style={styles.facultyName}>{dept.faculty_name}</Text>
                      )}
                    </View>
                  </View>
                  {dept.code && <Text style={styles.deptCode}>{dept.code}</Text>}
                </View>

                <View style={styles.statsRow}>
                  <View style={styles.statItem}>
                    <Ionicons name="people-outline" size={18} color="#666" />
                    <Text style={styles.statValue}>{dept.students_count}</Text>
                    <Text style={styles.statLabel}>طالب</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Ionicons name="book-outline" size={18} color="#666" />
                    <Text style={styles.statValue}>{dept.courses_count}</Text>
                    <Text style={styles.statLabel}>مقرر</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Ionicons name="checkmark-circle-outline" size={18} color={getAttendanceColor(dept.today_attendance_rate)} />
                    <Text style={[styles.statValue, { color: getAttendanceColor(dept.today_attendance_rate) }]}>
                      {dept.today_attendance_rate}%
                    </Text>
                    <Text style={styles.statLabel}>حضور اليوم</Text>
                  </View>
                </View>

                {(dept.warnings_count > 0 || dept.deprivations_count > 0) && (
                  <View style={styles.deptAlerts}>
                    {dept.warnings_count > 0 && (
                      <View style={[styles.alertBadge, { backgroundColor: '#fff3e0' }]}>
                        <Ionicons name="warning" size={14} color="#f57c00" />
                        <Text style={[styles.alertBadgeText, { color: '#f57c00' }]}>
                          {dept.warnings_count} إنذار
                        </Text>
                      </View>
                    )}
                    {dept.deprivations_count > 0 && (
                      <View style={[styles.alertBadge, { backgroundColor: '#ffebee' }]}>
                        <Ionicons name="close-circle" size={14} color="#d32f2f" />
                        <Text style={[styles.alertBadgeText, { color: '#d32f2f' }]}>
                          {dept.deprivations_count} محروم
                        </Text>
                      </View>
                    )}
                  </View>
                )}
              </TouchableOpacity>
            ))}

            {data.departments.length === 0 && (
              <View style={styles.emptyState}>
                <Ionicons name="folder-open-outline" size={64} color="#ccc" />
                <Text style={styles.emptyText}>لا توجد أقسام</Text>
              </View>
            )}
          </View>
        )}

        {activeTab === 'warnings' && data && (
          <View style={styles.warningsList}>
            {data.thresholds && (
              <View style={styles.thresholdsInfo}>
                <Text style={styles.thresholdsText}>
                  حد الإنذار: {data.thresholds.warning}% | حد الحرمان: {data.thresholds.deprivation}%
                </Text>
              </View>
            )}

            {data.warnings.map((warning, index) => (
              <View
                key={`${warning.student_id}-${warning.course_code}-${index}`}
                style={[styles.warningCard, { borderRightColor: getStatusColor(warning.status) }]}
              >
                <View style={styles.warningHeader}>
                  <View style={styles.studentInfo}>
                    <Text style={styles.studentName}>{warning.student_name}</Text>
                    <Text style={styles.studentId}>{warning.student_id}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(warning.status) }]}>
                    <Text style={styles.statusText}>{warning.status}</Text>
                  </View>
                </View>

                <View style={styles.warningDetails}>
                  <View style={styles.detailRow}>
                    <Ionicons name="book" size={16} color="#666" />
                    <Text style={styles.detailText}>
                      {warning.course_name} ({warning.course_code})
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Ionicons name="business" size={16} color="#666" />
                    <Text style={styles.detailText}>{warning.department_name}</Text>
                  </View>
                </View>

                <View style={styles.absenceStats}>
                  <View style={styles.absenceStat}>
                    <Text style={styles.absenceLabel}>نسبة الغياب</Text>
                    <Text style={[styles.absenceValue, { color: getStatusColor(warning.status) }]}>
                      {warning.absence_rate}%
                    </Text>
                  </View>
                  <View style={styles.absenceStat}>
                    <Text style={styles.absenceLabel}>الغياب</Text>
                    <Text style={styles.absenceValue}>
                      {warning.absent_count}/{warning.total_lectures}
                    </Text>
                  </View>
                  <View style={styles.absenceStat}>
                    <Text style={styles.absenceLabel}>المتبقي</Text>
                    <Text style={[styles.absenceValue, warning.remaining_allowed === 0 && { color: '#d32f2f' }]}>
                      {warning.remaining_allowed}
                    </Text>
                  </View>
                </View>
              </View>
            ))}

            {data.warnings.length === 0 && (
              <View style={styles.emptyState}>
                <Ionicons name="checkmark-circle-outline" size={64} color="#4caf50" />
                <Text style={styles.emptyText}>لا توجد تنبيهات</Text>
                <Text style={styles.emptySubtext}>جميع الطلاب ضمن الحد المسموح</Text>
              </View>
            )}
          </View>
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
  refreshButton: {
    padding: 8,
  },
  summaryContainer: {
    padding: 16,
    backgroundColor: '#fff',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryCard: {
    flex: 1,
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginHorizontal: 4,
  },
  summaryNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 8,
  },
  summaryLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 4,
  },
  alertsSummary: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  alertItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  alertCount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#f57c00',
    marginHorizontal: 8,
  },
  alertLabel: {
    fontSize: 14,
    color: '#666',
  },
  alertDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#ddd',
    marginHorizontal: 24,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  activeTab: {
    borderBottomWidth: 3,
    borderBottomColor: '#1565c0',
  },
  tabText: {
    fontSize: 14,
    color: '#666',
  },
  activeTabText: {
    color: '#1565c0',
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  departmentsList: {
    padding: 16,
  },
  departmentCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  deptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  deptTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  deptInfo: {
    marginLeft: 12,
    flex: 1,
  },
  deptName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  facultyName: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  deptCode: {
    fontSize: 12,
    color: '#999',
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 4,
  },
  statLabel: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
  },
  deptAlerts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    gap: 8,
  },
  alertBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  alertBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  warningsList: {
    padding: 16,
  },
  thresholdsInfo: {
    backgroundColor: '#e3f2fd',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  thresholdsText: {
    fontSize: 13,
    color: '#1565c0',
    textAlign: 'center',
  },
  warningCard: {
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
  warningHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  studentInfo: {
    flex: 1,
  },
  studentName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  studentId: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#fff',
  },
  warningDetails: {
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  detailText: {
    fontSize: 13,
    color: '#666',
  },
  absenceStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  absenceStat: {
    alignItems: 'center',
  },
  absenceLabel: {
    fontSize: 11,
    color: '#999',
    marginBottom: 4,
  },
  absenceValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
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
  },
});
