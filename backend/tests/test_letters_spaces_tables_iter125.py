# Iter125: rich_text_pdf multi-space preservation, nbsp, free table parsing/drawing + /api/letters integration (preview/draft/issue PDF)
import io
import os
import sys

import pymupdf
import pytest
import requests

sys.path.insert(0, "/app/backend/backend")
from reportlab.pdfgen import canvas  # noqa: E402
from reportlab.lib.pagesizes import A4  # noqa: E402
from services.rich_text_pdf import parse_rich, _words, draw_rich, html_to_text  # noqa: E402

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


def _render(paras):
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    draw_rich(c, paras, 50, 545, 780)
    c.showPage(); c.save()
    return buf.getvalue()


def _gap_between(pdf, a, b):
    d = pymupdf.open(stream=pdf, filetype="pdf")
    ws = {w[4]: w for w in d[0].get_text("words")}
    assert a in ws and b in ws, f"words not found: {list(ws)}"
    wa, wb = ws[a], ws[b]
    # visual order may be reversed in RTL drawing -> distance between nearest edges
    return max(wb[0] - wa[2], wa[0] - wb[2])


# ---------- Unit: spaces ----------
class TestSpacesUnit:
    def test_three_spaces_gap(self):
        ws = _words(parse_rich("<p>كلمة   أخرى</p>")[0])
        assert [w["text"] for w in ws] == ["كلمة", "أخرى"]
        assert ws[0]["gap"] == 3

    def test_single_space_gap_regression(self):
        ws = _words(parse_rich("<p>كلمة أخرى ثالثة</p>")[0])
        assert [w["gap"] for w in ws[:2]] == [1, 1]

    def test_nbsp_equals_spaces(self):
        a = _words(parse_rich("<p>كلمة&nbsp;&nbsp;&nbsp;أخرى</p>")[0])
        b = _words(parse_rich("<p>كلمة   أخرى</p>")[0])
        assert [(w["text"], w["gap"]) for w in a] == [(w["text"], w["gap"]) for w in b]

    def test_mixed_nbsp_space(self):
        ws = _words(parse_rich("<p>كلمة &nbsp; &nbsp;أخرى</p>")[0])
        assert ws[0]["gap"] == 4

    def test_newlines_tabs_not_inflating(self):
        ws = _words(parse_rich("<p>كلمة\n\n\tأخرى</p>")[0])
        assert ws[0]["gap"] == 1

    def test_plain_text_multi_space(self):
        ws = _words(parse_rich("AAA    BBB")[0])
        assert ws[0]["gap"] == 4

    def test_spaces_across_runs(self):
        # spaces split across formatting boundary: "A " + "<b>  B</b>" -> intended 3 spaces
        ws = _words(parse_rich("<p>AAA <strong>  BBB</strong></p>")[0])
        print("cross-run gap:", ws[0]["gap"])
        assert ws[0]["gap"] == 3, f"cross-run spaces lost: gap={ws[0]['gap']}"

    def test_pdf_gap_is_wider(self):
        g1 = _gap_between(_render(parse_rich('<p style="text-align: left">AAAA BBBB</p>')), "AAAA", "BBBB")
        g4 = _gap_between(_render(parse_rich('<p style="text-align: left">AAAA    BBBB</p>')), "AAAA", "BBBB")
        print("gap1", g1, "gap4", g4)
        assert g4 > g1 * 3


# ---------- Unit: free table ----------
class TestTableUnit:
    HTML = "<p>قبل</p><table><tr><td><p>نص1</p></td><td><p><strong>نص2</strong></p></td></tr></table><p>بعد</p>"

    def test_parse_table(self):
        ps = parse_rich(self.HTML)
        types = [p.get("type", "para") for p in ps]
        assert types == ["para", "table", "para"]
        t = ps[1]
        assert len(t["rows"]) == 1 and len(t["rows"][0]) == 2
        c1, c2 = t["rows"][0]
        assert c1[0]["runs"][0]["text"] == "نص1" and c1[0]["runs"][0]["bold"] is False
        assert c2[0]["runs"][0]["text"] == "نص2" and c2[0]["runs"][0]["bold"] is True

    def test_tiptap_style_table(self):
        html = ('<p>x</p><table style="min-width: 75px"><colgroup><col style="min-width: 25px"><col style="min-width: 25px"><col style="min-width: 25px"></colgroup>'
                '<tbody><tr><td colspan="1" rowspan="1"><p style="text-align: center"><span style="color: #c62828">أحمر</span></p></td><td colspan="1" rowspan="1"><p></p></td><td colspan="1" rowspan="1"><p></p></td></tr>'
                '<tr><th colspan="1" rowspan="1"><p>رأس</p></th><td colspan="1" rowspan="1"><p></p></td><td colspan="1" rowspan="1"><p></p></td></tr></tbody></table><p>بعد</p>')
        ps = parse_rich(html)
        t = [p for p in ps if p.get("type") == "table"][0]
        assert len(t["rows"]) == 2 and all(len(r) == 3 for r in t["rows"])
        r0 = t["rows"][0][0][0]
        assert r0["align"] == "center" and r0["runs"][0]["color"] == "#c62828"
        assert ps[-1]["runs"][0]["text"] == "بعد"
        assert ps[0]["runs"][0]["text"] == "x"
        pdf = _render(ps)
        assert pdf[:4] == b"%PDF" and len(pdf) > 1000

    def test_empty_table_kept_and_drawn(self):
        html = "<table><tbody><tr><td><p></p></td><td><p></p></td></tr></tbody></table>"
        ps = parse_rich(html)
        assert ps[0]["type"] == "table"
        pdf = _render(ps)
        d = pymupdf.open(stream=pdf, filetype="pdf")
        assert len(d[0].get_drawings()) >= 2

    def test_draw_table_pdf(self):
        pdf = _render(parse_rich(self.HTML))
        d = pymupdf.open(stream=pdf, filetype="pdf")
        assert len(d[0].get_drawings()) >= 2
        assert len(pdf) > 1000

    def test_long_table_page_break_with_ensure(self):
        rows = "".join(f"<tr><td><p>صف {i}</p></td><td><p>قيمة {i}</p></td></tr>" for i in range(80))
        ps = parse_rich(f"<table>{rows}</table>")
        buf = io.BytesIO(); c = canvas.Canvas(buf, pagesize=A4); pages = [1]

        def ensure(h, y):
            if y - h < 60:
                c.showPage(); pages[0] += 1; return 780
            return None
        draw_rich(c, ps, 50, 545, 780, ensure=ensure)
        c.showPage(); c.save()
        assert pages[0] >= 2

    def test_html_to_text_skips_table(self):
        assert "قبل" in html_to_text(self.HTML)

    def test_stray_close_td_does_not_swallow_paragraphs(self):
        ps = parse_rich("<p>أول</p><p>ثاني</p><table><tr><td><p>a</p></td></td></tr></table>")
        texts = [p["runs"][0]["text"] for p in ps if p.get("type") != "table" and p["runs"]]
        print("paras:", texts)
        assert "أول" in texts and "ثاني" in texts


# ---------- Integration ----------
@pytest.fixture(scope="module")
def s():
    ses = requests.Session()
    r = ses.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"})
    if r.status_code != 200:
        pytest.skip("admin login failed")
    ses.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})
    return ses


SPACED_SECS = {"recipient": '<p style="text-align: right">سعادة   عميد   الكلية</p>', "greeting": '<p style="text-align: right">التحية     المرسل</p>',
               "subject": '<p style="text-align: center">الموضوع:    {الموضوع}</p>'}
TABLE_BODY = ('<p style="text-align: right">نص قبل الجدول    بفراغات</p><table style="min-width: 75px"><colgroup><col><col><col></colgroup><tbody>'
              '<tr><td colspan="1" rowspan="1"><p><strong>البند</strong></p></td><td colspan="1" rowspan="1"><p>القيمة</p></td><td colspan="1" rowspan="1"><p></p></td></tr>'
              '<tr><td colspan="1" rowspan="1"><p>أ</p></td><td colspan="1" rowspan="1"><p style="text-align: center"><span style="color: #c62828">١٠٠</span></p></td><td colspan="1" rowspan="1"><p></p></td></tr>'
              '</tbody></table><p style="text-align: right">نص بعد الجدول</p>')


def _payload(body, sections=None):
    return {"template_name": "TEST_iter125", "subject": "TEST_iter125 اختبار", "body": body, "recipient": {"title": "عميد الكلية", "name": "د. اختبار", "suffix": "المحترم"},
            "people": [], "sections": sections}


class TestIntegration:
    def test_preview_png_plain_regression(self, s):
        r = s.post(f"{API}/letters/preview-pdf?fmt=png", json=_payload('<p style="text-align: right">نص عادي بلا فراغات إضافية</p>'))
        assert r.status_code == 200 and r.headers["content-type"].startswith("image/png") and r.content[:4] == b"\x89PNG"

    def test_preview_pdf_spaces_body_and_sections(self, s):
        r = s.post(f"{API}/letters/preview-pdf?fmt=pdf", json=_payload('<p style="text-align: right">كلمة     أخرى   ثالثة</p>', SPACED_SECS))
        assert r.status_code == 200 and r.headers["content-type"].startswith("application/pdf")
        assert pymupdf.open(stream=r.content, filetype="pdf").page_count >= 1

    def test_preview_png_spaces(self, s):
        r = s.post(f"{API}/letters/preview-pdf?fmt=png", json=_payload('<p>كلمة&nbsp;&nbsp;&nbsp;أخرى</p>', SPACED_SECS))
        assert r.status_code == 200 and len(r.content) > 5000

    def test_preview_table_pdf_and_png(self, s):
        for fmt in ("pdf", "png"):
            r = s.post(f"{API}/letters/preview-pdf?fmt={fmt}", json=_payload(TABLE_BODY))
            assert r.status_code == 200, r.text[:300]
            assert len(r.content) > 5000

    def test_draft_save_then_pdf_with_table(self, s):
        r = s.post(f"{API}/letters/draft", json=_payload(TABLE_BODY, SPACED_SECS))
        assert r.status_code == 200, r.text[:300]
        lid = r.json()["id"]
        try:
            g = s.get(f"{API}/letters/{lid}")
            assert g.status_code == 200 and "<table" in ((g.json().get("inputs") or {}).get("body") or g.json().get("body"))
            p = s.get(f"{API}/letters/{lid}/pdf")
            assert p.status_code == 200 and p.content[:4] == b"%PDF"
            d = pymupdf.open(stream=p.content, filetype="pdf")
            txt = "".join(pg.get_text() for pg in d)
            assert len(d[0].get_drawings()) > 0
            print("pdf text has table content:", "١٠٠" in txt or "100" in txt)
            dx = s.get(f"{API}/letters/{lid}/docx")
            print("docx status:", dx.status_code)
            assert dx.status_code == 200
        finally:
            s.delete(f"{API}/letters/{lid}")
