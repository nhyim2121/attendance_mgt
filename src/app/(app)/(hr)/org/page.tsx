/** 조직도: 용도별 보기(사내용·대외용·비상연락망 …)로 부서·직급·성명·연락처를 골라 보여 주고 인쇄한다. */
import PageHead from "@/components/대시/PageHead";
import Link from "next/link";
import type React from "react";
import { Suspense } from "react";
import { hrefWith } from "@/components/Filters";
import { ParamDate } from "@/components/ParamControls";
import { Msg } from "@/components/ui";
import type { Employee } from "@/lib/인사노무/employees";
import { loadBase, type SearchParams } from "@/lib/인사노무/data";
import {
  buildOrg, DEFAULT_VIEWS, defaultNodes, fieldValue, ORG_FIELDS, type OrgBox, type OrgCompany, type OrgNode, type OrgPerson,
  type OrgView, orgPeople, orgTree,
} from "@/lib/인사노무/org";
import * as store from "@/lib/store";
import { isDateStr, todayKst } from "@/lib/time";
import StructureEditor from "./StructureEditor";
import { Branch } from "./OrgTree";
import ViewEditor, { FitPrint, PrintButton } from "./ViewEditor";

export const metadata = { title: "조직도 · 근태관리통합시스템" };

export default async function OrgPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const [base, saved, savedNodes, company] = await Promise.all([
    loadBase(), store.getSetting<OrgView[] | null>("org_views", null), store.getSetting<OrgNode[] | null>("org_nodes", null),
    store.getSetting<OrgCompany>("org_company", { name: "", nameEn: "", logo: "" }),
  ]);
  const views = saved?.length ? saved : DEFAULT_VIEWS;
  const view = views.find((v) => v.id === sp.view) ?? views[0];
  const day = isDateStr(sp.day) ? sp.day : todayKst();
  const tree = orgTree(base.employees, day, view.depts);
  const nodes = savedNodes?.length ? savedNodes : defaultNodes(base.employees);
  const org = buildOrg(nodes, base.employees, day, view.depts, view.exclude ?? []);
  const total = view.layout === "table" ? tree.reduce((t, d) => t + d.members.length + (d.head ? 1 : 0), 0) : org.total;
  const title = (view.title || "조직도").replaceAll("{년}", day.slice(0, 4));
  const allDepts = orgTree(base.employees, day).map((d) => d.dept);
  const missing = view.fields.filter((f) => ["phone", "ext", "email", "position"].includes(f)
    && !base.employees.some((e) => fieldValue(e, f)));

  return (
    <>
      <div className="noprint">
        <PageHead href={"/org"} desc={<>직원 관리의 부서·직급·직책·연락처로 만듭니다. 용도별 보기를 골라 화면으로 보거나 인쇄(PDF 저장)하세요. 순서는 직원 관리의 순서를 따릅니다.</>} />
        <div className="filters">
          <div className="tabs" style={{ margin: 0, border: 0 }}>
            {views.map((v) => (
              <Link key={v.id} href={hrefWith(sp, "/org", { view: v.id })} className={v.id === view.id ? "on" : ""} scroll={false}>{v.name}</Link>
            ))}
          </div>
          <Suspense><ParamDate name="day" label="기준일" value={day} /></Suspense>
          <div className="spacer" />
          <PrintButton />
        </div>
        {missing.length > 0 && (
          <Msg kind="info">{missing.map((f) => ORG_FIELDS[f]).join(", ")} 칸이 아직 비어 있습니다. <Link href="/employees">직원 관리</Link>에서 채우면 조직도에 나옵니다.</Msg>
        )}
        {view.layout === "chart" && org.unplaced.length > 0 && (
          <Msg kind="warn">조직도에 자리가 없는 직원: {org.unplaced.map((e) => `${e.name}(${e.dept || "부서 없음"})`).join(", ")}. 아래 &lsquo;조직 구조&rsquo;에서 상자에 넣어 주세요.</Msg>
        )}
      </div>

      {view.layout === "table" ? (
        <div className="card org-sheet">
          <div className="org-title">{title}<small> {day} 기준{view.showCount ? ` · 총 ${total}명` : ""}</small></div>
          <table className="tbl">
            <thead><tr><th>부서</th><th>성명</th>{view.fields.map((f) => <th key={f}>{ORG_FIELDS[f]}</th>)}</tr></thead>
            <tbody>
              {tree.flatMap((d) => [d.head, ...d.members].filter((e): e is Employee => !!e).map((e, i) => (
                <tr key={e.name}><td>{i === 0 ? d.dept : ""}</td><td><b>{e.name}</b></td>
                  {view.fields.map((f) => <td key={f}>{fieldValue(e, f)}</td>)}</tr>
              )))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card org-sheet">
          <FitPrint>
            <div className="org-title ot-title">{title}</div>
            <div className="ot-scroll"><div className="ot">
              <ul>{org.roots.slice(0, 1).map((r) => <Branch key={r.node.id} b={r} v={view} />)}</ul>
            </div></div>
            <div className="ot-co">
              <span className="ot-day">{day} 기준{view.showCount ? ` · 총 ${total}명` : ""}</span>
              {org.roots.length > 1 && ( /* 화면에서는 따로 한 줄, 인쇄에서는 날짜·로고 사이 */
                <div className="ot ot-foot"><ul className="ot-sep">{org.roots.slice(1).map((r) => <Branch key={r.node.id} b={r} v={view} />)}</ul></div>
              )}
              <span className="ot-co-r">
                {company.logo ? <img src={company.logo} alt={company.name} /> /* 로고에 회사 이름이 들어 있다 */
                  : company.name && <span><b>{company.name}</b>{company.nameEn && <small> {company.nameEn}</small>}</span>}
              </span>
            </div>
          </FitPrint>
        </div>
      )}

      <details className="fold noprint" style={{ marginTop: 16 }}>
        <summary>조직 구조 (대표 · 임원 · 부서 · 반)</summary>
        <p className="caption">
          맨 위 상자가 여럿이면 첫 상자가 조직도 본체, 나머지(일학습병행 등)는 아래에 따로 놓입니다. 상자마다 <b>모양</b>(대표·임원은 상자 안에 이름, 부서·반은 아래로 명단)과 <b>상위</b>를 정하면 그림처럼 이어집니다.
          <b>부서 직원 자동 포함</b>을 고르면 그 부서 직원이 저절로 들어가고(입사·퇴사도 반영), 반·파트로 나눌 때는 <b>직접 넣을 직원</b>에서 고르세요.
          직접 넣거나 책임자로 적은 사람은 부서 자동 명단에서 빠집니다. 명단은 직급 높은 순입니다. 모든 보기에 공통입니다.
        </p>
        <StructureEditor nodes={nodes} company={company}
          emps={base.employees.filter((e) => !e.leaveDate || e.leaveDate >= day).map((e) => [e.name, e.dept, e.rank])} />
      </details>

      <details className="fold noprint" style={{ marginTop: 16 }}>
        <summary>보기 설정 (용도별 표시 항목)</summary>
        <p className="caption">사내용은 연락처를 켜고, 대외용은 부서·직급·성명만 두는 식으로 용도마다 저장해 두세요. 모든 사용자 공통입니다.</p>
        <ViewEditor views={views} depts={allDepts} people={orgPeople(nodes, base.employees)} />
      </details>
    </>
  );
}
