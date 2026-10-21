import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Modal, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  visible: boolean;
  canClassify: boolean;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (reasonType: 'college' | 'non_college' | null, reasonText: string) => void;
}

export default function CancelLectureModal({ visible, canClassify, loading, onClose, onConfirm }: Props) {
  const [reasonType, setReasonType] = useState<'college' | 'non_college'>('non_college');
  const [reasonText, setReasonText] = useState('');

  useEffect(() => {
    if (visible) {
      setReasonType('non_college');
      setReasonText('');
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card} testID="cancel-lecture-modal">
          <Text style={styles.title}>إلغاء المحاضرة</Text>

          {canClassify && (
            <>
              <Text style={styles.label}>تصنيف سبب الإلغاء</Text>
              <View style={styles.chipsRow}>
                <TouchableOpacity
                  style={[styles.chip, reasonType === 'college' && styles.chipActiveCollege]}
                  onPress={() => setReasonType('college')}
                  testID="cancel-reason-college-chip"
                >
                  <Text style={[styles.chipText, reasonType === 'college' && styles.chipTextActive]}>بسبب الكلية</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.chip, reasonType === 'non_college' && styles.chipActiveNonCollege]}
                  onPress={() => setReasonType('non_college')}
                  testID="cancel-reason-non-college-chip"
                >
                  <Text style={[styles.chipText, reasonType === 'non_college' && styles.chipTextActive]}>غير الكلية</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.hint}>
                {reasonType === 'college'
                  ? 'عطلة/قرار إداري/فعالية جامعية — لا تُحتسب نقصاً ولا تتطلب تعويضاً إلزامياً'
                  : 'ظروف المعلم أو غيرها — تبقى محتسبة كالمعتاد (قد تتطلب تعويضاً)'}
              </Text>
            </>
          )}

          <Text style={styles.label}>سبب الإلغاء (اختياري، يظهر في التقارير)</Text>
          <TextInput
            style={styles.input}
            value={reasonText}
            onChangeText={setReasonText}
            placeholder="مثال: عطلة رسمية، ظرف طارئ..."
            placeholderTextColor="#aaa"
            testID="cancel-reason-text-input"
            multiline
          />

          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.btnGhost} onPress={onClose} testID="cancel-lecture-modal-dismiss">
              <Text style={styles.btnGhostText}>تراجع</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnDanger, loading && { opacity: 0.6 }]}
              onPress={() => onConfirm(canClassify ? reasonType : null, reasonText.trim())}
              disabled={loading}
              testID="cancel-lecture-modal-confirm"
            >
              {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.btnDangerText}>تأكيد الإلغاء</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 20, width: '92%', maxWidth: 420 },
  title: { fontSize: 17, fontWeight: '700', textAlign: 'center', marginBottom: 14, color: '#b91c1c' },
  label: { fontSize: 13, fontWeight: '600', color: '#444', marginBottom: 8, textAlign: 'right' },
  chipsRow: { flexDirection: 'row-reverse', gap: 8, marginBottom: 6 },
  chip: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#e0e0e0', backgroundColor: '#fafafa', alignItems: 'center' },
  chipActiveCollege: { backgroundColor: '#0891b2', borderColor: '#0891b2' },
  chipActiveNonCollege: { backgroundColor: '#ea580c', borderColor: '#ea580c' },
  chipText: { fontSize: 13, fontWeight: '700', color: '#555' },
  chipTextActive: { color: '#fff' },
  hint: { fontSize: 11, color: '#888', textAlign: 'right', marginBottom: 14, lineHeight: 16 },
  input: { borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, backgroundColor: '#fafafa', textAlign: 'right', minHeight: 56, textAlignVertical: 'top', marginBottom: 16 },
  actionsRow: { flexDirection: 'row', gap: 12 },
  btnGhost: { flex: 1, backgroundColor: '#e0e0e0', padding: 13, borderRadius: 10, alignItems: 'center' },
  btnGhostText: { fontWeight: '600', color: '#333' },
  btnDanger: { flex: 1, backgroundColor: '#dc2626', padding: 13, borderRadius: 10, alignItems: 'center' },
  btnDangerText: { fontWeight: '600', color: '#fff' },
});
