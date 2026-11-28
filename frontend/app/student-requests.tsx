import { goBack } from '../src/utils/navigation';
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { ExcusesPanel } from '../src/components/excuses/ExcusesPanel';
import api, { departmentsAPI, facultiesAPI } from '../src/services/api';
import { useAuth } from '../src/contexts/AuthContext';
import { ReportHero, ReportKpis, DenseTable, reportPage } from '../src/components/reports/ReportShell';
import { Badge } from '../src/components/rc/rcUi';
import { RequestDetail } from '../src/components/requests/RequestDetail';
import { RequestTypesEditor } from '../src/components/requests/RequestTypesEditor';
import { REQ_STATUS, REQ_STATUS_COLOR, ReqItem } from '../src/components/requests/reqUi';

const Pick = ({ label, value, onChange, items, all, testID }: { label: string; value: string; onChange: (v: string) => void; items: { id: string; name: string }[]; all: string; testID: string }) => (
  <View style={{ flex: 1, minWidth: 150 }}>
    <Text style={reportPage.label}>{label}</Text>
    <View style={reportPage.pickerBox}>
      <Picker selectedValue={value} onValueChange={onChange} style={reportPage.picker} testID={testID}>
        <Picker.Item label={all} value="" />
        {items.map((x) => <Picker.Item key={x.id} label={x.name} value={x.id} />)}
      </Picker>
    </View>
  </View>
);

export default function StudentRequestsPage() {
  const { hasPermission } = useAuth();
  const canReview = hasPermission('manage_student_requests');
  const canTypes = hasPermission('manage_request_types');
  const canExcuses = hasPermission('manage_student_excuses');
  const params = useLocalSearchParams<{ tab?: string }>();
  type Tab = 'list' | 'excuses' | 'types';
  const tabs = ([['list', 'الطلبات', 'file-tray-full-outline', canReview], ['excuses', 'أعذار الغياب', 'document-attach-outline', canExcuses], ['types', 'النماذج وحقولها', 'construct-outline', canTypes]] as const).filter((t) => t[3]);
  const [tab, setTab] = useState<Tab>((tabs.find((t) => t[0] === params.tab) || tabs[0] || ['list'])[0] as Tab);
  const [faculties, setFaculties] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [types, setTypes] = useState<{ id: string; name: string }[]>([]);
  const [f, setF] = useState({ status: 'pending', type_id: '', faculty_id: '', department_id: '', q: '' });
  const [data, setData] = useState<{ items: ReqItem[]; counts: Record<string, number> }>({ items: [], counts: {} });
  const [open, setOpen] = useState<ReqItem | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    facultiesAPI.getAll().then((r) => setFaculties(r.data || [])).catch(() => {});
    departmentsAPI.getAll().then((r) => setDepartments(r.data || [])).catch(() => {});
    api.get('/student-requests/types').then((r) => setTypes(r.data.items || [])).catch(() => {});
  }, []);
  const load = useCallback(() => {
    if (!canReview) return;
    const params = Object.fromEntries(Object.entries(f).filter(([, v]) => v));
    api.get('/student-requests', { params }).then((r) => { setData(r.data); setErr(''); }).catch((e) => setErr(e?.response?.data?.detail || 'تعذر التحميل'));
  }, [f, canReview]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const c = data.counts;
  return (
    <SafeAreaView style={reportPage.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={reportPage.content}>
        <ReportHero title="طلبات الطلاب" kicker="شؤون الطلاب" subtitle="النماذج وأعذار الغياب التي يقدمها الطلاب من التطبيق — تصل إلى مسجل الكلية ضمن نطاق كلياته وأقسامه"
          onBack={() => goBack()} canExport={false} testID="sr-hero" />
        {tabs.length > 1 && (
          <View style={{ flexDirection: 'row-reverse', gap: 6, marginBottom: 10 }}>
            {tabs.map(([k, l, ic]) => (
              <TouchableOpacity key={k} onPress={() => setTab(k)} testID={`sr-tab-${k}`}
                style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: tab === k ? '#1a2540' : '#eef1f6' }}>
                <Ionicons name={ic} size={15} color={tab === k ? '#fff' : '#1a2540'} /><Text style={{ fontWeight: '700', color: tab === k ? '#fff' : '#1a2540' }}>{l}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {tab === 'types' ? <RequestTypesEditor faculties={faculties} /> : tab === 'excuses' ? <ExcusesPanel /> : (
          <>
            <View style={[reportPage.pickerBox, { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10, padding: 12, borderRadius: 12, marginBottom: 10, height: undefined }]} testID="sr-filters">
              <Pick label="الكلية" value={f.faculty_id} onChange={(v) => setF({ ...f, faculty_id: v, department_id: '' })} items={faculties} all="كل الكليات" testID="sr-faculty" />
              <Pick label="القسم" value={f.department_id} onChange={(v) => setF({ ...f, department_id: v })} items={departments.filter((d) => !f.faculty_id || d.faculty_id === f.faculty_id)} all="كل الأقسام" testID="sr-department" />
              <Pick label="النموذج" value={f.type_id} onChange={(v) => setF({ ...f, type_id: v })} items={types} all="كل النماذج" testID="sr-type" />
              <Pick label="الحالة" value={f.status} onChange={(v) => setF({ ...f, status: v })} items={REQ_STATUS} all="كل الحالات" testID="sr-status" />
              <View style={{ flex: 1.3, minWidth: 180 }}>
                <Text style={reportPage.label}>بحث</Text>
                <TextInput value={f.q} onChangeText={(v) => setF({ ...f, q: v })} placeholder="اسم الطالب أو رقم القيد أو رقم الطلب" placeholderTextColor="#94a3b8"
                  style={[reportPage.pickerBox, { height: 36, paddingHorizontal: 10, textAlign: 'right' }]} testID="sr-search" />
              </View>
            </View>
            <ReportKpis testID="sr-kpis" items={REQ_STATUS.map((s) => ({ label: s.name, value: c[s.id] || 0, color: REQ_STATUS_COLOR[s.id], active: f.status === s.id,
              onPress: () => setF({ ...f, status: f.status === s.id ? '' : s.id }), testID: `sr-kpi-${s.id}` }))} />
            {!!err && <Text style={{ color: '#c62828', textAlign: 'right' }} testID="sr-error">{err}</Text>}
            <DenseTable testID="sr" emptyText="لا توجد طلبات بهذه الفلاتر"
              head={['رقم الطلب', 'النموذج', 'الطالب', 'رقم القيد', 'الكلية / القسم', 'المستوى', 'التاريخ', 'الحالة']}
              align={['center', 'right', 'right', 'center', 'right', 'center', 'center', 'center']}
              rows={data.items.map((r) => [r.ref_no, r.type_name, r.student_name, r.student_no, `${r.faculty_name}${r.department_name ? ` / ${r.department_name}` : ''}`,
                r.level ?? '', new Date(r.created_at).toLocaleDateString('ar'), <Badge key="s" text={r.status_ar} color={REQ_STATUS_COLOR[r.status] || '#475569'} />])}
              onRowClick={(i) => setOpen(data.items[i])} rowTestID={(i) => `sr-row-${i}`} />
          </>
        )}
        {open && <RequestDetail item={open} onClose={() => setOpen(null)} onDone={() => { setOpen(null); load(); }} />}
      </ScrollView>
    </SafeAreaView>
  );
}
