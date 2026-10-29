import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { advancedAccessAPI } from '../../services/api';
import { COLORS, SCOPE_TYPE_LABELS } from './shared';

export const AdvContextPage: React.FC<{ contexts: any[]; onRefresh: () => void }> = ({ contexts, onRefresh }) => {
  const [detail, setDetail] = useState<any>(null);
  const [loadingId, setLoadingId] = useState('');

  const switchTo = async (ctx: any) => {
    setLoadingId(ctx.id);
    try {
      const res = await advancedAccessAPI.getAssignmentContext(ctx.id);
      setDetail(res.data);
    } finally { setLoadingId(''); }
  };

  return (
    <View data-testid="adv-context-page">
      <Text style={styles.title}>سياق العمل — مناصبي النشطة ({contexts.length})</Text>
      <Text style={styles.desc}>انتقل بين مناصبك دون تسجيل الخروج — التبديل للعرض فقط، لا يغيّر أي صلاحية حقيقية في النظام القديم</Text>

      {contexts.map(c => (
        <TouchableOpacity key={c.id} style={styles.card} onPress={() => switchTo(c)} data-testid={`adv-context-card-${c.id}`}>
          <Ionicons name={c.assignment_type === 'academic' ? 'school' : 'business'} size={22} color={COLORS.primary} />
          <View style={{ flex: 1, marginRight: 10 }}>
            <Text style={styles.cardTitle}>{c.context_label_ar}</Text>
            <Text style={styles.cardMeta}>{SCOPE_TYPE_LABELS[c.scope?.scope_type] || c.scope?.scope_type}</Text>
          </View>
          {loadingId === c.id ? <ActivityIndicator color={COLORS.primary} size="small" /> : <Ionicons name="chevron-back" size={18} color={COLORS.textMuted} />}
        </TouchableOpacity>
      ))}
      {contexts.length === 0 && <Text style={styles.empty}>لا توجد لك تكليفات نشطة ضمن النظام الجديد حاليًا</Text>}

      {detail && (
        <View style={styles.detailBox} data-testid="adv-context-detail-box">
          <Text style={styles.detailTitle}>{detail.context_label_ar}</Text>
          <Text style={styles.detailLine}>الدور: {detail.role_name_ar}</Text>
          <Text style={styles.detailLine}>النطاق: {SCOPE_TYPE_LABELS[detail.scope?.scope_type] || detail.scope?.scope_type}</Text>
          <Text style={styles.detailLine}>عدد الصلاحيات الفعّالة ضمن هذا السياق: {detail.effective_permissions?.length}</Text>
          <Text style={styles.detailSub}>أول 10 صلاحيات:</Text>
          {(detail.effective_permissions || []).slice(0, 10).map((p: string) => (
            <Text key={p} style={styles.permItem}>• {p}</Text>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  title: { fontSize: 16, fontWeight: 'bold', color: COLORS.text, textAlign: 'right' },
  desc: { fontSize: 12, color: COLORS.textMuted, textAlign: 'right', marginTop: 4, marginBottom: 14 },
  card: { flexDirection: 'row-reverse', backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  cardTitle: { fontSize: 14, fontWeight: 'bold', color: COLORS.text, textAlign: 'right' },
  cardMeta: { fontSize: 11, color: COLORS.textMuted, textAlign: 'right', marginTop: 2 },
  empty: { textAlign: 'center', color: COLORS.textMuted, marginTop: 20 },
  detailBox: { backgroundColor: COLORS.primaryLight, borderRadius: 10, padding: 14, marginTop: 10 },
  detailTitle: { fontSize: 15, fontWeight: 'bold', color: COLORS.primary, textAlign: 'right' },
  detailLine: { fontSize: 13, color: COLORS.text, textAlign: 'right', marginTop: 6 },
  detailSub: { fontSize: 12, fontWeight: '600', color: COLORS.text, textAlign: 'right', marginTop: 10 },
  permItem: { fontSize: 11, color: COLORS.textMuted, textAlign: 'right', marginTop: 2 },
});
