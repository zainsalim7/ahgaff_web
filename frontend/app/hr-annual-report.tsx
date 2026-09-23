import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { goBack } from '../src/utils/navigation';
import { hrAPI } from '../src/services/api';
import { ReportHero, ReportKpis, ReportEmpty, reportPage } from '../src/components/reports/ReportShell';
import { Th, td, table, inp, alertErr } from '../src/components/hr/ui';
import { gradeColor } from '../src/components/hr/AppraisalModal';

const YEAR = new Date().getFullYear();
const GRADE_COLORS: Record<string, string> = { 'ممتاز': '#16a34a', 'جيد جداً': '#0f766e', 'جيد': '#0284c7', 'مقبول': '#f97316', 'ضعيف': '#dc2626' };

const Bars = ({ items, color, testID }: { items: { label: string; value: number; sub?: string }[]; color: string | ((i: any) => string); testID?: string }) => {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div style={{ direction: 'rtl' }} data-testid={testID}>
      {items.map((i) => (
        <div key={i.label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12 }}>
          <span style={{ width: 130, color: '#334155', fontWeight: 700 }}>{i.label}</span>
          <div style={{ flex: 1, height: 14, backgroundColor: '#eef2f7', borderRadius: 7, overflow: 'hidden' }}><div style={{ width: `${(i.value / max) * 100}%`, height: '100%', backgroundColor: typeof color === 'function' ? color(i) : color, borderRadius: 7 }} /></div>
          <span style={{ width: 90, fontWeight: 800, color: '#0f2440', textAlign: 'left' }}>{i.value}{i.sub ? <span style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 500 }}> {i.sub}</span> : null}</span>
        </div>
      ))}
    </div>
  );
};

const Section = ({ title, children, testID }: any) => <View style={reportPage.card} testID={testID}><Text style={{ fontSize: 14, fontWeight: '800', color: '#0f2440', textAlign: 'right', marginBottom: 10 }}>{title}</Text>{children}</View>;

export default function HrAnnualReport() {
  const [year, setYear] = useState(YEAR);
  const [unit, setUnit] = useState('');
  const [units, setUnits] = useState<any[]>([]);
  const [r, setR] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const load = useCallback(async () => { setLoading(true); try { setR((await hrAPI.annualReport({ year, org_unit_id: unit || undefined })).data); } catch (e) { alertErr(e); } finally { setLoading(false); } }, [year, unit]);
  useEffect(() => { hrAPI.orgUnits().then((x) => setUnits(x.data.units || [])).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);
  const exp = async (fmt: 'pdf' | 'xlsx') => { setExporting(true); try { const res = await hrAPI.annualExport({ fmt, year, org_unit_id: unit || undefined }); const url = URL.createObjectURL(res.data); const a = document.createElement('a'); a.href = url; a.download = `تقرير HR السنوي ${year}.${fmt}`; a.click(); URL.revokeObjectURL(url); } catch (e) { alertErr(e); } finally { setExporting(false); } };

  const w = r?.workforce, at = r?.attendance, lv = r?.leaves, ap = r?.appraisals, tk = r?.tasks;
  return (
    <SafeAreaView style={reportPage.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={reportPage.content}>
        <ReportHero kicker="شؤون الموظفين" title="التقرير السنوي لشؤون الموظفين" subtitle={r ? `${r.year} · ${r.unit_name}` : 'القوى العاملة، اتجاه الحضور، الإجازات، وتوزيع تقديرات التقييم حسب الوحدة'} onBack={() => goBack()} onPdf={() => exp('pdf')} onExcel={() => exp('xlsx')} exporting={exporting} testID="hr-annual-hero"
          extra={<div style={{ display: 'flex', gap: 8, direction: 'rtl' }}><select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ ...inp, width: 100 }} data-testid="annual-year">{[YEAR, YEAR - 1, YEAR - 2].map((y) => <option key={y} value={y}>{y}</option>)}</select><select value={unit} onChange={(e) => setUnit(e.target.value)} style={{ ...inp, width: 220 }} data-testid="annual-unit"><option value="">كل الجامعة</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>} />
        {loading || !r ? <Text style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>جاري إعداد التقرير...</Text> : (<>
          <ReportKpis items={[
            { label: 'الموظفون', value: w.total, color: '#0f2440', icon: 'people' },
            { label: 'تعيينات السنة', value: w.hires, color: '#16a34a', icon: 'person-add' },
            { label: 'متوسط الحضور', value: at.avg_rate != null ? `${at.avg_rate}%` : '—', color: '#0284c7', icon: 'finger-print' },
            { label: 'أيام الإجازات', value: lv.total_days, color: '#7c3aed', icon: 'airplane' },
            { label: 'متوسط التقييم', value: ap.avg ?? '—', color: gradeColor(ap.avg), icon: 'star' },
            { label: 'مهام مُنجزة', value: `${tk.done}/${tk.total}`, color: '#0f766e', icon: 'checkbox' },
          ]} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 12, direction: 'rtl' }}>
            <Section title="القوى العاملة حسب الفئة" testID="annual-category"><Bars items={w.by_category.map((c: any) => ({ label: c.label, value: c.count }))} color="#0f2440" /></Section>
            <Section title="حسب الحالة الوظيفية" testID="annual-status"><Bars items={w.by_status.map((c: any) => ({ label: c.label, value: c.count }))} color="#7c3aed" /></Section>
            <Section title="حسب نوع التعاقد" testID="annual-contract"><Bars items={w.by_contract.map((c: any) => ({ label: c.label, value: c.count }))} color="#0284c7" /></Section>
            <Section title="استخدام الإجازات حسب النوع" testID="annual-leave-types">{lv.by_type.length ? <Bars items={lv.by_type.map((t: any) => ({ label: t.label, value: t.days, sub: 'يوم' }))} color="#7c3aed" /> : <Text style={{ color: '#94a3b8', fontSize: 12, textAlign: 'right' }}>لا إجازات معتمدة</Text>}<div style={{ fontSize: 11.5, color: '#64748b', textAlign: 'right', marginTop: 8 }}>متوسط {lv.avg_per_employee} يوم/موظف من استحقاق {lv.default_entitlement} · طلبات: معتمدة {lv.requests.approved || 0} · مرفوضة {lv.requests.rejected || 0} · معلّقة {(lv.requests.pending || 0) + (lv.requests.hr_pending || 0)}</div></Section>
          </div>

          <Section title="اتجاه الحضور الشهري" testID="annual-attendance">
            {at.months.length === 0 ? <ReportEmpty text="لا بيانات حضور لهذه السنة" icon="finger-print-outline" /> : (<>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 140, direction: 'rtl', padding: '0 4px', borderBottom: '1px solid #e2e8f0' }}>
                {at.months.map((m: any) => <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }} title={`${m.label}: ${m.rate ?? '—'}%`}><span style={{ fontSize: 10.5, fontWeight: 800, color: m.rate == null ? '#94a3b8' : m.rate >= 90 ? '#16a34a' : m.rate >= 75 ? '#f97316' : '#dc2626' }}>{m.rate ?? '—'}{m.rate != null ? '%' : ''}</span><div style={{ width: '70%', height: `${Math.max(3, m.rate || 0)}%`, backgroundColor: m.rate == null ? '#e2e8f0' : m.rate >= 90 ? '#16a34a' : m.rate >= 75 ? '#f97316' : '#dc2626', borderRadius: '4px 4px 0 0' }} /></div>)}
              </div>
              <div style={{ display: 'flex', gap: 6, direction: 'rtl', padding: '4px 4px 0' }}>{at.months.map((m: any) => <span key={m.month} style={{ flex: 1, textAlign: 'center', fontSize: 10.5, color: '#64748b' }}>{m.label}</span>)}</div>
              <table style={{ ...table, marginTop: 10 }}><Th cols={['الشهر', 'أيام العمل', 'حاضر', 'متأخر', 'غائب', 'بعذر', 'أيام إجازة', 'دقائق التأخير', 'نسبة الحضور']} /><tbody>
                {at.months.map((m: any) => <tr key={m.month} style={{ borderBottom: '1px solid #eef2f7' }}><td style={{ ...td, fontWeight: 700 }}>{m.label}</td><td style={td}>{m.work_days}</td><td style={{ ...td, color: '#16a34a' }}>{m.present}</td><td style={{ ...td, color: '#f97316' }}>{m.late}</td><td style={{ ...td, color: '#dc2626' }}>{m.absent}</td><td style={td}>{m.excused}</td><td style={{ ...td, color: '#7c3aed' }}>{m.leave_days}</td><td style={td}>{m.late_minutes}</td><td style={{ ...td, fontWeight: 800 }}>{m.rate != null ? `${m.rate}%` : '—'}</td></tr>)}
              </tbody></table>
            </>)}
          </Section>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 12, direction: 'rtl' }}>
            <Section title={`توزيع تقديرات التقييم (${ap.completed} تقييم معتمد)`} testID="annual-grades"><Bars items={ap.distribution.map((d: any) => ({ label: d.grade, value: d.count }))} color={(i: any) => GRADE_COLORS[i.label]} /><div style={{ fontSize: 11.5, color: '#64748b', textAlign: 'right', marginTop: 8 }}>مسودات {ap.status.draft || 0} · بانتظار الاعتماد {ap.status.submitted || 0} · معتمد {(ap.status.approved || 0) + (ap.status.acknowledged || 0)}</div></Section>
            <Section title="الموظفون والإجازات حسب الوحدة" testID="annual-units"><Bars items={w.by_unit.slice(0, 10).map((u: any) => ({ label: u.unit, value: u.count, sub: `· ${u.leave_days} يوم إجازة` }))} color="#0f2440" /></Section>
          </div>

          <Section title="التقييم حسب الوحدة التنظيمية" testID="annual-appr-units">
            {ap.per_unit.length === 0 ? <Text style={{ color: '#94a3b8', fontSize: 12, textAlign: 'right' }}>لا تقييمات معتمدة هذه السنة</Text> : (
              <table style={table}><Th cols={['الوحدة', 'الموظفون', 'مقيَّمون', 'المتوسط', 'ممتاز', 'جيد جداً', 'جيد', 'مقبول', 'ضعيف']} /><tbody>
                {ap.per_unit.map((u: any) => <tr key={u.unit} style={{ borderBottom: '1px solid #eef2f7' }}><td style={{ ...td, fontWeight: 700 }}>{u.unit}</td><td style={td}>{u.headcount}</td><td style={td}>{u.count}</td><td style={{ ...td, fontWeight: 900, color: gradeColor(u.avg) }}>{u.avg}</td>{['ممتاز', 'جيد جداً', 'جيد', 'مقبول', 'ضعيف'].map((g) => <td key={g} style={{ ...td, color: u[g] ? GRADE_COLORS[g] : '#cbd5e1', fontWeight: u[g] ? 800 : 400 }}>{u[g]}</td>)}</tr>)}
              </tbody></table>
            )}
          </Section>
        </>)}
      </ScrollView>
    </SafeAreaView>
  );
}
