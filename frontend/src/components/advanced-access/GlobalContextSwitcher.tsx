import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/authStore';
import { useAdvancedAccessContextStore } from '../../store/advancedAccessContextStore';
import { SCOPE_TYPE_LABELS } from './shared';

// زر عائم عام يظهر في كل الصفحات (أعلى التطبيق) للأدمن/المختبرين المصرَّح لهم بتبديل السياق فقط
export const GlobalContextSwitcher: React.FC = () => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { hasAccess, isAdmin, subPermissions, contexts, activeContext, checked, checkAccess, switchContext, clearContext } = useAdvancedAccessContextStore();
  const [modalVisible, setModalVisible] = useState(false);

  useEffect(() => {
    if (isAuthenticated && !checked) checkAccess();
  }, [isAuthenticated, checked, checkAccess]);

  const canSwitch = hasAccess && (isAdmin || subPermissions.includes('context_switch'));
  if (!isAuthenticated || !canSwitch) return null;

  return (
    <>
      <TouchableOpacity style={styles.btn} onPress={() => setModalVisible(true)} testID="global-context-switcher-btn" accessibilityLabel="سياق العمل الحالي">
        <Ionicons name="swap-horizontal" size={18} color="#fff" />
      </TouchableOpacity>

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setModalVisible(false)}>
          <View style={styles.box} data-testid="global-context-switcher-modal">
            <Text style={styles.title}>سياق العمل الحالي (تجريبي)</Text>
            <Text style={styles.subtitle}>{activeContext ? activeContext.context_label_ar : 'لم يُفعَّل أي سياق بعد'}</Text>
            {contexts.length === 0 && (
              <Text style={styles.empty}>لا توجد تكليفات نشطة لحسابك ضمن النظام الجديد (SHADOW MODE)</Text>
            )}
            <ScrollView style={{ maxHeight: 280 }}>
              {contexts.map((c: any) => (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.option, activeContext?.id === c.id && styles.optionActive]}
                  onPress={() => { switchContext(c); setModalVisible(false); }}
                  data-testid={`global-context-option-${c.id}`}
                >
                  <Ionicons name={c.assignment_type === 'academic' ? 'school' : 'business'} size={18} color="#1565c0" />
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.optionLabel}>{c.context_label_ar}</Text>
                    <Text style={styles.optionMeta}>{SCOPE_TYPE_LABELS[c.scope?.scope_type] || c.scope?.scope_type}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {!!activeContext && (
              <TouchableOpacity style={styles.clearBtn} onPress={() => { clearContext(); setModalVisible(false); }} data-testid="global-context-clear-btn">
                <Text style={styles.clearBtnText}>إلغاء السياق النشط</Text>
              </TouchableOpacity>
            )}
            <Text style={styles.note}>تبديل تجريبي للعرض فقط — لا يغيّر أي صلاحية حقيقية في النظام الحالي</Text>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  btn: {
    backgroundColor: '#6a1b9a', width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)',
  },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  box: { backgroundColor: '#fff', borderRadius: 12, padding: 16, width: '85%', maxWidth: 420 },
  title: { fontSize: 16, fontWeight: 'bold', color: '#212121', textAlign: 'right' },
  subtitle: { fontSize: 13, color: '#6a1b9a', fontWeight: '600', textAlign: 'right', marginTop: 4, marginBottom: 10 },
  empty: { color: '#757575', textAlign: 'center', padding: 12 },
  option: { flexDirection: 'row-reverse', alignItems: 'center', padding: 10, borderRadius: 8, backgroundColor: '#f5f5f5', marginBottom: 8 },
  optionActive: { backgroundColor: '#e3f2fd', borderWidth: 1, borderColor: '#1565c0' },
  optionLabel: { fontSize: 14, fontWeight: '600', color: '#212121', textAlign: 'right' },
  optionMeta: { fontSize: 11, color: '#757575', textAlign: 'right', marginTop: 2 },
  clearBtn: { marginTop: 10, padding: 10, borderRadius: 8, backgroundColor: '#ffebee', alignItems: 'center' },
  clearBtnText: { color: '#c62828', fontWeight: '600', fontSize: 13 },
  note: { fontSize: 10, color: '#9e9e9e', textAlign: 'center', marginTop: 10 },
});
