import React, { useEffect, useState, useCallback } from 'react';
import { ScrollView, View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { goBack } from '../src/utils/navigation';
import { hrAPI } from '../src/services/api';
import { useAuth } from '../src/contexts/AuthContext';
import { ReportHero, reportPage, ReportEmpty } from '../src/components/reports/ReportShell';
import { Badge, Th, td, table, inp, btn, alertErr, Modal, Field } from '../src/components/hr/ui';

const CAT_LABEL: Record<string, string> = { academic: 'أكاديمي', administrative: 'إداري', technical: 'فني', service: 'خدمات مساندة' };
const EMPTY = { key: '', name: '', color: '#1565c0', deducts_balance: true, carry_over_enabled: false, carry_over_max_days: '', entitlements: { academic: '', administrative: '', technical: '', service: '' }, requires_attachment: false, paid: true, is_active: true, order: 0, note: '' };

const TypeForm: React.FC<{ item: any; cats: Record<string, string>; onClose: () => void; onSaved: () => void }> = ({ item, cats, onClose, onSaved }) => {
  const [f, setF] = useState<any>(item ? { ...item, entitlements: Object.fromEntries(Object.keys(cats).map((c) => [c, item.entitlements?.[c] ?? ''])) } : { ...EMPTY, entitlements: Object.fromEntries(Object.keys(cats).map((c) => [c, ''])) });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const setEnt = (c: string, v: string) => setF((p: any) => ({ ...p, entitlements: { ...p.entitlements, [c]: v.replace(/\D/g, '') } }));
  const save = async () => {
    setBusy(true);
    try {
      const payload = { ...f, order: Number(f.order) || 0, carry_over_max_days: f.carry_over_max_days === '' || f.carry_over_max_days == null ? null : Number(f.carry_over_max_days), entitlements: Object.fromEntries(Object.entries(f.entitlements).map(([c, v]: any) => [c, v === '' || v == null ? null : Number(v)])) };
      const r = item ? await hrAPI.updateLeaveType(item.key, payload) : await hrAPI.createLeaveType(payload);
      window.alert(r.data.message); onSaved(); onClose();
    } catch (e) { alertErr(e); } finally { setBusy(false); }
  };
  return (
    <Modal title={item ? `تعديل نوع الإجازة: ${item.name}` : 'إضافة نوع إجازة'} onClose={onClose} width={640} testID="leave-type-form">
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10, direction: 'rtl' }}>
        <Field label="اسم النوع *"><input value={f.name} onChange={(e) => set('name', e.target.value)} style={inp} data-testid="lt-name" /></Field>
        <Field label="المعرّف (لاتيني، اختياري)"><input value={f.key} disabled={!!item} onChange={(e) => set('key', e.target.value)} placeholder="مثل: hajj" style={{ ...inp, direction: 'ltr' }} data-testid="lt-key" /></Field>
        <Field label="اللون"><input type="color" value={f.color} onChange={(e) => set('color', e.target.value)} style={{ ...inp, padding: 2, height: 36 }} data-testid="lt-color" /></Field>
      </div>
      <div style={{ marginTop: 12, padding: 12, borderRadius: 10, backgroundColor: f.deducts_balance ? '#eef4ff' : '#f8fafc', direction: 'rtl' }}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, fontWeight: 800, cursor: 'pointer' }}><input type="checkbox" checked={!!f.deducts_balance} onChange={(e) => set('deducts_balance', e.target.checked)} data-testid="lt-deducts" /> يُخصم من رصيد الموظف (لهذا النوع رصيد سنوي محدد)</label>
        <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 4 }}>{f.deducts_balance ? 'حدّد الاستحقاق السنوي بالأيام لكل فئة — اترك الحقل فارغاً للفئة التي لا رصيد لها (غير محدود). يمكن تجاوز الاستحقاق لموظف بعينه من تبويب «الأرصدة» في صفحة الإجازات.' : 'لن يُحسب أو يُخصم أي رصيد لهذا النوع — تُسجَّل الطلبات وتُعتمد دون حدّ.'}</div>
        {f.deducts_balance && (<>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 10 }}>
            {Object.entries(cats).map(([c, label]) => <Field key={c} label={`${label} (يوم/سنة)`}><input value={f.entitlements[c] ?? ''} onChange={(e) => setEnt(c, e.target.value)} placeholder="بلا رصيد" style={{ ...inp, textAlign: 'center' }} data-testid={`lt-ent-${c}`} /></Field>)}
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 10, flexWrap: 'wrap', borderTop: '1px dashed #cbd5e1', paddingTop: 10 }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}><input type="checkbox" checked={!!f.carry_over_enabled} onChange={(e) => set('carry_over_enabled', e.target.checked)} data-testid="lt-carry" /> 🔁 ترحيل المتبقي تلقائياً إلى السنة التالية</label>
            {f.carry_over_enabled && <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5 }}>بحد أقصى <input value={f.carry_over_max_days ?? ''} onChange={(e) => set('carry_over_max_days', e.target.value.replace(/\D/g, ''))} placeholder="بلا حد" style={{ ...inp, width: 90, textAlign: 'center' }} data-testid="lt-carry-max" /> يوماً</div>}
          </div>
          {f.carry_over_enabled && <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 4 }}>يُحتسب الترحيل تلقائياً عند أول عرض لرصيد السنة الجديدة (المتبقي من السنة السابقة حتى الحد)، ويمكن تعديله يدوياً لأي موظف من تبويب الأرصدة.</div>}
        </>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginTop: 12, direction: 'rtl', alignItems: 'end' }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5 }}><input type="checkbox" checked={!!f.paid} onChange={(e) => set('paid', e.target.checked)} data-testid="lt-paid" /> مدفوعة الراتب</label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5 }}><input type="checkbox" checked={!!f.requires_attachment} onChange={(e) => set('requires_attachment', e.target.checked)} data-testid="lt-attach" /> تتطلب مرفقاً (تقرير…)</label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5 }}><input type="checkbox" checked={!!f.is_active} disabled={item?.system} onChange={(e) => set('is_active', e.target.checked)} data-testid="lt-active" /> مفعّل</label>
        <Field label="الترتيب"><input value={f.order} onChange={(e) => set('order', e.target.value.replace(/\D/g, ''))} style={{ ...inp, textAlign: 'center' }} data-testid="lt-order" /></Field>
      </div>
      <Field label="ملاحظة / سياسة"><input value={f.note || ''} onChange={(e) => set('note', e.target.value)} style={inp} data-testid="lt-note" /></Field>
      <div style={{ display: 'flex', gap: 8, marginTop: 14, direction: 'rtl' }}>
        <button onClick={save} disabled={busy || !f.name.trim()} style={btn('#1565c0')} data-testid="lt-save">{busy ? '...' : 'حفظ'}</button>
        <button onClick={onClose} style={btn('#f1f5f9', '#0f2440')}>إلغاء</button>
      </div>
    </Modal>
  );
};

/** 🏖️ إعدادات الإجازات — أنواع الإجازات، الخصم من الرصيد، الأرصدة حسب الفئة (صلاحية مستقلة) */
export default function HrLeaveSettings() {
  const { hasPermission, user } = useAuth();
  const canEdit = user?.role === 'admin' || hasPermission('hr_manage_leave_settings');
  const [d, setD] = useState<any>(null);
  const [form, setForm] = useState<{ open: boolean; item: any } | null>(null);
  const load = useCallback(async () => { try { setD((await hrAPI.leaveTypes()).data); } catch (e) { alertErr(e); } }, []);
  useEffect(() => { load(); }, [load]);
  const del = async (t: any) => { if (!window.confirm(`حذف نوع الإجازة «${t.name}»؟ (إن كان مستخدماً سيُعطَّل فقط)`)) return; try { const r = await hrAPI.deleteLeaveType(t.key); window.alert(r.data.message); load(); } catch (e) { alertErr(e); } };
  const cats: Record<string, string> = d?.categories || CAT_LABEL;
  return (
    <SafeAreaView style={reportPage.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={reportPage.content}>
        <ReportHero kicker="شؤون الموظفين" title="إعدادات الإجازات" subtitle="أنواع الإجازات وسياساتها: أيّها يُخصم من الرصيد، والاستحقاق السنوي لكل فئة (أكاديمي / إداري / فني / خدمات)" onBack={() => goBack()} canExport={false} testID="hr-leave-settings-hero" />
        {!canEdit && d && !d.can_edit ? <ReportEmpty text="هذه الصفحة تتطلب صلاحية «إعدادات الإجازات»" icon="lock-closed-outline" /> : (<>
          <View style={reportPage.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', direction: 'rtl', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ fontSize: 12.5, color: '#475569' }}>الأنواع التي «تُخصم من الرصيد» يظهر رصيدها للموظف في بطاقته وتطبيقه ويُتحقق منه عند الطلب والاعتماد؛ والباقي يُسجَّل دون حدّ. التغييرات تسري فوراً على الطلبات الجديدة فقط.</div>
              {canEdit && <button onClick={() => setForm({ open: true, item: null })} style={btn('#1565c0')} data-testid="lt-new-btn">+ إضافة نوع إجازة</button>}
            </div>
          </View>
          {!d ? <Text style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>جاري التحميل...</Text> : (
            <View style={[reportPage.card, { padding: 0, overflow: 'hidden' }]}>
              <table style={table} data-testid="leave-types-table">
                <Th cols={['النوع', 'يُخصم من الرصيد', ...Object.values(cats).map((c) => `${c} (يوم)`), 'ترحيل', 'مدفوعة', 'مرفق', 'الاستخدام', 'الحالة', '']} />
                <tbody>
                  {d.items.map((t: any) => (
                    <tr key={t.key} style={{ borderBottom: '1px solid #eef2f7', opacity: t.is_active ? 1 : 0.55 }} data-testid={`lt-row-${t.key}`}>
                      <td style={{ ...td, fontWeight: 800, color: '#0f2440' }}><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 5, backgroundColor: t.color, marginLeft: 6 }} />{t.name}<div style={{ fontSize: 10.5, color: '#94a3b8', direction: 'ltr', textAlign: 'right' }}>{t.key}{t.system ? ' · نظامي' : ''}</div></td>
                      <td style={td}>{t.deducts_balance ? <Badge color="#1565c0">نعم — له رصيد</Badge> : <Badge color="#94a3b8">لا يُخصم</Badge>}</td>
                      {Object.keys(cats).map((c) => <td key={c} style={{ ...td, textAlign: 'center', fontWeight: 800, color: t.deducts_balance && t.entitlements?.[c] != null ? '#0f2440' : '#cbd5e1' }}>{t.deducts_balance ? (t.entitlements?.[c] ?? 'بلا حد') : '—'}</td>)}
                      <td style={td}>{t.deducts_balance && t.carry_over_enabled ? <Badge color="#0f766e">🔁 {t.carry_over_max_days != null ? `حتى ${t.carry_over_max_days}` : 'بلا حد'}</Badge> : '—'}</td>
                      <td style={td}>{t.paid ? '✓' : <Badge color="#64748b">بدون راتب</Badge>}</td>
                      <td style={td}>{t.requires_attachment ? '📎 مطلوب' : '—'}</td>
                      <td style={{ ...td, color: '#64748b' }}>{t.usage || 0} طلب</td>
                      <td style={td}>{t.is_active ? <Badge color="#16a34a">مفعّل</Badge> : <Badge color="#dc2626">معطّل</Badge>}</td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>{canEdit && <><button onClick={() => setForm({ open: true, item: t })} style={btn('#eef4ff', '#1565c0', { padding: '4px 10px' })} data-testid={`lt-edit-${t.key}`}>تعديل</button> {!t.system && <button onClick={() => del(t)} style={btn('#ffebee', '#c62828', { padding: '4px 10px' })} data-testid={`lt-del-${t.key}`}>حذف</button>}</>}</td>
                    </tr>))}
                </tbody>
              </table>
            </View>
          )}
        </>)}
        {form?.open && <TypeForm item={form.item} cats={cats} onClose={() => setForm(null)} onSaved={load} />}
      </ScrollView>
    </SafeAreaView>
  );
}
