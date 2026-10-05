import React, { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../../services/api';

export const useAssetUrl = (url?: string | null) => {
  const [out, setOut] = useState<string>('');
  useEffect(() => {
    let alive = true;
    if (!url) { setOut(''); return; }
    if (/^https?:\/\//.test(url) || url.startsWith('data:')) { setOut(url); return; }
    AsyncStorage.getItem('token').then((t) => { if (alive) setOut(`${API_URL}${url}${url.includes('?') ? '&' : '?'}auth=${t || ''}`); });
    return () => { alive = false; };
  }, [url]);
  return out;
};

const Logo: React.FC<{ url?: string | null; size: number; testID?: string }> = ({ url, size, testID }) => {
  const src = useAssetUrl(url);
  if (!src) return <div style={{ width: size, height: size, borderRadius: 8, border: '1px dashed #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#94a3b8' }}>شعار</div>;
  return <img src={src} alt="logo" data-testid={testID} style={{ width: size, height: size, objectFit: 'contain' }} />;
};

export const LetterheadHeader: React.FC<{ lh: any; orgName?: string; scale?: number }> = ({ lh, orgName, scale = 1 }) => {
  const h = lh?.header_config || {}; const b = lh?.branding_config || {};
  const color = b.primary_color || '#0f2440';
  const align = h.align || 'center';
  const bg = useAssetUrl(b.header_background_asset_url);
  return (
    <div data-testid="a4-header" style={{ minHeight: (h.height_mm || 35) * 3.78 * scale, borderBottom: `2px solid ${color}`, display: 'flex', alignItems: 'center', justifyContent: align === 'center' ? 'center' : 'space-between', gap: 16, padding: `${6 * scale}px 0 ${8 * scale}px`, backgroundImage: bg ? `url(${bg})` : undefined, backgroundSize: 'cover', direction: 'rtl' }}>
      {h.show_logo !== false && align !== 'center' && <Logo url={b.logo_asset_url} size={64 * scale} testID="a4-logo" />}
      <div style={{ textAlign: 'center', color, flex: align === 'center' ? undefined : 1 }}>
        {h.show_logo !== false && align === 'center' && <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}><Logo url={b.logo_asset_url} size={56 * scale} testID="a4-logo" /></div>}
        {!!h.university_name_ar && <div style={{ fontWeight: 900, fontSize: 16 * scale }}>{h.university_name_ar}</div>}
        {!!h.university_name_en && <div style={{ fontSize: 10 * scale, direction: 'ltr', letterSpacing: 0.5 }}>{h.university_name_en}</div>}
        {h.show_organization_name !== false && !!orgName && <div style={{ fontSize: 12.5 * scale, fontWeight: 700, marginTop: 2 }}>{orgName}</div>}
        {!!h.header_text && <div style={{ fontSize: 11 * scale, marginTop: 2 }}>{h.header_text}</div>}
      </div>
      {b.secondary_logo_asset_url && align !== 'center' && <Logo url={b.secondary_logo_asset_url} size={64 * scale} />}
    </div>
  );
};

export const LetterheadFooter: React.FC<{ lh: any; scale?: number }> = ({ lh, scale = 1 }) => {
  const f = lh?.footer_config || {}; const color = lh?.branding_config?.primary_color || '#0f2440';
  const parts = [f.address, f.phone ? `هاتف: ${f.phone}` : '', f.email, f.website].filter(Boolean);
  return (
    <div data-testid="a4-footer" style={{ borderTop: `1.5px solid ${color}`, paddingTop: 6 * scale, textAlign: 'center', fontSize: 10 * scale, color: '#475569', minHeight: (f.height_mm || 20) * 3.78 * scale * 0.6, direction: 'rtl' }}>
      {!!f.footer_text && <div style={{ fontWeight: 700, color }}>{f.footer_text}</div>}
      {parts.length > 0 && <div>{parts.join(' · ')}</div>}
    </div>
  );
};

type Sec = { id: string; type: string; title?: string; html: string; style_config?: any; editable?: string; required?: boolean };
type Props = { letterhead: any; sections: Sec[]; orgName?: string; scale?: number; highlight?: string | null; onSectionClick?: (id: string) => void; frozen?: boolean; watermark?: string };

export const A4Preview: React.FC<Props> = ({ letterhead, sections, orgName, scale = 1, highlight, onSectionClick, frozen, watermark }) => {
  const [tok, setTok] = useState(() => (typeof localStorage !== 'undefined' ? localStorage.getItem('token') || '' : ''));
  useEffect(() => { if (!tok) AsyncStorage.getItem('token').then((t) => setTok(t || '')); }, []);
  const fixSrc = (html: string) => (html || '').replace(/src="(\/api\/files\/[^"]+)"/g, (_m, u) => `src="${API_URL}${u}${u.includes('?') ? '&' : '?'}auth=${tok}"`);
  const pc = letterhead?.page_config || {};
  const m = pc.margins_mm || { top: 15, right: 20, bottom: 15, left: 20 };
  const mm = 3.78 * scale;
  const fs = (pc.font_size_pt || 12) * 1.33 * scale;
  return (
    <div data-testid="a4-preview" style={{ width: 210 * mm, minHeight: 297 * mm, backgroundColor: '#fff', boxShadow: '0 6px 24px rgba(15,36,64,0.18)', margin: '0 auto', position: 'relative', display: 'flex', flexDirection: 'column', padding: `${m.top * mm}px ${m.right * mm}px ${m.bottom * mm}px ${m.left * mm}px`, boxSizing: 'border-box', direction: 'rtl', fontFamily: 'Amiri, "Noto Naskh Arabic", Tahoma, serif', fontSize: fs, lineHeight: pc.line_height || 1.7, color: '#111827' }}>
      {!!watermark && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', transform: 'rotate(-30deg)', fontSize: 64 * scale, fontWeight: 900, color: 'rgba(15,36,64,0.06)' }}>{watermark}</div>}
      {letterhead ? <LetterheadHeader lh={letterhead} orgName={orgName} scale={scale} /> : <div style={{ padding: 10, textAlign: 'center', color: '#b91c1c', border: '1px dashed #fca5a5', fontSize: 12 }}>لا توجد ترويسة متاحة لهذه المنظمة</div>}
      <div style={{ flex: 1, paddingTop: 10 * scale }}>
        {sections.map((s) => (
          <div key={s.id} data-testid={`a4-section-${s.id}`} onClick={onSectionClick ? () => onSectionClick(s.id) : undefined}
            style={{ padding: `${3 * scale}px ${4 * scale}px`, margin: `${2 * scale}px -${4 * scale}px`, borderRadius: 4, cursor: onSectionClick ? 'pointer' : 'default', outline: highlight === s.id ? '2px solid #0ea5e9' : 'none', backgroundColor: highlight === s.id ? 'rgba(14,165,233,0.06)' : 'transparent', transition: 'background-color .15s', textAlign: (s.style_config?.align as any) || (s.type === 'SIGNATURE_BLOCK' ? 'left' : 'right'), ...(s.type === 'SIGNATURE_BLOCK' ? { marginTop: 24 * scale, paddingLeft: 10 * scale } : {}) }}
            className="a4-sec" dangerouslySetInnerHTML={{ __html: fixSrc(s.html) || '<p></p>' }} />
        ))}
      </div>
      {letterhead && <LetterheadFooter lh={letterhead} scale={scale} />}
      {frozen && <div style={{ position: 'absolute', top: 8, left: 8, fontSize: 10, padding: '2px 8px', borderRadius: 999, backgroundColor: '#0f766e', color: '#fff', fontWeight: 800 }}>مُجمَّد — لقطة بيانات</div>}
      <style>{`.a4-sec p{margin:0 0 .35em}.a4-sec table{border-collapse:collapse;width:100%}.a4-sec td,.a4-sec th{border:1px solid #94a3b8;padding:3px 6px}.a4-sec ol,.a4-sec ul{margin:.2em 1.2em .2em 0;padding:0}`}</style>
    </div>
  );
};
