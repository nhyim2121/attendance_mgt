/** 입찰관리 (관리자·입찰 계정): 입찰 사이트 바로가기 + 입찰 대장.
 *  다음 단계(함께 정하기로 함): 공고 자동 수집·알림 조건, 일정 칸 세분화(투찰·개찰·제출 마감 등). */
import LedgerView, { type Sp } from "@/components/대장/LedgerView";
import { Win } from "@/components/대시/win";
import { requireBidPage } from "@/lib/auth";
import { BID_SITES } from "@/lib/총무/bid";

export const metadata = { title: "입찰관리 · 통합관리시스템" };

export default async function Page({ searchParams }: { searchParams: Promise<Sp> }) {
  await requireBidPage();
  return (
    <>
      <div className="u-grid u-bid-top">
        <Win en="BID SITES" ko="입찰 사이트 바로가기" className="s12">
          <div className="u-sites">
            {BID_SITES.map((s) => (
              <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" title={s.name}>
                <b>{s.short}</b><small>{s.name}</small>
              </a>
            ))}
          </div>
        </Win>
      </div>
      <LedgerView area="ga" bookKey="bids" sp={await searchParams} />
    </>
  );
}
