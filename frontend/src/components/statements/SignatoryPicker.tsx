import React, { useEffect, useState } from 'react';
import { corrAPI } from '../../services/corrAPI';

export type Signatory = { position_id: string; name: string; title: string };
export const EMPTY_SIGNATORY: Signatory = { position_id: '', name: '', title: '' };
type Props = { value: Signatory; onChange: (v: Signatory) => void; defaultLabel?: string; hint?: string; testID?: string };

const inp: React.CSSProperties = { flex: 1, minWidth: 120, padding: '8px 10px', borderRadius: 8, border: '1px solid #dde3ec', fontSize: 13, textAlign: 'right', direction: 'rtl', fontFamily: 'inherit' };
const MANUAL = '__manual__';

export const usePositions = () => {
  const [positions, setPositions] = useState<any[]>([]);
  useEffect(() => { corrAPI.positions('INTERNAL').then((r) => setPositions(r.data?.items || [])).catch(() => {}); }, []);
  return positions;
};

export const SignatoryPicker: React.FC<Props> = ({ value, onChange, defaultLabel = 'الافتراضي من إعدادات الكليشة', hint, testID = 'signatory-picker' }) => {
  const positions = usePositions();
  const manual = !value.position_id && !!(value.name || value.title);
  const [mode, setMode] = useState(manual ? MANUAL : value.position_id);
  useEffect(() => {
    if (value.position_id) setMode(value.position_id);
    else if (value.name || value.title) setMode(MANUAL);
  }, [value.position_id, value.name, value.title]);
  const pick = (v: string) => {
    setMode(v);
    if (v === MANUAL) onChange({ position_id: '', name: value.name, title: value.title });
    else onChange({ position_id: v, name: '', title: '' });
  };
  const sel = positions.find((p) => p.id === value.position_id);
  return (
    <div data-testid={testID} style={{ direction: 'rtl' }}>
      <select data-testid={`${testID}-select`} value={mode} onChange={(e) => pick(e.target.value)} style={{ ...inp, width: '100%', marginBottom: 6, fontWeight: 700, color: '#1a2540' }}>
        <option value="">{defaultLabel}</option>
        {positions.length > 0 && <optgroup label="من دليل المناصب والأسماء">{positions.map((p) => <option key={p.id} value={p.id}>{p.title_ar} — {p.display?.name || p.holder_name}</option>)}</optgroup>}
        <option value={MANUAL}>✍️ إدخال يدوي (اسم وصفة)</option>
      </select>
      {sel && <div data-testid={`${testID}-preview`} style={{ fontSize: 12, color: '#00796b', fontWeight: 700, textAlign: 'right', marginBottom: 6 }}>🖋️ {sel.display?.name || sel.holder_name} — {sel.title_ar}</div>}
      {mode === MANUAL && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <input data-testid={`${testID}-title`} value={value.title} onChange={(e) => onChange({ ...value, position_id: '', title: e.target.value })} placeholder="الصفة (مثال: عميد الكلية)" style={inp} />
          <input data-testid={`${testID}-name`} value={value.name} onChange={(e) => onChange({ ...value, position_id: '', name: e.target.value })} placeholder="الاسم (مثال: د. أحمد سالم)" style={inp} />
        </div>
      )}
      {!!hint && <div style={{ fontSize: 11, color: '#8a94a6', textAlign: 'right', lineHeight: '17px' }}>{hint}</div>}
    </div>
  );
};
