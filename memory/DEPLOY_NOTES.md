
## 2026-10-09 — requirements في الإنتاج
- Docker (Cloud Run) يقرأ `/app/backend/backend/requirements.txt` (سياق البناء `backend/`). الملف `/app/backend/requirements.txt` للمعاينة فقط. أبقِهما متطابقين وأضف الحزم يدوياً (بدون pip freeze: يسرّب emergentintegrations وحزم cairo).
- حزم إنتاج ضرورية: pymupdf (معاينة PNG)، python-docx + lxml (تصدير Word)، hijridate، xlrd، openpyxl، reportlab، qrcode، bleach/tinycss2.
