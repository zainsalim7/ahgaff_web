import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import { card, btn, inp, Field, Modal, Badge } from '../corr/CorrUI';
import { VisibilityPicker, VIS_LABEL, Visibility } from './LetterheadManager';

const errOf = (e: any, d: string) => e?.response?.data?.detail || d;
const EMPTY = { name: '', description: '', format: '{seq}/خ/{yy}', reset_yearly: true, start_at: 1, visibility: { type: 'private', roles: [] } as Visibility };

const SeriesForm: React.FC<{ initial: any; onSaved: () => void; onClose: () => void }> = ({ initial, onSaved, onClose }) => {
  const [f, setF] = useState<any>({ ...EMPTY, ...initial, visibility: initial?.visibility || EMPTY.visibility });
  const [err, setErr] = useState('');
  const yy = String(new Date().getFullYear() % 100);
  const sample = (f.format || '').replace('{seq}', String(Math.max((f.current || 0) + 1, Number(f.start_at) || 1))).replace('{year}', String(new Date().getFullYear())).replace('{yy}', yy);
  const save = async () => {
    if (!f.name.trim()) { setErr('اسم السلسلة مطلوب'); return; }
    if (!(f.format || '').includes('{seq}')) { setErr('الصيغة يجب أن تحوي {seq}'); return; }
    try {
      const payload = { name: f.name, description: f.description || '', format: f.format, reset_yearly: !!f.reset_yearly, start_at: Number(f.start_at) || 1, visibility: f.visibility };
      if (initial?.id) await api.put(`/letter-series/${initial.id}`, payload); else await api.post('/letter-series', payload);
      onSaved();
    } catch (e) { setErr(errOf(e, 'فشل الحفظ')); }
  };
  return (
    <Modal title={initial?.id ? `تعديل سلسلة: ${initial.name}` : 'سلسلة ترقيم جديدة'} onClose={onClose} width={620} testID="series-modal">
      {err && <div style={{ color: '#b91c1c', fontSize: 12.5, marginBottom: 8 }} data-testid="series-error">{err}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="اسم السلسلة *"><input style={inp} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="مثال: ترقيم داخلي — كلية الشريعة" data-testid="series-name" /></Field>
        <Field label="وصف"><input style={inp} value={f.description || ''} onChange={(e) => setF({ ...f, description: e.target.value })} data-testid="series-description" /></Field>
        <Field label="صيغة الرقم ({seq} {year} {yy})"><input style={{ ...inp, direction: 'ltr', textAlign: 'left' }} value={f.format} onChange={(e) => setF({ ...f, format: e.target.value })} data-testid="series-format" /><div style={{ fontSize: 11.5, color: '#64748b', marginTop: 4 }}>مثال الرقم القادم: <b dir="ltr">{sample}</b></div></Field>
        <Field label="يبدأ العدّ من"><input type="number" min={1} style={inp} value={f.start_at} onChange={(e) => setF({ ...f, start_at: e.target.value })} data-testid="series-start" /></Field>
      </div>
      <label style={{ fontSize: 12.5, display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10 }}><input type="checkbox" checked={!!f.reset_yearly} onChange={(e) => setF({ ...f, reset_yearly: e.target.checked })} data-testid="series-reset-yearly" /> إعادة العدّ من البداية كل سنة</label>
      <VisibilityPicker value={f.visibility} onChange={(v) => setF({ ...f, visibility: v })} testID="series-visibility" />
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button onClick={save} style={btn('#16a34a', { flex: 1 })} data-testid="series-save">حفظ</button>
        <button onClick={onClose} style={btn('#f1f5f9', { color: '#0f2440' })}>إلغاء</button>
      </div>
    </Modal>
  );
};

export const SeriesManager: React.FC<{ isAdmin: boolean; onChanged?: () => void }> = ({ isAdmin, onChanged }) => {
  const [items, setItems] = useState<any[]>([]); const [edit, setEdit] = useState<any | null>(null); const [err, setErr] = useState('');
  const load = () => api.get('/letter-series').then((r) => setItems(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);
  const refresh = () => { load(); onChanged?.(); };
  return (
    <div style={{ ...card, marginTop: 12 }} data-testid="series-manager">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div><b>🔢 سلاسل الترقيم ({items.length})</b><div style={{ fontSize: 11.5, color: '#64748b' }}>مستقلة عن الكليشة — تُختار عند الإصدار (داخلي/خارجي/…)، ولكل سلسلة عدّادها الخاص.</div></div>
        <button onClick={() => setEdit({})} style={btn('#0f2440', { padding: '6px 12px', fontSize: 12 })} data-testid="series-add">+ سلسلة جديدة</button>
      </div>
      {err && <div style={{ color: '#b91c1c', fontSize: 12 }}>{err}</div>}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead><tr style={{ background: '#f1f5f9' }}>{['السلسلة', 'الصيغة', 'الرقم القادم', 'سنوي', 'الرؤية', 'المالك', ''].map((h) => <th key={h} style={{ padding: 8, textAlign: 'right' }}>{h}</th>)}</tr></thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} style={{ borderBottom: '1px solid #e2e8f0', background: it.is_default ? '#fffbeb' : undefined }} data-testid={`series-row-${it.id}`}>
              <td style={{ padding: 8, fontWeight: 800 }}>{it.is_default && '⭐ '}{it.name}{it.description ? <div style={{ fontSize: 11, color: '#64748b', fontWeight: 400 }}>{it.description}</div> : null}</td>
              <td style={{ padding: 8 }} dir="ltr">{it.format}</td>
              <td style={{ padding: 8, fontWeight: 800, color: '#0f2440' }} dir="ltr" data-testid={`series-next-${it.id}`}>{it.next_number}</td>
              <td style={{ padding: 8 }}>{it.reset_yearly ? 'نعم' : 'لا'}</td>
              <td style={{ padding: 8 }}><Badge text={VIS_LABEL[it.visibility?.type] || ''} color="#2563eb" /></td>
              <td style={{ padding: 8, color: '#64748b' }}>{it.owner_name || 'النظام'}</td>
              <td style={{ padding: 8, whiteSpace: 'nowrap' }}>
                {it.can_edit && <button onClick={() => setEdit(it)} style={btn('#f1f5f9', { color: '#0f2440', padding: '4px 10px', fontSize: 12 })} data-testid={`series-edit-${it.id}`}>تعديل</button>}{' '}
                {it.can_edit && !it.is_default && <button onClick={async () => { if (window.confirm('حذف السلسلة؟')) { try { await api.delete(`/letter-series/${it.id}`); refresh(); } catch (e) { setErr(errOf(e, 'فشل الحذف')); } } }} style={btn('#fee2e2', { color: '#b91c1c', padding: '4px 10px', fontSize: 12 })} data-testid={`series-delete-${it.id}`}>حذف</button>}{' '}
                {isAdmin && !it.is_default && <button onClick={async () => { await api.post(`/letter-series/${it.id}/set-default`); refresh(); }} style={btn('#fef3c7', { color: '#b45309', padding: '4px 10px', fontSize: 12 })} data-testid={`series-default-${it.id}`}>⭐ افتراضية</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {edit && <SeriesForm initial={edit} onSaved={() => { setEdit(null); refresh(); }} onClose={() => setEdit(null)} />}
    </div>
  );
};
