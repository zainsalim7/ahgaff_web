import React from 'react';
import { StatementBodyEditor } from '../statements/StatementBodyEditor';
import { Badge } from '../corr/CorrUI';

export type Sections = Record<string, string>;
type Sec = { key: string; label: string; vars: string[]; align: 'right' | 'center'; h: number; hint: string };

const SECS: Sec[] = [
  { key: 'recipient', label: 'المرسَل إليه', vars: ['{اسم_المرسل_إليه}', '{تكريم}', '{صفة_المرسل_إليه}', '{جهة_المرسل_إليه}'], align: 'right', h: 70, hint: 'يُملأ من حقل المرسَل إليه في نموذج الإصدار' },
  { key: 'greeting', label: 'التحية', vars: [], align: 'right', h: 44, hint: '' },
  { key: 'subject', label: 'سطر الموضوع', vars: ['{الموضوع}'], align: 'center', h: 44, hint: 'نص الموضوع نفسه يُكتب في نموذج الإصدار' },
  { key: 'closing', label: 'الخاتمة', vars: [], align: 'right', h: 44, hint: '' },
  { key: 'signature', label: 'التوقيع', vars: ['{صفة_الموقع}', '{اسم_الموقع}'], align: 'center', h: 60, hint: 'الاسم والصفة من حقل الموقِّع' },
];

type Num = [string, string, number, number, number];
const ADV_GROUPS: { title: string; nums: Num[] }[] = [
  { title: 'الصفحة والكليشة', nums: [['margin_side', 'الهامش الجانبي (مم)', 10, 30, 1], ['header_bottom', 'نهاية الكليشة من الأعلى (مم)', 20, 70, 1], ['ref_y', 'سطر الرقم/التاريخ من الأعلى (مم)', 30, 90, 1], ['start_y', 'بداية المحتوى من الأعلى (مم)', 40, 120, 1], ['ref_x', 'إزاحة الرقم/التاريخ من الهامش (مم)', 0, 80, 1], ['ref_font', 'حجم خط الرقم (pt)', 9, 18, 0.5]] },
  { title: 'سطور الكليشة', nums: [['header_font_ar1', 'السطر الأول عربي (pt)', 10, 26, 0.5], ['header_font_ar2', 'السطر الثاني عربي (pt)', 8, 20, 0.5], ['header_font_en1', 'السطر الأول إنجليزي (pt)', 8, 20, 0.5], ['header_font_en2', 'السطر الثاني إنجليزي (pt)', 7, 16, 0.5], ['header_line1', 'ارتفاع السطر الأول فوق الخط (مم)', 5, 45, 1], ['header_line2', 'ارتفاع السطر الثاني فوق الخط (مم)', 2, 40, 1]] },
  { title: 'المتن والمسافات', nums: [['body_font', 'حجم خط المتن (pt)', 10, 18, 0.5], ['body_leading', 'تباعد أسطر المتن', 1.1, 2.2, 0.05], ['body_indent', 'بادئة أول سطر (مم)', 0, 30, 1], ['gap_recipient', 'مسافة بعد المرسَل إليه (مم)', 0, 30, 1], ['gap_greeting', 'مسافة بعد التحية (مم)', 0, 30, 1], ['gap_subject', 'مسافة بعد الموضوع (مم)', 0, 30, 1], ['gap_closing', 'مسافة قبل الخاتمة (مم)', 0, 30, 1], ['gap_signature', 'مسافة قبل التوقيع (مم)', 0, 40, 1], ['recipient_indent', 'إزاحة المرسَل إليه من الهامش (مم)', 0, 60, 1], ['greeting_indent', 'إزاحة التحية من الهامش (مم)', 0, 100, 1], ['signature_offset', 'إزاحة التوقيع من الهامش (مم)', 0, 80, 1]] },
  { title: 'الجدول', nums: [['table_font', 'حجم خط الجدول (pt)', 7, 14, 0.5], ['table_row_h', 'ارتفاع الصف (مم)', 5, 12, 0.5], ['gap_table_before', 'مسافة قبل الجدول (مم)', 0, 30, 1], ['gap_table_after', 'مسافة بعد الجدول (مم)', 0, 30, 1]] },
  { title: '💧 العلامة المائية', nums: [['watermark_opacity', 'الشفافية (0–1)', 0, 1, 0.05], ['watermark_width', 'العرض (مم)', 40, 200, 5], ['watermark_y', 'الموضع من الأعلى (مم)', 40, 260, 5], ['watermark_rotate', 'الدوران (درجة)', -90, 90, 5]] },
];
const ADV_SELECTS: [string, string, [string, string][]][] = [
  ['ref_layout', 'ترتيب الرقم والتاريخ', [['num_left', 'الرقم يسار والتاريخ يمين'], ['num_right', 'الرقم يمين والتاريخ يسار'], ['stack_right', 'متراصّة يميناً'], ['stack_left', 'متراصّة يساراً']]],
  ['signature_align', 'جهة كتلة التوقيع', [['left', 'يسار'], ['center', 'وسط'], ['right', 'يمين']]],
];

type Props = {
  sections: Sections; onChange: (key: string, html: string) => void; onReset?: () => void; actions?: React.ReactNode;
  layout?: Record<string, any>; layoutDefaults?: Record<string, any>; onLayoutChange?: (l: Record<string, any>) => void; hasTable?: boolean; testID?: string;
};

export const LetterSectionsEditor: React.FC<Props> = ({ sections, onChange, onReset, actions, layout = {}, layoutDefaults = {}, onLayoutChange, hasTable = true, testID = 'letter-sections' }) => {
  const L = { ...layoutDefaults, ...Object.fromEntries(Object.entries(layout || {}).filter(([, v]) => v !== null && v !== undefined && v !== '')) };
  const setL = (k: string, v: any) => onLayoutChange?.({ ...(layout || {}), [k]: v });
  const numInp: React.CSSProperties = { width: 64, padding: '3px 6px', borderRadius: 6, border: '1px solid #dde3ec', fontSize: 12, textAlign: 'center' };
  const fixed = (title: string, text: string) => (
    <div style={{ border: '1.5px dashed #e2e8f0', borderRadius: 10, padding: '6px 10px', marginBottom: 8, background: '#f8fafc', display: 'flex', gap: 8, alignItems: 'center' }} data-testid={`${testID}-fixed-${title}`}>
      <b style={{ fontSize: 12.5, color: '#334155' }}>{title}</b><Badge text="نظامي" color="#64748b" /><span style={{ fontSize: 11.5, color: '#64748b' }}>{text}</span>
    </div>
  );
  return (
    <div data-testid={testID} style={{ direction: 'rtl' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 6 }}>
        <div><b style={{ color: '#0f2440', fontSize: 14 }}>✍️ أجزاء الصفحة</b><div style={{ fontSize: 11.5, color: '#64748b' }}>حرّر كل جزء كما في وورد (خط/حجم/لون/عريض/محاذاة) — المتغيرات بين الأقواس تُملأ تلقائياً عند الإصدار، والنتيجة تظهر في المعاينة الحيّة.</div></div>
        <div style={{ display: 'flex', gap: 6 }}>
          {actions}
          {onReset && <button type="button" onClick={onReset} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #dde3ec', background: '#f8fafc', cursor: 'pointer', fontSize: 12, fontWeight: 700 }} data-testid={`${testID}-reset`}>↺ استعادة الافتراضي</button>}
        </div>
      </div>
      {fixed('الرقم والتاريخ', 'يُنشأ الرقم من سلسلة الترقيم عند الإصدار، والتاريخ تلقائي (هجري/ميلادي)')}
      {SECS.slice(0, 3).map((s) => <SecBlock key={s.key} s={s} html={sections[s.key] || ''} onChange={onChange} testID={testID} />)}
      {fixed('المتن', 'يُكتب في نموذج الإصدار بمحرره الخاص')}
      {hasTable && fixed('جدول الأسماء', 'يُدرج تلقائياً عند إضافة أسماء (أعمدته وألوانه من «إعدادات الجدول»)')}
      {SECS.slice(3).map((s) => <SecBlock key={s.key} s={s} html={sections[s.key] || ''} onChange={onChange} testID={testID} />)}
      {onLayoutChange && (
        <details style={{ marginTop: 10, border: '1px solid #e2e8f0', borderRadius: 10, padding: '6px 10px', background: '#fafbfc' }} data-testid={`${testID}-advanced`}>
          <summary style={{ cursor: 'pointer', fontWeight: 800, color: '#475569', fontSize: 12.5 }}>⚙️ إعدادات متقدمة (هوامش، مواضع، كليشة، علامة مائية) {Object.keys(layout || {}).length ? `· ${Object.keys(layout).length} تعديل` : ''}</summary>
          <div style={{ marginTop: 8, fontSize: 12 }}>
            {ADV_GROUPS.map((g) => (
              <div key={g.title} style={{ marginBottom: 8 }}>
                <div style={{ fontWeight: 800, color: '#0f2440', marginBottom: 4 }}>{g.title}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 4 }}>
                  {g.nums.map(([k, l, mn, mx, st]) => (
                    <label key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, padding: '2px 6px', borderRadius: 6, background: layout?.[k] !== undefined && layout?.[k] !== '' ? '#eff6ff' : 'transparent' }}>
                      <span style={{ color: '#334155' }}>{l}</span>
                      <input type="number" min={mn} max={mx} step={st} value={Number(L[k] ?? 0)} onChange={(e) => setL(k, Number(e.target.value))} style={numInp} data-testid={`${testID}-${k}`} />
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 6 }}>
              {ADV_SELECTS.map(([k, l, opts]) => (
                <label key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, padding: '2px 6px' }}><span style={{ color: '#334155' }}>{l}</span>
                  <select value={String(L[k] ?? opts[0][0])} onChange={(e) => setL(k, e.target.value)} style={{ padding: '3px 6px', borderRadius: 6, border: '1px solid #dde3ec', fontSize: 12 }} data-testid={`${testID}-${k}`}>{opts.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
              <button type="button" onClick={() => onLayoutChange({})} style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid #dde3ec', background: '#fff', cursor: 'pointer', fontSize: 11.5 }} data-testid={`${testID}-layout-reset`}>↺ استعادة القيم الافتراضية</button>
            </div>
          </div>
        </details>
      )}
    </div>
  );
};

const SecBlock: React.FC<{ s: Sec; html: string; onChange: (k: string, h: string) => void; testID: string }> = ({ s, html, onChange, testID }) => (
  <div style={{ border: '1.5px solid #eef0f3', borderRadius: 10, padding: 8, marginBottom: 8, background: '#fff' }} data-testid={`${testID}-card-${s.key}`}>
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}><b style={{ fontSize: 12.5 }}>{s.label}</b><Badge text="قابل للتحرير" color="#6d28d9" />{s.hint && <span style={{ fontSize: 11, color: '#94a3b8' }}>{s.hint}</span>}</div>
    <StatementBodyEditor value={html} onChange={(h) => onChange(s.key, h)} variables={s.vars} defaultAlign={s.align} minHeight={s.h} testID={`${testID}-${s.key}`} />
  </div>
);
