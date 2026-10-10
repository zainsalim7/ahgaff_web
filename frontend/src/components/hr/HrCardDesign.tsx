import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import { Badge, btn, alertErr } from './ui';
import { HrSelect } from './HrSelect';
import { CardBackEditor } from '../cards/CardBack';

const TEMPLATES = [
  { key: 'green', name: 'الرسمي الأخضر', desc: 'ألوان الجامعة — بطاقة عمودية تقليدية', colors: ['#1b5e20', '#fff', '#e8f5e9'] },
  { key: 'official', name: 'الرسمي الأنيق', desc: 'أخضر وأبيض بشريط جانبي — بطاقة عمودية', colors: ['#1b5e20', '#e8f5e9', '#fff'] },
  { key: 'dark', name: 'العصري الداكن', desc: 'خلفية داكنة أنيقة — بطاقة عمودية', colors: ['#071417', '#0f2027', '#4db6ac'] },
  { key: 'horizontal', name: 'الأفقي المدمج', desc: 'كبطاقة الهوية — الصورة يميناً والبيانات يساراً', colors: ['#1b5e20', '#fff', '#e8f5e9'] },
];

/** 🎨 تصميم البطاقة الوظيفية: القالب + الخط مع معاينة حيّة لبطاقة موظف، ثم خلفية البطاقة */
export const HrCardDesign: React.FC<{ emps: any[]; canManage: boolean; onSaved: (tpl: string) => void }> = ({ emps, canManage, onSaved }) => {
  const [s, setS] = useState<any>(null);
  const [tpl, setTpl] = useState('green');
  const [font, setFont] = useState('kufi');
  const [empId, setEmpId] = useState('');
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => { api.get('/hr/card-settings').then((r) => { setS(r.data); setTpl(r.data.template); setFont(r.data.font); }).catch(alertErr); }, []);
  useEffect(() => {
    let alive = true;
    api.get('/hr/cards/sample-preview', { params: { template: tpl, font, employee_id: empId || undefined, t: Date.now() }, responseType: 'blob' })
      .then((r) => { if (alive) setPreview((p) => { if (p) URL.revokeObjectURL(p); return URL.createObjectURL(r.data); }); })
      .catch(() => alive && setPreview(''));
    return () => { alive = false; };
  }, [tpl, font, empId]);

  const save = async () => {
    setBusy(true); setMsg('');
    try { const r = await api.put('/hr/card-settings', { template: tpl, font }); setMsg(r.data.message); onSaved(tpl); } catch (e) { alertErr(e); } finally { setBusy(false); }
  };
  if (!s) return null;
  const dirty = tpl !== s.template || font !== s.font;
  return (
    <div style={{ direction: 'rtl' }} data-testid="hr-card-design">
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)', gap: 16 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#0f2440', marginBottom: 8 }}>🎨 قالب البطاقة الوظيفية (موحّد لكل الموظفين)</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
            {TEMPLATES.map((t) => (
              <button key={t.key} onClick={() => setTpl(t.key)} disabled={!canManage} style={{ textAlign: 'right', cursor: 'pointer', border: tpl === t.key ? '2px solid #1565c0' : '1px solid #e2e8f0', borderRadius: 12, padding: 10, backgroundColor: tpl === t.key ? '#eef4ff' : '#fff' }} data-testid={`hr-tpl-${t.key}`}>
                <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>{t.colors.map((c, i) => <span key={i} style={{ width: 18, height: 18, borderRadius: 5, backgroundColor: c, border: '1px solid #ddd' }} />)}</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#0f2440' }}>{t.name}</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{t.desc}</div>
              </button>
            ))}
          </div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#333', margin: '12px 0 4px' }}>الخط</div>
          <HrSelect value={font} onChange={setFont} disabled={!canManage} options={(s.fonts || []).map((f: any) => ({ value: f.key, label: f.label }))} testID="hr-card-font" />
          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#333', margin: '12px 0 4px' }}>موظف المعاينة</div>
          <HrSelect value={empId} onChange={setEmpId} searchable allowClear placeholder="— تلقائي (أول موظف له صورة) —" options={emps.map((e) => ({ value: e.id, label: e.full_name, sub: [e.number, e.job_title].filter(Boolean).join(' · ') }))} testID="hr-card-sample-emp" />
          {canManage && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 14 }}>
              <button onClick={save} disabled={busy || !dirty} style={btn('#1565c0', '#fff', { opacity: dirty ? 1 : 0.5 })} data-testid="hr-card-design-save">{busy ? '...' : '💾 حفظ التصميم'}</button>
              {dirty && <Badge color="#d97706">تغييرات غير محفوظة</Badge>}
              {msg && <span style={{ fontSize: 12.5, color: '#2e7d32' }} data-testid="hr-card-design-msg">{msg}</span>}
            </div>
          )}
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11.5, color: '#64748b', marginBottom: 6 }}>معاينة حيّة بالقالب والخط المختارين</div>
          {preview ? <img src={preview} alt="card" style={{ maxWidth: '100%', maxHeight: 440, borderRadius: 12, boxShadow: '0 6px 18px rgba(0,0,0,0.18)' }} data-testid="hr-card-sample-img" /> : <div style={{ color: '#94a3b8', fontSize: 12, padding: 40 }}>لا يوجد موظف للمعاينة</div>}
        </div>
      </div>
      <CardBackEditor facultyId="" template={s.template} basePath="/hr/cards" title="🔄 خلفية البطاقة الوظيفية (موحدة لكل الموظفين)" />
    </div>
  );
};
