import type { Metadata } from "next";
import Link from "next/link";
import { PublicDocLayout } from "@/components/PublicDocLayout";
import { QUOTATION_SUPPLIER } from "@/lib/quotationCompany";

export const metadata: Metadata = { title: "서비스 약관 · Strategic Agent" };

export default function TermsPage() {
  return (
    <PublicDocLayout title="서비스 약관" updated="2026년 10월 15일">
      <section>
        <h2>1. 목적</h2>
        <p>
          이 약관은 {QUOTATION_SUPPLIER.name}(이하 &ldquo;회사&rdquo;)가 임직원에게 제공하는 사내 업무 도구
          Strategic Agent(이하 &ldquo;서비스&rdquo;)의 이용 조건을 정합니다.
        </p>
      </section>
      <section>
        <h2>2. 이용 대상</h2>
        <p>
          서비스는 회사 임직원 전용입니다. 계정은 관리자가 등록하며, 공개 회원가입은 제공하지 않습니다. 계정은
          본인만 사용해야 하며 다른 사람에게 양도하거나 공유할 수 없습니다.
        </p>
      </section>
      <section>
        <h2>3. 이용자의 의무</h2>
        <ul>
          <li>비밀번호와 개인 API 토큰을 안전하게 관리하고, 유출이 의심되면 즉시 변경·삭제합니다.</li>
          <li>업무 목적 외로 서비스를 사용하거나 다른 임직원의 정보를 무단으로 외부에 제공하지 않습니다.</li>
          <li>서비스에 올리는 자료가 관련 법령과 회사 보안 규정에 맞는지 확인합니다.</li>
        </ul>
      </section>
      <section>
        <h2>4. 외부 서비스 연동</h2>
        <p>
          Google 캘린더 등 외부 계정 연동은 선택 사항이며 언제든 해제할 수 있습니다. 연동 시 처리되는 정보는{" "}
          <Link href="/privacy" className="underline">개인정보처리방침</Link>을 따릅니다.
        </p>
      </section>
      <section>
        <h2>5. 서비스 변경과 중단</h2>
        <p>
          회사는 업무상 필요에 따라 서비스의 기능을 변경하거나 중단할 수 있습니다. 퇴직 등으로 임직원 자격을
          잃으면 계정 이용이 종료됩니다.
        </p>
      </section>
      <section>
        <h2>6. 문의</h2>
        <p>
          {QUOTATION_SUPPLIER.name} · 대표전화 {QUOTATION_SUPPLIER.phone}
        </p>
      </section>
    </PublicDocLayout>
  );
}
