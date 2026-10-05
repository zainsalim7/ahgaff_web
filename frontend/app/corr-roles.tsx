import React, { useEffect, useState, useCallback } from 'react';
import { corrAPI, errMsg, SCOPE_AR } from '../src/services/corrAPI';
import { CorrPage, card, btn, inp, th, td, Badge, Modal, Field, Denied, useCorrMe } from '../src/components/corr/CorrUI';

const EMPTY_M = { user_id: '', organization_id: '', job_title: '', is_primary: false, scope_type: 'ORGANIZATION', role_ids: [] as string[], is_active: true };
const EMPTY_R = { code: '', name_ar: '', name_en: '', permissions: [] as string[], is_active: true };

export default function CorrRoles() {
  const { me, hasAnywhere } = useCorrMe();
  const [tab, setTab] = useState<'memberships' | 'roles'>('memberships');
  const [roles, setRoles] = useState<any[]>([]);
  const [perms, setPerms] = useState<any[]>([]);
  const [orgs, setOrgs] = useState<any[]>([]);
  const [mems, setMems] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [uq, setUq] = useState('');
  const [mForm, setMForm] = useState<{ item: any | null; f: any } | null>(null);
  const [rForm, setRForm] = useState<{ item: any | null; f: any } | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const [r, m, o, meta] = await Promise.all([corrAPI.roles(), corrAPI.memberships(), corrAPI.organizations(), corrAPI.meta()]);
      setRoles(r.data); setMems(m.data); setOrgs(o.data); setPerms(meta.data.permissions);
    } catch (e) { setErr(errMsg(e)); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (mForm && !mForm.item) corrAPI.usersLookup(uq).then((r) => setUsers(r.data)).catch(() => {}); }, [uq, mForm]);

  const saveM = async () => {
    setErr('');
    try {
      if (mForm!.item) await corrAPI.updateMembership(mForm!.item.id, mForm!.f); else await corrAPI.createMembership(mForm!.f);
      setMForm(null); load();
    } catch (e) { setErr(errMsg(e, 'فشل الحفظ')); }
  };
  const saveR = async () => {
    setErr('');
    try {
      if (rForm!.item) await corrAPI.updateRole(rForm!.item.id, rForm!.f); else await corrAPI.createRole(rForm!.f);
      setRForm(null); load();
    } catch (e) { setErr(errMsg(e, 'فشل الحفظ')); }
  };
  const deact = async (m: any) => { if (!window.confirm('إيقاف هذه العضوية؟')) return; try { await corrAPI.deactivateMembership(m.id); load(); } catch (e) { setErr(errMsg(e)); } };
  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  if (me && !hasAnywhere('memberships.manage') && !hasAnywhere('permissions.manage')) return <CorrPage title="الأدوار والعضويات"><Denied /></CorrPage>;
  return (
    <CorrPage title="الأدوار والعضويات التنظيمية" subtitle="الدور = ماذا يفعل؟ · النطاق = أين؟ — التقييم يتم في الخادم" loading={loading} testID="corr-roles-page"
      actions={tab === 'memberships'
        ? <button onClick={() => setMForm({ item: null, f: EMPTY_M })} style={btn('#16a34a')} data-testid="corr-mem-add">+ عضوية</button>
        : (hasAnywhere('permissions.manage') ? <button onClick={() => setRForm({ item: null, f: EMPTY_R })} style={btn('#16a34a')} data-testid="corr-role-add">+ دور</button> : null)}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, direction: 'rtl' }}>
        {(['memberships', 'roles'] as const).map((t) => <button key={t} onClick={() => setTab(t)} data-testid={`corr-tab-${t}`} style={btn(tab === t ? '#0f2440' : '#cbd5e1', { color: tab === t ? '#fff' : '#0f2440' })}>{t === 'memberships' ? `العضويات (${mems.length})` : `الأدوار (${roles.length})`}</button>)}
      </div>
      {!!err && <div style={{ ...card, color: '#b91c1c' }} data-testid="corr-roles-error">{err}</div>}
      {tab === 'memberships' && (
        <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }} data-testid="corr-mem-table">
            <thead><tr><th style={th}>المستخدم</th><th style={th}>المنظمة</th><th style={th}>المسمى</th><th style={th}>النطاق</th><th style={th}>الأدوار</th><th style={th}>أساسية</th><th style={th}>الحالة</th><th style={th}></th></tr></thead>
            <tbody>{mems.map((m) => (
              <tr key={m.id} data-testid={`corr-mem-row-${m.id}`} style={{ opacity: m.is_active ? 1 : 0.5 }}>
                <td style={{ ...td, fontWeight: 700 }}>{m.user_name} <span style={{ color: '#94a3b8', fontSize: 11 }}>@{m.username}</span></td>
                <td style={td}>{m.organization_name} <code>{m.organization_code}</code></td><td style={td}>{m.job_title}</td>
                <td style={td}><Badge text={SCOPE_AR[m.scope_type] || m.scope_type} color={m.scope_type === 'UNIVERSITY_WIDE' ? '#991b1b' : '#1565c0'} /></td>
                <td style={td}>{m.roles.map((r: any) => <Badge key={r.id} text={r.name_ar} color="#7c3aed" />)}</td>
                <td style={td}>{m.is_primary ? '✓' : ''}</td><td style={td}><Badge text={m.is_active ? 'نشطة' : 'موقوفة'} color={m.is_active ? '#16a34a' : '#64748b'} /></td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>
                  <button onClick={() => setMForm({ item: m, f: { user_id: m.user_id, organization_id: m.organization_id, job_title: m.job_title, is_primary: m.is_primary, scope_type: m.scope_type, role_ids: m.roles.map((r: any) => r.id), is_active: m.is_active } })} style={btn('#1565c0', { padding: '4px 10px', marginLeft: 4 })} data-testid={`corr-mem-edit-${m.id}`}>تعديل</button>
                  {m.is_active && <button onClick={() => deact(m)} style={btn('#dc2626', { padding: '4px 10px' })}>إيقاف</button>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {tab === 'roles' && (
        <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }} data-testid="corr-role-table">
            <thead><tr><th style={th}>الكود</th><th style={th}>الاسم</th><th style={th}>الصلاحيات</th><th style={th}>النوع</th><th style={th}></th></tr></thead>
            <tbody>{roles.map((r) => (
              <tr key={r.id} data-testid={`corr-role-row-${r.code}`}>
                <td style={td}><code>{r.code}</code></td><td style={{ ...td, fontWeight: 700 }}>{r.name_ar}</td>
                <td style={{ ...td, fontSize: 11, color: '#475569', maxWidth: 520 }}>{(r.permissions || []).join(' · ')}</td>
                <td style={td}><Badge text={r.is_system ? 'نظامي' : 'مخصص'} color={r.is_system ? '#475569' : '#0f766e'} /></td>
                <td style={td}>{hasAnywhere('permissions.manage') && <button onClick={() => setRForm({ item: r, f: { code: r.code, name_ar: r.name_ar, name_en: r.name_en || '', permissions: r.permissions || [], is_active: r.is_active !== false } })} style={btn('#1565c0', { padding: '4px 10px' })} data-testid={`corr-role-edit-${r.code}`}>تعديل</button>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {mForm && (
        <Modal title={mForm.item ? 'تعديل عضوية' : 'عضوية تنظيمية جديدة'} onClose={() => setMForm(null)} testID="corr-mem-modal" width={620}>
          {!mForm.item && (
            <Field label="المستخدم *">
              <input style={{ ...inp, marginBottom: 6 }} placeholder="ابحث بالاسم أو اسم المستخدم" value={uq} onChange={(e) => setUq(e.target.value)} data-testid="corr-mem-user-search" />
              <select style={inp} value={mForm.f.user_id} onChange={(e) => setMForm({ ...mForm, f: { ...mForm.f, user_id: e.target.value } })} data-testid="corr-mem-user"><option value="">— اختر —</option>{users.map((u) => <option key={u.id} value={u.id}>{u.full_name} (@{u.username})</option>)}</select>
            </Field>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="المنظمة *"><select style={inp} value={mForm.f.organization_id} onChange={(e) => setMForm({ ...mForm, f: { ...mForm.f, organization_id: e.target.value } })} data-testid="corr-mem-org"><option value="">— اختر —</option>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name_ar} ({o.code})</option>)}</select></Field>
            <Field label="النطاق"><select style={inp} value={mForm.f.scope_type} onChange={(e) => setMForm({ ...mForm, f: { ...mForm.f, scope_type: e.target.value } })} data-testid="corr-mem-scope">{Object.entries(SCOPE_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <Field label="المسمى الوظيفي"><input style={inp} value={mForm.f.job_title} onChange={(e) => setMForm({ ...mForm, f: { ...mForm.f, job_title: e.target.value } })} /></Field>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', paddingTop: 18 }}>
              <label style={{ fontSize: 12.5, display: 'flex', gap: 6 }}><input type="checkbox" checked={mForm.f.is_primary} onChange={(e) => setMForm({ ...mForm, f: { ...mForm.f, is_primary: e.target.checked } })} /> أساسية</label>
              <label style={{ fontSize: 12.5, display: 'flex', gap: 6 }}><input type="checkbox" checked={mForm.f.is_active} onChange={(e) => setMForm({ ...mForm, f: { ...mForm.f, is_active: e.target.checked } })} /> نشطة</label>
            </div>
          </div>
          <Field label="الأدوار (يمكن اختيار أكثر من دور)">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }} data-testid="corr-mem-roles">
              {roles.filter((r) => r.is_active !== false).map((r) => (
                <label key={r.id} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 999, border: `1.5px solid ${mForm.f.role_ids.includes(r.id) ? '#7c3aed' : '#cbd5e1'}`, backgroundColor: mForm.f.role_ids.includes(r.id) ? '#f3e8ff' : '#fff', cursor: 'pointer' }}>
                  <input type="checkbox" style={{ display: 'none' }} checked={mForm.f.role_ids.includes(r.id)} onChange={() => setMForm({ ...mForm, f: { ...mForm.f, role_ids: toggle(mForm.f.role_ids, r.id) } })} data-testid={`corr-mem-role-${r.code}`} />{r.name_ar} <code style={{ fontSize: 10 }}>{r.code}</code>
                </label>
              ))}
            </div>
          </Field>
          {!!err && <div style={{ color: '#b91c1c', fontSize: 12.5, marginBottom: 8 }} data-testid="corr-mem-error">{err}</div>}
          <div style={{ display: 'flex', gap: 8 }}><button onClick={saveM} disabled={!mForm.f.user_id || !mForm.f.organization_id} style={btn('#16a34a')} data-testid="corr-mem-save">حفظ</button><button onClick={() => setMForm(null)} style={btn('#94a3b8')}>إلغاء</button></div>
        </Modal>
      )}
      {rForm && (
        <Modal title={rForm.item ? `تعديل الدور ${rForm.item.code}` : 'دور جديد'} onClose={() => setRForm(null)} testID="corr-role-modal" width={640}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <Field label="الكود *"><input style={{ ...inp, direction: 'ltr' }} value={rForm.f.code} disabled={!!rForm.item} onChange={(e) => setRForm({ ...rForm, f: { ...rForm.f, code: e.target.value.toUpperCase() } })} data-testid="corr-role-code" /></Field>
            <Field label="الاسم العربي *"><input style={inp} value={rForm.f.name_ar} onChange={(e) => setRForm({ ...rForm, f: { ...rForm.f, name_ar: e.target.value } })} data-testid="corr-role-name" /></Field>
            <Field label="الاسم الإنجليزي"><input style={{ ...inp, direction: 'ltr' }} value={rForm.f.name_en} onChange={(e) => setRForm({ ...rForm, f: { ...rForm.f, name_en: e.target.value } })} /></Field>
          </div>
          <Field label="الصلاحيات">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }} data-testid="corr-role-perms">
              {perms.map((p) => (
                <label key={p.key} style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={rForm.f.permissions.includes(p.key)} disabled={rForm.item?.code === 'SUPER_ADMIN'} onChange={() => setRForm({ ...rForm, f: { ...rForm.f, permissions: toggle(rForm.f.permissions, p.key) } })} /> {p.label} <code style={{ fontSize: 10, color: '#94a3b8' }}>{p.key}</code></label>
              ))}
            </div>
          </Field>
          {!!err && <div style={{ color: '#b91c1c', fontSize: 12.5, marginBottom: 8 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8 }}><button onClick={saveR} disabled={!rForm.f.code || !rForm.f.name_ar} style={btn('#16a34a')} data-testid="corr-role-save">حفظ</button><button onClick={() => setRForm(null)} style={btn('#94a3b8')}>إلغاء</button></div>
        </Modal>
      )}
    </CorrPage>
  );
}
