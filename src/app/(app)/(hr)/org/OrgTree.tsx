/** 조직도 나무 그리기 (조직도 화면 · 조직 홈 같이 씀) */
import type React from "react";
import { fieldValue, ORG_FIELDS, type OrgBox, type OrgPerson, type OrgView } from "@/lib/인사노무/org";
/** 보기에서 고른 연락처 등 */
export function contacts(p: OrgPerson, v: OrgView) {
  if (!p.emp) return p.phone && v.fields.includes("phone") ? [<div key="phone" className="org-c">{p.phone}</div>] : [];
  return (p.emp ? v.fields.filter((f) => f !== "rank" && f !== "position" && fieldValue(p.emp!, f)) : [])
    .map((f) => <div key={f} className="org-c">{f !== "phone" && `${ORG_FIELDS[f]} `}{fieldValue(p.emp!, f)}</div>);
}

/** 명단 한 줄: 이름 + 직급(직책) + 연락처 */
export function Row({ p, v, head = false }: { p: OrgPerson; v: OrgView; head?: boolean }) {
  const role = [v.fields.includes("position") ? p.emp?.position : "", v.fields.includes("rank") ? p.rank : ""]
    .filter(Boolean).filter((x, i, xs) => xs.indexOf(x) === i).join(" · ");
  return (
    <div className={`ot-row${head ? " head" : ""}`}>
      <div><b>{p.name}</b>{role && <span className="org-r"> {role}</span>}</div>
      {contacts(p, v)}
    </div>
  );
}

export function Branch({ b, v }: { b: OrgBox; v: OrgView }) {
  const { node, head } = b;
  const inline = node.kind === "top" || node.kind === "exec"; // 대표·임원: 머리 칸에 "전무 김동수", 연락처는 그 아래
  const headInfo = inline && head ? contacts(head, v) : [];
  return (
    <li>
      <div className={`ot-card k-${node.kind}`} style={b.color ? { "--c": b.color } as React.CSSProperties : undefined}>
        <div className="ot-h">
          {node.label}{inline && head && <span className="ot-hn"> {head.name}</span>}
          {v.showCount && !inline && b.count > 0 && <small> {b.count}명</small>}
        </div>
        {headInfo.length > 0 && <div className="ot-row ot-rc">{headInfo}</div>}
        {!inline && head && <Row p={head} v={v} head />}
        {b.people.map((p, i) => <Row key={`${p.name}${i}`} p={p} v={v} />)}
      </div>
      {b.children.length > 0 && <ul>{b.children.map((c) => <Branch key={c.node.id} b={c} v={v} />)}</ul>}
    </li>
  );
}

