import React, { useRef, useState } from 'react';
import { LETTER_MODEL } from './LetterLayoutEditor';

const PAGE_W = 210, PAGE_H = 297; // مم — أبعاد A4

type Props = {
  src: string; alt?: string;
  imgTestId: string; wrapTestId: string;
  layout: Record<string, any>; layoutDefaults: Record<string, any>;
  onLayoutChange: (l: Record<string, any>) => void;
  hasTable?: boolean; imgStyle?: React.CSSProperties;
};

/** مقبض سحب فوق صورة المعاينة الحيّة يسمح بتحريك موضع التوقيع فعلياً (أفقياً: يمين/وسط/يسار + إزاحة، ورأسياً: مسافته قبل الخاتمة) بدل الاكتفاء بحقول الإعدادات المخفية. */
export const SignatureDragOverlay: React.FC<Props> = ({ src, alt, imgTestId, wrapTestId, layout, layoutDefaults, onLayoutChange, hasTable = true, imgStyle }) => {
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ startX: number; startY: number; xMm0: number; gap0: number } | null>(null);

  const L = { ...layoutDefaults, ...Object.fromEntries(Object.entries(layout || {}).filter(([, v]) => v !== null && v !== undefined && v !== '')) };
  const num = (k: string, d = 0) => Number(L[k] ?? d);
  const margin = num('margin_side', 18);
  const align = String(L.signature_align || 'left');
  const offset = num('signature_offset', 0);
  const xMm = align === 'center' ? PAGE_W / 2 : align === 'right' ? (PAGE_W - margin) - offset - 22 : margin + offset + 22;
  const { pos } = LETTER_MODEL.positions(num, L, hasTable);
  const yMm = (pos.signature?.top ?? 220) + (pos.signature?.h ?? 22) / 2;

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    drag.current = { startX: e.clientX, startY: e.clientY, xMm0: xMm, gap0: num('gap_signature', 16) };
    setDragging(true);
  };

  React.useEffect(() => {
    const mmPerPxX = dims.w ? PAGE_W / dims.w : 0, mmPerPxY = dims.h ? PAGE_H / dims.h : 0;
    const mv = (e: MouseEvent) => {
      if (!drag.current || !mmPerPxX) return;
      const newX = drag.current.xMm0 + (e.clientX - drag.current.startX) * mmPerPxX;
      const newGap = Math.max(0, Math.min(40, Math.round(drag.current.gap0 + (e.clientY - drag.current.startY) * mmPerPxY)));
      let newAlign = 'center', newOffset = 0;
      if (newX < PAGE_W * 0.35) { newAlign = 'left'; newOffset = Math.max(0, Math.min(80, Math.round(newX - margin - 22))); }
      else if (newX > PAGE_W * 0.65) { newAlign = 'right'; newOffset = Math.max(0, Math.min(80, Math.round((PAGE_W - margin) - newX - 22))); }
      onLayoutChange({ ...(layout || {}), signature_align: newAlign, signature_offset: newOffset, gap_signature: newGap });
    };
    const up = () => { drag.current = null; setDragging(false); };
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
  }); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ position: 'relative' }} data-testid={wrapTestId}>
      <img src={src} alt={alt} data-testid={imgTestId} onLoad={(e) => setDims({ w: e.currentTarget.clientWidth, h: e.currentTarget.clientHeight })}
        style={{ width: '100%', display: 'block', boxShadow: '0 4px 18px rgba(0,0,0,.18)', borderRadius: 4, background: '#fff', ...imgStyle }} />
      {dims.w > 0 && (
        <div onMouseDown={onMouseDown} data-testid={`${wrapTestId}-handle`}
          title="🖋️ اسحب لتحريك موضع التوقيع — يميناً/يساراً لتغيير الجهة والإزاحة، وأعلى/أسفل لتغيير مسافته عن الخاتمة"
          style={{
            position: 'absolute', left: (xMm / PAGE_W) * dims.w, top: (yMm / PAGE_H) * dims.h, transform: 'translate(-50%, -50%)',
            cursor: dragging ? 'grabbing' : 'grab', width: 30, height: 30, borderRadius: '50%',
            background: dragging ? '#be123c' : 'rgba(190,18,60,.85)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 15, fontWeight: 900, boxShadow: '0 2px 10px rgba(0,0,0,.35)', border: '2px solid #fff', userSelect: 'none', zIndex: 5,
          }}>✥</div>
      )}
    </div>
  );
};
