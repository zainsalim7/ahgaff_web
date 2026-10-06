import api from './api';

const base = '/correspondence';
export const corrAPI = {
  meta: () => api.get(`${base}/meta`),
  me: () => api.get(`${base}/me`),
  dashboard: () => api.get(`${base}/dashboard`),
  organizations: (includeInactive = false) => api.get(`${base}/organizations`, { params: { include_inactive: includeInactive } }),
  codeAudit: () => api.get(`${base}/organizations/code-audit`),
  createOrganization: (d: any) => api.post(`${base}/organizations`, d),
  updateOrganization: (id: string, d: any) => api.put(`${base}/organizations/${id}`, d),
  roles: () => api.get(`${base}/roles`),
  createRole: (d: any) => api.post(`${base}/roles`, d),
  updateRole: (id: string, d: any) => api.put(`${base}/roles/${id}`, d),
  memberships: (params: any = {}) => api.get(`${base}/memberships`, { params }),
  createMembership: (d: any) => api.post(`${base}/memberships`, d),
  updateMembership: (id: string, d: any) => api.put(`${base}/memberships/${id}`, d),
  deactivateMembership: (id: string) => api.delete(`${base}/memberships/${id}`),
  usersLookup: (q: string) => api.get(`${base}/users-lookup`, { params: { q } }),
  documentTypes: (params: any = {}) => api.get(`${base}/document-types`, { params }),
  createDocumentType: (d: any) => api.post(`${base}/document-types`, d),
  updateDocumentType: (id: string, d: any) => api.put(`${base}/document-types/${id}`, d),
  schemes: (params: any = {}) => api.get(`${base}/numbering-schemes`, { params }),
  createScheme: (d: any) => api.post(`${base}/numbering-schemes`, d),
  updateScheme: (id: string, d: any) => api.put(`${base}/numbering-schemes/${id}`, d),
  list: (params: any = {}) => api.get(base, { params }),
  get: (id: string) => api.get(`${base}/${id}`),
  create: (d: any) => api.post(base, d),
  patch: (id: string, d: any) => api.patch(`${base}/${id}`, d),
  remove: (id: string) => api.delete(`${base}/${id}`),
  addRecipient: (id: string, d: any) => api.post(`${base}/${id}/recipients`, d),
  removeRecipient: (id: string, rid: string) => api.delete(`${base}/${id}/recipients/${rid}`),
  addEntity: (id: string, d: any) => api.post(`${base}/${id}/entities`, d),
  removeEntity: (id: string, eid: string) => api.delete(`${base}/${id}/entities/${eid}`),
  transition: (id: string, action: string, reason = '') => api.post(`${base}/${id}/${action}`, { reason }),
  history: (id: string) => api.get(`${base}/${id}/history`),
  audit: (id: string) => api.get(`${base}/${id}/audit`),
  // المرحلة 2
  letterheads: (params: any = {}) => api.get(`${base}/letterheads`, { params }),
  resolveLetterhead: (organization_id: string) => api.get(`${base}/letterheads/resolve`, { params: { organization_id } }),
  createLetterhead: (d: any) => api.post(`${base}/letterheads`, d),
  updateLetterhead: (id: string, d: any) => api.patch(`${base}/letterheads/${id}`, d),
  setDefaultLetterhead: (id: string) => api.post(`${base}/letterheads/${id}/set-default`),
  uploadLetterheadAsset: (id: string, slot: string, file: File) => { const fd = new FormData(); fd.append('file', file); return api.post(`${base}/letterheads/${id}/assets/${slot}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }); },
  templates: (params: any = {}) => api.get(`${base}/templates`, { params }),
  template: (id: string) => api.get(`${base}/templates/${id}`),
  createTemplate: (d: any) => api.post(`${base}/templates`, d),
  updateTemplateDraft: (id: string, d: any) => api.put(`${base}/templates/${id}/draft`, d),
  newTemplateVersion: (id: string, d: any) => api.post(`${base}/templates/${id}/versions`, d),
  validateTemplate: (id: string) => api.post(`${base}/templates/${id}/validate`),
  publishTemplate: (id: string) => api.post(`${base}/templates/${id}/publish`),
  deactivateTemplate: (id: string) => api.post(`${base}/templates/${id}/deactivate`),
  cloneTemplate: (id: string, target_organization_id?: string) => api.post(`${base}/templates/${id}/clone`, null, { params: target_organization_id ? { target_organization_id } : {} }),
  seedDefaultTemplates: () => api.post(`${base}/templates/seed-defaults`),
  placeholders: () => api.get(`${base}/placeholders`),
  entities: (kind: string, q: string, page = 1) => api.get(`${base}/entities/${kind}`, { params: { q, page, page_size: 20 } }),
  applyTemplate: (id: string, template_id: string) => api.post(`${base}/${id}/apply-template`, { template_id }),
  content: (id: string) => api.get(`${base}/${id}/content`),
  patchContent: (id: string, d: any) => api.patch(`${base}/${id}/content`, d),
  mySignature: () => api.get(`${base}/signatures/me`),
  uploadSignature: (file: File) => { const fd = new FormData(); fd.append('file', file); return api.post(`${base}/signatures/me`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }); },
  deleteSignature: () => api.delete(`${base}/signatures/me`),
  suggestions: (correspondence_id: string) => api.get(`${base}/suggestions`, { params: { correspondence_id } }),
  pdf: (id: string) => api.get(`${base}/${id}/pdf`, { responseType: 'blob' }),
  pdfInfo: (id: string) => api.get(`${base}/${id}/pdf/info`),
  preview: (id: string, mode: 'preview' | 'edit' = 'preview') => api.post(`${base}/${id}/preview`, null, { params: { mode } }),
};

export const SECTION_TYPE_AR: Record<string, string> = {
  HEADER: 'ترويسة', REFERENCE: 'الرقم والتاريخ', DATE: 'التاريخ', RECIPIENT: 'المستلم', SALUTATION: 'التحية', SUBJECT: 'الموضوع', INTRODUCTION: 'مقدمة', BODY: 'المتن',
  STRUCTURED_DATA: 'بيانات منظمة', CLOSING: 'الخاتمة', SIGNATURE_BLOCK: 'التوقيع', CC: 'نسخة إلى', ATTACHMENTS: 'المرفقات', FOOTER: 'تذييل', CUSTOM: 'مخصص',
};
export const EDITABILITY_AR: Record<string, { label: string; color: string; hint: string }> = {
  LOCKED: { label: 'مقفل', color: '#991b1b', hint: 'لا يمكن تغييره في الخطاب' }, SYSTEM: { label: 'نظامي', color: '#475569', hint: 'يُملأ من النظام تلقائياً' },
  STRUCTURED: { label: 'منظّم', color: '#7c3aed', hint: 'يُملأ من البيانات مع تعديل محدود' }, EDITABLE: { label: 'قابل للتحرير', color: '#16a34a', hint: 'حر للكاتب' },
  DEFAULT_EDITABLE: { label: 'افتراضي قابل للتحرير', color: '#0ea5e9', hint: 'نص افتراضي يمكن تعديله' },
};
export const INPUT_TYPE_AR: Record<string, string> = { TEXT: 'نص قصير', TEXTAREA: 'نص طويل', DATE: 'تاريخ', NUMBER: 'رقم', SELECT: 'قائمة' };
export const TPL_STATUS_AR: Record<string, { label: string; color: string }> = { DRAFT: { label: 'مسودة', color: '#64748b' }, PUBLISHED: { label: 'منشور', color: '#16a34a' }, INACTIVE: { label: 'موقوف', color: '#991b1b' } };
export const ENTITY_KIND: Record<string, { kind: string; label: string; perm: string }> = {
  STUDENT: { kind: 'students', label: 'طالب', perm: 'entity.student.read' }, EMPLOYEE: { kind: 'employees', label: 'موظف', perm: 'entity.employee.read' }, FACULTY: { kind: 'faculty', label: 'عضو هيئة تدريس', perm: 'entity.faculty.read' },
};
export const openPdf = async (id: string, onError: (m: string) => void) => {
  try { const r = await corrAPI.pdf(id); const url = URL.createObjectURL(new Blob([r.data], { type: 'application/pdf' })); window.open(url, '_blank'); setTimeout(() => URL.revokeObjectURL(url), 60000); }
  catch (e: any) { let m = 'تعذر توليد PDF'; try { m = JSON.parse(await e?.response?.data?.text())?.detail || m; } catch {} onError(typeof m === 'string' ? m : 'تعذر توليد PDF'); }
};
export const errList = (e: any): string[] => { const d = e?.response?.data?.detail; return d && typeof d === 'object' && Array.isArray(d.errors) ? d.errors : []; };
export const errMsgFull = (e: any, fallback = 'حدث خطأ') => { const d = e?.response?.data?.detail; if (typeof d === 'string') return d; if (d && typeof d === 'object' && d.message) return d.message; return fallback; };

export const STATUS_AR: Record<string, string> = {
  DRAFT: 'مسودة', SUBMITTED: 'مُقدَّمة', UNDER_REVIEW: 'قيد المراجعة', CHANGES_REQUESTED: 'مطلوب تعديلات', APPROVED: 'معتمدة',
  REJECTED: 'مرفوضة', SIGNED: 'موقَّعة', ISSUED: 'صادرة', ARCHIVED: 'مؤرشفة', CANCELLED: 'ملغاة',
};
export const STATUS_COLOR: Record<string, string> = {
  DRAFT: '#64748b', SUBMITTED: '#0ea5e9', UNDER_REVIEW: '#f59e0b', CHANGES_REQUESTED: '#f97316', APPROVED: '#16a34a',
  REJECTED: '#dc2626', SIGNED: '#7c3aed', ISSUED: '#0f766e', ARCHIVED: '#475569', CANCELLED: '#991b1b',
};
export const PRIORITY_AR: Record<string, string> = { NORMAL: 'عادية', IMPORTANT: 'مهمة', URGENT: 'عاجلة', IMMEDIATE: 'فورية' };
export const CLASS_AR: Record<string, string> = { PUBLIC: 'عام', INTERNAL: 'داخلي', CONFIDENTIAL: 'سري', HIGHLY_CONFIDENTIAL: 'سري للغاية' };
export const SCOPE_AR: Record<string, string> = { SELF: 'ذاتي (مراسلاتي فقط)', ORGANIZATION: 'المنظمة', ORGANIZATION_AND_CHILDREN: 'المنظمة وفروعها', UNIVERSITY_WIDE: 'الجامعة كاملة' };
export const ACTION_AR: Record<string, { label: string; color: string; needsReason?: boolean }> = {
  submit: { label: 'تقديم للمراجعة', color: '#0ea5e9' }, review: { label: 'بدء المراجعة', color: '#f59e0b' },
  'request-changes': { label: 'طلب تعديلات', color: '#f97316', needsReason: true }, approve: { label: 'اعتماد', color: '#16a34a' },
  reject: { label: 'رفض', color: '#dc2626', needsReason: true }, reopen: { label: 'إعادة فتح كمسودة', color: '#64748b' },
  sign: { label: 'توقيع', color: '#7c3aed' }, issue: { label: 'إصدار (توليد الرقم)', color: '#0f766e' },
  archive: { label: 'أرشفة', color: '#475569' }, cancel: { label: 'إلغاء', color: '#991b1b', needsReason: true },
};
export const RECIPIENT_TYPE_AR: Record<string, string> = { INTERNAL_ORGANIZATION: 'جهة داخلية', INTERNAL_PERSON: 'شخص داخلي (موظف/مدرس)', INTERNAL_USER: 'مستخدم داخلي', EXTERNAL_ORGANIZATION: 'جهة خارجية', EXTERNAL_PERSON: 'شخص خارجي' };
export const errMsg = (e: any, fallback = 'حدث خطأ') => (typeof e?.response?.data?.detail === 'string' ? e.response.data.detail : fallback);
