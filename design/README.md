# 앱 아이콘 원본

`app-icon-source.png` — 홈 화면 바로가기·브라우저 탭에 쓰는 아이콘의 원본
(1024×1024, 흰 배경 위에 **검은** 둥근 사각형, 2026-10-06 사용자 제공 — 확장자는
.png지만 실제 포맷은 JPEG이다).

홈 화면·독 아이콘(apple-touch-icon, manifest의 192/512)은 **favicon과 같은
원본**(`favicon-source.png`, 투명 배경 PNG)에서 만든다 — `app-icon-source.png`는
2026-10-06까지 쓰던 JPEG 원본이라 기록용으로만 남겨둔다.

```python
from PIL import Image
src = Image.open("design/favicon-source.png").convert("RGBA")
sq = src.crop(src.getchannel("A").getbbox())   # 투명 여백 제거 → 710x710 둥근 사각형

def render(n):
    # 둥근 사각형을 캔버스에 꽉 채운다. 모서리가 투명이라 검정 위에 올리면
    # 그대로 검정이 되어 full-bleed가 된다 — 잘라낼 필요가 없다.
    canvas = Image.new("RGB", (n, n), (0, 0, 0))
    s = sq.resize((n, n), Image.LANCZOS)
    canvas.paste(s, (0, 0), s)
    return canvas

render(180).save("public/apple-touch-icon.png", optimize=True)
render(192).save("public/icon-192.png", optimize=True)
render(512).save("public/icon-512.png", optimize=True)
```

⚠️ **모서리를 잘라 확대하지 말 것.** 2026-10-06까지는 모서리 60px을 잘라
full-bleed를 만들었는데, 그 바람에 링이 가로 92%까지 커져 좌우 여백이 4%밖에
남지 않아 홈 화면에서 답답해 보였다(사용자 지적, 2026-10-11). 투명 모서리를
가진 원본을 쓰면 자르지 않아도 full-bleed가 되고, 링은 아트워크 본래 비율
(가로 78%, 좌우 여백 11%)을 유지한다.

아이콘을 바꾸면 `public/manifest.json`의 `?v=` 숫자와
`app/layout.tsx`의 `icons.apple` 쿼리도 함께 올려야 브라우저가 새로 받아간다.

## 북마크·탭 아이콘(favicon)은 원본이 따로다

`favicon-source.png` — 886×886 PNG, **투명 배경**에 검은 둥근 사각형(710×710,
모서리 반경 약 154px)이 들어 있다(2026-10-11 사용자 제공).

홈 화면 아이콘과 처리 방식이 다르다: 북마크·탭 아이콘은 **OS가 모양을 깎지
않으므로 둥근 모서리를 그대로 둔다.** 투명한 모서리라 밝은 탭에서도 어두운
탭에서도 자연스럽게 보인다. (홈 화면 아이콘은 반대로 모서리를 잘라내 full-bleed로
만든다 — 위 참고.)

```python
from PIL import Image
src = Image.open("design/favicon-source.png").convert("RGBA")
base = src.crop(src.getchannel("A").getbbox())   # 투명 여백 88px 제거 → 710x710
# ⚠️ ICO 안의 PNG는 RGBA여야 한다(RGB면 Turbopack 빌드 실패).
base.save("app/favicon.ico",
          sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)])
```
