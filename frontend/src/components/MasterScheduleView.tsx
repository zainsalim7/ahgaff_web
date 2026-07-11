import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';

// لوحة ألوان ثابتة عالية التمييز (بأسلوب aSc Timetables)
const PALETTE = [
  '#e53935', '#1e88e5', '#43a047', '#fb8c00', '#8e24aa', '#00acc1',
  '#fdd835', '#d81b60', '#5e35b1', '#00897b', '#f4511e', '#3949ab',
  '#7cb342', '#ffb300', '#c0ca33', '#6d4c41', '#039be5', '#e91e63',
  '#4caf50', '#ff7043', '#9c27b0', '#26a69a', '#ec407a', '#66bb6a',
];

function courseColor(courseId: string): string {
  let h = 0;
  for (let i = 0; i < courseId.length; i++) h = (h * 31 + courseId.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function textColorFor(bg: string): string {
  const r = parseInt(bg.slice(1, 3), 16), g = parseInt(bg.slice(3, 5), 16), b = parseInt(bg.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#1a1a1a' : '#fff';
}

function shortName(full: string): string {
  if (!full) return '';
  const parts = full.trim().split(/\s+/);
  if (parts.length <= 2) return full;
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

interface Props {
  facultyId: string;
  departmentId?: string;
}

export const MasterScheduleView = ({ facultyId, departmentId }: Props) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState<any>(null); // الخلية المحددة (entry)
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [rooms, setRooms] = useState<any[]>([]);
  const [addModal, setAddModal] = useState<{ group: any; day: string; slotNumber: number } | null>(null);
  const [addCourseId, setAddCourseId] = useState('');
  const [addRoomId, setAddRoomId] = useState('');

  const load = useCallback(async () => {
    if (!facultyId) return;
    setLoading(true);
    try {
      const params: any = { faculty_id: facultyId };
      if (departmentId) params.department_id = departmentId;
      const res = await api.get('/weekly-schedule/master-view', { params });
      setData(res.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [facultyId, departmentId]);

  useEffect(() => { setSelected(null); load(); }, [load]);

  useEffect(() => {
    if (!facultyId) return;
    api.get('/rooms', { params: { faculty_id: facultyId } })
      .then(res => setRooms(res.data || []))
      .catch(() => setRooms([]));
  }, [facultyId]);

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 6000);
  };

  const handleConflictError = (e: any) => {
    const d = e?.response?.data?.detail;
    if (d && typeof d === 'object' && d.conflicts) {
      showMsg('error', `❌ ${d.message}: ${d.conflicts.join(' • ')}`);
    } else {
      showMsg('error', typeof d === 'string' ? d : 'حدث خطأ');
    }
  };

  // نقرة على بلوك محاضرة
  const onEntryClick = async (entry: any) => {
    if (!editMode) return;
    if (!selected) { setSelected(entry); return; }
    if (selected.id === entry.id) { setSelected(null); return; }
    // تبديل
    setBusy(true);
    try {
      const res = await api.post('/weekly-schedule/swap-slots', { slot_a_id: selected.id, slot_b_id: entry.id });
      showMsg('success', `✅ ${res.data.message}`);
      setSelected(null);
      await load();
    } catch (e: any) { handleConflictError(e); }
    finally { setBusy(false); }
  };

  // نقرة على خلية فارغة: نقل المحاضرة المحددة، أو إضافة من قائمة غير المدرجة
  const onEmptyCellClick = async (group: any, day: string, slotNumber: number) => {
    if (!editMode) return;
    if (!selected) {
      const candidates = (data?.unscheduled || []).filter((u: any) =>
        u.department_id === group.department_id && u.level === group.level && u.section === group.section);
      if (candidates.length === 0) {
        showMsg('error', '⚠️ لا توجد مقررات غير مدرجة لهذه الشعبة — كل مقرراتها مكتملة في الجدول');
        return;
      }
      setAddCourseId(candidates.length === 1 ? candidates[0].course_id : '');
      setAddRoomId('');
      setAddModal({ group, day, slotNumber });
      return;
    }
    if (selected.department_id !== group.department_id || selected.level !== group.level || selected.section !== group.section) {
      showMsg('error', '⚠️ يمكن نقل المحاضرة فقط داخل صف نفس الشعبة (نفس القسم والمستوى والشعبة)');
      return;
    }
    setBusy(true);
    try {
      const res = await api.post('/weekly-schedule/move-slot', { slot_id: selected.id, target_day: day, target_slot_number: slotNumber });
      showMsg('success', `✅ ${res.data.message}`);
      setSelected(null);
      await load();
    } catch (e: any) { handleConflictError(e); }
    finally { setBusy(false); }
  };

  // تأكيد إضافة محاضرة غير مدرجة في الخلية الفارغة
  const confirmAdd = async () => {
    if (!addModal || !addCourseId) return;
    const course = (data?.unscheduled || []).find((u: any) => u.course_id === addCourseId);
    if (!course) return;
    setBusy(true);
    try {
      const res = await api.post('/weekly-schedule', {
        faculty_id: facultyId,
        department_id: addModal.group.department_id,
        level: addModal.group.level,
        section: addModal.group.section,
        day: addModal.day,
        slot_number: addModal.slotNumber,
        course_id: course.course_id,
        teacher_id: course.teacher_id,
        room_id: addRoomId,
      });
      showMsg('success', `✅ ${res.data.message}`);
      setAddModal(null);
      await load();
    } catch (e: any) { handleConflictError(e); }
    finally { setBusy(false); }
  };

  if (Platform.OS !== 'web') {
    return <View style={{ padding: 20 }}><Text style={{ textAlign: 'center', color: '#888' }}>العرض الشامل متاح على الويب فقط</Text></View>;
  }

  if (loading && !data) {
    return <View style={{ padding: 40, alignItems: 'center' }}><ActivityIndicator size="large" color="#1565c0" /></View>;
  }
  if (!data) return null;

  const { working_days = [], time_slots = [], groups = [], entries = [], unscheduled = [], can_manage } = data;

  // فهرسة: (dept|level|section|day|slot) -> entries[]
  const cellMap: Record<string, any[]> = {};
  for (const e of entries) {
    const k = `${e.department_id}|${e.level}|${e.section}|${e.day}|${e.slot_number}`;
    (cellMap[k] = cellMap[k] || []).push(e);
  }

  const groupLabel = (g: any) => `${g.department_name} · م${g.level}${g.section ? ` · ${g.section}` : ''}`;

  return (
    <View testID="master-schedule-view">
      {/* شريط الأدوات */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        {can_manage && (
          <TouchableOpacity
            onPress={() => { setEditMode(!editMode); setSelected(null); }}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8,
              borderRadius: 8, backgroundColor: editMode ? '#e65100' : '#1565c0',
            }}
            testID="master-edit-mode-btn"
          >
            <Ionicons name={editMode ? 'close-circle' : 'move'} size={15} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{editMode ? 'إنهاء وضع التحرير' : 'وضع التحرير (نقل/تبديل)'}</Text>
          </TouchableOpacity>
        )}
        {editMode && (
          <View style={{ backgroundColor: '#fff8e1', borderWidth: 1, borderColor: '#ffe082', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
            <Text style={{ fontSize: 11, color: '#e65100', fontWeight: '600' }}>
              {selected
                ? `♟️ محدد: ${selected.course_name} — انقر خلية فارغة للنقل أو محاضرة أخرى للتبديل`
                : '♟️ انقر محاضرة لتحديدها (نقل/تبديل) • أو انقر خلية فارغة لإضافة مقرر غير مدرج'}
            </Text>
          </View>
        )}
        {busy && <ActivityIndicator size="small" color="#1565c0" />}
        <View style={{ marginLeft: 'auto', backgroundColor: '#e3f2fd', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 }}>
          <Text style={{ fontSize: 12, color: '#1565c0', fontWeight: '600' }}>{groups.length} شعبة • {entries.length} محاضرة</Text>
        </View>
      </View>

      {/* رسالة نجاح/خطأ */}
      {msg && (
        <TouchableOpacity onPress={() => setMsg(null)} style={{
          backgroundColor: msg.type === 'success' ? '#e8f5e9' : '#ffebee',
          borderWidth: 1, borderColor: msg.type === 'success' ? '#a5d6a7' : '#ef9a9a',
          borderRadius: 8, padding: 10, marginBottom: 8,
        }} testID="master-msg-banner">
          <Text style={{ fontSize: 12, color: msg.type === 'success' ? '#2e7d32' : '#c62828', textAlign: 'right', fontWeight: '600' }}>{msg.text}</Text>
        </TouchableOpacity>
      )}

      {/* الجدول الشامل */}
      <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '72vh', direction: 'rtl', border: '1px solid #dde3ec', borderRadius: 10, backgroundColor: '#fff' }}>
        <table style={{ borderCollapse: 'collapse', minWidth: '100%' }}>
          <thead>
            <tr>
              <th style={{
                position: 'sticky', right: 0, top: 0, zIndex: 5, backgroundColor: '#0d2a52', color: '#fff',
                padding: '8px 10px', fontSize: 12, minWidth: 150, borderLeft: '2px solid #fff',
              }}>المستوى / الشعبة</th>
              {working_days.map((day: string) => (
                <th key={day} colSpan={time_slots.length} style={{
                  position: 'sticky', top: 0, zIndex: 3, backgroundColor: '#1565c0', color: '#fff',
                  padding: '6px 4px', fontSize: 13, fontWeight: 700, borderLeft: '2px solid #fff', textAlign: 'center',
                }}>{day}</th>
              ))}
            </tr>
            <tr>
              <th style={{
                position: 'sticky', right: 0, top: 33, zIndex: 5, backgroundColor: '#0d2a52',
                borderLeft: '2px solid #fff', padding: 2,
              }}></th>
              {working_days.map((day: string) =>
                time_slots.map((ts: any, ti: number) => (
                  <th key={`${day}-${ts.slot_number}`} style={{
                    position: 'sticky', top: 33, zIndex: 3, backgroundColor: '#3d7ede', color: '#fff',
                    padding: '3px 4px', fontSize: 10, fontWeight: 600, minWidth: 92, textAlign: 'center',
                    borderLeft: ti === time_slots.length - 1 ? '2px solid #fff' : '1px solid rgba(255,255,255,0.3)',
                  }}>
                    {ts.slot_number}<br /><span style={{ fontSize: 9, opacity: 0.85 }}>{ts.start_time}</span>
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody>
            {groups.map((g: any, gi: number) => (
              <tr key={`${g.department_id}-${g.level}-${g.section}`} style={{ backgroundColor: gi % 2 === 0 ? '#fafbfd' : '#fff' }}>
                <td style={{
                  position: 'sticky', right: 0, zIndex: 2, backgroundColor: gi % 2 === 0 ? '#eef3fa' : '#f5f8fc',
                  padding: '6px 8px', fontSize: 11, fontWeight: 700, color: '#1a2540',
                  borderBottom: '1px solid #e3e9f2', borderLeft: '2px solid #c9d4e5', whiteSpace: 'nowrap',
                }}>{groupLabel(g)}</td>
                {working_days.map((day: string) =>
                  time_slots.map((ts: any, ti: number) => {
                    const k = `${g.department_id}|${g.level}|${g.section}|${day}|${ts.slot_number}`;
                    const items = cellMap[k] || [];
                    const isEmpty = items.length === 0;
                    const canDrop = editMode && selected && isEmpty
                      && selected.department_id === g.department_id && selected.level === g.level && selected.section === g.section;
                    const canAdd = editMode && !selected && isEmpty;
                    return (
                      <td
                        key={`${day}-${ts.slot_number}`}
                        onClick={isEmpty ? () => onEmptyCellClick(g, day, ts.slot_number) : undefined}
                        data-testid={`master-cell-${gi}-${day}-${ts.slot_number}`}
                        style={{
                          padding: 2, verticalAlign: 'top', minWidth: 92, height: 34,
                          borderBottom: '1px solid #e3e9f2',
                          borderLeft: ti === time_slots.length - 1 ? '2px solid #c9d4e5' : '1px solid #eef1f6',
                          backgroundColor: canDrop ? '#e8f5e9' : undefined,
                          cursor: (canDrop || canAdd) ? 'pointer' : undefined,
                          outline: canDrop ? '2px dashed #43a047' : undefined, outlineOffset: -2,
                        }}
                      >
                        {items.map((item: any) => {
                          const bg = courseColor(item.course_id);
                          const fg = textColorFor(bg);
                          const isSel = selected?.id === item.id;
                          return (
                            <div
                              key={item.id}
                              onClick={(ev: any) => { ev.stopPropagation(); onEntryClick(item); }}
                              title={`${item.course_name}\n${item.teacher_name}\n${item.room_name}`}
                              data-testid={`master-entry-${item.id}`}
                              style={{
                                backgroundColor: bg, color: fg, borderRadius: 4, padding: '2px 4px', marginBottom: 1,
                                fontSize: 10, lineHeight: 1.25, textAlign: 'center',
                                cursor: editMode ? 'pointer' : 'default',
                                outline: isSel ? '3px solid #1a1a1a' : undefined,
                                boxShadow: isSel ? '0 0 8px rgba(0,0,0,0.5)' : undefined,
                                opacity: editMode && selected && !isSel ? 0.85 : 1,
                              }}
                            >
                              <div style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 110 }}>{item.course_name}</div>
                              <div style={{ fontSize: 8.5, opacity: 0.9, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 110 }}>
                                {shortName(item.teacher_name)}{item.room_name ? ` · ${item.room_name}` : ''}
                              </div>
                            </div>
                          );
                        })}
                      </td>
                    );
                  })
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* نافذة إضافة مقرر غير مدرج في خلية فارغة */}
      {addModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100,
          backgroundColor: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', direction: 'rtl',
        }} onClick={() => setAddModal(null)}>
          <div onClick={(ev: any) => ev.stopPropagation()} style={{
            backgroundColor: '#fff', borderRadius: 12, padding: 20, width: 440, maxWidth: '92%', maxHeight: '80vh', overflowY: 'auto',
            boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
          }} data-testid="master-add-modal">
            <div style={{ fontSize: 15, fontWeight: 800, color: '#1a2540', marginBottom: 4, textAlign: 'right' }}>➕ إضافة محاضرة غير مدرجة</div>
            <div style={{ fontSize: 12, color: '#5b6678', marginBottom: 12, textAlign: 'right' }}>
              {addModal.group.department_name} · م{addModal.group.level}{addModal.group.section ? ` · ${addModal.group.section}` : ''} — {addModal.day} · الفترة {addModal.slotNumber}
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#333', marginBottom: 6, textAlign: 'right' }}>اختر المقرر (من غير المدرجة فقط):</div>
            {(data?.unscheduled || [])
              .filter((u: any) => u.department_id === addModal.group.department_id && u.level === addModal.group.level && u.section === addModal.group.section)
              .map((u: any) => (
                <div key={u.course_id} onClick={() => setAddCourseId(u.course_id)} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, marginBottom: 5, cursor: 'pointer',
                  border: addCourseId === u.course_id ? '2px solid #1565c0' : '1px solid #e3e9f2',
                  backgroundColor: addCourseId === u.course_id ? '#e3f2fd' : '#fafbfd',
                }} data-testid={`add-course-option-${u.course_id}`}>
                  <div style={{
                    width: 12, height: 12, borderRadius: 3, backgroundColor: courseColor(u.course_id), flexShrink: 0,
                  }} />
                  <div style={{ flex: 1, textAlign: 'right' }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: '#333' }}>{u.course_name}</div>
                    <div style={{ fontSize: 10.5, color: '#777' }}>{u.teacher_name} • ناقص {u.missing} من {u.needed} أسبوعياً</div>
                  </div>
                  {addCourseId === u.course_id && <Ionicons name="checkmark-circle" size={18} color="#1565c0" />}
                </div>
              ))}
            <div style={{ fontSize: 12, fontWeight: 700, color: '#333', margin: '10px 0 6px', textAlign: 'right' }}>القاعة:</div>
            <select value={addRoomId} onChange={(ev: any) => setAddRoomId(ev.target.value)} style={{
              width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #ddd', fontSize: 13, direction: 'rtl', backgroundColor: '#f7f9fc',
            }} data-testid="add-room-select">
              <option value="">-- بدون قاعة --</option>
              {rooms.map((r: any) => <option key={r.id} value={r.id}>{r.name}{r.building ? ` (${r.building})` : ''}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={confirmAdd} disabled={!addCourseId || busy} style={{
                flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', cursor: addCourseId ? 'pointer' : 'not-allowed',
                backgroundColor: addCourseId ? '#2e7d32' : '#c8d2c9', color: '#fff', fontSize: 13.5, fontWeight: 700,
              }} data-testid="confirm-add-slot-btn">{busy ? 'جاري الإضافة...' : 'إضافة المحاضرة'}</button>
              <button onClick={() => setAddModal(null)} style={{
                flex: 0.5, padding: '10px 0', borderRadius: 8, border: '1px solid #ddd', cursor: 'pointer',
                backgroundColor: '#fff', color: '#555', fontSize: 13, fontWeight: 600,
              }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* المقررات غير المدرجة */}
      {unscheduled.length > 0 && (
        <View style={{ marginTop: 12, backgroundColor: '#fff8e1', borderWidth: 1, borderColor: '#ffe082', borderRadius: 10, padding: 12 }} testID="unscheduled-courses-section">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Ionicons name="warning" size={16} color="#e65100" />
            <Text style={{ fontSize: 13, fontWeight: '800', color: '#e65100' }}>مقررات لم تُدرج في الجدول أو مدرجة جزئياً ({unscheduled.length})</Text>
          </View>
          <div style={{ overflowX: 'auto', direction: 'rtl' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: '#fff', borderRadius: 8 }}>
              <thead>
                <tr style={{ backgroundColor: '#ffe0b2' }}>
                  {['المقرر', 'المعلم', 'القسم', 'المستوى/الشعبة', 'المطلوب أسبوعياً', 'المدرج', 'الناقص'].map(h => (
                    <th key={h} style={{ padding: '6px 8px', fontSize: 11, color: '#6d4c00', textAlign: 'right', borderBottom: '1px solid #ffcc80' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {unscheduled.map((u: any, i: number) => (
                  <tr key={`${u.course_id}-${i}`} style={{ backgroundColor: i % 2 === 0 ? '#fffdf7' : '#fff' }}>
                    <td style={{ padding: '5px 8px', fontSize: 11.5, fontWeight: 700, color: '#333', borderBottom: '1px solid #f5ead2' }}>{u.course_name}</td>
                    <td style={{ padding: '5px 8px', fontSize: 11, color: '#555', borderBottom: '1px solid #f5ead2' }}>{u.teacher_name}</td>
                    <td style={{ padding: '5px 8px', fontSize: 11, color: '#555', borderBottom: '1px solid #f5ead2' }}>{u.department_name}</td>
                    <td style={{ padding: '5px 8px', fontSize: 11, color: '#555', borderBottom: '1px solid #f5ead2' }}>م{u.level}{u.section ? ` · ${u.section}` : ''}</td>
                    <td style={{ padding: '5px 8px', fontSize: 11, color: '#555', textAlign: 'center', borderBottom: '1px solid #f5ead2' }}>{u.needed}</td>
                    <td style={{ padding: '5px 8px', fontSize: 11, color: u.scheduled > 0 ? '#2e7d32' : '#999', textAlign: 'center', fontWeight: 700, borderBottom: '1px solid #f5ead2' }}>{u.scheduled}</td>
                    <td style={{ padding: '5px 8px', fontSize: 11, color: '#c62828', textAlign: 'center', fontWeight: 800, borderBottom: '1px solid #f5ead2' }}>{u.missing}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </View>
      )}
      {unscheduled.length === 0 && entries.length > 0 && (
        <View style={{ marginTop: 12, backgroundColor: '#e8f5e9', borderWidth: 1, borderColor: '#a5d6a7', borderRadius: 10, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="checkmark-circle" size={16} color="#2e7d32" />
          <Text style={{ fontSize: 12, color: '#2e7d32', fontWeight: '700' }}>✓ جميع المقررات مدرجة بالكامل في الجدول</Text>
        </View>
      )}
    </View>
  );
};
