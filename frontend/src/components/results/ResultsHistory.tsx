import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import { rs } from './resultsUi';

interface Batch {
  id: string; kind: string; kind_name: string; academic_year: string | null; level: number; semester: number;
  scope_name: string; student_name: string; file_name: string; counts: any; notified: number; hidden: boolean;
  push?: { status: string; devices: number; students_with_device?: number; success: number; failure: number; removed?: number } | null;
  undone: boolean; undone_by_name: string; created_by_name: string; created_at: string; event_only?: boolean;
  draft?: boolean; notify_pending?: number; published_by_name?: string;
}

const confirmBox = async (msg: string) => Platform.OS === 'web' ? window.confirm(msg)
  : new Promise<boolean>((r) => Alert.alert('تأكيد', msg, [{ text: 'إلغاء', onPress: () => r(false) }, { text: 'نعم', onPress: () => r(true) }]));

const fmt = (iso: string) => { try { return new Date(iso).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }); } catch { return iso; } };

type Act = 'hide' | 'show' | 'undo' | 'publish';

const BatchCard = ({ b, canManage, onAct }: { b: Batch; canManage: boolean; onAct: (b: Batch, a: Act) => void }) => {
  const c = b.counts || {};
  if (b.event_only) return (
    <View style={[rs.card, { backgroundColor: b.kind === 'pause' ? '#fff7ed' : '#f0fdf4' }]} testID={`batch-${b.id}`}>
      <Text style={rs.title}>{b.kind_name} · {b.scope_name}</Text>
      {!!b.push && <PushLine p={b.push} id={b.id} notified={b.notified} />}
      <Text style={{ color: '#94a3b8', textAlign: 'right', fontSize: 11.5 }}>{b.created_by_name} · {fmt(b.created_at)}</Text>
    </View>
  );
  return (
    <View style={[rs.card, b.undone && { opacity: 0.6 }]} testID={`batch-${b.id}`}>
      <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={rs.title}>{b.kind_name} · المستوى {b.level} · {b.semester === 1 ? 'الفصل الأول' : 'الفصل الثاني'}{b.academic_year ? ` · ${b.academic_year}` : ''}</Text>
        {b.undone ? <Text style={{ color: '#c62828', fontWeight: '800', fontSize: 12 }} testID={`batch-undone-${b.id}`}>تم التراجع</Text>
          : b.draft ? <Text style={{ color: '#6d28d9', fontWeight: '800', fontSize: 12 }} testID={`batch-draft-${b.id}`}>مسودة — غير منشورة</Text>
          : b.hidden ? <Text style={{ color: '#ef6c00', fontWeight: '800', fontSize: 12 }} testID={`batch-hidden-${b.id}`}>مخفية عن الطلاب</Text>
          : <Text style={{ color: '#2e7d32', fontWeight: '800', fontSize: 12 }}>منشورة</Text>}
      </View>
      <Text style={{ color: '#475569', textAlign: 'right', fontSize: 12.5, marginTop: 2 }}>
        {b.scope_name || b.student_name}{b.file_name ? ` · ${b.file_name}` : ''}
      </Text>
      {b.kind === 'import' && <Text style={{ color: '#475569', textAlign: 'right', fontSize: 12.5 }}>جديد {c.new ?? 0} · مُحدَّث {c.changed ?? 0} · {b.draft ? `سيُشعَر عند النشر ${b.notify_pending ?? 0}` : `إشعارات ${b.notified}`}</Text>}
      {!!b.push && <PushLine p={b.push} id={b.id} notified={b.notified} />}
      <Text style={{ color: '#94a3b8', textAlign: 'right', fontSize: 11.5 }}>{b.created_by_name} · {fmt(b.created_at)}{b.published_by_name ? ` · نشر: ${b.published_by_name}` : ''}{b.undone ? ` · تراجع: ${b.undone_by_name}` : ''}</Text>
      {canManage && !b.undone && (
        <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 8 }}>
          {b.kind === 'import' && b.draft && (
            <TouchableOpacity style={[rs.btn, { flex: 1, backgroundColor: '#6d28d9', flexDirection: 'row-reverse', gap: 6 }]} onPress={() => onAct(b, 'publish')} testID={`batch-publish-${b.id}`}>
              <Ionicons name="megaphone-outline" size={16} color="#fff" />
              <Text style={rs.btnTxt}>نشر للطلاب</Text>
            </TouchableOpacity>
          )}
          {b.kind === 'import' && !b.draft && (
            <TouchableOpacity style={[rs.btn, { flex: 1, backgroundColor: b.hidden ? '#2e7d32' : '#ef6c00', flexDirection: 'row-reverse', gap: 6 }]} onPress={() => onAct(b, b.hidden ? 'show' : 'hide')} testID={`batch-toggle-${b.id}`}>
              <Ionicons name={b.hidden ? 'eye-outline' : 'eye-off-outline'} size={16} color="#fff" />
              <Text style={rs.btnTxt}>{b.hidden ? 'إظهار للطلاب' : 'إخفاء عن الطلاب'}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[rs.btn, { flex: 1, backgroundColor: '#c62828', flexDirection: 'row-reverse', gap: 6 }]} onPress={() => onAct(b, 'undo')} testID={`batch-undo-${b.id}`}>
            <Ionicons name="arrow-undo-outline" size={16} color="#fff" />
            <Text style={rs.btnTxt}>تراجع</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const PushLine = ({ p, id, notified }: { p: NonNullable<Batch['push']>; id: string; notified: number }) => {
  const bad = p.status === 'failed' || (p.status === 'done' && p.devices > 0 && !p.success);
  const color = p.status === 'sending' ? '#ef6c00' : bad ? '#c62828' : '#1565c0';
  const txt = p.status === 'sending' ? `جارٍ الإرسال إلى ${p.devices} جهاز…`
    : p.devices === 0 ? 'لا توجد أجهزة مسجلة لهؤلاء الطلاب — وصلهم الإشعار داخل التطبيق فقط'
    : `وصل إلى ${p.success} من ${p.devices} جهاز${p.failure ? ` · فشل ${p.failure}` : ''}${p.removed ? ` · حُذف ${p.removed} جهاز قديم` : ''}`;
  return (
    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 5, marginTop: 2 }} testID={`batch-push-${id}`}>
      <Ionicons name="phone-portrait-outline" size={13} color={color} />
      <Text style={{ color, fontSize: 12, fontWeight: '700', textAlign: 'right', flexShrink: 1 }}>
        {txt}{p.students_with_device !== undefined && p.devices > 0 ? ` · ${p.students_with_device} من ${notified} طالب لديهم جهاز` : ''}
      </Text>
    </View>
  );
};

export const ResultsHistory = ({ canManage }: { canManage: boolean }) => {
  const [items, setItems] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try { setItems((await api.get('/results/batches')).data.items || []); }
    catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.detail || 'تعذر جلب السجل' }); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!items.some((b) => b.push?.status === 'sending')) return;
    const t = setTimeout(() => api.get('/results/batches').then((r) => setItems(r.data.items || [])).catch(() => {}), 5000);
    return () => clearTimeout(t);
  }, [items]);

  const act = async (b: Batch, a: Act) => {
    const q = a === 'publish' ? `نشر نتائج هذه الرفعة للطلاب في التطبيق${b.notify_pending ? ` وإرسال إشعار «صدرت نتيجتك» إلى ${b.notify_pending} طالب` : ''}؟`
      : a === 'undo' ? 'التراجع يعيد النتائج كما كانت قبل هذه العملية (دون إرسال إشعار). متابعة؟'
      : a === 'hide' ? 'إخفاء نتائج هذه الرفعة عن الطلاب في التطبيق؟' : 'إظهار نتائج هذه الرفعة للطلاب؟';
    if (!(await confirmBox(q))) return;
    try {
      const res = a === 'publish' ? await api.post(`/results/batches/${b.id}/publish`, {}) : a === 'undo' ? await api.post(`/results/batches/${b.id}/undo`) : await api.post(`/results/batches/${b.id}/visibility`, { hidden: a === 'hide' });
      setMsg({ ok: true, text: res.data?.message || 'تم' }); await load();
    } catch (e: any) { setMsg({ ok: false, text: e?.response?.data?.detail || 'فشلت العملية' }); }
  };

  return (
    <View testID="results-history">
      {msg && <View style={[rs.card, { backgroundColor: msg.ok ? '#e8f5e9' : '#ffebee' }]} testID="history-msg"><Text style={{ color: msg.ok ? '#2e7d32' : '#c62828', textAlign: 'right' }}>{msg.text}</Text></View>}
      {loading ? <ActivityIndicator /> : items.length === 0 ? <Text style={{ textAlign: 'center', color: '#94a3b8', marginTop: 20 }} testID="history-empty">لا توجد عمليات بعد</Text>
        : items.map((b) => <BatchCard key={b.id} b={b} canManage={canManage} onAct={act} />)}
    </View>
  );
};
