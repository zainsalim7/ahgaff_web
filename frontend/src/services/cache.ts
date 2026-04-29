/**
 * In-memory cache للبيانات الثابتة (كليات، أقسام، إعدادات، جامعة).
 * - يقلل طلبات الشبكة المتكررة لنفس البيانات عبر الصفحات
 * - TTL افتراضي: 5 دقائق
 * - يمكن إبطال المفتاح يدوياً بعد التحديث عبر invalidate()
 */

type CacheEntry<T> = {
  data: T;
  expiresAt: number;
};

const store = new Map<string, CacheEntry<any>>();
const inflight = new Map<string, Promise<any>>();

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 دقائق

export function getCached<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setCached<T>(key: string, data: T, ttlMs: number = DEFAULT_TTL_MS): void {
  store.set(key, { data, expiresAt: Date.now() + ttlMs });
}

export function invalidate(keyOrPrefix: string): void {
  // حذف مباشر
  if (store.has(keyOrPrefix)) {
    store.delete(keyOrPrefix);
  }
  // حذف كل المفاتيح التي تبدأ بـ prefix
  for (const k of Array.from(store.keys())) {
    if (k.startsWith(keyOrPrefix)) {
      store.delete(k);
    }
  }
}

export function invalidateAll(): void {
  store.clear();
  inflight.clear();
}

/**
 * getOrFetch: يُرجع القيمة المخزّنة أو يستدعي `fetcher` مع منع الـ dedupe
 * (إذا طُلب نفس المفتاح بالتوازي، ننتظر نفس الوعد).
 */
export async function getOrFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<T> {
  const cached = getCached<T>(key);
  if (cached !== null) return cached;

  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = (async () => {
    try {
      const data = await fetcher();
      setCached(key, data, ttlMs);
      return data;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}
