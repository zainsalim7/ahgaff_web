import React, { useEffect, useState } from 'react';
import { corrAPI, errMsg } from '../../services/corrAPI';
import { card, btn } from './CorrUI';
import { useAssetUrl } from './A4Preview';

export const SignatureCard: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => corrAPI.mySignature().then((r) => setData(r.data)).catch(() => setData({ signature: null, can_sign: false }));
  useEffect(() => { load(); }, []);
  const src = useAssetUrl(data?.signature?.url);
  if (!data?.can_sign) return null;
  const upload = async (f?: File) => {
    if (!f) return; setBusy(true); setErr('');
    try { await corrAPI.uploadSignature(f); await load(); } catch (e) { setErr(errMsg(e, 'فشل رفع التوقيع')); } finally { setBusy(false); }
  };
  const remove = async () => { if (!window.confirm('حذف صورة التوقيع؟ المراسلات الموقّعة سابقاً لا تتأثر.')) return; try { await corrAPI.deleteSignature(); await load(); } catch (e) { setErr(errMsg(e)); } };
  return (
    <div style={{ ...card, marginTop: 12, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }} data-testid="signature-card">
      <div style={{ width: 180, height: 80, border: '1px dashed #cbd5e1', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
        {src ? <img src={src} alt="signature" style={{ maxWidth: 170, maxHeight: 70, objectFit: 'contain' }} data-testid="signature-img" /> : <span style={{ fontSize: 11.5, color: '#94a3b8' }}>لا يوجد توقيع</span>}
      </div>
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ fontWeight: 800, color: '#0f2440' }}>توقيعي الإلكتروني المرئي</div>
        <div style={{ fontSize: 11.5, color: '#64748b', margin: '2px 0 8px' }}>PNG/WebP بخلفية شفافة ≤ 1MB — يُلتقط تلقائياً مع اسمك وصفتك ووقت التوقيع عند توقيع أي مراسلة، ويُطبع مع ختم الجهة في قسم التوقيع.</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={btn('#7c3aed', { cursor: 'pointer' })}>{busy ? 'جارٍ الرفع…' : data.signature ? 'استبدال' : 'رفع التوقيع'}<input type="file" accept="image/png,image/webp" style={{ display: 'none' }} onChange={(e) => upload(e.target.files?.[0])} data-testid="signature-upload" /></label>
          {data.signature && <button onClick={remove} style={btn('#dc2626')} data-testid="signature-delete">حذف</button>}
          {data.signature && <span style={{ fontSize: 11, color: '#64748b' }}>بصمة: <code>{data.signature.sha256?.slice(0, 12)}</code></span>}
        </div>
        {!!err && <div style={{ color: '#b91c1c', fontSize: 12, marginTop: 6 }} data-testid="signature-error">{err}</div>}
      </div>
    </div>
  );
};
