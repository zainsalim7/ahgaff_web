import React, { useEffect, useState } from 'react';
import { hrAPI } from '../../services/api';
import { inp, btn, opt, alertErr } from './ui';

const ACTIONS: Record<string, string> = { move_unit: 'نقل إلى وحدة تنظيمية', set_status: 'تغيير الحالة الوظيفية', set_manager: 'تعيين المدير المباشر', set_category: 'تغيير الفئة', set_contract_type: 'تغيير نوع التعاقد', register_leave: 'تسجيل إجازة (معتمدة)', delete: 'حذف (إلى سلة المحذوفات)' };

interface Props { ids: string[]; names: string[]; meta: any; units: any[]; onDone: () => void; onClear: () => void; }

export const BulkToolbar: React.FC<Props> = ({ ids, names, meta, units, onDone, onClear }) => {
  const [action, setAction] = useState('move_unit');
  const [value, setValue] = useState('');
  const [leave, setLeave] = useState({ type: 'annual', start_date: '', end_date: '', reason: '' });
  const [emps, setEmps] = useState<any[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<any>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { hrAPI.employees({ per_page: 200 }).then((r) => setEmps(r.data.employees || [])).catch(() => {}); hrAPI.leavesMeta().then((r) => setLeaveTypes(r.data.types || {})).catch(() => {}); }, []);

  const apply = async () => {
    const needsValue = ['move_unit', 'set_status', 'set_category', 'set_contract_type'].includes(action);
    if (needsValue && !value) { window.alert('اختر القيمة'); return; }
    if (action === 'register_leave' && !(leave.start_date && leave.end_date)) { window.alert('حدد فترة الإجازة'); return; }
    const preview = names.slice(0, 5).join('، ') + (names.length > 5 ? ` و${names.length - 5} آخرين` : '');
    if (!window.confirm(`${ACTIONS[action]} لـ ${ids.length} موظف:\n${preview}\n\n${action === 'delete' ? 'ملفات المعلمين ستُحذف كملفات إدارية فقط (يبقى سجلهم الأكاديمي). ' : ''}متابعة؟`)) return;
    setBusy(true);
    try {
      const r = await hrAPI.bulk({ ids, action, value: value || null, leave: action === 'register_leave' ? leave : null });
      window.alert(r.data.message + (r.data.errors?.length ? '\n\n' + r.data.errors.map((e: any) => `• ${e.name}: ${e.error}`).join('\n') : ''));
      onDone(); onClear();
    } catch (e) { alertErr(e); } finally { setBusy(false); }
  };

  const valueInput = () => {
    switch (action) {
      case 'move_unit': return <select value={value} onChange={(e) => setValue(e.target.value)} style={{ ...inp, width: 240 }} data-testid="bulk-value"><option value="">— اختر الوحدة —</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>;
      case 'set_status': return <select value={value} onChange={(e) => setValue(e.target.value)} style={{ ...inp, width: 200 }} data-testid="bulk-value"><option value="">— الحالة —</option>{opt(meta?.statuses)}</select>;
      case 'set_category': return <select value={value} onChange={(e) => setValue(e.target.value)} style={{ ...inp, width: 200 }} data-testid="bulk-value"><option value="">— الفئة —</option>{opt(meta?.categories)}</select>;
      case 'set_contract_type': return <select value={value} onChange={(e) => setValue(e.target.value)} style={{ ...inp, width: 200 }} data-testid="bulk-value"><option value="">— نوع التعاقد —</option>{opt(meta?.contract_types)}</select>;
      case 'set_manager': return <select value={value} onChange={(e) => setValue(e.target.value)} style={{ ...inp, width: 240 }} data-testid="bulk-value"><option value="">— بدون مدير مباشر —</option>{emps.filter((e) => !ids.includes(e.id)).map((e) => <option key={e.id} value={e.id}>{e.full_name} ({e.employee_no})</option>)}</select>;
      case 'register_leave': return (<>
        <select value={leave.type} onChange={(e) => setLeave({ ...leave, type: e.target.value })} style={{ ...inp, width: 150 }} data-testid="bulk-leave-type">{opt(leaveTypes)}</select>
        <input type="date" value={leave.start_date} onChange={(e) => setLeave({ ...leave, start_date: e.target.value })} style={{ ...inp, width: 150, direction: 'ltr' }} data-testid="bulk-leave-start" />
        <input type="date" value={leave.end_date} onChange={(e) => setLeave({ ...leave, end_date: e.target.value })} style={{ ...inp, width: 150, direction: 'ltr' }} data-testid="bulk-leave-end" />
        <input value={leave.reason} onChange={(e) => setLeave({ ...leave, reason: e.target.value })} placeholder="السبب" style={{ ...inp, width: 160 }} />
      </>);
      default: return null;
    }
  };

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', direction: 'rtl', backgroundColor: '#0f2440', color: '#fff', borderRadius: 12, padding: '10px 14px', marginBottom: 12 }} data-testid="bulk-toolbar">
      <span style={{ fontWeight: 800, fontSize: 13 }}>✓ {ids.length} محدد</span>
      <select value={action} onChange={(e) => { setAction(e.target.value); setValue(''); }} style={{ ...inp, width: 220 }} data-testid="bulk-action">{Object.entries(ACTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      {valueInput()}
      <button onClick={apply} disabled={busy} style={btn(action === 'delete' ? '#dc2626' : '#16a34a')} data-testid="bulk-apply">{busy ? '...' : 'تطبيق'}</button>
      <button onClick={onClear} style={btn('rgba(255,255,255,0.15)', '#fff')} data-testid="bulk-clear">إلغاء التحديد</button>
    </div>
  );
};
