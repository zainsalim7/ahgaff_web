import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ActivityIndicator, Platform, Alert } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';

const notify = (t: string, m: string) => (Platform.OS === 'web' ? window.alert(`${t}\n\n${m}`) : Alert.alert(t, m));

type Props = { visible: boolean; studentIds: string[]; onClose: () => void; onDone: () => void };

/** 🌍 تعيين الجنسية للطلاب المحددين — الاختيار من القائمة المعتمدة فقط */
export const BulkNationalityModal = ({ visible, studentIds, onClose, onDone }: Props) => {
  const [items, setItems] = useState<string[]>([]);
  const [nat, setNat] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setNat('');
    api.get('/admin/students/nationalities').then(r => setItems(r.data.items || [])).catch(() => setItems([]));
  }, [visible]);

  const apply = async () => {
    if (!nat) return notify('تنبيه', 'اختر الجنسية من القائمة');
    setSaving(true);
    try {
      const r = await api.post('/admin/students/bulk-set-nationality', { student_ids: studentIds, nationality: nat });
      notify('تم', r.data.message);
      onDone();
      onClose();
    } catch (e: any) { notify('خطأ', e?.response?.data?.detail || 'فشل التعيين'); }
    finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
        <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, width: '90%', maxWidth: 400 }} testID="bulk-nationality-modal">
          <Ionicons name="earth" size={36} color="#2e7d32" style={{ alignSelf: 'center', marginBottom: 8 }} />
          <Text style={{ fontSize: 17, fontWeight: '700', color: '#333', textAlign: 'center' }}>تعيين الجنسية</Text>
          <Text style={{ fontSize: 13, color: '#888', textAlign: 'center', marginVertical: 10 }}>
            ستُطبَّق على {studentIds.length} طالب محدد (تستبدل الجنسية الحالية)
          </Text>
          <View style={{ borderWidth: 1, borderColor: '#dde3ec', borderRadius: 8, marginBottom: 16 }}>
            <Picker selectedValue={nat} onValueChange={(v) => setNat(String(v))} testID="bulk-nationality-picker">
              <Picker.Item label="— اختر الجنسية —" value="" />
              {items.map(n => <Picker.Item key={n} label={n} value={n} />)}
            </Picker>
          </View>
          <TouchableOpacity style={{ backgroundColor: '#2e7d32', padding: 13, borderRadius: 10, alignItems: 'center', opacity: saving || !nat ? 0.6 : 1 }}
            onPress={apply} disabled={saving} testID="bulk-nationality-confirm-btn">
            {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '800' }}>تطبيق</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={{ backgroundColor: '#f5f5f5', padding: 12, borderRadius: 10, alignItems: 'center', marginTop: 10 }}
            onPress={onClose} disabled={saving} testID="bulk-nationality-cancel-btn">
            <Text style={{ color: '#666', fontWeight: '600' }}>إلغاء</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};
