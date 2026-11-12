"use server";
/** 교육훈련 관리: 교육 실시 기록 저장(대장 + 연간 계획 '실시 완료' + 첨부), 기준 설정 저장 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requirePerm } from "@/lib/auth";
import { bookOf } from "@/lib/대장/books";
import { cleanData, type Data } from "@/lib/대장/logic";
import * as ledger from "@/lib/대장/store";
import { DEFAULT_OPTS, type TrainOpts } from "@/lib/인사노무/training";
import { setSetting } from "@/lib/store";
import { addFile } from "@/lib/총무/mail";

type Res = { ok?: string; error?: string } | null;
const MAX = 20 * 1024 * 1024;
const OK_EXT = /\.(pdf|png|jpe?g|gif|webp|bmp|heic|tiff?|hwpx?|docx?|xlsx?|pptx?|zip)$/i;
const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function saveTrainingRecord(_prev: Res, f: FormData): Promise<Res> {
  const id0 = Number(f.get("id") || 0);
  await requirePerm(id0 ? "update" : "create");
  await requireAdmin();
  const names = [...new Set(f.getAll("p").map(String).filter(Boolean))];
  const extra = s(f, "extra"); // 직원 관리에 없는 외부 참석자
  const who = [names.join(", "), extra].filter(Boolean).join(", ");
  const raw: Data = {
    day: s(f, "day"), name: s(f, "name"), kind: s(f, "kind"), who, n: String(names.length + (extra ? extra.split(/[,\n]+/).filter((x) => x.trim()).length : 0)),
    hours: s(f, "hours"), by: s(f, "by"), cost: s(f, "cost"), next: s(f, "next"), place: s(f, "place"), content: s(f, "content"),
    note: [s(f, "time") && `시간 ${s(f, "time")}`, s(f, "note")].filter(Boolean).join(" · "),
    until: s(f, "until"),
    // 수강 관리(온라인·위탁): 대상자 중 수료하지 않은 사람이 '미수료'
    target: [...new Set([...f.getAll("tg").map(String), ...names])].filter(Boolean).join(", "),
    cert: [...new Set(f.getAll("cf").map(String))].filter(Boolean).join(", "),
    grades: f.getAll("gr").map(String).filter((x) => /:[ABC]$/.test(x)).join(", "),
    effect: s(f, "effect"), effectHow: s(f, "effectHow"), follow: s(f, "follow"),
  };
  if (!f.getAll("tg").length) raw.target = "";
  if (!raw.name) return { error: "교육명을 적어 주세요." };
  if (!raw.day) return { error: "교육일을 골라 주세요." };
  if (!names.length && !extra && !raw.target) return { error: "참석자(수료자)나 수강 대상자를 한 명 이상 골라 주세요." };
  const book = bookOf("training")!;
  const c = cleanData(book, raw);
  if (c.error) return { error: c.error };
  const files = f.getAll("file").filter((x): x is File => x instanceof File && x.size > 0);
  const bad = files.filter((x) => x.size > MAX || !OK_EXT.test(x.name)).map((x) => x.name);
  if (bad.length) return { error: `20MB 이하의 PDF·이미지·한글·오피스 파일만 올릴 수 있습니다: ${bad.join(", ")}` };

  const id = await ledger.saveRow("training", id0, c.data, c.day);
  for (const x of files) await addFile(ledger.rowRef(id), x.name, x.type || "application/octet-stream", new Uint8Array(await x.arrayBuffer()));

  // 연간 계획에서 불러온 교육이면 계획을 '실시 완료'로
  const planId = Number(f.get("plan") || 0);
  if (planId) {
    const p = await ledger.loadRow(planId);
    if (p && p.book === "trainplan") {
      const note = `${c.data.day} 실시 · ${c.data.n}명${c.data.hours ? ` · ${c.data.hours}시간` : ""}`;
      await ledger.saveRow("trainplan", planId, { ...p.data, status: "실시 완료", note: p.data.note?.includes(note) ? p.data.note : [p.data.note, note].filter(Boolean).join("\n") }, p.day);
    }
  }
  revalidatePath("/", "layout");
  redirect(`/hr/training/sheet?id=${id}&saved=1`);
}

export async function saveTrainOpts(f: FormData): Promise<void> {
  await requirePerm("update");
  await requireAdmin();
  const list = (k: string) => s(f, k).split(/[,\n]+/).map((x) => x.trim()).filter(Boolean);
  const na = s(f, "noAccident");
  const opts: TrainOpts = {
    noAccident: na === "yes" || na === "no" ? na : "auto",
    officeDepts: f.has("officeDepts") ? list("officeDepts") : DEFAULT_OPTS.officeDepts,
    supervisors: list("supervisors"),
    exclude: list("exclude"),
  };
  await setSetting("training", opts);
  revalidatePath("/", "layout");
}
