import React, { useEffect, useState } from 'react';
import { corrAPI, errMsg } from '../../services/corrAPI';
import { Modal, inp, btn, Badge } from './CorrUI';

type Props = { kind: 'students' | 'employees' | 'faculty' | 'organizations'; title: string; onClose: () => void; onPick: (item: { id: string; label: string; code: string; meta: string }) => void };

export const EntityPicker: React.FC<Props> = ({ kind, title, onClose, onPick }) => {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true); setErr('');
      corrAPI.entities(kind, q).then((r) => { setRows(r.data.items); setTotal(r.data.total); }).catch((e) => setErr(errMsg(e, 'تعذر البحث'))).finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [q, kind]);
  return (
    <Modal title={title} onClose={onClose} testID="entity-picker" width={620}>
      <input autoFocus style={inp} placeholder="ابحث بالاسم أو الرقم…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="entity-picker-search" />
      {!!err && <div style={{ color: '#b91c1c', fontSize: 12.5, marginTop: 8 }} data-testid="entity-picker-error">{err}</div>}
      <div style={{ fontSize: 11.5, color: '#64748b', margin: '8px 0 4px' }}>{loading ? 'جارٍ البحث…' : `${total} نتيجة — تُعرض الحقول الأساسية فقط`}</div>
      <div style={{ maxHeight: 380, overflowY: 'auto' }} data-testid="entity-picker-results">
        {rows.map((r) => (
          <div key={r.id} onClick={() => onPick(r)} data-testid={`entity-pick-${r.id}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '8px 10px', borderTop: '1px solid #f1f5f9', cursor: 'pointer' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f1f5f9')} onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}>
            <div><div style={{ fontWeight: 800, fontSize: 13 }}>{r.label}</div><div style={{ fontSize: 11.5, color: '#64748b' }}>{r.meta}</div></div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>{!!r.code && <code style={{ fontSize: 11 }}>{r.code}</code>}{!!r.status && <Badge text={r.status} color="#475569" />}<button style={btn('#7c3aed', { padding: '4px 10px' })}>اختيار</button></div>
          </div>
        ))}
        {!loading && rows.length === 0 && <div style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>لا نتائج</div>}
      </div>
    </Modal>
  );
};
