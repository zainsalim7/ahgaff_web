import { goBack } from '../src/utils/navigation';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  Platform,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/contexts/AuthContext';
import { rolesAPI, permissionsAPI } from '../src/services/api';
import { EXTRA_TASKS } from '../src/components/dashboard/DashExtraTasksGrid';
import { MENU_ITEMS } from '../src/components/SideMenu';
import { Picker } from '@react-native-picker/picker';

interface Permission {
  key: string;
  label: string;
  category: string;
}

interface Role {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  is_system: boolean;
  users_count: number;
  created_at: string;
}

// الصلاحيات الكاملة والصلاحيات الفرعية التابعة لها
// 🔑 يطابق models/permissions.py في الـ Backend بالضبط
const FULL_PERMISSION_MAPPING: Record<string, string[]> = {
  'manage_departments': ['view_departments', 'add_department', 'edit_department', 'delete_department'],
  // manage_courses تشمل المحاضرات (مدمجة كصلاحيات فرعية مخفية)
  'manage_courses': [
    'view_courses', 'add_course', 'edit_course', 'delete_course',
    'manage_lectures', 'view_lectures', 'add_lecture', 'edit_lecture', 'delete_lecture',
    'override_lecture_status', 'reschedule_lecture', 'generate_lectures',
  ],
  'manage_students': ['view_students', 'add_student', 'edit_student', 'delete_student', 'import_students'],
  'manage_teachers': ['view_teachers', 'add_teacher', 'edit_teacher', 'delete_teacher'],
  'manage_users': ['view_users', 'add_user', 'edit_user', 'delete_user', 'reset_password'],
  'manage_faculties': ['view_faculties', 'add_faculty', 'edit_faculty', 'delete_faculty'],
  'manage_lectures': [
    'view_lectures', 'add_lecture', 'edit_lecture', 'delete_lecture',
    'override_lecture_status', 'reschedule_lecture', 'generate_lectures',
  ],
  'manage_enrollments': ['view_enrollments', 'add_enrollment', 'delete_enrollment'],
  'manage_attendance': ['record_attendance', 'take_attendance', 'view_attendance', 'edit_attendance'],
  'manage_roles': ['view_roles', 'add_role', 'edit_role', 'delete_role'],
  'manage_schedule': ['view_schedule'],
};

// عند تحميل الصلاحيات، توسيع الصلاحيات الأم تلقائياً
const expandPermissions = (perms: string[]): string[] => {
  const expanded = new Set(perms);
  for (const perm of perms) {
    if (perm in FULL_PERMISSION_MAPPING) {
      FULL_PERMISSION_MAPPING[perm].forEach(sub => expanded.add(sub));
    }
  }
  return Array.from(expanded);
};

// التحقق من أن الصلاحية هي صلاحية كاملة
const isFullPermission = (permKey: string): boolean => {
  return permKey in FULL_PERMISSION_MAPPING;
};

// التحقق من أن الصلاحية فرعية
const isSubPermission = (permKey: string): string | null => {
  for (const [fullPerm, subPerms] of Object.entries(FULL_PERMISSION_MAPPING)) {
    if (subPerms.includes(permKey)) {
      return fullPerm;
    }
  }
  return null;
};

const LoadingScreen = () => (
  <View style={styles.loadingContainer}>
    <ActivityIndicator size="large" color="#1565c0" />
    <Text style={styles.loadingText}>جاري التحميل...</Text>
  </View>
);

export default function ManageRolesScreen() {
  const router = useRouter();
  const { isAdmin, isLoading: authLoading, user, hasPermission } = useAuth();
  
  const [roles, setRoles] = useState<Role[]>([]);
  const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // 🕵️ تدقيق الصلاحيات: مقارنة كل دور بالمهام/الميزات الفعلية الظاهرة له
  const [activeTab, setActiveTab] = useState<'roles' | 'audit'>('roles');
  const [auditRoleId, setAuditRoleId] = useState<string>('__admin__');
  
  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  
  // Form states
  const [roleName, setRoleName] = useState('');
  const [roleDescription, setRoleDescription] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const isMounted = useRef(true);
  const hasFetched = useRef(false);
  
  const fetchData = useCallback(async () => {
    if (hasFetched.current && roles.length > 0) return; // تجنب إعادة التحميل
    
    try {
      console.log('Fetching roles data...');
      const [rolesRes, permsRes] = await Promise.all([
        rolesAPI.getAll(),
        permissionsAPI.getAvailable(),
      ]);
      
      console.log('Roles data received:', rolesRes.data?.length);
      
      // التحقق من أن المكون لا يزال موجوداً قبل تحديث الحالة
      if (isMounted.current) {
        setRoles((rolesRes.data || []).filter((r: Role) => r.system_key !== 'admin'));
        setAllPermissions(permsRes.data.permissions || []);
        hasFetched.current = true;
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      if (isMounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [roles.length]);

  // تحميل البيانات عند أول تحميل للمكون
  useEffect(() => {
    isMounted.current = true;
    fetchData();
    
    return () => {
      isMounted.current = false;
    };
  }, []);
  
  // إعادة التحميل عند التركيز على الصفحة (للتنقل داخل التطبيق)
  useFocusEffect(
    useCallback(() => {
      // إذا لم يتم تحميل البيانات بعد، حاول مرة أخرى
      if (roles.length === 0 && !hasFetched.current) {
        fetchData();
      }
      return () => {};
    }, [fetchData, roles.length])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  const openAddModal = () => {
    setModalMode('add');
    setRoleName('');
    setRoleDescription('');
    setSelectedPermissions([]);
    setSelectedRole(null);
    setShowModal(true);
  };

  const openEditModal = (role: Role) => {
    setModalMode('edit');
    setRoleName(role.name);
    setRoleDescription(role.description);
    setSelectedPermissions(expandPermissions(role.permissions));
    setSelectedRole(role);
    setShowModal(true);
  };

  const togglePermission = (permKey: string) => {
    setSelectedPermissions(prev => {
      let newPermissions = [...prev];
      
      // إذا كانت صلاحية كاملة
      if (isFullPermission(permKey)) {
        const subPerms = FULL_PERMISSION_MAPPING[permKey];
        if (prev.includes(permKey)) {
          // إلغاء الصلاحية الكاملة = إلغاء كل الصلاحيات الفرعية
          newPermissions = newPermissions.filter(p => p !== permKey && !subPerms.includes(p));
        } else {
          // تفعيل الصلاحية الكاملة = تفعيل كل الصلاحيات الفرعية
          newPermissions.push(permKey);
          subPerms.forEach(sp => {
            if (!newPermissions.includes(sp)) {
              newPermissions.push(sp);
            }
          });
        }
      } else {
        // صلاحية عادية أو فرعية
        const parentFullPerm = isSubPermission(permKey);
        
        if (prev.includes(permKey)) {
          // إلغاء صلاحية فرعية = إلغاء الصلاحية الكاملة أيضاً
          newPermissions = newPermissions.filter(p => p !== permKey);
          if (parentFullPerm) {
            newPermissions = newPermissions.filter(p => p !== parentFullPerm);
          }
        } else {
          // تفعيل صلاحية فرعية
          newPermissions.push(permKey);
          
          // التحقق إذا تم تفعيل كل الصلاحيات الفرعية = تفعيل الكاملة تلقائياً
          if (parentFullPerm) {
            const allSubPerms = FULL_PERMISSION_MAPPING[parentFullPerm];
            const allSelected = allSubPerms.every(sp => newPermissions.includes(sp));
            if (allSelected && !newPermissions.includes(parentFullPerm)) {
              newPermissions.push(parentFullPerm);
            }
          }
        }
      }
      
      return newPermissions;
    });
  };

  // التحقق إذا كانت الصلاحية الفرعية مقفلة (لأن الكاملة مفعلة)
  const isSubPermissionLocked = (permKey: string): boolean => {
    const parentFullPerm = isSubPermission(permKey);
    if (parentFullPerm && selectedPermissions.includes(parentFullPerm)) {
      return true;
    }
    return false;
  };

  const selectAllPermissions = () => {
    if (selectedPermissions.length === allPermissions.length) {
      setSelectedPermissions([]);
    } else {
      setSelectedPermissions(allPermissions.map(p => p.key));
    }
  };

  // 🕵️ تدقيق الصلاحيات — لا نضيف أي صلاحية افتراضية هنا، فقط نعرض الواقع الحالي بدقة
  // 📋 نمزج: SideMenu (القائمة الأكمل لكل شاشات التطبيق) + مهام لوحة التحكم الإضافية غير الموجودة بالقائمة
  const auditRegistry = React.useMemo(() => {
    const fromMenu = MENU_ITEMS
      .filter((m: any) => m.path && !m.id.includes('divider'))
      .map((m: any) => ({
        id: `menu-${m.id}`,
        label: m.label,
        route: m.path,
        perms: (m.permissions && m.permissions.length > 0) ? m.permissions : undefined,
        roles: m.roles,
        adminOnly: m.adminOnly,
        teacherOnly: m.teacherOnly,
        advancedAccessSystem: !!(m.advPermissionKeys || m.advGroups),
        alwaysVisible: m.forAll || m.advancedAccessOnly || m.corrMembershipOnly,
        category: m.category === 'academic' ? 'أكاديمي' : 'إداري',
      }));
    const seenRoutes = new Set(fromMenu.map((m: any) => m.route));
    const extraOnly = (EXTRA_TASKS as any[]).filter((t) => !seenRoutes.has(t.route));
    return [...fromMenu, ...extraOnly];
  }, []);

  const auditRole = roles.find(r => r.id === auditRoleId);
  const isAuditAdmin = auditRoleId === '__admin__';
  const auditExpandedPerms = isAuditAdmin ? [] : expandPermissions(auditRole?.permissions || []);
  const auditRoleSystemKey = (auditRole as any)?.system_key || '';
  const [auditSavingId, setAuditSavingId] = useState<string>('');

  const auditFeatureStatus = (t: any): 'admin' | 'public' | 'admin_only' | 'gap' | 'granted' | 'denied' | 'role_granted' | 'role_denied' | 'teacher_only' | 'advanced_access' => {
    if (isAuditAdmin) return 'admin';
    if (t.alwaysVisible) return 'public';
    if (t.adminOnly) return 'admin_only';
    if (t.teacherOnly) return 'teacher_only';
    if (t.roles && t.roles.length > 0) return t.roles.includes(auditRoleSystemKey) ? 'role_granted' : 'role_denied';
    if ((!t.perms || t.perms.length === 0) && t.advancedAccessSystem) return 'advanced_access';
    if (!t.perms || t.perms.length === 0) return 'gap';
    return t.perms.some((p: string) => auditExpandedPerms.includes(p)) ? 'granted' : 'denied';
  };

  const auditCategoriesOrder = ['أكاديمي', 'تقارير', 'إداري', 'نظام وصيانة'];
  const auditGrouped: Record<string, any[]> = {};
  auditRegistry.forEach((t: any) => {
    const cat = t.category || 'أخرى';
    if (!auditGrouped[cat]) auditGrouped[cat] = [];
    auditGrouped[cat].push(t);
  });
  const grantedCount = auditRegistry.filter((t: any) => ['admin', 'public', 'granted', 'role_granted'].includes(auditFeatureStatus(t))).length;
  const gapFeatures = auditRegistry.filter((t: any) => auditFeatureStatus(t) === 'gap');

  // 🔁 إسناد/سحب صلاحية مباشرة من تبويب التدقيق — يستخدم نفس نقطة نهاية حفظ الأدوار الحالية بلا أي مساس بصفحة "الأدوار"
  const toggleAuditPermission = async (t: any) => {
    const status = auditFeatureStatus(t);
    if (isAuditAdmin || !auditRole) return;
    if (status !== 'granted' && status !== 'denied') {
      const reasonMap: Record<string, string> = {
        public: 'هذه ميزة عامة متاحة للجميع ولا تحتاج صلاحية.',
        admin_only: 'هذه أداة مخصّصة للمدير العام فقط ولا يمكن منحها لدور آخر.',
        teacher_only: 'هذه الشاشة خاصة بحساب المعلم نفسه وليست صلاحية قابلة للإسناد.',
        advanced_access: 'هذه الميزة تُدار عبر نظام الصلاحيات المتقدم الأحدث، وليس من هذه القائمة.',
        role_granted: 'هذه الميزة مرتبطة مباشرة باسم الدور (كود) وليست صلاحية فردية بعد.',
        role_denied: 'هذه الميزة مرتبطة مباشرة باسم الدور (كود) وليست صلاحية فردية بعد.',
        gap: 'لا توجد صلاحية فردية لهذه الميزة بعد — لا يمكن إسنادها من هنا حالياً.',
      };
      const msg = reasonMap[status] || 'لا يمكن تعديل هذه الميزة من هنا.';
      if (Platform.OS === 'web') window.alert(msg); else Alert.alert('تنبيه', msg);
      return;
    }

    const primaryPerm = t.perms[0];
    const permLabel = allPermissions.find(p => p.key === primaryPerm)?.label || primaryPerm;
    const currentPerms: string[] = auditRole.permissions || [];
    let confirmMsg = '';
    let nextPerms: string[];

    if (status === 'denied') {
      nextPerms = currentPerms.includes(primaryPerm) ? currentPerms : [...currentPerms, primaryPerm];
      confirmMsg = `منح صلاحية "${permLabel}" لدور "${auditRole.name}"؟\nستظهر ميزة "${t.label}" له فوراً.`;
    } else {
      if (!currentPerms.includes(primaryPerm)) {
        const msg = `هذه الميزة ممنوحة ضمنياً عبر صلاحية أشمل غير موجودة مباشرة في قائمة هذا الدور. لسحبها عدّل الدور من تبويب "الأدوار" حتى لا تتأثر ميزات أخرى بالخطأ.`;
        if (Platform.OS === 'web') window.alert(msg); else Alert.alert('تنبيه', msg);
        return;
      }
      const affected = auditRegistry.filter((f: any) => f.perms && f.perms.includes(primaryPerm) && f.id !== t.id && f.perms.some((p: string) => currentPerms.includes(p)) && f.perms[0] === primaryPerm);
      nextPerms = currentPerms.filter((p) => p !== primaryPerm);
      confirmMsg = `سحب صلاحية "${permLabel}" من دور "${auditRole.name}"؟\nستختفي ميزة "${t.label}" فوراً.` + (affected.length > 0 ? `\nكما ستختفي أيضاً: ${affected.map((f: any) => f.label).join('، ')}` : '');
    }

    const proceed = Platform.OS === 'web' ? window.confirm(confirmMsg) : await new Promise<boolean>((resolve) => {
      Alert.alert('تأكيد', confirmMsg, [
        { text: 'إلغاء', style: 'cancel', onPress: () => resolve(false) },
        { text: 'تأكيد', onPress: () => resolve(true) },
      ]);
    });
    if (!proceed) return;

    setAuditSavingId(t.id);
    try {
      await rolesAPI.update(auditRole.id, { permissions: nextPerms });
      hasFetched.current = false;
      setRoles([]);
      await fetchData();
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'تعذّر تحديث الصلاحية';
      if (Platform.OS === 'web') window.alert(msg); else Alert.alert('خطأ', msg);
    } finally {
      setAuditSavingId('');
    }
  };

  const handleSave = async () => {
    if (!roleName.trim()) {
      if (Platform.OS === 'web') {
        window.alert('يرجى إدخال اسم الدور');
      } else {
        Alert.alert('خطأ', 'يرجى إدخال اسم الدور');
      }
      return;
    }

    if (selectedPermissions.length === 0) {
      if (Platform.OS === 'web') {
        window.alert('يرجى اختيار صلاحية واحدة على الأقل');
      } else {
        Alert.alert('خطأ', 'يرجى اختيار صلاحية واحدة على الأقل');
      }
      return;
    }

    setSaving(true);
    try {
      if (modalMode === 'add') {
        await rolesAPI.create({
          name: roleName.trim(),
          description: roleDescription.trim(),
          permissions: selectedPermissions,
        });
      } else if (selectedRole) {
        await rolesAPI.update(selectedRole.id, {
          name: roleName.trim(),
          description: roleDescription.trim(),
          permissions: selectedPermissions,
        });
      }
      
      setShowModal(false);
      fetchData();
      
      if (Platform.OS === 'web') {
        window.alert(modalMode === 'add' ? 'تم إنشاء الدور بنجاح' : 'تم تحديث الدور بنجاح');
      } else {
        Alert.alert('نجاح', modalMode === 'add' ? 'تم إنشاء الدور بنجاح' : 'تم تحديث الدور بنجاح');
      }
    } catch (error: any) {
      const msg = error.response?.data?.detail || 'حدث خطأ';
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('خطأ', msg);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (role: Role) => {
    if (role.is_system) {
      if (Platform.OS === 'web') {
        window.alert('لا يمكن حذف دور نظامي');
      } else {
        Alert.alert('خطأ', 'لا يمكن حذف دور نظامي');
      }
      return;
    }

    if (role.users_count > 0) {
      if (Platform.OS === 'web') {
        window.alert(`لا يمكن حذف الدور، يوجد ${role.users_count} مستخدم مرتبط به`);
      } else {
        Alert.alert('خطأ', `لا يمكن حذف الدور، يوجد ${role.users_count} مستخدم مرتبط به`);
      }
      return;
    }

    const confirmDelete = async () => {
      try {
        await rolesAPI.delete(role.id);
        fetchData();
        if (Platform.OS === 'web') {
          window.alert('تم حذف الدور بنجاح');
        } else {
          Alert.alert('نجاح', 'تم حذف الدور بنجاح');
        }
      } catch (error: any) {
        const msg = error.response?.data?.detail || 'حدث خطأ';
        if (Platform.OS === 'web') {
          window.alert(msg);
        } else {
          Alert.alert('خطأ', msg);
        }
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`هل أنت متأكد من حذف الدور "${role.name}"؟`)) {
        confirmDelete();
      }
    } else {
      Alert.alert(
        'تأكيد الحذف',
        `هل أنت متأكد من حذف الدور "${role.name}"؟`,
        [
          { text: 'إلغاء', style: 'cancel' },
          { text: 'حذف', style: 'destructive', onPress: confirmDelete },
        ]
      );
    }
  };

  // Group permissions by category
  const groupedPermissions = allPermissions.reduce((acc, perm) => {
    if (!acc[perm.category]) {
      acc[perm.category] = [];
    }
    acc[perm.category].push(perm);
    return acc;
  }, {} as Record<string, Permission[]>);

  // إزالة شرط التحميل مؤقتاً للتصحيح
  // الصفحة ستعرض مباشرة وستتحدث البيانات عند وصولها

  // إذا تم تحميل الأدوار بنجاح، عرض الصفحة
  const userRole = user?.role || '';
  const canAccess = userRole === 'admin' || hasPermission('manage_roles') || roles.length > 0;
  
  if (!canAccess) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="lock-closed" size={64} color="#f44336" />
          <Text style={styles.errorText}>غير مصرح لك بالوصول لهذه الصفحة</Text>
          <Text style={styles.errorSubText}>يجب تسجيل الدخول كمدير النظام</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-forward" size={24} color="#1565c0" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>إدارة الأدوار</Text>
        <TouchableOpacity onPress={openAddModal} style={styles.addBtn} data-testid="add-role-btn">
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* 🕵️ تبويب تدقيق الصلاحيات */}
      <View style={styles.tabBar} testID="manage-roles-tab-bar">
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'roles' && styles.tabBtnActive]}
          onPress={() => setActiveTab('roles')}
          testID="manage-roles-tab-roles"
        >
          <Ionicons name="shield" size={16} color={activeTab === 'roles' ? '#fff' : '#64748b'} />
          <Text style={[styles.tabBtnText, activeTab === 'roles' && styles.tabBtnTextActive]}>الأدوار</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'audit' && styles.tabBtnActive]}
          onPress={() => setActiveTab('audit')}
          testID="manage-roles-tab-audit"
        >
          <Ionicons name="search" size={16} color={activeTab === 'audit' ? '#fff' : '#64748b'} />
          <Text style={[styles.tabBtnText, activeTab === 'audit' && styles.tabBtnTextActive]}>تدقيق الصلاحيات</Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'roles' && (
      <>
      {/* Info Card */}
      <View style={styles.infoCard}>
        <Ionicons name="information-circle" size={24} color="#1565c0" />
        <Text style={styles.infoText}>
          أنشئ أدواراً مخصصة وحدد الصلاحيات لكل دور، ثم أسند الأدوار للمستخدمين
        </Text>
      </View>

      {/* 🏢 أدوار شؤون الموظفين الجاهزة */}
      <View style={[styles.infoCard, { backgroundColor: '#f3e8ff', justifyContent: 'space-between' }]} testID="hr-presets-card">
        <View style={{ flex: 1 }}>
          <Text style={[styles.infoText, { fontWeight: '800', color: '#4c1d95' }]}>أدوار شؤون الموظفين الجاهزة</Text>
          <Text style={[styles.infoText, { fontSize: 11.5 }]}>مدير شؤون الموظفين · المدير المالي · مدير الخدمات · سكرتير المدير · الموظف العادي (مقيّدون تلقائياً بوحدتهم فقط) · أخصائي · مسؤول الحضور · مسؤول المراسلات · مراقب (اطّلاع). يمكن تعديل صلاحياتها لاحقاً.</Text>
        </View>
        <TouchableOpacity
          onPress={async () => {
            try {
              const r = await rolesAPI.createHrPresets();
              if (Platform.OS === 'web') window.alert(r.data.message); else Alert.alert('تم', r.data.message);
              hasFetched.current = false; setRoles([]); fetchData();
            } catch (e: any) {
              const msg = e?.response?.data?.detail || 'فشل إنشاء الأدوار';
              if (Platform.OS === 'web') window.alert(msg); else Alert.alert('خطأ', msg);
            }
          }}
          style={{ backgroundColor: '#6d28d9', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 }} testID="create-hr-presets-btn">
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12.5 }}>إنشاء / تحديث</Text>
        </TouchableOpacity>
      </View>

      {/* 🧩 الأدوار الإدارية الجاهزة */}
      <View style={[styles.infoCard, { backgroundColor: '#e0f2fe', justifyContent: 'space-between' }]} testID="admin-presets-card">
        <View style={{ flex: 1 }}>
          <Text style={[styles.infoText, { fontWeight: '800', color: '#0c4a6e' }]}>الأدوار الإدارية الجاهزة (صلاحيات مفصّلة لكل مهمة)</Text>
          <Text style={[styles.infoText, { fontSize: 11.5 }]}>مسؤول القبول والتسجيل · مسؤول الجداول والمحاضرات · مسؤول الاستيراد والبيانات · مدقق السجلات · مهندس نظام · مسؤول طباعة البطاقات · مسؤول المراسلات. يمكن تعديل صلاحياتها لاحقاً أو إسناد صلاحيات فردية لأي مستخدم.</Text>
        </View>
        <TouchableOpacity
          onPress={async () => {
            try {
              const r = await rolesAPI.createAdminPresets();
              if (Platform.OS === 'web') window.alert(r.data.message); else Alert.alert('تم', r.data.message);
              hasFetched.current = false; setRoles([]); fetchData();
            } catch (e: any) {
              const msg = e?.response?.data?.detail || 'فشل إنشاء الأدوار';
              if (Platform.OS === 'web') window.alert(msg); else Alert.alert('خطأ', msg);
            }
          }}
          style={{ backgroundColor: '#0369a1', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 }} testID="create-admin-presets-btn">
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12.5 }}>إنشاء / تحديث</Text>
        </TouchableOpacity>
      </View>

      {/* Roles List */}
      <ScrollView 
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {roles.map((role) => {
          // 🔒 فلترة الصلاحيات المخفية (مثل صلاحيات المحاضرات المدمجة تحت manage_courses)
          // لا تُعرض في القائمة لأنها تُمنح تلقائياً عبر الصلاحية الأم
          const visibleKeys = new Set(allPermissions.map(p => p.key));
          const visiblePerms = (role.permissions || []).filter(p => visibleKeys.has(p));

          return (
          <View key={role.id} style={styles.roleCard}>
            <View style={styles.roleHeader}>
              <View style={styles.roleInfo}>
                <View style={styles.roleTitleRow}>
                  <Ionicons 
                    name={role.is_system ? "shield-checkmark" : "shield"} 
                    size={24} 
                    color={role.is_system ? "#4caf50" : "#1565c0"} 
                  />
                  <Text style={styles.roleName}>{role.name}</Text>
                  {role.is_system && (
                    <View style={styles.systemBadge}>
                      <Text style={styles.systemBadgeText}>نظامي</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.roleDescription}>{role.description}</Text>
                <View style={styles.roleStats}>
                  <View style={styles.statItem}>
                    <Ionicons name="people" size={16} color="#666" />
                    <Text style={styles.statText}>{role.users_count} مستخدم</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Ionicons name="key" size={16} color="#666" />
                    <Text style={styles.statText}>{visiblePerms.length} صلاحية</Text>
                  </View>
                </View>
              </View>
              
              {/* أزرار التعديل - متاحة لجميع الأدوار، الحذف فقط للأدوار غير النظامية */}
              <View style={styles.roleActions}>
                <TouchableOpacity 
                  style={styles.actionBtn}
                  onPress={() => openEditModal(role)}
                  accessibilityLabel="تعديل"
                >
                  <Ionicons name="pencil" size={20} color="#1565c0" />
                </TouchableOpacity>
                {!role.is_system && (
                  <TouchableOpacity 
                    style={[styles.actionBtn, styles.deleteBtn]}
                    onPress={() => handleDelete(role)}
                    accessibilityLabel="حذف"
                  >
                    <Ionicons name="trash" size={20} color="#f44336" />
                  </TouchableOpacity>
                )}
              </View>
            </View>
            
            {/* Permissions Preview */}
            <View style={styles.permissionsPreview}>
              <Text style={styles.permissionsLabel}>الصلاحيات:</Text>
              <View style={styles.permissionsTags}>
                {visiblePerms.slice(0, 5).map((perm) => {
                  const permInfo = allPermissions.find(p => p.key === perm);
                  return (
                    <View key={perm} style={styles.permTag}>
                      <Text style={styles.permTagText}>
                        {permInfo?.label || perm}
                      </Text>
                    </View>
                  );
                })}
                {visiblePerms.length > 5 && (
                  <View style={[styles.permTag, styles.moreTag]}>
                    <Text style={styles.permTagText}>+{visiblePerms.length - 5}</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
          );
        })}

        {roles.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="folder-open-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>لا توجد أدوار</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={openAddModal}>
              <Text style={styles.emptyBtnText}>إنشاء دور جديد</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
      </>
      )}

      {activeTab === 'audit' && (
      <ScrollView style={styles.scrollView} testID="permissions-audit-panel">
        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={22} color="#1565c0" />
          <Text style={styles.infoText}>
            اختر دوراً لمعرفة الميزات الظاهرة له فعلياً مقارنةً بصلاحياته. اضغط على أي ميزة "ممنوحة"/"غير ممنوحة" لمنحها أو سحبها مباشرة — بلا أي افتراض: فقط ما مُنح صراحةً يظهر ✓.
          </Text>
        </View>

        {/* اختيار الدور — قائمة منسدلة لتفادي ازدحام عدد الأدوار الكبير */}
        <View style={styles.auditRoleDropdownWrap}>
          <Ionicons name="shield-checkmark" size={16} color="#1565c0" />
          <View style={styles.auditRoleDropdown}>
            <Picker
              selectedValue={auditRoleId}
              onValueChange={(value) => setAuditRoleId(value as string)}
              style={styles.auditRolePickerNative}
              testID="audit-role-picker"
            >
              <Picker.Item label="👑 المدير العام (admin) — وصول كامل دائماً" value="__admin__" />
              {roles.map((r) => (
                <Picker.Item key={r.id} label={r.name} value={r.id} />
              ))}
            </Picker>
          </View>
        </View>

        <View style={styles.auditSummaryCard}>
          <Text style={styles.auditSummaryText}>
            {isAuditAdmin ? 'المدير العام يملك وصولاً كاملاً دائماً لكل الميزات.' : `${grantedCount} من أصل ${auditRegistry.length} ميزة/شاشة ظاهرة لهذا الدور حالياً.`}
          </Text>
        </View>

        {gapFeatures.length > 0 && (
          <View style={styles.auditGapCard} testID="audit-gap-warning">
            <Ionicons name="warning" size={18} color="#b45309" />
            <Text style={styles.auditGapText}>
              ⚠️ {gapFeatures.length} ميزة بلا صلاحية فردية مرتبطة بها بعد: {gapFeatures.map((f: any) => f.label).join('، ')}
            </Text>
          </View>
        )}

        {auditCategoriesOrder.filter(c => auditGrouped[c]).map((cat) => (
          <View key={cat} style={styles.auditCategoryBlock}>
            <Text style={styles.auditCategoryTitle}>{cat}</Text>
            {auditGrouped[cat].map((t: any) => {
              const status = auditFeatureStatus(t);
              const statusMap: Record<string, { label: string; color: string; bg: string; icon: any }> = {
                admin: { label: 'متاحة (admin)', color: '#166534', bg: '#dcfce7', icon: 'checkmark-circle' },
                granted: { label: 'ممنوحة ✓', color: '#166534', bg: '#dcfce7', icon: 'checkmark-circle' },
                role_granted: { label: 'ممنوحة (بالدور)', color: '#166534', bg: '#dcfce7', icon: 'checkmark-circle' },
                denied: { label: 'غير ممنوحة', color: '#64748b', bg: '#f1f5f9', icon: 'close-circle-outline' },
                role_denied: { label: 'غير ممنوحة (بالدور)', color: '#64748b', bg: '#f1f5f9', icon: 'close-circle-outline' },
                public: { label: 'عامة', color: '#0369a1', bg: '#e0f2fe', icon: 'globe-outline' },
                admin_only: { label: 'للأدمن فقط', color: '#6d28d9', bg: '#ede9fe', icon: 'lock-closed' },
                teacher_only: { label: 'للمعلم فقط', color: '#0e7490', bg: '#cffafe', icon: 'school' },
                advanced_access: { label: '🧪 نظام متقدم', color: '#7c3aed', bg: '#ede9fe', icon: 'flask' },
                gap: { label: '⚠️ بلا صلاحية فردية', color: '#b45309', bg: '#fef3c7', icon: 'alert-circle' },
              };
              const s = statusMap[status];
              const isEditable = !isAuditAdmin && (status === 'granted' || status === 'denied');
              const isSaving = auditSavingId === t.id;
              return (
                <TouchableOpacity
                  key={t.id}
                  style={[styles.auditFeatureRow, isEditable && styles.auditFeatureRowEditable]}
                  onPress={() => toggleAuditPermission(t)}
                  activeOpacity={isAuditAdmin ? 1 : 0.6}
                  disabled={isSaving}
                  testID={`audit-feature-${t.id}`}
                >
                  {isSaving ? (
                    <View style={[styles.auditStatusBadge, { backgroundColor: '#f1f5f9', minWidth: 96 }]}>
                      <ActivityIndicator size="small" color="#1565c0" />
                    </View>
                  ) : (
                    <View style={[styles.auditStatusBadge, { backgroundColor: s.bg }]}>
                      <Ionicons name={s.icon} size={13} color={s.color} />
                      <Text style={[styles.auditStatusText, { color: s.color }]}>{s.label}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.auditFeatureLabel} numberOfLines={1}>{t.label}</Text>
                    <Text style={styles.auditFeatureRoute} numberOfLines={1}>{t.route}{t.perms ? ` · ${t.perms.join(' أو ')}` : ''}</Text>
                  </View>
                  {isEditable && (
                    <Ionicons name={status === 'granted' ? 'remove-circle-outline' : 'add-circle-outline'} size={18} color={status === 'granted' ? '#dc2626' : '#16a34a'} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </ScrollView>
      )}

      {/* Add/Edit Role Modal */}
      <Modal
        visible={showModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {modalMode === 'add' ? 'إنشاء دور جديد' : 'تعديل الدور'}
              </Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.inputLabel}>اسم الدور *</Text>
              <TextInput
                style={styles.input}
                value={roleName}
                onChangeText={setRoleName}
                placeholder="مثال: مشرف قسم"
                placeholderTextColor="#999"
              />

              <Text style={styles.inputLabel}>الوصف</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={roleDescription}
                onChangeText={setRoleDescription}
                placeholder="وصف مختصر للدور"
                placeholderTextColor="#999"
                multiline
                numberOfLines={3}
              />

              <View style={styles.permissionsHeader}>
                <Text style={styles.inputLabel}>الصلاحيات *</Text>
                <TouchableOpacity onPress={selectAllPermissions}>
                  <Text style={styles.selectAllText}>
                    {selectedPermissions.length === allPermissions.length ? 'إلغاء الكل' : 'تحديد الكل'}
                  </Text>
                </TouchableOpacity>
              </View>

              {Object.entries(groupedPermissions).map(([category, perms]) => (
                <View key={category} style={styles.permCategory}>
                  <Text style={styles.categoryTitle}>{category}</Text>
                  <View style={styles.permsList}>
                    {perms.map((perm) => {
                      const isLocked = isSubPermissionLocked(perm.key);
                      const isFull = isFullPermission(perm.key);
                      const isSelected = selectedPermissions.includes(perm.key);
                      
                      return (
                        <TouchableOpacity
                          key={perm.key}
                          style={[
                            styles.permItem,
                            isSelected && styles.permItemSelected,
                            isFull && styles.permItemFull,
                            isLocked && styles.permItemLocked
                          ]}
                          onPress={() => !isLocked && togglePermission(perm.key)}
                          disabled={isLocked}
                          data-testid={`perm-${perm.key}`}
                        >
                          <View style={styles.permCheckRow}>
                            <Ionicons
                              name={isLocked ? "lock-closed" : (isSelected ? "checkbox" : "square-outline")}
                              size={20}
                              color={isLocked ? "#999" : (isSelected ? "#1565c0" : "#666")}
                            />
                            <Text style={[
                              styles.permLabel,
                              isSelected && styles.permLabelSelected,
                              isFull && styles.permLabelFull,
                              isLocked && styles.permLabelLocked
                            ]}>
                              {perm.label}
                            </Text>
                          </View>
                          {isFull && (
                            <View style={styles.fullBadge}>
                              <Text style={styles.fullBadgeText}>شاملة</Text>
                            </View>
                          )}
                          {isLocked && (
                            <Text style={styles.lockedHint}>مفعّل تلقائياً</Text>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ))}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity 
                style={styles.cancelBtn}
                onPress={() => setShowModal(false)}
              >
                <Text style={styles.cancelBtnText}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.saveBtn, saving && styles.savingBtn]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.saveBtnText}>
                    {modalMode === 'add' ? 'إنشاء' : 'حفظ'}
                  </Text>
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
  tabBar: { flexDirection: 'row-reverse', gap: 8, paddingHorizontal: 16, paddingBottom: 10 },
  tabBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: '#eef1f6' },
  tabBtnActive: { backgroundColor: '#1565c0' },
  tabBtnText: { fontSize: 12.5, fontWeight: '700', color: '#64748b' },
  tabBtnTextActive: { color: '#fff' },
  auditRolePicker: { marginHorizontal: 16, marginBottom: 10, maxHeight: 42 },
  auditRoleDropdownWrap: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 10 },
  auditRoleDropdown: { flex: 1, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' },
  auditRolePickerNative: { height: 44, color: '#0f172a', textAlign: 'right' } as any,
  auditRoleChip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0' },
  auditRoleChipActive: { backgroundColor: '#1565c0', borderColor: '#1565c0' },
  auditRoleChipText: { fontSize: 12.5, fontWeight: '700', color: '#334155' },
  auditRoleChipTextActive: { color: '#fff' },
  auditSummaryCard: { marginHorizontal: 16, marginBottom: 10, backgroundColor: '#fff', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  auditSummaryText: { fontSize: 12.5, fontWeight: '700', color: '#0f172a', textAlign: 'right' },
  auditGapCard: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 10, backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a', borderRadius: 10, padding: 10 },
  auditGapText: { flex: 1, fontSize: 11.5, fontWeight: '600', color: '#92400e', textAlign: 'right' },
  auditCategoryBlock: { marginHorizontal: 16, marginBottom: 14 },
  auditCategoryTitle: { fontSize: 13, fontWeight: '800', color: '#1565c0', textAlign: 'right', marginBottom: 6 },
  auditFeatureRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 10, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: '#f1f5f9' },
  auditFeatureRowEditable: { borderColor: '#bfdbfe', borderStyle: 'dashed' },
  auditStatusBadge: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, minWidth: 96, justifyContent: 'center' },
  auditStatusText: { fontSize: 10.5, fontWeight: '700' },
  auditFeatureLabel: { fontSize: 12.5, fontWeight: '700', color: '#0f172a', textAlign: 'right' },
  auditFeatureRoute: { fontSize: 10, color: '#94a3b8', textAlign: 'right', marginTop: 1 },
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    marginTop: 16,
    fontSize: 18,
    color: '#666',
  },
  errorSubText: {
    marginTop: 8,
    fontSize: 14,
    color: '#999',
  },
  loginBtn: {
    marginTop: 20,
    backgroundColor: '#1565c0',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  loginBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backBtn: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  addBtn: {
    backgroundColor: '#1565c0',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e3f2fd',
    margin: 16,
    padding: 12,
    borderRadius: 8,
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#1565c0',
  },
  scrollView: {
    flex: 1,
    padding: 16,
    paddingTop: 0,
  },
  roleCard: {
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
  roleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  roleInfo: {
    flex: 1,
  },
  roleTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  roleName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  systemBadge: {
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  systemBadgeText: {
    fontSize: 10,
    color: '#4caf50',
    fontWeight: '600',
  },
  roleDescription: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  roleStats: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 8,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 12,
    color: '#666',
  },
  roleActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#e3f2fd',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteBtn: {
    backgroundColor: '#ffebee',
  },
  permissionsPreview: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  permissionsLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 8,
  },
  permissionsTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  permTag: {
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  moreTag: {
    backgroundColor: '#e3f2fd',
  },
  permTagText: {
    fontSize: 12,
    color: '#666',
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    marginTop: 16,
  },
  emptyBtn: {
    marginTop: 16,
    backgroundColor: '#1565c0',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  emptyBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '90%',
    maxWidth: 500,
    maxHeight: '85%',
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
    maxHeight: 400,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
    textAlign: 'right',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  permissionsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  selectAllText: {
    fontSize: 14,
    color: '#1565c0',
  },
  permCategory: {
    marginBottom: 16,
  },
  categoryTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1565c0',
    backgroundColor: '#e3f2fd',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 8,
  },
  permsList: {
    gap: 4,
  },
  permItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
  },
  permItemSelected: {
    backgroundColor: '#e3f2fd',
  },
  permItemFull: {
    backgroundColor: '#fff3e0',
    borderWidth: 1,
    borderColor: '#ff9800',
  },
  permItemLocked: {
    backgroundColor: '#f5f5f5',
    opacity: 0.8,
  },
  permCheckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  permLabel: {
    fontSize: 14,
    color: '#333',
  },
  permLabelSelected: {
    color: '#1565c0',
    fontWeight: '500',
  },
  permLabelFull: {
    fontWeight: '600',
    color: '#e65100',
  },
  permLabelLocked: {
    color: '#999',
  },
  fullBadge: {
    backgroundColor: '#ff9800',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  fullBadgeText: {
    fontSize: 10,
    color: '#fff',
    fontWeight: '600',
  },
  lockedHint: {
    fontSize: 10,
    color: '#999',
    fontStyle: 'italic',
  },
  permItemText: {
    fontSize: 14,
    color: '#666',
  },
  permItemTextSelected: {
    color: '#1565c0',
    fontWeight: '600',
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  cancelBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
  },
  cancelBtnText: {
    fontSize: 14,
    color: '#666',
  },
  saveBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#1565c0',
    minWidth: 100,
    alignItems: 'center',
  },
  savingBtn: {
    opacity: 0.7,
  },
  saveBtnText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
  },
});
