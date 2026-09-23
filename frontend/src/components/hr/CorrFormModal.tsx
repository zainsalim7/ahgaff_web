import React, { useEffect, useState } from 'react';
import { hrAPI } from '../../services/api';
import { Modal, Field, inp, btn, opt, errMsg } from './ui';

const EMPTY = { direction: 'internal', subject: '', body: '', date: new Date().toISOString().slice(0, 10), priority: 'normal', status: 'registered', from_party: '', to_party: '', to_unit_id: '', to_employee_ids: [] as string[], to_all_employees: false, related_employee_id: '', external_ref: '', due_date: '', attachment_url: '', tags: [] as string[] };

interface Props { onClose: () => void; onSaved: (msg: string) => void; meta: any; units: any[]; item?: any | null; }

export const CorrFormModal: React.FC<Props> = ({ onClose, onSaved, meta, units, item }) => {
  const [f, setF] = useState<any>(EMPTY);
  const [emps, setEmps] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [tagText, setTagText] = useState('');
  const [empSearch, setEmpSearch] = useState('');

  useEffect(() => {
    setF(item ? { ...EMPTY, ...Object.fromEntries(Object.entries(item).filter(([k]) => k in EMPTY).map(([k, v]) => [k, v ?? (Array.isArray((EMPTY as any)[k]) ? [] : '')])) } : EMPTY);
    setTagText(item?.tags?.join(', ') || '');
    hrAPI.employees({ per_page: 200 }).then((r) => setEmps(r.data.employees || [])).catch(() => {});
  }, [item]);
  const set = (k: string) => (e: any) => setF((p: any) => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const internal = ['internal', 'circular'].includes(f.direction);
  const toggleEmp = (id: string) => setF((p: any) => ({ ...p, to_employee_ids: p.to_employee_ids.includes(id) ? p.to_employee_ids.filter((x: string) => x !== id) : [...p.to_employee_ids, id] }));

  const save = async () => {
    setBusy(true); setErr('');
    try {
      const payload = { ...f, to_unit_id: f.to_unit_id || null, related_employee_id: f.related_employee_id || null, due_date: f.due_date || null, date: f.date || null, tags: tagText.split(',').map((t) => t.trim()).filter(Boolean) };
      const r = item?.id ? await hrAPI.updateCorr(item.id, payload) : await hrAPI.createCorr(payload);
      onSaved(r.data.message); onClose();
    } catch (e) { setErr(errMsg(e, 'فشل الحفظ')); } finally { setBusy(false); }
  };

  const filteredEmps = emps.filter((e) => !empSearch || e.full_name.includes(empSearch) || e.employee_no.includes(empSearch));
  return (
    <Modal title={item ? `تعديل مراسلة ${item.ref_no}` : 'مراسلة جديدة'} onClose={onClose} width={720} busy={busy} testID="corr-form-modal">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        <Field label="النوع"><select value={f.direction} onChange={set('direction')} disabled={!!item} style={inp} data-testid="corr-direction">{opt(meta?.directions)}</select></Field>
        <Field label="التاريخ"><input type="date" value={f.date} onChange={set('date')} style={{ ...inp, direction: 'ltr' }} data-testid="corr-date" /></Field>
        <Field label="الأولوية"><select value={f.priority} onChange={set('priority')} style={inp} data-testid="corr-priority">{opt(meta?.priorities)}</select></Field>
        <Field label="الموضوع *" span={3}><input value={f.subject} onChange={set('subject')} style={inp} data-testid="corr-subject" /></Field>
        <Field label="نص المراسلة / الملخص" span={3}><textarea value={f.body} onChange={set('body')} rows={5} style={{ ...inp, resize: 'vertical' }} data-testid="corr-body" /></Field>
        {!internal && (<>
          <Field label={f.direction === 'incoming' ? 'الجهة المُرسِلة' : 'الجهة المُرسَل إليها'} span={2}><input value={f.direction === 'incoming' ? f.from_party : f.to_party} onChange={set(f.direction === 'incoming' ? 'from_party' : 'to_party')} style={inp} data-testid="corr-party" /></Field>
          <Field label="الرقم المرجعي الخارجي"><input value={f.external_ref} onChange={set('external_ref')} style={{ ...inp, direction: 'ltr' }} data-testid="corr-external-ref" /></Field>
        </>)}
        {internal && (<>
          <Field label="الجهة المصدِرة" span={1}><input value={f.from_party} onChange={set('from_party')} placeholder="مثال: إدارة شؤون الموظفين" style={inp} data-testid="corr-from" /></Field>
          <Field label="موجهة إلى وحدة تنظيمية (وكل فروعها)" span={2}><select value={f.to_unit_id} onChange={set('to_unit_id')} style={inp} data-testid="corr-to-unit"><option value="">—</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
          <div style={{ gridColumn: 'span 3' }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, cursor: 'pointer', fontWeight: 700 }}><input type="checkbox" checked={!!f.to_all_employees} onChange={set('to_all_employees')} data-testid="corr-to-all" /> تعميم على جميع الموظفين (يُرسل إشعاراً لكل من لديه حساب)</label>
          </div>
          {!f.to_all_employees && (
            <Field label={`موظفون محددون (${f.to_employee_ids.length})`} span={3}>
              <input value={empSearch} onChange={(e) => setEmpSearch(e.target.value)} placeholder="بحث بالاسم أو الرقم..." style={{ ...inp, marginBottom: 6 }} data-testid="corr-emp-search" />
              <div style={{ maxHeight: 130, overflowY: 'auto', border: '1px solid #eee', borderRadius: 8, padding: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {filteredEmps.slice(0, 60).map((e) => <button key={e.id} onClick={() => toggleEmp(e.id)} style={btn(f.to_employee_ids.includes(e.id) ? '#0f2440' : '#f1f5f9', f.to_employee_ids.includes(e.id) ? '#fff' : '#0f2440', { padding: '4px 10px', fontSize: 11.5, borderRadius: 14 })} data-testid={`corr-emp-${e.id}`}>{e.full_name}</button>)}
              </div>
            </Field>
          )}
        </>)}
        <Field label="موظف معنيّ بالمراسلة (اختياري)" span={1}><select value={f.related_employee_id} onChange={set('related_employee_id')} style={inp} data-testid="corr-related"><option value="">—</option>{emps.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}</select></Field>
        <Field label="تاريخ الاستحقاق / المتابعة"><input type="date" value={f.due_date} onChange={set('due_date')} style={{ ...inp, direction: 'ltr' }} data-testid="corr-due" /></Field>
        <Field label="الحالة"><select value={f.status} onChange={set('status')} style={inp} data-testid="corr-status">{opt(meta?.statuses)}</select></Field>
        <Field label="رابط المرفق (Drive أو غيره)" span={2}><input value={f.attachment_url} onChange={set('attachment_url')} style={{ ...inp, direction: 'ltr' }} data-testid="corr-attachment" /></Field>
        <Field label="وسوم (مفصولة بفاصلة)"><input value={tagText} onChange={(e) => setTagText(e.target.value)} style={inp} data-testid="corr-tags" /></Field>
      </div>
      {err && <div style={{ color: '#c62828', backgroundColor: '#ffebee', padding: '8px 10px', borderRadius: 8, fontSize: 12.5, marginTop: 10, textAlign: 'right' }} data-testid="corr-form-error">{err}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button onClick={save} disabled={busy} style={btn('#1565c0')} data-testid="corr-form-submit">{busy ? 'جاري الحفظ...' : item ? 'حفظ التعديلات' : 'تسجيل المراسلة'}</button>
        <button onClick={onClose} disabled={busy} style={btn('#f1f5f9', '#0f2440')}>إلغاء</button>
      </div>
    </Modal>
  );
};
