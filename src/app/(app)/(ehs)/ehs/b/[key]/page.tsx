/** 업무 대장 화면 (대장 설정: src/lib/대장/books.ts) */
import LedgerView, { type Sp } from "@/components/대장/LedgerView";
import { bookOf } from "@/lib/대장/books";

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  return { title: `${bookOf((await params).key)?.title ?? "대장"} · 통합관리시스템` };
}

export default async function Page({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<Sp> }) {
  return <LedgerView area="ehs" bookKey={(await params).key} sp={await searchParams} />;
}
