import React, { useEffect, useState, useCallback } from 'react';
import { hrAPI } from '../../services/api';
import { Badge, btn, inp, alertErr, opt } from './ui';

export const downloadBlob = (data: Blob, name: string) => { const url = URL.createObjectURL(data); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url); };
export const openBlob = (data: Blob) => { const url = URL.createObjectURL(data); window.open(url, '_blank'); setTimeout(() => URL.revokeObjectURL(url), 60000); };
const EXP_COLOR: Record<string, string> = { expired: '#dc2626', soon: '#f97316', ok: '#16a34a' };
const fmtSize = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export const DocRow: React.FC<{ d: any; canManage?: boolean; onDelete?: (d: any) => void; onEdit?: (d: any) => void }> = ({ d, canManage, onDelete, onEdit }) => {
  const open = async () => { try { openBlob((await hrAPI.docFile(d.id)).data); } catch (e) { alertErr(e); } };
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid #f1f5f9', direction: 'rtl', fontSize: 12.5 }} data-testid={`doc-row-${d.id}`}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, color: '#0f2440' }}>{d.title} <span style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 500 }}>· {d.type_label} · {fmtSize(d.size)}</span></div>
        <div style={{ fontSize: 11, color: '#64748b' }}>{d.issue_date ? `صدر ${d.issue_date}` : ''}{d.expiry_date ? <> · ينتهي <b style={{ color: EXP_COLOR[d.expiry_state] }}>{d.expiry_date}</b>{d.expiry_state === 'expired' ? ' (منتهٍ)' : d.expiry_state === 'soon' ? ` (بعد ${d.days_to_expiry} يوماً)` : ''}</> : ''}{d.notes ? ` · ${d.notes}` : ''}</div>
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <button onClick={open} style={btn('#e3f2fd', '#1565c0', { padding: '5px 10px', fontSize: 11.5 })} data-testid={`doc-open-${d.id}`}>عرض</button>
        {canManage && onEdit && <button onClick={() => onEdit(d)} style={btn('#f1f5f9', '#0f2440', { padding: '5px 10px', fontSize: 11.5 })} data-testid={`doc-edit-${d.id}`}>تعديل</button>}
        {canManage && onDelete && <button onClick={() => onDelete(d)} style={btn('#ffebee', '#c62828', { padding: '5px 10px', fontSize: 11.5 })} data-testid={`doc-del-${d.id}`}>حذف</button>}
      </div>
    </div>
  );
};

export const EmployeeDocuments: React.FC<{ employeeId: string; canManage: boolean }> = ({ employeeId, canManage }) => {
  const [items, setItems] = useState<any[]>([]);
  const [meta, setMeta] = useState<any>(null);
  const [form, setForm] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => hrAPI.docs(employeeId).then((r) => setItems(r.data.items || [])).catch(() => setItems([])), [employeeId]);
  useEffect(() => { load(); hrAPI.docsMeta().then((r) => setMeta(r.data)).catch(() => {}); }, [load]);
  const set = (k: string) => (e: any) => setForm((p: any) => ({ ...p, [k]: e.target.files ? e.target.files[0] : e.target.value }));
  const save = async () => {
    setBusy(true);
    try {
      if (form.id) await hrAPI.updateDoc(form.id, { type: form.type, title: form.title, issue_date: form.issue_date || null, expiry_date: form.expiry_date || null, notes: form.notes });
      else {
        if (!form.file) { window.alert('اختر ملفاً'); setBusy(false); return; }
        const fd = new FormData(); fd.append('file', form.file); ['type', 'title', 'issue_date', 'expiry_date', 'notes'].forEach((k) => fd.append(k, form[k] || ''));
        await hrAPI.uploadDoc(employeeId, fd);
      }
      setForm(null); load();
    } catch (e) { alertErr(e); } finally { setBusy(false); }
  };
  const del = async (d: any) => { if (!window.confirm(`حذف المستند «${d.title}»؟`)) return; try { await hrAPI.deleteDoc(d.id); load(); } catch (e) { alertErr(e); } };
  return (
    <div style={{ marginTop: 14 }} data-testid="employee-documents">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', direction: 'rtl' }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#5b6678' }}>المستندات ({items.length})</div>
        {canManage && <button onClick={() => setForm({ type: 'contract', title: '', issue_date: '', expiry_date: '', notes: '', file: null })} style={btn('#1565c0', '#fff', { padding: '5px 12px', fontSize: 11.5 })} data-testid="doc-add-btn">+ رفع مستند</button>}
      </div>
      {form && (
        <div style={{ backgroundColor: '#f7f9fc', borderRadius: 10, padding: 10, marginTop: 8, direction: 'rtl' }} data-testid="doc-form">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <select value={form.type} onChange={set('type')} style={inp} data-testid="doc-type">{opt(meta?.types)}</select>
            <input value={form.title} onChange={set('title')} placeholder="عنوان المستند" style={inp} data-testid="doc-title" />
            <div><div style={{ fontSize: 10.5, color: '#64748b' }}>تاريخ الإصدار</div><input type="date" value={form.issue_date || ''} onChange={set('issue_date')} style={{ ...inp, direction: 'ltr' }} data-testid="doc-issue" /></div>
            <div><div style={{ fontSize: 10.5, color: '#64748b' }}>تاريخ الانتهاء (للتذكير)</div><input type="date" value={form.expiry_date || ''} onChange={set('expiry_date')} style={{ ...inp, direction: 'ltr' }} data-testid="doc-expiry" /></div>
            <input value={form.notes} onChange={set('notes')} placeholder="ملاحظات" style={{ ...inp, gridColumn: 'span 2' }} />
            {!form.id && <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" onChange={set('file')} style={{ gridColumn: 'span 2', fontSize: 12 }} data-testid="doc-file" />}
          </div>
          <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 4 }}>PDF / صورة / Word — حتى {meta?.max_mb || 10}MB</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button onClick={save} disabled={busy} style={btn('#16a34a', '#fff', { padding: '6px 14px', fontSize: 12 })} data-testid="doc-save">{busy ? 'جاري الرفع...' : form.id ? 'حفظ' : 'رفع'}</button>
            <button onClick={() => setForm(null)} style={btn('#f1f5f9', '#0f2440', { padding: '6px 14px', fontSize: 12 })}>إلغاء</button>
          </div>
        </div>
      )}
      {items.length === 0 ? <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'right', padding: '8px 0' }}>لا توجد مستندات مرفوعة</div> : items.map((d) => <DocRow key={d.id} d={d} canManage={canManage} onDelete={del} onEdit={(x) => setForm({ ...x, notes: x.notes || '', issue_date: x.issue_date || '', expiry_date: x.expiry_date || '' })} />)}
    </div>
  );
};
