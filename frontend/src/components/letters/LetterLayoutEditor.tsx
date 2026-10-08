import React, { useEffect, useRef, useState } from 'react';

export type LetterLayout = Record<string, any>;
type Block = { key: string; label: string; param: string; h: number; color: string; fixed?: boolean };
type Slider = [string, string, number, number, number];
type Pos = Record<string, { top: number; h: number }>;
type Select = [string, string, [string, string][]];
export type LayoutModel = { blocks: Block[]; sliders: Slider[]; toggles: [string, string][]; selects?: Select[]; positions: (num: (k: string) => number, L: LetterLayout, hasTable: boolean) => { pos: Pos; end: number }; sides?: Record<string, (ms: number, L: LetterLayout) => React.CSSProperties> };

// الكتل بترتيبها على الصفحة: المفتاح الذي يتغيّر عند سحب الكتلة + ارتفاع تقريبي للمخطط (مم)
const BLOCKS: Block[] = [
  { key: 'header', label: 'الكليشة (الشعار واسم الجامعة)', param: 'header_bottom', h: 0, color: '#0f2440', fixed: true },
  { key: 'ref', label: 'الرقم / التاريخ', param: 'ref_y', h: 9, color: '#15803d', fixed: true },
  { key: 'recipient', label: 'إلى: المرسَل إليه', param: 'start_y', h: 15, color: '#1d4ed8', fixed: true },
  { key: 'greeting', label: 'السلام عليكم…', param: 'gap_recipient', h: 7, color: '#7c3aed' },
  { key: 'subject', label: 'الموضوع', param: 'gap_greeting', h: 7, color: '#b45309' },
  { key: 'body', label: 'متن الخطاب', param: 'gap_subject', h: 38, color: '#334155' },
  { key: 'table', label: 'جدول الأسماء', param: 'gap_table_before', h: 22, color: '#6d28d9' },
  { key: 'closing', label: 'عبارة الختام', param: 'gap_closing', h: 7, color: '#0e7490' },
  { key: 'signature', label: 'التوقيع', param: 'gap_signature', h: 22, color: '#be123c' },
];
const SLIDERS: Slider[] = [
  ['margin_side', 'الهامش الجانبي (مم)', 10, 30, 1],
  ['body_font', 'حجم خط المتن (pt)', 10, 18, 0.5],
  ['body_leading', 'تباعد أسطر المتن', 1.1, 2.2, 0.05],
  ['table_font', 'حجم خط الجدول (pt)', 7, 14, 0.5],
  ['table_row_h', 'ارتفاع صف الجدول (مم)', 5, 12, 0.5],
  ['gap_table_after', 'مسافة بعد الجدول (مم)', 0, 30, 1],
  ['recipient_indent', '📍 إزاحة المرسَل إليه من الهامش (مم)', 0, 60, 1],
  ['recipient_font', '📍 حجم خط «إلى:» (pt)', 10, 20, 0.5],
  ['recipient_sub_font', '📍 حجم خط الصفة/الجهة (pt)', 9, 18, 0.5],
  ['recipient_line_gap', '📍 تباعد أسطر المرسَل إليه (مم)', 4, 14, 0.5],
  ['recipient_suffix_gap', '📍 مسافة بين الاسم و«المحترم» (مم)', 0, 40, 1],
  ['greeting_indent', '🙏 إزاحة التحية من الهامش (مم)', 0, 100, 1],
  ['body_indent', '✍️ مسافة بادئة لأول سطر في الفقرة (مم)', 0, 30, 1],
  ['signature_title_font', '🖋️ حجم صفة الموقِّع (pt)', 9, 20, 0.5],
  ['signature_name_font', '🖋️ حجم اسم الموقِّع (pt)', 9, 20, 0.5],
  ['greeting_font', '🙏 حجم خط التحية (pt)', 9, 18, 0.5],
  ['ref_x', '🔢 إزاحة الرقم/التاريخ من الهامش (مم)', 0, 80, 1],
  ['ref_font', '🔢 حجم خط الرقم (pt)', 9, 18, 0.5],
  ['signature_offset', '🖋️ إزاحة التوقيع من الهامش (مم)', 0, 80, 1],
  ['header_font_ar1', '🏛️ الكليشة: السطر الأول عربي (pt)', 10, 26, 0.5],
  ['header_font_ar2', '🏛️ الكليشة: السطر الثاني عربي (pt)', 8, 20, 0.5],
  ['header_font_en1', '🏛️ الكليشة: السطر الأول إنجليزي (pt)', 8, 20, 0.5],
  ['header_font_en2', '🏛️ الكليشة: السطر الثاني إنجليزي (pt)', 7, 16, 0.5],
  ['watermark_opacity', '💧 شفافية العلامة المائية (0 = مخفية، 1 = كما هي)', 0, 1, 0.05],
  ['watermark_width', '💧 عرض العلامة المائية (مم)', 40, 200, 5],
  ['watermark_y', '💧 موضع العلامة من أعلى الصفحة (مم)', 40, 260, 5],
  ['watermark_rotate', '💧 دوران العلامة (درجة)', -90, 90, 5],
  ['header_line1', '🏛️ ارتفاع السطر الأول فوق خط الكليشة (مم)', 5, 45, 1],
  ['header_line2', '🏛️ ارتفاع السطر الثاني فوق خط الكليشة (مم)', 2, 40, 1],
];
const SELECTS: Select[] = [
  ['recipient_align', 'محاذاة المرسَل إليه', [['right', 'يمين'], ['center', 'وسط'], ['left', 'يسار (خطاب بلغة أجنبية)']]],
  ['signature_align', 'موضع التوقيع', [['left', 'يسار'], ['center', 'وسط'], ['right', 'يمين']]],
  ['greeting_align', '🙏 موضع التحية', [['right', 'يمين'], ['center', 'وسط'], ['left', 'يسار']]],
  ['recipient_font_family', '📍 خط المرسَل إليه', [['amiri', 'أميري (نسخي رسمي)'], ['kufi', 'نوتو كوفي'], ['cairo', 'القاهرة'], ['tajawal', 'تجوّل'], ['almarai', 'المرعي']]],
  ['signature_font_family', '🖋️ خط الموقِّع', [['amiri', 'أميري (نسخي رسمي)'], ['kufi', 'نوتو كوفي'], ['cairo', 'القاهرة'], ['tajawal', 'تجوّل'], ['almarai', 'المرعي']]],
  ['ref_layout', '🔢 ترتيب الرقم والتاريخ', [['num_left', 'الرقم يسار والتاريخ يمين'], ['num_right', 'الرقم يمين والتاريخ يسار'], ['stack_right', 'متراصّة يميناً'], ['stack_left', 'متراصّة يساراً']]],
];
const PAGE_H = 297, SCALE = 1.9; // مم → بكسل
const mm = (v: number) => v * SCALE;

export const LETTER_MODEL: LayoutModel = {
  blocks: BLOCKS, sliders: SLIDERS, selects: SELECTS,
  toggles: [['show_greeting', 'إظهار «السلام عليكم»'], ['show_closing', 'إظهار عبارة الختام'], ['recipient_bold', '«إلى:» بخط عريض'], ['signature_title_bold', 'صفة الموقِّع عريضة'], ['signature_name_bold', 'اسم الموقِّع عريض']],
  positions: (num, L, hasTable) => {
    const pos: Pos = {};
    pos.header = { top: 0, h: num('header_bottom') };
    pos.ref = { top: num('ref_y') - 5, h: 9 };
    let y = num('start_y') - 5;
    pos.recipient = { top: y, h: 15 }; y += 15 + num('gap_recipient');
    if (L.show_greeting !== false) { pos.greeting = { top: y, h: 7 }; y += 7 + num('gap_greeting'); } else y += num('gap_greeting') * 0.3;
    pos.subject = { top: y, h: 7 }; y += 7 + num('gap_subject');
    const bodyH = Math.max(18, num('body_font') * num('body_leading') * 6 * 0.3528);
    pos.body = { top: y, h: bodyH }; y += bodyH;
    if (hasTable) { y += num('gap_table_before'); const th = num('table_row_h') * 3; pos.table = { top: y, h: th }; y += th + num('gap_table_after'); }
    y += num('gap_closing');
    if (L.show_closing !== false) pos.closing = { top: y, h: 7 };
    y += num('gap_signature');
    pos.signature = { top: y + 2, h: 22 };
    return { pos, end: y + 24 };
  },
  sides: {
    ref: (ms, L) => { const rx = Number(L.ref_x || 0); const rl = L.ref_layout || 'num_left'; return rl === 'num_right' || rl === 'stack_right' ? { right: mm(ms + rx), width: mm(60) } : rl === 'stack_left' ? { left: mm(ms + rx), width: mm(60) } : { left: mm(ms + rx), right: mm(ms + rx) }; },
    greeting: (ms, L) => { const gi = Number(L.greeting_indent || 0); const a = L.greeting_align || 'right'; return a === 'center' ? { left: mm(60), right: mm(60) } : a === 'left' ? { left: mm(ms + gi), width: mm(80) } : { right: mm(ms + gi), width: mm(80) }; },
    recipient: (ms, L) => { const ind = Number(L.recipient_indent || 0); const a = L.recipient_align || 'right'; return a === 'center' ? { left: mm(55), right: mm(55) } : a === 'left' ? { left: mm(ms + ind), width: mm(90) } : { right: mm(ms + ind), width: mm(90) }; },
    signature: (ms, L) => { const off = Number(L.signature_offset || 0); const a = L.signature_align || 'left'; return a === 'center' ? { left: mm(75), right: mm(75) } : a === 'right' ? { right: mm(ms + off), width: mm(60) } : { left: mm(ms + off), width: mm(60) }; },
    subject: () => ({ left: mm(60), right: mm(60) }),
  },
};

export const STATEMENT_MODEL: LayoutModel = {
  blocks: [
    { key: 'header', label: 'الكليشة (الشعار واسم الجامعة/الكلية)', param: 'header_bottom', h: 0, color: '#0f2440', fixed: true },
    { key: 'ref', label: 'المرجع / التاريخ', param: 'ref_y', h: 9, color: '#15803d', fixed: true },
    { key: 'title', label: 'إلى من يهمه الأمر', param: 'title_y', h: 9, color: '#b45309', fixed: true },
    { key: 'intro', label: 'تفيد الكلية بجامعة الأحقاف', param: 'start_y', h: 7, color: '#1d4ed8', fixed: true },
    { key: 'who', label: 'بأن الطالب:', param: 'gap_intro', h: 7, color: '#7c3aed' },
    { key: 'name', label: 'اسم الطالب', param: 'gap_who', h: 8, color: '#0e7490' },
    { key: 'body', label: 'متن الإفادة', param: 'gap_name', h: 30, color: '#334155' },
    { key: 'purpose', label: 'وذلك لغرض…', param: 'gap_purpose', h: 7, color: '#6d28d9' },
    { key: 'signature', label: 'التوقيع (الصفة والاسم)', param: 'gap_signature', h: 20, color: '#be123c' },
  ],
  sliders: [
    ['margin_side', 'الهامش الجانبي (مم)', 10, 30, 1],
    ['body_font', 'حجم خط المتن (pt)', 10, 18, 0.5],
    ['body_leading', 'تباعد أسطر المتن', 1.1, 2.2, 0.05],
    ['gap_body', 'مسافة بعد المتن (مم)', 0, 30, 1],
  ],
  toggles: [['show_title', 'إظهار «إلى من يهمه الأمر»']],
  positions: (num, L) => {
    const pos: Pos = {};
    pos.header = { top: 0, h: num('header_bottom') };
    pos.ref = { top: num('ref_y') - 5, h: 9 };
    if (L.show_title !== false) pos.title = { top: num('title_y') - 7, h: 9 };
    let y = num('start_y') - 5;
    pos.intro = { top: y, h: 7 }; y += num('gap_intro');
    pos.who = { top: y, h: 7 }; y += num('gap_who');
    pos.name = { top: y, h: 8 }; y += 8 + num('gap_name');
    const bodyH = Math.max(16, num('body_font') * num('body_leading') * 4 * 0.3528);
    pos.body = { top: y, h: bodyH }; y += bodyH + num('gap_purpose');
    pos.purpose = { top: y, h: 7 }; y += 7 + num('gap_body') + num('gap_signature');
    pos.signature = { top: y - 4, h: 20 };
    return { pos, end: y + 18 };
  },
  sides: { ref: (ms) => ({ left: mm(ms), width: mm(60) }), signature: () => ({ left: mm(20), width: mm(60) }), title: () => ({ left: mm(70), right: mm(70) }) },
};

type Props = { value: LetterLayout; defaults: LetterLayout; onChange: (l: LetterLayout) => void; hasTable?: boolean; testID?: string; model?: LayoutModel; compact?: boolean };

export const LetterLayoutEditor: React.FC<Props> = ({ value, defaults, onChange, hasTable = true, testID = 'layout-editor', model = LETTER_MODEL, compact = false }) => {
  const { blocks, sliders, toggles, selects = [] } = model;
  const L = { ...defaults, ...Object.fromEntries(Object.entries(value || {}).filter(([, v]) => v !== null && v !== undefined && v !== '')) };
  const num = (k: string) => Number(L[k] ?? 0);
  const set = (k: string, v: any) => onChange({ ...(value || {}), [k]: v });
  const drag = useRef<{ param: string; startY: number; startV: number } | null>(null);
  const [active, setActive] = useState('');
  useEffect(() => {
    const mv = (e: MouseEvent) => { if (!drag.current) return; const d = (e.clientY - drag.current.startY) / SCALE; set(drag.current.param, Math.max(0, Math.round((drag.current.startV + d) * 2) / 2)); };
    const up = () => { drag.current = null; setActive(''); };
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
  }); // eslint-disable-line react-hooks/exhaustive-deps

  // حساب مواضع الكتل (مم من الأعلى) بنفس منطق المولّد
  const { pos, end } = model.positions(num, L, hasTable);
  const overflow = end > PAGE_H - 25;

  const startDrag = (b: Block) => (e: React.MouseEvent) => { e.preventDefault(); drag.current = { param: b.param, startY: e.clientY, startV: num(b.param) }; setActive(b.key); };
  const inp: React.CSSProperties = { width: 64, padding: '3px 6px', borderRadius: 6, border: '1px solid #dde3ec', fontSize: 12, textAlign: 'center' };

  return (
    <div data-testid={testID} style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : `${mm(210) + 2}px 1fr`, gap: 14, direction: 'rtl', justifyItems: compact ? 'center' : undefined }}>
      <div style={{ position: 'relative', width: mm(210), height: mm(PAGE_H), background: '#fff', border: '1px solid #cbd5e1', boxShadow: '0 4px 16px rgba(0,0,0,.12)', borderRadius: 4, overflow: 'hidden', userSelect: 'none' }} data-testid={`${testID}-page`}>
        {[...Array(12)].map((_, i) => <div key={i} style={{ position: 'absolute', top: mm(i * 25), right: 0, left: 0, borderTop: '1px dashed #f1f5f9', fontSize: 8, color: '#cbd5e1', paddingRight: 2 }}>{i * 25}</div>)}
        <div style={{ position: 'absolute', top: mm(PAGE_H - 22), right: mm(num('margin_side')), left: mm(num('margin_side')), borderTop: '1px solid #94a3b8', fontSize: 8, color: '#94a3b8', textAlign: 'center' }}>التذييل</div>
        {blocks.filter((b) => pos[b.key]).map((b) => {
          const p = pos[b.key]; const isActive = active === b.key;
          const side = model.sides?.[b.key] ? model.sides[b.key](num('margin_side'), L) : { right: mm(num('margin_side')), left: mm(num('margin_side')) };
          return (
            <div key={b.key} onMouseDown={startDrag(b)} data-testid={`${testID}-block-${b.key}`} title={`اسحب لتغيير ${b.fixed ? 'الموضع' : 'المسافة قبل الكتلة'} — ${b.param}: ${num(b.param)} مم`}
              style={{ position: 'absolute', top: mm(p.top), height: mm(p.h), ...side, background: isActive ? b.color : `${b.color}22`, border: `1.5px ${b.fixed ? 'solid' : 'dashed'} ${b.color}`, borderRadius: 4, cursor: 'ns-resize', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: isActive ? '#fff' : b.color, transition: 'background-color .12s' }}>
              {b.label} <span style={{ fontWeight: 600, fontSize: 10, marginRight: 6, opacity: .8 }}>{b.fixed ? `↕ ${num(b.param)}` : `↕ +${num(b.param)}`} مم</span>
            </div>
          );
        })}
        {overflow && <div style={{ position: 'absolute', bottom: 4, right: 8, fontSize: 10, color: '#b91c1c', fontWeight: 800 }}>⚠️ قد يمتد المحتوى لصفحة ثانية</div>}
      </div>
      <div style={{ fontSize: 12.5 }}>
        <div style={{ fontWeight: 800, color: '#0f2440', marginBottom: 6 }}>📐 اسحب أي كتلة على الصفحة لأعلى/لأسفل لتقريبها أو إبعادها</div>
        <div style={{ color: '#64748b', fontSize: 11.5, lineHeight: 1.7, marginBottom: 10 }}>الكتل بإطار متصل (الكليشة، الرقم، المرسَل إليه) تتحرك بموضعها من أعلى الصفحة؛ والكتل بإطار متقطع تغيّر المسافة التي تسبقها فتنزاح معها كل الكتل التالية. تظهر النتيجة الحقيقية في المعاينة الحيّة.</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
          {blocks.map((b) => (
            <label key={b.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, padding: '3px 6px', borderRadius: 6, background: active === b.key ? `${b.color}22` : 'transparent' }}>
              <span style={{ color: b.color, fontWeight: 700 }}>{b.fixed ? '⇕' : '↧'} {b.label}</span>
              <input type="number" step={0.5} min={0} value={num(b.param)} onChange={(e) => set(b.param, Number(e.target.value))} style={inp} data-testid={`${testID}-${b.param}`} />
            </label>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {sliders.map(([k, l, mn, mx, st]) => (
            <label key={k} style={{ display: 'block' }}>
              <span style={{ display: 'flex', justifyContent: 'space-between', color: '#334155', fontWeight: 700 }}>{l}<b>{num(k)}</b></span>
              <input type="range" min={mn} max={mx} step={st} value={num(k)} onChange={(e) => set(k, Number(e.target.value))} style={{ width: '100%' }} data-testid={`${testID}-${k}`} />
            </label>
          ))}
        </div>
        {selects.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
            {selects.map(([k, l, opts]) => (
              <label key={k} style={{ display: 'block' }}><span style={{ color: '#334155', fontWeight: 700 }}>{l}</span>
                <select value={String(L[k] ?? opts[0][0])} onChange={(e) => set(k, e.target.value)} style={{ width: '100%', padding: '4px 6px', borderRadius: 6, border: '1px solid #dde3ec', fontSize: 12, marginTop: 2 }} data-testid={`${testID}-${k}`}>
                  {opts.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
              </label>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 14, marginTop: 8, flexWrap: 'wrap' }}>
          {toggles.map(([k, l]) => <label key={k}><input type="checkbox" checked={L[k] !== false} onChange={(e) => set(k, e.target.checked)} data-testid={`${testID}-${k}`} /> {l}</label>)}
          <button type="button" onClick={() => onChange({})} style={{ marginRight: 'auto', padding: '4px 10px', borderRadius: 6, border: '1px solid #dde3ec', background: '#f8fafc', cursor: 'pointer', fontSize: 12 }} data-testid={`${testID}-reset`}>↺ استعادة الافتراضي</button>
        </div>
      </div>
    </div>
  );
};

export type TableCol = string | { label: string; text?: string };
const colKey = (c: TableCol) => (typeof c === 'string' ? c : `custom:${c.label}`);
const colLabel = (c: TableCol) => (typeof c === 'string' ? c : `✎ ${c.label}${c.text ? ` = «${c.text}»` : ' (فارغ)'}`);

export const TableColumnsPicker: React.FC<{ available: string[]; defaults?: string[]; value?: TableCol[] | null; onChange: (cols: TableCol[] | null) => void; testID?: string }> = ({ available, defaults, value, onChange, testID = 'table-cols' }) => {
  const cols: TableCol[] = value && value.length ? value.filter((c) => typeof c !== 'string' || available.includes(c)) : (defaults && defaults.length ? defaults : available);
  const move = (i: number, d: number) => { const n = [...cols]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; onChange(n); };
  const addCustom = () => {
    const label = window.prompt('عنوان العمود المخصص (مثال: التوقيع، ملاحظات):', '');
    if (!label || !label.trim()) return;
    const text = window.prompt('نص ثابت يُكرر في كل الصفوف (اتركه فارغاً لعمود فارغ للتعبئة اليدوية):', '') || '';
    onChange([...cols, { label: label.trim(), text }]);
  };
  if (!available.length) return <div style={{ fontSize: 12, color: '#94a3b8' }}>أضف أسماء ليظهر الجدول وأعمدته</div>;
  const used = new Set(cols.filter((c) => typeof c === 'string') as string[]);
  return (
    <div data-testid={testID} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      {cols.map((c, i) => (
        <span key={colKey(c)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: `1px solid ${typeof c === 'string' ? '#c4b5fd' : '#fcd34d'}`, background: typeof c === 'string' ? '#f5f3ff' : '#fffbeb', borderRadius: 8, padding: '2px 6px', fontSize: 12, fontWeight: 700 }} data-testid={`${testID}-col-${colKey(c)}`}>
          <button type="button" onClick={() => move(i, -1)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 11 }} title="يمين">◀</button>
          {colLabel(c)}
          <button type="button" onClick={() => move(i, 1)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 11 }} title="يسار">▶</button>
          <button type="button" onClick={() => onChange(cols.filter((x) => colKey(x) !== colKey(c)))} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#b91c1c' }} data-testid={`${testID}-remove-${colKey(c)}`}>✕</button>
        </span>
      ))}
      <span style={{ flexBasis: '100%', fontSize: 11, color: '#64748b', marginTop: 2 }}>➕ أعمدة من بيانات النظام (حسب نوع الأشخاص المختارين):</span>
      {available.filter((c) => !used.has(c)).map((c) => (
        <button key={c} type="button" onClick={() => onChange([...cols, c])} style={{ border: '1px dashed #cbd5e1', background: '#fff', borderRadius: 8, padding: '2px 8px', fontSize: 12, cursor: 'pointer', color: '#64748b' }} data-testid={`${testID}-add-${c}`}>+ {c}</button>
      ))}
      <button type="button" onClick={addCustom} style={{ border: '1px dashed #f59e0b', background: '#fffbeb', borderRadius: 8, padding: '2px 8px', fontSize: 12, cursor: 'pointer', color: '#b45309', fontWeight: 700 }} data-testid={`${testID}-add-custom`}>✎ عمود مخصص (فارغ/نص ثابت)</button>
      {value && value.length > 0 && <button type="button" onClick={() => onChange(null)} style={{ border: 'none', background: 'none', fontSize: 11.5, color: '#2563eb', cursor: 'pointer' }} data-testid={`${testID}-reset`}>↺ الأعمدة الافتراضية</button>}
    </div>
  );
};
