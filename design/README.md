# 앱 아이콘 원본

`app-icon-source.png` — 홈 화면 바로가기·브라우저 탭에 쓰는 아이콘의 원본
(1024×1024, 흰 배경 위에 **검은** 둥근 사각형, 2026-10-06 사용자 제공 — 확장자는
.png지만 실제 포맷은 JPEG이다).

실제로 배포되는 아이콘은 이 파일에서 다음과 같이 만든다:

```python
from PIL import Image
src = Image.open("design/app-icon-source.png").convert("RGB")
# 원본은 1024 캔버스 안에 흰 여백 102px + 둥근 사각형 820px 구조다.
# 모서리 반경이 약 174px이라 곡선이 대각선으로 51px쯤 파고든다. 60px 더 안쪽을
# 잘라 **둥근 모서리를 프레임 밖으로 내보낸다** — 홈 화면·독은 OS가 자기 모양으로
# 깎으므로, 미리 둥근 이미지를 주면 모서리에 흰 자국이 남는다.
base = src.crop((162, 162, 862, 862))

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
