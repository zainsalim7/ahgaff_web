// =====================================================
// Cloudflare Worker: api.wafideen.ahgaff.net → Cloud Run
// Backend Proxy for Wafideen project
// =====================================================

const CLOUD_RUN_BACKEND = "https://wafideen-backend-872667841290.me-central1.run.app";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // بناء الـ URL الجديد على Cloud Run
    const targetUrl = new URL(url.pathname + url.search, CLOUD_RUN_BACKEND);
    
    // نسخ كل الـ headers من الطلب الأصلي
    const headers = new Headers(request.headers);
    
    // إعادة كتابة الـ Host header ليطابق Cloud Run target
    headers.set("Host", new URL(CLOUD_RUN_BACKEND).host);
    
    // الحفاظ على IP العميل الأصلي
    const clientIP = request.headers.get("CF-Connecting-IP");
    if (clientIP) {
      headers.set("X-Forwarded-For", clientIP);
      headers.set("X-Real-IP", clientIP);
    }
    headers.set("X-Forwarded-Proto", "https");
    headers.set("X-Forwarded-Host", url.host);
    
    // إزالة Cloudflare-specific headers قد تربك Cloud Run
    headers.delete("CF-Connecting-IP");
    headers.delete("CF-IPCountry");
    headers.delete("CF-RAY");
    headers.delete("CF-Visitor");
    
    // بناء الطلب الجديد
    const proxyRequest = new Request(targetUrl.toString(), {
      method: request.method,
      headers: headers,
      body: request.body,
      redirect: "manual",
    });
    
    try {
      const response = await fetch(proxyRequest);
      
      // نسخ الاستجابة مع تعديل CORS إذا لزم
      const responseHeaders = new Headers(response.headers);
      
      // إضافة headers أمنية إضافية
      responseHeaders.set("X-Proxied-By", "Cloudflare-Worker-Wafideen");
      
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: "Proxy error",
          message: error.message,
          target: CLOUD_RUN_BACKEND,
        }),
        {
          status: 502,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  },
};
