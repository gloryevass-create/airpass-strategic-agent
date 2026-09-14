@AGENTS.md

# airpass-strategic-agent

에어패스 마케팅팀이 네이버 키워드광고·블로그 경쟁사 모니터링 결과를 확인하는 웹 대시보드로
시작해 회사 전반 업무 도구로 확장된 대시보드(옛 저장소명 `airpass-naver-dashboard`).
데이터를 직접 수집하지 않는다 — 별도 저장소 `airpass-naver-monitor`(모니터링 에이전트, cron으로 매일 실행)가
같은 Supabase 프로젝트에 `service_role` 키로 데이터를 채워 넣고, 이 앱은 읽기 전용으로 보여준다.

## 스택

- Next.js 16 (App Router, TypeScript, Tailwind CSS v4)
- Supabase: `@supabase/supabase-js` + `@supabase/ssr`
- Recharts (차트)
- `googleapis`(구글드라이브 자료 목록/공유 링크) + `nodemailer`(자료메일발송, SMTP 직접 로그인)
- Vercel 배포
- 폰트: Pretendard로 전면 통일(2026-09-08, `next/font/google` 미사용 원칙은 그대로
  유지 — `app/globals.css` 최상단 `@import url("https://cdn.jsdelivr.net/gh/orioncactus/pretendard@...")`처럼
  브라우저가 페이지 로드 시점에 받아오는 방식이라 빌드 타임 네트워크 의존이
  없음). 이전엔 `globals.css`의 시스템 폰트 스택과 `industryTheme.css`의
  Barlow/Barlow Condensed(구글 폰트)가 화면별로 나뉘어 쓰였는데, Barlow는 한글
  글리프가 없어 한글 텍스트가 전부 OS 기본 한글 폰트로 폴백되면서 컴퓨터마다
  다르게 보이고, "41,781,440원"처럼 숫자(Barlow)와 옆 한글 단위(OS 폰트) 사이에도
  서체가 갈리는 문제가 있었다(사용자 실측 확인) — Pretendard(한글·라틴·숫자를
  한 세트로 그린 폰트)로 통일해 해결했다. `industryTheme.css`의
  `--font-heading`/`--font-body`는 이제 `var(--font-sans)`를 그대로 참조한다
  (Barlow Condensed 같은 "폭이 좁은" 변형은 Pretendard에 없어 제목이 예전보다
  덜 촘촘해 보일 수 있음, 트레이드오프로 감수). `components/dashboardSidebarTheme.css`도
  같은 이유로 Pretendard로 맞췄다. `lib/materialEmailTemplate.ts`(고객에게 나가는
  이메일 본문 HTML)는 수신자의 메일 클라이언트가 렌더링하는 별개 영역이라 이
  변경 대상에서 제외했다(그대로 Barlow 가정 유지).

## 인증 설계

- 이메일 + 비밀번호만 지원 (매직링크 없음). 공개 회원가입 없음 — 계정 생성은 `/dashboard/admin`에서
  관리자가 직접 등록하는 경로 하나뿐.
- 흐름(2026-08-29부터, 이메일 초대 방식에서 변경): 관리자가 `/dashboard/admin`에서 이름·직함·
  회사메일·구글메일을 입력해 "등록" → `registerUser`(`app/dashboard/admin/actions.ts`)가
  `admin.auth.admin.createUser({ email, password: 고정 기본값, email_confirm: true })`로 즉시
  로그인 가능한 계정을 만든다(메일 발송·링크 클릭 없음). 모든 신규 계정의 초기 비밀번호는
  `"Airpass1511!"`로 고정이고, 로그인 후 헤더 개인 메뉴 "비밀번호 변경"에서 각자 바꾼다.
  `/auth/callback`/`/auth/set-password`는 이제 신규 가입 경로가 아니라 **비밀번호 재설정**
  (`/auth/forgot-password` → 재설정 메일 링크 → `/auth/callback` → `/auth/set-password`)
  전용으로만 쓰인다.
- `proxy.ts`(Next 16 컨벤션, 구 `middleware.ts`)가 모든 요청에서 세션을 갱신하고, 로그인하지 않은
  사용자를 `/login`으로 리다이렉트한다(공개 경로: `/login`, `/auth/*`).
- `/dashboard/admin` 접근 권한(role='admin')은 proxy가 아니라 페이지 자체(`lib/supabase/authed.ts`의
  `requireAdminClient`)에서 DB를 조회해 확인한다 — proxy는 매 요청마다 실행되므로 낙관적 세션 체크만
  하고, DB 조회가 필요한 권한 체크는 페이지/Server Action에서 한다(Next.js 공식 auth 가이드 권장 패턴).
- 최초 관리자는 Supabase 대시보드에서 직접 만든 뒤 SQL로 수동 승격해야 한다(README 참고).

## DB 설계

- 스키마 단일 출처: `supabase/migrations/0001_init.sql`. 프로젝트 2(모니터링 에이전트)는 이 파일을
  그대로 참조만 하고 별도로 스키마를 정의하지 않는다.
- RLS: `authenticated` 세션은 모니터링 데이터 테이블에 SELECT만 가능. INSERT/UPDATE는 `service_role`
  키를 쓰는 프로젝트 2와, 이 앱의 관리자 등록 Server Action(`app/dashboard/admin/actions.ts::registerUser`,
  역시 `service_role` 사용)만 가능하다.
- 대시보드의 모든 조회는 `lib/queries/dashboard.ts::getLatestDataDate()`로 구한 "가장 최근 수집일"을
  기준으로 필터링한다 — 특정 날짜를 하드코딩하지 않는다.
- Supabase 테이블 타입(`lib/types/database.types.ts`)은 `interface`가 아니라 `type` 객체 리터럴로
  선언되어 있다(`interface`는 암묵적 인덱스 시그니처가 없어 Supabase 제네릭이 결과 타입을 `never`로
  추론하는 문제가 있음). Supabase 프로젝트가 준비되면
  `npx supabase gen types typescript --project-id <ref> > lib/types/database.types.ts`로 교체 권장.
- PostgREST 임베디드 조인(`select("competitors(name)")`) 대신, `competitors`/`keywords`를 별도
  조회해 `Map`으로 JS 레벨 조인한다(`lib/queries/dashboard.ts`) — FK 관계 메타데이터 없이도 타입이
  안전하게 유지된다.
- `notifications`(팀 공유 알림 피드) + `notification_reads`(사용자별 읽음 상태). 유튜브업로드/
  광고비 부족은 `airpass-naver-monitor`가 매일 동기화 시 diff를 감지해
  service_role로 직접 삽입한다(`scripts/lib/supabase-sync.ts`의 `diffNewYoutubeVideos` 등).
  광고전략메모 작성(`app/dashboard/memos/actions.ts`)과 조달입찰공고/사전규격 스크랩
  (`app/dashboard/actions/scraps.ts`)은 이 대시보드 자체가 authenticated 세션으로 직접
  삽입한다. 클라이언트는 `components/NotificationBell.tsx`에서 Supabase Realtime으로
  새 알림을 실시간 수신한다(0026 마이그레이션에서 `supabase_realtime` publication에 추가).

- `profiles`에는 authenticated용 self-update RLS 정책이 의도적으로 없다 — 같은 행의 `role`
  컬럼을 사용자가 스스로 admin으로 바꿔치기하지 못하게 막기 위함(`app/login/actions.ts`의
  `recordLogin` 주석 참고). 그래서 로그인 기록 갱신, 회원정보 수정
  (`app/dashboard/actions/profile.ts::updateOwnProfile`) 모두 세션 클라이언트로 "본인이 맞는지"만
  확인한 뒤 `createAdminClient()`(service_role)로 필요한 컬럼만 골라 갱신한다. 회원정보 수정은
  `title`/`google_email` 두 컬럼만 건드리고 `role`/`email`/`name`은 절대 쓰지 않는다.
- `profiles.google_email`(2026-08-29 추가) — 로그인/회사 이메일(`email`)과 별개로, 회원정보
  수정 화면(`/dashboard/account/profile`)에서 본인이 참고용으로 입력하는 개인 구글 이메일.

## 자료메일발송

`/dashboard/material-email` — 구글드라이브 공유 자료 폴더에서 파일을 골라 안내 문구와 함께
이메일로 보낸다. 두 외부 서비스를 쓴다(둘 다 이 앱에 처음 추가된 연동, 2026-08-23):

화면(폼·발송 이력 목록) 자체는 Business/Cooperation/Marketing 등과 같은 Claude Design
"Industry" 테마로 그 자리에서 다시 그렸다(2026-08-29) — 아래 설명하는 발송 메일 본문
HTML 템플릿(`buildMaterialEmailHtml`)과는 완전히 별개다(그건 안 바뀜, 받는 사람이 보는
이메일 자체의 디자인). 데이터·서버 액션(`app/dashboard/actions/materialEmail.ts`)도 그대로.

- **구글드라이브**(`lib/googleDriveMaterials.ts`): 서비스 계정(JWT) 인증으로 `GOOGLE_DRIVE_MATERIALS_FOLDER_ID`
  폴더 바로 아래 파일 목록만 조회한다(하위 폴더 재귀 탐색은 안 함). 서비스 계정은 폴더에
  **"편집자" 이상**으로 공유돼 있어야 한다 — "뷰어"로는 발송 직전 `ensureFileShared()`가
  개별 파일에 "링크가 있는 모든 사용자" 권한을 부여하지 못해 403으로 실패한다.
- **메일 발송**(`lib/materialEmail.ts`, `nodemailer`): 이메일 API(Resend 등) 대신 실제 회사
  메일 계정(현재 하이웍스, `smtps.hiworks.com:465`)에 SMTP로 직접 로그인해서 그 이름으로
  보낸다 — 도메인 인증(DNS)이 필요 없는 대신, `MATERIAL_EMAIL_SMTP_PASSWORD`에 그 계정의
  실제 로그인 비밀번호를 그대로 저장한다(하이웍스는 앱 전용 비밀번호가 없음, 사용자 확인
  2026-08-23 — Resend 대비 "발송 전용" 권한 분리가 안 된다는 트레이드오프를 감안하고 선택).
  자료를 이메일에 실제로 첨부하지 않고, 위 공유 링크를 본문에 나열해서 보낸다(용량 제한
  회피 — 이메일 첨부는 보통 20~40MB 상한이라 카탈로그·영상류 자료가 실패할 수 있음). 다른
  메일 서비스로 바꾸려면 `MATERIAL_EMAIL_SMTP_HOST`/`PORT`만 교체하면 된다.
- Supabase 기본 메일(인증 전용, 시간당 발송량 극히 제한적)과는 무관한 별도 경로다 — 자세한
  제약은 이 대화의 이전 답변 참고, 필요하면 다시 물어보면 됨.
- 발송 이력은 `material_email_logs`(0040)에 팀 전체가 볼 수 있게 남긴다(감사 추적용,
  `business_projects_v2` 히스토리와 같은 취지) — 누가/언제/누구에게/무슨 자료를 보냈는지.
- 두 서비스 중 하나라도 환경변수가 비어 있으면 폼 대신 설정 안내 배너를 보여준다
  (`isGoogleDriveConfigured`/`isMaterialEmailConfigured`).
- 메일 본문 HTML은 사용자가 Claude Design으로 만든 템플릿을 그대로 이식했다(`lib/materialEmailTemplate.ts::buildMaterialEmailHtml`,
  2026-08-28). I/O가 전혀 없는 순수 함수라 서버(실제 발송)와 클라이언트(미리보기, `MaterialEmailForm.tsx`의
  iframe `srcDoc`) 양쪽에서 그대로 재사용한다 — 미리보기는 구글드라이브 실 링크 생성 API를
  호출하지 않으려고 자리표시 링크(`#`)를 쓰고, 실제 발송(`app/dashboard/actions/materialEmail.ts`)
  시점에만 `ensureFileShared`로 진짜 공유 링크를 만든다.
  - **산출내역(견적) 첨부**: 화면에서 저장된 산출내역을 검색해 최대 1건 연결하면(`quotations.id`,
    `material_email_logs.quotation_id`/`quotation_quote_number`로 이력에 남김), "견적 및 제품자료
    안내" 섹션(제목·하이라이트 박스·3개 서비스 안내 카드)이 통째로 나타나고, 하이라이트 박스에
    산출내역 인쇄용 페이지 절대 URL이 담긴 버튼이 있다. 첨부하지 않으면 이 섹션 자체가 아예
    빠진다(`quotationSectionHtml`이 빈 문자열을 반환) — 2026-08-30엔 3개 카드가 특정 견적과
    무관한 일반 서비스 안내라는 이유로 "첨부 안 해도 섹션은 항상 노출, 박스만 '견적내용이
    없습니다.'로 대체"했었는데, 빈 박스만 뜨는 게 오히려 어색하다는 피드백으로 2026-09-03
    원래(섹션째 숨김) 방식으로 되돌렸다. 절대 URL은 `next/headers`의 요청 host로 만든다(별도
    SITE_URL 환경변수 없이 어느 배포에서도 맞는 링크가 나오게).
  - **"회사 및 제품소개 자료" 7개 링크**: `PRODUCT_MATERIAL_CATALOG`(고정 이름 목록)가 자료
    폴더 파일명과 키워드로 매칭되면 그 파일의 실제 공유 링크를 넣고, 못 찾으면 그 항목은 메일에서
    빠진다(가짜 링크를 만들지 않음) — 파일을 폴더에 추가/이름 변경하면 코드 수정 없이 바로 반영된다.
  - **발신자 서명(하단 박스)**: 이름·직함·이메일은 예전부터 로그인한 사용자의 `profiles`
    값이었고(`name`/`title`/`email`), 2026-08-30부터 `profiles.phone`(핸드폰번호)이 있으면
    "M. {phone} · T. {회사 대표번호}" 형태로 개인 번호도 함께 보여준다(없으면 회사 대표번호만,
    `lib/quotationCompany.ts::QUOTATION_SUPPLIER.phone`은 그대로 고정값).
  - **메일 하단 푸터(홈페이지·유튜브·회사주소)**: 원래 템플릿에 하드코딩돼 있었는데,
    발송할 때마다 고칠 수 있어야 한다는 요청(2026-09-14)으로 발송 폼 입력란으로 뺐다
    (기본값은 `lib/materialEmailDefaults.ts`의 `DEFAULT_MATERIAL_EMAIL_HOMEPAGE`/
    `_YOUTUBE`/`_ADDRESS` — 평소엔 손대지 않으면 예전과 같은 메일이 나간다). 회사주소
    줄은 이때 새로 추가했다. `buildMaterialEmailHtml`의 세 파라미터는 선택값이라
    안 넘기면 기본값을 쓴다 — AI 자동발송과 발송 이력 "보낸 메일 보기" 미리보기는
    푸터를 따로 저장하지 않아(로그 컬럼 없음) 항상 기본값으로 다시 그려진다(발신자
    서명·제품자료 링크를 지금 시점으로 다시 만드는 것과 같은 한계).

## 첨부파일 저장소 (제조사 서류 / Work Journal / Memo Board)

세 기능(`vendor_documents`, `work_journal_attachments`, `ad_strategy_memo_attachments`)의
첨부파일은 원래 전부 Supabase Storage에 올라갔는데, Work Journal에 임시로 대량 업로드된
파일 때문에 Storage 용량(무료 한도)이 초과돼(2026-09-02) 회사 공용 구글드라이브로
전환했다 — `lib/googleDriveAttachments.ts`가 `GOOGLE_DRIVE_ATTACHMENTS_ROOT_FOLDER_ID`
루트 폴더 아래 서비스별 하위 폴더("Work Journal"/"Memo Board"/"제조사 관리")에 업로드·삭제한다.

- **서비스 계정이 아니라 실제 계정 OAuth로 인증한다(2026-09-03 확정)**: 처음엔 자료메일발송
  (`lib/googleDriveMaterials.ts`)과 같은 서비스 계정으로 시도했는데, **구글 서비스 계정은
  자체 저장용량이 0이라 파일 생성(쓰기)이 `storageQuotaExceeded`로 원천 차단된다**(읽기·
  공유만 가능 — 자료메일발송은 기존 파일을 읽기만 해서 이 문제가 안 보였다). 그래서 실제
  구글 계정(`airpass.ai@gmail.com`)의 OAuth 연결로 바꿨다 — `google_drive_upload_connection`
  (0055, RLS 정책 없음·`service_role`만 접근 가능한 싱글턴 테이블, 회사 전체가 공유하는
  연결 하나뿐)에 refresh_token을 저장하고, 업로드 용량은 그 계정의 개인 구글 드라이브
  용량(무료 15GB)을 그대로 쓴다. 연결은 `/dashboard/admin`의 "첨부파일 업로드용
  구글드라이브 연결" 카드에서 관리자만 할 수 있다(`app/auth/google-drive-upload/{connect,callback}`,
  개인 Google 캘린더 연동과 같은 OAuth 코드 패턴이지만 사용자별이 아니라 회사 전체가
  공유하는 연결이라는 점이 다르다 — 같은 OAuth 클라이언트 자격증명
  `GOOGLE_CALENDAR_CLIENT_ID`/`SECRET`을 재사용하되 scope만 `drive`로 다르게 요청한다).
  `isGoogleDriveAttachmentsConfigured()`는 이제 DB를 조회해야 해서(연결 존재 여부) 비동기
  함수다 — 예전(동기 상수) 코드를 참고하지 말 것.
- **하위 호환(무마이그레이션)**: 세 테이블 모두 `storage_path`를 nullable로 바꾸고
  `drive_file_id`를 추가했다(0054) — 기존에 이미 올라간 파일은 손대지 않고 그대로
  `storage_path`/Supabase signed URL로 계속 열람되고, 루트 폴더 환경변수가 설정되고
  구글드라이브 계정이 연결된 시점 이후 새로 올리는 파일만 `drive_file_id`를 쓴다. 한
  행에는 둘 중 하나만 채워진다 — 조회/삭제 코드는 항상 `drive_file_id` 유무로 분기한다.
  둘 중 하나라도 안 갖춰지면 예전처럼 Supabase Storage 업로드로 자동 폴백한다.
- 구글드라이브 파일은 업로드 시 "링크가 있는 모든 사용자" 읽기 권한을 한 번만 부여하면
  이후 만료되지 않는 고정 URL(`driveFileViewUrl`)로 바로 열람된다 — Supabase Storage의
  signed URL(TTL 있음, 조회마다 API 호출 필요)과 달리 개별 조회 시점의 API 호출이 없다.
  Work Journal의 `getWorkJournalAttachmentUrls()` 반환 키는 이 전환으로 `storage_path`
  대신 첨부파일 `id`로 통일했다(구글드라이브 첨부는 `storage_path`가 없어서).
- **다시 Supabase Storage가 기본(2026-09-07)**: Supabase를 유료 플랜으로 전환해
  스토리지 용량이 100GB로 늘어나면서 구글드라이브로 옮길 이유가 없어져,
  `GOOGLE_DRIVE_ATTACHMENTS_ROOT_FOLDER_ID`를 비워 `isGoogleDriveAttachmentsConfigured()`가
  다시 false를 반환하게 했다 — 코드는 손대지 않고 환경변수만 비웠다(나중에 용량
  문제가 재발하면 값을 다시 채우고 관리자 페이지에서 구글드라이브 계정만 재연결하면
  됨, OAuth 연결 인프라 자체는 그대로 남겨둠). 이 시점에 구글드라이브에 남아있던
  기존 첨부파일 전부(당시 Work Journal 1건뿐)를 실제로 다운로드해 Supabase
  Storage로 옮기고 `storage_path`를 채우고 `drive_file_id`를 지웠다.
  - **이 작업 중 발견한 버그**: Storage 오브젝트 키에 한글(비ASCII) 문자가 들어가면
    Supabase Storage가 `"Invalid key"`로 거부한다는 걸 실측으로 확인했다 —
    `encodeURIComponent`로 퍼센트 인코딩해도 소용없다(클라이언트/백엔드가 다시
    디코딩한 뒤 검사해서 원래 문자로 돌아옴). 구글드라이브가 기본이던 동안은 한글
    파일명이 전부 Drive로만 갔기 때문에 이 버그가 안 드러났었다. `lib/storageKey.ts::safeStorageFileName()`로
    수정 — Storage 키에는 원본 파일명 대신 확장자만 살린 `randomUUID()`를 쓰고,
    사람이 보는 원본 파일명은 항상 DB 컬럼(`file_name`/`original_name`)에서만
    가져온다. Work Journal/Memo Board/제조사 관리/히스토리 첨부 전부(`app/dashboard/actions/workJournal.ts`,
    `app/dashboard/memos/actions.ts`, `app/dashboard/actions/vendors.ts`,
    `lib/historyAttachments.ts`)가 이 함수를 쓴다.

## 산출내역 관리

`/dashboard/quotations` — WHIZZUP 레퍼런스 사이트의 견적서 기능을 참고해 핵심만 이식했다
(2026-08-27, 화면 워딩은 2026-08-28에 "견적서"에서 "산출내역"으로 전면 변경 — 코드의
파일명·라우트·테이블명·타입명은 `quotation*` 그대로 유지하고 사용자에게 보이는 문구만 바꿨다).
리비전 이력·정산조정·컨소시엄·내부원가·마진 추적·조달채널·구글드라이브 동기화 등 WHIZZUP
고유 영업 프로세스는 전부 제외 — 품목·금액 자동계산·인쇄용 출력만 다룬다.

작성·관리 화면(`components/dashboard/QuotationBoard.tsx`)은 Business 등과 같은 Claude Design
"Industry" 테마로 재구성했다(2026-08-29, 드래그 정렬·연결 사업 검색 등 기존 기능은 전부
그대로). **`/dashboard/quotations/[id]/print`(인쇄용 화면)와 `app/quote/[id]`(고객 공개
페이지)는 이 대상에서 제외** — 고객에게 실제로 나가는 문서라 내부 도구용 테마를 입히지
않고 원래 배색(레터헤드 등)을 그대로 유지한다. `QuotationBoard.tsx` 안의 산출내역 편집
폼 상단 레터헤드 바(`#262b3a`)도 같은 이유로 Industry 색이 아니라 인쇄본과 같은 고정
색을 그대로 쓴다(인쇄 미리보기 역할).

- `quotations`(0043) 테이블 하나로 관리한다. 품목(`items`)은 산출내역과 항상 통째로 함께
  편집되는 종속 데이터라 별도 테이블 대신 jsonb 배열로 저장한다(WHIZZUP의 `items_json`과
  동일한 접근 — `lib/queries/quotations.ts`가 파싱/직렬화).
- 품목은 제품 카탈로그(`product_catalog`)에서 선택하면 품명·규격·단가를 자동으로 채우거나,
  직접 입력도 가능하다. 금액(공급가액/부가세/합계)은 클라이언트가 계산한 값을 신뢰하지 않고
  서버 액션(`app/dashboard/actions/quotations.ts`)에서 다시 계산해 저장한다.
- 산출번호는 `Q-YYYYMMDD-순번` 형식으로 같은 날짜 발급 건수를 세어 자동 생성한다
  (`generateQuoteNumber`) — 팀 규모상 동시 등록 충돌 가능성은 낮다고 보고 재시도 로직은
  두지 않았다(충돌 시 다시 저장하면 됨).
- 인쇄는 서버측 PDF 생성 없이 `/dashboard/quotations/[id]/print` 전용 페이지 +
  `window.print()` 방식이다. 헤더·사이드바·AI 명령창은 Tailwind `print:hidden`으로 인쇄 시
  숨긴다.
- 공급자(에어패스) 정보는 `lib/quotationCompany.ts`에 고정값으로 넣어뒀다(사업자등록번호
  ·대표자·주소 — WHIZZUP이 에어패스 제품 견적을 대행 발급할 때 쓰던 실제 등록 정보를
  그대로 재사용, 주소·전화번호·팩스번호·업태·종목은 2026-09-07 사용자 제공 최신 정보로
  갱신). 직인(도장) 포함 옵션은 실제 도장 이미지(`public/quotation-stamp.png`, 2026-09-07
  반영)를 작성/인쇄 화면 모두에 표시한다 — 이전엔 이미지가 없어 원형 텍스트("인")로만
  표시했었다.
- SI Business(`business_projects_v2`) 프로젝트와 `business_project_id`(0046)로 연결할 수
  있다 — 산출내역 작성 화면에서 프로젝트를 검색해 고르면, 그 프로젝트 상세 화면의
  "연결된 산출내역" 섹션에서도 조회된다.
- **고객 공유용 공개 인쇄 페이지**: `app/quote/[id]`(`/dashboard` 바깥, `proxy.ts`
  PUBLIC_PATHS에 `/quote` 등록) — 자료메일발송이 보내는 링크는 로그인 안 된 고객이
  여는 것이라 사이드바·헤더 없이 문서만 보이고, "인쇄"/"PDF 다운로드"(둘 다
  `window.print()`) 버튼만 뜬다. RLS를 anon까지 열어주는 대신 이 서버 컴포넌트에서만
  `createAdminClient()`(service_role)로 id 하나만 조회한다 — 구글드라이브 공유
  링크와 같은 "UUID를 아는 사람만 접근" 모델(사용자 확인, 2026-08-28). 내부 직원용
  `/dashboard/quotations/[id]/print`(로그인 필요, 인쇄 버튼 하나만)는 그대로 유지하고
  SI Business 프로젝트 상세의 "인쇄" 링크는 계속 이쪽을 가리킨다 — 다만 이 경로는
  `app/dashboard/layout.tsx` 안에 있어서 평범하게 새 탭으로 열면 헤더·사이드바까지
  같이 보인다(실제 인쇄할 때만 `print:hidden`으로 가려짐). **산출내역 목록의 "인쇄"
  버튼만은 예외**: "팝업으로 견적서만 나오게 해달라"는 요청(2026-09-08)에 맞춰
  헤더·사이드바가 아예 없는 `/quote/[id]`를 `window.open(...,"popup,width=...")`으로
  진짜 팝업 창으로 띄우도록 바꿨다(`QuotationBoard.tsx::openQuotationPopup`) — 내부
  직원이 봐도 어차피 같은 문서라 공개 페이지를 재사용해도 무방하다고 판단.

## 마케팅분석 (네이버키워드/네이버블로그/유튜브채널분석)

`/dashboard/keywords`, `/dashboard/blog`, `/dashboard/youtube` — Business 등과 같은
Claude Design "Industry" 테마로 그 자리에서 다시 그렸다(2026-08-29). 다른 화면과
달리 차트(recharts)가 많은 데이터 분석 화면이라 색상 처리에 원칙을 하나 더
뒀다: **카테고리·지표를 구분하는 게 목적인 다색 배색은 그대로 유지**하고
(`HotKeywordTreemap.tsx`의 트리맵 10색, `SovTrendChart.tsx`의 채널별 선 색,
`AdAccountStatsPanel.tsx`/`YoutubeChannelStats.tsx`의 지표별 KPI 카드·라인 색),
카드·표·버튼·탭 같은 화면 크롬만 Industry 스타일(`.card`/`.table`/`.btn`/
`color-mix(...)` 텍스트 톤)로 통일했다 — 전부 단색 accent로 바꾸면 여러 선·구간을
구분할 수 없게 되기 때문(Calendar의 `TAG_DOT_COLORS`를 그대로 유지한 것과 같은
이유). 단일 계열 차트(`RankTrendChart.tsx`)는 accent 색으로 바꿨다.
데이터·서버 액션·recharts 차트 로직은 전부 그대로 유지.

## SI Business 2

`/dashboard/business`(사이드바 라벨은 "SI Business 2") — 기존 SI Business
(`/dashboard/business2`)와 **완전히 같은 `business_projects_v2` 데이터·서버
액션**(`app/dashboard/actions/businessProjectsV2.ts`)을 쓰는 또 하나의 화면이다.
별도 사업 목록이 아니다 — 어느 쪽에서 추가·수정·삭제해도 두 화면 모두 갱신된다
(액션마다 `/dashboard/business2`와 `/dashboard/business`를 함께
`revalidatePath`). 사용자가 Claude Design으로 만든 "Industry"(철강청사진
와이어프레임: 스틸블루 단색 악센트, 사각 모서리 + "+" 등록마크가 있는 카드·버튼,
Barlow/Barlow Condensed) 테마를 그대로 이식했다(2026-08-28).

- `components/dashboard/IndustryBusinessBoard.tsx` — 새 컴포넌트 트리(칸반 드래그
  앤드롭, 리스트 뷰, 추가 다이얼로그, 상세/수정 화면, 연결된 산출내역·히스토리·댓글).
  기존 `BusinessBoardV2.tsx`와 기능은 동일하지만 마크업·클래스는 전부 새로 짰다 —
  두 컴포넌트 사이에 공유 코드가 없다(디자인이 근본적으로 달라 억지로 합치면 둘 다
  지저분해진다고 판단).
- `components/industryTheme.css` — Claude Design이 내보낸 `styles.css`(디자인
  토큰 + 컴포넌트 클래스)를 그대로 옮기되, 모든 셀렉터를 `.industry-theme`
  아래로 스코프했다 — 원본은 `body`/`h1`처럼 전역 셀렉터를 쓰는 진짜 전역
  스타일시트라, 스코프하지 않으면 이 페이지 바깥의 Tailwind 화면까지 깨진다.
  이 테마를 쓰는 각 `page.tsx`가 이 CSS를 라우트 단위로 import하고, 최상위
  컨테이너에 `.industry-theme` 클래스를 건다 — Calendar(`/dashboard/calendar`)도
  같은 파일을 공유해서 쓴다(아래 참고).
- 칸반 단계 이동은 마우스 드래그(HTML5 `draggable`)로 컬럼 사이를 옮기는 방식과
  카드 안 `<select>` 두 가지를 모두 지원한다(디자인 원본에 둘 다 있었음).
- 담당자 다중 선택은 `MemberMultiSelect`(Tailwind 톤) 대신 이 테마 전용
  `ManagerChips`로 새로 짰다 — 색이 섞이면 통일된 룩이 깨지기 때문.

## Cooperation / Marketing

`/dashboard/cooperation`, `/dashboard/marketing-tasks` — SI Business 2와 같은
Claude Design "Industry" 테마를 그대로 적용했다(2026-08-29). SI Business 2와
달리 이 두 화면은 **그 자리에서 다시 그린 것**이다(새 메뉴를 따로 만들지
않음, Calendar와 동일한 방식) — 데이터·서버 액션(`app/dashboard/actions/
cooperationProjects.ts`, `app/dashboard/actions/marketingTasks.ts`)은 그대로
두고 컴포넌트만 `IndustryCooperationBoard.tsx`/`IndustryMarketingBoard.tsx`로
새로 짰다. 옛 `CooperationBoard.tsx`/`MarketingTaskBoard.tsx`는 삭제됨.

- 칸반 컬럼 기준이 Business의 "단계"(순서가 있는 파이프라인)와 달리 각각
  "관계"(Cooperation)·"분류"(Marketing)라는 태그성 값이라 순서 개념이 없다 —
  컬럼 배지 문자는 라벨의 첫 글자를 그대로 쓴다(Business의 로마숫자 배지와
  같은 `codeOf` 방식을 재사용, 값만 다름).
- Cooperation은 담당자가 메인/서브 두 그룹(`mainAssignees`/`subAssignees`)이라
  `ManagerChips`를 두 번 렌더링한다. Marketing은 산출내역 연결 같은 기능이
  없어 `ConnectedQuotations` 상당 컴포넌트를 아예 만들지 않았다.
- 상단 환경설정 바(`TopSettingsBar`, showArchivedDefault/defaultView/Reset/
  Save as defaults)도 SI Business 2와 동일하게 구현했다 — 저장 키만 화면별로
  다르다(`cooperation-board:defaults`, `marketing-board:defaults`).

### 히스토리 첨부파일

SI Business 2/Cooperation/Marketing 세 보드의 "히스토리" 입력 폼에 파일 첨부
기능을 추가했다(2026-09-06). 세 보드의 히스토리 테이블(`business_projects_v2_history`/
`cooperation_projects_history`/`marketing_tasks_history`)이 구조적으로 완전히
동일해서(0058), 파일 검증·업로드·URL 해석 공용 로직을 `lib/historyAttachments.ts`
하나로 모으고 세 보드의 서버 액션(`create*HistoryEntry`)이 각자 자기 첨부파일
테이블(`*_history_attachments`, `history_id` FK로 각자 히스토리 테이블을
가리킴 — 폴리모픽 단일 테이블 대신 3개로 나눠 cascade delete가 자연스럽게
동작하게 함)에 insert만 따로 한다. `lib/googleDriveAttachments.ts`의
`AttachmentService`에 `business`/`cooperation`/`marketing`을 추가해 구글드라이브
루트 폴더 아래 "SI Business"/"Cooperation"/"Marketing" 하위 폴더에 올라간다
(미설정 시 세 보드가 공유하는 Supabase Storage 버킷 `history-attachments`로
폴백). 조회 시 URL을 **쿼리 함수 안에서 미리 다 만들어 둔다**(Work
Journal처럼 카드를 펼칠 때 별도 액션으로 지연 로딩하지 않음) — 구글드라이브
링크는 API 호출 없이 고정 URL이라 즉시 만들 수 있고, Storage 폴백만 signed
URL 발급이 필요한데 그마저도 새 첨부는 거의 다 드라이브를 쓰므로 실제로는
드문 경우라 미리 만들어도 부담이 없다고 판단했다. 히스토리는 삭제 기능
자체가 없어 첨부파일 삭제 로직도 만들지 않았다(추가만 가능).

## Work Journal

`/dashboard/work-journal` — Cooperation/Marketing과 같은 방식으로 Claude Design
"Industry" 테마를 그 자리에서 적용했다(2026-08-29, 새 메뉴 아님). 데이터·서버
액션(`app/dashboard/actions/workJournal.ts`)은 그대로 두고
`IndustryWorkJournalBoard.tsx`로 화면만 새로 짰다. 옛 `WorkJournalBoard.tsx`는
삭제됨.

- 목업은 내용 중 `**굵게**`/`~~취소선~~`/`- [x] ` 같은 가벼운 마크다운을
  렌더링 단계에서 해석해 보여준다 — 저장되는 `content`는 여전히 평문이고,
  화면에 그릴 때만 `tokenizeLine()`으로 해석한다(데이터 마이그레이션 없음).
- 첨부파일은 목업과 달리 즉시 URL을 만들지 않는다 — 목록 조회 시 signed URL을
  전부 만들면 느려지므로, 카드를 펼치고 "첨부파일 N개 보기"를 눌렀을 때만
  `getWorkJournalAttachmentUrls()`로 그 항목의 URL만 받아온다(기존 동작 그대로
  유지, 이미지 파일은 썸네일 미리보기).
- 작성자 필터는 목업의 라디오형 `.seg`를 그대로 재사용했고, 새 일지 작성/수정
  폼은 모달이 아니라 목업처럼 목록 위에 인라인 카드로 펼쳐진다.
- 기존 `WorkJournalBoard.tsx`에는 폼 저장 실패 시에도 무조건 폼을 닫는
  버그(`onDone()`을 항상 호출)가 있었다 — 다시 그리면서 다른 Industry 화면과
  같은 `wasPendingRef` + `useEffect` 패턴으로 함께 고쳤다.
- 상단 통합 AI 입력창(`AiCommandBar.tsx`)에서도 일지를 기록할 수 있다
  (2026-08-30 추가) — 작성자는 AI가 추출하지 않고 항상 로그인한 사용자
  본인으로 자동 지정한다(`DashboardHeader.tsx`가 넘기는 `currentUserName`
  prop). 주차 라벨도 수동 폼과 동일하게 `weekLabelFromDate()`로 날짜에서
  자동 생성한다.

## Calendar

`/dashboard/calendar` — 사용자가 Claude Design으로 만든 "Industry" 테마
캘린더 목업을 그대로 이식했다(2026-08-29, SI Business 2와 같은 디자인
시스템 — `components/industryTheme.css` 공유). SI Business 2와 달리 이건
**같은 화면을 그 자리에서 다시 그린 것**이다(새 메뉴를 따로 만들지 않음) —
기존 `team_events_v2` 데이터·서버 액션(`app/dashboard/actions/eventsV2.ts`)은
그대로 두고 화면(`components/dashboard/IndustryEventCalendar.tsx`)만 새로
짰다. 옛 `TeamEventCalendarV2.tsx`/`EventMonthNav.tsx`는 삭제됨.

- 디자인 목업은 월/주/일 세 가지 보기를 지원하는데, 기존 화면은 월 보기만
  있었다 — 주/일 보기를 새로 추가하면서 월 단위로만 데이터를 불러오는 기존
  구조(`getTeamEventsV2(supabase, month)`)는 그대로 뒀다. 주/일 보기에서
  이동하다 달 경계를 넘으면 URL의 `month`뿐 아니라 정확한 날짜를 가리키는
  `day` 파라미터도 함께 갱신해서, 새로 불러온 달의 데이터에서 그 날짜부터
  다시 보여준다(`IndustryEventCalendar.tsx`의 `navigateTo`).
- 디자인 목업은 태그(분류)가 고정 4종(시공/설치·미팅/방문·예정·기타)이지만,
  실제 데이터는 자유 텍스트 태그가 14종 이상 쓰이고 있어(회식/미팅/행사/휴일 등)
  4종으로 줄이면 정보가 손실된다 — 목업의 "점 하나로 분류 표시" 방식은 그대로
  따르되, 점 색은 기존 `TeamEventCalendarV2`의 태그별 Tailwind 색 매핑을 hex
  값으로 옮긴 `TAG_DOT_COLORS`를 그대로 재사용한다.
- 일정의 나머지 필드(종료일시로 여러 날 걸치는 일정, 시간 유무, 담당자·참석자,
  장소·대상·내용)는 목업에 없던 것들이지만 실제 운영에 쓰이고 있어 그대로
  유지했다 — 다이얼로그에 전부 남아 있다.
- 상단에 SI Business 2/Cooperation/Marketing/Work Journal과 같은 "환경설정
  바"를 추가했다(2026-08-29) — "defaultView"(month/week/day)에 더해
  "showGoogleEventsDefault" 토글(완료·보류 토글과 같은 자리)도 저장한다
  (`localStorage` 키 `calendar:defaults`). 이 토글을 끄면 연결된 구글 캘린더가
  있어도 일정을 화면에서만 안 보여준다(연결 자체는 유지 — `GoogleCalendarControl`의
  연결/해제와는 별개). Reset은 하드코딩된 기본값(month, 노출 켬)으로 되돌린다.

## 개인 Google 캘린더 연동

로그인한 사용자가 자기 구글 캘린더를 연결하면, **그 사람이 로그인했을 때만**
자기 구글 일정이 Calendar 화면에 함께 보인다(2026-08-29). `profiles.google_email`
(자기소개용 텍스트 필드, 회원정보 수정 화면)과는 완전히 별개다 — 실제 일정을
읽어오려면 OAuth 동의를 받아 발급되는 access/refresh token이 필요해서, 이
기능은 새 테이블 `google_calendar_connections`에 토큰을 저장하는 방식으로
따로 구현했다.

- **OAuth 흐름**: Calendar 화면의 "구글 캘린더 연결" 버튼(`GoogleCalendarControl`,
  `IndustryEventCalendar.tsx`) → `GET /auth/google-calendar/connect`(CSRF
  방지용 state를 쿠키에 저장하고 구글 동의 화면으로 리다이렉트) → 사용자 동의 →
  `GET /auth/google-calendar/callback`(state 검증 → code를 access/refresh
  token으로 교환 → `google_calendar_connections`에 upsert) → Calendar로 복귀.
  범위는 `calendar.readonly` + `openid`/`email`(연결된 계정 표시용)만 요청 —
  구글 쪽에 쓰기(일정 등록 등)는 하지 않는다.
- **토큰 갱신**: `lib/queries/googleCalendar.ts::getMyGoogleCalendarEvents()`가
  매번 access_token 만료(또는 만료 임박)를 확인해 필요하면 refresh_token으로
  새로 받고 DB 캐시도 같이 갱신한다. 구글 쪽 요청이 실패해도 조용히 빈
  배열을 돌려준다 — 이 기능 실패가 Calendar 화면 전체를 막으면 안 되기 때문.
- **개인정보 격리**: `app/dashboard/calendar/page.tsx`가 항상 **요청을 보낸
  본인의 `user.id`**로만 연결/일정을 조회한다 — 다른 사람 화면에는 절대
  섞이지 않는다(서버 컴포넌트가 매 요청마다 그 세션의 사용자로만 조회하는
  구조라 자연히 보장됨, 별도 격리 로직 불필요).
- **권한 모델**: `profiles.role`과 달리 이 테이블은 자기 행을 자기가
  연결/해제/재연결해도 문제될 게 없어(권한상승 위험 없음) `profiles`처럼
  admin(service_role) 클라이언트를 거치지 않고 RLS로 본인 행 CRUD를 바로
  허용한다(마이그레이션 0050).
- **화면 표시**: 팀 일정(`team_events_v2`)과 구글 일정을 시작 시각순으로 섞어
  보여주되(`dayItems()`), 구글 일정은 파란 점(`GOOGLE_DOT_COLOR`)으로
  구분하고 클릭하면 우리 수정 다이얼로그가 아니라 구글 캘린더 원본을 새 탭으로
  연다(우리 DB 데이터가 아니라 수정·삭제 불가).
- **필요한 환경변수**: `GOOGLE_CALENDAR_CLIENT_ID`/`GOOGLE_CALENDAR_CLIENT_SECRET`
  (Google Cloud Console에서 발급, `.env.example` 참고). 리디렉션 URI는
  `<도메인>/auth/google-calendar/callback`으로 등록해야 한다.
- **팀 일정 → 내 구글 캘린더 등록**(2026-08-29 확장): 스코프를 `calendar.readonly`
  에서 `calendar.events`(조회+쓰기 포함, Google Cloud Console OAuth 동의 화면의
  "데이터 액세스"에서 직접 교체)로 바꿔서, 일정 추가/수정 다이얼로그에
  "내 구글 캘린더에도 등록" 체크박스가 생겼다(`lib/googleCalendar/api.ts`의
  `insertGoogleCalendarEvent`/`updateGoogleCalendarEvent`/`deleteGoogleCalendarEvent`,
  `app/dashboard/actions/eventsV2.ts`에서 호출). `team_events_v2`는 팀 전체가
  공유하는 일정이라 "누가 자기 구글 캘린더에 연결했는지" 한 명만
  추적한다(`google_event_id`/`google_event_owner_id`, 마이그레이션 0051) — 여러
  사람이 각자 캘린더에 동시에 등록하는 것까지는 지원하지 않는다(과설계 방지).
  등록한 사람(owner)만 이후 수정 시 체크박스로 계속 동기화하거나 해제(구글
  이벤트 삭제)할 수 있고, 다른 사용자가 그 일정을 수정해도 owner가 아니면
  구글 쪽은 전혀 건드리지 않는다(남의 캘린더에 쓸 권한이 없으므로 — 다이얼로그에
  "다른 사용자가 연결해 둔 일정" 안내만 보여줌). 구글 API 호출 실패는(연결
  해제·토큰 만료 등) 조용히 콘솔에만 남기고 팀 일정 저장 자체는 그대로
  성공 처리한다(기존 조회 실패 처리와 같은 원칙).
- **신규 등록 3지선다**(2026-08-30): 새 일정 추가 다이얼로그의 체크박스를
  "캘린더"/"구글"/"캘린더+구글" 3지선다(`.seg`/`.seg-opt`)로 바꿨다
  (`app/dashboard/actions/eventsV2.ts::destinationFromForm`). "구글" 단독은
  `team_events_v2`에 아예 행을 안 만들고 요청자 개인 구글 캘린더에만
  등록한다 — 완전히 개인적인 일정을 팀 전체가 보는 목록에 채우고 싶지
  않을 때를 위함. 이 경우 담당자/참석자/태그/분류/대상 필드는 구글
  이벤트가 쓰지 않는 값이라 폼에서 통째로 숨긴다. 반대로 기존 일정
  수정 다이얼로그는 이미 team_events_v2 행이 있어 "구글 단독"으로
  전환할 개념이 없으므로 예전처럼 캘린더+구글 동기화 체크박스 하나만
  유지한다. 상단 통합 AI 입력창(`AiCommandBar.tsx`)도 같은 3지선다를
  쓴다 — `lib/aiCommand.ts`가 문장에 "구글"이 언급됐는지로
  `destination`(local/google/both)까지 함께 추출해 `createTeamEventV2`에
  그대로 넘긴다(언급 없으면 항상 local).

## 외부 캘린더 브리핑 API

`/dashboard/account/profile` 하단 "외부 연동 API 토큰"(2026-09-13) — Claude 등 외부
에이전트가 로그인 세션 없이 팀원 본인의 일정(개인 구글 캘린더 + 팀 캘린더
`team_events_v2`)을 읽어가 일정 브리핑 등에 쓸 수 있게 만든 공개 API. 사용자가
"클로드가 내 캘린더를 읽어서 브리핑에 쓰게 연결하고 싶다"고 요청해 추가했다 —
이미 있던 Claude.ai Google Calendar 커넥터로 개인 구글 캘린더 자체는 바로 읽을 수
있었지만, 이 앱에서만 관리하는 `team_events_v2`(팀 공유 일정)는 그 커넥터가 접근할
방법이 없어서 별도로 만들었다.

- **토큰**: `personal_api_tokens`(0074) — `google_calendar_connections`(0050)/
  `material_email_smtp_accounts`(0070)와 같은 이유로 admin(service_role) 없이
  세션 클라이언트 + self-row RLS로 본인 토큰만 발급/삭제한다. 다만 토큰 값 자체는
  그 두 테이블과 달리 평문 저장하지 않는다 — Authorization 헤더로 그대로
  흘러들어오는 "알면 그 사람 행세를 할 수 있는" 값이라 유출 시 위험도가 더
  크다고 판단해 sha256 해시(`token_hash`)만 저장하고, 평문은 발급 응답
  (`createApiToken`의 반환값)에 딱 한 번만 담아 화면에 보여준다(`components/
  ProfileForm.tsx::ApiTokenSection`) — 이후로는 DB에서도 복원 불가능, 목록에는
  `token_preview`(앞 10자 + 마지막 4자)만 남는다.
- **조회 API**: `GET /api/calendar-feed` (`app/api/calendar-feed/route.ts`) —
  `Authorization: Bearer <토큰>` 헤더로 인증한다. 세션 쿠키가 없는 서버-투-서버
  호출이라 `proxy.ts` PUBLIC_PATHS에 등록했고(다른 `/api/cron/*`·
  `/api/ai-review/ingest`와 같은 이유), 라우트 자체의 토큰 해시 조회가 진짜
  인증이다 — admin(service_role) 클라이언트로 `token_hash` 일치 행을 찾아
  `user_id`를 알아낸다(RLS로는 이 조회 자체가 애초에 불가능하므로 admin
  클라이언트가 유일한 방법).
  - 응답은 그 사용자의 `personalGoogleCalendar.events`(연결 안 돼 있으면 빈
    배열)와 `teamCalendar.events`(팀 전체 공유라 필터 없이 그대로) 두 목록을
    원본 JSON으로 돌려준다 — **요약 문장은 서버가 만들지 않는다**(사용자 확인,
    2026-09-13: 호출하는 Claude/외부 에이전트가 원본을 보고 알아서 브리핑
    문장을 만들면 되고, 그러면 이 API는 Anthropic API 키 의존성 없이 순수
    조회만 하면 된다).
  - 조회 범위는 기본 오늘부터 14일이고, `?days=30`(최대 90) 또는
    `?start=YYYY-MM-DD&end=YYYY-MM-DD`로 지정할 수 있다
    (`lib/queries/eventsV2.ts::getTeamEventsV2InRange` — 기존 월 단위 조회
    `getTeamEventsV2`에서 범위 계산만 분리한 함수, 필터링 로직은 동일).
  - 개인 구글 캘린더 조회는 기존 `lib/queries/googleCalendar.ts::
    getMyGoogleCalendarEvents`를 그대로 재사용한다 — admin 클라이언트를 넘겨도
    RLS를 아예 우회하므로 `user_id` 필터만 명시하면 정확히 그 사용자 것만
    조회된다(이 함수가 세션 클라이언트 전용으로 짜인 게 아니라 `SupabaseClient`
    타입만 요구해서 그대로 호환).

## Memo Board

`/dashboard/memos` — Claude Design "Industry" 테마 목업("게시판 디자인
요청.zip")을 이식했다(2026-08-29, 같은 디자인 시스템 —
`components/industryTheme.css` 공유). Business3/Calendar와 달리 이 화면은
**단일 컴포넌트로 뷰를 전환하는 SPA 구조가 아니라 원래부터 라우트가 나뉜
구조**(`/dashboard/memos`, `/new`, `/[id]`, `/[id]/edit`)를 그대로 유지했다 —
목업은 리스트/작성/상세를 한 컴포넌트의 `view` 상태로 전환하지만, 실제 앱은
`notifications` 테이블의 `link`가 `/dashboard/memos/${id}`를 직접 가리키고
(알림 벨 딥링크), `AiCommandBar.tsx`가 `createMemo` 서버 액션의
`redirect()` 동작에 의존하고 있어 라우트 구조를 바꾸면 이 둘이 깨진다.
그래서 각 페이지의 JSX만 Industry 스타일로 새로 그리고, 서버 액션·데이터
쿼리(`app/dashboard/memos/actions.ts`, `lib/queries/memos.ts`)는 전혀
건드리지 않았다.

- 구분(`business`/`cooperation`/`marketing`/`etc`)은 목업의
  Business/Cooperation/Marketing/General과 값만 다르고 개념은 동일 —
  기존 `CATEGORY_LABEL` 매핑을 그대로 썼다.
- 첨부파일(이미지·PDF·Office 문서·ZIP, 최대 5개)은 목업에 없던 기능이지만
  실제 운영에 쓰이고 있어 작성/수정/상세 화면에 그대로 유지했다.

## Meeting Notes

`/dashboard/meeting-notes` — 팀원들이 미팅을 lilys.ai에서 각자 개별 계정으로
기록하고 있어(2026-09-06), API 직접 연동은 하지 않았다 — 계정이 사람마다
따로라 연동하면 불필요한 남의 기록까지 다 끌려오고, 유저별 계정 연결까지
따로 구현해야 하는 문제가 있었다(사용자 확인). 대신 lilys.ai의 "MARKDOWN"
내보내기 결과물을 사람이 직접 파일로 올리거나 텍스트를 복사해 붙여넣으면,
팀 전체가 한 화면에서 같이 보는 방식으로 구현했다.

- **원본 파일을 저장하지 않는다**: 업로드한 .md 파일이든 붙여넣은 텍스트든
  `file.text()`로 읽은 마크다운 "텍스트"만 `meeting_notes.content`(postgres
  text 컬럼)에 그대로 저장한다(`app/dashboard/actions/meetingNotes.ts::resolveContent`).
  그래서 Work Journal/Memo Board/제조사 관리 첨부파일과 달리 Supabase
  Storage나 구글드라이브 같은 별도 파일 스토리지 연동이 전혀 필요 없다 —
  텍스트라 용량 걱정도 없다(최대 2MB로만 제한).
- **제목 자동 추출**: 제목을 안 적으면 마크다운 첫 `# 제목` 헤딩 줄을
  정규식으로 찾아 자동으로 쓴다(`resolveTitle`) — lilys.ai 내보내기 결과물
  최상단에 보통 이런 헤딩이 있어서(스크린샷 확인). 헤딩도 없고 제목도
  안 적었으면 에러.
- **렌더링**: `components/dashboard/MarkdownContent.tsx`가 `react-markdown`
  + `remark-gfm`(표·취소선·체크리스트) + `rehype-slug`(헤딩에 앵커 id
  부여)로 렌더링한다. 각 마크다운 엘리먼트를 Industry 테마 톤(hex 값이
  아니라 `var(--color-*)`/`var(--font-*)` 그대로 — 이 컴포넌트는 항상
  `.industry-theme` 안에서만 쓰이므로)에 맞춰 인라인 스타일로 다시 그린다
  (이 앱엔 별도 prose 유틸리티 CSS가 없어 다른 Industry 화면들과 같은
  관례). 상세 화면 우측의 목차(TOC)는 `extractHeadings()`가 같은 원본
  텍스트에서 `github-slugger`로 헤딩을 미리 뽑아 만드는데, `rehype-slug`도
  내부적으로 같은 라이브러리를 쓰기 때문에 각 헤딩을 같은 순서로 처리하면
  TOC 링크의 `#id`가 실제 렌더링된 헤딩의 id와 항상 일치한다.
- 작성자 본인 또는 admin만 수정·삭제 가능(Memo Board와 동일한 RLS 패턴,
  `public.is_admin()` 재사용). 등록 시 `notifications`에도 남긴다(팀
  전체가 새 미팅노트를 알림으로 인지할 수 있게, type='meeting_note').
- **참석자·장소·팀원 의견**(2026-09-06 추가): `meeting_notes.attendees`/
  `location`은 자유 텍스트(쉼표로 구분해 적는 정도, 별도 구조화·팀원 목록
  선택 UI는 없음 — 참석자가 외부인일 수도 있어 자유 텍스트가 더 유연하다고
  판단). 의견(댓글)은 `meeting_note_comments` 테이블로 Memo Board의 댓글
  (`ad_strategy_memo_comments`)과 완전히 같은 구조 — 삭제 UI는 없고, DELETE
  RLS 정책은 미팅노트 삭제 시 cascade가 막히지 않게 하려는 용도로만 있다.

## 할 일 (Todos)

`/dashboard/todos` — Manyfast(AI 제품 기획 도구)로 작성해 둔 "할 일 관리 서비스" PRD를
이 대시보드의 새 메뉴로 통합했다(2026-09-11). 이 앱의 다른 모든 기능(SI Business/
Cooperation/Marketing/Memo Board 등)은 **팀 전체가 공유**하고 작성자 또는 admin이
수정할 수 있는데, 이 기능은 PRD가 요구한 대로 **완전히 개인 소유** 데이터다 — RLS가
`owner_id = auth.uid()`만 허용하고 admin 우회 정책이 아예 없다(다른 사용자는 select도
안 됨). 새 계정 시스템은 만들지 않았다 — 기존 Supabase Auth(이메일+비밀번호, RLS)가
PRD의 "사용자 계정" 요구사항(가입/로그인/데이터 격리)을 이미 충족한다.

- `todos`(0068) 테이블 하나: 제목·기한(`due_date`, 선택)·우선순위(`high`/`medium`/`low`,
  기본 보통)·완료 상태·알람 시각(`alarm_at`, 선택). 목록은 미완료를 기한 임박순으로
  먼저 보여주고, 완료된 항목은 기본적으로 접어서 숨긴다(PRD의 열린 질문에 대한
  권장 옵션을 그대로 채택 — `AiToolsBoard`/`Work Journal`과 같은 "목록 위에 인라인
  카드로 폼이 펼쳐지는" 구조, Industry 테마).
- **알람은 앱 푸시가 아니라 브라우저 Web Push**로 구현했다(PRD는 "앱 푸시"를
  요구했지만 이 프로젝트엔 네이티브 앱이 없어 사용자 확인 후 브라우저 알림으로
  대체) — `lib/webPush.ts`(`web-push` 패키지, VAPID 키), `public/sw.js`(최소
  서비스워커, push/notificationclick만 처리). 사용자가 `/dashboard/todos`의
  "알림 허용" 배너를 눌러야 `push_subscriptions`(0068, 본인 행만 RLS)에 구독 정보가
  저장된다. VAPID 키는 `npx web-push generate-vapid-keys`로 한 번 생성해 고정
  (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT`) — 키를
  바꾸면 기존에 저장된 모든 구독이 무효화된다.
- **알람 발송 크론이 `vercel.json`에 없다**: `app/api/cron/todo-alarms`가 `alarm_at`이
  지났고 아직 안 보냈고 완료되지 않은 할 일을 찾아 소유자의 모든 구독에 발송하고
  `alarm_sent`를 채우는데(만료된 구독은 410/404 응답으로 감지해 즉시 삭제), 5분
  단위로 자주 돌아야 정시 알림에 가까워진다. 이 프로젝트는 **Vercel Hobby(무료)
  플랜**이라 Vercel Cron이 스케줄과 무관하게 하루 1회로 강제 제한된다(2026-09-11
  확인) — 그래서 다른 크론(AI Issue)과 달리 Vercel Cron을 쓰지 않고, **외부 무료
  스케줄러(cron-job.org 등)**가 5분마다 `Authorization: Bearer $CRON_SECRET` 헤더로
  이 라우트를 직접 호출하도록 사용자가 별도 설정해야 한다(기존 `CRON_SECRET` 값을
  그대로 재사용, 새 시크릿 아님). 유료 Pro 플랜으로 올리면 `vercel.json`에
  `"schedule": "*/5 * * * *"`로 추가해도 된다.

## 알림벨 브라우저 푸시

상단 알림벨(`NotificationBell.tsx`, `notifications` 테이블)이 새 항목을 받을 때
구독한 팀원 전원에게 Web Push도 함께 보낸다(2026-09-12, 할 일 알람 인프라를
그대로 확장). `notifications`는 이 앱의 여러 서버 액션뿐 아니라 별도 저장소
(airpass-naver-monitor)가 유튜브 업로드/광고비 부족 건을 service_role로 직접
삽입하기도 해서, 호출부를 일일이 고치는 대신 **DB 트리거**로 insert 시점
자체를 가로챈다(`enqueue_notification_push()`, 0069 — `profiles`의
`on_auth_user_created` 트리거와 같은 패턴) — 새 알림이 생기면 트리거가
`notification_push_queue`에 큐잉하고, `app/api/cron/notification-push`가 할 일
알람 크론과 같은 주기(외부 스케줄러 5분)로 큐를 비우며 그 시점의
`push_subscriptions` 전원에게 발송한다. 수신자를 특정 담당자로 좁히지 않고
**구독한 팀원 전원**에게 보낸다(사용자 확인, 2026-09-12) — 알림 종류마다
담당자 개념이 다르고 일부(유튜브 업로드 등)는 담당자가 아예 없어 특정
난이도가 커진다고 판단.

- 구독 켜기 버튼(`PushNotificationToggle.tsx`)을 헤더 알림벨 옆에도 뒀다 —
  기존엔 `/dashboard/todos`의 배너에서만 켤 수 있어서, 할 일을 안 쓰는
  팀원은 알림벨 푸시를 켤 방법이 없었다. 구독 로직(`usePushSubscription`
  훅으로 추출)은 할 일 알람과 완전히 동일해서 `push_subscriptions` 행 하나로
  두 종류의 알림을 모두 받는다 — 별도로 두 번 켤 필요 없음.

## AI HUB

사이드바 새 그룹(2026-09-06) — AI Tools/AI Review/AI Issue 세 메뉴.

- **AI Tools**(`/dashboard/ai-tools`): AI 관련 링크를 팀원 누구나 등록하는
  가벼운 CRUD(`ai_tools` 테이블) — 제목·URL·설명만 있고 첨부파일·댓글은
  없다. Work Journal처럼 목록 위에 인라인 카드로 등록/수정 폼이 펼쳐지는
  구조(`components/dashboard/AiToolsBoard.tsx`). URL에 스킴이 없으면
  `https://`를 자동으로 붙인다(`normalizeUrl`).
- **AI Review**(`/dashboard/ai-review`): **Meeting Notes를 통째로 복제**했다
  (`lib/queries/aiReviews.ts`/`app/dashboard/actions/aiReviews.ts`/
  `components/AiReviewForm.tsx`/`AiReviewCommentForm.tsx` — 파일 하나하나가
  `meetingNotes.ts`/`MeetingNoteForm.tsx` 등과 거의 line-for-line 동일).
  마크다운 파일 업로드/붙여넣기, `MarkdownContent`로 렌더링+목차(TOC),
  팀원 의견(댓글)까지 전부 동일 — 미팅 전용 필드인 참석자·장소만 뺐다.
  마크다운 렌더링 컴포넌트(`components/dashboard/MarkdownContent.tsx`)는
  이미 범용으로 만들어져 있어 그대로 재사용했다(원래 Meeting Notes 전용으로
  이름 붙이지 않은 이유).
- **AI Issue**(`/dashboard/ai-issue`): 사람이 직접 쓰는 화면이 아니라
  **매일 아침 자동으로 채워지는 읽기 전용 피드**다. `news_articles`(교육관련
  뉴스)처럼 네이버 뉴스 검색 API로 모으긴 하지만, **사용자가 관리하는
  키워드 목록이 아니라 고정된 검색어 세트**로 AI 업계 전반을 넓게
  훑고(`lib/server/aiIssueCandidates.ts`, 검색어 8개·최근 36시간 이내만),
  그 후보 풀을 Claude에게 통째로 보여준 뒤 "실제로 이슈인 것"만 최대
  10개 골라 한 줄 요약과 함께 받는다(`lib/server/aiIssueSelection.ts`,
  `lib/newsHotKeywordsAi.ts`와 같은 `fetch` + tool_use 직접 호출 패턴 —
  이 프로젝트엔 `@anthropic-ai/sdk` 의존성이 없다). `app/api/cron/ai-issues/route.ts`가
  이 둘을 이어붙이고 `ai_issues`(0059, `link` unique)에 upsert
  (`ignoreDuplicates: true`)한다 — 같은 기사가 다른 날 다시 뽑혀도 조용히
  건너뛴다.
  - **호출 경로**: `vercel.json`의 Cron(`0 23 * * *` UTC = 매일 08:00 KST)만
    이 라우트를 부른다. Vercel이 자동으로 붙이는
    `Authorization: Bearer $CRON_SECRET` 헤더로만 인증하고, 이 값이 없거나
    틀리면 401 — 사람이 이 화면에서 직접 "지금 수집" 같은 버튼을 누르는
    경로는 없다. `proxy.ts`의 `PUBLIC_PATHS`에 `/api/cron`을 추가해야
    했다(세션 쿠키가 없는 서버-투-서버 호출이라 프록시의 로그인 체크를
    통과 못 하고 `/login`으로 리다이렉트돼 버렸을 것).
  - `ai_issues`에는 authenticated용 INSERT 정책 자체가 없다 — 오직
    `service_role`(cron 라우트의 `createAdminClient()`)만 쓸 수 있다
    (`news_articles`와 동일한 원칙).

## 폴더 구조

```
app/
  login/                이메일+비밀번호 로그인
  auth/callback/         code→세션 교환 (route handler)
  auth/set-password/     초대·재설정 후 새 비밀번호 저장
  auth/forgot-password/  재설정 메일 요청
  admin/                 관리자 전용: 팀원 등록 폼 + 가입자 목록, 전체 Industry 테마
  dashboard/              메인 대시보드
components/               공용 UI (LoginForm, DashboardHeader 등)
components/dashboard/     대시보드 전용 차트/테이블 컴포넌트
lib/supabase/             client.ts(브라우저) / server.ts(서버) / admin.ts(service_role,
                           server-only) / authed.ts(권한 헬퍼) / env.ts
lib/types/                database.types.ts
lib/queries/               dashboard.ts (최근일 앵커 + 전체 대시보드 쿼리)
supabase/migrations/       0001_init.sql — 스키마 단일 출처
proxy.ts                   세션 갱신 + 로그인 리다이렉트 (Next 16, 구 middleware.ts)
```

## 실행 명령

```bash
npm run dev         # 개발 서버
npm run build        # 프로덕션 빌드 (typecheck 포함)
npm run lint          # ESLint
```
