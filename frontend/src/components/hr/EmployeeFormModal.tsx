import React, { useEffect, useState } from 'react';
// @ts-ignore
import { createPortal } from 'react-dom';

export const Portal: React.FC<{ children: React.ReactNode }> = ({ children }) => (typeof document === 'undefined' ? null : createPortal(children, document.body));
import { hrAPI } from '../../services/api';

export const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #ddd', fontSize: 13, direction: 'rtl', backgroundColor: '#f7f9fc', boxSizing: 'border-box' };
export const lbl: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, color: '#333', marginBottom: 4, textAlign: 'right' };
export const btn = (bg: string, color = '#fff', extra: React.CSSProperties = {}): React.CSSProperties => ({ padding: '9px 16px', borderRadius: 8, border: 'none', backgroundColor: bg, color, fontWeight: 800, fontSize: 13, cursor: 'pointer', ...extra });

export const EMPTY_EMP = {
  employee_no: '', full_name: '', category: 'administrative', job_title: '', grade: '', org_unit_id: '', manager_employee_id: '', contract_type: 'permanent',
  hire_date: '', contract_end_date: '', status: 'active', gender: '', nationality: '', national_id: '', id_expiry_date: '', birth_date: '', phone: '', email: '',
  address: '', emergency_contact: '', qualification: '', specialization: '', notes: '',
};

interface Props { open: boolean; onClose: () => void; onSaved: () => void; employee?: any | null; meta: any; units: any[]; }

export const EmployeeFormModal: React.FC<Props> = ({ open, onClose, onSaved, employee, meta, units }) => {
  const [f, setF] = useState<any>(EMPTY_EMP);
  const [managers, setManagers] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    setErr('');
    setF(employee ? { ...EMPTY_EMP, ...Object.fromEntries(Object.entries(employee).filter(([k]) => k in EMPTY_EMP).map(([k, v]) => [k, v ?? ''])) } : EMPTY_EMP);
    hrAPI.employees({ per_page: 200, status: 'active' }).then((r) => setManagers(r.data.employees || [])).catch(() => setManagers([]));
  }, [open, employee]);

  if (!open) return null;
  const set = (k: string) => (e: any) => setF((p: any) => ({ ...p, [k]: e.target.value }));
  const opt = (m: Record<string, string>) => Object.entries(m || {}).map(([k, v]) => <option key={k} value={k}>{v}</option>);
  const isTeacher = !!employee?.teacher_id;

  const save = async () => {
    setBusy(true); setErr('');
    try {
      const payload: any = { ...f };
      ['hire_date', 'contract_end_date', 'id_expiry_date', 'birth_date', 'org_unit_id', 'manager_employee_id'].forEach((k) => { if (!payload[k]) payload[k] = null; });
      if (employee?.id) await hrAPI.updateEmployee(employee.id, { ...payload, teacher_id: employee.teacher_id || null });
      else await hrAPI.createEmployee(payload);
      onSaved(); onClose();
    } catch (e: any) {
      setErr(typeof e?.response?.data?.detail === 'string' ? e.response.data.detail : 'فشل الحفظ');
    } finally { setBusy(false); }
  };

  const Field = ({ k, label, type = 'text', span = 1, children }: any) => (
    <div style={{ gridColumn: `span ${span}` }}>
      <div style={lbl}>{label}</div>
      {children || <input type={type} value={f[k] || ''} onChange={set(k)} style={{ ...inp, direction: type === 'date' ? 'ltr' : 'rtl' }} data-testid={`emp-${k}`} />}
    </div>
  );

  return (
    <Portal>
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, backgroundColor: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', direction: 'rtl' }} onClick={() => !busy && onClose()}>
      <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: '#fff', borderRadius: 14, padding: 22, width: 760, maxWidth: '96%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.25)' }} data-testid="employee-form-modal">
        <div style={{ fontSize: 16, fontWeight: 800, color: '#0f2440', marginBottom: 4, textAlign: 'right' }}>{employee ? `تعديل ملف: ${employee.full_name}` : 'إضافة موظف جديد'}</div>
        {isTeacher && <div style={{ fontSize: 11.5, color: '#1565c0', backgroundColor: '#e3f2fd', padding: '6px 10px', borderRadius: 8, marginBottom: 10, textAlign: 'right' }}>هذا ملف إداري لمعلم — بياناته الأكاديمية (المقررات، النصاب) تُدار من شاشة المعلمين.</div>}
        <div style={{ fontSize: 12, fontWeight: 800, color: '#5b6678', margin: '10px 0 6px', textAlign: 'right' }}>البيانات الوظيفية</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          <Field k="employee_no" label="الرقم الوظيفي *" />
          <Field k="full_name" label="الاسم الكامل *" span={2} />
          <Field k="category" label="الفئة"><select value={f.category} onChange={set('category')} style={inp} disabled={isTeacher} data-testid="emp-category">{opt(meta?.categories)}</select></Field>
          <Field k="job_title" label="المسمى الوظيفي" />
          <Field k="grade" label="الدرجة" />
          <Field k="org_unit_id" label="الوحدة التنظيمية"><select value={f.org_unit_id || ''} onChange={set('org_unit_id')} style={inp} data-testid="emp-org_unit_id"><option value="">— غير محدد —</option>{units.map((u) => <option key={u.id} value={u.id}>{u.type_label} · {u.name}</option>)}</select></Field>
          <Field k="manager_employee_id" label="المدير المباشر"><select value={f.manager_employee_id || ''} onChange={set('manager_employee_id')} style={inp} data-testid="emp-manager_employee_id"><option value="">— لا يوجد —</option>{managers.filter((m) => m.id !== employee?.id).map((m) => <option key={m.id} value={m.id}>{m.full_name}{m.job_title ? ` (${m.job_title})` : ''}</option>)}</select></Field>
          <Field k="status" label="الحالة"><select value={f.status} onChange={set('status')} style={inp} data-testid="emp-status">{opt(meta?.statuses)}</select></Field>
          <Field k="contract_type" label="نوع التعاقد"><select value={f.contract_type} onChange={set('contract_type')} style={inp} data-testid="emp-contract_type">{opt(meta?.contract_types)}</select></Field>
          <Field k="hire_date" label="تاريخ التعيين" type="date" />
          <Field k="contract_end_date" label="نهاية العقد" type="date" />
        </div>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#5b6678', margin: '14px 0 6px', textAlign: 'right' }}>البيانات الشخصية</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          <Field k="gender" label="الجنس"><select value={f.gender || ''} onChange={set('gender')} style={inp} data-testid="emp-gender"><option value="">—</option><option value="ذكر">ذكر</option><option value="أنثى">أنثى</option></select></Field>
          <Field k="nationality" label="الجنسية" />
          <Field k="birth_date" label="تاريخ الميلاد" type="date" />
          <Field k="national_id" label="رقم الهوية / الجواز" />
          <Field k="id_expiry_date" label="انتهاء الهوية / الإقامة" type="date" />
          <Field k="phone" label="الهاتف" />
          <Field k="email" label="البريد الإلكتروني" span={2} />
          <Field k="emergency_contact" label="جهة اتصال للطوارئ" />
          <Field k="address" label="العنوان" span={3} />
        </div>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#5b6678', margin: '14px 0 6px', textAlign: 'right' }}>المؤهلات وملاحظات</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          <Field k="qualification" label="المؤهل العلمي" />
          <Field k="specialization" label="التخصص" span={2} />
          <Field k="notes" label="ملاحظات" span={3}><textarea value={f.notes || ''} onChange={set('notes')} rows={2} style={{ ...inp, resize: 'vertical' }} data-testid="emp-notes" /></Field>
        </div>
        {err && <div style={{ backgroundColor: '#ffebee', color: '#c62828', padding: '8px 10px', borderRadius: 8, fontSize: 12.5, marginTop: 12, textAlign: 'right' }} data-testid="emp-form-error">{err}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button onClick={save} disabled={busy} style={btn('#1565c0', '#fff', { flex: 1, opacity: busy ? 0.6 : 1 })} data-testid="emp-save-btn">{busy ? 'جاري الحفظ...' : employee ? 'حفظ التعديلات' : 'إضافة الموظف'}</button>
          <button onClick={onClose} disabled={busy} style={btn('#fff', '#555', { border: '1px solid #ddd' })} data-testid="emp-cancel-btn">إلغاء</button>
        </div>
      </div>
    </div>
    </Portal>
  );
};
