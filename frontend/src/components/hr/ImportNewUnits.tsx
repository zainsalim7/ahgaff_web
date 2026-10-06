import React from 'react';
import { inp } from './EmployeeFormModal';

export type NewUnitCfg = { key: string; name: string; count: number; type: string; parent_id: string };

type Props = {
  units: NewUnitCfg[];
  types: Record<string, string>;
  parents: any[];
  createUnits: boolean;
  onToggleCreate: (v: boolean) => void;
  onChange: (key: string, patch: Partial<NewUnitCfg>) => void;
};

export const ImportNewUnits = ({ units, types, parents, createUnits, onToggleCreate, onChange }: Props) => (
  <div style={{ border: '1px solid #fde68a', backgroundColor: '#fffbeb', borderRadius: 10, padding: 12, marginBottom: 10 }} data-testid="hr-import-new-units">
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: '#92400e' }}>🏢 وحدات جديدة ستُنشأ ({units.length})</div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#0f2440', cursor: 'pointer' }}>
        <input type="checkbox" checked={createUnits} onChange={(e) => onToggleCreate(e.target.checked)} data-testid="hr-import-create-units-toggle" />
        إنشاء الوحدات الجديدة تلقائياً
      </label>
    </div>
    {!createUnits ? (
      <div style={{ fontSize: 11.5, color: '#92400e' }}>الصفوف التي تحوي وحدات غير موجودة ستُرفض — فعّل الخيار لإنشائها تلقائياً وربط الموظفين بها.</div>
    ) : (
      <>
        <div style={{ fontSize: 11.5, color: '#78716c', marginBottom: 8 }}>حدّد نوع كل وحدة والإدارة التي تتبعها (يمكنك تعديلها لاحقاً من شاشة الهيكل التنظيمي).</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 0.9fr 1.3fr', gap: 6, fontSize: 11, fontWeight: 700, color: '#64748b', padding: '0 4px' }}>
          <span>الوحدة (عدد الموظفين)</span><span>النوع</span><span>تتبع لـ</span>
        </div>
        {units.map((u) => (
          <div key={u.key} style={{ display: 'grid', gridTemplateColumns: '1.3fr 0.9fr 1.3fr', gap: 6, alignItems: 'center', marginTop: 6 }} data-testid={`hr-import-new-unit-${u.key}`}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0f2440' }}>{u.name} <span style={{ color: '#94a3b8', fontWeight: 500 }}>({u.count})</span></div>
            <select value={u.type} onChange={(e) => onChange(u.key, { type: e.target.value })} style={{ ...inp, padding: '5px 8px', fontSize: 12 }} data-testid={`hr-import-unit-type-${u.key}`}>
              {Object.entries(types).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select value={u.parent_id} onChange={(e) => onChange(u.key, { parent_id: e.target.value })} style={{ ...inp, padding: '5px 8px', fontSize: 12 }} data-testid={`hr-import-unit-parent-${u.key}`}>
              <option value="">— بلا إدارة أم —</option>
              {parents.map((p) => <option key={p.id} value={p.id}>{p.type_label} · {p.name}</option>)}
            </select>
          </div>
        ))}
      </>
    )}
  </div>
);
