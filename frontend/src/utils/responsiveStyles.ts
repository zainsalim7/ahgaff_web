/**
 * يحقن قواعد CSS Media Queries على صفحات الويب لجعل التصميم الجديد responsive.
 * يُستدعى مرة واحدة من _layout.tsx فقط.
 */
import { Platform } from 'react-native';

let injected = false;

export function injectResponsiveStyles() {
  if (injected || Platform.OS !== 'web') return;
  if (typeof document === 'undefined') return;
  injected = true;

  const css = `
    /* ============= جعل صفحات الإدارة تستخدم scroll النافذة لإظهار شريط التمرير ============= */
    /* RN Web بشكل افتراضي يضع body{overflow:hidden} ويستخدم scrollview داخلي.
       لإظهار scrollbar طبيعي للمتصفح، نعكس هذا السلوك ونسمح بتمرير body */
    html, body, #root {
      overflow-y: auto !important;
      height: auto !important;
      min-height: 100% !important;
    }
    body {
      scrollbar-width: auto !important;
      scrollbar-color: #c0c8d4 #f4f6fb !important;
    }
    body::-webkit-scrollbar {
      width: 14px !important;
      height: 14px !important;
    }
    body::-webkit-scrollbar-track {
      background: #eef1f6 !important;
    }
    body::-webkit-scrollbar-thumb {
      background: #c0c8d4 !important;
      border-radius: 7px !important;
      border: 3px solid #eef1f6 !important;
    }
    body::-webkit-scrollbar-thumb:hover {
      background: #8a95a8 !important;
    }

    /* الـ ScrollView الجذر يتحرر من قيد الارتفاع ليسمح بالتمرير الطبيعي للصفحة */
    [data-responsive-scroll-root="true"] {
      overflow: visible !important;
      flex: none !important;
      height: auto !important;
      min-height: 0 !important;
    }
    [data-responsive-scroll-root="true"] > div {
      overflow: visible !important;
    }

    /* ============= حل شامل لكل صفحات RN-Web: تمكين تمرير body بدلاً من تمرير داخلي ============= */
    /* جذر التطبيق (المنشأ من react-native-web) */
    #root > div,
    #root > div > div {
      overflow: visible !important;
      height: auto !important;
      min-height: 100vh !important;
    }
    /* جميع حاويات RN-Web المرئية القابلة للتمرير (ScrollView/FlatList):
       تحديد قابلية scroll بناءً على أنماط classes التي ينتجها RN-Web */
    [class*="r-overflow"],
    [class*="OverflowScrolling"],
    [class*="WebkitOverflow"],
    [class*="r-overflowY"],
    [class*="r-overflowX"] {
      scrollbar-width: auto !important;
      scrollbar-color: #6b7d99 #eef1f6 !important;
      -webkit-overflow-scrolling: auto !important;
    }
    /* تجاوز قوي لأي عنصر يخفي شريط التمرير */
    *::-webkit-scrollbar {
      width: 14px !important;
      height: 14px !important;
      display: block !important;
      -webkit-appearance: auto !important;
      appearance: auto !important;
    }
    *::-webkit-scrollbar-track {
      background: #eef1f6 !important;
    }
    *::-webkit-scrollbar-thumb {
      background: #6b7d99 !important;
      border-radius: 7px !important;
      border: 2px solid #eef1f6 !important;
      min-height: 40px !important;
    }
    *::-webkit-scrollbar-thumb:hover {
      background: #3949ab !important;
    }
    /* أي عنصر بـ overflow scroll/auto عبر inline style يحصل على scrollbar مرئي */
    div[style*="overflow: auto"]::-webkit-scrollbar,
    div[style*="overflow: scroll"]::-webkit-scrollbar,
    div[style*="overflow-y: auto"]::-webkit-scrollbar,
    div[style*="overflow-y: scroll"]::-webkit-scrollbar,
    div[style*="overflow-x: auto"]::-webkit-scrollbar,
    div[style*="overflow-x: scroll"]::-webkit-scrollbar {
      width: 12px !important;
      height: 12px !important;
      display: block !important;
    }
    div[style*="overflow: auto"]::-webkit-scrollbar-track,
    div[style*="overflow: scroll"]::-webkit-scrollbar-track,
    div[style*="overflow-y: auto"]::-webkit-scrollbar-track,
    div[style*="overflow-y: scroll"]::-webkit-scrollbar-track,
    div[style*="overflow-x: auto"]::-webkit-scrollbar-track,
    div[style*="overflow-x: scroll"]::-webkit-scrollbar-track {
      background: #eef1f6 !important;
    }
    div[style*="overflow: auto"]::-webkit-scrollbar-thumb,
    div[style*="overflow: scroll"]::-webkit-scrollbar-thumb,
    div[style*="overflow-y: auto"]::-webkit-scrollbar-thumb,
    div[style*="overflow-y: scroll"]::-webkit-scrollbar-thumb,
    div[style*="overflow-x: auto"]::-webkit-scrollbar-thumb,
    div[style*="overflow-x: scroll"]::-webkit-scrollbar-thumb {
      background: #c0c8d4 !important;
      border-radius: 6px !important;
      border: 2px solid #eef1f6 !important;
    }
    div[style*="overflow: auto"]::-webkit-scrollbar-thumb:hover,
    div[style*="overflow: scroll"]::-webkit-scrollbar-thumb:hover,
    div[style*="overflow-y: auto"]::-webkit-scrollbar-thumb:hover,
    div[style*="overflow-y: scroll"]::-webkit-scrollbar-thumb:hover,
    div[style*="overflow-x: auto"]::-webkit-scrollbar-thumb:hover,
    div[style*="overflow-x: scroll"]::-webkit-scrollbar-thumb:hover {
      background: #8a95a8 !important;
    }

    /* ============= Tablet (≤1024px) ============= */
    @media (max-width: 1024px) {
      [data-responsive="page-scroll"] { padding: 14px !important; }
      [data-responsive="stats-grid"] > div { min-width: 45% !important; flex-basis: 45% !important; }
    }

    /* ============= Mobile (≤768px) ============= */
    @media (max-width: 768px) {
      [data-responsive="page-scroll"] { padding: 10px !important; }

      [data-responsive="page-header"] { flex-direction: column !important; align-items: stretch !important; }
      [data-responsive="page-header"] > div { width: 100% !important; max-width: 100% !important; }
      [data-responsive="page-header-actions"] { flex-wrap: wrap !important; justify-content: flex-end !important; gap: 8px !important; }

      [data-responsive="stats-grid"] > div { min-width: 100% !important; flex-basis: 100% !important; }

      [data-responsive="course-header"] { flex-direction: column !important; align-items: stretch !important; }
      [data-responsive="course-header"] > div { width: 100% !important; }

      [data-responsive="filter-row"] > div { min-width: 100% !important; flex-basis: 100% !important; }
      [data-responsive="filter-row"] > div > div { min-width: 100% !important; }

      [data-responsive="table-row"] { flex-direction: column !important; align-items: stretch !important; gap: 4px !important; padding: 12px !important; }
      [data-responsive="table-row"] > div { flex: none !important; width: 100% !important; padding: 4px 0 !important; align-items: flex-end !important; }

      [data-responsive="lecture-card"] { flex-direction: column !important; align-items: stretch !important; gap: 10px !important; padding: 14px !important; }
      [data-responsive="lecture-card"] > div { width: 100% !important; min-width: 0 !important; }
      [data-responsive="lecture-card"] [data-responsive="lecture-status-abs"] { position: relative !important; top: auto !important; left: auto !important; align-self: flex-start !important; }

      [data-responsive="table-header-row"] { display: none !important; }

      [data-responsive="table-footer"] { flex-direction: column !important; align-items: stretch !important; gap: 10px !important; }
      [data-responsive="table-footer"] > div { justify-content: center !important; flex-wrap: wrap !important; }

      [data-responsive="page-title"] { font-size: 20px !important; }
    }

    /* ============= Small mobile (≤480px) ============= */
    @media (max-width: 480px) {
      [data-responsive="page-title"] { font-size: 18px !important; }
      [data-responsive="page-header-actions"] > div,
      [data-responsive="page-header-actions"] > button { flex: 1 !important; min-width: 100px !important; justify-content: center !important; }
    }
  `;

  const styleEl = document.createElement('style');
  styleEl.setAttribute('data-responsive-admin', 'true');
  styleEl.appendChild(document.createTextNode(css));
  document.head.appendChild(styleEl);

  // RN-Web يضبط body{overflow:hidden} عبر inline style — نتجاوزها بقوة
  const forceBodyScroll = () => {
    if (typeof document === 'undefined') return;
    const b = document.body;
    const h = document.documentElement;
    if (b) {
      b.style.setProperty('overflow-y', 'auto', 'important');
      b.style.setProperty('overflow-x', 'hidden', 'important');
      b.style.setProperty('height', 'auto', 'important');
      b.style.setProperty('min-height', '100vh', 'important');
    }
    if (h) {
      h.style.setProperty('overflow-y', 'auto', 'important');
      h.style.setProperty('height', 'auto', 'important');
    }
    const root = document.getElementById('root');
    if (root) {
      root.style.setProperty('overflow', 'visible', 'important');
      root.style.setProperty('height', 'auto', 'important');
      root.style.setProperty('min-height', '100vh', 'important');
    }
  };

  // اضبط الستايل عند التحميل + كل تنقّل
  if (typeof requestAnimationFrame !== 'undefined') {
    requestAnimationFrame(() => {
      forceBodyScroll();
      setTimeout(forceBodyScroll, 100);
      setTimeout(forceBodyScroll, 500);
      setTimeout(forceBodyScroll, 1500);
    });
  } else {
    setTimeout(forceBodyScroll, 100);
  }

  // مراقبة DOM لإعادة تطبيق الستايل عند تغيير الصفحات
  try {
    const obs = new MutationObserver(() => forceBodyScroll());
    obs.observe(document.body, { attributes: true, attributeFilter: ['style'] });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
  } catch {}
}
