"""اختبار تمديد نافذة مزامنة التحضير الأوفلاين من 12 إلى 72 ساعة (قابلية القبول)."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from server import OFFLINE_SYNC_MAX_HOURS

def check(age_hours):
    age_seconds = age_hours * 3600
    rejected = age_seconds > OFFLINE_SYNC_MAX_HOURS * 3600
    return not rejected  # True = مقبول

results = []

# 1) سجل عمره 71 ساعة -> يجب أن يُقبل الآن (كان سيُرفض سابقاً تحت حد 12 ساعة)
results.append(("سجل عمره 71 ساعة (داخل الحد الجديد 72)", check(71), True))

# 2) سجل عمره 73 ساعة -> يجب أن يُرفض (تجاوز الحد الجديد)
results.append(("سجل عمره 73 ساعة (تجاوز الحد الجديد 72)", check(73), False))

# 3) سجل عمره 12 ساعة و 10 دقائق -> كان سيُرفض تحت الحد القديم (12)، يجب أن يُقبل الآن
results.append(("سجل عمره 12 ساعة و10 دقائق (كان يُرفض بالحد القديم)", check(12 + 10/60), True))

# 4) سجل عمره 72 ساعة بالضبط -> حد فاصل، يجب أن يُقبل (الشرط صارم >)
results.append(("سجل عمره 72 ساعة بالضبط (الحد الفاصل)", check(72), True))

print(f"OFFLINE_SYNC_MAX_HOURS الحالي = {OFFLINE_SYNC_MAX_HOURS}")
all_pass = True
for name, actual, expected in results:
    status = "✅ نجح" if actual == expected else "❌ فشل"
    if actual != expected:
        all_pass = False
    print(f"{status} | {name} | متوقع={'مقبول' if expected else 'مرفوض'} فعلي={'مقبول' if actual else 'مرفوض'}")

print("\nالنتيجة النهائية:", "كل الاختبارات نجحت ✅" if all_pass else "هناك اختبارات فاشلة ❌")
sys.exit(0 if all_pass else 1)
