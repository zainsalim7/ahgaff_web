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
  const [prefs, setPrefs] = useState<any>({ unavailable_days: [], unavailable_slots: [], max_daily_lectures: 5 });
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

  // Load departments and rooms when faculty changes
  useEffect(() => {
    if (!selectedFaculty) { setDepartments([]); setRooms([]); return; }
    (async () => {
      try {
        const [deptRes, roomRes] = await Promise.all([
          departmentsAPI.getAll(),
          scheduleAPI.getRooms(selectedFaculty),
        ]);
        setDepartments(deptRes.data.filter((d: any) => d.faculty_id === selectedFaculty));
        setRooms(roomRes.data);
      } catch (e) { console.error(e); }
    })();
  }, [selectedFaculty]);

  // Load schedule
  const loadSchedule = useCallback(async () => {
    if (!selectedFaculty) return;
    setLoading(true);
    try {
      const params: any = { faculty_id: selectedFaculty };
      if (selectedDept) params.department_id = selectedDept;
      if (selectedLevel) params.level = parseInt(selectedLevel);
      if (selectedSection) params.section = selectedSection;
      const res = await scheduleAPI.getSchedule(params);
      setSchedule(res.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [selectedFaculty, selectedDept, selectedLevel, selectedSection]);

  useEffect(() => { if (selectedFaculty) loadSchedule(); }, [loadSchedule]);

  // Load teachers for prefs/add
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
      await scheduleAPI.saveTimeSlots(editSlots);
      setTimeSlots(editSlots);
      if (Platform.OS === 'web') window.alert('تم حفظ الفترات');
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
            {/* Filters */}
            <View style={st.card}>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                <View style={{ flex: 1, minWidth: 150 }}>
                  <Text style={st.label}>الكلية</Text>
                  <View style={st.pickerWrap}>
                    <Picker selectedValue={selectedFaculty} onValueChange={v => { setSelectedFaculty(v); setSelectedDept(''); }} style={{ height: 40 }}>
                      <Picker.Item label="-- الكلية --" value="" />
                      {faculties.map(f => <Picker.Item key={f.id} label={f.name} value={f.id} />)}
                    </Picker>
                  </View>
                </View>
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
              </View>

              {/* Actions */}
              {selectedFaculty && (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  <TouchableOpacity style={[st.btn, { backgroundColor: '#2e7d32' }]} onPress={handleGenerate} disabled={generating}>
                    {generating ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="flash" size={16} color="#fff" />}
                    <Text style={st.btnText}>{generating ? 'جاري...' : 'توليد تلقائي'}</Text>
                  </TouchableOpacity>
                  {selectedDept && (
                    <TouchableOpacity style={[st.btn, { backgroundColor: '#1565c0' }]} onPress={() => setShowAddSlot(true)}>
                      <Ionicons name="add" size={16} color="#fff" />
                      <Text style={st.btnText}>إضافة يدوية</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={[st.btn, { backgroundColor: '#e53935' }]} onPress={handleClearSchedule}>
                    <Ionicons name="trash" size={16} color="#fff" />
                    <Text style={st.btnText}>مسح</Text>
                  </TouchableOpacity>
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
                    <a href={`${(api.defaults as any).baseURL}/rooms/template/excel`} target="_blank" style={{ textDecoration: 'none' }}>
                      <View style={[st.btn, { backgroundColor: '#1565c0' }]}>
                        <Ionicons name="download-outline" size={16} color="#fff" />
                        <Text style={st.btnText}>تحميل القالب</Text>
                      </View>
                    </a>
                    <TouchableOpacity
                      style={[st.btn, { backgroundColor: '#e65100', opacity: importingRooms ? 0.6 : 1 }]}
                      disabled={importingRooms}
                      onPress={() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = '.xlsx,.xls';
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

                <Text style={st.miniLabel}>أقصى محاضرات يومياً</Text>
                {Platform.OS === 'web' ? (
                  <input type="number" min="1" max="8" value={prefs.max_daily_lectures || 5}
                    onChange={(e: any) => setPrefs((p: any) => ({ ...p, max_daily_lectures: parseInt(e.target.value) || 5 }))}
                    style={{ width: 80, padding: 8, borderRadius: 8, border: '1px solid #ddd', textAlign: 'center', fontSize: 14 }} />
                ) : null}

                <TouchableOpacity style={[st.btn, { backgroundColor: '#2e7d32', marginTop: 16 }]} onPress={handleSavePrefs} disabled={savingPrefs}>
                  <Ionicons name="save" size={16} color="#fff" />
                  <Text style={st.btnText}>{savingPrefs ? 'جاري...' : 'حفظ التفضيلات'}</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

      </ScrollView>
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
