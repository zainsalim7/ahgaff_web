// =====================================================
// Cloudflare Worker: wafideen.ahgaff.net → Cloud Run
// Frontend Proxy for Wafideen project
// =====================================================

const CLOUD_RUN_FRONTEND = "https://wafideen-frontend-3pzknh7knq-ww.a.run.app";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // بناء الـ URL الجديد على Cloud Run
    const targetUrl = new URL(url.pathname + url.search, CLOUD_RUN_FRONTEND);
    
    // نسخ كل الـ headers من الطلب الأصلي
    const headers = new Headers(request.headers);
    
    // إعادة كتابة الـ Host header ليطابق Cloud Run target
    headers.set("Host", new URL(CLOUD_RUN_FRONTEND).host);
    
    // الحفاظ على IP العميل الأصلي
    const clientIP = request.headers.get("CF-Connecting-IP");
    if (clientIP) {
      headers.set("X-Forwarded-For", clientIP);
      headers.set("X-Real-IP", clientIP);
    }
    headers.set("X-Forwarded-Proto", "https");
    headers.set("X-Forwarded-Host", url.host);
    
    // إزالة Cloudflare-specific headers
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
      
      const responseHeaders = new Headers(response.headers);
      responseHeaders.set("X-Proxied-By", "Cloudflare-Worker-Wafideen-Frontend");
      
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    } catch (error) {
      return new Response(
        `Frontend proxy error: ${error.message}`,
        { status: 502, headers: { "Content-Type": "text/plain" } }
      );
    }
  },
};
