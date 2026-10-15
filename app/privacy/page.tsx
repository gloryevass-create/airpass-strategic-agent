import type { Metadata } from "next";
import { PublicDocLayout } from "@/components/PublicDocLayout";
import { QUOTATION_SUPPLIER } from "@/lib/quotationCompany";

export const metadata: Metadata = { title: "개인정보처리방침 · Strategic Agent" };

// Google OAuth 검토 기준(Google API 서비스 사용자 데이터 정책의 "제한적 사용")에
// 맞춰 Google에서 받는 데이터의 범위·용도·보관·삭제를 실제 구현대로 적었다 —
// lib/googleCalendar/oauth.ts(범위), lib/queries/googleCalendar.ts(조회),
// app/dashboard/actions/eventsV2.ts(쓰기), app/api/calendar-feed(개인 API).
// 구현이 바뀌면 이 문서도 같이 고칠 것.
export default function PrivacyPage() {
  return (
    <PublicDocLayout title="개인정보처리방침" updated="2026년 10월 15일">
      <section>
        <p>
          {QUOTATION_SUPPLIER.name}(이하 &ldquo;회사&rdquo;)는 사내 업무 도구 Strategic Agent(이하
          &ldquo;서비스&rdquo;)를 운영하면서 처리하는 개인정보를 아래와 같이 안내합니다. 서비스는 회사 임직원
          전용이며 일반 이용자를 대상으로 하지 않습니다.
        </p>
      </section>

      <section>
        <h2>1. 처리하는 개인정보</h2>
        <ul>
          <li>계정 정보: 이름, 직함, 회사 이메일, 휴대폰 번호(선택), 참고용 Google 이메일(선택), 비밀번호(암호화 저장), 최근 로그인 시각</li>
          <li>업무 기록: 서비스에 직접 작성한 일정, 프로젝트, 업무일지, 메모, 댓글, 첨부파일</li>
          <li>브라우저 알림 구독 정보: 알림을 허용한 경우 해당 브라우저의 푸시 구독 정보</li>
        </ul>
      </section>

      <section>
        <h2>2. Google 사용자 데이터</h2>
        <p>임직원이 &ldquo;구글 캘린더 연결&rdquo;을 직접 선택한 경우에만 아래 권한을 요청합니다.</p>
        <ul>
          <li><b>calendar.events</b>: 본인 Google 캘린더의 일정 조회, 그리고 본인이 선택한 팀 일정을 본인 캘린더에 등록·수정·삭제</li>
          <li><b>openid, email</b>: 어떤 Google 계정이 연결되었는지 화면에 표시</li>
        </ul>
        <p className="mt-3">
          <b>사용 목적.</b> 조회한 Google 일정은 연결한 임직원 본인이 로그인했을 때 본인 화면에만 표시되며, 다른
          임직원에게는 보이지 않습니다. 일정 등록·수정·삭제는 본인이 일정 화면에서 &ldquo;구글&rdquo; 또는
          &ldquo;캘린더+구글&rdquo;을 선택했을 때만 수행합니다. 본인이 서비스에서 발급한 개인 API 토큰을 쓰는
          경우, 그 토큰을 가진 본인 지정 도구에 본인 일정을 제공합니다.
        </p>
        <p className="mt-3">
          <b>저장.</b> Google 일정 내용은 서비스 데이터베이스에 저장하지 않고 화면을 열 때마다 Google에서 직접
          불러옵니다. 연결을 유지하기 위한 액세스 토큰·갱신 토큰과 연결된 Google 이메일만 저장하며, 접근 권한은
          본인 행으로 제한됩니다. 본인이 등록한 팀 일정에는 대응하는 Google 일정 ID만 함께 저장합니다.
        </p>
        <p className="mt-3">
          <b>제3자 제공 금지.</b> Google 사용자 데이터를 판매하거나 광고에 사용하지 않으며, 위 목적 외의 제3자에게
          제공하지 않습니다. 사람이 이 데이터를 열람하지 않으며, 보안 사고 조사나 법령 준수에 필요한 경우만
          예외로 합니다. AI 모델 학습에도 사용하지 않습니다.
        </p>
        <p className="mt-3">
          서비스가 Google API로부터 받은 정보를 사용하고 다른 앱으로 전송하는 방식은{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            className="underline"
            target="_blank"
            rel="noreferrer"
          >
            Google API 서비스 사용자 데이터 정책
          </a>
          (제한적 사용 요구사항 포함)을 준수합니다.
        </p>
        <p className="mt-3">
          <b>연결 해제와 삭제.</b> Calendar 화면의 &ldquo;연결 해제&rdquo;를 누르면 저장된 토큰이 즉시
          삭제됩니다. Google 계정의{" "}
          <a href="https://myaccount.google.com/permissions" className="underline" target="_blank" rel="noreferrer">
            서드파티 액세스 설정
          </a>
          에서 권한을 철회할 수도 있습니다.
        </p>
      </section>

      <section>
        <h2>3. 보관 기간과 파기</h2>
        <p>
          개인정보는 재직 기간 동안 보관하며, 퇴직 등으로 계정이 삭제되면 지체 없이 파기합니다. 법령에 따라
          보관이 필요한 경우에는 해당 기간 동안 보관합니다.
        </p>
      </section>

      <section>
        <h2>4. 처리 위탁</h2>
        <ul>
          <li>Supabase: 데이터베이스·인증·파일 저장</li>
          <li>Vercel: 서비스 호스팅</li>
        </ul>
      </section>

      <section>
        <h2>5. 정보주체의 권리</h2>
        <p>
          임직원은 본인 개인정보의 열람·정정·삭제·처리정지를 요청할 수 있습니다. 회원정보 수정 화면에서 직접
          변경하거나 아래 연락처로 요청하세요.
        </p>
      </section>

      <section>
        <h2>6. 문의</h2>
        <p>
          {QUOTATION_SUPPLIER.name} · 대표전화 {QUOTATION_SUPPLIER.phone} · {QUOTATION_SUPPLIER.address}
        </p>
      </section>
    </PublicDocLayout>
  );
}
