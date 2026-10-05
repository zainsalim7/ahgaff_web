import React, { useEffect, useState } from 'react';
import { corrAPI, errMsg, PRIORITY_AR, CLASS_AR, RECIPIENT_TYPE_AR } from '../../services/corrAPI';
import { Modal, Field, inp, btn, useCorrMe } from './CorrUI';

type Props = { onClose: () => void; onCreated: (id: string) => void };

export default function CorrCreateModal({ onClose, onCreated }: Props) {
  const { me } = useCorrMe();
  const [orgs, setOrgs] = useState<any[]>([]);
  const [types, setTypes] = useState<any[]>([]);
  const [f, setF] = useState({ organization_id: '', document_type_id: '', subject: '', summary: '', priority: 'NORMAL', security_classification: 'INTERNAL' });
  const [rec, setRec] = useState({ recipient_type: 'INTERNAL_ORGANIZATION', organization_id: '', external_organization: '', external_name: '', recipient_title: '', recipient_role: 'TO' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { corrAPI.organizations().then((r) => setOrgs(r.data)).catch(() => {}); }, []);
  useEffect(() => { if (f.organization_id) corrAPI.documentTypes({ organization_id: f.organization_id }).then((r) => setTypes(r.data)).catch(() => {}); }, [f.organization_id]);
  const allowed = orgs.filter((o) => !me || me.is_super || me.can_create_in === 'ALL' || (me.can_create_in as string[]).includes(o.id));
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setErr(''); setBusy(true);
    try {
      const recipients: any[] = [];
      if (rec.recipient_type === 'INTERNAL_ORGANIZATION' && rec.organization_id) recipients.push({ recipient_type: rec.recipient_type, organization_id: rec.organization_id, recipient_title: rec.recipient_title, recipient_role: rec.recipient_role, is_primary: true });
      else if (rec.recipient_type !== 'INTERNAL_ORGANIZATION' && (rec.external_organization || rec.external_name)) recipients.push({ recipient_type: rec.recipient_type, external_organization: rec.external_organization, external_name: rec.external_name, recipient_title: rec.recipient_title, recipient_role: rec.recipient_role, is_primary: true });
      const r = await corrAPI.create({ ...f, recipients });
      onCreated(r.data.id);
    } catch (e) { setErr(errMsg(e, 'فشل الإنشاء')); } finally { setBusy(false); }
  };

  return (
    <Modal title="مراسلة جديدة (مسودة — بدون رقم رسمي)" onClose={onClose} testID="corr-create-modal">
      <Field label="المنظمة المالكة *">
        <select style={inp} value={f.organization_id} onChange={(e) => set('organization_id', e.target.value)} data-testid="corr-create-org">
          <option value="">— اختر —</option>
          {allowed.map((o) => <option key={o.id} value={o.id}>{o.name_ar} ({o.code})</option>)}
        </select>
      </Field>
      <Field label="نوع الوثيقة *">
        <select style={inp} value={f.document_type_id} onChange={(e) => set('document_type_id', e.target.value)} data-testid="corr-create-type" disabled={!f.organization_id}>
          <option value="">— اختر —</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name_ar} ({t.code})</option>)}
        </select>
      </Field>
      <Field label="الموضوع *"><input style={inp} value={f.subject} onChange={(e) => set('subject', e.target.value)} data-testid="corr-create-subject" /></Field>
      <Field label="ملخص"><textarea style={{ ...inp, minHeight: 60 }} value={f.summary} onChange={(e) => set('summary', e.target.value)} data-testid="corr-create-summary" /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="الأولوية">
          <select style={inp} value={f.priority} onChange={(e) => set('priority', e.target.value)} data-testid="corr-create-priority">{Object.entries(PRIORITY_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </Field>
        <Field label="التصنيف الأمني">
          <select style={inp} value={f.security_classification} onChange={(e) => set('security_classification', e.target.value)} data-testid="corr-create-class">{Object.entries(CLASS_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </Field>
      </div>
      <div style={{ borderTop: '1px dashed #e2e8f0', margin: '6px 0 10px' }} />
      <div style={{ fontSize: 12.5, fontWeight: 800, color: '#0f2440', marginBottom: 6 }}>المستلم الرئيسي (يمكن إضافة المزيد لاحقاً)</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="نوع المستلم">
          <select style={inp} value={rec.recipient_type} onChange={(e) => setRec((p) => ({ ...p, recipient_type: e.target.value }))} data-testid="corr-create-rec-type">{Object.entries(RECIPIENT_TYPE_AR).filter(([k]) => k !== 'INTERNAL_USER').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </Field>
        <Field label="الدور"><select style={inp} value={rec.recipient_role} onChange={(e) => setRec((p) => ({ ...p, recipient_role: e.target.value }))}><option value="TO">إلى</option><option value="CC">نسخة</option><option value="BCC">نسخة مخفية</option></select></Field>
      </div>
      {rec.recipient_type === 'INTERNAL_ORGANIZATION' ? (
        <Field label="الجهة المستلمة"><select style={inp} value={rec.organization_id} onChange={(e) => setRec((p) => ({ ...p, organization_id: e.target.value }))} data-testid="corr-create-rec-org"><option value="">— اختر —</option>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name_ar}</option>)}</select></Field>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="الجهة الخارجية"><input style={inp} value={rec.external_organization} onChange={(e) => setRec((p) => ({ ...p, external_organization: e.target.value }))} data-testid="corr-create-ext-org" /></Field>
          <Field label="اسم الشخص"><input style={inp} value={rec.external_name} onChange={(e) => setRec((p) => ({ ...p, external_name: e.target.value }))} data-testid="corr-create-ext-name" /></Field>
        </div>
      )}
      <Field label="صفة المستلم (اختياري: سعادة / المحترم …)"><input style={inp} value={rec.recipient_title} onChange={(e) => setRec((p) => ({ ...p, recipient_title: e.target.value }))} data-testid="corr-create-rec-title" /></Field>
      {!!err && <div style={{ color: '#b91c1c', fontSize: 12.5, marginBottom: 8 }} data-testid="corr-create-error">{err}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={save} disabled={busy || !f.organization_id || !f.document_type_id || !f.subject.trim()} style={btn('#16a34a', { opacity: busy ? 0.6 : 1 })} data-testid="corr-create-save">حفظ المسودة</button>
        <button onClick={onClose} style={btn('#94a3b8')}>إلغاء</button>
      </div>
    </Modal>
  );
}
