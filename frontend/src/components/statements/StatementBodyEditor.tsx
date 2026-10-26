import React, { useState, useEffect, useMemo } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import { TextStyle, FontFamily, FontSize, Color } from '@tiptap/extension-text-style';
import { Table, TableRow, TableHeader as BaseTableHeader, TableCell as BaseTableCell } from '@tiptap/extension-table';

// 🆕 دعم لون خلفية الخلية (يُحافظ عليه عند لصق جدول منسّق من Word، ويُستخدم أيضاً من أزرار التلوين اليدوي)
const bgAttr = {
  backgroundColor: {
    default: null,
    parseHTML: (el: HTMLElement) => el.style.backgroundColor || el.getAttribute('bgcolor') || null,
    renderHTML: (attrs: any) => (attrs.backgroundColor ? { style: `background-color: ${attrs.backgroundColor}` } : {}),
  },
};
const TableCell = BaseTableCell.extend({ addAttributes() { return { ...this.parent?.(), ...bgAttr }; } });
const TableHeader = BaseTableHeader.extend({ addAttributes() { return { ...this.parent?.(), ...bgAttr }; } });
const CELL_FILLS = ['#fef9c3', '#dbeafe', '#dcfce7', '#fee2e2', '#f3e8ff'];

export const STATEMENT_FONTS = [
  { key: 'amiri', label: 'أميري (نسخي رسمي)', family: 'Amiri' },
  { key: 'kufi', label: 'نوتو كوفي', family: 'Noto Kufi Arabic' },
  { key: 'cairo', label: 'القاهرة', family: 'Cairo' },
  { key: 'tajawal', label: 'تجوّل', family: 'Tajawal' },
  { key: 'almarai', label: 'المرعي', family: 'Almarai' },
];
const SIZES = [12, 14, 16, 18, 20, 22, 24, 28];
const COLORS = ['#000000', '#00802b', '#c62828', '#1565c0', '#6a1b9a'];
const GF = 'https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Noto+Kufi+Arabic:wght@400;700&family=Tajawal:wght@400;700&family=Almarai:wght@400;700&display=swap';

export const isHtmlBody = (s: string) => /<(p|div|br|span|b|strong|u|h[1-6]|table|tr|td|th)\b/i.test(s || '');
export const textToHtml = (s: string, align: string = 'center') => (isHtmlBody(s) ? s : (s || '').split('\n').map((l) => `<p style="text-align: ${align}">${l.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`).join(''));

type Props = { value: string; onChange: (html: string) => void; variables?: string[]; placeholder?: string; minHeight?: number; testID?: string; defaultAlign?: 'center' | 'right' };

const AR_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
/** «يوم الاثنين 12/10/2026م الموافق 30/04/1448هـ» — الهجري بتقويم أم القرى من المتصفح */
export const formatArabicDate = (iso: string): string => {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  if (isNaN(d.getTime())) return '';
  const g = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}م`;
  let h = '';
  try {
    const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(d);
    const get = (t: string) => parts.find((x) => x.type === t)?.value || '';
    if (get('year')) h = ` الموافق ${get('day')}/${get('month')}/${get('year').replace(/\D/g, '')}هـ`;
  } catch { /* متصفح بلا تقويم هجري */ }
  return `يوم ${AR_DAYS[d.getDay()]} ${g}${h}`;
};

const tb = (active = false): React.CSSProperties => ({ padding: '3px 8px', borderRadius: 6, border: '1px solid #cbd5e1', backgroundColor: active ? '#00796b' : '#fff', color: active ? '#fff' : '#1a2540', fontSize: 12, fontWeight: 800, cursor: 'pointer', minWidth: 28 });
const sel: React.CSSProperties = { padding: '3px 6px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12, backgroundColor: '#fff', color: '#1a2540', fontWeight: 700 };

export const StatementBodyEditor: React.FC<Props> = ({ value, onChange, variables = [], placeholder, minHeight = 140, testID = 'statement-editor', defaultAlign = 'center' }) => {
  useEffect(() => {
    if (typeof document === 'undefined' || document.getElementById('statement-fonts-link')) return;
    const link = document.createElement('link'); link.id = 'statement-fonts-link'; link.rel = 'stylesheet'; link.href = GF; document.head.appendChild(link);
  }, []);
  const initial = useMemo(() => textToHtml(value, defaultAlign), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [pickedDate, setPickedDate] = useState('');
  const insertDate = () => { const txt = formatArabicDate(pickedDate); if (txt && editor) { editor.chain().focus().insertContent(`${txt} `).run(); setPickedDate(''); } };
  const editor = useEditor({
    extensions: [StarterKit, TextStyle, FontFamily, FontSize, Color, TextAlign.configure({ types: ['heading', 'paragraph'], defaultAlignment: defaultAlign }), Placeholder.configure({ placeholder: placeholder || 'اكتب متن الإفادة هنا…' }), Table.configure({ resizable: true }), TableRow, TableHeader, TableCell],
    content: initial || '<p></p>',
    immediatelyRender: false,
    shouldRerenderOnTransaction: true, // 🆕 تحديث الشريط (إظهار/إخفاء أزرار الجدول) فوراً عند تحريك المؤشر داخل/خارج جدول
    parseOptions: { preserveWhitespace: 'full' }, // 🆕 عدم اختزال الفراغات المتعددة المكتوبة يدوياً بين الكلمات
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      onChange(ed.isEmpty && !html.includes('<table') ? '' : html); // 🆕 عدم اعتبار جدول فارغ "محتوى فارغ" فيُحذف الجدول بالخطأ
    },
  });
  useEffect(() => {
    if (!editor || editor.isFocused) return;
    const html = textToHtml(value, defaultAlign);
    if ((value || '') === '' && !editor.isEmpty) editor.commands.clearContent(false);
    else if (html && html !== editor.getHTML()) editor.commands.setContent(html, { emitUpdate: false, parseOptions: { preserveWhitespace: 'full' } });
  }, [value, editor]);
  if (!editor) return null;
  const run = (fn: () => void) => () => fn();
  const curFamily = (editor.getAttributes('textStyle').fontFamily || '').split(',')[0].replace(/['"]/g, '').trim();
  const curSize = parseInt(editor.getAttributes('textStyle').fontSize || '', 10) || '';
  return (
    <div data-testid={testID} style={{ border: '1px solid #dde3ec', borderRadius: 8, overflow: 'hidden', backgroundColor: '#fff', direction: 'rtl' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: 6, borderBottom: '1px solid #e2e8f0', backgroundColor: '#f7f9fc', alignItems: 'center' }}>
        <select data-testid={`${testID}-font`} value={curFamily} style={{ ...sel, fontFamily: curFamily || undefined }} onChange={(e) => (e.target.value ? editor.chain().focus().setFontFamily(e.target.value).run() : editor.chain().focus().unsetFontFamily().run())} title="نوع الخط">
          <option value="">الخط الافتراضي (أميري)</option>
          {STATEMENT_FONTS.map((f) => <option key={f.key} value={f.family} style={{ fontFamily: f.family }}>{f.label}</option>)}
        </select>
        <select data-testid={`${testID}-size`} value={curSize} style={sel} onChange={(e) => (e.target.value ? editor.chain().focus().setFontSize(`${e.target.value}pt`).run() : editor.chain().focus().unsetFontSize().run())} title="حجم الخط">
          <option value="">الحجم (14)</option>
          {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <span style={{ width: 1, height: 20, backgroundColor: '#cbd5e1', margin: '0 4px' }} />
        <button type="button" data-testid={`${testID}-bold`} style={tb(editor.isActive('bold'))} onClick={run(() => editor.chain().focus().toggleBold().run())} title="عريض"><b>B</b></button>
        <button type="button" data-testid={`${testID}-underline`} style={tb(editor.isActive('underline'))} onClick={run(() => editor.chain().focus().toggleUnderline().run())} title="تسطير"><u>U</u></button>
        {COLORS.map((c) => (
          <button key={c} type="button" style={{ ...tb(editor.isActive('textStyle', { color: c })), backgroundColor: c, minWidth: 18, width: 18, height: 22, padding: 0, border: editor.isActive('textStyle', { color: c }) ? '2px solid #00796b' : '1px solid #cbd5e1' }} onClick={run(() => (c === '#000000' ? editor.chain().focus().unsetColor().run() : editor.chain().focus().setColor(c).run()))} title="لون" />
        ))}
        <span style={{ width: 1, height: 20, backgroundColor: '#cbd5e1', margin: '0 4px' }} />
        <button type="button" style={tb(editor.isActive({ textAlign: 'right' }))} onClick={run(() => editor.chain().focus().setTextAlign('right').run())} title="يمين">⇤</button>
        <button type="button" style={tb(editor.isActive({ textAlign: 'center' }))} onClick={run(() => editor.chain().focus().setTextAlign('center').run())} title="وسط">↔</button>
        <button type="button" style={tb(editor.isActive({ textAlign: 'justify' }))} onClick={run(() => editor.chain().focus().setTextAlign('justify').run())} title="ضبط">☰</button>
        <button type="button" data-testid={`${testID}-align-left`} style={tb(editor.isActive({ textAlign: 'left' }))} onClick={run(() => editor.chain().focus().setTextAlign('left').run())} title="يسار (نص بلغة أجنبية LTR)">⇥</button>
        <span style={{ width: 1, height: 20, backgroundColor: '#cbd5e1', margin: '0 4px' }} />
        <button type="button" data-testid={`${testID}-insert-table`} style={tb()} disabled={editor.isActive('table')} onClick={run(() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: false }).run())} title={editor.isActive('table') ? 'لا يمكن إدراج جدول داخل جدول آخر' : 'إدراج جدول فارغ لتعبئة محتواه يدوياً'}>⊞ جدول</button>
        {editor.isActive('table') && (
          <>
            <button type="button" data-testid={`${testID}-table-add-row`} style={tb()} onClick={run(() => editor.chain().focus().addRowAfter().run())} title="إضافة صف">➕↕</button>
            <button type="button" data-testid={`${testID}-table-add-col`} style={tb()} onClick={run(() => editor.chain().focus().addColumnAfter().run())} title="إضافة عمود">➕↔</button>
            <button type="button" data-testid={`${testID}-table-del-row`} style={tb()} onClick={run(() => editor.chain().focus().deleteRow().run())} title="حذف الصف">➖↕</button>
            <button type="button" data-testid={`${testID}-table-del-col`} style={tb()} onClick={run(() => editor.chain().focus().deleteColumn().run())} title="حذف العمود">➖↔</button>
            <button type="button" data-testid={`${testID}-table-merge`} style={tb()} onClick={run(() => editor.chain().focus().mergeOrSplit().run())} title="دمج/تقسيم الخلايا المحدَّدة">⊡ دمج</button>
            {CELL_FILLS.map((c) => (
              <button key={c} type="button" data-testid={`${testID}-table-fill-${c.slice(1)}`} style={{ ...tb(), backgroundColor: c, minWidth: 18, width: 18, height: 22, padding: 0 }} onClick={run(() => editor.chain().focus().setCellAttribute('backgroundColor', c).run())} title="تلوين خلفية الخلية" />
            ))}
            <button type="button" data-testid={`${testID}-table-fill-clear`} style={{ ...tb(), color: '#64748b' }} onClick={run(() => editor.chain().focus().setCellAttribute('backgroundColor', null).run())} title="إزالة لون الخلفية">⌫</button>
            <button type="button" data-testid={`${testID}-table-delete`} style={{ ...tb(), color: '#b91c1c' }} onClick={run(() => editor.chain().focus().deleteTable().run())} title="حذف الجدول بالكامل">🗑 جدول</button>
          </>
        )}
        <span style={{ width: 1, height: 20, backgroundColor: '#cbd5e1', margin: '0 4px' }} />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: '1px solid #cbd5e1', borderRadius: 6, padding: '1px 6px', background: '#fff' }} title="إدراج تاريخ معيّن (باليوم والهجري) عند المؤشر">
          <span style={{ fontSize: 11.5, fontWeight: 800 }}>📅</span>
          <input type="date" value={pickedDate} data-testid={`${testID}-date-pick`} style={{ border: 'none', fontSize: 11.5, outline: 'none', width: 118 }} onChange={(e) => setPickedDate(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') insertDate(); }} />
          <button type="button" data-testid={`${testID}-date-insert`} disabled={!pickedDate} onClick={insertDate} style={{ border: 'none', background: pickedDate ? '#0f2440' : '#e2e8f0', color: pickedDate ? '#fff' : '#94a3b8', borderRadius: 5, fontSize: 11, padding: '2px 7px', cursor: pickedDate ? 'pointer' : 'default', fontWeight: 700 }}>إدراج</button>
        </span>
        <button type="button" style={{ ...tb(), marginRight: 'auto', color: '#64748b' }} onClick={run(() => editor.chain().focus().unsetAllMarks().clearNodes().run())} title="مسح التنسيق">⌫ تنسيق</button>
      </div>
      <EditorContent editor={editor} className="stmt-tiptap" />
      {variables.length > 0 && (
        <div data-testid={`${testID}-vars`} style={{ display: 'flex', flexWrap: 'wrap', gap: 5, padding: '6px 8px', borderTop: '1px dashed #e2e8f0', backgroundColor: '#fbfcfe' }}>
          <span style={{ fontSize: 11, color: '#64748b', fontWeight: 700, alignSelf: 'center' }}>إدراج متغير عند المؤشر:</span>
          {variables.map((v) => (
            <button key={v} type="button" data-testid={`var-chip-${v}`} onClick={run(() => editor.chain().focus().insertContent(`${v} `).run())}
              style={{ padding: '2px 8px', borderRadius: 12, border: '1px solid #b2dfdb', backgroundColor: '#e0f2f1', color: '#00796b', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>{v}</button>
          ))}
        </div>
      )}
      <style>{`.stmt-tiptap .tiptap{min-height:${minHeight}px;padding:10px 12px;outline:none;font-size:14pt;line-height:1.9;color:#1e293b;direction:rtl;text-align:${defaultAlign};font-family:Amiri,serif}
      .stmt-tiptap .tiptap p{margin:0 0 4px}
      .stmt-tiptap .tiptap p[style*="text-align: left"]{direction:ltr}
      .stmt-tiptap .tiptap table{border-collapse:collapse;width:100%;margin:8px 0;table-layout:fixed}
      .stmt-tiptap .tiptap table td,.stmt-tiptap .tiptap table th{border:1px solid #94a3b8;padding:6px 8px;vertical-align:top;position:relative;word-wrap:break-word;overflow-wrap:break-word;white-space:pre-wrap}
      .stmt-tiptap .tiptap table td>p,.stmt-tiptap .tiptap table th>p{margin:0}
      .stmt-tiptap .tiptap .selectedCell{position:relative}
      .stmt-tiptap .tiptap .selectedCell:after{content:"";position:absolute;inset:0;background:rgba(0,121,107,.18);pointer-events:none;z-index:2}
      .stmt-tiptap .tiptap .column-resize-handle{position:absolute;top:0;bottom:-2px;width:4px;background-color:#00796b;pointer-events:none}
      .stmt-tiptap .tiptap.resize-cursor{cursor:col-resize}
      .stmt-tiptap .tiptap table *::selection{background:rgba(0,121,107,.25)}
      .stmt-tiptap .tiptap p.is-editor-empty:first-child::before{content:attr(data-placeholder);color:#94a3b8;float:right;pointer-events:none;height:0;font-size:13px;font-family:Cairo,sans-serif}`}</style>
    </div>
  );
};
