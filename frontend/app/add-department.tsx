/**
 * إدارة الأقسام - تصميم حديث (متّسق مع /(tabs)/courses و /manage-teachers)
 * الميزات:
 *  - عرض جدولي حديث + بطاقات إحصائية + فلاتر + بحث
 *  - النقر على القسم يفتح صفحة التفاصيل الجديدة /department-details?departmentId=...
 *  - إضافة/تعديل/حذف مع نموذج كامل
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Picker } from '@react-native-picker/picker';
import { departmentsAPI, facultiesAPI, scopeAPI } from '../src/services/api';
import { Department } from '../src/types';
import { LoadingScreen } from '../src/components/LoadingScreen';
import { useAuth, PERMISSIONS } from '../src/contexts/AuthContext';

interface Faculty {
  id: string;
  name: string;
  code: string;
}

interface DeptStats extends Department {
  students_count: number;
  courses_count: number;
  teachers_count?: number;
  faculty_id?: string;
  faculty_name?: string;
}

interface UserScope {
  level: string;
  university_access: boolean;
  faculties: Array<{ id: string; name: string }>;
  departments: Array<{ id: string; name: string; faculty_id?: string }>;
  can_manage_settings: boolean;
}

export default function AddDepartmentScreen() {
  const router = useRouter();
  const [departments, setDepartments] = useState<DeptStats[]>([]);
  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [userScope, setUserScope] = useState<UserScope | null>(null);

  // صلاحيات
  const { hasPermission, user } = useAuth();
  const canManageDepts = hasPermission(PERMISSIONS.MANAGE_DEPARTMENTS);
  const canAddDept = canManageDepts || hasPermission('add_department');
  const canEditDept = canManageDepts || hasPermission('edit_department');
  const canDeleteDept = canManageDepts || hasPermission('delete_department');

  // Delete confirmation modal
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // فلاتر وبحث
  const [filterFacultyId, setFilterFacultyId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  // ترقيم الصفحات
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: '',
    faculty_id: '',
    default_program_code: '',
  });

  const fetchData = useCallback(async () => {
    try {
      let scope: UserScope | null = null;
      try {
        const scopeRes = await scopeAPI.get();
        scope = scopeRes.data;
        setUserScope(scope);
      } catch (e) {
        console.log('Error fetching scope:', e);
      }

      const [deptsRes, facultiesRes] = await Promise.all([
        departmentsAPI.getStats(),
        facultiesAPI.getAll(),
      ]);

      let filteredDepts = deptsRes.data || [];
      let filteredFaculties = facultiesRes.data || [];

      if (scope && user?.role !== 'admin') {
        if (scope.level === 'university') {
          // لا تصفية
        } else if (scope.level === 'faculty' && scope.faculties?.length > 0) {
          const allowedFacultyIds = scope.faculties.map(f => f.id);
          filteredDepts = filteredDepts.filter((d: DeptStats) =>
            allowedFacultyIds.includes(d.faculty_id || '')
          );
          filteredFaculties = filteredFaculties.filter((f: Faculty) =>
            allowedFacultyIds.includes(f.id)
          );
        } else if (scope.level === 'department' && scope.departments?.length > 0) {
          const allowedDeptIds = scope.departments.map(d => d.id);
          filteredDepts = filteredDepts.filter((d: DeptStats) =>
            allowedDeptIds.includes(d.id)
          );
          const allowedFacultyIds = [...new Set(scope.departments.map(d => d.faculty_id).filter(Boolean))];
          filteredFaculties = filteredFaculties.filter((f: Faculty) =>
            allowedFacultyIds.includes(f.id)
          );
        } else if (scope.level === 'none') {
          filteredDepts = [];
          filteredFaculties = [];
        }
      }

      setDepartments(filteredDepts);
      setFaculties(filteredFaculties);
    } catch (error) {
      console.error('Error fetching data:', error);
      try {
        const fallback = await departmentsAPI.getAll();
        setDepartments(fallback.data.map((d: Department) => ({ ...d, students_count: 0, courses_count: 0 })));
      } catch (e) {
        console.error('Fallback error:', e);
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSubmit = async () => {
    if (!formData.name || !formData.code) {
      Alert.alert('خطأ', 'الرجاء ملء جميع الحقول المطلوبة');
      return;
    }
    setSaving(true);
    try {
      if (editingDept) {
        await departmentsAPI.update(editingDept.id, formData);
        Alert.alert('نجاح', 'تم تحديث القسم بنجاح');
      } else {
        await departmentsAPI.create(formData);
        Alert.alert('نجاح', 'تم إضافة القسم بنجاح');
      }
      resetForm();
      setShowForm(false);
      setEditingDept(null);
      fetchData();
    } catch (error: any) {
      const message = error.response?.data?.detail || 'حدث خطأ';
      Alert.alert('خطأ', message);
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setFormData({ name: '', code: '', description: '', faculty_id: '', default_program_code: '' });
  };

  const handleEdit = (dept: DeptStats) => {
    setEditingDept(dept);
    setFormData({
      name: dept.name,
      code: dept.code,
      description: dept.description || '',
      faculty_id: dept.faculty_id || '',
      default_program_code: (dept as any).default_program_code || '',
    });
    setShowForm(true);
  };

  const handleDelete = (deptId: string, deptName: string) => {
    setDeleteTarget({ id: deptId, name: deptName });
    setDeleteError(null);
    setDeleting(false);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await departmentsAPI.delete(deleteTarget.id);
      setDeleteTarget(null);
      fetchData();
    } catch (error: any) {
      const msg = error?.response?.data?.detail || 'فشل في حذف القسم';
      setDeleteError(msg);
    } finally {
      setDeleting(false);
    }
  };

  // فلترة + بحث
  const filtered = useMemo(() => {
    return departments.filter(d => {
      if (filterFacultyId && d.faculty_id !== filterFacultyId) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!d.name?.toLowerCase().includes(q)
            && !d.code?.toLowerCase().includes(q)
            && !d.faculty_name?.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [departments, filterFacultyId, searchQuery]);

  const totalStudents = useMemo(() => departments.reduce((s, d) => s + (d.students_count ?? 0), 0), [departments]);
  const totalCourses = useMemo(() => departments.reduce((s, d) => s + (d.courses_count ?? 0), 0), [departments]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paged = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);

  const goToDetails = (id: string) => {
    router.push(`/department-details?departmentId=${id}` as any);
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
          // ====== نموذج الإضافة/التعديل ======
          <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.pageScroll, { flexGrow: 1 }]} showsVerticalScrollIndicator={true}>
            <View style={styles.formCard}>
              <View style={styles.formHeader}>
                <Text style={styles.formTitle}>
                  {editingDept ? 'تعديل القسم' : 'إضافة قسم جديد'}
                </Text>
                <TouchableOpacity
                  onPress={() => { setShowForm(false); setEditingDept(null); resetForm(); }}
                  style={styles.formCloseBtn}
                  data-testid="close-form-btn"
                >
                  <Ionicons name="close" size={22} color="#5b6678" />
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>الكلية <Text style={{ color: '#e91e63' }}>*</Text></Text>
              <View style={styles.facultySelector}>
                {faculties.length > 0 ? (
                  faculties.map(faculty => (
                    <TouchableOpacity
                      key={faculty.id}
                      style={[
                        styles.facultyOption,
                        formData.faculty_id === faculty.id && styles.facultyOptionActive
                      ]}
                      onPress={() => setFormData({ ...formData, faculty_id: faculty.id })}
                      data-testid={`faculty-option-${faculty.id}`}
                    >
                      <Text style={[
                        styles.facultyOptionText,
                        formData.faculty_id === faculty.id && styles.facultyOptionTextActive
                      ]}>
                        {faculty.name}
                      </Text>
                    </TouchableOpacity>
                  ))
                ) : (
                  <Text style={styles.noDataText}>لا توجد كليات - أضف كليات أولاً</Text>
                )}
              </View>

              <Text style={styles.label}>اسم القسم <Text style={{ color: '#e91e63' }}>*</Text></Text>
              <TextInput
                style={styles.input}
                value={formData.name}
                onChangeText={(text) => setFormData({ ...formData, name: text })}
                placeholder="مثال: قسم الشريعة الإسلامية"
                placeholderTextColor="#a8b1c2"
                data-testid="dept-name-input"
              />

              <Text style={styles.label}>رمز القسم <Text style={{ color: '#e91e63' }}>*</Text></Text>
              <TextInput
                style={styles.input}
                value={formData.code}
                onChangeText={(text) => setFormData({ ...formData, code: text })}
                placeholder="مثال: SHARIA"
                placeholderTextColor="#a8b1c2"
                autoCapitalize="characters"
                data-testid="dept-code-input"
              />

              <Text style={styles.label}>الوصف</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={formData.description}
                onChangeText={(text) => setFormData({ ...formData, description: text })}
                placeholder="وصف مختصر للقسم"
                placeholderTextColor="#a8b1c2"
                multiline
                numberOfLines={3}
              />

              <Text style={styles.label}>البرنامج الافتراضي للطلاب</Text>
              <View style={styles.programChips}>
                {[
                  { v: '', l: 'غير محدد' },
                  { v: 'B', l: 'بكالوريوس' },
                  { v: 'M', l: 'ماجستير' },
                  { v: 'D', l: 'دكتوراه' },
                  { v: 'P', l: 'دبلوم' },
                  { v: 'E', l: 'عن بُعد' },
                ].map((opt) => (
                  <TouchableOpacity
                    key={opt.v || 'none'}
                    onPress={() => setFormData({ ...formData, default_program_code: opt.v })}
                    style={[
                      styles.programChip,
                      formData.default_program_code === opt.v && styles.programChipActive,
                    ]}
                    testID={`program-code-${opt.v || 'none'}`}
                  >
                    <Text style={[
                      styles.programChipText,
                      formData.default_program_code === opt.v && styles.programChipTextActive,
                    ]}>
                      {opt.l}{opt.v ? ` (${opt.v})` : ''}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.formButtons}>
                <TouchableOpacity
                  style={[styles.btn, styles.cancelBtn]}
                  onPress={() => { setShowForm(false); setEditingDept(null); resetForm(); }}
                >
                  <Text style={styles.cancelBtnText}>إلغاء</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btn, styles.saveBtn, (!formData.faculty_id || saving) && { opacity: 0.6 }]}
                  onPress={handleSubmit}
                  disabled={saving || !formData.faculty_id}
                  data-testid="submit-dept-btn"
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.saveBtnText}>
                      {editingDept ? 'تحديث' : 'حفظ'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        ) : (
          // ====== عرض القائمة ======
          <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.pageScroll, { flexGrow: 1 }]} showsVerticalScrollIndicator={true}>
            {/* رأس الصفحة */}
            <View dataSet={{ responsive: "page-header" }} style={styles.pageHeader}>
              <View style={styles.pageHeaderRight}>
                <Text dataSet={{ responsive: "page-title" }} style={styles.pageTitle}>إدارة الأقسام</Text>
                <View style={styles.breadcrumb}>
                  <TouchableOpacity onPress={() => router.replace('/')}>
                    <Text style={styles.breadcrumbLink}>الرئيسية</Text>
                  </TouchableOpacity>
                  <Ionicons name="chevron-back" size={12} color="#8a95a8" />
                  <Text style={styles.breadcrumbCurrent}>الأقسام</Text>
                </View>
              </View>

              <View dataSet={{ responsive: "page-header-actions" }} style={styles.pageHeaderActions}>
                {canAddDept && (
                  <TouchableOpacity
                    style={[styles.headerBtn, styles.btnPrimary]}
                    onPress={() => { resetForm(); setEditingDept(null); setShowForm(true); }}
                    data-testid="add-dept-btn"
                  >
                    <Ionicons name="add" size={16} color="#fff" />
                    <Text style={styles.btnPrimaryText}>إضافة قسم</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.headerBtn, styles.btnGhost]}
                  onPress={() => fetchData()}
                >
                  <Ionicons name="refresh" size={16} color="#1a2540" />
                  <Text style={styles.btnGhostText}>تحديث</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* بطاقات الإحصائيات */}
            <View dataSet={{ responsive: "stats-grid" }} style={styles.statsGrid}>
              <View style={styles.statCard}>
                <View style={[styles.statIconWrap, { backgroundColor: '#e91e63' }]}><Ionicons name="business" size={22} color="#fff" /></View>
                <View style={styles.statTextCol}>
                  <Text style={styles.statLabel}>إجمالي الأقسام</Text>
                  <Text style={styles.statValue}>{departments.length}</Text>
                  <Text style={styles.statSubLabel}>قسم</Text>
                </View>
              </View>
              <View style={styles.statCard}>
                <View style={[styles.statIconWrap, { backgroundColor: '#29b6f6' }]}><Ionicons name="eye" size={22} color="#fff" /></View>
                <View style={styles.statTextCol}>
                  <Text style={styles.statLabel}>المعروض حالياً</Text>
                  <Text style={styles.statValue}>{filtered.length}</Text>
                  <Text style={styles.statSubLabel}>من {departments.length} قسم</Text>
                </View>
              </View>
              <View style={styles.statCard}>
                <View style={[styles.statIconWrap, { backgroundColor: '#1565c0' }]}><Ionicons name="people" size={22} color="#fff" /></View>
                <View style={styles.statTextCol}>
                  <Text style={styles.statLabel}>إجمالي الطلاب</Text>
                  <Text style={styles.statValue}>{totalStudents.toLocaleString('en-US')}</Text>
                  <Text style={styles.statSubLabel}>طالب</Text>
                </View>
              </View>
              <View style={styles.statCard}>
                <View style={[styles.statIconWrap, { backgroundColor: '#4caf50' }]}><Ionicons name="book" size={22} color="#fff" /></View>
                <View style={styles.statTextCol}>
                  <Text style={styles.statLabel}>إجمالي المقررات</Text>
                  <Text style={styles.statValue}>{totalCourses.toLocaleString('en-US')}</Text>
                  <Text style={styles.statSubLabel}>مقرر</Text>
                </View>
              </View>
            </View>

            {/* بطاقة الفلاتر */}
            <View style={styles.filterCard}>
              <View dataSet={{ responsive: "filter-row" }} style={styles.filterRow}>
                <View style={styles.filterField}>
                  <Text style={styles.filterLbl}>البحث</Text>
                  <View style={styles.searchBox}>
                    <Ionicons name="search" size={16} color="#8a95a8" />
                    <TextInput
                      style={styles.searchBoxInput}
                      placeholder="ابحث بالاسم أو الرمز أو الكلية..."
                      value={searchQuery}
                      onChangeText={(t) => { setSearchQuery(t); setCurrentPage(1); }}
                      placeholderTextColor="#a8b1c2"
                      data-testid="dept-search-input"
                    />
                  </View>
                </View>
                <View style={styles.filterField}>
                  <Text style={styles.filterLbl}>الكلية</Text>
                  <View style={styles.dropdown}>
                    <Picker
                      selectedValue={filterFacultyId}
                      onValueChange={(v) => { setFilterFacultyId(v); setCurrentPage(1); }}
                      style={styles.dropdownInner}
                    >
                      <Picker.Item label="كل الكليات" value="" />
                      {faculties.map(f => <Picker.Item key={f.id} label={f.name} value={f.id} />)}
                    </Picker>
                  </View>
                </View>
                <View style={styles.filterBtns}>
                  <TouchableOpacity
                    style={styles.resetBtn}
                    onPress={() => { setFilterFacultyId(''); setSearchQuery(''); setCurrentPage(1); }}
                    disabled={!filterFacultyId && !searchQuery}
                  >
                    <Ionicons name="refresh" size={13} color={(filterFacultyId || searchQuery) ? '#2962ff' : '#a8b1c2'} />
                    <Text style={[styles.resetBtnText, !(filterFacultyId || searchQuery) && { color: '#a8b1c2' }]}>إعادة تعيين</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* بطاقة الجدول */}
            <View style={styles.tableCard}>
              <View style={styles.tableCardHeader}>
                <Text style={styles.tableCardTitle}>قائمة الأقسام</Text>
                <Text style={styles.tableCardCount}>
                  عرض <Text style={styles.tableCardCountAccent}>{filtered.length}</Text> من <Text style={styles.tableCardCountAccent}>{departments.length}</Text> قسم
                </Text>
              </View>

              <View dataSet={{ responsive: "table-header-row" }} style={styles.tableHeaderRow}>
                <View style={[styles.cCol1, styles.cellPad]}><Text style={styles.thText}>القسم</Text></View>
                <View style={[styles.cCol2, styles.cellPad]}><Text style={styles.thText}>الكلية</Text></View>
                <View style={[styles.cCol3, styles.cellPad]}><Text style={styles.thText}>الطلاب</Text></View>
                <View style={[styles.cCol4, styles.cellPad]}><Text style={styles.thText}>المقررات</Text></View>
                <View style={[styles.cCol5, styles.cellPad]}><Text style={styles.thText}>العمليات</Text></View>
              </View>

              {paged.length === 0 ? (
                <View style={styles.tableEmpty}>
                  <Ionicons name="business-outline" size={48} color="#cfd6e1" />
                  <Text style={styles.tableEmptyText}>
                    {searchQuery || filterFacultyId ? 'لا توجد نتائج مطابقة' : 'لا توجد أقسام بعد'}
                  </Text>
                  {canAddDept && !searchQuery && !filterFacultyId && (
                    <TouchableOpacity
                      style={[styles.headerBtn, styles.btnPrimary, { marginTop: 10 }]}
                      onPress={() => { resetForm(); setEditingDept(null); setShowForm(true); }}
                    >
                      <Ionicons name="add" size={16} color="#fff" />
                      <Text style={styles.btnPrimaryText}>إضافة أول قسم</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <View>
                  {paged.map((item, index) => (
                    <View key={item.id} dataSet={{ responsive: "table-row" }} style={[styles.tRow, index % 2 === 1 && styles.tRowAlt]}>
                      {/* القسم */}
                      <TouchableOpacity
                        style={[styles.cCol1, styles.cellPad]}
                        onPress={() => goToDetails(item.id)}
                        data-testid={`dept-row-${item.id}`}
                      >
                        <View style={styles.deptAvatar}>
                          <Ionicons name="business" size={16} color="#e91e63" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.tName} numberOfLines={1}>{item.name}</Text>
                          <Text style={styles.tSubName}>{item.code}</Text>
                        </View>
                      </TouchableOpacity>

                      {/* الكلية */}
                      <View style={[styles.cCol2, styles.cellPad]}>
                        {item.faculty_name ? (
                          <View style={styles.facultyChip}>
                            <Ionicons name="school" size={11} color="#9c27b0" />
                            <Text style={styles.facultyChipText} numberOfLines={1}>{item.faculty_name}</Text>
                          </View>
                        ) : (
                          <Text style={styles.tMutedCell}>—</Text>
                        )}
                      </View>

                      {/* الطلاب */}
                      <View style={[styles.cCol3, styles.cellPad]}>
                        <View style={[styles.statChip, { backgroundColor: '#e7f0fe' }]}>
                          <Ionicons name="people" size={11} color="#1565c0" />
                          <Text style={[styles.statChipText, { color: '#1565c0' }]}>{item.students_count ?? 0}</Text>
                        </View>
                      </View>

                      {/* المقررات */}
                      <View style={[styles.cCol4, styles.cellPad]}>
                        <View style={[styles.statChip, { backgroundColor: '#e8f5e9' }]}>
                          <Ionicons name="book" size={11} color="#2e7d32" />
                          <Text style={[styles.statChipText, { color: '#2e7d32' }]}>{item.courses_count ?? 0}</Text>
                        </View>
                      </View>

                      {/* العمليات */}
                      <View style={[styles.cCol5, styles.cellPad, { flexDirection: 'row-reverse', gap: 6 }]}>
                        <TouchableOpacity
                          style={styles.actionIconBtn}
                          onPress={() => goToDetails(item.id)}
                          accessibilityLabel="عرض التفاصيل"
                          data-testid={`view-dept-${item.id}`}
                        >
                          <Ionicons name="eye-outline" size={16} color="#2962ff" />
                        </TouchableOpacity>
                        {(canEditDept || canDeleteDept) && (
                          <>
                            {canEditDept && (
                              <TouchableOpacity
                                style={[styles.actionIconBtn, { backgroundColor: '#fff3e0', borderColor: '#ffe0b2' }]}
                                onPress={() => handleEdit(item)}
                                accessibilityLabel="تعديل"
                                data-testid={`edit-dept-${item.id}`}
                              >
                                <Ionicons name="pencil-outline" size={16} color="#ff9800" />
                              </TouchableOpacity>
                            )}
                            {canDeleteDept && (
                              <TouchableOpacity
                                style={[styles.actionIconBtn, { backgroundColor: '#ffebee', borderColor: '#ffcdd2' }]}
                                onPress={() => handleDelete(item.id, item.name)}
                                accessibilityLabel="حذف"
                                data-testid={`delete-dept-${item.id}`}
                              >
                                <Ionicons name="trash-outline" size={16} color="#f44336" />
                              </TouchableOpacity>
                            )}
                          </>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {/* تذييل الجدول مع pagination */}
              {filtered.length > 0 && (
                <View dataSet={{ responsive: "table-footer" }} style={styles.tableFooter}>
                  <View style={styles.perPageWrap}>
                    <Text style={styles.perPageLbl}>عرض في الصفحة</Text>
                    <View style={styles.perPageBox}>
                      <Picker
                        selectedValue={String(perPage)}
                        onValueChange={(v) => { setPerPage(parseInt(v) || 10); setCurrentPage(1); }}
                        style={styles.perPagePicker}
                      >
                        {[10, 25, 50, 100].map(n => <Picker.Item key={n} label={String(n)} value={String(n)} />)}
                      </Picker>
                    </View>
                  </View>
                  {totalPages > 1 && (
                    <View style={styles.pagerWrap}>
                      <TouchableOpacity
                        style={[styles.pagerNavBtn, currentPage <= 1 && styles.pagerNavBtnDisabled]}
                        onPress={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage <= 1}
                      >
                        <Ionicons name="chevron-forward" size={14} color={currentPage <= 1 ? '#c0c8d4' : '#1a2540'} />
                        <Text style={[styles.pagerNavText, currentPage <= 1 && { color: '#c0c8d4' }]}>السابق</Text>
                      </TouchableOpacity>
                      {(() => {
                        const pages: (number | 'dots')[] = [];
                        pages.push(1);
                        if (currentPage > 4) pages.push('dots');
                        const start = Math.max(2, currentPage - 1);
                        const end = Math.min(totalPages - 1, currentPage + 1);
                        for (let i = start; i <= end; i++) pages.push(i);
                        if (currentPage < totalPages - 3) pages.push('dots');
                        if (totalPages > 1) pages.push(totalPages);
                        return pages.map((p, idx) => p === 'dots' ? (
                          <Text key={`d-${idx}`} style={styles.pagerDots}>...</Text>
                        ) : (
                          <TouchableOpacity
                            key={p}
                            style={[styles.pagerBtn, currentPage === p && styles.pagerBtnActive]}
                            onPress={() => setCurrentPage(p as number)}
                          >
                            <Text style={[styles.pagerBtnText, currentPage === p && styles.pagerBtnTextActive]}>{p}</Text>
                          </TouchableOpacity>
                        ));
                      })()}
                      <TouchableOpacity
                        style={[styles.pagerNavBtn, currentPage >= totalPages && styles.pagerNavBtnDisabled]}
                        onPress={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage >= totalPages}
                      >
                        <Text style={[styles.pagerNavText, currentPage >= totalPages && { color: '#c0c8d4' }]}>التالي</Text>
                        <Ionicons name="chevron-back" size={14} color={currentPage >= totalPages ? '#c0c8d4' : '#1a2540'} />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
            </View>
          </ScrollView>
        )}
      </KeyboardAvoidingView>

      {/* نافذة تأكيد الحذف */}
      <Modal visible={deleteTarget !== null} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.deleteModalCard}>
            <Ionicons name="warning" size={40} color="#f44336" style={{ alignSelf: 'center', marginBottom: 12 }} />
            <Text style={styles.deleteModalTitle}>حذف القسم</Text>
            <Text style={styles.deleteModalSub}>
              هل أنت متأكد من حذف قسم "{deleteTarget?.name}"؟
            </Text>
            <Text style={styles.deleteModalWarn}>لا يمكن التراجع عن هذا الإجراء</Text>

            {deleteError && (
              <View style={styles.deleteErrorBox}>
                <Text style={styles.deleteErrorText}>{deleteError}</Text>
              </View>
            )}

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                style={styles.deleteModalCancel}
                onPress={() => { setDeleteTarget(null); setDeleteError(null); }}
              >
                <Text style={styles.deleteModalCancelText}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.deleteModalConfirm, deleting && { opacity: 0.6 }]}
                onPress={confirmDelete}
                disabled={deleting}
                data-testid="confirm-delete-btn"
              >
                {deleting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.deleteModalConfirmText}>حذف</Text>
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
  container: { flex: 1, backgroundColor: '#f4f6fb' },

  // التخطيط
  pageScroll: { padding: 20, paddingBottom: 60, maxWidth: 1440, width: '100%', alignSelf: 'center' },

  // رأس الصفحة
  pageHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 },
  pageHeaderRight: { alignItems: 'flex-end' },
  pageTitle: { fontSize: 26, fontWeight: '700', color: '#1a2540', textAlign: 'right', marginBottom: 6 },
  breadcrumb: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  breadcrumbLink: { fontSize: 13, color: '#2962ff', fontWeight: '500' },
  breadcrumbCurrent: { fontSize: 13, color: '#8a95a8', fontWeight: '500' },
  pageHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  headerBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 9, paddingHorizontal: 14, borderRadius: 8 },
  btnPrimary: { backgroundColor: '#e91e63' },
  btnPrimaryText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  btnGhost: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e3e7ee' },
  btnGhostText: { color: '#1a2540', fontSize: 13, fontWeight: '600' },

  // البطاقات الإحصائية
  statsGrid: { flexDirection: 'row', gap: 14, marginBottom: 18, flexWrap: 'wrap' },
  statCard: { flex: 1, minWidth: 200, backgroundColor: '#fff', borderRadius: 14, padding: 18, flexDirection: 'row-reverse', alignItems: 'center', gap: 14, borderWidth: 1, borderColor: '#eef1f6' },
  statIconWrap: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  statTextCol: { flex: 1, alignItems: 'flex-end' },
  statLabel: { fontSize: 13, color: '#8a95a8', fontWeight: '500', marginBottom: 4 },
  statValue: { fontSize: 22, color: '#1a2540', fontWeight: '700', marginBottom: 2 },
  statSubLabel: { fontSize: 11, color: '#a8b1c2' },

  // الفلاتر
  filterCard: { backgroundColor: '#fff', borderRadius: 14, padding: 18, marginBottom: 18, borderWidth: 1, borderColor: '#eef1f6' },
  filterRow: { flexDirection: 'row-reverse', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' },
  filterField: { flex: 1, minWidth: 140 },
  filterLbl: { fontSize: 12, color: '#5b6678', fontWeight: '500', marginBottom: 5, textAlign: 'right' },
  searchBox: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: '#e3e7ee', height: 40 },
  searchBoxInput: { flex: 1, fontSize: 13, color: '#1a2540', textAlign: 'right', outlineStyle: 'none' as any },
  dropdown: { backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#e3e7ee', height: 40, overflow: 'hidden', justifyContent: 'center' },
  dropdownInner: { height: 40, fontSize: 13, color: '#1a2540', textAlign: 'right', backgroundColor: 'transparent', borderWidth: 0 },
  filterBtns: { flexDirection: 'row-reverse', alignItems: 'center', gap: 14 },
  resetBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5, paddingVertical: 9, paddingHorizontal: 4 },
  resetBtnText: { fontSize: 13, color: '#2962ff', fontWeight: '600' },

  // الجدول
  tableCard: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#eef1f6' },
  tableCardHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eef1f6' },
  tableCardTitle: { fontSize: 15, fontWeight: '700', color: '#1a2540' },
  tableCardCount: { fontSize: 12, color: '#5b6678' },
  tableCardCountAccent: { color: '#e91e63', fontWeight: '700' },
  tableHeaderRow: { flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: '#fafbfd', borderBottomWidth: 1, borderBottomColor: '#eef1f6', minHeight: 44 },
  thText: { fontSize: 12, fontWeight: '600', color: '#5b6678', textAlign: 'right' },
  tRow: { flexDirection: 'row-reverse', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#f3f5f9', minHeight: 60 },
  tRowAlt: { backgroundColor: '#fcfcfd' },
  cellPad: { paddingVertical: 12, paddingHorizontal: 14 },
  cCol1: { flex: 2.5, flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  cCol2: { flex: 2 },
  cCol3: { flex: 1 },
  cCol4: { flex: 1 },
  cCol5: { flex: 1.2, alignItems: 'flex-start' },
  deptAvatar: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#fce4ec', alignItems: 'center', justifyContent: 'center' },
  tName: { fontSize: 13, fontWeight: '600', color: '#1a2540', textAlign: 'right' },
  tSubName: { fontSize: 11, color: '#8a95a8', textAlign: 'right', marginTop: 2 },
  tMutedCell: { fontSize: 13, color: '#a8b1c2', textAlign: 'right' },
  facultyChip: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: '#f3e5f5', alignSelf: 'flex-end' },
  facultyChipText: { fontSize: 12, color: '#9c27b0', fontWeight: '600' },
  statChip: { alignSelf: 'flex-end', flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statChipText: { fontSize: 12, fontWeight: '700' },
  actionIconBtn: { width: 32, height: 32, borderRadius: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#e3e7ee', backgroundColor: '#f7f9fc' },
  tableEmpty: { paddingVertical: 60, alignItems: 'center', gap: 12 },
  tableEmptyText: { fontSize: 14, color: '#8a95a8' },
  tableFooter: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderTopWidth: 1, borderTopColor: '#eef1f6', flexWrap: 'wrap', gap: 12 },
  perPageWrap: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  perPageLbl: { fontSize: 12, color: '#5b6678' },
  perPageBox: { width: 70, height: 34, borderWidth: 1, borderColor: '#e3e7ee', borderRadius: 6, justifyContent: 'center', overflow: 'hidden' },
  perPagePicker: { height: 34, fontSize: 12, borderWidth: 0, backgroundColor: 'transparent' },
  pagerWrap: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  pagerBtn: { minWidth: 32, height: 32, borderRadius: 6, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#e3e7ee', backgroundColor: '#fff' },
  pagerBtnActive: { backgroundColor: '#e91e63', borderColor: '#e91e63' },
  pagerBtnText: { fontSize: 12, color: '#1a2540', fontWeight: '600' },
  pagerBtnTextActive: { color: '#fff' },
  pagerDots: { color: '#8a95a8', paddingHorizontal: 4 },
  pagerNavBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 12, height: 32, borderRadius: 6, borderWidth: 1, borderColor: '#e3e7ee', backgroundColor: '#fff' },
  pagerNavBtnDisabled: { backgroundColor: '#fafbfd' },
  pagerNavText: { fontSize: 12, color: '#1a2540', fontWeight: '600' },

  // نموذج الإضافة/التعديل
  formCard: { backgroundColor: '#fff', borderRadius: 14, padding: 20, borderWidth: 1, borderColor: '#eef1f6' },
  formHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  formTitle: { fontSize: 18, fontWeight: '700', color: '#1a2540', textAlign: 'right' },
  formCloseBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f4f6fb' },
  label: { fontSize: 13, fontWeight: '600', color: '#1a2540', marginBottom: 6, marginTop: 12, textAlign: 'right' },
  input: { backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, borderWidth: 1, borderColor: '#e3e7ee', textAlign: 'right', color: '#1a2540' },
  textArea: { height: 90, textAlignVertical: 'top' },
  facultySelector: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  facultyOption: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e3e7ee' },
  facultyOptionActive: { backgroundColor: '#e91e63', borderColor: '#e91e63' },
  facultyOptionText: { fontSize: 13, color: '#1a2540' },
  facultyOptionTextActive: { color: '#fff', fontWeight: '600' },
  noDataText: { color: '#8a95a8', fontStyle: 'italic', padding: 12 },
  programChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  programChip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: '#e3e7ee', backgroundColor: '#fff' },
  programChipActive: { borderColor: '#1565c0', backgroundColor: '#e3f2fd' },
  programChipText: { color: '#5b6678', fontSize: 12 },
  programChipTextActive: { color: '#1565c0', fontWeight: '700' },
  formButtons: { flexDirection: 'row', marginTop: 24, gap: 12 },
  btn: { flex: 1, padding: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cancelBtn: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e3e7ee' },
  cancelBtnText: { color: '#5b6678', fontSize: 14, fontWeight: '600' },
  saveBtn: { backgroundColor: '#e91e63' },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // نافذة الحذف
  modalOverlay: { flex: 1, backgroundColor: 'rgba(20,30,55,0.45)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  deleteModalCard: { backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 400 },
  deleteModalTitle: { fontSize: 18, fontWeight: '700', color: '#1a2540', textAlign: 'center', marginBottom: 8 },
  deleteModalSub: { fontSize: 14, color: '#5b6678', textAlign: 'center', marginBottom: 8 },
  deleteModalWarn: { fontSize: 12, color: '#a8b1c2', textAlign: 'center', marginBottom: 16 },
  deleteErrorBox: { backgroundColor: '#ffebee', padding: 12, borderRadius: 8, marginBottom: 16 },
  deleteErrorText: { fontSize: 13, color: '#c62828', textAlign: 'center' },
  deleteModalCancel: { flex: 1, backgroundColor: '#f4f6fb', padding: 14, borderRadius: 10, alignItems: 'center' },
  deleteModalCancelText: { color: '#5b6678', fontWeight: '600' },
  deleteModalConfirm: { flex: 1, backgroundColor: '#f44336', padding: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  deleteModalConfirmText: { color: '#fff', fontWeight: '700' },
});
