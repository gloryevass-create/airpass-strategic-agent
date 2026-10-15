import type { Metadata } from "next";
import Link from "next/link";
import { PublicDocLayout } from "@/components/PublicDocLayout";

export const metadata: Metadata = { title: "Strategic Agent 소개" };

export default function AboutPage() {
  return (
    <PublicDocLayout title="Strategic Agent">
      <section>
        <p>
          Strategic Agent는 (주)에어패스 임직원이 사내 업무에 쓰는 내부 업무 도구입니다. 공개 회원가입은
          없으며, 관리자가 등록한 임직원 계정으로만 로그인할 수 있습니다.
        </p>
      </section>
      <section>
        <h2>주요 기능</h2>
        <ul>
          <li>팀 공유 캘린더와 일정 관리</li>
          <li>사업·협력·마케팅 프로젝트 보드, 업무일지, 메모·회의록</li>
          <li>산출내역(견적) 작성과 고객 자료 메일 발송</li>
          <li>네이버 키워드광고·블로그·유튜브 마케팅 분석</li>
        </ul>
      </section>
      <section>
        <h2>Google 계정 연동</h2>
        <p>
          임직원은 원하는 경우 본인의 Google 캘린더를 연결해, 로그인한 본인에게만 Google 일정을 팀 캘린더와 함께
          보고 팀 일정을 본인 Google 캘린더에 등록할 수 있습니다. 연결은 선택 사항이며 언제든 해제할 수
          있습니다. 자세한 내용은 <Link href="/privacy" className="underline">개인정보처리방침</Link>을
          참고하세요.
        </p>
      </section>
      <p>
        <Link href="/login" className="inline-block rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
          임직원 로그인
        </Link>
      </p>
    </PublicDocLayout>
  );
}
