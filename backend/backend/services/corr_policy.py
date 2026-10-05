"""📜 خدمة التفويض المركزية لنظام المراسلات الرسمية
التقييم: المستخدم + العضوية + الدور + الصلاحية + النطاق + منظمة المورد
"""
from typing import Optional, Set, List, Dict
from bson import ObjectId

ALL = "__ALL__"

SCOPE_SELF = "SELF"
SCOPE_ORG = "ORGANIZATION"
SCOPE_ORG_CHILDREN = "ORGANIZATION_AND_CHILDREN"
SCOPE_UNIVERSITY = "UNIVERSITY_WIDE"
SCOPE_TYPES = (SCOPE_SELF, SCOPE_ORG, SCOPE_ORG_CHILDREN, SCOPE_UNIVERSITY)

P = {
    "create": "correspondence.create",
    "read": "correspondence.read",
    "update_draft": "correspondence.update_draft",
    "submit": "correspondence.submit",
    "review": "correspondence.review",
    "approve": "correspondence.approve",
    "reject": "correspondence.reject",
    "sign": "correspondence.sign",
    "issue": "correspondence.issue",
    "archive": "correspondence.archive",
    "cancel": "correspondence.cancel",
    "view_archive": "correspondence.view_archive",
    "view_all_organization": "correspondence.view_all_organization",
    "view_child_organizations": "correspondence.view_child_organizations",
    "read_confidential": "correspondence.read_confidential",
    "read_highly_confidential": "correspondence.read_highly_confidential",
    "delete_draft": "correspondence.delete_draft",
    "templates": "templates.manage",
    "numbering": "numbering.manage",
    "organizations": "organizations.manage",
    "permissions": "permissions.manage",
    "memberships": "memberships.manage",
    "audit": "audit.view",
}

ALL_CORR_PERMISSIONS = [
    {"key": P["create"], "label": "إنشاء مسودة مراسلة"},
    {"key": P["read"], "label": "قراءة المراسلات (الخاصة بي / الموجهة لي)"},
    {"key": P["update_draft"], "label": "تعديل المسودات"},
    {"key": P["delete_draft"], "label": "حذف المسودات (حذف منطقي)"},
    {"key": P["submit"], "label": "تقديم المسودة للمراجعة"},
    {"key": P["review"], "label": "مراجعة / طلب تعديلات"},
    {"key": P["approve"], "label": "اعتماد"},
    {"key": P["reject"], "label": "رفض"},
    {"key": P["sign"], "label": "توقيع"},
    {"key": P["issue"], "label": "إصدار (توليد الرقم الرسمي)"},
    {"key": P["archive"], "label": "أرشفة"},
    {"key": P["cancel"], "label": "إلغاء مراسلة صادرة"},
    {"key": P["view_archive"], "label": "عرض الأرشيف"},
    {"key": P["view_all_organization"], "label": "عرض كل مراسلات المنظمة"},
    {"key": P["view_child_organizations"], "label": "عرض مراسلات المنظمات الفرعية"},
    {"key": P["read_confidential"], "label": "قراءة المراسلات السرية"},
    {"key": P["read_highly_confidential"], "label": "قراءة المراسلات السرية للغاية"},
    {"key": P["templates"], "label": "إدارة أنواع الوثائق / القوالب"},
    {"key": P["numbering"], "label": "إدارة مخططات الترقيم"},
    {"key": P["organizations"], "label": "إدارة الهيكل التنظيمي"},
    {"key": P["memberships"], "label": "إدارة عضويات المستخدمين"},
    {"key": P["permissions"], "label": "إدارة أدوار المراسلات"},
    {"key": P["audit"], "label": "عرض سجل التدقيق"},
]
PERMISSION_KEYS = {p["key"] for p in ALL_CORR_PERMISSIONS}
# المرحلة 2: صلاحيات الترويسات/القوالب/الكيانات/العناصر النائبة
_P2 = [("letterhead.read", "عرض الترويسات"), ("letterhead.create", "إنشاء ترويسة"), ("letterhead.update", "تعديل ترويسة"), ("letterhead.activate", "تفعيل/إيقاف ترويسة"), ("letterhead.set_default", "تعيين الترويسة الافتراضية"), ("letterhead.manage_organization", "إدارة ترويسات المنظمة"),
       ("template.read", "عرض القوالب"), ("template.create", "إنشاء قالب"), ("template.update_draft", "تعديل مسودة قالب"), ("template.publish", "نشر إصدار قالب"), ("template.deactivate", "إيقاف قالب"), ("template.clone", "استنساخ قالب"), ("template.manage_global", "إدارة القوالب العامة"), ("template.manage_organization", "إدارة قوالب المنظمة"), ("template.use", "استخدام القوالب في المراسلات"),
       ("entity.student.read", "اختيار الطلاب وقراءة بياناتهم الأساسية"), ("entity.employee.read", "اختيار الموظفين وقراءة بياناتهم الأساسية"), ("entity.faculty.read", "اختيار أعضاء هيئة التدريس"),
       ("placeholder.contact.read", "عناصر نائبة: بيانات التواصل"), ("placeholder.academic.read", "عناصر نائبة: بيانات أكاديمية موسّعة")]
ALL_CORR_PERMISSIONS += [{"key": k, "label": v} for k, v in _P2]
PERMISSION_KEYS = {p["key"] for p in ALL_CORR_PERMISSIONS}
_P2_USE = ["template.read", "template.use", "letterhead.read", "entity.student.read", "entity.employee.read", "entity.faculty.read"]
_P2_ORG_ADMIN = _P2_USE + ["letterhead.create", "letterhead.update", "letterhead.activate", "letterhead.set_default", "letterhead.manage_organization", "template.create", "template.update_draft", "template.publish", "template.deactivate", "template.clone", "template.manage_organization", "placeholder.contact.read", "placeholder.academic.read"]

_WORKFLOW = [P["create"], P["read"], P["update_draft"], P["delete_draft"], P["submit"], P["review"], P["approve"], P["reject"],
             P["sign"], P["issue"], P["archive"], P["cancel"], P["view_archive"], P["view_all_organization"], P["view_child_organizations"]]
ROLE_PRESETS = [
    {"code": "SUPER_ADMIN", "name_ar": "مدير النظام الأعلى", "permissions": sorted(PERMISSION_KEYS)},
    {"code": "UNIVERSITY_ADMIN", "name_ar": "مدير مراسلات الجامعة", "permissions": sorted(PERMISSION_KEYS - {P["permissions"]})},
    {"code": "ORGANIZATION_ADMIN", "name_ar": "مدير مراسلات المنظمة", "permissions": _WORKFLOW + [P["read_confidential"], P["templates"], P["numbering"], P["memberships"], P["audit"]] + _P2_ORG_ADMIN},
    {"code": "CORRESPONDENCE_MANAGER", "name_ar": "مدير المراسلات", "permissions": _WORKFLOW + [P["read_confidential"], P["audit"]] + _P2_USE + ["placeholder.contact.read"]},
    {"code": "CORRESPONDENCE_OFFICER", "name_ar": "موظف مراسلات", "permissions": [P["create"], P["read"], P["update_draft"], P["delete_draft"], P["submit"], P["issue"], P["archive"], P["view_archive"], P["view_all_organization"]] + _P2_USE},
    {"code": "DRAFTER", "name_ar": "مُعِدّ", "permissions": [P["create"], P["read"], P["update_draft"], P["delete_draft"], P["submit"]] + _P2_USE},
    {"code": "REVIEWER", "name_ar": "مراجع", "permissions": [P["read"], P["review"], P["view_all_organization"]]},
    {"code": "APPROVER", "name_ar": "معتمِد", "permissions": [P["read"], P["approve"], P["reject"], P["view_all_organization"], P["read_confidential"]]},
    {"code": "SIGNER", "name_ar": "موقِّع", "permissions": [P["read"], P["sign"], P["view_all_organization"], P["read_confidential"]]},
    {"code": "ARCHIVIST", "name_ar": "أمين أرشيف", "permissions": [P["read"], P["archive"], P["view_archive"], P["view_all_organization"]]},
    {"code": "VIEWER", "name_ar": "مطّلع", "permissions": [P["read"]]},
]

CLASSIFICATIONS = ("PUBLIC", "INTERNAL", "CONFIDENTIAL", "HIGHLY_CONFIDENTIAL")
CLASS_PERM = {"CONFIDENTIAL": P["read_confidential"], "HIGHLY_CONFIDENTIAL": P["read_highly_confidential"]}


class Grant:
    __slots__ = ("org_id", "scope_type", "perms", "membership_id")

    def __init__(self, org_id: str, scope_type: str, perms: Set[str], membership_id: str = ""):
        self.org_id, self.scope_type, self.perms, self.membership_id = org_id, scope_type, perms, membership_id


class CorrContext:
    def __init__(self, user: dict, grants: List[Grant], tree: Dict[str, Optional[str]], is_super: bool):
        self.user = user
        self.user_id = str(user.get("id") or user.get("_id"))
        self.grants = grants
        self.tree = tree  # org_id -> parent_id
        self.is_super = is_super
        self._desc_cache: Dict[str, Set[str]] = {}

    def descendants(self, org_id: str) -> Set[str]:
        if org_id in self._desc_cache:
            return self._desc_cache[org_id]
        children: Dict[str, List[str]] = {}
        for k, p in self.tree.items():
            if p:
                children.setdefault(p, []).append(k)
        out, stack = {org_id}, [org_id]
        while stack:
            cur = stack.pop()
            for c in children.get(cur, []):
                if c not in out:
                    out.add(c)
                    stack.append(c)
        self._desc_cache[org_id] = out
        return out

    def grant_orgs(self, g: Grant, perm: str = "") -> object:
        if g.scope_type == SCOPE_UNIVERSITY:
            return ALL
        if g.scope_type == SCOPE_ORG_CHILDREN or (perm and P["view_child_organizations"] in g.perms and g.scope_type == SCOPE_ORG):
            return self.descendants(g.org_id)
        return {g.org_id}

    def owns(self, resource: Optional[dict]) -> bool:
        if not resource:
            return False
        return resource.get("created_by") == self.user_id or resource.get("current_owner_user_id") == self.user_id \
            or self.user_id in (resource.get("recipient_user_ids") or [])

    def can(self, perm: str, org_id: Optional[str], resource: Optional[dict] = None) -> bool:
        """canUserPerform(user, permission, organizationId, resource)"""
        if self.is_super:
            return True
        cls = (resource or {}).get("security_classification") or "INTERNAL"
        for g in self.grants:
            if perm not in g.perms:
                continue
            orgs = self.grant_orgs(g, perm)
            if orgs is not ALL and (not org_id or org_id not in orgs):
                continue
            if resource is not None:
                own = self.owns(resource)
                if g.scope_type == SCOPE_SELF and not own:
                    continue
                if perm == P["read"] and not own and P["view_all_organization"] not in g.perms:
                    continue
                if cls in CLASS_PERM and not own and CLASS_PERM[cls] not in g.perms:
                    continue
            return True
        return False

    def has_perm_anywhere(self, perm: str) -> bool:
        return self.is_super or any(perm in g.perms for g in self.grants)

    def orgs_with(self, perm: str) -> object:
        """المنظمات التي يملك فيها المستخدم الصلاحية (أو ALL)"""
        if self.is_super:
            return ALL
        out: Set[str] = set()
        for g in self.grants:
            if perm in g.perms:
                o = self.grant_orgs(g, perm)
                if o is ALL:
                    return ALL
                out |= o
        return out

    def visibility_filter(self) -> Optional[dict]:
        """فلتر MongoDB للمراسلات المرئية للمستخدم — None يعني لا شيء"""
        if self.is_super:
            return {}
        ors = []
        own = {"$or": [{"created_by": self.user_id}, {"current_owner_user_id": self.user_id}, {"recipient_user_ids": self.user_id}]}
        for g in self.grants:
            if P["read"] not in g.perms:
                continue
            orgs = self.grant_orgs(g, P["read"])
            base = {} if orgs is ALL else {"organization_id": {"$in": sorted(orgs)}}
            hidden = [c for c, need in CLASS_PERM.items() if need not in g.perms]
            if g.scope_type == SCOPE_SELF or P["view_all_organization"] not in g.perms:
                ors.append({**base, **own})
            else:
                ors.append({**base, "$or": [own, {"security_classification": {"$nin": hidden}} if hidden else {}]})
        return {"$or": ors} if ors else None


async def load_context(db, user: dict) -> CorrContext:
    uid = str(user.get("id") or user.get("_id"))
    is_super = user.get("role") == "admin"  # 🔐 admin النظامي = مدير منصة حقيقي (مدقق: حساب واحد؛ العمداء/رؤساء الأقسام أدوار أخرى)
    tree = {str(u["_id"]): (u.get("parent_id") or None) async for u in db.org_units.find({}, {"parent_id": 1})}
    grants: List[Grant] = []
    mems = await db.org_memberships.find({"user_id": uid, "is_active": True}).to_list(200)
    if mems:
        mids = [str(m["_id"]) for m in mems]
        links = await db.org_membership_roles.find({"membership_id": {"$in": mids}}).to_list(2000)
        role_ids = {l["role_id"] for l in links if ObjectId.is_valid(l.get("role_id", ""))}
        roles = {str(r["_id"]): set(r.get("permissions") or []) for r in await db.corr_roles.find({"_id": {"$in": [ObjectId(r) for r in role_ids]}, "is_active": {"$ne": False}}).to_list(500)}
        by_mem: Dict[str, Set[str]] = {}
        for l in links:
            by_mem.setdefault(l["membership_id"], set()).update(roles.get(l["role_id"], set()))
        for m in mems:
            perms = by_mem.get(str(m["_id"]), set())
            if perms:
                grants.append(Grant(m["organization_id"], m.get("scope_type") or SCOPE_ORG, perms, str(m["_id"])))
    return CorrContext(user, grants, tree, is_super)
