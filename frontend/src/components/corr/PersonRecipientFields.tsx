import React, { useState } from 'react';
import { Field, inp, btn, Badge } from './CorrUI';
import { EntityPicker } from './EntityPicker';

type Rec = { person_type?: string; person_id?: string; person_label?: string; recipient_title?: string };
type Props = { rec: Rec; onChange: (patch: Partial<Rec>) => void; testPrefix: string };

// حقول «شخص داخلي» للمستلم: نوع (موظف/مدرس) + بحث بالاسم من بيانات الجامعة — الاسم والصفة والجهة تُملأ خادمياً من المصدر الموثوق
export const PersonRecipientFields: React.FC<Props> = ({ rec, onChange, testPrefix }) => {
  const [open, setOpen] = useState(false);
  const ptype = rec.person_type || 'EMPLOYEE';
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 10 }}>
        <Field label="الفئة"><select style={inp} value={ptype} onChange={(e) => onChange({ person_type: e.target.value, person_id: '', person_label: '' })} data-testid={`${testPrefix}-person-type`}><option value="EMPLOYEE">موظف</option><option value="TEACHER">عضو هيئة تدريس</option></select></Field>
        <Field label="الشخص *">
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <div style={{ ...inp, flex: 1, minHeight: 36, display: 'flex', alignItems: 'center', color: rec.person_label ? '#0f2440' : '#94a3b8' }} data-testid={`${testPrefix}-person-label`}>{rec.person_label || 'لم يُختر بعد'}</div>
            <button type="button" onClick={() => setOpen(true)} style={btn('#7c3aed', { whiteSpace: 'nowrap' })} data-testid={`${testPrefix}-person-pick`}>بحث بالاسم</button>
          </div>
        </Field>
      </div>
      {rec.person_id && <div style={{ fontSize: 11.5, color: '#64748b', marginTop: -4, marginBottom: 8 }}><Badge text={ptype === 'EMPLOYEE' ? 'موظف' : 'هيئة تدريس'} color="#7c3aed" /> ستُملأ الصفة والجهة تلقائياً من بياناته، ويمكنك كتابة صفة مخصصة أدناه.</div>}
      {open && <EntityPicker kind={ptype === 'EMPLOYEE' ? 'employees' : 'faculty'} title={ptype === 'EMPLOYEE' ? 'اختيار موظف' : 'اختيار عضو هيئة تدريس'} onClose={() => setOpen(false)} onPick={(it) => { onChange({ person_id: it.id, person_label: `${it.label}${it.meta ? ' — ' + it.meta : ''}` }); setOpen(false); }} />}
    </>
  );
};
