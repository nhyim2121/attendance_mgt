/** 개인별 보호구·피복 지급대장 (관리자만, 재직·퇴사 모두): 사이즈 · 품목별 상태 · 지급 등록/고치기/삭제 · 전자서명 · 인쇄(서명 이미지 포함) */
import Link from "next/link";
import { notFound } from "next/navigation";
import PageHead from "@/components/대시/PageHead";
import { Win } from "@/components/대시/win";
import PrintButton from "@/components/PrintButton";
import { DeleteRow } from "@/components/대장/forms";
import { requireAdminPage } from "@/lib/auth";
import * as store from "@/lib/대장/store";
import { loadEmployees } from "@/lib/store";
import { loadFiles } from "@/lib/총무/mail";
import { buildPeople, cellOf, GIVE_KINDS, PPE_ITEMS, requiredItems, SIZE_LABEL, type SizeKey, STATUS_LABEL } from "@/lib/총무/ppe";
import { todayKst } from "@/lib/time";
import { givePpe, savePpePerson, savePpeRow, signPpe } from "../actions";
import { CellView, GroupChip, Msg, ymd } from "../ui";
import SignPad from "./SignPad";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ name?: string }> }) {
  return { title: `${(await searchParams).name ?? ""} 보호구·피복 지급대장 · 통합관리시스템` };
}
const cycleText = (n: number | undefined) => (n === undefined ? "" : n === 0 ? "처음 1회·파손 때" : n % 12 === 0 ? `${n / 12}년마다` : `${n}개월마다`);

export default async function Page({ searchParams }: { searchParams: Promise<{ name?: string; msg?: string; edit?: string }> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const name = (sp.name ?? "").trim();
  const today = todayKst();
  const [emps, issues, profiles, files] = await Promise.all([loadEmployees(), store.loadRows("ppe"), store.loadRows("ppepeople"), loadFiles("lg:")]);
  const p = buildPeople(emps, profiles, today, true).find((x) => x.name === name);
  const emp = emps.find((e) => e.name === name);
  const mine = issues.filter((r) => r.data.emp === name).sort((a, b) => (b.data.day ?? "").localeCompare(a.data.day ?? "") || b.id - a.id);
  if (!p && !emp && !mine.length) notFound();
  const enc = encodeURIComponent(name);
  const back = `/ga/ppe/person?name=${enc}`;
  const editing = mine.find((r) => r.id === Number(sp.edit));
  const req = p ? requiredItems(p.group) : [];
  const other = [...new Set(mine.map((r) => r.data.item ?? ""))].filter((i) => i && !req.some((x) => x.name === i));
  const signOf = (id: number) => files.get(`${store.rowRef(id)}/sign`)?.[0];
  const unsigned = mine.filter((r) => r.data.kind !== "반납" && r.data.sign !== "받음");
  const label = p ? `${p.group} · ${p.dept}${p.retired ? ` · ${p.daily ? "종료" : "퇴사"} ${ymd(p.retired)}` : ""}` : `${emp?.dept ?? ""} · 관리 대상 아님`;

  return (
    <div className="ud pp">
      <PageHead href="/ga/ppe" title={`${name} 보호구·피복 지급대장`} mark={label}
        desc="이 사람에게 지급한 모든 기록을 보고 등록·고치기·삭제하며, 화면에서 바로 전자서명을 받습니다. 인쇄하면 서명이 들어간 개인별 지급대장이 나옵니다.">
        <Link className="btn" href="/ga/ppe?tab=people">← 부서별 직원</Link>
        <PrintButton label="지급대장 인쇄" />
      </PageHead>
      <Msg msg={sp.msg} />
      {p?.retired && <div className="msg info pp-noprint" style={{ marginBottom: 12 }}>{p.daily ? "투입이 끝난 일용직" : "퇴사한 직원"}입니다 ({ymd(p.retired)}). 기록은 그대로 보고 고칠 수 있으며, 미지급·교체 알림에서는 빠집니다. 반납받은 물품은 [지급 사유: 반납]으로 적으세요.</div>}

      <div className="pp-two pp-noprint">
        <Win en="PROFILE" ko="기본 정보·사이즈">
          {p ? (
            <form action={savePpePerson} className="pp-form">
              <input type="hidden" name="back" value={back} />
              <input type="hidden" name="name" value={p.name} />
              {p.profileId && <input type="hidden" name="id" value={p.profileId} />}
              <div className="pp-who"><GroupChip g={p.group} /> <b>{p.name}</b> {p.rank} · {p.dept}{p.daily && p.start ? ` · 투입 ${ymd(p.start)}${p.end ? ` ~ ${ymd(p.end)}` : ""}` : ""}</div>
              {(["top", "bottom", "shoe"] as SizeKey[]).map((k) => (
                <label key={k}>{SIZE_LABEL[k]}<input name={k} defaultValue={p.sizes[k] ?? ""} /></label>
              ))}
              {p.daily && <>
                <input type="hidden" name="group" value="일용직" />
                <label>업체<input name="dept" defaultValue={p.dept === "일용직" ? "" : p.dept} /></label>
                <label>투입일<input type="date" name="start" defaultValue={p.start ?? ""} /></label>
                <label>종료일<input type="date" name="end" defaultValue={p.end ?? ""} /></label>
              </>}
              <label className="grow">메모<input name="note" defaultValue={p.note ?? ""} placeholder="예: 발볼 넓음" /></label>
              <button className="btn primary">저장</button>
            </form>
          ) : <p className="fd-empty">현장직·연구소가 아닌 직원입니다. 지급 기록만 관리합니다.</p>}
        </Win>

        {editing ? (
          <Win en="EDIT" ko={`기록 고치기 · ${ymd(editing.data.day)} ${editing.data.item}`}>
            <form action={savePpeRow} className="pp-form">
              <input type="hidden" name="back" value={`${back}&edit=${editing.id}`} />
              <input type="hidden" name="id" value={editing.id} />
              <label>품목 *<input name="item" list="pp-items" defaultValue={editing.data.item ?? ""} required /></label>
              <label>지급일 *<input type="date" name="day" defaultValue={editing.data.day ?? ""} required /></label>
              <label>지급 사유<select name="kind" defaultValue={editing.data.kind ?? ""}><option value="">-</option>{GIVE_KINDS.map((k) => <option key={k}>{k}</option>)}</select></label>
              <label>사이즈<input name="size" defaultValue={editing.data.size ?? ""} /></label>
              <label>수량<input name="qty" defaultValue={editing.data.qty ?? "1"} inputMode="numeric" /></label>
              <label className="grow">비고<input name="note" defaultValue={editing.data.note ?? ""} /></label>
              <datalist id="pp-items">{PPE_ITEMS.map((i) => <option key={i.name} value={i.name} />)}</datalist>
              <button className="btn primary">저장</button>
              <Link className="btn" href={back}>취소</Link>
            </form>
            <p className="caption">수령 확인·서명은 고쳐도 그대로 남습니다. 서명을 지우려면 아래 표의 [서명 취소]를 누르세요.</p>
          </Win>
        ) : (
          <Win en="ADD" ko="지급 등록">
            <form action={givePpe} className="pp-form">
              <input type="hidden" name="back" value={back} />
              <input type="hidden" name="who" value={`${name}|${p?.group ?? ""}`} />
              <label>품목 *<select name="item" required defaultValue="">
                <option value="" disabled>고르기</option>
                {PPE_ITEMS.map((i) => <option key={i.name}>{i.name}</option>)}
              </select></label>
              <label>지급일 *<input type="date" name="day" defaultValue={today} required /></label>
              <label>지급 사유<select name="kind" defaultValue="신규 지급">{GIVE_KINDS.map((k) => <option key={k}>{k}</option>)}</select></label>
              <label>사이즈<input name={`size_${name}`} placeholder={p ? `상의 ${p.sizes.top ?? "-"} · 안전화 ${p.sizes.shoe ?? "-"}` : ""} /></label>
              <label>수량<input name="qty" defaultValue="1" inputMode="numeric" /></label>
              <label>수령 확인<select name="sign" defaultValue="안 받음"><option value="안 받음">아래에서 전자서명</option><option value="받음">종이에 서명받음</option></select></label>
              <label className="grow">비고<input name="note" placeholder="교체면 사유 (예: 밑창 파손)" /></label>
              <button className="btn primary">등록</button>
            </form>
            <p className="caption">사이즈를 비워 두면 품목에 맞는 개인 사이즈(상의·안전화)를 씁니다. 등록한 뒤 아래 [전자서명 받기]에서 바로 서명받으세요.</p>
          </Win>
        )}
      </div>

      <div className="pp-noprint" id="sign">
        <Win en="E-SIGN" ko={`전자서명 받기 · 서명 안 된 ${unsigned.length}건`} tape="y">
          <SignPad key={unsigned.map((r) => r.id).join(",")} name={name}
            rows={unsigned.map((r) => ({ id: r.id, label: `${ymd(r.data.day)} ${r.data.item}${r.data.size ? ` (${r.data.size})` : ""}${+(r.data.qty ?? 1) > 1 ? ` ×${r.data.qty}` : ""}` }))} />
        </Win>
      </div>

      {p && (
        <Win en="STATUS" ko={`품목별 상태 (${ymd(today)} 기준)`} className="pp-noprint">
          <table className="tbl pp-mini">
            <thead><tr><th>품목</th><th>지급 기준</th><th>마지막 지급</th><th>사이즈</th><th>다음 교체</th><th>상태</th></tr></thead>
            <tbody>{[...req, ...other.map((o) => PPE_ITEMS.find((i) => i.name === o) ?? { name: o, kind: "보호구" as const, cycle: {} })].map((it) => {
              const c = cellOf(p, it, issues, today);
              return (
                <tr key={it.name}>
                  <td><b>{it.name}</b></td>
                  <td className="fd-sub">{cycleText(it.cycle[p.group]) || "필요할 때"}</td>
                  <td>{ymd(c.last) || "-"}</td><td>{c.size}</td><td>{p.retired ? "" : ymd(c.next)}</td>
                  <td>{p.retired ? <span className="muted">{p.daily ? "종료" : "퇴사"}</span> : <><CellView c={c} /> {c.status !== "na" && c.status !== "none" && <small className="muted">{STATUS_LABEL[c.status]}</small>}</>}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </Win>
      )}

      <section className="pp-sheet">
        <h2 className="print-only pp-sheet-h">보호구·피복 지급대장 (개인별)</h2>
        <table className="tbl pp-sheet-info print-only">
          <tbody><tr>
            <th>성명</th><td>{name}</td><th>소속</th><td>{p?.dept ?? emp?.dept}</td><th>구분</th><td>{p?.group}{p?.retired ? ` (${p.daily ? "종료" : "퇴사"} ${ymd(p.retired)})` : ""}</td>
            <th>사이즈</th><td>상의 {p?.sizes.top} · 하의 {p?.sizes.bottom} · 안전화 {p?.sizes.shoe}</td>
          </tr></tbody>
        </table>
        <Win en="HISTORY" ko={`지급 기록 전체 · ${mine.length}건`}>
          <div className="tbl-wrap">
            <table className="tbl pp-hist">
              <thead><tr><th>지급일</th><th>사유</th><th>품목</th><th>사이즈</th><th>수량</th><th>비고</th><th>수령인 서명</th><th className="pp-noprint" /></tr></thead>
              <tbody>{mine.map((r) => {
                const ok = r.data.sign === "받음", img = signOf(r.id);
                return (
                  <tr key={r.id} className={`${r.data.kind === "반납" ? "inactive" : ""}${editing?.id === r.id ? " editing" : ""}`}>
                    <td>{ymd(r.data.day)}</td><td>{r.data.kind}</td><td><b>{r.data.item}</b></td><td>{r.data.size}</td><td>{r.data.qty || 1}</td>
                    <td className="fd-sub" style={{ whiteSpace: "normal" }}>{r.data.note}</td>
                    <td className="pp-signcell">
                      {r.data.kind === "반납" ? <span className="muted">반납</span>
                        : img ? <a href={`/api/ga/file/${img.id}`} target="_blank" rel="noreferrer" title={`전자서명 ${r.data.signAt ?? ""}`}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={`/api/ga/file/${img.id}`} alt={`${name} 서명`} className="pp-signimg" /></a>
                        : ok ? <span className="pp-paper">종이 서명</span>
                        : <span className="pp-nosign pp-noprint">서명 안 됨</span>}
                      {ok && r.data.signAt && <small className="pp-signat">{r.data.signAt.slice(2, 16)}</small>}
                    </td>
                    <td className="pp-noprint">
                      <div className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                        <Link className="btn sm" href={`${back}&edit=${r.id}`} scroll={false}>고치기</Link>
                        {r.data.kind !== "반납" && (ok
                          ? <form action={signPpe.bind(null, r.id, false)}><button className="btn sm" title="수령 확인과 서명 이미지를 지웁니다">서명 취소</button></form>
                          : <>
                              <a className="btn sm primary" href="#sign">서명</a>
                              <form action={signPpe.bind(null, r.id, true)}><button className="btn sm" title="종이에 서명받은 경우">종이</button></form>
                            </>)}
                        <DeleteRow id={r.id} name={`${ymd(r.data.day)} ${r.data.item}`} />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {/* 인쇄할 때 손으로 적을 빈 줄 */}
              {Array.from({ length: Math.max(0, 8 - mine.length) }, (_, i) => (
                <tr key={`b${i}`} className="print-only-row"><td>&nbsp;</td><td /><td /><td /><td /><td /><td /><td className="pp-noprint" /></tr>
              ))}</tbody>
            </table>
          </div>
          {!mine.length && <p className="fd-empty pp-noprint">아직 지급 기록이 없습니다. 위의 [지급 등록]으로 적으세요.</p>}
        </Win>
        <p className="print-only caption">위 보호구·피복을 지급받았으며, 작업 중 착용하고 파손·분실 시 바로 알리겠습니다. — 출력 {ymd(today)} · 주식회사 에스엔 총무</p>
      </section>
    </div>
  );
}
