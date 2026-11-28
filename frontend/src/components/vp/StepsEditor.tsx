import React from 'react';
import { btn, card, inp } from '../corr/CorrUI';
import { Step } from './vpUi';

export const StepsEditor = ({ steps, onChange }: { steps: Step[]; onChange: (s: Step[]) => void }) => {
  const upd = (i: number, k: keyof Step, v: any) => onChange(steps.map((x, j) => (j === i ? { ...x, [k]: v } : k === 'is_filming' && v ? { ...x, is_filming: false } : x)));
  const move = (i: number, d: number) => { const a = [...steps]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; onChange(a); };
  return (
    <div style={card} data-testid="vp-set-steps">
      <strong>مراحل الإنتاج (بعد «حجز مؤكد»)</strong>
      <div style={{ fontSize: 11.5, color: '#64748b', margin: '4px 0 8px' }}>رتّب المراحل كما تعملون. مؤشر الإنجاز لكل جزء = ترتيب مرحلته ÷ عدد المراحل، والمرحلة الأخيرة = 100%. مرحلة «التصوير» هي التي تبدأ منها المحاضرة تُحتسب للمعلم (مع استلام الملحقات).</div>
      {steps.map((x, i) => (
        <div key={x.key || i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center', flexWrap: 'wrap', padding: 6, borderRadius: 8, background: '#f8fafc' }} data-testid={`vp-set-step-${i}`}>
          <strong style={{ width: 22, textAlign: 'center' }}>{i + 1}</strong>
          <input style={{ ...inp, flex: 2, minWidth: 160 }} placeholder="اسم المرحلة" value={x.name} onChange={(e) => upd(i, 'name', e.target.value)} data-testid={`vp-set-step-name-${i}`} />
          <label style={{ fontSize: 12, display: 'flex', gap: 4 }}><input type="radio" name="vp-filming" checked={!!x.is_filming} onChange={() => upd(i, 'is_filming', true)} data-testid={`vp-set-step-filming-${i}`} />التصوير</label>
          <label style={{ fontSize: 12, display: 'flex', gap: 4 }}><input type="checkbox" checked={!!x.requires_link} onChange={(e) => upd(i, 'requires_link', e.target.checked)} data-testid={`vp-set-step-link-${i}`} />تتطلب رابطاً</label>
          {x.requires_link && <input style={{ ...inp, flex: 1, minWidth: 150 }} placeholder="وصف الرابط" value={x.link_label || ''} onChange={(e) => upd(i, 'link_label', e.target.value)} data-testid={`vp-set-step-link-label-${i}`} />}
          <label style={{ fontSize: 12, display: 'flex', gap: 4 }}><input type="checkbox" checked={!!x.notify} onChange={(e) => upd(i, 'notify', e.target.checked)} data-testid={`vp-set-step-notify-${i}`} />إشعار المعلم</label>
          <button onClick={() => move(i, -1)} style={btn('#e2e8f0', { color: '#0f2440', padding: '4px 8px' })} data-testid={`vp-set-step-up-${i}`}>▲</button>
          <button onClick={() => move(i, 1)} style={btn('#e2e8f0', { color: '#0f2440', padding: '4px 8px' })} data-testid={`vp-set-step-down-${i}`}>▼</button>
          {steps.length > 1 && <button onClick={() => onChange(steps.filter((_, j) => j !== i))} style={btn('#fee2e2', { color: '#b91c1c', padding: '4px 8px' })} data-testid={`vp-set-step-del-${i}`}>✕</button>}
        </div>
      ))}
      <button onClick={() => onChange([...steps, { key: '', name: '', is_filming: false, requires_link: false, link_label: '', notify: false }])} style={btn('#f1f5f9', { color: '#0f2440' })} data-testid="vp-set-step-add">+ مرحلة</button>
    </div>
  );
};
