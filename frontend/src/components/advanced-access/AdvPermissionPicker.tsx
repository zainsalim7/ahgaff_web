import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, TextInput, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { advancedAccessAPI } from '../../services/api';
import { COLORS, OP_TYPE_LABELS } from './shared';

interface Props {
  selected: string[];
  onChange: (keys: string[]) => void;
}

// 🆕 ترتيب الأهمية داخل كل مجموعة: العرض أولاً (الأكثر أماناً) ثم الإضافة/التعديل ثم الأشد خطورة أخيراً
const OP_PRIORITY = ['view_list', 'view_detail', 'add', 'edit', 'clone', 'approve', 'bulk', 'generate', 'import', 'export', 'publish', 'delete'];
const opRank = (op: string) => { const i = OP_PRIORITY.indexOf(op); return i === -1 ? OP_PRIORITY.length : i; };

export const AdvPermissionPicker: React.FC<Props> = ({ selected, onChange }) => {
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<{ [k: string]: boolean }>({});
  const [search, setSearch] = useState('');

  useEffect(() => {
    Promise.all([advancedAccessAPI.getPermissionGroups(), advancedAccessAPI.getPermissions()])
      .then(([g, p]) => { setGroups(g.data); setPermissions(p.data); })
      .finally(() => setLoading(false));
  }, []);

  const selectedSet = new Set(selected);
  const permByKey = useMemo(() => {
    const m: { [k: string]: any } = {};
    permissions.forEach(p => { m[p.key] = p; });
    return m;
  }, [permissions]);
  const byGroup = useMemo(() => {
    const m: { [k: string]: any[] } = {};
    permissions.forEach(p => {
      if (search && !p.label_ar.includes(search)) return;
      (m[p.group_key] = m[p.group_key] || []).push(p);
    });
    // 🆕 ترتيب كل مجموعة حسب الأهمية: عرض أولاً، ثم إضافة/تعديل، ثم الأشد خطورة (حذف) أخيراً
    Object.keys(m).forEach(k => m[k].sort((a, b) => opRank(a.operation_type) - opRank(b.operation_type)));
    return m;
  }, [permissions, search]);

  const toggleOne = (key: string) => {
    const perm = permByKey[key];
    if (selectedSet.has(key)) {
      // 🆕 تنبيه عكسي: هل صلاحيات أخرى مفعَّلة حاليًا تعتمد على هذه الصلاحية؟
      const dependents = selected.filter(k => k !== key && (permByKey[k]?.depends_on || []).some((d: any) => d.key === key));
      const removeIt = () => onChange(selected.filter(k => k !== key));
      if (dependents.length === 0) {
        removeIt();
        return;
      }
      const depLabels = dependents.map(dk => permByKey[dk]?.label_ar).join('، ');
      const warnMsg = `تحذير: الصلاحيات التالية المُفعَّلة تعتمد على "${perm?.label_ar}":\n${depLabels}\n\nقد لا تعمل بشكل صحيح إن أُلغيت. هل تريد إلغاء تفعيلها مع ذلك؟`;
      if (Platform.OS === 'web') {
        if (window.confirm(warnMsg)) removeIt();
        return;
      }
      Alert.alert('تحذير: صلاحية أساسية', warnMsg, [
        { text: 'تراجع', style: 'cancel' },
        { text: 'إلغاء التفعيل رغم ذلك', style: 'destructive', onPress: removeIt },
      ]);
      return;
    }
    const missingDeps: { key: string; reason?: string }[] = (perm?.depends_on || []).filter((d: any) => !selectedSet.has(d.key) && permByKey[d.key]);
    if (missingDeps.length === 0) {
      onChange([...selected, key]);
      return;
    }
    const depLines = missingDeps.map(d => `• ${permByKey[d.key]?.label_ar}${d.reason ? ' — ' + d.reason : ''}`).join('\n');
    const message = `صلاحية "${perm.label_ar}" عادة ما تحتاج أيضًا:\n${depLines}\n\nهل تريد تفعيلها معها؟`;
    const addWithDeps = () => onChange(Array.from(new Set([...selected, key, ...missingDeps.map(d => d.key)])));
    const addAloneOnly = () => onChange([...selected, key]);
    if (Platform.OS === 'web') {
      if (window.confirm(message)) addWithDeps(); else addAloneOnly();
      return;
    }
    Alert.alert('صلاحية مرتبطة', message, [
      { text: 'لا، فعّل هذه فقط', style: 'cancel', onPress: addAloneOnly },
      { text: 'نعم، فعّلهما أيضًا', onPress: addWithDeps },
    ]);
  };

  const toggleGroup = (groupKey: string) => {
    const keys = (byGroup[groupKey] || []).map(p => p.key);
    const allSelected = keys.every(k => selectedSet.has(k));
    onChange(allSelected ? selected.filter(k => !keys.includes(k)) : Array.from(new Set([...selected, ...keys])));
  };

  if (loading) return <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 20 }} />;

  return (
    <View testID="adv-permission-picker" style={{ flex: 1 }}>
      <View style={styles.toolbar}>
        <TextInput style={styles.search} placeholder="بحث سريع عن صلاحية..." value={search} onChangeText={setSearch} textAlign="right" testID="adv-picker-search" />
        <View style={styles.counterBadge}>
          <Text style={styles.counterText}>المختار: {selected.length} / {permissions.length}</Text>
        </View>
      </View>
      <ScrollView style={{ flex: 1 }} nestedScrollEnabled>
        {groups.map(g => {
          const items = byGroup[g.key] || [];
          if (search && items.length === 0) return null;
          const selCount = items.filter(p => selectedSet.has(p.key)).length;
          const isOpen = !!expanded[g.key];
          return (
            <View key={g.key} style={styles.groupBox}>
              <TouchableOpacity style={styles.groupHeader} onPress={() => setExpanded(e => ({ ...e, [g.key]: !e[g.key] }))} testID={`adv-picker-group-toggle-${g.key}`}>
                <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.textMuted} />
                <Text style={styles.groupCount}>{selCount}/{items.length}</Text>
                <TouchableOpacity onPress={() => toggleGroup(g.key)} style={styles.groupCheckbox} testID={`adv-picker-group-selectall-${g.key}`}>
                  <Ionicons name={selCount === items.length ? 'checkbox' : selCount > 0 ? 'remove-circle' : 'square-outline'} size={20} color={COLORS.primary} />
                </TouchableOpacity>
                <Text style={styles.groupName}>{g.name_ar}</Text>
              </TouchableOpacity>
              {isOpen && (
                <View style={styles.permGrid}>
                  {items.map(p => {
                    const checked = selectedSet.has(p.key);
                    return (
                      <TouchableOpacity key={p.key} style={[styles.permCard, checked && styles.permCardChecked]} onPress={() => toggleOne(p.key)} testID={`adv-picker-perm-${p.key}`}>
                        <View style={styles.permCardTop}>
                          <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={18} color={COLORS.primary} />
                          <View style={[styles.opBadge, { backgroundColor: checked ? COLORS.primary : COLORS.bg }]}>
                            <Text style={[styles.opBadgeText, { color: checked ? '#fff' : COLORS.textMuted }]}>{OP_TYPE_LABELS[p.operation_type] || p.operation_type}</Text>
                          </View>
                        </View>
                        <Text style={styles.permLabel}>{p.label_ar}</Text>
                        <Text style={styles.permApi}>{p.linked_api}</Text>
                        {!!p.description_ar && <Text style={styles.permDesc}>{p.description_ar}</Text>}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  // 🆕 شريط أدوات موحّد للبحث + العدّاد + الفلاتر السريعة بخلفية ناعمة
  toolbar: { flexDirection: 'row-reverse', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.bg, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, marginBottom: 16, gap: 12 },
  search: { flexGrow: 1, flexBasis: 200, height: 40, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 12, fontSize: 13 },
  counterBadge: { flexDirection: 'row-reverse', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border },
  counterText: { fontSize: 12.5, fontWeight: '700', color: COLORS.primary },
  groupBox: { backgroundColor: '#fff', borderRadius: 8, marginBottom: 6, borderWidth: 1, borderColor: COLORS.border },
  groupHeader: { flexDirection: 'row-reverse', alignItems: 'center', padding: 10, gap: 8 },
  groupName: { flex: 1, fontSize: 13, fontWeight: '600', color: COLORS.text, textAlign: 'right' },
  groupCount: { fontSize: 11, color: COLORS.textMuted },
  groupCheckbox: { padding: 2 },
  // 🆕 شبكة بطاقات متوازية بدل قائمة عمودية واحدة — تسهّل الاختيار بصرياً
  permGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: COLORS.bg },
  permCard: { flexGrow: 1, flexBasis: '31%', minWidth: 230, backgroundColor: COLORS.bg, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, padding: 10 },
  permCardChecked: { backgroundColor: COLORS.primaryLight, borderColor: COLORS.primary },
  permCardTop: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  opBadge: { borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  opBadgeText: { fontSize: 10, fontWeight: '600' },
  permLabel: { fontSize: 12.5, fontWeight: '600', color: COLORS.text, textAlign: 'right' },
  permApi: { fontSize: 10, color: COLORS.textMuted, textAlign: 'right', marginTop: 3 },
  permDesc: { fontSize: 11, color: COLORS.text, textAlign: 'right', marginTop: 5, lineHeight: 15, opacity: 0.85 },
});
