import { goBack } from '../src/utils/navigation';
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Platform, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { scheduleAPI, departmentsAPI, teachersAPI, coursesAPI } from '../src/services/api';
import api from '../src/services/api';

const DAYS = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];
const COLORS = ['#1565c0', '#2e7d32', '#e65100', '#6a1b9a', '#c62828', '#00838f', '#4e342e', '#37474f'];

function TeacherSearchBox({ teachers, selectedId, onSelect, placeholder }: { teachers: any[], selectedId: string, onSelect: (id: string) => void, placeholder?: string }) {
  const [query, setQuery] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const selectedName = teachers.find((t: any) => t.id === selectedId)?.full_name || '';
  const filtered = query.length > 0
    ? teachers.filter((t: any) => t.full_name?.includes(query) || t.teacher_id?.includes(query))
    : teachers;

  if (Platform.OS !== 'web') {
    return (
      <View style={{ backgroundColor: '#f5f5f5', borderRadius: 8, borderWidth: 1, borderColor: '#ddd', overflow: 'hidden' }}>
        <Picker selectedValue={selectedId} onValueChange={onSelect} style={{ height: 40 }}>
          <Picker.Item label={placeholder || '-- المعلم --'} value="" />
          {teachers.map((t: any) => <Picker.Item key={t.id} label={t.full_name} value={t.id} />)}
        </Picker>
      </View>
    );
  }

  return (
    <div style={{ position: 'relative', direction: 'rtl' }}>
      <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #ddd', borderRadius: 8, backgroundColor: '#f5f5f5' }}>
        <input
          type="text"
          value={open ? query : selectedName}
          onChange={(e: any) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder || 'ابحث عن المعلم...'}
          style={{ flex: 1, padding: '10px 12px', border: 'none', background: 'transparent', fontSize: 14, outline: 'none', textAlign: 'right' }}
        />
        {selectedId && <button onClick={() => { onSelect(''); setQuery(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 8px', color: '#e53935', fontSize: 16 }}>x</button>}
      </div>
      {open && (
        <div style={{ position: 'absolute', top: 44, left: 0, right: 0, backgroundColor: '#fff', border: '1px solid #ddd', borderRadius: 8, maxHeight: 220, overflowY: 'auto', zIndex: 1000, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
          {filtered.map((t: any) => (
            <div key={t.id} onClick={() => { onSelect(t.id); setQuery(''); setOpen(false); }}
              style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', backgroundColor: t.id === selectedId ? '#e3f2fd' : '#fff', textAlign: 'right' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#333' }}>{t.full_name}</div>
            </div>
          ))}
          {filtered.length === 0 && <div style={{ padding: 16, color: '#999', textAlign: 'center' }}>لا توجد نتائج</div>}
        </div>
      )}
      {open && <div onClick={() => setOpen(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }} />}
    </div>
  );
}

export default function WeeklySchedulePage() {
  const [activeTab, setActiveTab] = useState<'schedule' | 'rooms' | 'settings' | 'prefs'>('schedule');
  const [faculties, setFaculties] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [selectedFaculty, setSelectedFaculty] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedLevel, setSelectedLevel] = useState('');
  const [selectedSection, setSelectedSection] = useState('');
  const [viewMode, setViewMode] = useState<'section' | 'department' | 'course' | 'teacher'>('section');
  const [scheduleTeacher, setScheduleTeacher] = useState('');
  const [scheduleCourse, setScheduleCourse] = useState('');
  const [allTeachers, setAllTeachers] = useState<any[]>([]);
  const [allCourses, setAllCourses] = useState<any[]>([]);
  const [schedule, setSchedule] = useState<any[]>([]);
  const [timeSlots, setTimeSlots] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Rooms state
  const [newRoom, setNewRoom] = useState({ name: '', capacity: '30', building: '', floor: '' });
  const [importingRooms, setImportingRooms] = useState(false);
  // Settings state
  const [editSlots, setEditSlots] = useState<any[]>([]);
  const [savingSlots, setSavingSlots] = useState(false);
  // Prefs state
  const [teachers, setTeachers] = useState<any[]>([]);
  const [selectedTeacher, setSelectedTeacher] = useState('');
  const [prefs, setPrefs] = useState<any>({ unavailable_days: [], unavailable_slots: [], max_daily_lectures: 2, allow_consecutive_lectures: false });
  const [savingPrefs, setSavingPrefs] = useState(false);
  // Add slot modal
  const [showAddSlot, setShowAddSlot] = useState(false);
  const [addSlotData, setAddSlotData] = useState({ day: '', slot_number: '', course_id: '', teacher_id: '', room_id: '' });
  const [courses, setCourses] = useState<any[]>([]);

  // Load initial data
  useEffect(() => {
    (async () => {
      try {
        const [facRes, settRes] = await Promise.all([
          api.get('/faculties'),
          scheduleAPI.getSettings(),
        ]);
        setFaculties(facRes.data);
        setTimeSlots(settRes.data.time_slots || []);
        setEditSlots(settRes.data.time_slots || []);
      } catch (e) { console.error(e); }
    })();
  }, []);

  // Load departments, rooms, and settings when faculty changes
  useEffect(() => {
    if (!selectedFaculty) { setDepartments([]); setRooms([]); return; }
    (async () => {
      try {
        const [deptRes, roomRes, settRes] = await Promise.all([
          departmentsAPI.getAll(),
          scheduleAPI.getRooms(selectedFaculty),
          scheduleAPI.getSettings(selectedFaculty),
        ]);
        setDepartments(deptRes.data.filter((d: any) => d.faculty_id === selectedFaculty));
        setRooms(roomRes.data);
        setTimeSlots(settRes.data.time_slots || []);
        setEditSlots(settRes.data.time_slots || []);
      } catch (e) { console.error(e); }
    })();
  }, [selectedFaculty]);

  // Load schedule
  const loadSchedule = useCallback(async () => {
    if (!selectedFaculty) return;
    setLoading(true);
    try {
      const params: any = { faculty_id: selectedFaculty };
      if (viewMode === 'section') {
        if (selectedDept) params.department_id = selectedDept;
        if (selectedLevel) params.level = parseInt(selectedLevel);
        if (selectedSection) params.section = selectedSection;
      } else if (viewMode === 'department') {
        if (selectedDept) params.department_id = selectedDept;
      } else if (viewMode === 'course') {
        if (scheduleCourse) params.course_id = scheduleCourse;
        else { setSchedule([]); setLoading(false); return; }
      } else if (viewMode === 'teacher') {
        if (scheduleTeacher) params.teacher_id = scheduleTeacher;
        else { setSchedule([]); setLoading(false); return; }
        if (selectedDept) params.department_id = selectedDept; // قيد اختياري لجدول المعلم داخل قسم
      }
      const res = await scheduleAPI.getSchedule(params);
      setSchedule(res.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [selectedFaculty, selectedDept, selectedLevel, selectedSection, viewMode, scheduleCourse, scheduleTeacher]);

  useEffect(() => { if (selectedFaculty) loadSchedule(); }, [loadSchedule]);

  // Load teachers for prefs/add (by department)
  useEffect(() => {
    if (selectedDept) {
      (async () => {
        try {
          const [tRes, cRes] = await Promise.all([
            teachersAPI.getAll({ department_id: selectedDept }),
            coursesAPI.getAll({ department_id: selectedDept }),
          ]);
          setTeachers(tRes.data);
          setCourses(cRes.data);
        } catch {}
      })();
    }
  }, [selectedDept]);

  // Load all teachers + courses in the faculty (for schedule view modes: teacher/course)
  useEffect(() => {
    if (!selectedFaculty) { setAllTeachers([]); setAllCourses([]); return; }
    (async () => {
      try {
        const deptIds = departments.map((d: any) => d.id);
        if (!deptIds.length) return;
        // get all teachers and courses for all departments of this faculty (in parallel)
        const [tRes, cRes] = await Promise.all([
          teachersAPI.getAll({}),
          coursesAPI.getAll({}),
        ]);
        const teachersInFaculty = (tRes.data || []).filter((t: any) => deptIds.includes(t.department_id));
        const coursesInFaculty = (cRes.data || []).filter((c: any) => deptIds.includes(c.department_id));
        setAllTeachers(teachersInFaculty);
        setAllCourses(coursesInFaculty);
      } catch {}
    })();
  }, [selectedFaculty, departments]);

  // Load teacher prefs
  useEffect(() => {
    if (selectedTeacher && activeTab === 'prefs') {
      (async () => {
        try {
          const res = await scheduleAPI.getTeacherPrefs(selectedTeacher);
          setPrefs(res.data);
        } catch {}
      })();
    }
  }, [selectedTeacher, activeTab]);

  const handleGenerate = async () => {
    if (!selectedFaculty) return;
    const msg = 'هل تريد توليد الجدول تلقائياً؟\nسيتم توزيع المقررات مع مراعاة التعارضات والتفضيلات';
    if (Platform.OS === 'web' && !window.confirm(msg)) return;
    setGenerating(true);
    try {
      const res = await scheduleAPI.autoGenerate(selectedFaculty, selectedDept || undefined);
      const d = res.data;
      let resultMsg = d.message;
      if (d.errors?.length) resultMsg += '\n\nملاحظات:\n' + d.errors.join('\n');
      if (Platform.OS === 'web') window.alert(resultMsg);
      else Alert.alert('نتيجة', resultMsg);
      loadSchedule();
    } catch (e: any) {
      const err = e?.response?.data?.detail || 'حدث خطأ';
      if (Platform.OS === 'web') window.alert(err);
    } finally { setGenerating(false); }
  };

  const handleDeleteSlot = async (id: string) => {
    if (Platform.OS === 'web' && !window.confirm('حذف هذه المحاضرة من الجدول؟')) return;
    try {
      await scheduleAPI.deleteSlot(id);
      loadSchedule();
    } catch {}
  };

  const handleClearSchedule = async () => {
    if (Platform.OS === 'web' && !window.confirm('مسح الجدول بالكامل؟ لا يمكن التراجع')) return;
    try {
      const params: any = {};
      if (selectedFaculty) params.faculty_id = selectedFaculty;
      if (selectedDept) params.department_id = selectedDept;
      await scheduleAPI.clearSchedule(params);
      loadSchedule();
    } catch {}
  };

  // ============= Drafts (نسخ احتياطية للمقارنة) =============
  const [drafts, setDrafts] = useState<any[]>([]);
  const [showDraftsModal, setShowDraftsModal] = useState(false);
  const [showSaveDraftModal, setShowSaveDraftModal] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftNotes, setDraftNotes] = useState('');
  const [savingDraft, setSavingDraft] = useState(false);
  const [comparingDraft, setComparingDraft] = useState<any>(null);

  const fetchDrafts = async () => {
    try {
      const res = await api.get('/weekly-schedule/drafts');
      setDrafts(Array.isArray(res.data) ? res.data : []);
    } catch (e) { console.error(e); }
  };

  const handleSaveDraft = async () => {
    if (!draftName.trim()) {
      if (Platform.OS === 'web') window.alert('أدخل اسم النسخة');
      return;
    }
    setSavingDraft(true);
    try {
      const body: any = { name: draftName.trim(), notes: draftNotes };
      if (selectedFaculty) body.faculty_id = selectedFaculty;
      if (selectedDept) body.department_id = selectedDept;
      const res = await api.post('/weekly-schedule/drafts', body);
      if (Platform.OS === 'web') window.alert(res.data.message);
      setShowSaveDraftModal(false);
      setDraftName('');
      setDraftNotes('');
      fetchDrafts();
    } catch (e: any) {
      const err = e?.response?.data?.detail || 'فشل الحفظ';
      if (Platform.OS === 'web') window.alert(err);
    } finally { setSavingDraft(false); }
  };

  const handleRestoreDraft = async (id: string, name: string) => {
    if (Platform.OS === 'web' && !window.confirm(`استرجاع النسخة "${name}"؟\nهذا سيستبدل الجدول الحالي.`)) return;
    try {
      const res = await api.post(`/weekly-schedule/drafts/${id}/restore`);
      if (Platform.OS === 'web') window.alert(res.data.message);
      setShowDraftsModal(false);
      loadSchedule();
    } catch (e: any) {
      const err = e?.response?.data?.detail || 'فشل الاسترجاع';
      if (Platform.OS === 'web') window.alert(err);
    }
  };

  const handleDeleteDraft = async (id: string, name: string) => {
    if (Platform.OS === 'web' && !window.confirm(`حذف النسخة "${name}"؟`)) return;
    try {
      await api.delete(`/weekly-schedule/drafts/${id}`);
      fetchDrafts();
    } catch {}
  };

  const handleCompareDraft = async (id: string) => {
    try {
      const res = await api.get(`/weekly-schedule/drafts/${id}/compare`);
      setComparingDraft(res.data);
    } catch (e: any) {
      const err = e?.response?.data?.detail || 'فشل المقارنة';
      if (Platform.OS === 'web') window.alert(err);
    }
  };

  // ============= Visual Export =============
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState<'pdf' | 'excel'>('pdf');
  const [exportScope, setExportScope] = useState<'all' | 'teacher' | 'room' | 'section' | 'department'>('all');
  const [exportTeacherId, setExportTeacherId] = useState('');
  const [exportRoomId, setExportRoomId] = useState('');

  const handleExport = async () => {
    const params = new URLSearchParams();
    if (selectedFaculty) params.set('faculty_id', selectedFaculty);
    if (selectedDept) params.set('department_id', selectedDept);
    
    if (exportScope === 'teacher' && exportTeacherId) {
      params.set('teacher_id', exportTeacherId);
    } else if (exportScope === 'room' && exportRoomId) {
      params.set('room_id', exportRoomId);
    } else if (exportScope === 'section') {
      if (selectedLevel) params.set('level', selectedLevel);
      if (selectedSection) params.set('section', selectedSection);
    }
    
    const token = await (async () => {
      try {
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
        return await AsyncStorage.getItem('token');
      } catch { return null; }
    })();
    
    const url = `${process.env.EXPO_PUBLIC_BACKEND_URL || ''}/api/weekly-schedule/export-visual/${exportFormat}?${params.toString()}`;
    
    try {
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json();
        if (Platform.OS === 'web') window.alert(err.detail || 'فشل التصدير');
        return;
      }
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objUrl;
      link.download = `weekly_schedule.${exportFormat === 'pdf' ? 'pdf' : 'xlsx'}`;
      link.click();
      URL.revokeObjectURL(objUrl);
      setShowExportModal(false);
    } catch (e) {
      if (Platform.OS === 'web') window.alert('فشل التصدير');
    }
  };

  const handleAddRoom = async () => {
    if (!newRoom.name || !selectedFaculty) {
      if (Platform.OS === 'web') window.alert('اختر الكلية وأدخل اسم القاعة');
      return;
    }
    try {
      await scheduleAPI.createRoom({ ...newRoom, capacity: parseInt(newRoom.capacity) || 30, faculty_id: selectedFaculty });
      const res = await scheduleAPI.getRooms(selectedFaculty);
      setRooms(res.data);
      setNewRoom({ name: '', capacity: '30', building: '', floor: '' });
    } catch (e: any) {
      if (Platform.OS === 'web') window.alert(e?.response?.data?.detail || 'خطأ');
    }
  };

  const handleDeleteRoom = async (id: string) => {
    if (Platform.OS === 'web' && !window.confirm('حذف القاعة؟')) return;
    try {
      await scheduleAPI.deleteRoom(id);
      setRooms(prev => prev.filter(r => r.id !== id));
    } catch {}
  };

  const handleImportRooms = async (file: File) => {
    if (!selectedFaculty) return;
    setImportingRooms(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await scheduleAPI.importRooms(selectedFaculty, formData);
      const d = res.data;
      let msg = d.message;
      if (d.errors?.length) msg += '\n\n' + d.errors.join('\n');
      if (Platform.OS === 'web') window.alert(msg);
      const roomsRes = await scheduleAPI.getRooms(selectedFaculty);
      setRooms(roomsRes.data);
    } catch (e: any) {
      if (Platform.OS === 'web') window.alert(e?.response?.data?.detail || 'خطأ في الاستيراد');
    } finally {
      setImportingRooms(false);
    }
  };

  const handleSaveSlots = async () => {
    setSavingSlots(true);
    try {
      await scheduleAPI.saveTimeSlots(editSlots, selectedFaculty || undefined);
      setTimeSlots(editSlots);
      if (Platform.OS === 'web') window.alert('تم حفظ الفترات الزمنية');
    } catch {}
    finally { setSavingSlots(false); }
  };

  const handleSavePrefs = async () => {
    if (!selectedTeacher) return;
    setSavingPrefs(true);
    try {
      await scheduleAPI.saveTeacherPrefs(selectedTeacher, prefs);
      if (Platform.OS === 'web') window.alert('تم حفظ التفضيلات');
    } catch {}
    finally { setSavingPrefs(false); }
  };

  const handleAddScheduleSlot = async () => {
    if (!addSlotData.day || !addSlotData.slot_number || !addSlotData.course_id || !addSlotData.room_id) {
      if (Platform.OS === 'web') window.alert('أكمل جميع الحقول');
      return;
    }
    const course = courses.find((c: any) => c.id === addSlotData.course_id);
    try {
      await scheduleAPI.createSlot({
        faculty_id: selectedFaculty,
        department_id: selectedDept,
        level: course?.level || 1,
        section: course?.section || '',
        day: addSlotData.day,
        slot_number: parseInt(addSlotData.slot_number),
        course_id: addSlotData.course_id,
        teacher_id: addSlotData.teacher_id || course?.teacher_id || '',
        room_id: addSlotData.room_id,
      });
      setShowAddSlot(false);
      setAddSlotData({ day: '', slot_number: '', course_id: '', teacher_id: '', room_id: '' });
      loadSchedule();
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      if (detail?.conflicts) {
        if (Platform.OS === 'web') window.alert('تعارضات:\n' + detail.conflicts.join('\n'));
      } else {
        if (Platform.OS === 'web') window.alert(typeof detail === 'string' ? detail : 'حدث خطأ');
      }
    }
  };

  // Build grid: day -> slot_number -> items[]
  const grid: Record<string, Record<number, any[]>> = {};
  for (const day of DAYS) {
    grid[day] = {};
    for (const ts of timeSlots) { grid[day][ts.slot_number] = []; }
  }
  for (const s of schedule) {
    if (grid[s.day] && grid[s.day][s.slot_number]) {
      grid[s.day][s.slot_number].push(s);
    }
  }

  const TABS = [
    { key: 'schedule', label: 'الجدول', icon: 'calendar' },
    { key: 'rooms', label: 'القاعات', icon: 'business' },
    { key: 'settings', label: 'الفترات', icon: 'time' },
    { key: 'prefs', label: 'تفضيلات المعلمين', icon: 'person' },
  ];

  return (
    <SafeAreaView style={st.container} edges={['bottom']}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => goBack()}><Ionicons name="arrow-forward" size={24} color="#333" /></TouchableOpacity>
        <Text style={st.headerTitle}>الجدول الأسبوعي</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Tabs */}
      <View style={{ flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee', paddingHorizontal: 8 }}>
        {TABS.map(t => (
          <TouchableOpacity key={t.key} style={[st.tab, activeTab === t.key && st.tabActive]} onPress={() => setActiveTab(t.key as any)}>
            <Ionicons name={t.icon as any} size={16} color={activeTab === t.key ? '#fff' : '#1565c0'} />
            <Text style={[st.tabText, activeTab === t.key && st.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={{ flex: 1, padding: 12 }}>

        {/* ====== TAB: SCHEDULE ====== */}
        {activeTab === 'schedule' && (
          <>
            {/* View mode selector */}
            <View style={st.card}>
              <Text style={st.label}>نمط العرض</Text>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                {[
                  { key: 'section', label: 'بالشعبة', icon: 'layers' },
                  { key: 'department', label: 'بالقسم', icon: 'school' },
                  { key: 'course', label: 'بالمقرر', icon: 'book' },
                  { key: 'teacher', label: 'بالأستاذ', icon: 'person' },
                ].map(m => (
                  <TouchableOpacity
                    key={m.key}
                    onPress={() => setViewMode(m.key as any)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 4,
                      paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
                      backgroundColor: viewMode === m.key ? '#1565c0' : '#f0f0f0',
                    }}
                    testID={`view-mode-${m.key}`}
                  >
                    <Ionicons name={m.icon as any} size={14} color={viewMode === m.key ? '#fff' : '#333'} />
                    <Text style={{ color: viewMode === m.key ? '#fff' : '#333', fontSize: 13, fontWeight: '600' }}>{m.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Filters */}
            <View style={st.card}>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                <View style={{ flex: 1, minWidth: 150 }}>
                  <Text style={st.label}>الكلية</Text>
                  <View style={st.pickerWrap}>
                    <Picker selectedValue={selectedFaculty} onValueChange={v => { setSelectedFaculty(v); setSelectedDept(''); setScheduleTeacher(''); setScheduleCourse(''); }} style={{ height: 40 }}>
                      <Picker.Item label="-- الكلية --" value="" />
                      {faculties.map(f => <Picker.Item key={f.id} label={f.name} value={f.id} />)}
                    </Picker>
                  </View>
                </View>

                {/* Section mode: dept + level + section */}
                {viewMode === 'section' && (
                  <>
                    <View style={{ flex: 1, minWidth: 150 }}>
                      <Text style={st.label}>القسم (اختياري)</Text>
                      <View style={st.pickerWrap}>
                        <Picker selectedValue={selectedDept} onValueChange={setSelectedDept} style={{ height: 40 }}>
                          <Picker.Item label="-- الكل --" value="" />
                          {departments.map(d => <Picker.Item key={d.id} label={d.name} value={d.id} />)}
                        </Picker>
                      </View>
                    </View>
                    <View style={{ flex: 0.5, minWidth: 80 }}>
                      <Text style={st.label}>المستوى</Text>
                      <View style={st.pickerWrap}>
                        <Picker selectedValue={selectedLevel} onValueChange={setSelectedLevel} style={{ height: 40 }}>
                          <Picker.Item label="الكل" value="" />
                          {[1,2,3,4,5,6].map(l => <Picker.Item key={l} label={`م${l}`} value={String(l)} />)}
                        </Picker>
                      </View>
                    </View>
                  </>
                )}

                {/* Department mode: pick one department */}
                {viewMode === 'department' && (
                  <View style={{ flex: 2, minWidth: 200 }}>
                    <Text style={st.label}>القسم *</Text>
                    <View style={st.pickerWrap}>
                      <Picker selectedValue={selectedDept} onValueChange={setSelectedDept} style={{ height: 40 }}>
                        <Picker.Item label="-- اختر القسم --" value="" />
                        {departments.map(d => <Picker.Item key={d.id} label={d.name} value={d.id} />)}
                      </Picker>
                    </View>
                  </View>
                )}

                {/* Course mode: pick one course */}
                {viewMode === 'course' && (
                  <>
                    <View style={{ flex: 1, minWidth: 150 }}>
                      <Text style={st.label}>القسم (لتصفية المقررات)</Text>
                      <View style={st.pickerWrap}>
                        <Picker selectedValue={selectedDept} onValueChange={setSelectedDept} style={{ height: 40 }}>
                          <Picker.Item label="-- كل الأقسام --" value="" />
                          {departments.map(d => <Picker.Item key={d.id} label={d.name} value={d.id} />)}
                        </Picker>
                      </View>
                    </View>
                    <View style={{ flex: 2, minWidth: 200 }}>
                      <Text style={st.label}>المقرر *</Text>
                      <View style={st.pickerWrap}>
                        <Picker selectedValue={scheduleCourse} onValueChange={setScheduleCourse} style={{ height: 40 }}>
                          <Picker.Item label="-- اختر المقرر --" value="" />
                          {allCourses.filter((c: any) => !selectedDept || c.department_id === selectedDept).map((c: any) => (
                            <Picker.Item key={c.id} label={`${c.name}${c.section ? ` (${c.section})` : ''} - م${c.level || 1}`} value={c.id} />
                          ))}
                        </Picker>
                      </View>
                    </View>
                  </>
                )}

                {/* Teacher mode: pick one teacher (optionally dept) */}
                {viewMode === 'teacher' && (
                  <>
                    <View style={{ flex: 1, minWidth: 150 }}>
                      <Text style={st.label}>القسم (اختياري)</Text>
                      <View style={st.pickerWrap}>
                        <Picker selectedValue={selectedDept} onValueChange={setSelectedDept} style={{ height: 40 }}>
                          <Picker.Item label="-- كل الأقسام --" value="" />
                          {departments.map(d => <Picker.Item key={d.id} label={d.name} value={d.id} />)}
                        </Picker>
                      </View>
                    </View>
                    <View style={{ flex: 2, minWidth: 220 }}>
                      <Text style={st.label}>الأستاذ *</Text>
                      <TeacherSearchBox
                        teachers={allTeachers.filter((t: any) => !selectedDept || t.department_id === selectedDept)}
                        selectedId={scheduleTeacher}
                        onSelect={setScheduleTeacher}
                        placeholder="ابحث عن الأستاذ..."
                      />
                    </View>
                  </>
                )}
              </View>

              {/* Actions */}
              {selectedFaculty && (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  {viewMode === 'section' && (
                    <TouchableOpacity style={[st.btn, { backgroundColor: '#2e7d32' }]} onPress={handleGenerate} disabled={generating} testID="auto-generate-btn">
                      {generating ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="flash" size={16} color="#fff" />}
                      <Text style={st.btnText}>{generating ? 'جاري...' : 'توليد تلقائي'}</Text>
                    </TouchableOpacity>
                  )}
                  {viewMode === 'section' && selectedDept && (
                    <TouchableOpacity style={[st.btn, { backgroundColor: '#1565c0' }]} onPress={() => setShowAddSlot(true)}>
                      <Ionicons name="add" size={16} color="#fff" />
                      <Text style={st.btnText}>إضافة يدوية</Text>
                    </TouchableOpacity>
                  )}
                  {viewMode === 'section' && (
                    <TouchableOpacity style={[st.btn, { backgroundColor: '#e53935' }]} onPress={handleClearSchedule}>
                      <Ionicons name="trash" size={16} color="#fff" />
                      <Text style={st.btnText}>مسح</Text>
                    </TouchableOpacity>
                  )}
                  {/* 💾 حفظ نسخة احتياطية */}
                  {viewMode === 'section' && schedule.length > 0 && (
                    <TouchableOpacity
                      style={[st.btn, { backgroundColor: '#6a1b9a' }]}
                      onPress={() => {
                        const now = new Date();
                        setDraftName(`نسخة ${now.toLocaleDateString('ar')}-${now.getHours()}:${now.getMinutes()}`);
                        setShowSaveDraftModal(true);
                      }}
                      data-testid="save-draft-btn"
                    >
                      <Ionicons name="bookmark" size={16} color="#fff" />
                      <Text style={st.btnText}>حفظ نسخة</Text>
                    </TouchableOpacity>
                  )}
                  {/* 📂 النسخ المحفوظة */}
                  {viewMode === 'section' && (
                    <TouchableOpacity
                      style={[st.btn, { backgroundColor: '#ef6c00' }]}
                      onPress={async () => {
                        await fetchDrafts();
                        setShowDraftsModal(true);
                      }}
                      data-testid="open-drafts-btn"
                    >
                      <Ionicons name="folder-open" size={16} color="#fff" />
                      <Text style={st.btnText}>النسخ المحفوظة</Text>
                    </TouchableOpacity>
                  )}
                  {/* 📄 تصدير */}
                  {schedule.length > 0 && (
                    <TouchableOpacity
                      style={[st.btn, { backgroundColor: '#00838f' }]}
                      onPress={() => setShowExportModal(true)}
                      data-testid="export-btn"
                    >
                      <Ionicons name="download" size={16} color="#fff" />
                      <Text style={st.btnText}>تصدير</Text>
                    </TouchableOpacity>
                  )}
                  {schedule.length > 0 && (
                    <View style={{ marginLeft: 'auto', paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#e3f2fd', borderRadius: 6 }}>
                      <Text style={{ fontSize: 12, color: '#1565c0', fontWeight: '600' }}>إجمالي المحاضرات: {schedule.length}</Text>
                    </View>
                  )}
                </View>
              )}
            </View>

            {/* Add Slot Modal */}
            {showAddSlot && Platform.OS === 'web' && (
              <View style={[st.card, { borderWidth: 2, borderColor: '#1565c0' }]}>
                <Text style={[st.label, { fontSize: 15, marginBottom: 12 }]}>إضافة محاضرة يدوياً</Text>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  <View style={{ flex: 1, minWidth: 120 }}>
                    <Text style={st.miniLabel}>اليوم</Text>
                    <View style={st.pickerWrap}><Picker selectedValue={addSlotData.day} onValueChange={v => setAddSlotData(p => ({ ...p, day: v }))} style={{ height: 38 }}>
                      <Picker.Item label="--" value="" />{DAYS.map(d => <Picker.Item key={d} label={d} value={d} />)}
                    </Picker></View>
                  </View>
                  <View style={{ flex: 1, minWidth: 120 }}>
                    <Text style={st.miniLabel}>الفترة</Text>
                    <View style={st.pickerWrap}><Picker selectedValue={addSlotData.slot_number} onValueChange={v => setAddSlotData(p => ({ ...p, slot_number: v }))} style={{ height: 38 }}>
                      <Picker.Item label="--" value="" />{timeSlots.map(s => <Picker.Item key={s.slot_number} label={s.name} value={String(s.slot_number)} />)}
                    </Picker></View>
                  </View>
                  <View style={{ flex: 2, minWidth: 160 }}>
                    <Text style={st.miniLabel}>المقرر</Text>
                    <View style={st.pickerWrap}><Picker selectedValue={addSlotData.course_id} onValueChange={v => setAddSlotData(p => ({ ...p, course_id: v }))} style={{ height: 38 }}>
                      <Picker.Item label="--" value="" />{courses.map((c: any) => <Picker.Item key={c.id} label={`${c.name} (${c.code})`} value={c.id} />)}
                    </Picker></View>
                  </View>
                  <View style={{ flex: 1, minWidth: 120 }}>
                    <Text style={st.miniLabel}>القاعة</Text>
                    <View style={st.pickerWrap}><Picker selectedValue={addSlotData.room_id} onValueChange={v => setAddSlotData(p => ({ ...p, room_id: v }))} style={{ height: 38 }}>
                      <Picker.Item label="--" value="" />{rooms.map(r => <Picker.Item key={r.id} label={r.name} value={r.id} />)}
                    </Picker></View>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <TouchableOpacity style={[st.btn, { backgroundColor: '#1565c0' }]} onPress={handleAddScheduleSlot}>
                    <Text style={st.btnText}>إضافة</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[st.btn, { backgroundColor: '#666' }]} onPress={() => setShowAddSlot(false)}>
                    <Text style={st.btnText}>إلغاء</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Schedule Grid */}
            {loading ? (
              <View style={st.emptyCard}><ActivityIndicator size="large" color="#1565c0" /></View>
            ) : !selectedFaculty ? (
              <View style={st.emptyCard}><Ionicons name="calendar-outline" size={48} color="#ccc" /><Text style={st.emptyText}>اختر الكلية لعرض الجدول</Text></View>
            ) : schedule.length === 0 ? (
              <View style={st.emptyCard}><Ionicons name="calendar-outline" size={48} color="#ccc" /><Text style={st.emptyText}>لا يوجد جدول - اضغط "توليد تلقائي"</Text></View>
            ) : Platform.OS === 'web' ? (
              <div style={{ overflowX: 'auto', direction: 'rtl' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#1565c0' }}>
                      <th style={{ padding: 10, color: '#fff', fontSize: 13, fontWeight: 600, borderLeft: '1px solid rgba(255,255,255,0.2)', width: 70 }}>اليوم</th>
                      {timeSlots.map(ts => (
                        <th key={ts.slot_number} style={{ padding: 10, color: '#fff', fontSize: 12, fontWeight: 600, borderLeft: '1px solid rgba(255,255,255,0.2)', textAlign: 'center' }}>
                          {ts.name}<br/><span style={{ fontSize: 10, opacity: 0.8 }}>{ts.start_time}-{ts.end_time}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {DAYS.map((day, di) => (
                      <tr key={day} style={{ backgroundColor: di % 2 === 0 ? '#fafafa' : '#fff' }}>
                        <td style={{ padding: 10, fontWeight: 600, fontSize: 13, borderLeft: '1px solid #eee', textAlign: 'center', backgroundColor: '#f5f5f5' }}>{day}</td>
                        {timeSlots.map(ts => {
                          const items = grid[day]?.[ts.slot_number] || [];
                          return (
                            <td key={ts.slot_number} style={{ padding: 4, borderLeft: '1px solid #eee', verticalAlign: 'top', minWidth: 140 }}>
                              {items.map((item: any, idx: number) => (
                                <div key={item.id} style={{ backgroundColor: COLORS[idx % COLORS.length] + '15', border: `1px solid ${COLORS[idx % COLORS.length]}30`, borderRadius: 8, padding: 6, marginBottom: 4, position: 'relative' }}>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: '#333', textAlign: 'right' }}>{item.course_name}</div>
                                  <div style={{ fontSize: 10, color: '#666', textAlign: 'right' }}>{item.course_code}</div>
                                  <div style={{ fontSize: 10, color: '#1565c0', textAlign: 'right' }}>{item.teacher_name}</div>
                                  <div style={{ fontSize: 10, color: '#888', textAlign: 'right' }}>{item.room_name} | {item.department_name} م{item.level}{item.section ? ` ${item.section}` : ''}</div>
                                  <button onClick={() => handleDeleteSlot(item.id)} style={{ position: 'absolute', top: 2, left: 2, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#e53935' }}>x</button>
                                </div>
                              ))}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </>
        )}

        {/* ====== TAB: ROOMS ====== */}
        {activeTab === 'rooms' && (
          <>
            {/* Faculty picker for rooms */}
            <View style={st.card}>
              <Text style={st.label}>الكلية</Text>
              <View style={st.pickerWrap}>
                <Picker selectedValue={selectedFaculty} onValueChange={v => { setSelectedFaculty(v); setSelectedDept(''); }} style={{ height: 40 }}>
                  <Picker.Item label="-- اختر الكلية --" value="" />
                  {faculties.map(f => <Picker.Item key={f.id} label={f.name} value={f.id} />)}
                </Picker>
              </View>
            </View>

            {selectedFaculty && (
            <View style={st.card}>
              <Text style={[st.label, { fontSize: 15, marginBottom: 12 }]}>إضافة قاعة جديدة</Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {Platform.OS === 'web' ? (
                  <>
                    <input placeholder="اسم القاعة *" value={newRoom.name} onChange={(e: any) => setNewRoom(p => ({ ...p, name: e.target.value }))} style={{ flex: 2, padding: 10, borderRadius: 8, border: '1px solid #ddd', fontSize: 14, direction: 'rtl' }} />
                    <input placeholder="السعة" type="number" value={newRoom.capacity} onChange={(e: any) => setNewRoom(p => ({ ...p, capacity: e.target.value }))} style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid #ddd', fontSize: 14, textAlign: 'center' }} />
                    <input placeholder="المبنى" value={newRoom.building} onChange={(e: any) => setNewRoom(p => ({ ...p, building: e.target.value }))} style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid #ddd', fontSize: 14, direction: 'rtl' }} />
                    <input placeholder="الطابق" value={newRoom.floor} onChange={(e: any) => setNewRoom(p => ({ ...p, floor: e.target.value }))} style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid #ddd', fontSize: 14, direction: 'rtl' }} />
                  </>
                ) : null}
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <TouchableOpacity style={[st.btn, { backgroundColor: '#2e7d32' }]} onPress={handleAddRoom}>
                  <Ionicons name="add" size={16} color="#fff" /><Text style={st.btnText}>إضافة</Text>
                </TouchableOpacity>
                {Platform.OS === 'web' && (
                  <>
                    <TouchableOpacity
                      style={[st.btn, { backgroundColor: '#1565c0' }]}
                      onPress={async () => {
                        try {
                          const token = await (await import('@react-native-async-storage/async-storage')).default.getItem('token');
                          const res = await fetch(`${(api.defaults as any).baseURL}/rooms/template/excel`, {
                            headers: { Authorization: `Bearer ${token}` }
                          });
                          const blob = await res.blob();
                          const url = window.URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = 'rooms_template.xlsx';
                          a.click();
                          window.URL.revokeObjectURL(url);
                        } catch { if (Platform.OS === 'web') window.alert('خطأ في تحميل القالب'); }
                      }}
                    >
                      <Ionicons name="download-outline" size={16} color="#fff" />
                      <Text style={st.btnText}>تحميل القالب</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[st.btn, { backgroundColor: '#e65100', opacity: importingRooms ? 0.6 : 1 }]}
                      disabled={importingRooms}
                      onPress={() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = '.xlsx,.xls,.csv';
                        input.onchange = (e: any) => {
                          const file = e.target.files?.[0];
                          if (file) handleImportRooms(file);
                        };
                        input.click();
                      }}
                    >
                      {importingRooms ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="cloud-upload-outline" size={16} color="#fff" />}
                      <Text style={st.btnText}>{importingRooms ? 'جاري الاستيراد...' : 'استيراد Excel'}</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
            )}

            {selectedFaculty && rooms.map(r => (
              <View key={r.id} style={[st.card, { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' }]}>
                <View>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: '#333', textAlign: 'right' }}>{r.name}</Text>
                  <Text style={{ fontSize: 12, color: '#888', textAlign: 'right' }}>سعة: {r.capacity} | {r.building} {r.floor}</Text>
                </View>
                <TouchableOpacity onPress={() => handleDeleteRoom(r.id)}><Ionicons name="trash-outline" size={20} color="#e53935" /></TouchableOpacity>
              </View>
            ))}
            {selectedFaculty && rooms.length === 0 && <View style={st.emptyCard}><Text style={st.emptyText}>لا توجد قاعات لهذه الكلية</Text></View>}

            {!selectedFaculty && <View style={st.emptyCard}><Ionicons name="business-outline" size={48} color="#ccc" /><Text style={st.emptyText}>اختر الكلية لعرض قاعاتها</Text></View>}
          </>
        )}

        {/* ====== TAB: SETTINGS ====== */}
        {activeTab === 'settings' && (
          <>
            <View style={st.card}>
              <Text style={st.label}>الكلية</Text>
              <View style={st.pickerWrap}>
                <Picker selectedValue={selectedFaculty} onValueChange={v => { setSelectedFaculty(v); setSelectedDept(''); }} style={{ height: 40 }}>
                  <Picker.Item label="-- اختر الكلية (أو عام) --" value="" />
                  {faculties.map(f => <Picker.Item key={f.id} label={f.name} value={f.id} />)}
                </Picker>
              </View>
              <Text style={{ fontSize: 11, color: '#888', marginTop: 4, textAlign: 'right' }}>
                {selectedFaculty ? 'فترات خاصة بالكلية المختارة' : 'فترات عامة لكل الكليات (افتراضي)'}
              </Text>
            </View>
          <View style={st.card}>
            <Text style={[st.label, { fontSize: 15, marginBottom: 12 }]}>الفترات الزمنية</Text>
            {editSlots.map((s, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                <Text style={{ width: 30, textAlign: 'center', fontWeight: '600' }}>{s.slot_number}</Text>
                {Platform.OS === 'web' ? (
                  <>
                    <input value={s.name} onChange={(e: any) => { const ns = [...editSlots]; ns[i] = { ...ns[i], name: e.target.value }; setEditSlots(ns); }} style={{ flex: 2, padding: 8, borderRadius: 8, border: '1px solid #ddd', direction: 'rtl' }} />
                    <input type="time" value={s.start_time} onChange={(e: any) => { const ns = [...editSlots]; ns[i] = { ...ns[i], start_time: e.target.value }; setEditSlots(ns); }} style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
                    <input type="time" value={s.end_time} onChange={(e: any) => { const ns = [...editSlots]; ns[i] = { ...ns[i], end_time: e.target.value }; setEditSlots(ns); }} style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />
                    <button onClick={() => setEditSlots(prev => prev.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e53935', fontSize: 18 }}>x</button>
                  </>
                ) : null}
              </View>
            ))}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <TouchableOpacity style={[st.btn, { backgroundColor: '#1565c0' }]} onPress={() => setEditSlots(prev => [...prev, { slot_number: prev.length + 1, name: `المحاضرة ${prev.length + 1}`, start_time: '', end_time: '' }])}>
                <Text style={st.btnText}>+ فترة</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[st.btn, { backgroundColor: '#2e7d32' }]} onPress={handleSaveSlots} disabled={savingSlots}>
                <Text style={st.btnText}>{savingSlots ? 'جاري...' : 'حفظ'}</Text>
              </TouchableOpacity>
            </View>
          </View>
          </>
        )}

        {/* ====== TAB: PREFS ====== */}
        {activeTab === 'prefs' && (
          <>
            <View style={st.card}>
              <Text style={st.label}>اختر القسم ثم المعلم</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <View style={st.pickerWrap}><Picker selectedValue={selectedDept} onValueChange={setSelectedDept} style={{ height: 40 }}>
                    <Picker.Item label="-- القسم --" value="" />{departments.map(d => <Picker.Item key={d.id} label={d.name} value={d.id} />)}
                  </Picker></View>
                </View>
                <View style={{ flex: 1 }}>
                  <TeacherSearchBox teachers={teachers} selectedId={selectedTeacher} onSelect={setSelectedTeacher} placeholder="ابحث عن المعلم..." />
                </View>
              </View>
            </View>

            {selectedTeacher && (
              <View style={st.card}>
                <Text style={[st.label, { fontSize: 15, marginBottom: 12 }]}>تفضيلات المعلم</Text>

                <Text style={st.miniLabel}>أيام لا يعمل فيها</Text>
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                  {DAYS.map(day => {
                    const sel = prefs.unavailable_days?.includes(day);
                    return (
                      <TouchableOpacity key={day} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: sel ? '#e53935' : '#f0f0f0' }}
                        onPress={() => setPrefs((p: any) => ({ ...p, unavailable_days: sel ? p.unavailable_days.filter((d: string) => d !== day) : [...(p.unavailable_days || []), day] }))}>
                        <Text style={{ color: sel ? '#fff' : '#333', fontSize: 13 }}>{day}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={st.miniLabel}>فترات لا يعمل فيها</Text>
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                  {timeSlots.map(ts => {
                    const sel = prefs.unavailable_slots?.includes(ts.slot_number);
                    return (
                      <TouchableOpacity key={ts.slot_number} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: sel ? '#e53935' : '#f0f0f0' }}
                        onPress={() => setPrefs((p: any) => ({ ...p, unavailable_slots: sel ? p.unavailable_slots.filter((s: number) => s !== ts.slot_number) : [...(p.unavailable_slots || []), ts.slot_number] }))}>
                        <Text style={{ color: sel ? '#fff' : '#333', fontSize: 12 }}>{ts.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={st.miniLabel}>أقصى محاضرات يومياً (افتراضي: 2)</Text>
                {Platform.OS === 'web' ? (
                  <input type="number" min="1" max="8" value={prefs.max_daily_lectures ?? 2}
                    onChange={(e: any) => setPrefs((p: any) => ({ ...p, max_daily_lectures: parseInt(e.target.value) || 2 }))}
                    style={{ width: 80, padding: 8, borderRadius: 8, border: '1px solid #ddd', textAlign: 'center', fontSize: 14 }}
                    data-testid="max-daily-lectures-input" />
                ) : null}

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14, padding: 10, backgroundColor: '#f8f9fa', borderRadius: 8 }}>
                  <TouchableOpacity
                    onPress={() => setPrefs((p: any) => ({ ...p, allow_consecutive_lectures: !p.allow_consecutive_lectures }))}
                    style={{
                      width: 44, height: 24, borderRadius: 12,
                      backgroundColor: prefs.allow_consecutive_lectures ? '#2e7d32' : '#ccc',
                      justifyContent: 'center',
                      padding: 2,
                    }}
                    testID="consecutive-toggle"
                  >
                    <View style={{
                      width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff',
                      alignSelf: prefs.allow_consecutive_lectures ? 'flex-end' : 'flex-start',
                    }} />
                  </TouchableOpacity>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#333', textAlign: 'right' }}>السماح بمحاضرات متتالية</Text>
                    <Text style={{ fontSize: 11, color: '#888', textAlign: 'right', marginTop: 2 }}>
                      {prefs.allow_consecutive_lectures
                        ? 'يمكن جدولة محاضرتين للأستاذ في فترتين متتاليتين'
                        : 'الافتراضي: لا يُسمح بوضع محاضرتين متتاليتين (فترة بينهما)'}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity style={[st.btn, { backgroundColor: '#2e7d32', marginTop: 16 }]} onPress={handleSavePrefs} disabled={savingPrefs}>
                  <Ionicons name="save" size={16} color="#fff" />
                  <Text style={st.btnText}>{savingPrefs ? 'جاري...' : 'حفظ التفضيلات'}</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

      </ScrollView>

      {/* ============= Save Draft Modal ============= */}
      {showSaveDraftModal && Platform.OS === 'web' && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 20, width: 460, maxWidth: '95%', direction: 'rtl' }} data-testid="save-draft-modal">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Ionicons name="bookmark" size={22} color="#6a1b9a" />
              <span style={{ fontSize: 17, fontWeight: 800, color: '#222' }}>حفظ نسخة من الجدول الحالي</span>
            </div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 14, lineHeight: 1.6 }}>
              ستُحفظ نسخة كاملة من جدول الحالي. يمكنك توليد جدول آخر بإعدادات مختلفة ثم المقارنة أو الاسترجاع لاحقاً.
            </div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#444' }}>اسم النسخة *</label>
            <input type="text" value={draftName} onChange={(e: any) => setDraftName(e.target.value)} placeholder="مثال: المحاولة الأولى - الأحد بداية"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14, marginTop: 4, marginBottom: 10, boxSizing: 'border-box' }} data-testid="draft-name-input" />
            <label style={{ fontSize: 12, fontWeight: 700, color: '#444' }}>ملاحظات (اختياري)</label>
            <textarea value={draftNotes} onChange={(e: any) => setDraftNotes(e.target.value)} rows={2}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 13, marginTop: 4, marginBottom: 14, boxSizing: 'border-box', resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowSaveDraftModal(false)} disabled={savingDraft}
                style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', backgroundColor: '#f5f5f5', cursor: 'pointer', fontWeight: 700 }}>إلغاء</button>
              <button onClick={handleSaveDraft} disabled={savingDraft} data-testid="confirm-save-draft-btn"
                style={{ flex: 2, padding: '10px', borderRadius: 8, border: 'none', backgroundColor: '#6a1b9a', color: '#fff', cursor: 'pointer', fontWeight: 800 }}>
                {savingDraft ? 'جاري الحفظ...' : 'حفظ النسخة'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============= Drafts List Modal ============= */}
      {showDraftsModal && Platform.OS === 'web' && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 18, width: 600, maxWidth: '95%', maxHeight: '90vh', overflow: 'auto', direction: 'rtl' }} data-testid="drafts-modal">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Ionicons name="folder-open" size={22} color="#ef6c00" />
              <span style={{ fontSize: 17, fontWeight: 800, color: '#222', flex: 1 }}>النسخ المحفوظة من الجدول</span>
              <button onClick={() => { setShowDraftsModal(false); setComparingDraft(null); }}
                style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#888' }}>×</button>
            </div>
            {comparingDraft ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <button onClick={() => setComparingDraft(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#1565c0' }}>← العودة للقائمة</button>
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>مقارنة "{comparingDraft.draft_name}" مع الجدول الحالي:</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {[{ title: 'النسخة المحفوظة', stats: comparingDraft.draft_stats, color: '#6a1b9a' },
                    { title: 'الجدول الحالي', stats: comparingDraft.current_stats, color: '#2e7d32' }].map((box, i) => (
                    <div key={i} style={{ border: `2px solid ${box.color}`, borderRadius: 10, padding: 12 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: box.color, marginBottom: 8 }}>{box.title}</div>
                      <div style={{ fontSize: 12, lineHeight: 1.7 }}>
                        <div>📚 المحاضرات: <strong>{box.stats.total_slots}</strong></div>
                        <div>👨‍🏫 المعلمون: <strong>{box.stats.teachers_count}</strong></div>
                        <div>🏛 القاعات: <strong>{box.stats.rooms_count}</strong></div>
                        <div>📖 المقررات: <strong>{box.stats.courses_count}</strong></div>
                        <div style={{ marginTop: 6, fontSize: 11, color: '#666' }}>التوزيع اليومي:</div>
                        {Object.entries(box.stats.by_day || {}).map(([day, count]: any) => (
                          <div key={day} style={{ fontSize: 11 }}>• {day}: {count}</div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              drafts.length === 0 ? (
                <div style={{ padding: 30, textAlign: 'center', color: '#888' }}>
                  <Ionicons name="folder-open-outline" size={40} color="#ccc" />
                  <div style={{ marginTop: 10 }}>لا توجد نسخ محفوظة بعد</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>اضغط "حفظ نسخة" لإنشاء أول نسخة</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {drafts.map(d => (
                    <div key={d.id} style={{ border: '1px solid #e0e0e0', borderRadius: 10, padding: 10, backgroundColor: '#fafafa' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Ionicons name="bookmark" size={16} color="#6a1b9a" />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 800, color: '#222' }}>{d.name}</div>
                          <div style={{ fontSize: 11, color: '#777', marginTop: 2 }}>
                            {d.slots_count} محاضرة · {d.created_by_name} · {d.created_at ? new Date(d.created_at).toLocaleString('ar') : ''}
                          </div>
                          {d.notes && <div style={{ fontSize: 11, color: '#555', marginTop: 4, fontStyle: 'italic' }}>{d.notes}</div>}
                        </div>
                        <button onClick={() => handleCompareDraft(d.id)} title="مقارنة"
                          style={{ background: '#e3f2fd', border: 'none', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontSize: 11, color: '#1565c0', fontWeight: 700 }}>
                          📊 مقارنة
                        </button>
                        <button onClick={() => handleRestoreDraft(d.id, d.name)} title="استرجاع"
                          style={{ background: '#e8f5e9', border: 'none', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontSize: 11, color: '#2e7d32', fontWeight: 700 }}>
                          ↩️ استرجاع
                        </button>
                        <button onClick={() => handleDeleteDraft(d.id, d.name)} title="حذف"
                          style={{ background: '#ffebee', border: 'none', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontSize: 11, color: '#c62828', fontWeight: 700 }}>
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* ============= Export Modal ============= */}
      {showExportModal && Platform.OS === 'web' && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 20, width: 480, maxWidth: '95%', direction: 'rtl' }} data-testid="export-modal">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Ionicons name="download" size={22} color="#00838f" />
              <span style={{ fontSize: 17, fontWeight: 800, color: '#222' }}>تصدير الجدول</span>
            </div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 14 }}>اختر الصيغة ونطاق التصدير</div>

            <label style={{ fontSize: 12, fontWeight: 700, color: '#444' }}>الصيغة</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 4, marginBottom: 14 }}>
              {[{ v: 'pdf', l: '📄 PDF (طباعة)' }, { v: 'excel', l: '📊 Excel (تحرير)' }].map(o => (
                <button key={o.v} onClick={() => setExportFormat(o.v as any)}
                  style={{ flex: 1, padding: 10, borderRadius: 8, border: `2px solid ${exportFormat === o.v ? '#00838f' : '#ddd'}`, backgroundColor: exportFormat === o.v ? '#e0f2f1' : '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                  {o.l}
                </button>
              ))}
            </div>

            <label style={{ fontSize: 12, fontWeight: 700, color: '#444' }}>نطاق التصدير</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 4, marginBottom: 10 }}>
              {[
                { v: 'all', l: '📚 الجدول كاملاً' },
                { v: 'department', l: '🏛 حسب القسم' },
                { v: 'section', l: '👨‍🎓 شعبة/مستوى' },
                { v: 'teacher', l: '👨‍🏫 معلم محدد' },
                { v: 'room', l: '🏠 قاعة محددة' },
              ].map(o => (
                <button key={o.v} onClick={() => setExportScope(o.v as any)}
                  style={{ padding: 8, borderRadius: 6, border: `1.5px solid ${exportScope === o.v ? '#00838f' : '#e0e0e0'}`, backgroundColor: exportScope === o.v ? '#e0f2f1' : '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>
                  {o.l}
                </button>
              ))}
            </div>

            {exportScope === 'teacher' && (
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#444' }}>اختر المعلم</label>
                <select value={exportTeacherId} onChange={(e: any) => setExportTeacherId(e.target.value)}
                  style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ddd', fontSize: 13, marginTop: 4 }}>
                  <option value="">-- اختر --</option>
                  {allTeachers.map((t: any) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                </select>
              </div>
            )}

            {exportScope === 'room' && (
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#444' }}>اختر القاعة</label>
                <select value={exportRoomId} onChange={(e: any) => setExportRoomId(e.target.value)}
                  style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ddd', fontSize: 13, marginTop: 4 }}>
                  <option value="">-- اختر --</option>
                  {rooms.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            )}

            <div style={{ backgroundColor: '#f5f5f5', borderRadius: 8, padding: 10, marginBottom: 14, fontSize: 11, color: '#555' }}>
              💡 {exportScope === 'all' ? 'تصدير كامل الفلاتر الحالية' :
                  exportScope === 'department' ? 'سيتم التصدير حسب القسم المحدد في الفلتر' :
                  exportScope === 'section' ? `سيتم التصدير لـ م${selectedLevel || '?'} شعبة ${selectedSection || '?'}` :
                  exportScope === 'teacher' ? 'تصدير الجدول الأسبوعي لمعلم محدد فقط' :
                  'تصدير الجدول الأسبوعي لقاعة محددة فقط'}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowExportModal(false)}
                style={{ flex: 1, padding: 10, borderRadius: 8, border: 'none', backgroundColor: '#f5f5f5', cursor: 'pointer', fontWeight: 700 }}>إلغاء</button>
              <button onClick={handleExport} data-testid="confirm-export-btn"
                style={{ flex: 2, padding: 10, borderRadius: 8, border: 'none', backgroundColor: '#00838f', color: '#fff', cursor: 'pointer', fontWeight: 800 }}>
                ⬇️ تصدير الآن
              </button>
            </div>
          </div>
        </div>
      )}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#333', flex: 1, textAlign: 'center' },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 10, marginHorizontal: 2, borderRadius: 8, marginBottom: 4, marginTop: 4 },
  tabActive: { backgroundColor: '#1565c0' },
  tabText: { fontSize: 12, color: '#1565c0', fontWeight: '500' },
  tabTextActive: { color: '#fff' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 2, elevation: 1 },
  label: { fontSize: 13, fontWeight: '600', color: '#333', marginBottom: 6, textAlign: 'right' },
  miniLabel: { fontSize: 12, fontWeight: '600', color: '#666', marginBottom: 6, textAlign: 'right' },
  pickerWrap: { backgroundColor: '#f5f5f5', borderRadius: 8, borderWidth: 1, borderColor: '#ddd', overflow: 'hidden' },
  emptyCard: { backgroundColor: '#fff', borderRadius: 12, padding: 40, alignItems: 'center' },
  emptyText: { marginTop: 10, fontSize: 14, color: '#999', textAlign: 'center' },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8 },
  btnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
