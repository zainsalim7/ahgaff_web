# Replays UI-captured preview-pdf payload (right align, Arabic+28sp+ABC DEF) + left-align variant; prints word x positions
import json, re, requests, pymupdf
URL=[l.split('=',1)[1].strip() for l in open('/app/frontend/.env') if l.startswith('REACT_APP_BACKEND_URL=')][0]
H={"Authorization":"Bearer "+requests.post(f"{URL}/api/auth/login",json={"username":"admin","password":"admin123"}).json()["access_token"]}
body=json.loads(open('/app/.screenshots/req_i132_right.json').read())
secs=body.get("sections") or (body.get("layout") or {}).get("sections") or {}
print("payload keys", list(body.keys())); print("sections:", {k:v[:120] for k,v in (secs.items() if isinstance(secs,dict) else [])})
def run(b,tag):
    r=requests.post(f"{URL}/api/letters/preview-pdf?fmt=pdf",json=b,headers=H); assert r.status_code==200, r.text[:300]
    pg=pymupdf.open(stream=r.content,filetype="pdf")[0]
    lines={}
    for b in pg.get_text("rawdict")["blocks"]:
        for l in b.get("lines",[]):
            for sp in l["spans"]:
                for c in sp["chars"]:
                    if c["c"].strip(): lines.setdefault(round(c["bbox"][1]),[]).append((c["bbox"][0],c["bbox"][2],c["c"]))
    for y,cs in sorted(lines.items()):
        t="".join(x[2] for x in cs)
        if "ABC" in t or "DEF" in t:
            cs=sorted(cs); gaps=[(round(cs[i+1][0]-cs[i][1],1),cs[i][2]+'|'+cs[i+1][2]) for i in range(len(cs)-1)]
            big=[g for g in gaps if g[0]>15]
            print(f"{tag} y={y} span={cs[0][0]:.1f}-{cs[-1][1]:.1f} big_gaps={big}")
run(body,"RIGHT")
s=json.dumps(body,ensure_ascii=False).replace("text-align: right;","text-align: left;")
run(json.loads(s),"LEFT ")
