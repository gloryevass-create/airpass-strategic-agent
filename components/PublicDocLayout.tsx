import Link from "next/link";
import type { ReactNode } from "react";
import { QUOTATION_SUPPLIER } from "@/lib/quotationCompany";

// 로그인 없이 열리는 공개 안내 페이지(/about, /privacy, /terms) 공용 틀 —
// Google OAuth 동의 화면 "브랜딩"의 홈페이지·개인정보처리방침·서비스 약관
// 링크로 등록하려고 만들었다(2026-10-15, 앱 게시 상태 전환에 필요).
export function PublicDocLayout({
  title,
  updated,
  children,
}: {
  title: string;
  updated?: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 text-zinc-800 dark:text-zinc-200">
      <nav className="mb-10 flex flex-wrap gap-x-5 gap-y-2 text-sm text-zinc-500">
        <Link href="/about" className="font-semibold text-zinc-900 dark:text-zinc-100">
          Strategic Agent
        </Link>
        <Link href="/privacy" className="hover:underline">개인정보처리방침</Link>
        <Link href="/terms" className="hover:underline">서비스 약관</Link>
        <Link href="/login" className="hover:underline">로그인</Link>
      </nav>
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{title}</h1>
      {updated && <p className="mt-2 text-sm text-zinc-500">시행일: {updated}</p>}
      <div className="mt-8 space-y-8 leading-7 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-zinc-900 dark:[&_h2]:text-zinc-100 [&_li]:ml-5 [&_li]:list-disc">
        {children}
      </div>
      <footer className="mt-16 border-t border-zinc-200 pt-6 text-xs leading-6 text-zinc-500 dark:border-zinc-800">
        {QUOTATION_SUPPLIER.name} · 대표 {QUOTATION_SUPPLIER.representative} · 사업자등록번호{" "}
        {QUOTATION_SUPPLIER.businessNumber}
        <br />
        {QUOTATION_SUPPLIER.address} · 대표전화 {QUOTATION_SUPPLIER.phone}
      </footer>
    </main>
  );
}
