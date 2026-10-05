import React, { useEffect, useState, useCallback } from 'react';
import { corrAPI, errMsg } from '../src/services/corrAPI';
import { CorrPage, card, btn, inp, th, td, Badge, Modal, Field, Denied, useCorrMe } from '../src/components/corr/CorrUI';

const TYPES: Record<string, string> = { presidency: 'رئاسة', vice_presidency: 'نيابة رئاسة', faculty: 'كلية', deanship: 'عمادة', center: 'مركز', administration: 'إدارة', department: 'قسم', unit: 'وحدة', office: 'مكتب', committee: 'لجنة' };
const EMPTY = { name_ar: '', name_en: '', code: '', organization_type: 'administration', parent_id: '', is_active: true };

export default function CorrOrganizations() {
  const { me, hasAnywhere } = useCorrMe();
  const [units, setUnits] = useState<any[]>([]);
  const [audit, setAudit] = useState<any>(null);
  const [form, setForm] = useState<{ unit: any | null; f: any } | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try { setUnits((await corrAPI.organizations(true)).data); } catch {} finally { setLoading(false); }
    corrAPI.codeAudit().then((r) => setAudit(r.data)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);
  const save = async () => {
    setErr('');
    try {
      const payload = { ...form!.f, parent_id: form!.f.parent_id || null };
      if (form!.unit) await corrAPI.updateOrganization(form!.unit.id, payload); else await corrAPI.createOrganization(payload);
      setForm(null); load();
    } catch (e) { setErr(errMsg(e, 'فشل الحفظ')); }
  };
  const children = (pid: string | null) => units.filter((u) => (u.parent_id || null) === pid);
  const Tree = ({ pid, depth }: { pid: string | null; depth: number }) => (
    <>
      {children(pid).map((u) => (
        <React.Fragment key={u.id}>
          <tr data-testid={`corr-org-row-${u.id}`} style={{ opacity: u.is_active ? 1 : 0.5 }}>
            <td style={{ ...td, paddingRight: 8 + depth * 22, fontWeight: 700 }}>{depth > 0 && <span style={{ color: '#94a3b8' }}>└ </span>}{u.name_ar}{!u.is_active && <Badge text="موقوفة" color="#64748b" />}</td>
            <td style={td}><code>{u.code}</code></td><td style={td}>{TYPES[u.organization_type] || u.organization_type}</td><td style={td}>{u.name_en}</td>
            <td style={td}>{hasAnywhere('organizations.manage') && <>
              <button onClick={() => setForm({ unit: u, f: { name_ar: u.name_ar, name_en: u.name_en, code: u.code, organization_type: u.organization_type, parent_id: u.parent_id || '', is_active: u.is_active } })} style={btn('#1565c0', { padding: '4px 10px', marginLeft: 4 })} data-testid={`corr-org-edit-${u.id}`}>تعديل</button>
              <button onClick={() => setForm({ unit: null, f: { ...EMPTY, parent_id: u.id } })} style={btn('#16a34a', { padding: '4px 10px' })}>+ فرعية</button>
            </>}</td>
          </tr>
          <Tree pid={u.id} depth={depth + 1} />
        </React.Fragment>
      ))}
    </>
  );
  if (me && !hasAnywhere('organizations.manage')) return <CorrPage title="الهيكل التنظيمي"><Denied /></CorrPage>;
  return (
    <CorrPage title="الهيكل التنظيمي" subtitle="المصدر الموحد org_units — تُستخدم ككيانات المراسلات (المالكة/المرسلة/المستلمة)" loading={loading} testID="corr-organizations"
      actions={<button onClick={() => setForm({ unit: null, f: EMPTY })} style={btn('#16a34a')} data-testid="corr-org-add">+ وحدة</button>}>
      {audit && (
        <div style={{ ...card, borderRight: `5px solid ${audit.clean ? '#16a34a' : '#dc2626'}`, fontSize: 12.5 }} data-testid="corr-org-audit">
          <b>تدقيق أكواد الوحدات:</b> {audit.total} وحدة · مكررة: {Object.keys(audit.duplicates).length} · فارغة: {audit.empty_codes.length} · يتيمة: {audit.orphans.length} · حلقات: {audit.cycles.length}
          {audit.clean ? <Badge text="نظيف — الفهرس الفريد مُفعَّل" color="#16a34a" /> : <Badge text="يوجد تعارضات — الفهرس الفريد معلّق حتى المعالجة" color="#dc2626" />}
          {!audit.clean && <pre style={{ fontSize: 11, direction: 'ltr', textAlign: 'left', maxHeight: 160, overflow: 'auto' }}>{JSON.stringify({ duplicates: audit.duplicates, empty: audit.empty_codes, orphans: audit.orphans }, null, 1)}</pre>}
        </div>
      )}
      <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }} data-testid="corr-org-table">
          <thead><tr><th style={th}>الاسم</th><th style={th}>الكود</th><th style={th}>النوع</th><th style={th}>الاسم الإنجليزي</th><th style={th}></th></tr></thead>
          <tbody><Tree pid={null} depth={0} /></tbody>
        </table>
      </div>
      {form && (
        <Modal title={form.unit ? 'تعديل وحدة' : 'وحدة تنظيمية جديدة'} onClose={() => setForm(null)} testID="corr-org-modal">
          <Field label="الاسم العربي *"><input style={inp} value={form.f.name_ar} onChange={(e) => setForm({ ...form, f: { ...form.f, name_ar: e.target.value } })} data-testid="corr-org-name" /></Field>
          <Field label="الاسم الإنجليزي"><input style={{ ...inp, direction: 'ltr' }} value={form.f.name_en} onChange={(e) => setForm({ ...form, f: { ...form.f, name_en: e.target.value } })} /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="الكود (فريد) *"><input style={{ ...inp, direction: 'ltr' }} value={form.f.code} onChange={(e) => setForm({ ...form, f: { ...form.f, code: e.target.value } })} data-testid="corr-org-code" /></Field>
            <Field label="النوع"><select style={inp} value={form.f.organization_type} onChange={(e) => setForm({ ...form, f: { ...form.f, organization_type: e.target.value } })}>{Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          </div>
          <Field label="الوحدة الأم"><select style={inp} value={form.f.parent_id} onChange={(e) => setForm({ ...form, f: { ...form.f, parent_id: e.target.value } })} data-testid="corr-org-parent"><option value="">— جذر —</option>{units.filter((u) => u.id !== form.unit?.id).map((u) => <option key={u.id} value={u.id}>{u.name_ar} ({u.code})</option>)}</select></Field>
          <label style={{ fontSize: 12.5, display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10 }}><input type="checkbox" checked={form.f.is_active} onChange={(e) => setForm({ ...form, f: { ...form.f, is_active: e.target.checked } })} /> نشطة</label>
          {!!err && <div style={{ color: '#b91c1c', fontSize: 12.5, marginBottom: 8 }} data-testid="corr-org-error">{err}</div>}
          <div style={{ display: 'flex', gap: 8 }}><button onClick={save} style={btn('#16a34a')} data-testid="corr-org-save">حفظ</button><button onClick={() => setForm(null)} style={btn('#94a3b8')}>إلغاء</button></div>
        </Modal>
      )}
    </CorrPage>
  );
}
