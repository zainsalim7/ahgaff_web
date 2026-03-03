import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { studentsAPI, departmentsAPI, settingsAPI } from '../src/services/api';
import { LoadingScreen } from '../src/components/LoadingScreen';

export default function StudentCardScreen() {
  const [student, setStudent] = useState<any>(null);
  const [departmentName, setDepartmentName] = useState('');
  const [collegeName, setCollegeName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const studentRes = await studentsAPI.getMe();
      setStudent(studentRes.data);

      if (studentRes.data?.department_id) {
        try {
          const deptsRes = await departmentsAPI.getAll();
          const dept = deptsRes.data.find((d: any) => d.id === studentRes.data.department_id);
          if (dept) setDepartmentName(dept.name);
        } catch (e) {}
      }

      try {
        const settingsRes = await settingsAPI.get();
        if (settingsRes.data?.college_name) setCollegeName(settingsRes.data.college_name);
      } catch (e) {}
    } catch (error) {
      console.error('Error fetching student:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async () => {
    if (!student) return;
    try {
      await Share.share({
        message: `بطاقة الطالب\nالاسم: ${student.full_name}\nالرقم الأكاديمي: ${student.student_id}\nالقسم: ${departmentName}\nالمستوى: ${student.level}`,
      });
    } catch (error) {}
  };

  if (loading) return <LoadingScreen />;

  if (!student) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={56} color="#c62828" />
          <Text style={styles.errorText}>لم يتم العثور على بيانات الطالب</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']} data-testid="student-card-screen">
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          {/* Card Header */}
          <View style={styles.cardHeader}>
            {collegeName ? (
              <Text style={styles.collegeName}>{collegeName}</Text>
            ) : (
              <Text style={styles.collegeName}>جامعة الأحقاف</Text>
            )}
            <Text style={styles.cardType}>بطاقة طالب</Text>
          </View>

          {/* Student Photo / Avatar */}
          <View style={styles.avatarSection}>
            <View style={styles.avatarCircle}>
              <Ionicons name="school" size={48} color="#0d47a1" />
            </View>
          </View>

          {/* Student Info */}
          <View style={styles.infoSection}>
            <Text style={styles.studentName} data-testid="card-student-name">{student.full_name}</Text>
            <Text style={styles.studentIdText} data-testid="card-student-id">#{student.student_id}</Text>
          </View>

          {/* Details */}
          <View style={styles.detailsGrid}>
            <View style={styles.detailRow}>
              <Ionicons name="business-outline" size={18} color="#0d47a1" />
              <Text style={styles.detailLabel}>القسم</Text>
              <Text style={styles.detailValue}>{departmentName || 'غير محدد'}</Text>
            </View>

            <View style={styles.detailRow}>
              <Ionicons name="layers-outline" size={18} color="#0d47a1" />
              <Text style={styles.detailLabel}>المستوى</Text>
              <Text style={styles.detailValue}>{student.level || 'غير محدد'}</Text>
            </View>

            {student.section && (
              <View style={styles.detailRow}>
                <Ionicons name="people-outline" size={18} color="#0d47a1" />
                <Text style={styles.detailLabel}>الشعبة</Text>
                <Text style={styles.detailValue}>{student.section}</Text>
              </View>
            )}
          </View>

          {/* QR Code */}
          {student.qr_code && (
            <View style={styles.qrSection}>
              <View style={styles.qrBorder}>
                <QRCode value={student.qr_code} size={160} backgroundColor="white" color="#0d47a1" />
              </View>
              <Text style={styles.qrHint}>استخدم هذا الرمز لتسجيل الحضور</Text>
            </View>
          )}

          {/* Card Footer */}
          <View style={styles.cardFooter}>
            <TouchableOpacity style={styles.shareBtn} onPress={handleShare} data-testid="share-card-btn">
              <Ionicons name="share-outline" size={18} color="#0d47a1" />
              <Text style={styles.shareBtnText}>مشاركة</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  scrollContent: { padding: 20, alignItems: 'center' },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: 16, color: '#c62828', marginTop: 12 },

  card: {
    backgroundColor: '#fff',
    borderRadius: 24,
    width: '100%',
    maxWidth: 380,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    overflow: 'hidden',
  },

  cardHeader: {
    backgroundColor: '#0d47a1',
    paddingVertical: 20,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  collegeName: { fontSize: 17, fontWeight: 'bold', color: '#fff', marginBottom: 4 },
  cardType: { fontSize: 13, color: 'rgba(255,255,255,0.7)' },

  avatarSection: { alignItems: 'center', marginTop: -32 },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#e8eaf6',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#fff',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },

  infoSection: { alignItems: 'center', paddingTop: 12, paddingBottom: 8 },
  studentName: { fontSize: 20, fontWeight: 'bold', color: '#1a1a2e' },
  studentIdText: { fontSize: 15, color: '#0d47a1', fontWeight: '600', marginTop: 4 },

  detailsGrid: { paddingHorizontal: 24, paddingVertical: 8 },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    gap: 10,
  },
  detailLabel: { fontSize: 13, color: '#999', flex: 1 },
  detailValue: { fontSize: 14, fontWeight: '600', color: '#1a1a2e' },

  qrSection: { alignItems: 'center', paddingVertical: 20 },
  qrBorder: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#e8eaf6',
    backgroundColor: '#fff',
  },
  qrHint: { fontSize: 12, color: '#999', marginTop: 10 },

  cardFooter: { paddingHorizontal: 24, paddingBottom: 20, alignItems: 'center' },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#0d47a1',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 6,
  },
  shareBtnText: { color: '#0d47a1', fontWeight: '600', fontSize: 14 },
});
