import React, { useEffect, useState, useCallback } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { corrAPI, errMsg, STATUS_AR, STATUS_COLOR, PRIORITY_AR, CLASS_AR, ACTION_AR, RECIPIENT_TYPE_AR, ENTITY_KIND } from '../src/services/corrAPI';
import { EntityPicker } from '../src/components/corr/EntityPicker';
import { CorrPage, card, btn, inp, lbl, th, td, Badge, Modal, Field, Empty, useCorrMe } from '../src/components/corr/CorrUI';

const Row = ({ k, v, testID }: { k: string; v: any; testID?: string }) => (
  <div style={{ display: 'flex', gap: 8, fontSize: 12.5, padding: '4px 0', borderBottom: '1px dashed #eef0f3' }}><span style={{ color: '#64748b', minWidth: 120 }}>{k}</span><span style={{ fontWeight: 700 }} data-testid={testID}>{v ?? '—'}</span></div>
);

export default function CorrDetails() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { hasAnywhere } = useCorrMe();
  const [c, setC] = useState<any>(null);
  const [hist, setHist] = useState<any[]>([]);
  const [auditRows, setAuditRows] = useState<any[] | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [edit, setEdit] = useState<any | null>(null);
  const [types, setTypes] = useState<any[]>([]);
  const [orgs, setOrgs] = useState<any[]>([]);
  const [recForm, setRecForm] = useState<any | null>(null);
  const [entForm, setEntForm] = useState<any | null>(null);
  const [entPicker, setEntPicker] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setErr('');
    try {
      const [r, h] = await Promise.all([corrAPI.get(id), corrAPI.history(id)]);
      setC(r.data); setHist(h.data);
    } catch (e) { setErr(errMsg(e, 'تعذر تحميل المراسلة')); }
  }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { corrAPI.organizations().then((r) => setOrgs(r.data)).catch(() => {}); }, []);
  useEffect(() => { if (c?.organization_id) corrAPI.documentTypes({ organization_id: c.organization_id }).then((r) => setTypes(r.data)).catch(() => {}); }, [c?.organization_id]);

  const doAction = async (action: string, rs = '') => {
    setBusy(true); setErr('');
    try { await corrAPI.transition(id!, action, rs); setReasonFor(null); setReason(''); await load(); }
    catch (e) { setErr(errMsg(e, 'تعذر تنفيذ الإجراء')); } finally { setBusy(false); }
  };
  const onAction = (a: string) => (ACTION_AR[a]?.needsReason ? setReasonFor(a) : doAction(a));
  const saveEdit = async () => {
    setBusy(true); setErr('');
    try { await corrAPI.patch(id!, { ...edit, version: c.version }); setEdit(null); await load(); } catch (e) { setErr(errMsg(e, 'فشل الحفظ')); } finally { setBusy(false); }
  };
  const delDraft = async () => {
    if (!window.confirm('حذف المسودة (حذف منطقي)؟')) return;
    try { await corrAPI.remove(id!); router.replace('/corr-list?mine=1' as any); } catch (e) { setErr(errMsg(e)); }
  };
  const saveRec = async () => {
    setBusy(true); setErr('');
    try { await corrAPI.addRecipient(id!, recForm); setRecForm(null); await load(); } catch (e) { setErr(errMsg(e, 'فشل إضافة المستلم')); } finally { setBusy(false); }
  };
  const saveEnt = async () => {
    setBusy(true); setErr('');
    try { const { entity_label, ...payload } = entForm; await corrAPI.addEntity(id!, payload); setEntForm(null); await load(); } catch (e) { setErr(errMsg(e, 'فشل الربط')); } finally { setBusy(false); }
  };
  const loadAudit = async () => { try { setAuditRows((await corrAPI.audit(id!)).data); } catch (e) { setErr(errMsg(e)); } };

  if (!c) return <CorrPage title="تفاصيل المراسلة" loading={!err}>{!!err && <Empty text={err} />}</CorrPage>;
  const color = STATUS_COLOR[c.status] || '#64748b';
  return (
    <CorrPage title={c.official_number || 'مسودة بدون رقم رسمي'} subtitle={c.subject} testID="corr-details">
      {!!err && <div style={{ ...card, color: '#b91c1c' }} data-testid="corr-details-error">{err}</div>}
      <div style={{ ...card, borderRight: `6px solid ${color}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <Badge text={STATUS_AR[c.status] || c.status} color={color} testID="corr-status-badge" />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} data-testid="corr-actions">
            {c.can_edit && <button onClick={() => setEdit({ subject: c.subject, summary: c.summary, priority: c.priority, security_classification: c.security_classification, document_type_id: c.document_type_id })} style={btn('#1565c0')} data-testid="corr-edit-btn">تعديل</button>}
            <button onClick={() => router.push({ pathname: '/corr-compose', params: { id } } as any)} style={btn('#7c3aed')} data-testid="corr-compose-btn">{c.can_edit && ['DRAFT', 'CHANGES_REQUESTED'].includes(c.status) ? '✎ محرر الخطاب' : '📄 عرض الخطاب'}</button>
            {c.status === 'DRAFT' && c.can_edit && <button onClick={delDraft} style={btn('#64748b')} data-testid="corr-delete-btn">حذف المسودة</button>}
            {(c.allowed_actions || []).map((a: string) => (
              <button key={a} disabled={busy} onClick={() => onAction(a)} style={btn(ACTION_AR[a]?.color || '#0f2440')} data-testid={`corr-action-${a}`}>{ACTION_AR[a]?.label || a}</button>
            ))}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0 24px', marginTop: 10 }}>
          <Row k="الرقم الرسمي" v={c.official_number || 'يُولَّد عند الإصدار'} testID="corr-official-number" />
          <Row k="المرجع الداخلي (UUID)" v={c.uuid} />
          <Row k="سنة الترقيم / التسلسل" v={c.numbering_year ? `${c.numbering_year} / ${c.sequence_number}` : '—'} />
          <Row k="نوع الوثيقة" v={`${c.document_type_name} (${c.document_type_code})`} />
          <Row k="المنظمة المالكة" v={`${c.organization_name} (${c.organization_code})`} />
          <Row k="الأولوية" v={PRIORITY_AR[c.priority]} />
          <Row k="التصنيف الأمني" v={CLASS_AR[c.security_classification]} />
          <Row k="المنشئ" v={c.created_by_name} />
          <Row k="الإصدار (version)" v={c.version} />
          <Row k="أُنشئت" v={String(c.created_at).replace('T', ' ').slice(0, 16)} />
          <Row k="صدرت" v={c.issued_at ? String(c.issued_at).slice(0, 16).replace('T', ' ') : '—'} />
          <Row k="أُرشفت / أُلغيت" v={(c.archived_at || c.cancelled_at) ? String(c.archived_at || c.cancelled_at).slice(0, 10) : '—'} />
        </div>
        {!!c.summary && <div style={{ marginTop: 10, fontSize: 13, color: '#334155', backgroundColor: '#f8fafc', padding: 10, borderRadius: 8 }}>{c.summary}</div>}
        {!!c.cancel_reason && <div style={{ marginTop: 8, fontSize: 12.5, color: '#991b1b' }}>سبب الإلغاء: {c.cancel_reason}</div>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><b style={{ color: '#0f2440' }}>المستلمون ({c.recipients.length})</b>
            {c.can_edit && <button onClick={() => setRecForm({ recipient_type: 'INTERNAL_ORGANIZATION', organization_id: '', external_organization: '', external_name: '', external_contact: '', recipient_title: '', recipient_role: 'TO' })} style={btn('#0ea5e9', { padding: '4px 10px' })} data-testid="corr-add-recipient">+ مستلم</button>}
          </div>
          {c.recipients.length === 0 && <div style={{ fontSize: 12, color: '#94a3b8' }}>لا يوجد مستلمون — مطلوب مستلم واحد على الأقل قبل التقديم</div>}
          {c.recipients.map((r: any) => (
            <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '6px 0', borderTop: '1px solid #f1f5f9' }} data-testid={`corr-recipient-${r.id}`}>
              <span><Badge text={r.recipient_role} color="#0f2440" /> <b>{r.organization_name || r.user_name || r.external_organization || r.external_name}</b> <span style={{ color: '#64748b' }}>· {RECIPIENT_TYPE_AR[r.recipient_type]}</span></span>
              {c.can_edit && <button onClick={() => corrAPI.removeRecipient(id!, r.id).then(load).catch((e) => setErr(errMsg(e)))} style={{ border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer' }}>✕</button>}
            </div>
          ))}
        </div>
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><b style={{ color: '#0f2440' }}>الكيانات المرتبطة ({c.entities.length})</b>
            {c.can_edit && <button onClick={() => setEntForm({ entity_type: 'STUDENT', entity_id: '', relationship_type: 'SUBJECT' })} style={btn('#7c3aed', { padding: '4px 10px' })} data-testid="corr-add-entity">+ ربط</button>}
          </div>
          {c.entities.length === 0 && <div style={{ fontSize: 12, color: '#94a3b8' }}>لا توجد كيانات مرتبطة (طالب/موظف/مقرر…)</div>}
          {c.entities.map((e: any) => (
            <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '6px 0', borderTop: '1px solid #f1f5f9' }}>
              <span><Badge text={e.entity_type} color="#7c3aed" /> <code>{e.entity_id}</code> <span style={{ color: '#64748b' }}>· {e.relationship_type}</span></span>
              {c.can_edit && <button onClick={() => corrAPI.removeEntity(id!, e.id).then(load).catch((er) => setErr(errMsg(er)))} style={{ border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer' }}>✕</button>}
            </div>
          ))}
        </div>
      </div>

      <div style={card} data-testid="corr-history">
        <b style={{ color: '#0f2440' }}>سجل الحالات ({hist.length})</b>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
          <thead><tr><th style={th}>من</th><th style={th}>إلى</th><th style={th}>بواسطة</th><th style={th}>السبب / الرقم</th><th style={th}>الوقت</th></tr></thead>
          <tbody>{hist.map((h) => (
            <tr key={h.id}><td style={td}>{h.from_status ? STATUS_AR[h.from_status] : '—'}</td><td style={td}><Badge text={STATUS_AR[h.to_status]} color={STATUS_COLOR[h.to_status]} /></td><td style={td}>{h.performed_by_name}</td>
              <td style={td}>{h.reason}{h.metadata?.official_number ? <code style={{ marginRight: 6, color: '#0f766e' }}>{h.metadata.official_number}</code> : null}</td><td style={{ ...td, whiteSpace: 'nowrap' }}>{String(h.created_at).replace('T', ' ').slice(0, 16)}</td></tr>
          ))}</tbody>
        </table>
      </div>
      {hasAnywhere('audit.view') && (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><b style={{ color: '#0f2440' }}>سجل التدقيق</b><button onClick={loadAudit} style={btn('#475569', { padding: '4px 10px' })} data-testid="corr-load-audit">تحميل</button></div>
          {auditRows && <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}><tbody>{auditRows.map((a) => (
            <tr key={a.id}><td style={td}><code>{a.action}</code></td><td style={td}>{a.username}</td><td style={td}>{a.ip_address}</td><td style={{ ...td, whiteSpace: 'nowrap' }}>{String(a.created_at).replace('T', ' ').slice(0, 19)}</td></tr>
          ))}</tbody></table>}
        </div>
      )}

      {reasonFor && (
        <Modal title={`${ACTION_AR[reasonFor].label} — السبب مطلوب`} onClose={() => setReasonFor(null)} testID="corr-reason-modal">
          <textarea style={{ ...inp, minHeight: 80 }} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="corr-reason-input" />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}><button disabled={!reason.trim() || busy} aria-disabled={!reason.trim() || busy} onClick={() => reason.trim() && doAction(reasonFor, reason)} style={btn(ACTION_AR[reasonFor].color)} data-testid="corr-reason-confirm">تأكيد</button><button onClick={() => setReasonFor(null)} style={btn('#94a3b8')}>إلغاء</button></div>
        </Modal>
      )}
      {edit && (
        <Modal title="تعديل المسودة" onClose={() => setEdit(null)} testID="corr-edit-modal">
          <Field label="الموضوع"><input style={inp} value={edit.subject} onChange={(e) => setEdit({ ...edit, subject: e.target.value })} data-testid="corr-edit-subject" /></Field>
          <Field label="الملخص"><textarea style={{ ...inp, minHeight: 60 }} value={edit.summary} onChange={(e) => setEdit({ ...edit, summary: e.target.value })} /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <Field label="نوع الوثيقة"><select style={inp} value={edit.document_type_id} onChange={(e) => setEdit({ ...edit, document_type_id: e.target.value })}>{types.map((t) => <option key={t.id} value={t.id}>{t.name_ar}</option>)}</select></Field>
            <Field label="الأولوية"><select style={inp} value={edit.priority} onChange={(e) => setEdit({ ...edit, priority: e.target.value })}>{Object.entries(PRIORITY_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <Field label="التصنيف"><select style={inp} value={edit.security_classification} onChange={(e) => setEdit({ ...edit, security_classification: e.target.value })}>{Object.entries(CLASS_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          </div>
          <div style={{ display: 'flex', gap: 8 }}><button onClick={saveEdit} disabled={busy} style={btn('#16a34a')} data-testid="corr-edit-save">حفظ</button><button onClick={() => setEdit(null)} style={btn('#94a3b8')}>إلغاء</button></div>
        </Modal>
      )}
      {recForm && (
        <Modal title="إضافة مستلم" onClose={() => setRecForm(null)} testID="corr-recipient-modal">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="النوع"><select style={inp} value={recForm.recipient_type} onChange={(e) => setRecForm({ ...recForm, recipient_type: e.target.value })} data-testid="corr-rec-type">{Object.entries(RECIPIENT_TYPE_AR).filter(([k]) => k !== 'INTERNAL_USER').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <Field label="الدور"><select style={inp} value={recForm.recipient_role} onChange={(e) => setRecForm({ ...recForm, recipient_role: e.target.value })}><option value="TO">إلى</option><option value="CC">نسخة</option><option value="BCC">نسخة مخفية</option></select></Field>
          </div>
          {recForm.recipient_type === 'INTERNAL_ORGANIZATION' ? (
            <Field label="الجهة"><select style={inp} value={recForm.organization_id} onChange={(e) => setRecForm({ ...recForm, organization_id: e.target.value })} data-testid="corr-rec-org"><option value="">— اختر —</option>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name_ar}</option>)}</select></Field>
          ) : (<>
            <Field label="الجهة الخارجية"><input style={inp} value={recForm.external_organization} onChange={(e) => setRecForm({ ...recForm, external_organization: e.target.value })} data-testid="corr-rec-ext-org" /></Field>
            <Field label="اسم الشخص"><input style={inp} value={recForm.external_name} onChange={(e) => setRecForm({ ...recForm, external_name: e.target.value })} /></Field>
            <Field label="وسيلة التواصل"><input style={inp} value={recForm.external_contact} onChange={(e) => setRecForm({ ...recForm, external_contact: e.target.value })} /></Field>
          </>)}
          <Field label="صفة المستلم (مثل: سعادة / الأستاذ الدكتور / المحترم)"><input style={inp} value={recForm.recipient_title} onChange={(e) => setRecForm({ ...recForm, recipient_title: e.target.value })} data-testid="corr-rec-title" /></Field>
          <div style={{ display: 'flex', gap: 8 }}><button onClick={saveRec} disabled={busy} style={btn('#0ea5e9')} data-testid="corr-rec-save">إضافة</button><button onClick={() => setRecForm(null)} style={btn('#94a3b8')}>إلغاء</button></div>
        </Modal>
      )}
      {entForm && (
        <Modal title="ربط كيان جامعي" onClose={() => setEntForm(null)} testID="corr-entity-modal">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <Field label="نوع الكيان"><select style={inp} value={entForm.entity_type} onChange={(e) => setEntForm({ ...entForm, entity_type: e.target.value })}>{['STUDENT', 'EMPLOYEE', 'TEACHER', 'COURSE', 'DEPARTMENT', 'FACULTY', 'SEMESTER', 'OTHER'].map((t) => <option key={t} value={t}>{t}</option>)}</select></Field>
            <Field label="معرّف الكيان">
              <div style={{ display: 'flex', gap: 6 }}>
                <input style={inp} value={entForm.entity_id} onChange={(e) => setEntForm({ ...entForm, entity_id: e.target.value })} data-testid="corr-ent-id" />
                {ENTITY_KIND[entForm.entity_type === 'TEACHER' ? 'FACULTY' : entForm.entity_type] && <button onClick={() => setEntPicker(entForm.entity_type === 'TEACHER' ? 'FACULTY' : entForm.entity_type)} style={btn('#7c3aed', { whiteSpace: 'nowrap' })} data-testid="corr-ent-pick">بحث</button>}
              </div>
              {!!entForm.entity_label && <div style={{ fontSize: 12, color: '#166534', marginTop: 4 }}>{entForm.entity_label}</div>}
            </Field>
            <Field label="نوع العلاقة"><select style={inp} value={entForm.relationship_type} onChange={(e) => setEntForm({ ...entForm, relationship_type: e.target.value })}>{['SUBJECT', 'RELATED_PERSON', 'REFERENCE', 'ATTACHMENT_OF'].map((t) => <option key={t} value={t}>{t}</option>)}</select></Field>
          </div>
          <div style={{ display: 'flex', gap: 8 }}><button onClick={saveEnt} disabled={busy || !entForm.entity_id} style={btn('#7c3aed')} data-testid="corr-ent-save">ربط</button><button onClick={() => setEntForm(null)} style={btn('#94a3b8')}>إلغاء</button></div>
        </Modal>
      )}
      {entPicker && <EntityPicker kind={ENTITY_KIND[entPicker].kind as any} title={`اختيار ${ENTITY_KIND[entPicker].label}`} onClose={() => setEntPicker(null)} onPick={(item) => { setEntForm({ ...entForm, entity_id: item.id, entity_label: `${item.label} (${item.code})` }); setEntPicker(null); }} />}
    </CorrPage>
  );
}
