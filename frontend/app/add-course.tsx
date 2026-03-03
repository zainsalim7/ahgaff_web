import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Picker } from '@react-native-picker/picker';
import { departmentsAPI, coursesAPI, teachersAPI, settingsAPI } from '../src/services/api';
import { Course, Department } from '../src/types';
import { LoadingScreen } from '../src/components/LoadingScreen';

interface Teacher {
  id: string;
  teacher_id: string;
  full_name: string;
  department_id?: string;
}

const LEVELS = ['1', '2', '3', '4', '5'];

// دالة التحقق من الصلاحيات
const checkPermission = (userRole: string, userPermissions: string[], permission: string): boolean => {
  if (userRole === 'admin') return true;
  return userPermissions?.includes(permission) || false;
};

export default function AddCourseScreen() {
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  
  // Search and filter
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterDept, setFilterDept] = useState<string>('');
  const [filterLevel, setFilterLevel] = useState<string>('');
  
  // Multi-select for bulk delete
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  // حذف آمن
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteInfo, setDeleteInfo] = useState<any>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingCourse, setDeletingCourse] = useState(false);
  
  // استعادة
  const [restoring, setRestoring] = useState(false);

  // صلاحيات المستخدم
  const [userRole, setUserRole] = useState<string>('');
  const [userPermissions, setUserPermissions] = useState<string[]>([]);
  const canEdit = checkPermission(userRole, userPermissions, 'manage_courses');
  const canDelete = checkPermission(userRole, userPermissions, 'manage_courses');

  // تحميل صلاحيات المستخدم
  useEffect(() => {
    const loadUserPermissions = async () => {
      try {
        const storedUser = await AsyncStorage.getItem('user');
        if (storedUser) {
          const user = JSON.parse(storedUser);
          setUserRole(user.role || '');
          setUserPermissions(user.permissions || []);
        }
      } catch (error) {
        console.error('Error loading user permissions:', error);
      }
    };
    loadUserPermissions();
  }, []);

  const [formData, setFormData] = useState({
    name: '',
    code: '',
    department_id: '',
    teacher_id: '',
    level: '1',
    section: '',
  });

  const fetchData = useCallback(async () => {
    try {
      const [coursesRes, deptsRes, teachersRes, settingsRes] = await Promise.all([
        coursesAPI.getAll(),
        departmentsAPI.getAll(),
        teachersAPI.getAll(),
        settingsAPI.get(),
      ]);
      setCourses(coursesRes.data);
      setDepartments(deptsRes.data);
      setTeachers(teachersRes.data);
      setSettings(settingsRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSubmit = async () => {
    if (!formData.name || !formData.code || !formData.department_id || !formData.teacher_id) {
      Alert.alert('خطأ', 'الرجاء ملء جميع الحقول المطلوبة');
      return;
    }

    setSaving(true);
    try {
      // إضافة الفصل والسنة الدراسية تلقائياً من الإعدادات
      const courseData = {
        ...formData,
        level: parseInt(formData.level),
        semester_id: settings?.current_semester_id || null,
        academic_year: settings?.academic_year || '',
      };

      if (editingCourse) {
        await coursesAPI.update(editingCourse.id, courseData);
        Alert.alert('نجاح', 'تم تحديث المقرر بنجاح');
      } else {
        await coursesAPI.create(courseData);
        Alert.alert('نجاح', 'تم إضافة المقرر بنجاح');
      }
      resetForm();
      setShowForm(false);
      setEditingCourse(null);
      fetchData();
    } catch (error: any) {
      const message = error.response?.data?.detail || 'حدث خطأ';
      Alert.alert('خطأ', message);
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      code: '',
      department_id: '',
      teacher_id: '',
      level: '1',
      section: '',
    });
  };

  // Toggle selection mode
  const toggleSelectionMode = () => {
    if (selectionMode) {
      setSelectedIds(new Set());
    }
    setSelectionMode(!selectionMode);
  };

  // Toggle single item selection
  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  // Select all visible items
  const selectAll = () => {
    const visibleIds = courses
      .filter(c => {
        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          if (!c.name?.toLowerCase().includes(query) && !c.code?.toLowerCase().includes(query)) {
            return false;
          }
        }
        if (filterDept && c.department_id !== filterDept) return false;
        return true;
      })
      .map(c => c.id);
    setSelectedIds(new Set(visibleIds));
  };

  // Bulk delete
  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    
    Alert.alert(
      'حذف متعدد',
      `هل أنت متأكد من حذف ${selectedIds.size} مقرر؟`,
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'حذف',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              const deletePromises = Array.from(selectedIds).map(id => 
                coursesAPI.delete(id)
              );
              await Promise.all(deletePromises);
              Alert.alert('نجاح', `تم حذف ${selectedIds.size} مقرر`);
              setSelectedIds(new Set());
              setSelectionMode(false);
              fetchData();
            } catch (error) {
              Alert.alert('خطأ', 'فشل في حذف بعض المقررات');
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  const handleEdit = (course: Course) => {
    setEditingCourse(course);
    setFormData({
      name: course.name,
      code: course.code,
      department_id: course.department_id,
      teacher_id: course.teacher_id || '',
      level: String(course.level),
      section: course.section || '',
    });
    setShowForm(true);
  };

  const handleDelete = async (courseId: string, courseName: string) => {
    setDeleteTarget({ id: courseId, name: courseName });
    setDeleteInfo(null);
    setShowDeleteModal(true);
    
    try {
      const token = await AsyncStorage.getItem('token');
      const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
      const res = await fetch(`${API_URL}/api/courses/${courseId}/backup-info`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      setDeleteInfo(data);
    } catch (error) {
      setDeleteInfo({ error: true });
    }
  };

  const confirmSafeDelete = async () => {
    if (!deleteTarget) return;
    setDeletingCourse(true);
    
    try {
      const token = await AsyncStorage.getItem('token');
      const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
      const res = await fetch(`${API_URL}/api/courses/${deleteTarget.id}/safe-delete`, {
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
          a.download = `backup_${deleteTarget.name}_${new Date().toISOString().split('T')[0]}.json`;
          a.click();
          URL.revokeObjectURL(url);
        }
        
        Alert.alert('نجاح', `تم حذف "${deleteTarget.name}" وتنزيل النسخة الاحتياطية`);
        setShowDeleteModal(false);
        setDeleteTarget(null);
        fetchData();
      } else {
        Alert.alert('خطأ', data.detail || 'فشل في حذف المقرر');
      }
    } catch (error) {
      Alert.alert('خطأ', 'فشل في حذف المقرر');
    } finally {
      setDeletingCourse(false);
    }
  };

  const handleRestore = async () => {
    if (Platform.OS !== 'web') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      
      setRestoring(true);
      try {
        const text = await file.text();
        const backupData = JSON.parse(text);
        
        if (backupData.backup_type !== 'course_backup') {
          Alert.alert('خطأ', 'ملف النسخة الاحتياطية غير صالح');
          setRestoring(false);
          return;
        }
        
        const courseName = backupData.course?.name || 'غير معروف';
        const studentsCount = backupData.students?.length || 0;
        const lecturesCount = backupData.lectures?.length || 0;
        
        if (!confirm(`استعادة المقرر "${courseName}"?\n- ${studentsCount} طالب\n- ${lecturesCount} محاضرة`)) {
          setRestoring(false);
          return;
        }
        
        const token = await AsyncStorage.getItem('token');
        const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
        const res = await fetch(`${API_URL}/api/courses/restore`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(backupData),
        });
        const data = await res.json();
        
        if (res.ok) {
          Alert.alert('نجاح', `تم استعادة "${courseName}" بنجاح`);
          fetchData();
        } else {
          Alert.alert('خطأ', data.detail || 'فشل في الاستعادة');
        }
      } catch (error) {
        Alert.alert('خطأ', 'فشل في قراءة الملف');
      } finally {
        setRestoring(false);
      }
    };
    
    input.click();
  };

  const getDepartmentName = (deptId: string) => {
    const dept = departments.find(d => d.id === deptId);
    return dept?.name || 'غير محدد';
  };

  const getTeacherName = (teacherId: string) => {
    const teacher = teachers.find(t => t.id === teacherId);
    return teacher?.full_name || 'غير محدد';
  };

  const renderCourse = ({ item }: { item: Course }) => (
    <TouchableOpacity 
      style={[styles.itemCard, selectedIds.has(item.id) && styles.itemCardSelected]}
      onPress={() => selectionMode ? toggleSelect(item.id) : router.push({ pathname: '/course-lectures', params: { courseId: item.id } })}
      onLongPress={() => {
        if (!selectionMode) {
          setSelectionMode(true);
          setSelectedIds(new Set([item.id]));
        }
      }}
      activeOpacity={0.7}
    >
      {selectionMode && (
        <TouchableOpacity 
          style={styles.checkbox}
          onPress={() => toggleSelect(item.id)}
        >
          <Ionicons 
            name={selectedIds.has(item.id) ? "checkbox" : "square-outline"} 
            size={24} 
            color={selectedIds.has(item.id) ? "#ff9800" : "#999"} 
          />
        </TouchableOpacity>
      )}
      <View style={styles.itemInfo}>
        <Text style={styles.itemName}>{item.name}</Text>
        <Text style={styles.itemDetail}>{item.code}</Text>
        <Text style={styles.itemDetail}>
          {getDepartmentName(item.department_id)} | م{item.level}{item.section ? ` | ${item.section}` : ''}
        </Text>
        <Text style={styles.itemDetail}>المعلم: {getTeacherName(item.teacher_id)}</Text>
      </View>
      {!selectionMode && (
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={styles.lecturesBtn}
            onPress={() => router.push({ pathname: '/course-lectures', params: { courseId: item.id } })}
          >
            <Ionicons name="calendar" size={20} color="#9c27b0" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.studentsBtn}
            onPress={() => router.push({ pathname: '/course-students', params: { courseId: item.id } })}
          >
            <Ionicons name="people" size={20} color="#1565c0" />
          </TouchableOpacity>
          {canEdit && (
            <TouchableOpacity
              style={styles.editBtn}
              onPress={() => handleEdit(item)}
            >
              <Ionicons name="create" size={20} color="#ff9800" />
            </TouchableOpacity>
          )}
          {canDelete && (
            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={() => handleDelete(item.id, item.name)}
            >
              <Ionicons name="trash" size={20} color="#f44336" />
            </TouchableOpacity>
          )}
        </View>
      )}
    </TouchableOpacity>
  );

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        {showForm ? (
          <ScrollView style={styles.formContainer}>
            <Text style={styles.formTitle}>
              {editingCourse ? 'تعديل المقرر' : 'إضافة مقرر جديد'}
            </Text>
            
            <Text style={styles.label}>اسم المقرر *</Text>
            <TextInput
              style={styles.input}
              value={formData.name}
              onChangeText={(text) => setFormData({ ...formData, name: text })}
              placeholder="أدخل اسم المقرر"
            />

            <Text style={styles.label}>رمز المقرر *</Text>
            <TextInput
              style={styles.input}
              value={formData.code}
              onChangeText={(text) => setFormData({ ...formData, code: text })}
              placeholder="مثال: CS101"
            />

            <Text style={styles.label}>القسم *</Text>
            <View style={styles.pickerWrapper}>
              <Picker
                selectedValue={formData.department_id}
                onValueChange={(value) => setFormData({ ...formData, department_id: value })}
                style={styles.picker}
              >
                <Picker.Item label="اختر القسم..." value="" />
                {departments.map(dept => (
                  <Picker.Item key={dept.id} label={dept.name} value={dept.id} />
                ))}
              </Picker>
            </View>

            <Text style={styles.label}>المعلم *</Text>
            <View style={styles.pickerWrapper}>
              <Picker
                selectedValue={formData.teacher_id}
                onValueChange={(value) => setFormData({ ...formData, teacher_id: value })}
                style={styles.picker}
              >
                <Picker.Item label="اختر المعلم..." value="" />
                {teachers.map(teacher => (
                  <Picker.Item key={teacher.id} label={teacher.full_name} value={teacher.id} />
                ))}
              </Picker>
            </View>

            <Text style={styles.label}>المستوى *</Text>
            <View style={styles.pickerWrapper}>
              <Picker
                selectedValue={formData.level}
                onValueChange={(value) => setFormData({ ...formData, level: value })}
                style={styles.picker}
              >
                {LEVELS.map(level => (
                  <Picker.Item key={level} label={`م${level}`} value={level} />
                ))}
              </Picker>
            </View>

            <Text style={styles.label}>الشعبة (اختياري)</Text>
            <TextInput
              style={styles.input}
              value={formData.section}
              onChangeText={(text) => setFormData({ ...formData, section: text })}
              placeholder="مثال: A أو B"
            />

            {/* عرض الفصل الحالي - للإشارة فقط */}
            {settings && (
              <View style={styles.semesterInfo}>
                <Ionicons name="calendar" size={18} color="#1565c0" />
                <Text style={styles.semesterInfoText}>
                  سيتم ربط المقرر بـ: {settings.current_semester} - {settings.academic_year}
                </Text>
              </View>
            )}

            <View style={styles.formButtons}>
              <TouchableOpacity
                style={[styles.btn, styles.cancelBtn]}
                onPress={() => {
                  setShowForm(false);
                  setEditingCourse(null);
                  resetForm();
                }}
              >
                <Text style={styles.cancelBtnText}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.saveBtn]}
                onPress={handleSubmit}
                disabled={saving}
              >
                <Text style={styles.saveBtnText}>
                  {saving ? 'جاري الحفظ...' : editingCourse ? 'تحديث' : 'حفظ'}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        ) : (
          <>
            {/* شريط الحذف المتعدد */}
            {selectionMode && (
              <View style={styles.bulkActionBar}>
                <View style={styles.bulkActionLeft}>
                  <TouchableOpacity onPress={toggleSelectionMode} style={styles.bulkActionClose}>
                    <Ionicons name="close" size={24} color="#333" />
                  </TouchableOpacity>
                  <Text style={styles.bulkActionText}>
                    تم تحديد {selectedIds.size} مقرر
                  </Text>
                </View>
                <View style={styles.bulkActionRight}>
                  <TouchableOpacity onPress={selectAll} style={styles.bulkActionBtn}>
                    <Ionicons name="checkbox-outline" size={20} color="#ff9800" />
                    <Text style={styles.bulkActionBtnText}>تحديد الكل</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    onPress={handleBulkDelete} 
                    style={[styles.bulkActionBtn, styles.bulkDeleteBtn]}
                    disabled={selectedIds.size === 0 || deleting}
                  >
                    {deleting ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Ionicons name="trash" size={20} color="#fff" />
                    )}
                    <Text style={styles.bulkDeleteBtnText}>حذف</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* أزرار الإجراءات */}
            <View style={styles.actionsRow}>
              {canEdit && (
                <TouchableOpacity
                  style={styles.addButton}
                  onPress={() => setShowForm(true)}
                >
                  <Ionicons name="add-circle" size={22} color="#fff" />
                  <Text style={styles.addButtonText}>إضافة مقرر</Text>
                </TouchableOpacity>
              )}
              
              {canDelete && (
                <TouchableOpacity
                  style={[styles.addButton, styles.selectButton]}
                  onPress={toggleSelectionMode}
                >
                  <Ionicons name={selectionMode ? "close" : "checkmark-circle"} size={22} color="#fff" />
                  <Text style={styles.addButtonText}>{selectionMode ? 'إلغاء' : 'تحديد'}</Text>
                </TouchableOpacity>
              )}
              
              {canEdit && Platform.OS === 'web' && (
                <TouchableOpacity
                  style={[styles.addButton, { backgroundColor: '#1565c0' }]}
                  onPress={handleRestore}
                  disabled={restoring}
                >
                  <Ionicons name="cloud-upload" size={22} color="#fff" />
                  <Text style={styles.addButtonText}>{restoring ? 'جاري...' : 'استعادة'}</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* حقل البحث */}
            <View style={styles.searchContainer}>
              <Ionicons name="search" size={20} color="#999" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="بحث بالاسم أو الرمز..."
                placeholderTextColor="#999"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={20} color="#999" />
                </TouchableOpacity>
              )}
            </View>

            {/* فلاتر */}
            <View style={styles.filterContainer}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <TouchableOpacity
                  style={[styles.filterBtn, !filterDept && styles.filterBtnActive]}
                  onPress={() => setFilterDept('')}
                >
                  <Text style={[styles.filterText, !filterDept && styles.filterTextActive]}>كل الأقسام</Text>
                </TouchableOpacity>
                {departments.map(dept => (
                  <TouchableOpacity
                    key={dept.id}
                    style={[styles.filterBtn, filterDept === dept.id && styles.filterBtnActive]}
                    onPress={() => setFilterDept(dept.id)}
                  >
                    <Text style={[styles.filterText, filterDept === dept.id && styles.filterTextActive]}>
                      {dept.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <FlatList
              data={courses.filter(c => {
                if (searchQuery) {
                  const query = searchQuery.toLowerCase();
                  if (!c.name?.toLowerCase().includes(query) && !c.code?.toLowerCase().includes(query)) {
                    return false;
                  }
                }
                if (filterDept && c.department_id !== filterDept) return false;
                return true;
              })}
              renderItem={renderCourse}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons name="book-outline" size={64} color="#ccc" />
                  <Text style={styles.emptyText}>
                    {searchQuery ? 'لا توجد نتائج للبحث' : 'لا توجد مقررات'}
                  </Text>
                </View>
              }
            />
          </>
        )}
      </KeyboardAvoidingView>
      
      {/* نافذة الحذف الآمن */}
      <Modal visible={showDeleteModal} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '90%', maxWidth: 420 }}>
            <Ionicons name="warning" size={40} color="#f44336" style={{ alignSelf: 'center', marginBottom: 12 }} />
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#333', textAlign: 'center', marginBottom: 8 }}>
              حذف المقرر
            </Text>
            <Text style={{ fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 16 }}>
              "{deleteTarget?.name}"
            </Text>
            
            {deleteInfo && !deleteInfo.error ? (
              <View style={{ backgroundColor: '#fff3e0', padding: 14, borderRadius: 10, marginBottom: 16 }}>
                <Text style={{ fontSize: 13, color: '#e65100', fontWeight: '600', marginBottom: 8, textAlign: 'center' }}>
                  سيتم حذف التالي نهائياً:
                </Text>
                <Text style={{ fontSize: 13, color: '#555', lineHeight: 24 }}>
                  {`• ${deleteInfo.enrollments_count} تسجيل طالب\n• ${deleteInfo.lectures_count} محاضرة\n• ${deleteInfo.attendance_count} سجل حضور`}
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
                onPress={() => { setShowDeleteModal(false); setDeleteTarget(null); }}
              >
                <Text style={{ color: '#666', fontWeight: '600' }}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: '#f44336', padding: 14, borderRadius: 10, alignItems: 'center' }}
                onPress={confirmSafeDelete}
                disabled={deletingCourse || !deleteInfo || deleteInfo.error}
              >
                {deletingCourse ? (
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
  addButton: {
    flexDirection: 'row',
    backgroundColor: '#ff9800',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    color: '#333',
  },
  filterContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  filterBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  filterBtnActive: {
    backgroundColor: '#ff9800',
    borderColor: '#ff9800',
  },
  filterText: {
    fontSize: 13,
    color: '#333',
  },
  filterTextActive: {
    color: '#fff',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  itemCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  itemDetail: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  deleteBtn: {
    padding: 8,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editBtn: {
    padding: 8,
    backgroundColor: '#fff3e0',
    borderRadius: 8,
  },
  studentsBtn: {
    padding: 8,
    backgroundColor: '#e3f2fd',
    borderRadius: 8,
  },
  lecturesBtn: {
    padding: 8,
    backgroundColor: '#f3e5f5',
    borderRadius: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
  },
  semesterInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e3f2fd',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  semesterInfoText: {
    flex: 1,
    fontSize: 13,
    color: '#1565c0',
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    marginTop: 16,
  },
  formContainer: {
    padding: 16,
  },
  formTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
    textAlign: 'center',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    textAlign: 'right',
  },
  pickerWrapper: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    overflow: 'hidden',
    marginBottom: 8,
  },
  picker: {
    height: 50,
  },
  optionsRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  optionBtn: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  optionBtnActive: {
    backgroundColor: '#1565c0',
    borderColor: '#1565c0',
  },
  optionText: {
    fontSize: 14,
    color: '#666',
  },
  optionTextActive: {
    color: '#fff',
  },
  formButtons: {
    flexDirection: 'row',
    marginTop: 24,
    marginBottom: 40,
  },
  btn: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelBtn: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginRight: 8,
  },
  cancelBtnText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  saveBtn: {
    backgroundColor: '#4caf50',
    marginLeft: 8,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Bulk action styles
  actionsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
  },
  selectButton: {
    backgroundColor: '#9c27b0',
    flex: 0,
    paddingHorizontal: 20,
    margin: 0,
  },
  bulkActionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff3e0',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#ffcc80',
  },
  bulkActionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bulkActionClose: {
    marginRight: 12,
  },
  bulkActionText: {
    fontSize: 15,
    color: '#333',
    fontWeight: '600',
  },
  bulkActionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bulkActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ff9800',
    gap: 4,
  },
  bulkActionBtnText: {
    fontSize: 13,
    color: '#ff9800',
    fontWeight: '600',
  },
  bulkDeleteBtn: {
    backgroundColor: '#f44336',
    borderColor: '#f44336',
  },
  bulkDeleteBtnText: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '600',
  },
  checkbox: {
    marginRight: 12,
    padding: 4,
  },
  itemCardSelected: {
    backgroundColor: '#fff8e1',
    borderWidth: 1,
    borderColor: '#ff9800',
  },
});
