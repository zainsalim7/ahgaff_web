import React, { useEffect, useState } from 'react';
import { hrAPI } from '../../services/api';
import { Modal, Field, inp, btn, opt, errMsg, Badge, fmtDT } from './ui';

export const TASK_STATUS_COLOR: Record<string, string> = { open: '#0284c7', in_progress: '#f97316', done: '#16a34a', cancelled: '#64748b' };
export const TASK_PRIORITY_COLOR: Record<string, string> = { low: '#94a3b8', normal: '#0f2440', high: '#f97316', urgent: '#dc2626' };

interface FormProps { onClose: () => void; onSaved: (msg: string) => void; meta: any; task?: any | null; }

export const TaskFormModal: React.FC<FormProps> = ({ onClose, onSaved, meta, task }) => {
  const [f, setF] = useState<any>({ title: '', description: '', assignee_employee_id: '', priority: 'normal', due_date: '', start_date: '' });
  const [emps, setEmps] = useState<any[]>([]);
  const [scope, setScope] = useState('team');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    hrAPI.tasksAssignable().then((r) => { setEmps(r.data.employees || []); setScope(r.data.scope); }).catch(() => {});
    if (task) setF({ title: task.title, description: task.description || '', assignee_employee_id: task.assignee_employee_id, priority: task.priority, due_date: task.due_date || '', start_date: task.start_date || '' });
  }, [task]);
  const set = (k: string) => (e: any) => setF((p: any) => ({ ...p, [k]: e.target.value }));
  const save = async () => {
    setBusy(true); setErr('');
    try {
      const payload = { ...f, due_date: f.due_date || null, start_date: f.start_date || null };
      const r = task?.id ? await hrAPI.updateTask(task.id, payload) : await hrAPI.createTask(payload);
      onSaved(r.data.message); onClose();
    } catch (e) { setErr(errMsg(e, 'فشل الحفظ')); } finally { setBusy(false); }
  };
  return (
    <Modal title={task ? 'تعديل المهمة' : 'إسناد مهمة جديدة'} onClose={onClose} busy={busy} testID="task-form-modal">
      {emps.length === 0 && !task && <div style={{ fontSize: 12.5, color: '#c62828', backgroundColor: '#ffebee', padding: 8, borderRadius: 8, marginBottom: 10, textAlign: 'right' }}>لا يوجد موظفون يمكنك إسناد مهام لهم — الإسناد متاح للمدير المباشر لفريقه أو لمن لديه صلاحية إدارة المهام.</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="العنوان *" span={2}><input value={f.title} onChange={set('title')} style={inp} data-testid="task-title" /></Field>
        <Field label={`الموظف المكلَّف * ${scope === 'team' ? '(فريقك)' : ''}`} span={2}>
          <select value={f.assignee_employee_id} onChange={set('assignee_employee_id')} style={inp} data-testid="task-assignee"><option value="">— اختر —</option>{emps.map((e) => <option key={e.id} value={e.id}>{e.full_name} ({e.employee_no}){e.job_title ? ` — ${e.job_title}` : ''}</option>)}</select>
        </Field>
        <Field label="الأولوية"><select value={f.priority} onChange={set('priority')} style={inp} data-testid="task-priority">{opt(meta?.priorities)}</select></Field>
        <Field label="تاريخ الاستحقاق"><input type="date" value={f.due_date} onChange={set('due_date')} style={{ ...inp, direction: 'ltr' }} data-testid="task-due" /></Field>
        <Field label="الوصف / المطلوب" span={2}><textarea value={f.description} onChange={set('description')} rows={4} style={{ ...inp, resize: 'vertical' }} data-testid="task-description" /></Field>
      </div>
      {err && <div style={{ color: '#c62828', backgroundColor: '#ffebee', padding: '8px 10px', borderRadius: 8, fontSize: 12.5, marginTop: 10, textAlign: 'right' }} data-testid="task-form-error">{err}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button onClick={save} disabled={busy} style={btn('#1565c0')} data-testid="task-form-submit">{busy ? '...' : task ? 'حفظ' : 'إسناد المهمة'}</button>
        <button onClick={onClose} style={btn('#f1f5f9', '#0f2440')}>إلغاء</button>
      </div>
    </Modal>
  );
};

export const TaskDetailModal: React.FC<{ taskId: string; meta: any; onClose: () => void; onChanged: (msg: string) => void; onEdit: (t: any) => void }> = ({ taskId, meta, onClose, onChanged, onEdit }) => {
  const [t, setT] = useState<any>(null);
  const [progress, setProgress] = useState(0);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => hrAPI.task(taskId).then((r) => { setT(r.data); setProgress(r.data.progress || 0); }).catch((e) => { window.alert(errMsg(e)); onClose(); });
  useEffect(() => { load(); }, [taskId]);
  if (!t) return null;
  const act = async (status?: string) => {
    setBusy(true);
    try { const r = await hrAPI.taskProgress(t.id, { status, progress, note }); onChanged(r.data.message); setNote(''); load(); } catch (e) { window.alert(errMsg(e)); } finally { setBusy(false); }
  };
  const del = async () => { if (!window.confirm('حذف المهمة؟')) return; try { const r = await hrAPI.deleteTask(t.id); onChanged(r.data.message); onClose(); } catch (e) { window.alert(errMsg(e)); } };
  const openTask = ['open', 'in_progress'].includes(t.status);
  return (
    <Modal title={t.title} onClose={onClose} width={600} testID="task-detail-modal">
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><Badge color={TASK_STATUS_COLOR[t.status]} testID="task-detail-status">{t.status_label}</Badge><Badge color={TASK_PRIORITY_COLOR[t.priority]}>{t.priority_label}</Badge>{t.overdue && <Badge color="#dc2626">متأخرة</Badge>}</div>
      {t.description && <div style={{ marginTop: 10, backgroundColor: '#f7f9fc', borderRadius: 10, padding: 12, fontSize: 13, lineHeight: 1.8, whiteSpace: 'pre-wrap', color: '#334155' }}>{t.description}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10, fontSize: 12.5 }}>
        {[['المكلَّف', t.employee_name], ['الوحدة', t.org_unit_name], ['أسندها', t.assigner_name], ['الاستحقاق', t.due_date], ['أُنشئت', fmtDT(t.created_at)], ['أُنجزت', t.completed_at ? fmtDT(t.completed_at) + (t.completed_on_time === false ? ' (متأخرة)' : '') : '']].filter(([, v]) => v).map(([l, v]) => (
          <div key={l as string} style={{ backgroundColor: '#f7f9fc', borderRadius: 8, padding: '7px 10px' }}><div style={{ fontSize: 10.5, color: '#94a3b8' }}>{l}</div><div style={{ fontWeight: 700, color: '#0f2440' }}>{v}</div></div>
        ))}
      </div>
      <div style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, color: '#475569' }}><span>التقدم</span><span data-testid="task-progress-value">{progress}%</span></div>
        <div style={{ height: 8, backgroundColor: '#eef2f7', borderRadius: 6, overflow: 'hidden', direction: 'rtl', marginTop: 4 }}><div style={{ width: `${t.progress}%`, height: '100%', backgroundColor: TASK_STATUS_COLOR[t.status] }} /></div>
        {t.can_progress && openTask && <input type="range" min={0} max={100} step={5} value={progress} onChange={(e) => setProgress(Number(e.target.value))} style={{ width: '100%', marginTop: 8, direction: 'rtl' }} data-testid="task-progress-slider" />}
      </div>
      {t.can_progress && openTask && (<>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظة على التحديث (اختياري)" rows={2} style={{ ...inp, marginTop: 8, resize: 'vertical' }} data-testid="task-note" />
        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
          <button onClick={() => act(progress >= 100 ? 'done' : 'in_progress')} disabled={busy} style={btn('#1565c0')} data-testid="task-update-btn">حفظ التقدم</button>
          <button onClick={() => act('done')} disabled={busy} style={btn('#16a34a')} data-testid="task-done-btn">✅ إنجاز المهمة</button>
          {t.can_edit && <button onClick={() => act('cancelled')} disabled={busy} style={btn('#ffebee', '#c62828')} data-testid="task-cancel-btn">إلغاء المهمة</button>}
        </div>
      </>)}
      {t.can_edit && (
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          {openTask && <button onClick={() => onEdit(t)} style={btn('#e3f2fd', '#1565c0')} data-testid="task-edit-btn">تعديل</button>}
          {!openTask && <button onClick={() => act('open')} disabled={busy} style={btn('#f1f5f9', '#0f2440')} data-testid="task-reopen-btn">إعادة فتح</button>}
          {t.status === 'open' && !t.progress && <button onClick={del} style={btn('#f1f5f9', '#c62828')} data-testid="task-delete-btn">حذف</button>}
        </div>
      )}
      {t.updates?.length > 0 && <div style={{ marginTop: 14 }}><div style={{ fontSize: 12, fontWeight: 800, color: '#5b6678', marginBottom: 4 }}>سجل المتابعة</div>{[...t.updates].reverse().map((u: any, i: number) => <div key={i} style={{ fontSize: 11.5, color: '#475569', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}><b>{({ created: 'إسناد', updated: 'تعديل', ...(meta?.statuses || {}) } as any)[u.action] || u.action}</b>{u.progress !== undefined ? ` ${u.progress}%` : ''} · {u.by_name} · {fmtDT(u.at)}{u.note ? <div style={{ color: '#94a3b8' }}>{u.note}</div> : null}</div>)}</div>}
    </Modal>
  );
};
