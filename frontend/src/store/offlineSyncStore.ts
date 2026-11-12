import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import api, { attendanceAPI } from '../services/api';

// أنواع البيانات للعمل أوفلاين
export interface OfflineAttendanceRecord {
  local_id: string;
  lecture_id: string;
  course_id: string;
  student_id: string;
  student_name?: string;
  status: 'present' | 'absent' | 'late' | 'excused';
  method: string;
  timestamp: string;
  synced: boolean;
  sync_error?: string;
  permanently_rejected?: boolean;
}

export interface OfflineLecture {
  id: string;
  course_id: string;
  course_name: string;
  date: string;
  start_time: string;
  end_time: string;
  room?: string;
  attendance_recorded?: boolean;
  students: OfflineStudent[];
  cached_at: string;
}

export interface OfflineStudent {
  id: string;
  student_id: string;
  full_name: string;
  qr_code?: string;
  attendance_status?: string | null;
}

export interface OfflineSyncState {
  // حالة الاتصال
  isOnline: boolean;
  lastOnlineTime: string | null;
  
  // سجلات الحضور المعلقة
  pendingRecords: OfflineAttendanceRecord[];
  
  // البيانات المخزنة مؤقتاً
  cachedLectures: OfflineLecture[];
  cachedStudents: Record<string, OfflineStudent[]>; // course_id -> students
  
  // حالة المزامنة
  isSyncing: boolean;
  lastSyncTime: string | null;
  syncErrors: string[];
  
  // الإجراءات
  setOnlineStatus: (status: boolean) => void;
  
  // إدارة الحضور أوفلاين — timestamp اختياري: إن مُرِّر (مثلاً وقت فتح شاشة المحاضرة) يُعتمَد بدل وقت الحفظ الفعلي،
  // لأن الفاصل بين فتح الشاشة (وقت المحاضرة الحقيقي) وضغط "حفظ" (قد يتأخر لو عُلِّق التطبيق بالخلفية) لا يعكس وقت الحضور الفعلي
  addAttendanceRecord: (record: Omit<OfflineAttendanceRecord, 'local_id' | 'synced'> & { timestamp?: string }) => Promise<void>;
  // نسخة دفعية: تضيف كل السجلات بـ set() واحد ثم تُزامن مرة واحدة فقط — تمنع مزامنة جزئية (سجل واحد فقط) عند
  // استدعاء addAttendanceRecord في حلقة متتالية لعشرات الطلاب (كل استدعاء كان يُطلق مزامنة منفصلة تتسابق مع الباقي)
  addAttendanceRecords: (records: Array<Omit<OfflineAttendanceRecord, 'local_id' | 'synced'> & { timestamp?: string }>) => Promise<void>;
  getPendingRecordsCount: () => number;
  
  // التخزين المؤقت
  cacheLecture: (lecture: OfflineLecture) => Promise<void>;
  cacheStudents: (courseId: string, students: OfflineStudent[]) => Promise<void>;
  getCachedLecture: (lectureId: string) => OfflineLecture | undefined;
  getCachedStudents: (courseId: string) => OfflineStudent[];
  
  // المزامنة
  syncPendingRecords: (force?: boolean) => Promise<{ success: number; failed: number }>;
  verifyConnection: () => Promise<boolean>;
  
  // التحميل والحفظ
  loadFromStorage: () => Promise<void>;
  saveToStorage: () => Promise<void>;
  clearAllData: () => Promise<void>;
  
  // بدء مراقبة الاتصال
  startNetworkMonitoring: () => () => void;
}

const STORAGE_KEYS = {
  PENDING_RECORDS: 'offline_pending_records',
  CACHED_LECTURES: 'offline_cached_lectures',
  CACHED_STUDENTS: 'offline_cached_students',
  LAST_SYNC: 'offline_last_sync',
};

export const useOfflineSyncStore = create<OfflineSyncState>((set, get) => ({
  // الحالة الأولية
  isOnline: true,
  lastOnlineTime: null,
  pendingRecords: [],
  cachedLectures: [],
  cachedStudents: {},
  isSyncing: false,
  lastSyncTime: null,
  syncErrors: [],
  
  // تحديث حالة الاتصال
  setOnlineStatus: (status: boolean) => {
    const currentStatus = get().isOnline;
    set({ 
      isOnline: status,
      lastOnlineTime: status ? new Date().toISOString() : get().lastOnlineTime
    });
    
    // إذا عاد الاتصال، حاول المزامنة
    if (status && !currentStatus) {
      console.log('🌐 الاتصال عاد - بدء المزامنة التلقائية...');
      get().syncPendingRecords();
    }
  },
  
  // إضافة سجل حضور أوفلاين
  addAttendanceRecord: async (record) => {
    const newRecord: OfflineAttendanceRecord = {
      ...record,
      local_id: `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: record.timestamp || new Date().toISOString(),
      synced: false,
    };
    
    const current = get().pendingRecords;
    
    // تحقق من عدم وجود تكرار
    const exists = current.some(
      r => r.lecture_id === record.lecture_id && r.student_id === record.student_id && !r.synced
    );
    
    if (exists) {
      // تحديث السجل الموجود
      const updated = current.map(r => 
        (r.lecture_id === record.lecture_id && r.student_id === record.student_id && !r.synced)
          ? { ...r, status: record.status, timestamp: newRecord.timestamp }
          : r
      );
      set({ pendingRecords: updated });
    } else {
      set({ pendingRecords: [...current, newRecord] });
    }
    
    await get().saveToStorage();
    console.log(`📝 تم حفظ سجل حضور أوفلاين: ${record.student_name || record.student_id}`);
    
    // إذا كان متصل، حاول المزامنة فوراً
    if (get().isOnline) {
      get().syncPendingRecords();
    }
  },

  // إضافة عدة سجلات دفعة واحدة ثم مزامنة واحدة فقط بعد اكتمالها جميعاً
  addAttendanceRecords: async (records) => {
    if (records.length === 0) return;
    const current = get().pendingRecords;
    let updated = [...current];
    
    records.forEach(record => {
      const newRecord: OfflineAttendanceRecord = {
        ...record,
        local_id: `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: record.timestamp || new Date().toISOString(),
        synced: false,
      };
      const existsIdx = updated.findIndex(
        r => r.lecture_id === record.lecture_id && r.student_id === record.student_id && !r.synced
      );
      if (existsIdx !== -1) {
        updated[existsIdx] = { ...updated[existsIdx], status: record.status, timestamp: newRecord.timestamp };
      } else {
        updated = [...updated, newRecord];
      }
    });
    
    set({ pendingRecords: updated });
    await get().saveToStorage();
    console.log(`📝 تم حفظ ${records.length} سجل حضور أوفلاين دفعة واحدة`);
    
    if (get().isOnline) {
      get().syncPendingRecords();
    }
  },
  
  // عدد السجلات المعلقة
  getPendingRecordsCount: () => {
    return get().pendingRecords.filter(r => !r.synced).length;
  },
  
  // تخزين محاضرة مؤقتاً
  cacheLecture: async (lecture) => {
    const current = get().cachedLectures;
    const filtered = current.filter(l => l.id !== lecture.id);
    const updated = [...filtered, { ...lecture, cached_at: new Date().toISOString() }];
    
    // احتفظ بآخر 50 محاضرة فقط
    const limited = updated.slice(-50);
    set({ cachedLectures: limited });
    await get().saveToStorage();
  },
  
  // تخزين طلاب مقرر مؤقتاً
  cacheStudents: async (courseId, students) => {
    const current = get().cachedStudents;
    set({ cachedStudents: { ...current, [courseId]: students } });
    await get().saveToStorage();
  },
  
  // جلب محاضرة مخزنة
  getCachedLecture: (lectureId) => {
    return get().cachedLectures.find(l => l.id === lectureId);
  },
  
  // جلب طلاب مقرر مخزنين
  getCachedStudents: (courseId) => {
    return get().cachedStudents[courseId] || [];
  },
  
  // مزامنة السجلات المعلقة (force = تجاوز مؤشر الاتصال إن كان عالقاً)
  syncPendingRecords: async (force = false) => {
    const state = get();
    
    if ((!state.isOnline && !force) || state.isSyncing) {
      return { success: 0, failed: 0 };
    }
    
    const pending = state.pendingRecords.filter(r => !r.synced);
    if (pending.length === 0) {
      return { success: 0, failed: 0 };
    }
    
    set({ isSyncing: true, syncErrors: [] });
    console.log(`🔄 بدء مزامنة ${pending.length} سجل...`);
    
    let success = 0;
    let failed = 0;
    const errors: string[] = [];
    const updatedRecords = [...state.pendingRecords];
    
    // تجميع السجلات حسب المحاضرة
    const byLecture: Record<string, OfflineAttendanceRecord[]> = {};
    pending.forEach(record => {
      if (!byLecture[record.lecture_id]) {
        byLecture[record.lecture_id] = [];
      }
      byLecture[record.lecture_id].push(record);
    });
    
    // مزامنة كل محاضرة
    for (const [lectureId, records] of Object.entries(byLecture)) {
      try {
        // إرسال جميع سجلات المحاضرة دفعة واحدة
        // إرسال وقت التسجيل الأوفلاين الأصلي للتحقق من فترة السماح
        const earliestTimestamp = records.reduce((earliest, r) => {
          return !earliest || r.timestamp < earliest ? r.timestamp : earliest;
        }, '' as string);
        
        await attendanceAPI.recordSession({
          lecture_id: lectureId,
          notes: 'مزامنة من الأوفلاين',
          offline_recorded_at: earliestTimestamp || undefined,
          records: records.map(r => ({
            student_id: r.student_id,
            status: r.status,
          })),
        });
        
        // تحديث السجلات كمتزامنة
        records.forEach(record => {
          const idx = updatedRecords.findIndex(r => r.local_id === record.local_id);
          if (idx !== -1) {
            updatedRecords[idx] = { ...updatedRecords[idx], synced: true };
          }
        });
        
        success += records.length;
        console.log(`✅ تمت مزامنة ${records.length} سجل للمحاضرة ${lectureId}`);
      } catch (error: any) {
        failed += records.length;
        const errorMsg = error.response?.data?.detail || error.message || 'خطأ غير معروف';
        errors.push(`محاضرة ${lectureId}: ${errorMsg}`);
        
        // 🔒 رفض نهائي من الخادم (400 — مثل "خارج نافذة المحاضرة"/"أقدم من الحد الأقصى"/"وقت مستقبلي") لن ينجح
        // مهما أُعيدت المحاولة لاحقاً — يجب التوقف عنه نهائياً، وإلا يبقى يتكرر في كل مزامنة للأبد (مثل "زومبي")
        // ويُنشئ سجل فشل جديد في كل مرة رغم أن البيانات نفسها لم ولن تتغيّر. أخطاء الشبكة (بلا response، أو 5xx)
        // تبقى تُعاد محاولتها كالمعتاد لأنها قد تنجح لاحقاً فعلاً.
        const isPermanentRejection = error.response?.status === 400;
        records.forEach(record => {
          const idx = updatedRecords.findIndex(r => r.local_id === record.local_id);
          if (idx !== -1) {
            updatedRecords[idx] = isPermanentRejection
              ? { ...updatedRecords[idx], synced: true, permanently_rejected: true, sync_error: errorMsg }
              : { ...updatedRecords[idx], sync_error: errorMsg };
          }
        });
        
        console.error(`❌ فشل مزامنة المحاضرة ${lectureId}:`, errorMsg, isPermanentRejection ? '(رفض نهائي — لن تُعاد المحاولة)' : '');
      }
    }
    
    // 🔒 ندمج نتائج المزامنة في أحدث نسخة من pendingRecords (وليس في اللقطة الأولية state.pendingRecords)
    // لأن addAttendanceRecord قد يضيف سجلات جديدة بالتوازي أثناء انتظار هذه الدالة لطلبات الشبكة،
    // والاعتماد على اللقطة القديمة كان يحذف تلك الإضافات الجديدة عند الكتابة النهائية (سباق/race condition)
    const resultsByLocalId = new Map(updatedRecords.map(r => [r.local_id, r]));
    const latestRecords = get().pendingRecords;
    const mergedRecords = latestRecords.map(r => resultsByLocalId.get(r.local_id) || r);
    const mergedIds = new Set(mergedRecords.map(r => r.local_id));
    updatedRecords.forEach(r => { if (!mergedIds.has(r.local_id)) mergedRecords.push(r); });
    
    // حذف السجلات المتزامنة القديمة (أكثر من 7 أيام)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const cleanedRecords = mergedRecords.filter(
      r => !r.synced || r.timestamp > sevenDaysAgo
    );
    
    set({ 
      pendingRecords: cleanedRecords,
      isSyncing: false,
      lastSyncTime: new Date().toISOString(),
      syncErrors: errors,
    });
    
    // نجاح أي إرسال يعني أن الاتصال يعمل فعلاً — صحح المؤشر إن كان عالقاً
    if (success > 0 && !get().isOnline) {
      set({ isOnline: true, lastOnlineTime: new Date().toISOString() });
    }
    
    await get().saveToStorage();
    
    console.log(`📊 نتيجة المزامنة: ${success} نجاح، ${failed} فشل`);
    return { success, failed };
  },
  
  // تحميل من التخزين
  loadFromStorage: async () => {
    try {
      const [pendingStr, lecturesStr, studentsStr, lastSync] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.PENDING_RECORDS),
        AsyncStorage.getItem(STORAGE_KEYS.CACHED_LECTURES),
        AsyncStorage.getItem(STORAGE_KEYS.CACHED_STUDENTS),
        AsyncStorage.getItem(STORAGE_KEYS.LAST_SYNC),
      ]);
      
      set({
        pendingRecords: pendingStr ? JSON.parse(pendingStr) : [],
        cachedLectures: lecturesStr ? JSON.parse(lecturesStr) : [],
        cachedStudents: studentsStr ? JSON.parse(studentsStr) : {},
        lastSyncTime: lastSync,
      });
      
      console.log('📂 تم تحميل البيانات المخزنة');
    } catch (error) {
      console.error('خطأ في تحميل البيانات:', error);
    }
  },
  
  // حفظ في التخزين
  saveToStorage: async () => {
    try {
      const state = get();
      await Promise.all([
        AsyncStorage.setItem(STORAGE_KEYS.PENDING_RECORDS, JSON.stringify(state.pendingRecords)),
        AsyncStorage.setItem(STORAGE_KEYS.CACHED_LECTURES, JSON.stringify(state.cachedLectures)),
        AsyncStorage.setItem(STORAGE_KEYS.CACHED_STUDENTS, JSON.stringify(state.cachedStudents)),
        state.lastSyncTime && AsyncStorage.setItem(STORAGE_KEYS.LAST_SYNC, state.lastSyncTime),
      ]);
    } catch (error) {
      console.error('خطأ في حفظ البيانات:', error);
    }
  },
  
  // مسح جميع البيانات
  clearAllData: async () => {
    await Promise.all([
      AsyncStorage.removeItem(STORAGE_KEYS.PENDING_RECORDS),
      AsyncStorage.removeItem(STORAGE_KEYS.CACHED_LECTURES),
      AsyncStorage.removeItem(STORAGE_KEYS.CACHED_STUDENTS),
      AsyncStorage.removeItem(STORAGE_KEYS.LAST_SYNC),
    ]);
    
    set({
      pendingRecords: [],
      cachedLectures: [],
      cachedStudents: {},
      lastSyncTime: null,
      syncErrors: [],
    });
  },
  
  // 🔍 فحص اتصال حقيقي بالسيرفر — NetInfo قد يعلق على "غير متصل" خطأً
  verifyConnection: async () => {
    try {
      await api.get('/', { timeout: 8000 });
      get().setOnlineStatus(true);
      return true;
    } catch (error: any) {
      if (error?.response) {
        // السيرفر ردّ (ولو بخطأ) => الاتصال موجود
        get().setOnlineStatus(true);
        return true;
      }
      get().setOnlineStatus(false);
      return false;
    }
  },
  
  // بدء مراقبة الاتصال
  startNetworkMonitoring: () => {
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const isConnected = state.isConnected ?? false;
      if (isConnected) {
        get().setOnlineStatus(true);
      } else {
        // لا نثق بـ NetInfo وحده: نتحقق بطلب حقيقي قبل إعلان عدم الاتصال
        get().verifyConnection();
      }
    });
    
    // فحص أولي
    NetInfo.fetch().then((state: NetInfoState) => {
      const isConnected = state.isConnected ?? false;
      if (isConnected) get().setOnlineStatus(true);
      else get().verifyConnection();
    });
    
    return unsubscribe;
  },
}));
