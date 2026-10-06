import React, { useEffect, useRef, useState } from 'react';

export type LetterLayout = Record<string, any>;

// الكتل بترتيبها على الصفحة: المفتاح الذي يتغيّر عند سحب الكتلة + ارتفاع تقريبي للمخطط (مم)
const BLOCKS: { key: string; label: string; param: string; h: number; color: string; fixed?: boolean }[] = [
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
const SLIDERS: [string, string, number, number, number][] = [
  ['margin_side', 'الهامش الجانبي (مم)', 10, 30, 1],
  ['body_font', 'حجم خط المتن (pt)', 10, 18, 0.5],
  ['body_leading', 'تباعد أسطر المتن', 1.1, 2.2, 0.05],
  ['table_font', 'حجم خط الجدول (pt)', 7, 14, 0.5],
  ['table_row_h', 'ارتفاع صف الجدول (مم)', 5, 12, 0.5],
  ['gap_table_after', 'مسافة بعد الجدول (مم)', 0, 30, 1],
];
const PAGE_H = 297, SCALE = 1.9; // مم → بكسل
const mm = (v: number) => v * SCALE;

type Props = { value: LetterLayout; defaults: LetterLayout; onChange: (l: LetterLayout) => void; hasTable?: boolean; testID?: string };

export const LetterLayoutEditor: React.FC<Props> = ({ value, defaults, onChange, hasTable = true, testID = 'layout-editor' }) => {
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
  const pos: Record<string, { top: number; h: number }> = {};
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
  const overflow = y + 24 > PAGE_H - 25;

  const startDrag = (b: typeof BLOCKS[number]) => (e: React.MouseEvent) => { e.preventDefault(); drag.current = { param: b.param, startY: e.clientY, startV: num(b.param) }; setActive(b.key); };
  const inp: React.CSSProperties = { width: 64, padding: '3px 6px', borderRadius: 6, border: '1px solid #dde3ec', fontSize: 12, textAlign: 'center' };

  return (
    <div data-testid={testID} style={{ display: 'grid', gridTemplateColumns: `${mm(210) + 2}px 1fr`, gap: 14, direction: 'rtl' }}>
      <div style={{ position: 'relative', width: mm(210), height: mm(PAGE_H), background: '#fff', border: '1px solid #cbd5e1', boxShadow: '0 4px 16px rgba(0,0,0,.12)', borderRadius: 4, overflow: 'hidden', userSelect: 'none' }} data-testid={`${testID}-page`}>
        {[...Array(12)].map((_, i) => <div key={i} style={{ position: 'absolute', top: mm(i * 25), right: 0, left: 0, borderTop: '1px dashed #f1f5f9', fontSize: 8, color: '#cbd5e1', paddingRight: 2 }}>{i * 25}</div>)}
        <div style={{ position: 'absolute', top: mm(PAGE_H - 22), right: mm(num('margin_side')), left: mm(num('margin_side')), borderTop: '1px solid #94a3b8', fontSize: 8, color: '#94a3b8', textAlign: 'center' }}>التذييل</div>
        {BLOCKS.filter((b) => pos[b.key]).map((b) => {
          const p = pos[b.key]; const isActive = active === b.key;
          const side = b.key === 'ref' ? { left: mm(num('margin_side')), width: mm(60) } : b.key === 'signature' ? { left: mm(20), width: mm(60) } : b.key === 'subject' ? { left: mm(60), right: mm(60) } : { right: mm(num('margin_side')), left: mm(num('margin_side')) };
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
          {BLOCKS.map((b) => (
            <label key={b.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, padding: '3px 6px', borderRadius: 6, background: active === b.key ? `${b.color}22` : 'transparent' }}>
              <span style={{ color: b.color, fontWeight: 700 }}>{b.fixed ? '⇕' : '↧'} {b.label}</span>
              <input type="number" step={0.5} min={0} value={num(b.param)} onChange={(e) => set(b.param, Number(e.target.value))} style={inp} data-testid={`${testID}-${b.param}`} />
            </label>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {SLIDERS.map(([k, l, mn, mx, st]) => (
            <label key={k} style={{ display: 'block' }}>
              <span style={{ display: 'flex', justifyContent: 'space-between', color: '#334155', fontWeight: 700 }}>{l}<b>{num(k)}</b></span>
              <input type="range" min={mn} max={mx} step={st} value={num(k)} onChange={(e) => set(k, Number(e.target.value))} style={{ width: '100%' }} data-testid={`${testID}-${k}`} />
            </label>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 14, marginTop: 8, flexWrap: 'wrap' }}>
          <label><input type="checkbox" checked={L.show_greeting !== false} onChange={(e) => set('show_greeting', e.target.checked)} data-testid={`${testID}-show_greeting`} /> إظهار «السلام عليكم»</label>
          <label><input type="checkbox" checked={L.show_closing !== false} onChange={(e) => set('show_closing', e.target.checked)} data-testid={`${testID}-show_closing`} /> إظهار عبارة الختام</label>
          <button type="button" onClick={() => onChange({})} style={{ marginRight: 'auto', padding: '4px 10px', borderRadius: 6, border: '1px solid #dde3ec', background: '#f8fafc', cursor: 'pointer', fontSize: 12 }} data-testid={`${testID}-reset`}>↺ استعادة الافتراضي</button>
        </div>
      </div>
    </div>
  );
};

export const TableColumnsPicker: React.FC<{ available: string[]; value?: string[] | null; onChange: (cols: string[] | null) => void; testID?: string }> = ({ available, value, onChange, testID = 'table-cols' }) => {
  const cols = value && value.length ? value.filter((c) => available.includes(c)) : available;
  const move = (i: number, d: number) => { const n = [...cols]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; onChange(n); };
  if (!available.length) return <div style={{ fontSize: 12, color: '#94a3b8' }}>أضف أسماء ليظهر الجدول وأعمدته</div>;
  return (
    <div data-testid={testID} style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {cols.map((c, i) => (
        <span key={c} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: '1px solid #c4b5fd', background: '#f5f3ff', borderRadius: 8, padding: '2px 6px', fontSize: 12, fontWeight: 700 }}>
          <button type="button" onClick={() => move(i, -1)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 11 }} title="يمين">◀</button>
          {c}
          <button type="button" onClick={() => move(i, 1)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 11 }} title="يسار">▶</button>
          <button type="button" onClick={() => onChange(cols.filter((x) => x !== c))} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#b91c1c' }} data-testid={`${testID}-remove-${c}`}>✕</button>
        </span>
      ))}
      {available.filter((c) => !cols.includes(c)).map((c) => (
        <button key={c} type="button" onClick={() => onChange([...cols, c])} style={{ border: '1px dashed #cbd5e1', background: '#fff', borderRadius: 8, padding: '2px 8px', fontSize: 12, cursor: 'pointer', color: '#64748b' }} data-testid={`${testID}-add-${c}`}>+ {c}</button>
      ))}
      {value && value.length > 0 && <button type="button" onClick={() => onChange(null)} style={{ border: 'none', background: 'none', fontSize: 11.5, color: '#2563eb', cursor: 'pointer' }}>كل الأعمدة</button>}
    </div>
  );
};
