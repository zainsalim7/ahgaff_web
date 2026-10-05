import React, { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';

type Props = { value: string; onChange: (html: string) => void; placeholder?: string; placeholders?: { key: string; label_ar: string }[]; minHeight?: number; testID?: string; readOnly?: boolean };

const tb = (active = false): React.CSSProperties => ({ padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1', backgroundColor: active ? '#0f2440' : '#fff', color: active ? '#fff' : '#0f2440', fontSize: 12, fontWeight: 800, cursor: 'pointer', minWidth: 28 });

export const TipTapEditor: React.FC<Props> = ({ value, onChange, placeholder, placeholders = [], minHeight = 140, testID, readOnly }) => {
  const editor = useEditor({
    extensions: [StarterKit, TextAlign.configure({ types: ['heading', 'paragraph'], defaultAlignment: 'right' }), Placeholder.configure({ placeholder: placeholder || 'اكتب هنا…' }), Table.configure({ resizable: false }), TableRow, TableHeader, TableCell],
    content: value || '<p></p>',
    editable: !readOnly,
    immediatelyRender: false,
    onUpdate: ({ editor: ed }) => onChange(ed.getHTML()),
  });
  useEffect(() => { if (editor && value !== editor.getHTML() && !editor.isFocused) editor.commands.setContent(value || '<p></p>', { emitUpdate: false }); }, [value, editor]);
  useEffect(() => { editor?.setEditable(!readOnly); }, [readOnly, editor]);
  if (!editor) return null;
  const run = (fn: () => void) => () => { fn(); };
  return (
    <div data-testid={testID} style={{ border: '1px solid #d7dde6', borderRadius: 10, overflow: 'hidden', backgroundColor: readOnly ? '#f8fafc' : '#fff', direction: 'rtl' }}>
      {!readOnly && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: 6, borderBottom: '1px solid #e2e8f0', backgroundColor: '#f7f9fc', alignItems: 'center' }}>
          <button type="button" style={tb(editor.isActive('bold'))} onClick={run(() => editor.chain().focus().toggleBold().run())} title="عريض"><b>B</b></button>
          <button type="button" style={tb(editor.isActive('italic'))} onClick={run(() => editor.chain().focus().toggleItalic().run())} title="مائل"><i>I</i></button>
          <button type="button" style={tb(editor.isActive('underline'))} onClick={run(() => editor.chain().focus().toggleUnderline().run())} title="تسطير"><u>U</u></button>
          <span style={{ width: 1, height: 20, backgroundColor: '#cbd5e1', margin: '0 4px' }} />
          <button type="button" style={tb(editor.isActive({ textAlign: 'right' }))} onClick={run(() => editor.chain().focus().setTextAlign('right').run())} title="يمين">⇤</button>
          <button type="button" style={tb(editor.isActive({ textAlign: 'center' }))} onClick={run(() => editor.chain().focus().setTextAlign('center').run())} title="وسط">↔</button>
          <button type="button" style={tb(editor.isActive({ textAlign: 'justify' }))} onClick={run(() => editor.chain().focus().setTextAlign('justify').run())} title="ضبط">☰</button>
          <span style={{ width: 1, height: 20, backgroundColor: '#cbd5e1', margin: '0 4px' }} />
          <button type="button" style={tb(editor.isActive('bulletList'))} onClick={run(() => editor.chain().focus().toggleBulletList().run())} title="قائمة نقطية">•</button>
          <button type="button" style={tb(editor.isActive('orderedList'))} onClick={run(() => editor.chain().focus().toggleOrderedList().run())} title="قائمة مرقمة">1.</button>
          <button type="button" style={tb(editor.isActive('heading', { level: 3 }))} onClick={run(() => editor.chain().focus().toggleHeading({ level: 3 }).run())} title="عنوان">H</button>
          <button type="button" style={tb()} onClick={run(() => editor.chain().focus().insertTable({ rows: 2, cols: 3, withHeaderRow: true }).run())} title="جدول">⊞</button>
          {editor.isActive('table') && <>
            <button type="button" style={tb()} onClick={run(() => editor.chain().focus().addRowAfter().run())} title="صف">+صف</button>
            <button type="button" style={tb()} onClick={run(() => editor.chain().focus().addColumnAfter().run())} title="عمود">+عمود</button>
            <button type="button" style={tb()} onClick={run(() => editor.chain().focus().deleteTable().run())} title="حذف الجدول">✕⊞</button>
          </>}
          {placeholders.length > 0 && (
            <select data-testid={testID ? `${testID}-ph` : undefined} value="" onChange={(e) => { if (e.target.value) editor.chain().focus().insertContent(`{{${e.target.value}}} `).run(); }}
              style={{ marginRight: 'auto', padding: '4px 8px', borderRadius: 6, border: '1px solid #7c3aed', color: '#7c3aed', fontSize: 12, fontWeight: 800, backgroundColor: '#faf5ff', maxWidth: 220 }}>
              <option value="">＋ إدراج عنصر نائب…</option>
              {placeholders.map((p) => <option key={p.key} value={p.key}>{p.label_ar} — {p.key}</option>)}
            </select>
          )}
        </div>
      )}
      <EditorContent editor={editor} style={{ minHeight }} className="corr-tiptap" />
      <style>{`.corr-tiptap .tiptap{min-height:${minHeight}px;padding:10px 12px;outline:none;font-size:14px;line-height:1.8;color:#1e293b;direction:rtl;text-align:right}
      .corr-tiptap .tiptap p.is-editor-empty:first-child::before{content:attr(data-placeholder);color:#94a3b8;float:right;pointer-events:none;height:0}
      .corr-tiptap table{border-collapse:collapse;width:100%;margin:8px 0}.corr-tiptap td,.corr-tiptap th{border:1px solid #cbd5e1;padding:4px 8px;min-width:40px}.corr-tiptap th{background:#f1f5f9}`}</style>
    </div>
  );
};
