# 앱 아이콘 원본

`app-icon-source.png` — 홈 화면 바로가기·브라우저 탭에 쓰는 아이콘의 원본
(1024×1024, 흰 배경 위에 둥근 사각형, 2026-10-06 사용자 제공).

실제로 배포되는 아이콘은 이 파일에서 다음과 같이 만든다:

```python
from PIL import Image
src = Image.open("design/app-icon-source.png").convert("RGB")
# 원본은 1024 캔버스 안에 흰 여백 102px + 둥근 사각형 820px 구조다.
# 60px 더 안쪽을 잘라 **둥근 모서리를 프레임 밖으로 내보낸다** — 홈 화면·독은
# OS가 자기 모양으로 깎으므로, 미리 둥근 이미지를 주면 모서리에 흰 자국이 남는다.
base = src.crop((162, 162, 862, 862))

# 배경을 검정으로 바꾼다(2026-10-06 요청). 전체를 어둡게 하거나 남색을 빼면
# 링 색이 청록으로 틀어지므로, **배경색에 가까운 픽셀만** 검정으로 치환한다.
from PIL import ImageChops, ImageStat
W, H = base.size
tiles = [base.crop(b) for b in [(0,0,60,60),(W-60,0,W,60),(0,H-60,60,H),(W-60,H-60,W,H)]]
navy = tuple(round(sum(ImageStat.Stat(t).mean[i] for t in tiles)/4) for i in range(3))
diff = ImageChops.difference(base, Image.new("RGB", base.size, navy)).convert("L")
mask = diff.point(lambda v: 0 if v <= 8 else (255 if v >= 36 else int((v-8)/28*255)))
black = Image.new("RGB", base.size, (0, 0, 0)); black.paste(base, (0, 0), mask)
base = black

base.resize((180, 180), Image.LANCZOS).save("public/apple-touch-icon.png", optimize=True)
base.resize((192, 192), Image.LANCZOS).save("public/icon-192.png", optimize=True)
base.resize((512, 512), Image.LANCZOS).save("public/icon-512.png", optimize=True)
# ⚠️ favicon.ico 안의 PNG는 반드시 RGBA — RGB면 Turbopack 빌드가
#    "The PNG is not in RGBA format!"로 실패한다.
base.convert("RGBA").save("app/favicon.ico",
                          sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)])
```

아이콘을 바꾸면 `public/manifest.json`의 `?v=` 숫자와
`app/layout.tsx`의 `icons.apple` 쿼리도 함께 올려야 브라우저가 새로 받아간다.
