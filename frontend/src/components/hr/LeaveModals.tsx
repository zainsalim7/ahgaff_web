import React, { useEffect, useState } from 'react';
import { hrAPI } from '../../services/api';
import { Modal, Field, inp, btn, opt, errMsg } from './ui';

interface Props { onClose: () => void; onSaved: (msg: string) => void; meta: any; forEmployee?: boolean; }

export const LeaveRequestModal: React.FC<Props> = ({ onClose, onSaved, meta, forEmployee }) => {
  const [f, setF] = useState<any>({ employee_id: '', type: 'annual', start_date: '', end_date: '', reason: '', contact_during_leave: '' });
  const [emps, setEmps] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { if (forEmployee) hrAPI.employees({ per_page: 200 }).then((r) => setEmps(r.data.employees || [])).catch(() => {}); }, [forEmployee]);
  const set = (k: string) => (e: any) => setF((p: any) => ({ ...p, [k]: e.target.value }));

  const save = async () => {
    setBusy(true); setErr('');
    try {
      const payload = { ...f, employee_id: f.employee_id || null };
      const r = forEmployee ? await hrAPI.registerLeave(payload) : await hrAPI.submitMyLeave(payload);
      onSaved(r.data.message); onClose();
    } catch (e) { setErr(errMsg(e, 'فشل الحفظ')); } finally { setBusy(false); }
  };

  return (
    <Modal title={forEmployee ? 'تسجيل إجازة لموظف (تُعتمد مباشرة)' : 'طلب إجازة جديد'} onClose={onClose} busy={busy} testID="leave-request-modal">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {forEmployee && (
          <Field label="الموظف *" span={2}>
            <select value={f.employee_id} onChange={set('employee_id')} style={inp} data-testid="leave-employee-select">
              <option value="">— اختر الموظف —</option>
              {emps.map((e) => <option key={e.id} value={e.id}>{e.full_name} ({e.employee_no})</option>)}
            </select>
          </Field>
        )}
        <Field label="نوع الإجازة" span={2}><select value={f.type} onChange={set('type')} style={inp} data-testid="leave-type-select">{opt(meta?.types)}</select></Field>
        <Field label="من تاريخ *"><input type="date" value={f.start_date} onChange={set('start_date')} style={{ ...inp, direction: 'ltr' }} data-testid="leave-start-date" /></Field>
        <Field label="إلى تاريخ *"><input type="date" value={f.end_date} onChange={set('end_date')} style={{ ...inp, direction: 'ltr' }} data-testid="leave-end-date" /></Field>
        <Field label="السبب / ملاحظات" span={2}><textarea value={f.reason} onChange={set('reason')} rows={3} style={{ ...inp, resize: 'vertical' }} data-testid="leave-reason" /></Field>
        <Field label="وسيلة التواصل أثناء الإجازة" span={2}><input value={f.contact_during_leave} onChange={set('contact_during_leave')} style={inp} data-testid="leave-contact" /></Field>
      </div>
      <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 8, textAlign: 'right' }}>تُحتسب أيام العمل فقط (تُستثنى العطل الأسبوعية والرسمية). الإجازة السنوية تُخصم من الرصيد.</div>
      {err && <div style={{ color: '#c62828', backgroundColor: '#ffebee', padding: '8px 10px', borderRadius: 8, fontSize: 12.5, marginTop: 10, textAlign: 'right' }} data-testid="leave-form-error">{err}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button onClick={save} disabled={busy} style={btn('#1565c0')} data-testid="leave-form-submit">{busy ? 'جاري الحفظ...' : forEmployee ? 'تسجيل واعتماد' : 'إرسال الطلب'}</button>
        <button onClick={onClose} disabled={busy} style={btn('#f1f5f9', '#0f2440')}>إلغاء</button>
      </div>
    </Modal>
  );
};

export const DecisionModal: React.FC<{ leave: any; onClose: () => void; onDone: (msg: string) => void }> = ({ leave, onClose, onDone }) => {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const decide = async (action: 'approve' | 'reject') => {
    if (action === 'reject' && !note.trim()) { window.alert('اكتب سبب الرفض'); return; }
    setBusy(true);
    try { const r = await hrAPI.decideLeave(leave.id, action, note); onDone(r.data.message); onClose(); } catch (e) { window.alert(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Modal title={`قرار على طلب: ${leave.employee_name || ''}`} onClose={onClose} width={480} busy={busy} testID="leave-decision-modal">
      <div style={{ backgroundColor: '#f7f9fc', borderRadius: 10, padding: 12, fontSize: 12.5, textAlign: 'right', lineHeight: 1.9 }}>
        <div><b>النوع:</b> {leave.type_label} · <b>المدة:</b> {leave.days} يوم عمل</div>
        <div><b>الفترة:</b> {leave.start_date} → {leave.end_date}</div>
        {leave.reason && <div><b>السبب:</b> {leave.reason}</div>}
        <div><b>الحالة:</b> {leave.status_label}</div>
      </div>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظة القرار (إلزامية عند الرفض)" rows={3} style={{ ...inp, marginTop: 10, resize: 'vertical' }} data-testid="leave-decision-note" />
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={() => decide('approve')} disabled={busy} style={btn('#16a34a')} data-testid="leave-approve-btn">✅ موافقة</button>
        <button onClick={() => decide('reject')} disabled={busy} style={btn('#ffebee', '#c62828')} data-testid="leave-reject-btn">✕ رفض</button>
      </div>
    </Modal>
  );
};
