/** ISO 27001 실적문서 작성 매뉴얼: 모든 양식의 작성 방법을 분류별로 한 화면에 (인쇄 가능) */
import PageHead from "@/components/대시/PageHead";
import Link from "next/link";
import PrintButton from "@/components/PrintButton";
import { requireAdminPage } from "@/lib/auth";
import * as iso from "@/lib/인증/iso27k";
import { KEEP_NOTE } from "@/lib/인증/iso27k-guide";
import { todayKst } from "@/lib/time";
import GuideBox from "../GuideBox";
import IsoTabs from "../Tabs";

export const metadata = { title: "ISO 27001 작성 매뉴얼 · 통합관리시스템" };

export default async function IsoGuide() {
  await requireAdminPage();
  const forms = await iso.allForms();
  const groups = iso.GROUPS.filter((g) => forms.some((f) => f.group === g));
  return (
    <>
      <PageHead href="/cert/iso" title="작성 매뉴얼" mark="ISO/IEC 27001:2022"
        desc={<>양식마다 관련 요구사항(본문 조항·부속서 A 통제), 목적, 언제·누가, 작성 순서, 심사 때 보는 점을 정리했습니다.</>}>
        <PrintButton label="매뉴얼 인쇄" />
      </PageHead>
      <IsoTabs on="guide" year={todayKst().slice(0, 4)} />
      <div className="card iso-guide-intro">
        <b>읽는 법</b>
        <ul>
          <li><b>본문 조항</b>(4~10): 경영시스템이 꼭 남겨야 하는 기록 — 4 조직 상황, 6 기획, 7 지원(역량·인식·문서), 9 성과 평가(모니터링·내부심사·경영검토), 10 개선.</li>
          <li><b>부속서 A 통제</b>(93개): A.5 조직적 통제 37 · A.6 인적 통제 8 · A.7 물리적 통제 14 · A.8 기술적 통제 34. 적용성 보고서(SoA)에서 적용한다고 한 통제는 이 기록들로 이행을 보여 줍니다.</li>
          <li>{KEEP_NOTE}</li>
        </ul>
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>{groups.map((g) => <a key={g} className="btn sm" href={`#g-${g}`}>{g}</a>)}</div>
      </div>
      {groups.map((g) => (
        <div key={g} id={`g-${g}`}>
          <h2 className="iso-gh">{g}</h2>
          {forms.filter((f) => f.group === g).map((f) => (
            <div key={f.key}>
              <GuideBox form={f} full />
              <p className="noprint" style={{ margin: "-6px 0 14px", textAlign: "right" }}><Link href={`/cert/iso/doc?form=${f.key}`}>이 양식으로 작성 →</Link></p>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
