import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import { rs } from './resultsUi';

interface Batch {
  id: string; kind: string; kind_name: string; academic_year: string | null; level: number; semester: number;
  scope_name: string; student_name: string; file_name: string; counts: any; notified: number; hidden: boolean;
  undone: boolean; undone_by_name: string; created_by_name: string; created_at: string;
}

const confirmBox = async (msg: string) => Platform.OS === 'web' ? window.confirm(msg)
  : new Promise<boolean>((r) => Alert.alert('تأكيد', msg, [{ text: 'إلغاء', onPress: () => r(false) }, { text: 'نعم', onPress: () => r(true) }]));

const fmt = (iso: string) => { try { return new Date(iso).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }); } catch { return iso; } };

const BatchCard = ({ b, canManage, onAct }: { b: Batch; canManage: boolean; onAct: (b: Batch, a: 'hide' | 'show' | 'undo') => void }) => {
  const c = b.counts || {};
  return (
    <View style={[rs.card, b.undone && { opacity: 0.6 }]} testID={`batch-${b.id}`}>
      <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={rs.title}>{b.kind_name} · المستوى {b.level} · {b.semester === 1 ? 'الفصل الأول' : 'الفصل الثاني'}{b.academic_year ? ` · ${b.academic_year}` : ''}</Text>
        {b.undone ? <Text style={{ color: '#c62828', fontWeight: '800', fontSize: 12 }} testID={`batch-undone-${b.id}`}>تم التراجع</Text>
          : b.hidden ? <Text style={{ color: '#ef6c00', fontWeight: '800', fontSize: 12 }} testID={`batch-hidden-${b.id}`}>مخفية عن الطلاب</Text>
          : <Text style={{ color: '#2e7d32', fontWeight: '800', fontSize: 12 }}>منشورة</Text>}
      </View>
      <Text style={{ color: '#475569', textAlign: 'right', fontSize: 12.5, marginTop: 2 }}>
        {b.scope_name || b.student_name}{b.file_name ? ` · ${b.file_name}` : ''}
      </Text>
      {b.kind === 'import' && <Text style={{ color: '#475569', textAlign: 'right', fontSize: 12.5 }}>جديد {c.new ?? 0} · مُحدَّث {c.changed ?? 0} · إشعارات {b.notified}</Text>}
      <Text style={{ color: '#94a3b8', textAlign: 'right', fontSize: 11.5 }}>{b.created_by_name} · {fmt(b.created_at)}{b.undone ? ` · تراجع: ${b.undone_by_name}` : ''}</Text>
      {canManage && !b.undone && (
        <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 8 }}>
          {b.kind === 'import' && (
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

  const act = async (b: Batch, a: 'hide' | 'show' | 'undo') => {
    const q = a === 'undo' ? 'التراجع يعيد النتائج كما كانت قبل هذه العملية (دون إرسال إشعار). متابعة؟'
      : a === 'hide' ? 'إخفاء نتائج هذه الرفعة عن الطلاب في التطبيق؟' : 'إظهار نتائج هذه الرفعة للطلاب؟';
    if (!(await confirmBox(q))) return;
    try {
      const res = a === 'undo' ? await api.post(`/results/batches/${b.id}/undo`) : await api.post(`/results/batches/${b.id}/visibility`, { hidden: a === 'hide' });
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
