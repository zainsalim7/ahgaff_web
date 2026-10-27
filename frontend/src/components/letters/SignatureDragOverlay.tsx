import React, { useRef, useState } from 'react';
import { LETTER_MODEL } from './LetterLayoutEditor';

const PAGE_W = 210, PAGE_H = 297; // مم — أبعاد A4

type Props = {
  src: string; alt?: string;
  imgTestId: string; wrapTestId: string;
  layout: Record<string, any>; layoutDefaults: Record<string, any>;
  onLayoutChange: (l: Record<string, any>) => void;
  hasTable?: boolean; imgStyle?: React.CSSProperties;
  sigPos?: { x: number; y: number } | null; // الموضع الحقيقي (مم) من آخر معاينة فعلية من الخلفية — أدق من التقدير
  showHandle?: boolean; // أخفِ المقبض إن كانت الصفحة المعروضة ليست صفحة التوقيع الفعلية (خطاب متعدد الصفحات)
};

/** مقبض سحب فوق صورة المعاينة الحيّة يسمح بتحريك موضع التوقيع فعلياً (أفقياً: يمين/وسط/يسار + إزاحة، ورأسياً: مسافته قبل الخاتمة) بدل الاكتفاء بحقول الإعدادات المخفية. */
export const SignatureDragOverlay: React.FC<Props> = ({ src, alt, imgTestId, wrapTestId, layout, layoutDefaults, onLayoutChange, hasTable = true, imgStyle, sigPos, showHandle = true }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ startX: number; startY: number; xMm0: number; gap0: number } | null>(null);

  const L = { ...layoutDefaults, ...Object.fromEntries(Object.entries(layout || {}).filter(([, v]) => v !== null && v !== undefined && v !== '')) };
  const num = (k: string, d = 0) => Number(L[k] ?? d);
  const margin = num('margin_side', 18);
  const align = String(L.signature_align || 'left');
  const offset = num('signature_offset', 0);
  const xMmEstimate = align === 'center' ? PAGE_W / 2 : align === 'right' ? (PAGE_W - margin) - offset - 22 : margin + offset + 22;
  const { pos } = LETTER_MODEL.positions(num, L, hasTable);
  const yMmEstimate = (pos.signature?.top ?? 220) + (pos.signature?.h ?? 22) / 2;
  // 🎯 نفضّل دائماً الموضع الحقيقي المُستلم من آخر توليد PDF فعلي (sigPos) على التقدير التقريبي
  const xMm = sigPos ? sigPos.x : xMmEstimate;
  const yMm = sigPos ? sigPos.y + 4 : yMmEstimate;
  // 👆 أثناء السحب نفعلياً نتتبع المؤشر مباشرة (دلتا بكسل)، ثم نعود لاعتماد sigPos الحقيقي بعد تحديث المعاينة
  const [liveDelta, setLiveDelta] = useState<{ dx: number; dy: number } | null>(null);
  const shownXMm = liveDelta && dims.w ? xMm + liveDelta.dx * (PAGE_W / dims.w) : xMm;
  const shownYMm = liveDelta && dims.h ? yMm + liveDelta.dy * (PAGE_H / dims.h) : yMm;

  const startDrag = (clientX: number, clientY: number) => {
    drag.current = { startX: clientX, startY: clientY, xMm0: xMm, gap0: num('gap_signature', 16) };
    setLiveDelta({ dx: 0, dy: 0 });
    setDragging(true);
  };

  React.useEffect(() => { if (!dragging) setLiveDelta(null); }, [sigPos]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(() => {
      const img = wrapRef.current?.querySelector('img');
      if (img) setDims({ w: img.clientWidth, h: img.clientHeight });
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  React.useEffect(() => {
    const mmPerPxX = dims.w ? PAGE_W / dims.w : 0, mmPerPxY = dims.h ? PAGE_H / dims.h : 0;
    const move = (clientX: number, clientY: number) => {
      if (!drag.current || !mmPerPxX) return;
      setLiveDelta({ dx: clientX - drag.current.startX, dy: clientY - drag.current.startY });
      const dyMm = (clientY - drag.current.startY) * mmPerPxY;
      const newX = drag.current.xMm0 + (clientX - drag.current.startX) * mmPerPxX;
      let newAlign = 'center', newOffset = 0;
      if (newX < PAGE_W * 0.35) { newAlign = 'left'; newOffset = Math.max(0, Math.min(80, Math.round(newX - margin - 22))); }
      else if (newX > PAGE_W * 0.65) { newAlign = 'right'; newOffset = Math.max(0, Math.min(80, Math.round((PAGE_W - margin) - newX - 22))); }
      const next: Record<string, any> = { ...(layout || {}), signature_align: newAlign, signature_offset: newOffset };
      if (Math.abs(dyMm) > 1.5) next.gap_signature = Math.max(0, Math.min(40, Math.round(drag.current.gap0 + dyMm)));
      onLayoutChange(next);
    };
    const mv = (e: MouseEvent) => move(e.clientX, e.clientY);
    const tmv = (e: TouchEvent) => { if (e.touches[0]) { move(e.touches[0].clientX, e.touches[0].clientY); e.preventDefault(); } };
    const up = () => { drag.current = null; setDragging(false); };
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
    window.addEventListener('touchmove', tmv, { passive: false }); window.addEventListener('touchend', up);
    return () => {
      window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up);
      window.removeEventListener('touchmove', tmv); window.removeEventListener('touchend', up);
    };
  }); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={wrapRef} style={{ position: 'relative' }} data-testid={wrapTestId}>
      <img src={src} alt={alt} data-testid={imgTestId} onLoad={(e) => setDims({ w: e.currentTarget.clientWidth, h: e.currentTarget.clientHeight })}
        style={{ width: '100%', display: 'block', boxShadow: '0 4px 18px rgba(0,0,0,.18)', borderRadius: 4, background: '#fff', ...imgStyle }} />
      {showHandle && dims.w > 0 && (
        <div
          onMouseDown={(e) => { e.preventDefault(); startDrag(e.clientX, e.clientY); }}
          onTouchStart={(e) => { const t = e.touches[0]; if (t) startDrag(t.clientX, t.clientY); }}
          data-testid={`${wrapTestId}-handle`}
          title="🖋️ اسحب لتحريك موضع التوقيع — يميناً/يساراً لتغيير الجهة والإزاحة، وأعلى/أسفل لتغيير مسافته عن الخاتمة"
          style={{
            position: 'absolute', left: (shownXMm / PAGE_W) * dims.w, top: (shownYMm / PAGE_H) * dims.h - 15, transform: 'translate(-50%, -50%)',
            cursor: dragging ? 'grabbing' : 'grab', width: 30, height: 30, borderRadius: '50%', touchAction: 'none',
            background: dragging ? '#be123c' : 'rgba(190,18,60,.85)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 15, fontWeight: 900, boxShadow: '0 2px 10px rgba(0,0,0,.35)', border: '2px solid #fff', userSelect: 'none', zIndex: 5,
          }}>✥</div>
      )}
    </div>
  );
};
