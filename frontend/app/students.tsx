import { goBack } from '../src/utils/navigation';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
  FlatList,
  Platform,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Picker } from '@react-native-picker/picker';
import { departmentsAPI, studentsAPI, attendanceAPI, notificationsAPI } from '../src/services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Department, Student } from '../src/types';
import { LoadingScreen } from '../src/components/LoadingScreen';
import { useAuth, PERMISSIONS } from '../src/contexts/AuthContext';
import { formatGregorianDate } from '../src/utils/dateUtils';

const LEVELS = ['1', '2', '3', '4', '5'];

// دالة مساعدة للتأكيد
const showConfirm = (
  title: string, 
  message: string, 
  onConfirm: () => Promise<void> | void, 
  confirmText = 'موافق', 
  destructive = false
) => {
  if (Platform.OS === 'web') {
    const confirmed = window.confirm(`${title}\n\n${message}`);
    if (confirmed) {
      const result = onConfirm();
      if (result instanceof Promise) {
        result.catch(err => console.error('Error:', err));
      }
    }
  } else {
    Alert.alert(title, message, [
      { text: 'إلغاء', style: 'cancel' },
      { 
        text: confirmText, 
        style: destructive ? 'destructive' : 'default', 
        onPress: () => {
          const result = onConfirm();
          if (result instanceof Promise) {
            result.catch(err => console.error('Error:', err));
          }
        }
      },
    ]);
  }
};

const showMessage = (title: string, message: string) => {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
};

export default function StudentsScreen() {
  const router = useRouter();
  const { hasPermission, user, isLoading: authLoading } = useAuth();
  
  const isStudent = user?.role === 'student';
  const canManageStudents = user ? (!isStudent && (hasPermission(PERMISSIONS.MANAGE_STUDENTS) || user.role === 'admin')) : false;
  
  useEffect(() => {
    if (!authLoading && isStudent) {
      router.replace('/');
    }
  }, [isStudent, authLoading]);
  
  const [departments, setDepartments] = useState<Department[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  
  // فلاتر
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<string>('');
  const [selectedLevelFilter, setSelectedLevelFilter] = useState<string>('');
  const [selectedSectionFilter, setSelectedSectionFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // تحديد متعدد للحذف
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  
  // عرض تفاصيل الطالب
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [studentAttendance, setStudentAttendance] = useState<any[]>([]);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  
  // تعديل الطالب
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editFormData, setEditFormData] = useState({
    full_name: '',
    phone: '',
    email: '',
    level: '1',
    section: '',
  });

  // إرسال إنذار يدوي
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [warningStudent, setWarningStudent] = useState<Student | null>(null);
  const [warningData, setWarningData] = useState({
    title: '',
    message: '',
    type: 'warning',
  });
  const [sendingWarning, setSendingWarning] = useState(false);

  // حذف آمن
  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);
  const [deleteInfo, setDeleteInfo] = useState<any>(null);
  const [showSafeDeleteModal, setShowSafeDeleteModal] = useState(false);
  const [deletingStudent, setDeletingStudent] = useState(false);
  const [restoringStudent, setRestoringStudent] = useState(false);
  
  // تغيير المستوى
  const [showLevelModal, setShowLevelModal] = useState(false);
  const [changingLevel, setChangingLevel] = useState(false);

  const fetchData = useCallback(async () => {
    if (!canManageStudents) return;
    
    try {
      const [deptsRes, studentsRes] = await Promise.all([
        departmentsAPI.getAll(),
        studentsAPI.getAll(),
      ]);
      setDepartments(deptsRes.data);
      setStudents(studentsRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
      showMessage('خطأ', 'فشل في تحميل البيانات');
    } finally {
      setLoading(false);
    }
  }, [canManageStudents]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // تصفية الطلاب
  const filteredStudents = useMemo(() => {
    return students.filter(student => {
      const matchesDept = !selectedDeptFilter || student.department_id === selectedDeptFilter;
      const matchesLevel = !selectedLevelFilter || String(student.level) === selectedLevelFilter;
      const matchesSection = !selectedSectionFilter || 
        selectedSectionFilter === 'الكل' || 
        student.section === selectedSectionFilter;
      const matchesSearch = !searchQuery || 
        student.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        student.student_id.includes(searchQuery);
      
      return matchesDept && matchesLevel && matchesSection && matchesSearch;
    });
  }, [students, selectedDeptFilter, selectedLevelFilter, selectedSectionFilter, searchQuery]);

  // الشعب المتاحة
  const availableSections = useMemo(() => {
    const sections = new Set<string>();
    students.forEach(s => {
      if (s.section && (!selectedDeptFilter || s.department_id === selectedDeptFilter)) {
        sections.add(s.section);
      }
    });
    return Array.from(sections).sort();
  }, [students, selectedDeptFilter]);

  const getDepartmentName = (deptId: string) => {
    const dept = departments.find(d => d.id === deptId);
    return dept?.name || 'غير محدد';
  };

  // تحديد/إلغاء تحديد طالب
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // تحديد الكل
  const selectAll = () => {
    if (selectedIds.size === filteredStudents.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredStudents.map(s => s.id)));
    }
  };

  // حذف المحدد
  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    
    showConfirm(
      'حذف الطلاب المحددين',
      `هل أنت متأكد من حذف ${selectedIds.size} طالب؟`,
      async () => {
        setDeleting(true);
        try {
          await Promise.all(
            Array.from(selectedIds).map(id => studentsAPI.delete(id))
          );
          showMessage('تم', `تم حذف ${selectedIds.size} طالب`);
          setSelectedIds(new Set());
          setSelectionMode(false);
          fetchData();
        } catch (error) {
          showMessage('خطأ', 'فشل في حذف بعض الطلاب');
        } finally {
          setDeleting(false);
        }
      },
      'حذف',
      true
    );
  };

  // تغيير المستوى الجماعي
  const handleBulkChangeLevel = async (newLevel: number) => {
    if (selectedIds.size === 0) return;
    setChangingLevel(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
      const res = await fetch(`${API_URL}/api/students/bulk-change-level`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_ids: Array.from(selectedIds), new_level: newLevel }),
      });
      const data = await res.json();
      if (res.ok) {
        showMessage('نجاح', data.message);
        setShowLevelModal(false);
        setSelectedIds(new Set());
        setSelectionMode(false);
        fetchData();
      } else {
        showMessage('خطأ', data.detail || 'فشل في تغيير المستوى');
      }
    } catch {
      showMessage('خطأ', 'فشل في تغيير المستوى');
    } finally {
      setChangingLevel(false);
    }
  };

  // حذف طالب واحد - حذف آمن
  const handleDelete = async (studentId: string, studentName: string) => {
    const student = students.find(s => s.id === studentId);
    if (!student) return;
    setDeleteTarget(student);
    setDeleteInfo(null);
    setShowSafeDeleteModal(true);
    
    try {
      const token = await AsyncStorage.getItem('token');
      const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
      const res = await fetch(`${API_URL}/api/students/${studentId}/backup-info`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      setDeleteInfo(data);
    } catch (error) {
      setDeleteInfo({ error: true });
    }
  };

  const confirmSafeDeleteStudent = async () => {
    if (!deleteTarget) return;
    setDeletingStudent(true);
    
    try {
      const token = await AsyncStorage.getItem('token');
      const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
      const res = await fetch(`${API_URL}/api/students/${deleteTarget.id}/safe-delete`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      
      if (res.ok && data.backup) {
        if (Platform.OS === 'web') {
          const blob = new Blob([JSON.stringify(data.backup, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `backup_student_${deleteTarget.full_name}_${new Date().toISOString().split('T')[0]}.json`;
          a.click();
          URL.revokeObjectURL(url);
        }
        
        showMessage('نجاح', `تم حذف "${deleteTarget.full_name}" وتنزيل النسخة الاحتياطية`);
        setShowSafeDeleteModal(false);
        setDeleteTarget(null);
        fetchData();
      } else {
        showMessage('خطأ', data.detail || 'فشل في حذف الطالب');
      }
    } catch (error) {
      showMessage('خطأ', 'فشل في حذف الطالب');
    } finally {
      setDeletingStudent(false);
    }
  };

  const handleRestoreStudent = async () => {
    if (Platform.OS !== 'web') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      
      setRestoringStudent(true);
      try {
        const text = await file.text();
        const backupData = JSON.parse(text);
        
        if (backupData.backup_type !== 'student_backup') {
          showMessage('خطأ', 'ملف النسخة الاحتياطية غير صالح - يجب أن يكون نسخة طالب');
          setRestoringStudent(false);
          return;
        }
        
        const studentName = backupData.student?.full_name || 'غير معروف';
        const enrollmentsCount = backupData.enrollments?.length || 0;
        const attendanceCount = backupData.attendance?.length || 0;
        
        if (!confirm(`استعادة الطالب "${studentName}"?\n- ${enrollmentsCount} تسجيل\n- ${attendanceCount} سجل حضور`)) {
          setRestoringStudent(false);
          return;
        }
        
        const token = await AsyncStorage.getItem('token');
        const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
        const res = await fetch(`${API_URL}/api/students/restore`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(backupData),
        });
        const data = await res.json();
        
        if (res.ok) {
          showMessage('نجاح', `تم استعادة "${studentName}" بنجاح`);
          fetchData();
        } else {
          showMessage('خطأ', data.detail || 'فشل في الاستعادة');
        }
      } catch (error) {
        showMessage('خطأ', 'فشل في قراءة الملف');
      } finally {
        setRestoringStudent(false);
      }
    };
    
    input.click();
  };

  // فتح نموذج الإنذار اليدوي
  const handleOpenWarningModal = (student: Student) => {
    setWarningStudent(student);
    setWarningData({
      title: `⚠️ إنذار للطالب ${student.full_name}`,
      message: '',
      type: 'warning',
    });
    setShowWarningModal(true);
  };

  // إرسال الإنذار اليدوي
  const handleSendWarning = async () => {
    if (!warningStudent || !warningData.message.trim()) {
      showMessage('خطأ', 'يرجى كتابة نص الإنذار');
      return;
    }

    setSendingWarning(true);
    try {
      await notificationsAPI.sendManual({
        student_id: warningStudent.id,
        title: warningData.title,
        message: warningData.message,
        type: warningData.type,
      });
      showMessage('تم', `تم إرسال الإنذار للطالب ${warningStudent.full_name}`);
      setShowWarningModal(false);
      setWarningStudent(null);
      setWarningData({ title: '', message: '', type: 'warning' });
    } catch (error: any) {
      const msg = error.response?.data?.detail || 'فشل في إرسال الإنذار';
      showMessage('خطأ', msg);
    } finally {
      setSendingWarning(false);
    }
  };

  // عرض تفاصيل الطالب
  const handleViewDetails = async (student: Student) => {
    setSelectedStudent(student);
    setShowDetailsModal(true);
    setLoadingAttendance(true);
    
    try {
      const response = await attendanceAPI.getStudentAttendance(student.id);
      setStudentAttendance(response.data || []);
    } catch (error) {
      console.error('Error fetching attendance:', error);
      setStudentAttendance([]);
    } finally {
      setLoadingAttendance(false);
    }
  };

  // فتح نموذج التعديل
  const handleEdit = (student: Student) => {
    setEditingStudent(student);
    setEditFormData({
      full_name: student.full_name,
      phone: student.phone || '',
      email: student.email || '',
      level: student.level || '1',
      section: student.section || '',
    });
    setShowEditModal(true);
  };

  // حفظ التعديل
  const handleSaveEdit = async () => {
    if (!editingStudent) return;
    
    if (!editFormData.full_name.trim()) {
      showMessage('خطأ', 'يرجى إدخال اسم الطالب');
      return;
    }
    
    setSaving(true);
    try {
      await studentsAPI.update(editingStudent.id, editFormData);
      showMessage('تم', 'تم تحديث بيانات الطالب');
      setShowEditModal(false);
      setEditingStudent(null);
      fetchData();
    } catch (error: any) {
      const errorMsg = error.response?.data?.detail || 'فشل في تحديث البيانات';
      showMessage('خطأ', errorMsg);
    } finally {
      setSaving(false);
    }
  };

  // تفعيل حساب الطالب
  const handleActivateAccount = async (student: Student) => {
    showConfirm('تفعيل حساب الطالب', `هل تريد تفعيل حساب ${student.full_name}؟`, async () => {
      try {
        const response = await studentsAPI.activateAccount(student.id);
        showMessage('تم التفعيل بنجاح ✅', `اسم المستخدم: ${response.data.username}\nكلمة المرور: ${student.student_id}`);
        fetchData();
      } catch (error: any) {
        const errorMsg = error.response?.data?.detail || 'فشل في تفعيل الحساب';
        showMessage('خطأ', errorMsg);
      }
    }, 'تفعيل');
  };

  // إلغاء تفعيل حساب الطالب
  const handleDeactivateAccount = async (student: Student) => {
    showConfirm('إلغاء تفعيل الحساب', `هل أنت متأكد من إلغاء تفعيل حساب ${student.full_name}؟`, async () => {
      try {
        await studentsAPI.deactivateAccount(student.id);
        showMessage('تم', 'تم إلغاء تفعيل حساب الطالب');
        fetchData();
      } catch (error: any) {
        const errorMsg = error.response?.data?.detail || 'فشل في إلغاء التفعيل';
        showMessage('خطأ', errorMsg);
      }
    }, 'إلغاء التفعيل', true);
  };

  // تفعيل/إلغاء تفعيل المحددين
  const [bulkLoading, setBulkLoading] = useState(false);
  
  const handleBulkActivateSelected = () => {
    if (selectedIds.size === 0) return;
    const selectedStudents = students.filter(s => selectedIds.has(s.id));
    const inactive = selectedStudents.filter(s => !s.user_id);
    if (inactive.length === 0) {
      showMessage('تنبيه', 'جميع الطلاب المحددين لديهم حسابات مفعلة');
      return;
    }
    showConfirm('تفعيل الحسابات', `سيتم تفعيل ${inactive.length} حساب طالب.\nكلمة المرور = الرقم الجامعي.\n\nمتابعة؟`, async () => {
      setBulkLoading(true);
      try {
        let activated = 0;
        for (const s of inactive) {
          try {
            await studentsAPI.activateAccount(s.id);
            activated++;
          } catch {}
        }
        showMessage('تم التفعيل', `تم تفعيل ${activated} حساب`);
        setSelectedIds(new Set());
        setSelectionMode(false);
        fetchData();
      } catch (error: any) {
        showMessage('خطأ', 'فشل في التفعيل');
      } finally {
        setBulkLoading(false);
      }
    }, 'تفعيل');
  };

  const handleBulkDeactivateSelected = () => {
    if (selectedIds.size === 0) return;
    const selectedStudents = students.filter(s => selectedIds.has(s.id));
    const active = selectedStudents.filter(s => s.user_id);
    if (active.length === 0) {
      showMessage('تنبيه', 'لا يوجد حسابات مفعلة بين المحددين');
      return;
    }
    showConfirm('إلغاء تفعيل الحسابات', `سيتم إلغاء تفعيل ${active.length} حساب.\n\nمتأكد؟`, async () => {
      setBulkLoading(true);
      try {
        let deactivated = 0;
        for (const s of active) {
          try {
            await studentsAPI.deactivateAccount(s.id);
            deactivated++;
          } catch {}
        }
        showMessage('تم', `تم إلغاء تفعيل ${deactivated} حساب`);
        setSelectedIds(new Set());
        setSelectionMode(false);
        fetchData();
      } catch (error: any) {
        showMessage('خطأ', 'فشل في إلغاء التفعيل');
      } finally {
        setBulkLoading(false);
      }
    }, 'إلغاء التفعيل', true);
  };

  // إعادة تعيين كلمة المرور
  const handleResetPassword = (student: Student) => {
    showConfirm('إعادة تعيين كلمة المرور', `ستصبح كلمة المرور الجديدة: ${student.student_id}`, async () => {
      try {
        await studentsAPI.resetPassword(student.id);
        showMessage('تم ✅', `كلمة المرور الجديدة: ${student.student_id}`);
      } catch (error: any) {
        const errorMsg = error.response?.data?.detail || 'فشل في إعادة تعيين كلمة المرور';
        showMessage('خطأ', errorMsg);
      }
    });
  };

  const renderStudent = ({ item }: { item: Student }) => (
    <TouchableOpacity 
      style={[styles.itemCard, selectedIds.has(item.id) && styles.itemCardSelected]}
      onPress={() => selectionMode ? toggleSelect(item.id) : handleViewDetails(item)}
      onLongPress={() => {
        if (!selectionMode) {
          setSelectionMode(true);
          setSelectedIds(new Set([item.id]));
        }
      }}
      activeOpacity={0.7}
    >
      {selectionMode && (
        <TouchableOpacity style={styles.checkbox} onPress={() => toggleSelect(item.id)}>
          <Ionicons 
            name={selectedIds.has(item.id) ? "checkbox" : "square-outline"} 
            size={24} 
            color={selectedIds.has(item.id) ? "#1565c0" : "#999"} 
          />
        </TouchableOpacity>
      )}
      <View style={styles.itemInfo}>
        <Text style={styles.itemName}>{item.full_name}</Text>
        <Text style={styles.itemDetail}>{item.student_id}</Text>
        <Text style={styles.itemDetail}>
          {getDepartmentName(item.department_id)} | م{item.level} {item.section ? `| ${item.section}` : ''}
        </Text>
      </View>
      {!selectionMode && (
        <View style={styles.actionButtons}>
          {canManageStudents && (
            <TouchableOpacity
              style={[styles.accountBtn, item.user_id ? styles.accountBtnActive : styles.accountBtnInactive]}
              onPress={() => item.user_id ? handleDeactivateAccount(item) : handleActivateAccount(item)}
            >
              <Ionicons name={item.user_id ? "person" : "person-outline"} size={18} color="#fff" />
            </TouchableOpacity>
          )}
          {item.user_id && canManageStudents && (
            <TouchableOpacity
              style={styles.keyBtn}
              onPress={() => handleResetPassword(item)}
            >
              <Ionicons name="key" size={18} color="#ff9800" />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.viewBtn} onPress={() => handleViewDetails(item)} title="عرض التفاصيل">
            <Ionicons name="eye" size={20} color="#1565c0" />
          </TouchableOpacity>
          {canManageStudents && (
            <>
              <TouchableOpacity 
                style={styles.warningBtn} 
                onPress={() => handleOpenWarningModal(item)}
                title="إنذار"
              >
                <Ionicons name="warning" size={20} color="#f57c00" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.editBtn} onPress={() => handleEdit(item)} title="تعديل">
                <Ionicons name="pencil" size={20} color="#4caf50" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item.id, item.full_name)} title="حذف">
                <Ionicons name="trash" size={20} color="#f44336" />
              </TouchableOpacity>
            </>
          )}
        </View>
      )}
    </TouchableOpacity>
  );

  if (authLoading || loading) {
    return <LoadingScreen />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-forward" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>الطلاب</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.content}>
        {/* زر استعادة */}
        {canManageStudents && Platform.OS === 'web' && (
          <TouchableOpacity
            style={{ flexDirection: 'row', backgroundColor: '#1565c0', marginHorizontal: 16, marginTop: 12, marginBottom: 4, padding: 12, borderRadius: 10, justifyContent: 'center', alignItems: 'center' }}
            onPress={handleRestoreStudent}
            disabled={restoringStudent}
            data-testid="restore-student-btn"
          >
            <Ionicons name="cloud-upload" size={20} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600', marginLeft: 8 }}>
              {restoringStudent ? 'جاري الاستعادة...' : 'استعادة طالب من نسخة احتياطية'}
            </Text>
          </TouchableOpacity>
        )}

        {/* شريط البحث */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#999" />
          <TextInput
            style={styles.searchInput}
            placeholder="بحث بالاسم أو رقم الطالب..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor="#999"
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color="#999" />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* الفلاتر */}
        <View style={styles.filtersRow}>
          <View style={styles.filterItem}>
            <Text style={styles.filterLabel}>القسم</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={selectedDeptFilter}
                onValueChange={setSelectedDeptFilter}
                style={styles.picker}
              >
                <Picker.Item label="الكل" value="" />
                {departments.map(dept => (
                  <Picker.Item key={dept.id} label={dept.name} value={dept.id} />
                ))}
              </Picker>
            </View>
          </View>
          
          <View style={styles.filterItem}>
            <Text style={styles.filterLabel}>المستوى</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={selectedLevelFilter}
                onValueChange={setSelectedLevelFilter}
                style={styles.picker}
              >
                <Picker.Item label="الكل" value="" />
                {LEVELS.map(level => (
                  <Picker.Item key={level} label={`م${level}`} value={level} />
                ))}
              </Picker>
            </View>
          </View>
          
          <View style={styles.filterItem}>
            <Text style={styles.filterLabel}>الشعبة</Text>
            <TextInput
              style={styles.sectionInput}
              placeholder="الكل"
              value={selectedSectionFilter}
              onChangeText={setSelectedSectionFilter}
              placeholderTextColor="#999"
            />
          </View>
        </View>

        {/* شريط التحديد */}
        {selectionMode && (
          <View style={styles.selectionBar}>
            <TouchableOpacity style={styles.selectAllBtn} onPress={selectAll}>
              <Ionicons 
                name={selectedIds.size === filteredStudents.length ? "checkbox" : "square-outline"} 
                size={20} 
                color="#1565c0" 
              />
              <Text style={styles.selectAllText}>تحديد الكل</Text>
            </TouchableOpacity>
            <Text style={styles.selectedCount}>{selectedIds.size} محدد</Text>
            <TouchableOpacity 
              style={styles.cancelSelectionBtn} 
              onPress={() => { setSelectionMode(false); setSelectedIds(new Set()); }}
            >
              <Text style={styles.cancelSelectionText}>إلغاء</Text>
            </TouchableOpacity>
            {selectedIds.size > 0 && (
              <>
                <TouchableOpacity 
                  style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#4caf50', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, gap: 4, opacity: bulkLoading ? 0.6 : 1 }}
                  onPress={handleBulkActivateSelected}
                  disabled={bulkLoading}
                >
                  {bulkLoading ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="person-add" size={18} color="#fff" />}
                  <Text style={{ color: '#fff', fontWeight: '600', fontSize: 12 }}>تفعيل</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#ff9800', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, gap: 4, opacity: bulkLoading ? 0.6 : 1 }}
                  onPress={handleBulkDeactivateSelected}
                  disabled={bulkLoading}
                >
                  {bulkLoading ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="person-remove" size={18} color="#fff" />}
                  <Text style={{ color: '#fff', fontWeight: '600', fontSize: 12 }}>إلغاء تفعيل</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#9c27b0', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, gap: 4 }}
                  onPress={() => setShowLevelModal(true)}
                  data-testid="bulk-change-level-btn"
                >
                  <Ionicons name="trending-up" size={18} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '600', fontSize: 12 }}>تغيير المستوى</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.bulkDeleteBtn} 
                  onPress={handleBulkDelete}
                  disabled={deleting}
                >
                  {deleting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="trash" size={18} color="#fff" />
                      <Text style={styles.bulkDeleteText}>حذف</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* عدد الطلاب + زر التحديد */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 }}>
          <Text style={styles.countText}>عدد الطلاب: {filteredStudents.length} من {students.length}</Text>
          {canManageStudents && !selectionMode && (
            <TouchableOpacity 
              style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#e3f2fd', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}
              onPress={() => setSelectionMode(true)}
              data-testid="enter-selection-mode-btn"
            >
              <Ionicons name="checkbox-outline" size={18} color="#1565c0" />
              <Text style={{ color: '#1565c0', marginLeft: 6, fontWeight: '600', fontSize: 13 }}>تحديد</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* قائمة الطلاب */}
        <FlatList
          data={filteredStudents}
          renderItem={renderStudent}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={64} color="#ccc" />
              <Text style={styles.emptyText}>لا يوجد طلاب</Text>
              <Text style={styles.emptySubtext}>يمكنك إضافة الطلاب من صفحة إدارة المقرر</Text>
            </View>
          }
        />
      </View>

      {/* نافذة تفاصيل الطالب */}
      <Modal
        visible={showDetailsModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowDetailsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>تفاصيل الطالب</Text>
              <TouchableOpacity onPress={() => setShowDetailsModal(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            
            {selectedStudent && (
              <ScrollView style={styles.modalBody}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>الاسم:</Text>
                  <Text style={styles.detailValue}>{selectedStudent.full_name}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>رقم الطالب:</Text>
                  <Text style={styles.detailValue}>{selectedStudent.student_id}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>القسم:</Text>
                  <Text style={styles.detailValue}>{getDepartmentName(selectedStudent.department_id)}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>المستوى:</Text>
                  <Text style={styles.detailValue}>م{selectedStudent.level}</Text>
                </View>
                {selectedStudent.section && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>الشعبة:</Text>
                    <Text style={styles.detailValue}>{selectedStudent.section}</Text>
                  </View>
                )}
                {selectedStudent.phone && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>الهاتف:</Text>
                    <Text style={styles.detailValue}>{selectedStudent.phone}</Text>
                  </View>
                )}
                {selectedStudent.email && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>البريد:</Text>
                    <Text style={styles.detailValue}>{selectedStudent.email}</Text>
                  </View>
                )}
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>حالة الحساب:</Text>
                  <Text style={[styles.detailValue, { color: selectedStudent.user_id ? '#4caf50' : '#999' }]}>
                    {selectedStudent.user_id ? 'مفعّل' : 'غير مفعّل'}
                  </Text>
                </View>

                {/* سجل الحضور */}
                <Text style={styles.sectionTitle}>سجل الحضور</Text>
                {loadingAttendance ? (
                  <ActivityIndicator size="small" color="#1565c0" />
                ) : studentAttendance.length > 0 ? (
                  studentAttendance.slice(0, 10).map((record, index) => (
                    <View key={index} style={styles.attendanceRow}>
                      <Text style={styles.attendanceDate}>{formatGregorianDate(new Date(record.date), { includeYear: false })}</Text>
                      <Text style={[styles.attendanceStatus, { color: record.status === 'present' ? '#4caf50' : '#f44336' }]}>
                        {record.status === 'present' ? 'حاضر' : 'غائب'}
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.noAttendance}>لا يوجد سجل حضور</Text>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* نافذة تعديل الطالب */}
      <Modal
        visible={showEditModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowEditModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>تعديل بيانات الطالب</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalBody}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>اسم الطالب *</Text>
                <TextInput
                  style={styles.input}
                  value={editFormData.full_name}
                  onChangeText={(text) => setEditFormData(prev => ({ ...prev, full_name: text }))}
                  placeholder="اسم الطالب"
                  placeholderTextColor="#999"
                />
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>المستوى</Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={editFormData.level}
                    onValueChange={(value) => setEditFormData(prev => ({ ...prev, level: value }))}
                    style={styles.picker}
                  >
                    {LEVELS.map(level => (
                      <Picker.Item key={level} label={`م${level}`} value={level} />
                    ))}
                  </Picker>
                </View>
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>الشعبة</Text>
                <TextInput
                  style={styles.input}
                  value={editFormData.section}
                  onChangeText={(text) => setEditFormData(prev => ({ ...prev, section: text }))}
                  placeholder="الشعبة (اختياري)"
                  placeholderTextColor="#999"
                />
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>الهاتف</Text>
                <TextInput
                  style={styles.input}
                  value={editFormData.phone}
                  onChangeText={(text) => setEditFormData(prev => ({ ...prev, phone: text }))}
                  placeholder="رقم الهاتف (اختياري)"
                  placeholderTextColor="#999"
                  keyboardType="phone-pad"
                />
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>البريد الإلكتروني</Text>
                <TextInput
                  style={styles.input}
                  value={editFormData.email}
                  onChangeText={(text) => setEditFormData(prev => ({ ...prev, email: text }))}
                  placeholder="البريد الإلكتروني (اختياري)"
                  placeholderTextColor="#999"
                  keyboardType="email-address"
                />
              </View>
              
              <TouchableOpacity
                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                onPress={handleSaveEdit}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.saveBtnText}>حفظ التغييرات</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* نافذة إرسال إنذار يدوي */}
      <Modal
        visible={showWarningModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowWarningModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>إرسال إنذار</Text>
              <TouchableOpacity onPress={() => setShowWarningModal(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalBody}>
              {warningStudent && (
                <View style={styles.warningStudentInfo}>
                  <Ionicons name="person-circle" size={48} color="#f57c00" />
                  <Text style={styles.warningStudentName}>{warningStudent.full_name}</Text>
                  <Text style={styles.warningStudentId}>{warningStudent.student_id}</Text>
                </View>
              )}

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>نوع الإنذار</Text>
                <View style={styles.warningTypeContainer}>
                  <TouchableOpacity
                    style={[
                      styles.warningTypeBtn,
                      warningData.type === 'warning' && styles.warningTypeBtnActive
                    ]}
                    onPress={() => setWarningData(prev => ({ ...prev, type: 'warning' }))}
                  >
                    <Ionicons name="warning" size={20} color={warningData.type === 'warning' ? '#fff' : '#f57c00'} />
                    <Text style={[
                      styles.warningTypeText,
                      warningData.type === 'warning' && styles.warningTypeTextActive
                    ]}>إنذار</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.warningTypeBtn,
                      warningData.type === 'reminder' && styles.warningTypeBtnActiveBlue
                    ]}
                    onPress={() => setWarningData(prev => ({ ...prev, type: 'reminder' }))}
                  >
                    <Ionicons name="notifications" size={20} color={warningData.type === 'reminder' ? '#fff' : '#1976d2'} />
                    <Text style={[
                      styles.warningTypeText,
                      warningData.type === 'reminder' && styles.warningTypeTextActive
                    ]}>تذكير</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>عنوان الإنذار *</Text>
                <TextInput
                  style={styles.input}
                  value={warningData.title}
                  onChangeText={(text) => setWarningData(prev => ({ ...prev, title: text }))}
                  placeholder="عنوان الإنذار"
                  placeholderTextColor="#999"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>نص الإنذار *</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={warningData.message}
                  onChangeText={(text) => setWarningData(prev => ({ ...prev, message: text }))}
                  placeholder="اكتب نص الإنذار هنا..."
                  placeholderTextColor="#999"
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
              </View>

              <TouchableOpacity
                style={[styles.sendWarningBtn, sendingWarning && styles.saveBtnDisabled]}
                onPress={handleSendWarning}
                disabled={sendingWarning}
              >
                {sendingWarning ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="send" size={20} color="#fff" />
                    <Text style={styles.sendWarningBtnText}>إرسال الإنذار</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
      
      {/* نافذة تغيير المستوى */}
      <Modal visible={showLevelModal} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, width: '85%', maxWidth: 380 }}>
            <Ionicons name="school" size={36} color="#9c27b0" style={{ alignSelf: 'center', marginBottom: 10 }} />
            <Text style={{ fontSize: 17, fontWeight: '700', color: '#333', textAlign: 'center', marginBottom: 4 }}>
              تغيير المستوى
            </Text>
            <Text style={{ fontSize: 13, color: '#888', textAlign: 'center', marginBottom: 16 }}>
              {selectedIds.size} طالب محدد - اختر المستوى الجديد
            </Text>
            
            {changingLevel ? (
              <ActivityIndicator size="large" color="#9c27b0" style={{ marginVertical: 30 }} />
            ) : (
              <View style={{ gap: 8 }}>
                {[1, 2, 3, 4, 5, 6, 7, 8].map(level => (
                  <TouchableOpacity
                    key={level}
                    style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3e5f5', padding: 14, borderRadius: 10, gap: 10 }}
                    onPress={() => handleBulkChangeLevel(level)}
                    data-testid={`select-level-${level}`}
                  >
                    <Ionicons name="trending-up" size={20} color="#9c27b0" />
                    <Text style={{ fontSize: 15, fontWeight: '600', color: '#6a1b9a' }}>المستوى {level}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            
            <TouchableOpacity
              style={{ backgroundColor: '#f5f5f5', padding: 12, borderRadius: 10, alignItems: 'center', marginTop: 12 }}
              onPress={() => setShowLevelModal(false)}
            >
              <Text style={{ color: '#666', fontWeight: '600' }}>إلغاء</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* نافذة الحذف الآمن للطالب */}
      <Modal visible={showSafeDeleteModal} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '90%', maxWidth: 420 }}>
            <Ionicons name="warning" size={40} color="#f44336" style={{ alignSelf: 'center', marginBottom: 12 }} />
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#333', textAlign: 'center', marginBottom: 8 }}>
              حذف الطالب
            </Text>
            <Text style={{ fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 16 }}>
              "{deleteTarget?.full_name || ''}"
            </Text>
            
            {deleteInfo && !deleteInfo.error ? (
              <View style={{ backgroundColor: '#fff3e0', padding: 14, borderRadius: 10, marginBottom: 16 }}>
                <Text style={{ fontSize: 13, color: '#e65100', fontWeight: '600', marginBottom: 8, textAlign: 'center' }}>
                  سيتم حذف التالي نهائياً:
                </Text>
                <Text style={{ fontSize: 13, color: '#555', lineHeight: 24 }}>
                  {`• ${deleteInfo.courses_count} مقرر مسجل${deleteInfo.courses_names?.length ? ` (${deleteInfo.courses_names.join('، ')})` : ''}\n• ${deleteInfo.attendance_count} سجل حضور${deleteInfo.has_user_account ? '\n• حساب المستخدم سيتم حذفه' : ''}`}
                </Text>
              </View>
            ) : deleteInfo?.error ? (
              <Text style={{ color: '#f44336', textAlign: 'center', marginBottom: 12 }}>فشل في جلب المعلومات</Text>
            ) : (
              <ActivityIndicator size="small" color="#1565c0" style={{ marginBottom: 16 }} />
            )}
            
            <View style={{ backgroundColor: '#e8f5e9', padding: 12, borderRadius: 8, marginBottom: 16 }}>
              <Text style={{ fontSize: 12, color: '#2e7d32', textAlign: 'center' }}>
                سيتم تنزيل نسخة احتياطية (JSON) تلقائياً قبل الحذف
              </Text>
            </View>
            
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: '#f5f5f5', padding: 14, borderRadius: 10, alignItems: 'center' }}
                onPress={() => { setShowSafeDeleteModal(false); setDeleteTarget(null); }}
                data-testid="cancel-delete-student-btn"
              >
                <Text style={{ color: '#666', fontWeight: '600' }}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: '#f44336', padding: 14, borderRadius: 10, alignItems: 'center', opacity: (deletingStudent || !deleteInfo || deleteInfo.error) ? 0.6 : 1 }}
                onPress={confirmSafeDeleteStudent}
                disabled={deletingStudent || !deleteInfo || deleteInfo.error}
                data-testid="confirm-delete-student-btn"
              >
                {deletingStudent ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={{ color: '#fff', fontWeight: '700' }}>حذف نهائي</Text>
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
    backgroundColor: '#1565c0',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    padding: 8,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    fontSize: 16,
    textAlign: 'right',
  },
  filtersRow: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 8,
  },
  filterItem: {
    flex: 1,
  },
  filterLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
    textAlign: 'right',
  },
  pickerContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    overflow: 'hidden',
  },
  picker: {
    height: 45,
  },
  sectionInput: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    paddingHorizontal: 12,
    paddingVertical: 12,
    textAlign: 'right',
  },
  selectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e3f2fd',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    gap: 12,
  },
  selectAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  selectAllText: {
    color: '#1565c0',
    fontSize: 14,
  },
  selectedCount: {
    flex: 1,
    textAlign: 'center',
    color: '#333',
  },
  cancelSelectionBtn: {
    padding: 8,
  },
  cancelSelectionText: {
    color: '#666',
  },
  bulkDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f44336',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    gap: 4,
  },
  bulkDeleteText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  countContainer: {
    backgroundColor: '#e3f2fd',
    padding: 8,
    borderRadius: 6,
    marginBottom: 12,
  },
  countText: {
    color: '#1565c0',
    textAlign: 'center',
    fontWeight: '500',
  },
  listContainer: {
    paddingBottom: 20,
  },
  itemCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  itemCardSelected: {
    borderColor: '#1565c0',
    backgroundColor: '#e3f2fd',
  },
  checkbox: {
    marginLeft: 8,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    textAlign: 'right',
  },
  itemDetail: {
    fontSize: 12,
    color: '#666',
    textAlign: 'right',
    marginTop: 2,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  accountBtn: {
    padding: 8,
    borderRadius: 6,
  },
  accountBtnActive: {
    backgroundColor: '#4caf50',
  },
  accountBtnInactive: {
    backgroundColor: '#9e9e9e',
  },
  keyBtn: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: '#fff3e0',
  },
  viewBtn: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: '#e3f2fd',
  },
  editBtn: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: '#e8f5e9',
  },
  deleteBtn: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: '#ffebee',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    width: '90%',
    maxWidth: 500,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  modalBody: {
    padding: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  detailLabel: {
    color: '#666',
    fontSize: 14,
  },
  detailValue: {
    color: '#333',
    fontSize: 14,
    fontWeight: '500',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 20,
    marginBottom: 12,
    textAlign: 'right',
  },
  attendanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  attendanceDate: {
    color: '#666',
    fontSize: 14,
  },
  attendanceStatus: {
    fontSize: 14,
    fontWeight: '500',
  },
  noAttendance: {
    color: '#999',
    textAlign: 'center',
    paddingVertical: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    color: '#333',
    marginBottom: 6,
    textAlign: 'right',
  },
  input: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    textAlign: 'right',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  saveBtn: {
    backgroundColor: '#1565c0',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnDisabled: {
    backgroundColor: '#90caf9',
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // styles for warning button and modal
  warningBtn: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: '#fff3e0',
  },
  warningStudentInfo: {
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    marginBottom: 16,
  },
  warningStudentName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 8,
  },
  warningStudentId: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  warningTypeContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  warningTypeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#f57c00',
    gap: 8,
  },
  warningTypeBtnActive: {
    backgroundColor: '#f57c00',
    borderColor: '#f57c00',
  },
  warningTypeBtnActiveBlue: {
    backgroundColor: '#1976d2',
    borderColor: '#1976d2',
  },
  warningTypeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  warningTypeTextActive: {
    color: '#fff',
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  sendWarningBtn: {
    backgroundColor: '#f57c00',
    padding: 14,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    gap: 8,
  },
  sendWarningBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
