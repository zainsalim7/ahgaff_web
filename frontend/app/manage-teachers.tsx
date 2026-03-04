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
  KeyboardAvoidingView,
  Platform,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Picker } from '@react-native-picker/picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { teachersAPI, departmentsAPI } from '../src/services/api';
import { LoadingScreen } from '../src/components/LoadingScreen';

interface Teacher {
  id: string;
  teacher_id?: string;
  name?: string;
  full_name?: string;
  username?: string;
  department_id?: string;
  department_ids?: string[];
  department_names?: string[];
  email?: string;
  phone?: string;
  specialization?: string;
  academic_title?: string;
  teaching_load?: number;
  weekly_hours?: number;
  courses_count?: number;
  user_id?: string;
  is_active: boolean;
}

interface Department {
  id: string;
  name: string;
}

export default function ManageTeachersScreen() {
  const router = useRouter();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [filterDepartment, setFilterDepartment] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  const [formData, setFormData] = useState({
    teacher_id: '',
    full_name: '',
    department_ids: [] as string[],
    email: '',
    phone: '',
    specialization: '',
    academic_title: '',
    teaching_load: '',
    weekly_hours: '12',
  });

  // حذف آمن
  const [deleteTarget, setDeleteTarget] = useState<Teacher | null>(null);
  const [deleteInfo, setDeleteInfo] = useState<any>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingTeacher, setDeletingTeacher] = useState(false);
  const [restoring, setRestoring] = useState(false);

  // Alert helpers for web compatibility
  const showMessage = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const showConfirm = (title: string, message: string, onConfirm: () => void, confirmText = 'تأكيد', destructive = false) => {
    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${message}`)) {
        onConfirm();
      }
    } else {
      Alert.alert(title, message, [
        { text: 'إلغاء', style: 'cancel' },
        { text: confirmText, style: destructive ? 'destructive' : 'default', onPress: onConfirm }
      ]);
    }
  };

  const fetchData = useCallback(async () => {
    try {
      const [teachersRes, deptsRes] = await Promise.all([
        teachersAPI.getAll(),
        departmentsAPI.getAll(),
      ]);
      setTeachers(teachersRes.data);
      setDepartments(deptsRes.data);
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
    if (!formData.teacher_id || !formData.full_name) {
      showMessage('خطأ', 'الرجاء ملء جميع الحقول المطلوبة');
      return;
    }

    setSaving(true);
    try {
      if (editingTeacher) {
        await teachersAPI.update(editingTeacher.id, {
          full_name: formData.full_name,
          department_ids: formData.department_ids.length > 0 ? formData.department_ids : undefined,
          email: formData.email || undefined,
          phone: formData.phone || undefined,
          specialization: formData.specialization || undefined,
          academic_title: formData.academic_title || undefined,
          teaching_load: formData.teaching_load ? parseInt(formData.teaching_load) : undefined,
          weekly_hours: formData.weekly_hours ? parseInt(formData.weekly_hours) : 12,
        });
        showMessage('نجاح', 'تم تحديث بيانات المعلم بنجاح');
      } else {
        await teachersAPI.create({
          ...formData,
          teaching_load: formData.teaching_load ? parseInt(formData.teaching_load) : undefined,
          weekly_hours: formData.weekly_hours ? parseInt(formData.weekly_hours) : 12,
        });
        showMessage('نجاح', 'تم إضافة المعلم بنجاح');
      }
      resetForm();
      setShowForm(false);
      setEditingTeacher(null);
      fetchData();
    } catch (error: any) {
      const message = error.response?.data?.detail || 'حدث خطأ';
      showMessage('خطأ', message);
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setFormData({
      teacher_id: '',
      full_name: '',
      department_ids: [] as string[],
      email: '',
      phone: '',
      specialization: '',
      academic_title: '',
      teaching_load: '',
      weekly_hours: '12',
    });
  };

  // دالة مساعدة للحصول على اسم المعلم
  const getTeacherName = (teacher: Teacher) => teacher.full_name || teacher.name || 'غير معروف';
  const getTeacherId = (teacher: Teacher) => teacher.teacher_id || teacher.username || '';

  const handleEdit = (teacher: Teacher) => {
    setEditingTeacher(teacher);
    setFormData({
      teacher_id: getTeacherId(teacher),
      full_name: getTeacherName(teacher),
      department_ids: teacher.department_ids || (teacher.department_id ? [teacher.department_id] : []) as string[],
      email: teacher.email || '',
      phone: teacher.phone || '',
      specialization: teacher.specialization || '',
      academic_title: teacher.academic_title || '',
      teaching_load: teacher.teaching_load ? teacher.teaching_load.toString() : '',
      weekly_hours: teacher.weekly_hours ? teacher.weekly_hours.toString() : '12',
    });
    setShowForm(true);
  };

  const handleDelete = async (teacher: Teacher) => {
    setDeleteTarget(teacher);
    setDeleteInfo(null);
    setShowDeleteModal(true);
    
    try {
      const token = await AsyncStorage.getItem('token');
      const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
      const res = await fetch(`${API_URL}/api/teachers/${teacher.id}/backup-info`, {
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
    setDeletingTeacher(true);
    
    try {
      const token = await AsyncStorage.getItem('token');
      const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
      const res = await fetch(`${API_URL}/api/teachers/${deleteTarget.id}/safe-delete`, {
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
          a.download = `backup_teacher_${getTeacherName(deleteTarget)}_${new Date().toISOString().split('T')[0]}.json`;
          a.click();
          URL.revokeObjectURL(url);
        }
        
        showMessage('نجاح', `تم حذف "${getTeacherName(deleteTarget)}" وتنزيل النسخة الاحتياطية`);
        setShowDeleteModal(false);
        setDeleteTarget(null);
        fetchData();
      } else {
        showMessage('خطأ', data.detail || 'فشل في حذف المعلم');
      }
    } catch (error) {
      showMessage('خطأ', 'فشل في حذف المعلم');
    } finally {
      setDeletingTeacher(false);
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
        
        if (backupData.backup_type !== 'teacher_backup') {
          showMessage('خطأ', 'ملف النسخة الاحتياطية غير صالح - يجب أن يكون نسخة معلم');
          setRestoring(false);
          return;
        }
        
        const teacherName = backupData.teacher?.full_name || 'غير معروف';
        const coursesCount = backupData.teaching_load?.length || 0;
        
        if (!confirm(`استعادة المعلم "${teacherName}"?\n- ${coursesCount} مقرر`)) {
          setRestoring(false);
          return;
        }
        
        const token = await AsyncStorage.getItem('token');
        const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
        const res = await fetch(`${API_URL}/api/teachers/restore`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(backupData),
        });
        const data = await res.json();
        
        if (res.ok) {
          showMessage('نجاح', `تم استعادة "${teacherName}" بنجاح`);
          fetchData();
        } else {
          showMessage('خطأ', data.detail || 'فشل في الاستعادة');
        }
      } catch (error) {
        showMessage('خطأ', 'فشل في قراءة الملف');
      } finally {
        setRestoring(false);
      }
    };
    
    input.click();
  };

  // تفعيل حساب المعلم
  const handleActivateAccount = (teacher: Teacher) => {
    const message = `هل تريد تفعيل حساب للمعلم ${getTeacherName(teacher)}؟\n\nبيانات الدخول:\n• اسم المستخدم: ${getTeacherId(teacher)}\n• كلمة المرور: ${getTeacherId(teacher)}\n\n⚠️ سيُطلب من المعلم تغيير كلمة المرور عند أول دخول`;
    
    showConfirm('تفعيل حساب', message, async () => {
      try {
        setSaving(true);
        const response = await teachersAPI.activateAccount(teacher.id);
        showMessage('تم التفعيل بنجاح ✅', `تم تفعيل حساب المعلم\n\nاسم المستخدم: ${response.data.username}\nكلمة المرور: ${getTeacherId(teacher)}`);
        fetchData();
      } catch (error: any) {
        const errorMsg = error.response?.data?.detail || 'فشل في تفعيل الحساب';
        showMessage('خطأ', errorMsg);
      } finally {
        setSaving(false);
      }
    }, 'تفعيل');
  };

  // إلغاء تفعيل حساب المعلم
  const handleDeactivateAccount = async (teacher: Teacher) => {
    const message = `هل أنت متأكد من إلغاء تفعيل حساب ${getTeacherName(teacher)}؟\n\nلن يتمكن المعلم من الدخول للنظام بعد ذلك.`;
    
    showConfirm('إلغاء تفعيل الحساب', message, async () => {
      try {
        setSaving(true);
        await teachersAPI.deactivateAccount(teacher.id);
        showMessage('تم', 'تم إلغاء تفعيل حساب المعلم');
        fetchData();
      } catch (error: any) {
        const errorMsg = error.response?.data?.detail || 'فشل في إلغاء التفعيل';
        showMessage('خطأ', errorMsg);
      } finally {
        setSaving(false);
      }
    }, 'إلغاء التفعيل', true);
  };

  // إعادة تعيين كلمة المرور
  const handleResetPassword = (teacher: Teacher) => {
    const message = `هل تريد إعادة تعيين كلمة مرور ${getTeacherName(teacher)}؟\n\nستصبح كلمة المرور الجديدة: ${getTeacherId(teacher)}`;
    
    showConfirm('إعادة تعيين كلمة المرور', message, async () => {
      try {
        setSaving(true);
        await teachersAPI.resetPassword(teacher.id);
        showMessage('تم ✅', `تم إعادة تعيين كلمة المرور\n\nكلمة المرور الجديدة: ${getTeacherId(teacher)}`);
      } catch (error: any) {
        const errorMsg = error.response?.data?.detail || 'فشل في إعادة تعيين كلمة المرور';
        showMessage('خطأ', errorMsg);
      } finally {
        setSaving(false);
      }
    });
  };

  const getDepartmentName = (deptId?: string) => {
    if (!deptId) return 'غير محدد';
    const dept = departments.find(d => d.id === deptId);
    return dept?.name || 'غير محدد';
  };

  // فلترة المعلمين
  let filteredTeachers = teachers;
  if (filterDepartment) {
    filteredTeachers = filteredTeachers.filter(t => 
      t.department_id === filterDepartment || 
      (t.department_ids && t.department_ids.includes(filterDepartment))
    );
  }
  if (searchQuery) {
    filteredTeachers = filteredTeachers.filter(t => 
      getTeacherName(t).includes(searchQuery) || 
      getTeacherId(t).includes(searchQuery)
    );
  }

  const renderTeacher = ({ item }: { item: Teacher }) => {
    const hasAccount = !!item.user_id;
    
    return (
      <View style={styles.teacherCard}>
        <View style={styles.teacherInfo}>
          <View style={[styles.avatar, { backgroundColor: hasAccount ? '#4caf50' : '#9e9e9e' }]}>
            <Text style={styles.avatarText}>{getTeacherName(item).charAt(0)}</Text>
          </View>
          <View style={styles.teacherDetails}>
            <Text style={styles.teacherName}>{getTeacherName(item)}</Text>
            {item.academic_title && (
              <Text style={styles.academicTitle}>{item.academic_title}</Text>
            )}
            <Text style={styles.teacherId}>الرقم الوظيفي: {getTeacherId(item)}</Text>
            <Text style={styles.teacherDept}>{getDepartmentName(item.department_id)}</Text>
            {item.specialization && (
              <Text style={styles.teacherSpec}>التخصص: {item.specialization}</Text>
            )}
            {(item.weekly_hours || item.teaching_load) && (
              <Text style={styles.teachingLoad}>النصاب الأسبوعي: {item.weekly_hours || item.teaching_load} ساعة</Text>
            )}
            <View style={[styles.statusBadge, { backgroundColor: hasAccount ? '#e8f5e9' : '#fafafa' }]}>
              <Ionicons 
                name={hasAccount ? "checkmark-circle" : "close-circle"} 
                size={14} 
                color={hasAccount ? '#4caf50' : '#999'} 
              />
              <Text style={[styles.statusText, { color: hasAccount ? '#4caf50' : '#999' }]}>
                {hasAccount ? 'حساب مفعل' : 'غير مفعل'}
              </Text>
            </View>
          </View>
        </View>
        
        <View style={styles.actionButtons}>
          {/* زر عرض المقررات */}
          <TouchableOpacity
            style={[styles.actionBtn, styles.coursesBtn]}
            onPress={() => router.push({
              pathname: '/teacher-courses',
              params: { teacherId: item.id, teacherName: getTeacherName(item) }
            })}
          >
            <Ionicons name="book" size={18} color="#9c27b0" />
          </TouchableOpacity>
          
          {/* زر تفعيل/إلغاء تفعيل الحساب */}
          <TouchableOpacity
            style={[styles.actionBtn, hasAccount ? styles.deactivateBtn : styles.activateBtn]}
            onPress={() => hasAccount ? handleDeactivateAccount(item) : handleActivateAccount(item)}
            disabled={saving}
          >
            <Ionicons 
              name={hasAccount ? "person-remove" : "person-add"} 
              size={18} 
              color={hasAccount ? '#f44336' : '#4caf50'} 
            />
          </TouchableOpacity>
          
          {/* زر إعادة كلمة المرور - يظهر فقط إذا كان الحساب مفعلاً */}
          {hasAccount && (
            <TouchableOpacity
              style={[styles.actionBtn, styles.resetBtn]}
              onPress={() => handleResetPassword(item)}
              disabled={saving}
            >
              <Ionicons name="key" size={18} color="#ff9800" />
            </TouchableOpacity>
          )}
          
          {/* زر التعديل */}
          <TouchableOpacity
            style={[styles.actionBtn, styles.editBtn]}
            onPress={() => handleEdit(item)}
          >
            <Ionicons name="create" size={18} color="#1565c0" />
          </TouchableOpacity>
          
          {/* زر الحذف */}
          <TouchableOpacity
            style={[styles.actionBtn, styles.deleteBtn]}
            onPress={() => handleDelete(item)}
          >
            <Ionicons name="trash" size={18} color="#f44336" />
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
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        {showForm ? (
          <ScrollView style={styles.formContainer}>
            <Text style={styles.formTitle}>
              {editingTeacher ? 'تعديل بيانات المعلم' : 'إضافة معلم جديد'}
            </Text>

            <Text style={styles.label}>الرقم الوظيفي *</Text>
            <TextInput
              style={[styles.input, editingTeacher && styles.inputDisabled]}
              value={formData.teacher_id}
              onChangeText={(text) => setFormData({ ...formData, teacher_id: text })}
              placeholder="أدخل الرقم الوظيفي"
              editable={!editingTeacher}
            />

            <Text style={styles.label}>الاسم الكامل *</Text>
            <TextInput
              style={styles.input}
              value={formData.full_name}
              onChangeText={(text) => setFormData({ ...formData, full_name: text })}
              placeholder="أدخل الاسم الكامل"
            />

            <Text style={styles.label}>الأقسام (يمكن اختيار أكثر من قسم)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.deptScroll}>
              {departments.map(dept => {
                const isSelected = formData.department_ids.includes(dept.id);
                return (
                  <TouchableOpacity
                    key={dept.id}
                    style={[styles.deptBtn, isSelected && styles.deptBtnActive]}
                    onPress={() => {
                      const newIds = isSelected
                        ? formData.department_ids.filter(id => id !== dept.id)
                        : [...formData.department_ids, dept.id];
                      setFormData({ ...formData, department_ids: newIds });
                    }}
                  >
                    <Ionicons 
                      name={isSelected ? 'checkbox' : 'square-outline'} 
                      size={16} 
                      color={isSelected ? '#fff' : '#666'} 
                      style={{ marginLeft: 4 }}
                    />
                    <Text style={[styles.deptBtnText, isSelected && styles.deptBtnTextActive]}>
                      {dept.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <Text style={styles.label}>التخصص</Text>
            <TextInput
              style={styles.input}
              value={formData.specialization}
              onChangeText={(text) => setFormData({ ...formData, specialization: text })}
              placeholder="التخصص العلمي"
            />

            <Text style={styles.label}>الوصف الأكاديمي</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.deptScroll}>
              {['أستاذ', 'أستاذ مشارك', 'أستاذ مساعد', 'محاضر', 'معيد'].map(title => (
                <TouchableOpacity
                  key={title}
                  style={[styles.deptBtn, formData.academic_title === title && styles.deptBtnActive]}
                  onPress={() => setFormData({ ...formData, academic_title: title })}
                >
                  <Text style={[styles.deptBtnText, formData.academic_title === title && styles.deptBtnTextActive]}>
                    {title}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.label}>نصاب التدريس (ساعات)</Text>
            <TextInput
              style={styles.input}
              value={formData.teaching_load}
              onChangeText={(text) => {
                const numericValue = text.replace(/[^0-9]/g, '');
                setFormData({ ...formData, teaching_load: numericValue });
              }}
              placeholder="عدد ساعات التدريس الإجمالية"
              keyboardType="numeric"
            />

            <Text style={styles.label}>النصاب الأسبوعي (ساعات) *</Text>
            <TextInput
              style={styles.input}
              value={formData.weekly_hours}
              onChangeText={(text) => {
                const numericValue = text.replace(/[^0-9]/g, '');
                setFormData({ ...formData, weekly_hours: numericValue });
              }}
              placeholder="النصاب الأسبوعي (افتراضي 12 ساعة)"
              keyboardType="numeric"
              data-testid="weekly-hours-input"
            />

            <Text style={styles.label}>رقم الهاتف</Text>
            <TextInput
              style={styles.input}
              value={formData.phone}
              onChangeText={(text) => setFormData({ ...formData, phone: text })}
              placeholder="رقم الهاتف"
              keyboardType="phone-pad"
            />

            <Text style={styles.label}>البريد الإلكتروني</Text>
            <TextInput
              style={styles.input}
              value={formData.email}
              onChangeText={(text) => setFormData({ ...formData, email: text })}
              placeholder="البريد الإلكتروني"
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <View style={styles.formButtons}>
              <TouchableOpacity
                style={[styles.btn, styles.cancelBtn]}
                onPress={() => {
                  setShowForm(false);
                  setEditingTeacher(null);
                  resetForm();
                }}
              >
                <Text style={styles.cancelBtnText}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.saveBtn, saving && styles.savingBtn]}
                onPress={handleSubmit}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.saveBtnText}>
                    {editingTeacher ? 'تحديث' : 'حفظ'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        ) : (
          <>
            {/* زر الإضافة */}
            <View style={{ flexDirection: 'row', gap: 8, margin: 16, marginBottom: 8 }}>
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => setShowForm(true)}
              >
                <Ionicons name="add-circle" size={24} color="#fff" />
                <Text style={styles.addButtonText}>إضافة معلم جديد</Text>
              </TouchableOpacity>
              
              {Platform.OS === 'web' && (
                <TouchableOpacity
                  style={[styles.addButton, { backgroundColor: '#1565c0' }]}
                  onPress={handleRestore}
                  disabled={restoring}
                  data-testid="restore-teacher-btn"
                >
                  <Ionicons name="cloud-upload" size={22} color="#fff" />
                  <Text style={styles.addButtonText}>{restoring ? 'جاري...' : 'استعادة'}</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* البحث */}
            <View style={styles.searchContainer}>
              <Ionicons name="search" size={20} color="#999" />
              <TextInput
                style={styles.searchInput}
                placeholder="بحث بالاسم أو الرقم الوظيفي..."
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={20} color="#999" />
                </TouchableOpacity>
              )}
            </View>

            {/* فلتر الأقسام - قائمة منسدلة */}
            <View style={styles.filterContainer}>
              <View style={styles.dropdownRow}>
                <View style={styles.dropdownContainer}>
                  <Text style={styles.dropdownLabel}>القسم</Text>
                  <View style={styles.pickerWrapper}>
                    <Picker
                      selectedValue={filterDepartment}
                      onValueChange={(value) => setFilterDepartment(value)}
                      style={styles.picker}
                    >
                      <Picker.Item label={`الكل (${teachers.length})`} value="" />
                      {departments.map(dept => (
                        <Picker.Item 
                          key={dept.id} 
                          label={`${dept.name} (${teachers.filter(t => t.department_id === dept.id).length})`} 
                          value={dept.id} 
                        />
                      ))}
                    </Picker>
                  </View>
                </View>
              </View>
            </View>

            {/* عداد المعلمين */}
            <View style={styles.countContainer}>
              <Text style={styles.countText}>
                عدد المعلمين: {filteredTeachers.length} من {teachers.length}
              </Text>
            </View>

            {/* قائمة المعلمين */}
            <FlatList
              data={filteredTeachers}
              renderItem={renderTeacher}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons name="people-outline" size={64} color="#ccc" />
                  <Text style={styles.emptyText}>لا يوجد معلمين</Text>
                </View>
              }
            />
          </>
        )}
      </KeyboardAvoidingView>
      
      {/* Loading overlay */}
      {saving && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#1565c0" />
        </View>
      )}
      
      {/* نافذة الحذف الآمن */}
      <Modal visible={showDeleteModal} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '90%', maxWidth: 420 }}>
            <Ionicons name="warning" size={40} color="#f44336" style={{ alignSelf: 'center', marginBottom: 12 }} />
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#333', textAlign: 'center', marginBottom: 8 }}>
              حذف المعلم
            </Text>
            <Text style={{ fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 16 }}>
              "{deleteTarget ? getTeacherName(deleteTarget) : ''}"
            </Text>
            
            {deleteInfo && !deleteInfo.error ? (
              <View style={{ backgroundColor: '#fff3e0', padding: 14, borderRadius: 10, marginBottom: 16 }}>
                <Text style={{ fontSize: 13, color: '#e65100', fontWeight: '600', marginBottom: 8, textAlign: 'center' }}>
                  سيتم حذف التالي نهائياً:
                </Text>
                <Text style={{ fontSize: 13, color: '#555', lineHeight: 24 }}>
                  {`• ${deleteInfo.courses_count} مقرر مرتبط${deleteInfo.courses_names?.length ? ` (${deleteInfo.courses_names.join('، ')})` : ''}\n• ${deleteInfo.lectures_count} محاضرة\n• ${deleteInfo.attendance_count} سجل حضور${deleteInfo.has_user_account ? '\n• حساب المستخدم سيتم حذفه' : ''}`}
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
                data-testid="cancel-delete-teacher-btn"
              >
                <Text style={{ color: '#666', fontWeight: '600' }}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: '#f44336', padding: 14, borderRadius: 10, alignItems: 'center', opacity: (deletingTeacher || !deleteInfo || deleteInfo.error) ? 0.6 : 1 }}
                onPress={confirmSafeDelete}
                disabled={deletingTeacher || !deleteInfo || deleteInfo.error}
                data-testid="confirm-delete-teacher-btn"
              >
                {deletingTeacher ? (
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
    backgroundColor: '#1565c0',
    margin: 16,
    marginBottom: 8,
    padding: 16,
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
    marginBottom: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  searchInput: {
    flex: 1,
    padding: 12,
    fontSize: 14,
    textAlign: 'right',
  },
  filterScroll: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  filterBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginRight: 8,
  },
  filterBtnActive: {
    backgroundColor: '#1565c0',
    borderColor: '#1565c0',
  },
  filterText: {
    fontSize: 13,
    color: '#333',
  },
  filterTextActive: {
    color: '#fff',
  },
  filterContainer: {
    padding: 10,
    backgroundColor: '#f8f9fa',
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 10,
  },
  dropdownRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dropdownContainer: {
    flex: 1,
  },
  dropdownLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  pickerWrapper: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    overflow: 'hidden',
  },
  picker: {
    height: 45,
    fontSize: 13,
  },
  countContainer: {
    backgroundColor: '#e3f2fd',
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 8,
  },
  countText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1565c0',
    textAlign: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  teacherCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  teacherInfo: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  avatarText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  teacherDetails: {
    flex: 1,
  },
  teacherName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  teacherId: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  teacherDept: {
    fontSize: 12,
    color: '#1565c0',
    marginTop: 2,
  },
  teacherSpec: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  academicTitle: {
    fontSize: 13,
    color: '#4caf50',
    fontWeight: '600',
    marginTop: 2,
  },
  teachingLoad: {
    fontSize: 12,
    color: '#ff9800',
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 6,
    gap: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '500',
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 12,
  },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activateBtn: {
    backgroundColor: '#e8f5e9',
  },
  deactivateBtn: {
    backgroundColor: '#ffebee',
  },
  resetBtn: {
    backgroundColor: '#fff3e0',
  },
  coursesBtn: {
    backgroundColor: '#f3e5f5',
  },
  editBtn: {
    backgroundColor: '#e3f2fd',
  },
  deleteBtn: {
    backgroundColor: '#ffebee',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
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
  inputDisabled: {
    backgroundColor: '#f5f5f5',
    color: '#999',
  },
  deptScroll: {
    marginBottom: 8,
  },
  deptBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  deptBtnActive: {
    backgroundColor: '#1565c0',
    borderColor: '#1565c0',
  },
  deptBtnText: {
    fontSize: 14,
    color: '#666',
  },
  deptBtnTextActive: {
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
    backgroundColor: '#1565c0',
    marginLeft: 8,
  },
  savingBtn: {
    opacity: 0.7,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
