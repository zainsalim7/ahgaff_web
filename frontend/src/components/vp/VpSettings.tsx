import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import { btn, card, inp, lbl } from '../corr/CorrUI';
import { errOf, vp } from './vpUi';
import { StepsEditor } from './StepsEditor';

export const VpSettings = ({ settings, onSaved }: { settings: any; onSaved: (s: any) => void }) => {
  const [f, setF] = useState<any>(() => JSON.parse(JSON.stringify(settings)));
  const [msg, setMsg] = useState(''); const [lhs, setLhs] = useState<any[]>([]);
  useEffect(() => { api.get(vp('/letterheads')).then((r) => setLhs(r.data || [])).catch(() => {}); }, []);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const setRow = (k: string, i: number, kk: string, v: any) => set(k, f[k].map((r: any, j: number) => (j === i ? { ...r, [kk]: v } : r)));
  const save = async () => { setMsg(''); try { const r = await api.put(vp('/settings'), { ...f, default_items: (f.default_items || []).map((i: any) => ({ ...i, amount: +i.amount || 0 })) }); onSaved(r.data); setF(JSON.parse(JSON.stringify(r.data))); setMsg('تم الحفظ'); } catch (e) { setMsg(errOf(e)); } };
  const num = (k: string, l: string) => <div style={{ minWidth: 150 }}><span style={lbl}>{l}</span><input type="number" style={inp} value={f[k]} onChange={(e) => set(k, +e.target.value)} data-testid={`vp-set-${k}`} /></div>;
  const txt = (k: string, l: string) => <div style={{ flex: 1, minWidth: 200 }}><span style={lbl}>{l}</span><input style={inp} value={f[k]} onChange={(e) => set(k, e.target.value)} data-testid={`vp-set-${k}`} /></div>;
  return (
    <div data-testid="vp-settings">
      <div style={card}>
        <strong>الأستوديوهات</strong>
        {f.studios.map((s: any, i: number) => (
          <div key={s.id || i} style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
            <input style={{ ...inp, flex: 1 }} placeholder="اسم الأستوديو" value={s.name} onChange={(e) => setRow('studios', i, 'name', e.target.value)} data-testid={`vp-set-studio-name-${i}`} />
            <input style={{ ...inp, flex: 1 }} placeholder="المكان" value={s.location} onChange={(e) => setRow('studios', i, 'location', e.target.value)} data-testid={`vp-set-studio-loc-${i}`} />
            <label style={{ fontSize: 12, display: 'flex', gap: 4 }}><input type="checkbox" checked={s.is_active !== false} onChange={(e) => setRow('studios', i, 'is_active', e.target.checked)} data-testid={`vp-set-studio-active-${i}`} />يعمل</label>
          </div>))}
        <button onClick={() => set('studios', [...f.studios, { name: '', location: '', is_active: true }])} style={btn('#f1f5f9', { color: '#0f2440', marginTop: 8 })} data-testid="vp-set-studio-add">+ أستوديو</button>
      </div>
      <StepsEditor steps={f.pipeline_steps || []} onChange={(v) => set('pipeline_steps', v)} />
      <div style={{ ...card, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {num('min_notice_hours', 'أقل مهلة لطلب الحجز (ساعة)')}{num('max_part_minutes', 'أقصى مدة للجزء (دقيقة)')}{num('stall_days', 'تنبيه التوقف بعد (يوم)')}{num('default_duration_days', 'مهلة العقد الافتراضية (يوم)')}{num('semester_weeks', 'عدد أسابيع الفصل')}
      </div>
      <div style={{ ...card, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}><span style={lbl}>الكليشة (من سجل الخطابات) للعقد وكشف الحساب والنماذج</span>
          <select style={inp} value={f.letterhead_id || ''} onChange={(e) => set('letterhead_id', e.target.value)} data-testid="vp-set-letterhead"><option value="">الكليشة الافتراضية</option>{lhs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
        {txt('first_party_org', 'الطرف الأول (الجهة)')}{txt('first_party_name', 'ممثل الطرف الأول')}{txt('first_party_title', 'بصفته')}{txt('currency', 'العملة')}
      </div>
      {f.default_items && <div style={card}>
        <strong>البنود الافتراضية للعقد الجديد</strong>
        {f.default_items.map((it: any, i: number) => (
          <div key={i} style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
            <input style={{ ...inp, flex: 3 }} value={it.name} onChange={(e) => setRow('default_items', i, 'name', e.target.value)} data-testid={`vp-set-item-name-${i}`} />
            <input type="number" style={{ ...inp, flex: 1 }} value={it.amount} onChange={(e) => setRow('default_items', i, 'amount', e.target.value)} data-testid={`vp-set-item-amount-${i}`} />
            <span style={{ fontSize: 11, minWidth: 90, color: '#64748b' }}>عند قبول البند</span>
            {f.default_items.length > 1 && <button onClick={() => set('default_items', f.default_items.filter((_: any, j: number) => j !== i))} style={btn('#fee2e2', { color: '#b91c1c', padding: '5px 9px' })} data-testid={`vp-set-item-del-${i}`}>✕</button>}
          </div>))}
        <button onClick={() => set('default_items', [...f.default_items, { name: '', amount: 0, kind: 'fixed' }])} style={btn('#f1f5f9', { color: '#0f2440', marginTop: 8 })} data-testid="vp-set-item-add">+ بند</button>
      </div>}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><button onClick={save} style={btn('#0f2440')} data-testid="vp-set-save">حفظ الإعدادات</button><span data-testid="vp-set-msg" style={{ fontWeight: 700 }}>{msg}</span></div>
    </div>
  );
};
