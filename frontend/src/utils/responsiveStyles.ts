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
}
