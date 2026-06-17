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
      scrollbar-color: #6b7d99 #eef1f6 !important;
    }
    body::-webkit-scrollbar {
      width: 14px !important;
      height: 14px !important;
    }
    body::-webkit-scrollbar-track {
      background: #eef1f6 !important;
    }
    body::-webkit-scrollbar-thumb {
      background: #6b7d99 !important;
      border-radius: 7px !important;
      border: 3px solid #eef1f6 !important;
    }
    body::-webkit-scrollbar-thumb:hover {
      background: #3949ab !important;
    }

    /* الـ ScrollView الجذر يتحرر من قيد الارتفاع ليسمح بالتمرير الطبيعي للصفحة
       (يُطبَّق فقط على الصفحات التي تضع dataSet={{ responsiveScrollRoot: "true" }} */
    [data-responsive-scroll-root="true"] {
      overflow: visible !important;
      flex: none !important;
      height: auto !important;
      min-height: 0 !important;
    }
    [data-responsive-scroll-root="true"] > div {
      overflow: visible !important;
    }

    /* ============= حل Tab Navigator: فك قيد ارتفاع container الـ tab content =============
       React Navigation Tabs يضع div محتوي بـ flex:1 + overflow:hidden + height ثابت = window-tabbar
       هذا يحجب التمرير حتى لو المحتوى داخله طويل. نفك القيد فقط على هذا العنصر:
       (الـ class الذي يجمع r-flex-13awgt0 + r-overflow-* يدل على tab content wrapper) */
    div[class*="r-flex-13awgt0"][class*="r-overflow-1udh08x"],
    div[class*="r-flex-13awgt0"][class*="r-overflowX-"][class*="r-overflowY-"] {
      overflow: visible !important;
      height: auto !important;
      min-height: 100vh !important;
    }

    /* أي ScrollView داخلي يحوي محتوى قابل للتمرير يحصل على scrollbar مرئي */
    [class*="r-WebkitOverflowScrolling"]::-webkit-scrollbar,
    [class*="r-overflowY"]::-webkit-scrollbar {
      width: 12px !important;
      height: 12px !important;
      display: block !important;
    }
    [class*="r-WebkitOverflowScrolling"]::-webkit-scrollbar-track,
    [class*="r-overflowY"]::-webkit-scrollbar-track {
      background: #eef1f6 !important;
    }
    [class*="r-WebkitOverflowScrolling"]::-webkit-scrollbar-thumb,
    [class*="r-overflowY"]::-webkit-scrollbar-thumb {
      background: #6b7d99 !important;
      border-radius: 6px !important;
      border: 2px solid #eef1f6 !important;
    }
    [class*="r-WebkitOverflowScrolling"]::-webkit-scrollbar-thumb:hover,
    [class*="r-overflowY"]::-webkit-scrollbar-thumb:hover {
      background: #3949ab !important;
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
