import React, { useEffect, useState } from 'react';
import { hrAPI } from '../../services/api';
import { Modal, btn, errMsg } from './ui';

interface Props { employee: any; mode: 'create' | 'change'; onClose: () => void; onDone: (msg: string) => void; }

export const AccountRoleModal: React.FC<Props> = ({ employee, mode, onClose, onDone }) => {
  const [roles, setRoles] = useState<any[]>([]);
  const [roleId, setRoleId] = useState<string>(mode === 'change' ? employee.role_id || '' : '');
  const [busy, setBusy] = useState(false);
  useEffect(() => { hrAPI.hrRoles().then((r) => setRoles(r.data.roles || [])).catch(() => {}); }, []);
  const submit = async () => {
    setBusy(true);
    try {
      const r = mode === 'create' ? await hrAPI.createAccount(employee.id, roleId || null) : await hrAPI.setAccountRole(employee.id, roleId || null);
      onDone(r.data.message); onClose();
    } catch (e) { window.alert(errMsg(e)); } finally { setBusy(false); }
  };
  const Opt = ({ id, name, desc, badge }: any) => (
    <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '9px 10px', borderRadius: 10, border: `1.5px solid ${roleId === id ? '#1565c0' : '#e2e8f0'}`, backgroundColor: roleId === id ? '#eff6ff' : '#fff', cursor: 'pointer', direction: 'rtl' }} data-testid={`role-opt-${id || 'none'}`}>
      <input type="radio" name="role" checked={roleId === id} onChange={() => setRoleId(id)} style={{ marginTop: 3 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 800, color: '#0f2440', fontSize: 13 }}>{name}{badge ? <span style={{ marginRight: 8, fontSize: 10.5, backgroundColor: '#ede9fe', color: '#6d28d9', padding: '1px 7px', borderRadius: 8 }}>{badge}</span> : null}</div>
        {desc ? <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>{desc}</div> : null}
      </div>
    </label>
  );
  return (
    <Modal title={mode === 'create' ? `إنشاء حساب دخول — ${employee.full_name}` : `تغيير دور الحساب — ${employee.full_name}`} onClose={onClose} width={560} busy={busy} testID="account-role-modal">
      {mode === 'create' && <div style={{ fontSize: 12.5, color: '#475569', backgroundColor: '#f7f9fc', padding: '8px 10px', borderRadius: 8, marginBottom: 10, textAlign: 'right' }}>اسم المستخدم وكلمة المرور الأولية = <b>{employee.employee_no}</b> (يُطلب تغييرها عند أول دخول). اختر الدور الإداري للحساب:</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: '50vh', overflowY: 'auto' }}>
        <Opt id="" name="موظف — خدمة ذاتية فقط" desc="ملفه، حضوره، إجازاته، مهامه وتقييمه؛ بدون أي صلاحيات إدارية (المدير المباشر يحصل تلقائياً على صلاحيات فريقه)" />
        {roles.map((r) => <Opt key={r.id} id={r.id} name={r.name} desc={r.description} badge={r.hr ? 'شؤون الموظفين' : r.is_system ? 'نظامي' : undefined} />)}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button onClick={submit} disabled={busy} style={btn('#16a34a')} data-testid="account-role-submit">{busy ? '...' : mode === 'create' ? 'إنشاء الحساب' : 'حفظ الدور'}</button>
        <button onClick={onClose} style={btn('#f1f5f9', '#0f2440')}>إلغاء</button>
      </div>
    </Modal>
  );
};
