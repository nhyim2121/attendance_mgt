"use server";
import { requirePerm } from "@/lib/auth";
/** 보호구·피복 관리 저장 (관리자만). 저장은 업무 대장 ledger_rows: ppe(지급) · ppepeople(사이즈·일용직) · ppestock(입고). */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { bookOf } from "@/lib/대장/books";
import { cleanData, type Data } from "@/lib/대장/logic";
import * as store from "@/lib/대장/store";
import { addFile, deleteFilesOf } from "@/lib/총무/mail";
import { GIVE_KINDS, PPE_GROUPS } from "@/lib/총무/ppe";
import { nowKst } from "@/lib/time";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
/** 돌아갈 주소는 이 화면 안으로만 */
const backOf = (f: FormData, fallback = "/ga/ppe") => { const b = s(f, "back"); return b.startsWith("/ga/ppe") ? b : fallback; };
const withMsg = (url: string, msg: string) => `${url}${url.includes("?") ? "&" : "?"}msg=${encodeURIComponent(msg)}`;
const done = () => revalidatePath("/ga", "layout");

async function put(bookKey: string, id: number, raw: Data): Promise<string | null> {
  const book = bookOf(bookKey)!;
  const c = cleanData(book, raw);
  if (c.error) return c.error;
  await store.saveRow(bookKey, id, c.data, c.day);
  return null;
}

/** 지급 (한 사람이든 여러 사람이든). who = "이름|구분|사이즈" 여러 개, 사람마다 사이즈 칸 size_<이름>으로 고칠 수 있다. */
export async function givePpe(f: FormData): Promise<void> {
  await requirePerm("create");
  await requireAdmin();
  const back = backOf(f);
  const day = s(f, "day"), item = s(f, "item"), kind = s(f, "kind") || "정기 지급", qty = s(f, "qty") || "1";
  const sign = s(f, "sign") === "받음" ? "받음" : "안 받음", note = s(f, "note");
  const who = f.getAll("who").map(String).filter(Boolean);
  if (!item) redirect(withMsg(back, "품목을 골라 주세요."));
  if (!who.length) redirect(withMsg(back, "받을 사람을 한 명 이상 골라 주세요."));
  if (!(GIVE_KINDS as readonly string[]).includes(kind)) redirect(withMsg(back, "지급 사유를 확인해 주세요."));
  let n = 0;
  for (const w of who) {
    const [name, group] = w.split("|");
    const size = s(f, `size_${name}`) || w.split("|")[2] || "";
    const paper: Data = sign === "받음" ? { signHow: "종이 서명", signAt: nowKst() } : {};
    const err = await put("ppe", 0, { day, emp: name, group: PPE_GROUPS.includes(group as never) ? group : "", kind, item, size, qty, sign, note, ...paper });
    if (err) redirect(withMsg(back, err));
    n++;
  }
  done();
  redirect(withMsg(back, `${item} ${kind === "반납" ? "반납" : "지급"} ${n}건을 적었습니다.`));
}

/** 지급 기록 고치기 (개인 화면). 서명 칸(sign·signHow·signAt)과 서명 이미지는 그대로 둔다. */
export async function savePpeRow(f: FormData): Promise<void> {
  await requirePerm("update");
  await requireAdmin();
  const back = backOf(f);
  const id = Number(s(f, "id"));
  const row = id ? await store.loadRow(id) : null;
  if (!row || row.book !== "ppe") redirect(withMsg(back, "없는 지급 기록입니다."));
  const raw: Data = { ...row.data };
  for (const k of ["day", "kind", "item", "size", "qty", "note"]) raw[k] = s(f, k);
  const err = await put("ppe", id, raw);
  if (err) redirect(withMsg(back, err));
  done();
  redirect(withMsg(back.replace(/&edit=\d+/, ""), "고쳤습니다."));
}

const signRef = (id: number) => `${store.rowRef(id)}/sign`;

/** 수령 확인 켜고 끄기 (종이에 서명받은 경우 '받음'). 끄면 전자서명 이미지도 지운다. */
export async function signPpe(id: number, signed: boolean): Promise<void> {
  await requirePerm("update");
  await requireAdmin();
  const row = await store.loadRow(id);
  if (!row || row.book !== "ppe") throw new Error("없는 지급 기록입니다.");
  const d: Data = { ...row.data, sign: signed ? "받음" : "안 받음" };
  if (signed) { d.signHow = "종이 서명"; d.signAt = nowKst(); }
  else { delete d.signHow; delete d.signAt; await deleteFilesOf(signRef(id)); }
  await store.saveRow("ppe", id, d, row.day);
  done();
}

/** 전자서명: 화면에 그린 서명(PNG)을 고른 지급 기록마다 저장하고 '받음 · 전자서명 · 서명 일시'로 표시한다.
 *  같은 사람의 기록만 받는다 (다른 사람 기록 번호가 섞이면 거절). */
export async function signPpeImage(name: string, ids: number[], png: string): Promise<{ ok?: string; error?: string }> {
  await requirePerm("update");
  await requireAdmin();
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(png);
  if (!m) return { error: "서명 이미지를 읽지 못했습니다. 다시 서명해 주세요." };
  const bytes = Buffer.from(m[1], "base64");
  if (bytes.length < 200 || bytes.length > 400_000) return { error: "서명 이미지 크기가 맞지 않습니다. 다시 서명해 주세요." };
  if (!ids.length) return { error: "서명할 지급 기록을 골라 주세요." };
  const rows = await Promise.all(ids.map((id) => store.loadRow(id)));
  if (rows.some((r) => !r || r.book !== "ppe" || r.data.emp !== name)) return { error: "이 사람의 지급 기록만 서명할 수 있습니다." };
  const at = nowKst();
  for (const r of rows as NonNullable<(typeof rows)[number]>[]) {
    await deleteFilesOf(signRef(r.id));
    await addFile(signRef(r.id), `수령서명-${name}-${r.data.item}-${at.slice(0, 10)}.png`, "image/png", new Uint8Array(bytes));
    await store.saveRow("ppe", r.id, { ...r.data, sign: "받음", signHow: "전자서명", signAt: at }, r.day);
  }
  done();
  return { ok: `${name} 님의 전자서명을 ${rows.length}건에 저장했습니다.` };
}

/** 서명 안 받은 것 한꺼번에 '받음' */
export async function signPpeMany(f: FormData): Promise<void> {
  await requirePerm("update");
  await requireAdmin();
  const ids = f.getAll("id").map(Number).filter(Boolean);
  for (const id of ids) {
    const row = await store.loadRow(id);
    if (row?.book === "ppe") await store.saveRow("ppe", id, { ...row.data, sign: "받음", signHow: "종이 서명", signAt: nowKst() }, row.day);
  }
  done();
  redirect(withMsg(backOf(f), `${ids.length}건을 수령 확인했습니다.`));
}

/** 개인 사이즈 저장 · 일용직 등록/고치기 (이름이 같은 줄이 있으면 고친다) */
export async function savePpePerson(f: FormData): Promise<void> {
  await requirePerm("update");
  await requireAdmin();
  const back = backOf(f);
  const name = s(f, "name");
  if (!name) redirect(withMsg(back, "이름을 적어 주세요."));
  const rows = await store.loadRows("ppepeople");
  const id = Number(s(f, "id")) || rows.find((r) => (r.data.name ?? "").trim() === name)?.id || 0;
  const old = id ? rows.find((r) => r.id === id)?.data ?? {} : {};
  const raw: Data = { ...old, name };
  for (const k of ["group", "dept", "top", "bottom", "shoe", "start", "end", "note"]) if (f.has(k)) raw[k] = s(f, k);
  const err = await put("ppepeople", id, raw);
  if (err) redirect(withMsg(back, err));
  done();
  redirect(withMsg(back, `${name} 저장했습니다.`));
}

/** 입고 기록 */
export async function addPpeStock(f: FormData): Promise<void> {
  await requirePerm("create");
  await requireAdmin();
  const back = backOf(f);
  const raw: Data = Object.fromEntries(["day", "item", "size", "qty", "vendor", "price", "kcs", "note"].map((k) => [k, s(f, k)]));
  const err = await put("ppestock", 0, raw);
  if (err) redirect(withMsg(back, err));
  done();
  redirect(withMsg(back, `${raw.item} ${raw.size} ${raw.qty}개 입고를 적었습니다.`));
}
