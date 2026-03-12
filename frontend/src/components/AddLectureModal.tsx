import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Modal,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { settingsAPI } from '../services/api';

interface Course {
  id: string;
  name: string;
}

interface AddLectureModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (data: LectureFormData) => Promise<void>;
  courses?: Course[];
  selectedCourseId?: string;
  showCourseSelector?: boolean;
  title?: string;
}

export interface LectureFormData {
  course_id?: string;
  date: string;
  start_time: string;
  end_time: string;
  room: string;
  notes?: string;
}

const DAYS = [
  { id: 'saturday', name: 'السبت', num: 6 },
  { id: 'sunday', name: 'الأحد', num: 0 },
  { id: 'monday', name: 'الإثنين', num: 1 },
  { id: 'tuesday', name: 'الثلاثاء', num: 2 },
  { id: 'wednesday', name: 'الأربعاء', num: 3 },
  { id: 'thursday', name: 'الخميس', num: 4 },
  { id: 'friday', name: 'الجمعة', num: 5 },
];

// أوقات المحاضرات: من 01:00 إلى 00:00 (منتصف الليل) بفواصل ربع ساعة
const TIME_SLOTS: string[] = [];
for (let h = 1; h <= 23; h++) {
  const hh = h.toString().padStart(2, '0');
  TIME_SLOTS.push(`${hh}:00`, `${hh}:15`, `${hh}:30`, `${hh}:45`);
}
TIME_SLOTS.push('00:00');

export default function AddLectureModal({
  visible,
  onClose,
  onSave,
  courses = [],
  selectedCourseId,
  showCourseSelector = false,
  title = 'إضافة محاضرة',
}: AddLectureModalProps) {
  const [saving, setSaving] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string>('');
  const [semesterDates, setSemesterDates] = useState<{ start: string; end: string } | null>(null);
  
  const [formData, setFormData] = useState<LectureFormData>({
    course_id: selectedCourseId || '',
    date: '',
    start_time: '08:00',
    end_time: '09:30',
    room: '',
    notes: '',
  });

  // تحميل تواريخ الفصل
  useEffect(() => {
    const loadSemesterDates = async () => {
      try {
        const res = await settingsAPI.get();
        if (res.data.semester_start_date && res.data.semester_end_date) {
          setSemesterDates({
            start: res.data.semester_start_date,
            end: res.data.semester_end_date,
          });
        }
      } catch (error) {
        console.error('Error loading semester dates:', error);
      }
    };
    loadSemesterDates();
  }, []);

  // تحديث course_id عند تغيير selectedCourseId
  useEffect(() => {
    if (selectedCourseId) {
      setFormData(prev => ({ ...prev, course_id: selectedCourseId }));
    }
  }, [selectedCourseId]);

  // إعادة تعيين النموذج عند الفتح
  useEffect(() => {
    if (visible) {
      setFormData({
        course_id: selectedCourseId || (courses.length > 0 ? courses[0].id : ''),
        date: '',
        start_time: '08:00',
        end_time: '09:30',
        room: '',
        notes: '',
      });
      setSelectedDay('');
    }
  }, [visible]);

  // حساب التاريخ من اليوم المختار
  const calculateDateFromDay = (dayId: string) => {
    if (!semesterDates) return;
    
    const day = DAYS.find(d => d.id === dayId);
    if (!day) return;

    const startDate = new Date(semesterDates.start);
    const today = new Date();
    const baseDate = today > startDate ? today : startDate;
    
    // البحث عن أقرب يوم مطابق
    let targetDate = new Date(baseDate);
    while (targetDate.getDay() !== day.num) {
      targetDate.setDate(targetDate.getDate() + 1);
    }
    
    const dateStr = targetDate.toISOString().split('T')[0];
    setFormData(prev => ({ ...prev, date: dateStr }));
    setSelectedDay(dayId);
  };

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const handleSave = async () => {
    if (!formData.date) {
      showAlert('تنبيه', 'يرجى اختيار التاريخ');
      return;
    }
    if (!formData.room.trim()) {
      showAlert('تنبيه', 'يرجى إدخال القاعة');
      return;
    }
    if (formData.start_time && formData.end_time && formData.end_time <= formData.start_time) {
      showAlert('خطأ في الوقت', 'وقت النهاية يجب أن يكون بعد وقت البداية');
      return;
    }

    setSaving(true);
    try {
      await onSave(formData);
      onClose();
    } catch (error: any) {
      console.error('Error saving lecture:', error);
      // رسالة الخطأ تُعرض من المكون الأب (course-lectures)
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
            <Ionicons name="close" size={28} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{title}</Text>
          <TouchableOpacity 
            onPress={handleSave} 
            disabled={saving || !formData.date || !formData.room}
            style={styles.headerBtn}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#4caf50" />
            ) : (
              <Text style={[
                styles.saveText, 
                (!formData.date || !formData.room) && styles.saveTextDisabled
              ]}>حفظ</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Course Selector */}
          {showCourseSelector && courses.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                <Ionicons name="book" size={18} color="#ff9800" /> المقرر
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {courses.map(course => (
                  <TouchableOpacity
                    key={course.id}
                    style={[
                      styles.chip,
                      formData.course_id === course.id && styles.chipActive
                    ]}
                    onPress={() => setFormData({ ...formData, course_id: course.id })}
                  >
                    <Text style={[
                      styles.chipText,
                      formData.course_id === course.id && styles.chipTextActive
                    ]}>{course.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Day Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              <Ionicons name="calendar" size={18} color="#1565c0" /> اليوم
            </Text>
            <View style={styles.daysGrid}>
              {DAYS.map(day => (
                <TouchableOpacity
                  key={day.id}
                  style={[
                    styles.dayBtn,
                    selectedDay === day.id && styles.dayBtnActive
                  ]}
                  onPress={() => calculateDateFromDay(day.id)}
                >
                  <Text style={[
                    styles.dayBtnText,
                    selectedDay === day.id && styles.dayBtnTextActive
                  ]}>{day.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Date */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              <Ionicons name="today" size={18} color="#9c27b0" /> التاريخ *
            </Text>
            {Platform.OS === 'web' ? (
              <input
                type="date"
                value={formData.date}
                onChange={(e: any) => {
                  setFormData({ ...formData, date: e.target.value });
                  setSelectedDay('');
                }}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid #e0e0e0',
                  fontSize: '15px',
                  backgroundColor: '#f9f9f9',
                  color: '#333',
                  boxSizing: 'border-box',
                }}
              />
            ) : (
              <TextInput
                style={styles.input}
                value={formData.date}
                onChangeText={(text) => {
                  setFormData({ ...formData, date: text });
                  setSelectedDay('');
                }}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#999"
              />
            )}
            {semesterDates && (
              <Text style={styles.hint}>
                فترة الفصل: {semesterDates.start} إلى {semesterDates.end}
              </Text>
            )}
          </View>

          {/* Time */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              <Ionicons name="time" size={18} color="#4caf50" /> الوقت
            </Text>
            
            <Text style={styles.subLabel}>من</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.timesRow}>
              {TIME_SLOTS.map(time => (
                <TouchableOpacity
                  key={`start-${time}`}
                  style={[
                    styles.timeBtn,
                    formData.start_time === time && styles.timeBtnActive
                  ]}
                  onPress={() => setFormData({ ...formData, start_time: time })}
                >
                  <Text style={[
                    styles.timeBtnText,
                    formData.start_time === time && styles.timeBtnTextActive
                  ]}>{time}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.subLabel}>إلى</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.timesRow}>
              {TIME_SLOTS.map(time => (
                <TouchableOpacity
                  key={`end-${time}`}
                  style={[
                    styles.timeBtn,
                    formData.end_time === time && styles.timeBtnActive
                  ]}
                  onPress={() => setFormData({ ...formData, end_time: time })}
                >
                  <Text style={[
                    styles.timeBtnText,
                    formData.end_time === time && styles.timeBtnTextActive
                  ]}>{time}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Room */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              <Ionicons name="location" size={18} color="#f44336" /> القاعة *
            </Text>
            <TextInput
              style={styles.input}
              value={formData.room}
              onChangeText={(text) => setFormData({ ...formData, room: text })}
              placeholder="رقم أو اسم القاعة"
              placeholderTextColor="#999"
            />
          </View>

          {/* Notes */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              <Ionicons name="document-text" size={18} color="#607d8b" /> ملاحظات
            </Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={formData.notes}
              onChangeText={(text) => setFormData({ ...formData, notes: text })}
              placeholder="ملاحظات إضافية (اختياري)"
              placeholderTextColor="#999"
              multiline
              numberOfLines={3}
            />
          </View>

          {/* Preview */}
          {formData.date && formData.room && (
            <View style={styles.previewSection}>
              <Text style={styles.previewTitle}>معاينة المحاضرة</Text>
              <View style={styles.previewCard}>
                <View style={styles.previewRow}>
                  <Ionicons name="calendar" size={16} color="#1565c0" />
                  <Text style={styles.previewText}>{formData.date}</Text>
                </View>
                <View style={styles.previewRow}>
                  <Ionicons name="time" size={16} color="#4caf50" />
                  <Text style={styles.previewText}>{formData.start_time} - {formData.end_time}</Text>
                </View>
                <View style={styles.previewRow}>
                  <Ionicons name="location" size={16} color="#f44336" />
                  <Text style={styles.previewText}>القاعة: {formData.room}</Text>
                </View>
              </View>
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerBtn: {
    width: 60,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  saveText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4caf50',
    textAlign: 'right',
  },
  saveTextDisabled: {
    color: '#ccc',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  subLabel: {
    fontSize: 13,
    color: '#666',
    marginBottom: 8,
    marginTop: 8,
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  dayBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  dayBtnActive: {
    backgroundColor: '#1565c0',
    borderColor: '#1565c0',
  },
  dayBtnText: {
    fontSize: 14,
    color: '#666',
  },
  dayBtnTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  chipActive: {
    backgroundColor: '#ff9800',
    borderColor: '#ff9800',
  },
  chipText: {
    fontSize: 14,
    color: '#666',
  },
  chipTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    textAlign: 'right',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  hint: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
  timesRow: {
    marginBottom: 8,
  },
  timeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  timeBtnActive: {
    backgroundColor: '#4caf50',
    borderColor: '#4caf50',
  },
  timeBtnText: {
    fontSize: 14,
    color: '#666',
  },
  timeBtnTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  previewSection: {
    backgroundColor: '#e8f5e9',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  previewTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2e7d32',
    marginBottom: 12,
  },
  previewCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  previewText: {
    fontSize: 14,
    color: '#333',
  },
});
