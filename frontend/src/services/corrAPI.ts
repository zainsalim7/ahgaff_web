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
};

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
export const RECIPIENT_TYPE_AR: Record<string, string> = { INTERNAL_ORGANIZATION: 'جهة داخلية', INTERNAL_USER: 'مستخدم داخلي', EXTERNAL_ORGANIZATION: 'جهة خارجية', EXTERNAL_PERSON: 'شخص خارجي' };
export const errMsg = (e: any, fallback = 'حدث خطأ') => (typeof e?.response?.data?.detail === 'string' ? e.response.data.detail : fallback);
