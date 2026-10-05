import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { corrAPI, errMsg } from '../src/services/corrAPI';
import { CorrPage, card, btn, useCorrMe } from '../src/components/corr/CorrUI';
import CorrCreateModal from '../src/components/corr/CorrCreateModal';

const KPIS: [string, string, string, string][] = [
  ['my_drafts', 'مسوداتي', '#64748b', '/corr-list?mine=1'],
  ['waiting_review', 'بانتظار المراجعة', '#0ea5e9', '/corr-list?status=SUBMITTED'],
  ['waiting_approval', 'بانتظار الاعتماد', '#f59e0b', '/corr-list?status=UNDER_REVIEW'],
  ['waiting_signature', 'بانتظار التوقيع', '#7c3aed', '/corr-list?status=APPROVED'],
  ['issued', 'صادرة', '#0f766e', '/corr-list?status=ISSUED'],
  ['archived', 'مؤرشفة', '#475569', '/corr-list?status=ARCHIVED'],
  ['cancelled', 'ملغاة', '#991b1b', '/corr-list?status=CANCELLED'],
];

export default function CorrDashboard() {
  const router = useRouter();
  const { me } = useCorrMe();
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState('');
  const [create, setCreate] = useState(false);
  const load = useCallback(() => corrAPI.dashboard().then((r) => setData(r.data)).catch((e) => setErr(errMsg(e))), []);
  useEffect(() => { load(); }, [load]);
  const canCreate = me && (me.is_super || (Array.isArray(me.can_create_in) ? me.can_create_in.length > 0 : me.can_create_in === 'ALL'));
  return (
    <CorrPage title="المراسلات الرسمية" subtitle="لوحة المتابعة — الأرقام حسب نطاقك التنظيمي" loading={!data && !err} testID="corr-dashboard"
      actions={canCreate ? <button onClick={() => setCreate(true)} style={btn('#16a34a')} data-testid="corr-new-btn">+ مراسلة جديدة</button> : null}>
      {!!err && <div style={{ ...card, color: '#b91c1c' }}>{err}</div>}
      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12, direction: 'rtl' }} data-testid="corr-kpis">
          {KPIS.map(([k, label, color, path]) => (
            <div key={k} onClick={() => router.push(path as any)} data-testid={`corr-kpi-${k}`} style={{ ...card, cursor: 'pointer', borderTop: `4px solid ${color}`, marginBottom: 0 }}>
              <div style={{ fontSize: 12, color: '#475569', fontWeight: 700 }}>{label}</div>
              <div style={{ fontSize: 30, fontWeight: 900, color }}>{data[k]}</div>
            </div>
          ))}
        </div>
      )}
      {data && <div style={{ ...card, marginTop: 12, color: '#475569', fontSize: 12.5 }}>إجمالي المراسلات المرئية لك: <b>{data.total_visible}</b></div>}
      {create && <CorrCreateModal onClose={() => setCreate(false)} onCreated={(id) => { setCreate(false); router.push(`/corr-details?id=${id}` as any); }} />}
    </CorrPage>
  );
}
