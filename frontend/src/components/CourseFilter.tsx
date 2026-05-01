/**
 * مكوّن CourseFilter — اختيار سلسلي مع بحث:
 * الكلية → القسم → المقرر
 *
 * يدعم:
 * - بحث نصي ضمن المقررات (اسم/كود)
 * - فلترة سلسلية تلقائية
 * - تصفية اختيارية بالمستوى والشعبة
 * - واجهة عربية RTL
 */
import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  TextInput,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Faculty { id: string; name: string }
interface Department { id: string; name: string; faculty_id?: string }
interface Course {
  id: string;
  name: string;
  code?: string;
  level?: number;
  section?: string;
  department_id?: string;
}

interface SearchableProps {
  label: string;
  placeholder: string;
  value: string;
  options: { id: string; subtitle?: string; name: string }[];
  onSelect: (id: string) => void;
  required?: boolean;
  disabled?: boolean;
  searchable?: boolean;
  testID?: string;
}

/** Dropdown مع بحث نصي اختياري */
export const SearchableDropdown: React.FC<SearchableProps> = ({
  label,
  placeholder,
  value,
  options,
  onSelect,
  required,
  disabled,
  searchable = true,
  testID,
}) => {
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find((o) => o.id === value);

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        (o.subtitle || '').toLowerCase().includes(q)
    );
  }, [options, query]);

  return (
    <View style={s.container}>
      <Text style={s.label}>
        {label}
        {required && <Text style={{ color: '#e53935' }}> *</Text>}
      </Text>
      <TouchableOpacity
        style={[s.selector, disabled && s.disabled]}
        onPress={() => !disabled && setVisible(true)}
        disabled={disabled}
        testID={testID}
      >
        <Text style={[s.selectorText, !selected && s.placeholder]} numberOfLines={1}>
          {selected ? selected.name : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color="#666" />
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="fade">
        <TouchableOpacity
          style={s.overlay}
          activeOpacity={1}
          onPress={() => setVisible(false)}
        >
          <View style={s.modal} onStartShouldSetResponder={() => true}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{label}</Text>
              <TouchableOpacity onPress={() => setVisible(false)} testID={`${testID}-close`}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            {searchable && (
              <View style={s.searchBox}>
                <Ionicons name="search" size={18} color="#999" />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="ابحث..."
                  placeholderTextColor="#aaa"
                  style={s.searchInput}
                  autoFocus
                  testID={`${testID}-search`}
                />
                {query.length > 0 && (
                  <TouchableOpacity onPress={() => setQuery('')}>
                    <Ionicons name="close-circle" size={18} color="#999" />
                  </TouchableOpacity>
                )}
              </View>
            )}

            <View style={s.countBar}>
              <Text style={s.countText}>{filtered.length} نتيجة</Text>
            </View>

            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[s.option, value === item.id && s.optionSelected]}
                  onPress={() => {
                    onSelect(item.id);
                    setVisible(false);
                    setQuery('');
                  }}
                  testID={`${testID}-option-${item.id}`}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[s.optionText, value === item.id && s.optionTextSelected]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    {item.subtitle ? (
                      <Text style={s.optionSubtitle}>{item.subtitle}</Text>
                    ) : null}
                  </View>
                  {value === item.id && (
                    <Ionicons name="checkmark-circle" size={20} color="#1565c0" />
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={s.emptyText}>لا توجد نتائج</Text>}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

interface CourseFilterProps {
  faculties: Faculty[];
  departments: Department[];
  courses: Course[];
  facultyId: string;
  departmentId: string;
  courseId: string;
  onFacultyChange: (id: string) => void;
  onDepartmentChange: (id: string) => void;
  onCourseChange: (id: string) => void;
  showCourse?: boolean; // إذا false: فقط الكلية والقسم
  required?: boolean;
}

/** فلتر مركّب: كلية → قسم → مقرر */
export const CourseFilter: React.FC<CourseFilterProps> = ({
  faculties,
  departments,
  courses,
  facultyId,
  departmentId,
  courseId,
  onFacultyChange,
  onDepartmentChange,
  onCourseChange,
  showCourse = true,
  required = true,
}) => {
  const filteredDepts = useMemo(
    () => departments.filter((d) => !facultyId || d.faculty_id === facultyId),
    [departments, facultyId]
  );

  const filteredCourses = useMemo(
    () => courses.filter((c) => !departmentId || c.department_id === departmentId),
    [courses, departmentId]
  );

  return (
    <>
      <SearchableDropdown
        label="الكلية"
        value={facultyId}
        placeholder="اختر الكلية"
        options={faculties.map((f) => ({ id: f.id, name: f.name }))}
        onSelect={(v) => {
          onFacultyChange(v);
          onDepartmentChange('');
          onCourseChange('');
        }}
        required={required}
        searchable={faculties.length > 5}
        testID="course-filter-faculty"
      />
      <SearchableDropdown
        label="القسم"
        value={departmentId}
        placeholder={facultyId ? 'اختر القسم' : 'اختر الكلية أولاً'}
        options={filteredDepts.map((d) => ({ id: d.id, name: d.name }))}
        onSelect={(v) => {
          onDepartmentChange(v);
          onCourseChange('');
        }}
        required={required}
        disabled={!facultyId}
        searchable={filteredDepts.length > 5}
        testID="course-filter-department"
      />
      {showCourse && (
        <SearchableDropdown
          label="المقرر"
          value={courseId}
          placeholder={departmentId ? 'ابحث واختر المقرر...' : 'اختر القسم أولاً'}
          options={filteredCourses.map((c) => ({
            id: c.id,
            name: `${c.name}${c.code ? ` (${c.code})` : ''}`,
            subtitle: [
              c.level ? `المستوى ${c.level}` : '',
              c.section ? `شعبة ${c.section}` : '',
            ]
              .filter(Boolean)
              .join(' • '),
          }))}
          onSelect={onCourseChange}
          required={required}
          disabled={!departmentId}
          searchable
          testID="course-filter-course"
        />
      )}
    </>
  );
};

const s = StyleSheet.create({
  container: { marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '600', color: '#333', marginBottom: 6, textAlign: 'right' },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  disabled: { opacity: 0.5 },
  selectorText: { fontSize: 14, color: '#333', flex: 1, textAlign: 'right' },
  placeholder: { color: '#999' },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modal: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '95%',
    maxWidth: 500,
    maxHeight: '80%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: '#fafafa',
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#333' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    margin: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f0f4f8',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  searchInput: { flex: 1, fontSize: 14, color: '#333', textAlign: 'right' },
  countBar: { paddingHorizontal: 16, paddingVertical: 6, backgroundColor: '#f8f9fa' },
  countText: { fontSize: 11, color: '#666', textAlign: 'right' },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
    gap: 8,
  },
  optionSelected: { backgroundColor: '#e3f2fd' },
  optionText: { fontSize: 14, color: '#333', textAlign: 'right' },
  optionTextSelected: { color: '#1565c0', fontWeight: '700' },
  optionSubtitle: { fontSize: 11, color: '#888', marginTop: 2, textAlign: 'right' },
  emptyText: { textAlign: 'center', padding: 24, color: '#999', fontSize: 13 },
});
