"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { isScope, loadLinks, saveLinks } from "@/lib/대시/links";

type Res = { ok?: string; error?: string } | null;

/** 바로가기 추가 */
export async function addLink(_prev: Res, f: FormData): Promise<Res> {
  await requireUser();
  const scope = String(f.get("scope"));
  if (!isScope(scope)) return { error: "없는 대시보드입니다." };
  const name = String(f.get("name") ?? "").trim();
  const group = String(f.get("group") ?? "").trim() || "업무";
  let url = String(f.get("url") ?? "").trim();
  if (!name || !url) return { error: "이름과 주소를 적어 주세요." };
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  try { new URL(url); } catch { return { error: "주소 모양이 맞지 않습니다." }; }
  const list = await loadLinks(scope);
  await saveLinks(scope, [...list, { group, name, url }]);
  revalidatePath("/", "layout");
  return { ok: `'${name}' 바로가기를 추가했습니다.` };
}

/** 바로가기 지우기 (순서 번호 + 이름이 같아야 지움) */
export async function deleteLink(scope: string, index: number, name: string): Promise<void> {
  await requireUser();
  if (!isScope(scope)) return;
  const list = await loadLinks(scope);
  if (list[index]?.name !== name) return;
  await saveLinks(scope, list.filter((_, i) => i !== index));
  revalidatePath("/", "layout");
}
