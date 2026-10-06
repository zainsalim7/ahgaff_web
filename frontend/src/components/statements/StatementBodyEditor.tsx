import React, { useEffect, useMemo } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import { TextStyle, FontFamily, FontSize, Color } from '@tiptap/extension-text-style';

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

export const isHtmlBody = (s: string) => /<(p|div|br|span|b|strong|u|h[1-6])\b/i.test(s || '');
export const textToHtml = (s: string) => (isHtmlBody(s) ? s : (s || '').split('\n').map((l) => `<p style="text-align: center">${l.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`).join(''));

type Props = { value: string; onChange: (html: string) => void; variables?: string[]; placeholder?: string; minHeight?: number; testID?: string };

const tb = (active = false): React.CSSProperties => ({ padding: '3px 8px', borderRadius: 6, border: '1px solid #cbd5e1', backgroundColor: active ? '#00796b' : '#fff', color: active ? '#fff' : '#1a2540', fontSize: 12, fontWeight: 800, cursor: 'pointer', minWidth: 28 });
const sel: React.CSSProperties = { padding: '3px 6px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12, backgroundColor: '#fff', color: '#1a2540', fontWeight: 700 };

export const StatementBodyEditor: React.FC<Props> = ({ value, onChange, variables = [], placeholder, minHeight = 140, testID = 'statement-editor' }) => {
  useEffect(() => {
    if (typeof document === 'undefined' || document.getElementById('statement-fonts-link')) return;
    const link = document.createElement('link'); link.id = 'statement-fonts-link'; link.rel = 'stylesheet'; link.href = GF; document.head.appendChild(link);
  }, []);
  const initial = useMemo(() => textToHtml(value), []); // eslint-disable-line react-hooks/exhaustive-deps
  const editor = useEditor({
    extensions: [StarterKit, TextStyle, FontFamily, FontSize, Color, TextAlign.configure({ types: ['heading', 'paragraph'], defaultAlignment: 'center' }), Placeholder.configure({ placeholder: placeholder || 'اكتب متن الإفادة هنا…' })],
    content: initial || '<p></p>',
    immediatelyRender: false,
    onUpdate: ({ editor: ed }) => onChange(ed.isEmpty ? '' : ed.getHTML()),
  });
  useEffect(() => {
    if (!editor || editor.isFocused) return;
    const html = textToHtml(value);
    if ((value || '') === '' && !editor.isEmpty) editor.commands.clearContent(false);
    else if (html && html !== editor.getHTML()) editor.commands.setContent(html, { emitUpdate: false });
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
      <style>{`.stmt-tiptap .tiptap{min-height:${minHeight}px;padding:10px 12px;outline:none;font-size:14pt;line-height:1.9;color:#1e293b;direction:rtl;text-align:center;font-family:Amiri,serif}
      .stmt-tiptap .tiptap p{margin:0 0 4px}
      .stmt-tiptap .tiptap p.is-editor-empty:first-child::before{content:attr(data-placeholder);color:#94a3b8;float:right;pointer-events:none;height:0;font-size:13px;font-family:Cairo,sans-serif}`}</style>
    </div>
  );
};
