import React, { useEffect, useState, useCallback } from 'react';
import api from '../../services/api';
import { Badge, btn, alertErr } from '../hr/ui';
import { inp } from '../hr/EmployeeFormModal';
import { filenameFromResponse } from '../../utils/exportName';

/** 🔄 خلفية البطاقة الموحدة: تعليمات قابلة للتحرير + معاينة بقالب الكلية المختارة */
export const CardBackEditor: React.FC<{ facultyId: string; template: string; basePath?: string; title?: string }> = ({ facultyId, template, basePath = '/cards', title }) => {
  const [d, setD] = useState<any>(null);
  const [linesText, setLinesText] = useState('');
  const [preview, setPreview] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const isStudents = basePath === '/cards';
  const [scope, setScope] = useState<'faculty' | 'global'>('faculty');
  const load = useCallback(async () => { try { const r = await api.get(`${basePath}/back-settings`, { params: isStudents && facultyId ? { faculty_id: facultyId } : {} }); setD(r.data); setLinesText((r.data.lines || []).join('\n')); setScope(r.data.faculty_override ? 'faculty' : (r.data.can_edit ? 'global' : 'faculty')); } catch (e) { alertErr(e); } }, [basePath, facultyId, isStudents]);
  useEffect(() => { load(); }, [load]);
  const refreshPreview = useCallback(async () => {
    if (!facultyId && basePath === '/cards') return;
    try { const r = await api.get(basePath === '/cards' ? `/cards/back-preview/${facultyId}` : `${basePath}/back-preview`, { responseType: 'blob', params: { t: Date.now() } }); setPreview((p) => { if (p) URL.revokeObjectURL(p); return URL.createObjectURL(r.data); }); } catch { setPreview(''); }
  }, [facultyId, basePath]);
  useEffect(() => { refreshPreview(); }, [refreshPreview, template]);
  if (!d) return null;
  const perFaculty = isStudents && !!facultyId && scope === 'faculty';
  const canEdit = perFaculty ? !!d?.can_edit_faculty : !!d?.can_edit;
  const save = async () => {
    setSaving(true); setMsg('');
    try {
      const r = await api.put(`${basePath}/back-settings`, { enabled: d.enabled, title: d.title, lines: linesText.split('\n').map((x) => x.trim()).filter(Boolean), footer_note: d.footer_note, show_contact: d.show_contact, contact_address: d.contact_address || '', contact_phone: d.contact_phone || '', contact_website: d.contact_website || '' }, { params: perFaculty ? { faculty_id: facultyId } : {} });
      setMsg(r.data.message); setD({ ...d, ...r.data }); refreshPreview();
    } catch (e) { alertErr(e); } finally { setSaving(false); }
  };
  const useGlobal = async () => {
    if (!window.confirm('إلغاء تخصيص خلفية هذه الكلية والعودة إلى الخلفية العامة؟')) return;
    setSaving(true); setMsg('');
    try { const r = await api.delete(`${basePath}/back-settings`, { params: { faculty_id: facultyId } }); setMsg(r.data.message); setD({ ...d, ...r.data }); setLinesText((r.data.lines || []).join('\n')); refreshPreview(); } catch (e) { alertErr(e); } finally { setSaving(false); }
  };
  const startCustomize = () => { if (d.global) { setD({ ...d, title: d.global.title, footer_note: d.global.footer_note, show_contact: d.global.show_contact, enabled: d.global.enabled, contact_address: d.global.contact_address || '', contact_phone: d.global.contact_phone || '', contact_website: d.global.contact_website || '' }); setLinesText((d.global.lines || []).join('\n')); } setScope('faculty'); };
  const reset = () => { if (!window.confirm('استعادة التعليمات الافتراضية؟')) return; setD({ ...d, title: d.defaults.title, footer_note: '' }); setLinesText(d.defaults.lines.join('\n')); };
  const lineCount = linesText.split('\n').filter((x) => x.trim()).length;
  return (
    <div style={{ direction: 'rtl', marginTop: 18, borderTop: '2px dashed #e2e8f0', paddingTop: 14 }} data-testid="card-back-editor">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#0f2440', flex: 1 }}>{title || (isStudents ? '🔄 خلفية البطاقة' : '🔄 خلفية البطاقة')}</div>
        {isStudents && facultyId && <Badge color={d.faculty_override ? '#6a1b9a' : '#64748b'} testID="card-back-scope-badge">{d.faculty_override ? '🎓 مخصّصة لهذه الكلية' : '🏛️ تستخدم الخلفية العامة'}</Badge>}
        <Badge color={d.enabled ? '#16a34a' : '#94a3b8'}>{d.enabled ? 'مفعّلة' : 'معطّلة'}</Badge>
      </div>
      {isStudents && facultyId && (
        <div style={{ display: 'flex', gap: 6, margin: '6px 0 8px', flexWrap: 'wrap' }} data-testid="card-back-scope">
          <button onClick={() => setScope('faculty')} style={btn(scope === 'faculty' ? '#6a1b9a' : '#f3e5f5', scope === 'faculty' ? '#fff' : '#6a1b9a', { padding: '4px 12px', fontSize: 12 })} data-testid="card-back-scope-faculty">🎓 خلفية هذه الكلية</button>
          {d.can_edit && <button onClick={() => { setScope('global'); if (d.global) { setD({ ...d, ...d.global }); setLinesText((d.global.lines || []).join('\n')); } }} style={btn(scope === 'global' ? '#0f2440' : '#f1f5f9', scope === 'global' ? '#fff' : '#0f2440', { padding: '4px 12px', fontSize: 12 })} data-testid="card-back-scope-global">🏛️ الخلفية العامة للجامعة</button>}
          {perFaculty && !d.faculty_override && d.can_edit_faculty && <button onClick={startCustomize} style={btn('#ede7f6', '#4527a0', { padding: '4px 12px', fontSize: 12 })} data-testid="card-back-customize">✏️ تخصيص لهذه الكلية</button>}
          {perFaculty && d.faculty_override && d.can_edit_faculty && <button onClick={useGlobal} disabled={saving} style={btn('#f1f5f9', '#475569', { padding: '4px 12px', fontSize: 12 })} data-testid="card-back-use-global">↩️ العودة للخلفية العامة</button>}
        </div>
      )}
      <div style={{ fontSize: 12, color: '#64748b', margin: '4px 0 10px', lineHeight: 1.8 }}>{isStudents ? 'لكل كلية خلفيتها الخاصة (العنوان والتعليمات والتذييل وبيانات التواصل) تُغطّي الخلفية العامة للجامعة؛ وإن لم تُخصَّص تُستخدم العامة. اللون والخط والاتجاه من قالب الكلية.' : 'تُطبع الخلفية بلون القالب المختار تلقائياً، وبيانات التواصل (العنوان/الهاتف/الموقع) تُؤخذ من إعدادات الجامعة ما لم تُحدَّد هنا.'}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5, cursor: 'pointer', marginBottom: 8 }}><input type="checkbox" checked={!!d.enabled} disabled={!canEdit} onChange={(e) => setD({ ...d, enabled: e.target.checked })} data-testid="card-back-enabled" /> تفعيل طباعة الخلفية</label>
          <div style={{ fontSize: 11.5, color: '#64748b', marginBottom: 3 }}>العنوان</div>
          <input value={d.title || ''} disabled={!canEdit} onChange={(e) => setD({ ...d, title: e.target.value })} style={{ ...inp, marginBottom: 8 }} data-testid="card-back-title" />
          <div style={{ fontSize: 11.5, color: '#64748b', marginBottom: 3 }}>بنود التعليمات (سطر لكل بند — حتى 10، الترقيم تلقائي) <Badge color="#1565c0">{lineCount}</Badge></div>
          <textarea value={linesText} disabled={!canEdit} onChange={(e) => setLinesText(e.target.value)} rows={9} style={{ ...inp, resize: 'vertical', lineHeight: 1.8, fontFamily: 'inherit', marginBottom: 8 }} data-testid="card-back-lines" />
          <div style={{ fontSize: 11.5, color: '#64748b', marginBottom: 3 }}>سطر ختامي في التذييل (اختياري)</div>
          <input value={d.footer_note || ''} disabled={!canEdit} onChange={(e) => setD({ ...d, footer_note: e.target.value })} placeholder="مثال: عمادة شؤون الطلاب" style={{ ...inp, marginBottom: 8 }} data-testid="card-back-footer" />
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5, cursor: 'pointer' }}><input type="checkbox" checked={!!d.show_contact} disabled={!canEdit} onChange={(e) => setD({ ...d, show_contact: e.target.checked })} data-testid="card-back-contact" /> إظهار بيانات التواصل في التذييل</label>
          {d.show_contact && (
            <div style={{ marginTop: 8, border: '1px solid #e9d5ff', background: '#faf5ff', borderRadius: 8, padding: 8 }} data-testid="card-back-contact-fields">
              <div style={{ fontSize: 11.5, color: '#6a1b9a', fontWeight: 700, marginBottom: 4 }}>📍 بيانات التواصل {perFaculty ? 'الخاصة بهذه الكلية' : 'في التذييل'} <span style={{ fontWeight: 400, color: '#64748b' }}>— اتركها فارغة لاستخدام بيانات الجامعة</span></div>
              <input value={d.contact_address || ''} disabled={!canEdit} onChange={(e) => setD({ ...d, contact_address: e.target.value })} placeholder={d.university_contact?.address || 'العنوان'} style={{ ...inp, marginBottom: 6 }} data-testid="card-back-contact-address" />
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={d.contact_phone || ''} disabled={!canEdit} onChange={(e) => setD({ ...d, contact_phone: e.target.value })} placeholder={d.university_contact?.phone || 'الهاتف'} style={{ ...inp, direction: 'ltr', textAlign: 'right' }} data-testid="card-back-contact-phone" />
                <input value={d.contact_website || ''} disabled={!canEdit} onChange={(e) => setD({ ...d, contact_website: e.target.value })} placeholder={d.university_contact?.website || 'الموقع / البريد'} style={{ ...inp, direction: 'ltr', textAlign: 'right' }} data-testid="card-back-contact-website" />
              </div>
            </div>
          )}
          {canEdit ? (
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              <button onClick={save} disabled={saving} style={btn('#00796b')} data-testid="card-back-save">{saving ? '...' : perFaculty ? '💾 حفظ خلفية الكلية' : '💾 حفظ الخلفية العامة'}</button>
              <button onClick={reset} style={btn('#f1f5f9', '#475569')} data-testid="card-back-reset">استعادة الافتراضي</button>
            </div>
          ) : <div style={{ fontSize: 11.5, color: '#b45309', marginTop: 8 }}>{perFaculty ? 'تحرير خلفية الكلية متاح لمسؤول الكلية أو مدير النظام' : 'تحرير الخلفية العامة متاح لمدير النظام فقط'}</div>}
          {msg && <div style={{ fontSize: 12.5, color: '#2e7d32', marginTop: 6 }} data-testid="card-back-msg">{msg}</div>}
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11.5, color: '#64748b', marginBottom: 6 }}>معاينة الخلفية بقالب الكلية المختارة {d.enabled ? '' : '(معطّلة)'}</div>
          {preview ? <img src={preview} alt="back" style={{ maxWidth: '100%', maxHeight: 420, borderRadius: 10, boxShadow: '0 4px 14px rgba(0,0,0,0.15)' }} data-testid="card-back-preview-img" /> : <div style={{ color: '#94a3b8', fontSize: 12 }}>اختر كلية لعرض المعاينة</div>}
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>المعاينة تعكس آخر حفظ — احفظ لرؤية التعديلات</div>
        </div>
      </div>
    </div>
  );
};

/** 🖨️ خلفيات الدفعة في نموذج الطباعة: مواضع مستقلة للخلفيتين + تنزيل PDF الخلفيات */
export const BackPrintControls: React.FC<{ st: any; departmentId: string; orientation: string; lastBatchNo?: number | null; count: number; basePath?: string; ready?: boolean }> = ({ st, departmentId, orientation, lastBatchNo, count, basePath = '/cards', ready }) => {
  const [b, setB] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => { api.get(`${basePath}/back-settings`).then((r) => setB(r.data)).catch(() => setB(null)); }, [basePath]);
  if (!b) return null;
  const setNum = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setB({ ...b, [k]: e.target.value.replace(/[^0-9.]/g, '') });
  const download = async (batchNo?: number | null) => {
    setBusy(true); setMsg('');
    try {
      const settings: any = { card_w: parseFloat(st.card_w), card_h: parseFloat(st.card_h) };
      ['back1_x', 'back1_y', 'back2_x', 'back2_y'].forEach((k) => { settings[k] = parseFloat(b[k]); });
      const res = await api.post(`${basePath}/batch-back-pdf`, batchNo ? { batch_no: batchNo, orientation, settings } : { department_id: departmentId, count, orientation, settings }, { responseType: 'blob', timeout: 300000 });
      const url = URL.createObjectURL(new Blob([res.data])); const a = document.createElement('a'); a.href = url; a.download = filenameFromResponse(res, 'خلفيات البطاقات.pdf'); a.click(); URL.revokeObjectURL(url);
      setMsg('✅ تم إنشاء ملف الخلفيات وحفظ مواضعها');
    } catch (e: any) {
      let detail = e?.response?.data?.detail;
      if (e?.response?.data instanceof Blob) { try { detail = JSON.parse(await e.response.data.text()).detail; } catch { /* ignore */ } }
      setMsg(detail || 'فشل إنشاء ملف الخلفيات');
    } finally { setBusy(false); }
  };
  const field = (label: string, k: string) => (
    <div style={{ flex: 1, minWidth: 100 }}>
      <div style={{ fontSize: 11.5, color: '#64748b', marginBottom: 3 }}>{label}</div>
      <input value={b[k] ?? ''} onChange={setNum(k)} inputMode="decimal" style={{ ...inp, direction: 'ltr', textAlign: 'center' }} data-testid={`print-${k}-input`} />
    </div>
  );
  return (
    <div style={{ direction: 'rtl', marginTop: 14, border: '1px solid #ffe0b2', borderRadius: 10, padding: 10, backgroundColor: '#fff8f1' }} data-testid="print-back-controls">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#e65100', flex: 1 }}>🔄 خلفية البطاقة (الوجه الخلفي)</div>
        <Badge color={b.enabled ? '#16a34a' : '#94a3b8'}>{b.enabled ? 'مفعّلة' : 'معطّلة'}</Badge>
      </div>
      <div style={{ fontSize: 11.5, color: '#7c4a03', margin: '4px 0 8px', lineHeight: 1.7 }}>تُطبع الخلفيات بنفس الأسلوب: بطاقتان في كل ورقة A4 بمواضع مستقلة (ملم) تُحفظ تلقائياً. اطبع ورقة الوجه الأمامي ثم أعد إدخالها واطبع الخلفيات، واضبط المواضع حسب انحراف طابعتك. نفس المقاس المحدد أعلاه.</div>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#0f2440', marginBottom: 4 }}>موضع الخلفية الأولى (العلوية)</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>{field('من اليسار (X)', 'back1_x')}{field('من الأعلى (Y)', 'back1_y')}</div>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#0f2440', marginBottom: 4 }}>موضع الخلفية الثانية (السفلية)</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>{field('من اليسار (X)', 'back2_x')}{field('من الأعلى (Y)', 'back2_y')}</div>
      {msg && <div style={{ fontSize: 12.5, color: msg.startsWith('✅') ? '#2e7d32' : '#c62828', marginBottom: 6 }} data-testid="print-back-msg">{msg}</div>}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {lastBatchNo ? <button onClick={() => download(lastBatchNo)} disabled={busy || !b.enabled} style={btn('#e65100')} data-testid="print-back-last-batch-btn">{busy ? '...' : `🔄 خلفيات الدفعة #${lastBatchNo}`}</button> : null}
        <button onClick={() => download(null)} disabled={busy || !b.enabled || (ready === undefined ? !departmentId : !ready) || !count} style={btn(lastBatchNo ? '#fff3e0' : '#e65100', lastBatchNo ? '#e65100' : '#fff')} data-testid="print-back-count-btn">{busy ? '...' : `🔄 خلفيات لـ ${count || 0} بطاقة (التحديد الحالي)`}</button>
      </div>
    </div>
  );
};
