import React, { useEffect, useState, useCallback } from 'react';
import { corrAPI, errMsg } from '../src/services/corrAPI';
import { CorrPage, card, btn, inp, th, td, Badge, Modal, Field, Denied, Empty, useCorrMe } from '../src/components/corr/CorrUI';
import { LetterheadHeader, LetterheadFooter } from '../src/components/corr/A4Preview';

const EMPTY = {
  organization_id: '', name_ar: '', name_en: '', code: '', description: '', is_default: false, is_active: true,
  header_config: { show_logo: true, university_name_ar: '', university_name_en: '', show_organization_name: true, header_text: '', height_mm: 35, align: 'center' },
  footer_config: { footer_text: '', address: '', phone: '', email: '', website: '', height_mm: 20 },
  branding_config: { primary_color: '#0f2440', logo_asset_url: '' },
  page_config: { size: 'A4', orientation: 'portrait', margins_mm: { top: 15, right: 20, bottom: 15, left: 20 }, direction: 'rtl', font_size_pt: 12, line_height: 1.7 },
};
const SLOTS: [string, string][] = [['logo_asset_id', 'الشعار الرئيسي'], ['secondary_logo_asset_id', 'شعار ثانوي'], ['header_background_asset_id', 'خلفية الرأس'], ['accreditation_asset_id', 'شعار اعتماد'], ['seal_asset_id', 'ختم الجهة (يُطبع مع التوقيع)']];

export default function CorrLetterheads() {
  const { me, hasAnywhere } = useCorrMe();
  const [rows, setRows] = useState<any[]>([]);
  const [orgs, setOrgs] = useState<any[]>([]);
  const [form, setForm] = useState<{ item: any | null; f: any } | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [filterOrg, setFilterOrg] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const [l, o] = await Promise.all([corrAPI.letterheads(filterOrg ? { organization_id: filterOrg } : {}), corrAPI.organizations()]);
      setRows(l.data); setOrgs(o.data);
    } catch (e) { setErr(errMsg(e)); } finally { setLoading(false); }
  }, [filterOrg]);
  useEffect(() => { load(); }, [load]);

  const set = (path: string, v: any) => setForm((p) => {
    if (!p) return p;
    const f = JSON.parse(JSON.stringify(p.f));
    const parts = path.split('.'); let cur = f;
    for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
    cur[parts[parts.length - 1]] = v;
    return { ...p, f };
  });
  const save = async () => {
    setBusy(true); setErr('');
    try {
      if (form!.item) { const { organization_id, code, is_default, ...patch } = form!.f; await corrAPI.updateLetterhead(form!.item.id, patch); }
      else await corrAPI.createLetterhead(form!.f);
      setForm(null); load();
    } catch (e) { setErr(errMsg(e, 'فشل الحفظ')); } finally { setBusy(false); }
  };
  const upload = async (slot: string, file?: File) => {
    if (!file || !form?.item) return;
    setBusy(true); setErr('');
    try { const r = await corrAPI.uploadLetterheadAsset(form.item.id, slot, file); set(`branding_config.${slot.replace('_id', '_url')}`, r.data.url); load(); }
    catch (e) { setErr(errMsg(e, 'فشل رفع الملف')); } finally { setBusy(false); }
  };
  const toggleActive = async (r: any) => { try { await corrAPI.updateLetterhead(r.id, { is_active: !r.is_active }); load(); } catch (e) { setErr(errMsg(e)); } };
  const setDefault = async (r: any) => { try { await corrAPI.setDefaultLetterhead(r.id); load(); } catch (e) { setErr(errMsg(e)); } };
  const openEdit = (r: any) => setForm({ item: r, f: { ...EMPTY, ...r, header_config: { ...EMPTY.header_config, ...r.header_config }, footer_config: { ...EMPTY.footer_config, ...r.footer_config }, branding_config: { ...EMPTY.branding_config, ...r.branding_config }, page_config: { ...EMPTY.page_config, ...r.page_config, margins_mm: { ...EMPTY.page_config.margins_mm, ...(r.page_config?.margins_mm || {}) } } } });
  const orgName = (id: string) => orgs.find((o) => o.id === id)?.name_ar || '';

  if (me && !hasAnywhere('letterhead.read') && !hasAnywhere('correspondence.create')) return <CorrPage title="الترويسات"><Denied /></CorrPage>;
  const canCreate = hasAnywhere('letterhead.create');
  return (
    <CorrPage title="الترويسات الرسمية" subtitle="ترويسة كل جهة تُورَّث من الجهة الأم حتى الجذر — تُستخدم في معاينة الخطاب وإصداره" loading={loading} testID="corr-letterheads-page"
      actions={canCreate ? <button onClick={() => setForm({ item: null, f: JSON.parse(JSON.stringify(EMPTY)) })} style={btn('#16a34a')} data-testid="lh-add">+ ترويسة</button> : null}>
      {!!err && <div style={{ ...card, color: '#b91c1c' }} data-testid="lh-error">{err}</div>}
      <div style={{ ...card, display: 'flex', gap: 10, alignItems: 'center' }}>
        <label style={{ fontSize: 12.5, fontWeight: 700 }}>الجهة:</label>
        <select style={{ ...inp, width: 320 }} value={filterOrg} onChange={(e) => setFilterOrg(e.target.value)} data-testid="lh-filter-org"><option value="">كل الجهات ضمن نطاقي</option>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name_ar} ({o.code})</option>)}</select>
        {!!filterOrg && <span style={{ fontSize: 11.5, color: '#64748b' }}>تُعرض ترويسات الجهة وما ترثه من الجهات الأعلى</span>}
      </div>
      {rows.length === 0 ? <Empty text="لا توجد ترويسات" /> : (
        <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }} data-testid="lh-table">
            <thead><tr><th style={th}>الكود</th><th style={th}>الاسم</th><th style={th}>الجهة</th><th style={th}>الإصدار</th><th style={th}>افتراضية</th><th style={th}>الحالة</th><th style={th}></th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id} data-testid={`lh-row-${r.code}`} style={{ opacity: r.is_active ? 1 : 0.55 }}>
                <td style={td}><code>{r.code}</code></td><td style={{ ...td, fontWeight: 700 }}>{r.name_ar}<div style={{ fontSize: 11, color: '#64748b', fontWeight: 400 }}>{r.description}</div></td>
                <td style={td}>{r.organization_name}</td><td style={td}>v{r.version}</td>
                <td style={td}>{r.is_default ? <Badge text="افتراضية" color="#16a34a" /> : (hasAnywhere('letterhead.set_default') && r.is_active && <button onClick={() => setDefault(r)} style={btn('#0ea5e9', { padding: '3px 8px' })} data-testid={`lh-default-${r.code}`}>تعيين</button>)}</td>
                <td style={td}><Badge text={r.is_active ? 'نشطة' : 'موقوفة'} color={r.is_active ? '#16a34a' : '#64748b'} /></td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>
                  <button onClick={() => openEdit(r)} style={btn('#1565c0', { padding: '4px 10px', marginLeft: 4 })} data-testid={`lh-edit-${r.code}`}>{hasAnywhere('letterhead.update') ? 'تعديل / معاينة' : 'معاينة'}</button>
                  {hasAnywhere('letterhead.activate') && <button onClick={() => toggleActive(r)} style={btn(r.is_active ? '#dc2626' : '#16a34a', { padding: '4px 10px' })} data-testid={`lh-toggle-${r.code}`}>{r.is_active ? 'إيقاف' : 'تفعيل'}</button>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {form && (
        <Modal title={form.item ? `ترويسة ${form.item.code} (v${form.item.version})` : 'ترويسة جديدة'} onClose={() => setForm(null)} testID="lh-modal" width={1040}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 420px', gap: 16 }}>
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label="الجهة *"><select style={inp} value={form.f.organization_id} disabled={!!form.item} onChange={(e) => set('organization_id', e.target.value)} data-testid="lh-org"><option value="">— اختر —</option>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name_ar} ({o.code})</option>)}</select></Field>
                <Field label="الكود *"><input style={{ ...inp, direction: 'ltr' }} value={form.f.code} disabled={!!form.item} onChange={(e) => set('code', e.target.value.toUpperCase())} data-testid="lh-code" /></Field>
                <Field label="الاسم العربي *"><input style={inp} value={form.f.name_ar} onChange={(e) => set('name_ar', e.target.value)} data-testid="lh-name" /></Field>
                <Field label="الاسم الإنجليزي"><input style={{ ...inp, direction: 'ltr' }} value={form.f.name_en || ''} onChange={(e) => set('name_en', e.target.value)} /></Field>
              </div>
              <Field label="الوصف"><input style={inp} value={form.f.description || ''} onChange={(e) => set('description', e.target.value)} /></Field>
              <div style={{ fontWeight: 800, color: '#0f2440', fontSize: 13, margin: '8px 0 6px' }}>الرأس</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label="اسم الجامعة (عربي)"><input style={inp} value={form.f.header_config.university_name_ar} onChange={(e) => set('header_config.university_name_ar', e.target.value)} data-testid="lh-uni-ar" /></Field>
                <Field label="اسم الجامعة (إنجليزي)"><input style={{ ...inp, direction: 'ltr' }} value={form.f.header_config.university_name_en} onChange={(e) => set('header_config.university_name_en', e.target.value)} /></Field>
                <Field label="نص إضافي في الرأس"><input style={inp} value={form.f.header_config.header_text} onChange={(e) => set('header_config.header_text', e.target.value)} data-testid="lh-header-text" /></Field>
                <Field label="المحاذاة"><select style={inp} value={form.f.header_config.align} onChange={(e) => set('header_config.align', e.target.value)}><option value="center">وسط</option><option value="split">موزّع (شعار يمين/يسار)</option></select></Field>
              </div>
              <div style={{ display: 'flex', gap: 16, fontSize: 12.5, marginBottom: 8 }}>
                <label style={{ display: 'flex', gap: 6 }}><input type="checkbox" checked={!!form.f.header_config.show_logo} onChange={(e) => set('header_config.show_logo', e.target.checked)} /> إظهار الشعار</label>
                <label style={{ display: 'flex', gap: 6 }}><input type="checkbox" checked={form.f.header_config.show_organization_name !== false} onChange={(e) => set('header_config.show_organization_name', e.target.checked)} /> إظهار اسم الجهة</label>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>اللون الأساسي <input type="color" value={form.f.branding_config.primary_color || '#0f2440'} onChange={(e) => set('branding_config.primary_color', e.target.value)} data-testid="lh-color" /></label>
              </div>
              <div style={{ fontWeight: 800, color: '#0f2440', fontSize: 13, margin: '8px 0 6px' }}>التذييل</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label="نص التذييل"><input style={inp} value={form.f.footer_config.footer_text} onChange={(e) => set('footer_config.footer_text', e.target.value)} data-testid="lh-footer-text" /></Field>
                <Field label="العنوان"><input style={inp} value={form.f.footer_config.address} onChange={(e) => set('footer_config.address', e.target.value)} /></Field>
                <Field label="الهاتف"><input style={{ ...inp, direction: 'ltr' }} value={form.f.footer_config.phone} onChange={(e) => set('footer_config.phone', e.target.value)} /></Field>
                <Field label="البريد"><input style={{ ...inp, direction: 'ltr' }} value={form.f.footer_config.email} onChange={(e) => set('footer_config.email', e.target.value)} /></Field>
                <Field label="الموقع"><input style={{ ...inp, direction: 'ltr' }} value={form.f.footer_config.website} onChange={(e) => set('footer_config.website', e.target.value)} /></Field>
                <Field label="حجم الخط (pt)"><input type="number" style={inp} value={form.f.page_config.font_size_pt} onChange={(e) => set('page_config.font_size_pt', Number(e.target.value))} /></Field>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
                {(['top', 'right', 'bottom', 'left'] as const).map((k) => <Field key={k} label={`هامش ${{ top: 'أعلى', right: 'يمين', bottom: 'أسفل', left: 'يسار' }[k]} (مم)`}><input type="number" style={inp} value={form.f.page_config.margins_mm[k]} onChange={(e) => set(`page_config.margins_mm.${k}`, Number(e.target.value))} /></Field>)}
              </div>
              {form.item && hasAnywhere('letterhead.update') && (
                <div style={{ marginTop: 6 }}>
                  <div style={{ fontWeight: 800, color: '#0f2440', fontSize: 13, marginBottom: 6 }}>الأصول (PNG/JPG/SVG/WebP ≤ 2MB — تُحفظ في التخزين السحابي)</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {SLOTS.map(([slot, label]) => (
                      <label key={slot} style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4, padding: 8, border: '1px dashed #cbd5e1', borderRadius: 8, cursor: 'pointer' }}>
                        <span style={{ fontWeight: 700 }}>{label} {form.f.branding_config[slot.replace('_id', '_url')] ? '✓' : ''}</span>
                        <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" style={{ fontSize: 11 }} onChange={(e) => upload(slot, e.target.files?.[0])} data-testid={`lh-upload-${slot}`} />
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {!form.item && <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 6 }}>احفظ الترويسة أولاً ثم ارفع الشعار والخلفيات.</div>}
              {!form.item && <label style={{ fontSize: 12.5, display: 'flex', gap: 6, marginTop: 6 }}><input type="checkbox" checked={form.f.is_default} onChange={(e) => set('is_default', e.target.checked)} data-testid="lh-is-default" /> تعيينها الافتراضية للجهة</label>}
              {!!err && <div style={{ color: '#b91c1c', fontSize: 12.5, margin: '8px 0' }} data-testid="lh-form-error">{err}</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                {(form.item ? hasAnywhere('letterhead.update') : true) && <button onClick={save} disabled={busy || !form.f.organization_id || !form.f.code || !form.f.name_ar} style={btn('#16a34a')} data-testid="lh-save">{form.item ? 'حفظ (إصدار جديد)' : 'إنشاء'}</button>}
                <button onClick={() => setForm(null)} style={btn('#94a3b8')}>إغلاق</button>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#0f2440', marginBottom: 6 }}>معاينة حيّة (مقياس مصغّر)</div>
              <div data-testid="lh-preview" style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14, boxShadow: '0 4px 14px rgba(15,36,64,0.12)' }}>
                <LetterheadHeader lh={form.f} orgName={orgName(form.f.organization_id)} scale={0.8} />
                <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1', fontSize: 12 }}>… متن الخطاب …</div>
                <LetterheadFooter lh={form.f} scale={0.8} />
              </div>
            </div>
          </div>
        </Modal>
      )}
    </CorrPage>
  );
}
