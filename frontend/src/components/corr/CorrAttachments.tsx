import React, { useEffect, useState } from 'react';
import { corrAPI, errMsg } from '../../services/corrAPI';
import api from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { card, btn, Modal, Badge } from './CorrUI';

const fmtSize = (n: number) => (n < 1024 ? '<1 كيلوبايت' : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} كيلوبايت` : `${(n / 1024 / 1024).toFixed(1)} ميجابايت`);

export const CorrAttachments: React.FC<{ corrId: string; canEdit: boolean }> = ({ corrId, canEdit }) => {
  const [items, setItems] = useState<any[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [showCurr, setShowCurr] = useState(false);
  const [faculties, setFaculties] = useState<any[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const token = useAuthStore.getState().token;
  const fileUrl = (path: string) => `${api.defaults.baseURL}/files/${path}?auth=${token}`;

  const load = async () => {
    try { setItems((await corrAPI.attachments(corrId)).data); } catch (e) { setErr(errMsg(e)); }
  };
  useEffect(() => { if (corrId) load(); }, [corrId]);

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setErr('');
    try { await corrAPI.uploadAttachment(corrId, file); await load(); }
    catch (er) { setErr(errMsg(er, 'فشل رفع الملف')); }
    finally { setBusy(false); e.target.value = ''; }
  };

  const openCurriculum = async () => {
    setShowCurr(true); setPicked([]);
    if (faculties.length === 0) {
      try { const r = await api.get('/faculties'); setFaculties(r.data?.items || r.data || []); } catch {}
    }
  };

  const attachCurriculum = async () => {
    if (picked.length === 0) return;
    setBusy(true); setErr('');
    try { await corrAPI.attachCurriculum(corrId, picked); setShowCurr(false); await load(); }
    catch (er) { setErr(errMsg(er, 'تعذر إرفاق الخطة الدراسية')); }
    finally { setBusy(false); }
  };

  const remove = async (attId: string) => {
    if (!window.confirm('حذف هذا المرفق؟')) return;
    try { await corrAPI.deleteAttachment(attId); await load(); } catch (er) { setErr(errMsg(er)); }
  };

  return (
    <div style={card} data-testid="corr-attachments">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <b style={{ color: '#0f2440' }}>المرفقات ({items.length})</b>
        {canEdit && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <label style={{ ...btn('#0ea5e9', { padding: '4px 10px' }), display: 'inline-block' }} data-testid="corr-att-upload-btn">
              + رفع ملف
              <input type="file" onChange={onUpload} disabled={busy} style={{ display: 'none' }} data-testid="corr-att-upload-input" />
            </label>
            <button onClick={openCurriculum} disabled={busy} style={btn('#16a34a', { padding: '4px 10px' })} data-testid="corr-att-curriculum-btn">+ إرفاق خطة دراسية</button>
          </div>
        )}
      </div>
      {!!err && <div style={{ color: '#b91c1c', fontSize: 12, marginTop: 6 }} data-testid="corr-att-error">{err}</div>}
      {items.length === 0 ? (
        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }} data-testid="corr-att-empty">لا توجد مرفقات</div>
      ) : (
        <div style={{ marginTop: 8 }}>
          {items.map((a) => (
            <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, padding: '6px 0', borderTop: '1px solid #f1f5f9', flexWrap: 'wrap', gap: 6 }} data-testid={`corr-attachment-${a.id}`}>
              <a href={fileUrl(a.storage_path)} target="_blank" rel="noreferrer" style={{ color: '#1565c0', fontWeight: 700, textDecoration: 'none' }} data-testid={`corr-att-download-${a.id}`}>
                {a.content_type === 'application/pdf' ? '📄' : '📎'} {a.original_filename}
              </a>
              <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {a.source === 'CURRICULUM' && <Badge text={`خطة دراسية — ${a.faculty_name || ''} / ${a.department_name || ''}`} color="#16a34a" />}
                <span style={{ color: '#94a3b8' }}>{fmtSize(a.size || 0)}</span>
                {canEdit && <button onClick={() => remove(a.id)} style={{ border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer' }} data-testid={`corr-att-delete-${a.id}`}>✕</button>}
              </span>
            </div>
          ))}
        </div>
      )}
      {showCurr && (
        <Modal title="إرفاق خطة دراسية (منهج)" onClose={() => setShowCurr(false)} testID="corr-curriculum-modal">
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>اختر كلية واحدة أو أكثر — سيتم توليد ملف PDF لكل قسم ضمن الكليات المختارة من بيانات الخطة الدراسية وإرفاقه تلقائياً بالخطاب.</div>
          {!!err && <div style={{ color: '#b91c1c', fontSize: 12, marginBottom: 8 }} data-testid="corr-curriculum-error">{err}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
            {faculties.map((f: any) => {
              const fid = f.id || f._id;
              const checked = picked.includes(fid);
              return (
                <label key={fid} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, padding: '6px 8px', borderRadius: 8, border: '1px solid ' + (checked ? '#16a34a' : '#e2e8f0'), backgroundColor: checked ? '#f0fdf4' : '#fff', cursor: 'pointer' }} data-testid={`corr-curriculum-faculty-${fid}`}>
                  <input type="checkbox" checked={checked} onChange={() => setPicked(checked ? picked.filter((x) => x !== fid) : [...picked, fid])} />
                  {f.name}
                </label>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button onClick={attachCurriculum} disabled={busy || picked.length === 0} style={btn('#16a34a')} data-testid="corr-curriculum-confirm">إرفاق ({picked.length})</button>
            <button onClick={() => setShowCurr(false)} style={btn('#94a3b8')} data-testid="corr-curriculum-cancel">إلغاء</button>
          </div>
        </Modal>
      )}
    </div>
  );
};
