# Repro script body for browser_automation: letters layout sections alignment/spacing (greeting/subject/closing vs body)
import json, hashlib
await page.set_viewport_size({"width": 1920, "height": 1080})
BASE = "https://schedule-hub-272.preview.emergentagent.com"
logs = []
page.on("console", lambda m: logs.append(f"{m.type}: {m.text[:200]}") if m.type in ("error", "warning") else None)
reqs = []
imgs = []
def on_req(r):
    if "/letters/preview-pdf" in r.url and r.method == "POST":
        try: reqs.append(json.loads(r.post_data or "{}"))
        except Exception: pass
async def on_resp(r):
    if "/letters/preview-pdf" in r.url:
        try:
            b = await r.body(); imgs.append(hashlib.md5(b).hexdigest()[:10])
        except Exception: pass
page.on("request", on_req)
page.on("response", on_resp)

async def ed_html(tid):
    return await page.evaluate(f"() => document.querySelector('[data-testid=\"{tid}\"] .tiptap')?.innerHTML")

async def settle():
    await page.wait_for_timeout(2600)

def last(key):
    if not reqs: return None
    p = reqs[-1]
    return p.get("body") if key == "body" else (p.get("sections") or {}).get(key)

try:
    await page.goto(BASE)
    await page.wait_for_timeout(2000)
    await page.fill("input[placeholder^='اسم المستخدم']", "admin")
    await page.fill("input[placeholder='كلمة المرور']", "admin123")
    await page.get_by_text("تسجيل الدخول", exact=True).click()
    await page.wait_for_timeout(4000)
    await page.goto(BASE + "/letters")
    await page.wait_for_selector('[data-testid="letter-template"]', timeout=20000)
    await page.wait_for_timeout(2000)
    await page.select_option('[data-testid="letter-template"]', "6ac52b8d47a242e5905b213b")
    await page.wait_for_timeout(1500)
    await page.click('[data-testid="letter-layout-toggle"]')
    await page.wait_for_selector('[data-testid="letter-layout-subject"]', timeout=10000)
    await settle()
    print("INITIAL preview-pdf reqs:", len(reqs), "img hashes:", imgs[-3:])

    for key in SECS_TO_TEST:
        tid = f"letter-layout-{key}" if key != "body" else "letter-body"
        if key == "body":
            await page.click('[data-testid="letter-layout-done"]'); await page.wait_for_timeout(800)
        print(f"\n===== {key} =====")
        print("editor HTML before:", await ed_html(tid))
        print("payload before:", last(key))
        n0 = len(reqs)
        editor = page.locator(f'[data-testid="{tid}"] .tiptap')
        await editor.click()
        await page.keyboard.press("Control+a")
        for title in ["وسط", "يسار (نص بلغة أجنبية LTR)", "يمين"]:
            await page.locator(f'[data-testid="{tid}"] button[title="{title}"]').click()
            await settle()
            print(f"[{title}] editor HTML:", await ed_html(tid))
            print(f"[{title}] new reqs: {len(reqs)-n0} | payload {key}:", last(key))
            print(f"[{title}] img hashes:", imgs[-2:])
            n0 = len(reqs)
            if key == "subject" and title.startswith("يسار"):
                if key != "body":
                    await page.screenshot(path=f".screenshots/{key}_left.png", quality=40, full_page=False)
        # spaces test
        await editor.click()
        await page.keyboard.press("Control+End")
        await page.keyboard.type(" " * 25 + "XYZ")
        await settle()
        h = await ed_html(tid)
        print("after spaces editor HTML:", h)
        p = last(key) or ""
        print("after spaces payload:", p)
        print("payload contains 25 consecutive spaces:", (" " * 25) in p, "| nbsp count:", p.count("&nbsp;") + p.count("\u00a0"), "| XYZ in payload:", "XYZ" in p)
        if key == "body":
            await page.click('[data-testid="letter-layout-toggle"]'); await page.wait_for_timeout(500)
        await page.screenshot(path=f".screenshots/{key}_spaces.png", quality=40, full_page=False)
    print("\nCONSOLE errors/warnings (filtered):", [l for l in logs if "deprecated" not in l and "Require cycle" not in l and "Unknown event handler" not in l][:20])
except Exception as e:
    print("ERR", e)
