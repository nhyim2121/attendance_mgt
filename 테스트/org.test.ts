/** 조직 구조: 부서 자동 포함·직접 배치·직급 순서·자리 없는 직원 (가짜 이름). */
import { describe, expect, it } from "vitest";
import type { Employee } from "@/lib/인사노무/employees";
import { buildOrg, type OrgNode } from "@/lib/인사노무/org";

const emp = (name: string, dept: string, rank: string, ord: number, e: Partial<Employee> = {}): Employee => ({
  name, capsName: "", empId: "", dept, rank, position: "", phone: "", ext: "", email: "", joinDate: null, leaveDate: null,
  note: "", ord, ...e,
});
const n = (id: string, parent: string | null, kind: OrgNode["kind"], label: string, o: Partial<OrgNode> = {}): OrgNode =>
  ({ id, parent, kind, label, head: "", dept: "", members: [], extra: [], ...o });

describe("조직 구조", () => {
  const emps = [
    emp("가나다", "생산팀", "사원", 0), emp("라마바", "생산팀", "부장", 1), emp("사아자", "생산팀", "대리", 2),
    emp("차카타", "품질팀", "전무이사", 3), emp("파하가", "품질팀", "", 4), emp("나다라", "일학습", "도제", 5),
    emp("퇴사자", "생산팀", "사원", 6, { leaveDate: "2026-01-01" }),
  ];
  const nodes = [
    n("top", null, "top", "대표이사", { head: "홍대표" }),
    n("ex", "top", "exec", "전무", { head: "차카타" }),
    n("p", "ex", "unit", "생산팀", { dept: "생산팀", head: "라마바" }),
    n("p1", "p", "sub", "조립반", { members: ["가나다"] }),
    n("q", "ex", "unit", "품질팀", { dept: "품질팀", extra: ["과장 외부인"] }),
  ];

  it("책임자·직접 넣은 사람은 부서 자동 명단에서 빠지고, 명단은 직급 순", () => {
    const o = buildOrg(nodes, emps, "2026-10-30");
    const [top] = o.roots;
    expect(top.head).toMatchObject({ name: "홍대표", emp: null });
    const [p, q] = top.children[0].children;
    expect(p.head?.name).toBe("라마바");
    expect(p.people.map((x) => x.name)).toEqual(["사아자"]);
    expect(p.children[0].people.map((x) => x.name)).toEqual(["가나다"]);
    expect(q.people.map((x) => `${x.rank} ${x.name}`)).toEqual(["과장 외부인", " 파하가"]); // 직급 없는 사람은 뒤
    expect(o.unplaced.map((e) => e.name)).toEqual(["나다라"]); // 퇴사자는 빠짐
    expect(o.total).toBe(7);
  });

  it("명부에 없는 책임자는 구조에 적은 휴대전화를 쓴다 (직원은 명부 번호)", () => {
    const withPhone = nodes.map((x) => ({ ...x, headPhone: "010-0000-0000" }));
    const [top] = buildOrg(withPhone, emps, "2026-10-30").roots;
    expect(top.head?.phone).toBe("010-0000-0000");
    expect(top.children[0].head?.phone).toBeUndefined();
  });
});
