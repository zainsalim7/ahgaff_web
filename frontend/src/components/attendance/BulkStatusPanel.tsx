import React, { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import { ATT_STATUS_META } from './StatusEditPill';
import { C, fieldLbl, textInp, Chip } from './attUi';

export type BulkScope = { record_ids?: string[]; student_ids?: string[]; date_from?: string; date_to?: string; from_statuses?: string[] };
const TARGETS = [{ k: 'excused', l: 'بعذر' }, { k: 'present', l: 'حاضر' }, { k: 'late', l: 'متأخر' }, { k: 'absent', l: 'غائب' }];
const msg = (m: string) => window.alert(m);

export const BulkStatusPanel = ({ scope, scopeLabel, onDone, testID = 'bulk' }: { scope: BulkScope; scopeLabel: string; onDone: () => void; testID?: string }) => {
  const [target, setTarget] = useState('excused');
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<{ count: number; students: number; by_status: Record<string, number> } | null>(null);
  const [busy, setBusy] = useState(false);
  const key = JSON.stringify(scope) + target;

  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      try { const r = await api.post('/attendance/bulk-status', { ...scope, status: target, dry_run: true }); if (alive) setPreview(r.data); }
      catch { if (alive) setPreview(null); }
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async () => {
    if (!preview?.count) return;
    const tl = TARGETS.find((t) => t.k === target)?.l;
    if (!window.confirm(`تحويل ${preview.count} سجلاً لـ ${preview.students} طالب إلى «${tl}»؟${reason ? `\nالسبب: ${reason}` : ''}`)) return;
    setBusy(true);
    try {
      const r = await api.post('/attendance/bulk-status', { ...scope, status: target, reason });
      msg(r.data?.message || 'تم'); onDone();
    } catch (e: any) { msg(e?.response?.data?.detail || 'فشل التعديل الجماعي'); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ border: `1.5px dashed ${C.purple}`, backgroundColor: '#faf5ff', borderRadius: 14, padding: 14, marginBottom: 12, direction: 'rtl' }} data-testid={`${testID}-panel`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Ionicons name="flash" size={16} color={C.purple} />
        <span style={{ fontSize: 14, fontWeight: 800, color: C.purple }}>تصحيح جماعي</span>
        <span style={{ fontSize: 12, color: C.muted }}>— {scopeLabel}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(220px, 1fr) auto', gap: 14, alignItems: 'end' }}>
        <div>
          <label style={fieldLbl}>تحويل إلى</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {TARGETS.map((t) => <Chip key={t.k} on={target === t.k} color={ATT_STATUS_META[t.k].color} onClick={() => setTarget(t.k)} testID={`${testID}-target-${t.k}`}>{t.l}</Chip>)}
          </div>
        </div>
        <div><label style={fieldLbl}>السبب (إجازة مرضية، مهمة رسمية، خطأ تحضير…)</label><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="اختياري — يُحفظ في سجل التعديل" style={textInp} data-testid={`${testID}-reason`} /></div>
        <button type="button" disabled={busy || !preview?.count} onClick={run} data-testid={`${testID}-run`}
          style={{ border: 'none', borderRadius: 10, padding: '10px 18px', fontWeight: 800, fontSize: 13, cursor: preview?.count ? 'pointer' : 'not-allowed', fontFamily: 'inherit', backgroundColor: preview?.count ? C.purple : '#d8d2e6', color: '#fff', whiteSpace: 'nowrap' }}>
          {busy ? 'جاري التنفيذ…' : preview ? `تنفيذ على ${preview.count} سجل · ${preview.students} طالب` : 'جاري الحساب…'}
        </button>
      </div>
      {preview && preview.count > 0 && (
        <div style={{ fontSize: 11.5, color: C.muted, marginTop: 8 }} data-testid={`${testID}-preview`}>
          سيتغيّر: {Object.entries(preview.by_status).map(([k, v]) => `${v} ${ATT_STATUS_META[k]?.label || k}`).join(' · ')} → {TARGETS.find((t) => t.k === target)?.l}. المدير/العميد يُنفَّذ مباشرة، وغيرهما يتحول إلى طلبات اعتماد.
        </div>
      )}
      {preview && preview.count === 0 && <div style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>لا توجد سجلات تحتاج تعديلاً ضمن النطاق الحالي</div>}
    </div>
  );
};
