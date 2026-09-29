# airpass-strategic-agent

에어패스 팀 전체가 쓰는 업무 대시보드(SI Business/Cooperation/Marketing/Calendar/자료메일발송/
산출내역/AI HUB/할 일 등). 네이버 키워드광고·블로그 경쟁사 모니터링 결과 확인 화면에서 시작했지만
(그 데이터는 별도 저장소 `airpass-naver-monitor`가 매일 자동으로 채워 넣고, 두 프로젝트는 같은
Supabase 프로젝트를 공유한다) 이후 회사 전반의 업무 도구로 계속 확장됐다.

아키텍처·인증/DB 설계는 [`CLAUDE.md`](./CLAUDE.md)를 참고하세요.

## 처음 설정하기 (순서대로)

### 1. Supabase 프로젝트 생성

1. [supabase.com](https://supabase.com)에서 새 프로젝트 생성
2. 프로젝트 설정 → API 메뉴에서 다음 3개 값을 확보:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key (⚠️ 절대 클라이언트/공개 저장소에 노출 금지) → `SUPABASE_SERVICE_ROLE_KEY`

### 2. 마이그레이션 실행

Supabase 대시보드 → SQL Editor에서 [`supabase/migrations/0001_init.sql`](./supabase/migrations/0001_init.sql)
내용을 그대로 붙여넣고 실행합니다. (또는 Supabase CLI가 있다면 `npx supabase db push`)

이 파일이 스키마의 단일 출처입니다 — `airpass-naver-monitor`(에이전트) 쪽에서도 이 구조를 그대로
참조하므로, 스키마를 바꿀 일이 있으면 여기서만 바꾸고 두 프로젝트에 동일하게 반영하세요.

### 3. 공개 회원가입 끄기

Supabase 대시보드 → Authentication → Providers → Email에서 **"Allow new users to sign up"을
반드시 끕니다.** 이 앱은 관리자가 직접 등록해야만 계정이 생기는 구조라, 이 옵션을 꺼두지 않으면
누구나 가입할 수 있게 됩니다.

같은 화면(또는 Authentication → URL Configuration)에서 **Redirect URLs**에 아래를 등록하세요
(배포 후 실제 도메인으로):

```
http://localhost:3000/auth/callback
https://<your-vercel-domain>/auth/callback
```

### 4. 첫 관리자 만들기 (닭과 달걀 문제)

이 앱에서 계정을 만들 수 있는 유일한 방법은 관리자가 `/dashboard/admin`에서 직접 등록하는
것인데, 최초의 관리자는 등록해줄 관리자가 없습니다. 그래서 최초 1회는 Supabase 대시보드에서
직접 만들어야 합니다:

1. Supabase 대시보드 → Authentication → Users → **Add user** → 이메일/비밀번호 직접 입력해서
   계정 생성
2. SQL Editor에서 아래 실행해 방금 만든 계정을 관리자로 승격:
   ```sql
   update public.profiles set role = 'admin' where email = '본인이메일@example.com';
   ```
3. 이후부터는 `/dashboard/admin`에서 이 관리자 계정으로 팀원을 등록하면 됩니다 — 이메일 발송
   없이 즉시 로그인 가능한 계정이 만들어지고, 초기 비밀번호는 고정값 `Airpass1511!`입니다
   (로그인 후 헤더 개인 메뉴 "비밀번호 변경"에서 각자 바꾸면 됩니다).

### 5. 로컬 환경변수 설정

```bash
cp .env.example .env.local
# .env.local을 열어 1단계에서 확보한 3개 값 입력
npm install
npm run dev
```

### 6. Vercel 환경변수 설정 & 배포

1. Vercel에 프로젝트 연결 (`vercel link` 또는 대시보드에서 GitHub 저장소 import)
2. Vercel 프로젝트 설정 → Environment Variables에 3개 값 등록
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`)
3. 배포: `vercel --prod` (또는 GitHub 연동 시 push마다 자동 배포)

### 7. Redirect URL 등록 (배포 후)

배포된 실제 도메인이 정해지면 3단계에서 등록한 Redirect URLs에 실제 도메인의
`/auth/callback`을 반드시 추가하세요. 등록하지 않으면 비밀번호 재설정 메일의 링크가 동작하지
않습니다.

### 8. 자료메일발송 설정 (선택 — 안 하면 이 메뉴만 설정 안내가 뜨고 나머지는 정상 동작)

**구글드라이브 서비스 계정**
1. [Google Cloud Console](https://console.cloud.google.com/)에서 프로젝트를 만들고
   "Google Drive API"를 사용 설정합니다.
2. IAM 및 관리자 → 서비스 계정 → 새 서비스 계정 생성 → 키 탭에서 JSON 키를 발급받습니다.
3. 자료를 모아둘 구글드라이브 폴더를 만들고, 그 폴더를 서비스 계정 이메일(JSON의
   `client_email`)에 **"편집자"** 권한으로 공유합니다 — "뷰어"로는 발송 직전 파일 공유
   링크 생성이 실패합니다.
4. `.env.local`에 `GOOGLE_SERVICE_ACCOUNT_EMAIL`(JSON의 `client_email`),
   `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`(JSON의 `private_key`, 줄바꿈이 `\n`으로 이스케이프된
   상태 그대로 붙여넣기), `GOOGLE_DRIVE_MATERIALS_FOLDER_ID`(폴더 URL의 마지막 부분)를 입력합니다.

**메일 발송(SMTP 직접 로그인)**

이메일 API(Resend 등) 대신 실제 회사 메일 계정에 SMTP로 직접 로그인해서 그 이름으로
보낸다 — 도메인 인증(DNS)이 필요 없는 대신, 그 계정의 로그인 비밀번호를 그대로 서버
환경변수에 저장하게 된다는 차이가 있다(한비로는 앱 전용 비밀번호 기능이 없음,
2026-08-23 확인 — Gmail을 쓴다면 계정 비밀번호 대신 "앱 비밀번호"를 만들어 그 값을
써서 이 위험을 줄일 수 있다).

1. 메일 서비스 웹 설정에서 POP3/SMTP 사용을 켭니다(한비로는 메일 → 환경설정 →
   기본 설정 → POP3/SMTP 사용함). 오랫동안 안 썼거나 의심스러운 로그인이 감지되면
   자동으로 꺼지기도 하니, 발송이 갑자기 실패하면 이 설정부터 다시 확인합니다.
   발송이 `Invalid login: Auth Fail`로 실패하면 ① 메일 비밀번호가 바뀌었거나
   ② 이 POP3/SMTP 사용이 꺼진 것입니다 — 웹메일에 같은 비밀번호로 로그인해 보면
   둘 중 어느 쪽인지 바로 갈립니다(로그인되면 ②).
2. 해외 접속을 차단하는 보안 설정이 있다면(예: "허용 국가: 대한민국") Vercel 서버가
   해외 리전에서 접속할 수 있으니 국가 제한을 풀거나 모든 국가를 허용해야 합니다.
3. `.env.local`에 SMTP 서버 정보를 입력합니다. 한비로 기준:
   ```
   MATERIAL_EMAIL_SMTP_HOST=airpass.hanbiro.net
   MATERIAL_EMAIL_SMTP_PORT=465
   MATERIAL_EMAIL_SMTP_USER=본인계정@회사도메인
   MATERIAL_EMAIL_SMTP_PASSWORD=메일 로그인 비밀번호
   MATERIAL_EMAIL_FROM_NAME=발신자 표시 이름(선택, 예: 에어패스)
   ```
   다른 메일 서비스를 쓴다면 `HOST`/`PORT`만 그 서비스의 SMTP 정보로 바꾸면 됩니다.

로컬에서 확인했으면 Vercel 프로젝트 설정 → Environment Variables에도 위 5개 값을 동일하게
등록해야 배포 환경에서도 동작합니다.

## 로컬 개발

```bash
npm run dev         # http://localhost:3000
npm run typecheck    # tsc --noEmit
npm run lint          # ESLint
npm run build         # 프로덕션 빌드
```

## 참고

- 이메일+비밀번호 로그인만 지원합니다(매직링크 없음).
- 로그인 사용자는 모니터링 데이터 테이블을 읽기(SELECT)만 할 수 있습니다. 데이터 쓰기는
  `airpass-naver-monitor`(service_role)와 이 앱의 관리자 팀원 등록 기능만 가능합니다.
- 대시보드는 항상 "가장 최근 수집된 날짜"를 기준으로 표시됩니다. 아직 에이전트가 한 번도
  실행되지 않았다면 빈 상태로 보입니다.
