"use server";
import { requirePerm } from "@/lib/auth";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { isScope, loadLinks, saveLinks } from "@/lib/대시/links";
import { isQuad, loadMemos, loadTodo4, newId, saveMemos, saveTodo4 } from "@/lib/대시/notes";

type Res = { ok?: string; error?: string } | null;

/** 바로가기 추가 */
export async function addLink(_prev: Res, f: FormData): Promise<Res> {
  await requirePerm("create");
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
  await requirePerm("delete");
  await requireUser();
  if (!isScope(scope)) return;
  const list = await loadLinks(scope);
  if (list[index]?.name !== name) return;
  await saveLinks(scope, list.filter((_, i) => i !== index));
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------- 할 일 4칸 (내 것만)
export async function addTodo4(text: string, q: number): Promise<void> {
  await requirePerm("create");
  const u = await requireUser();
  const t = text.trim().slice(0, 200);
  if (!t || !isQuad(q)) return;
  await saveTodo4(u.id, [...(await loadTodo4(u.id)), { id: newId(), text: t, q, done: false }]);
  revalidatePath("/", "layout");
}
export async function toggleTodo4(id: string): Promise<void> {
  await requirePerm("update");
  const u = await requireUser();
  await saveTodo4(u.id, (await loadTodo4(u.id)).map((x) => (x.id === id ? { ...x, done: !x.done } : x)));
  revalidatePath("/", "layout");
}
export async function deleteTodo4(id: string): Promise<void> {
  await requirePerm("delete");
  const u = await requireUser();
  await saveTodo4(u.id, (await loadTodo4(u.id)).filter((x) => x.id !== id));
  revalidatePath("/", "layout");
}
/** 끝낸 일 한꺼번에 치우기 */
export async function clearDoneTodo4(): Promise<void> {
  await requirePerm("delete");
  const u = await requireUser();
  await saveTodo4(u.id, (await loadTodo4(u.id)).filter((x) => !x.done));
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------- 메모 (내 것만)
export async function addMemo(text: string): Promise<void> {
  await requirePerm("create");
  const u = await requireUser();
  const t = text.trim().slice(0, 300);
  if (!t) return;
  await saveMemos(u.id, [...(await loadMemos(u.id)), { id: newId(), text: t, star: false }]);
  revalidatePath("/", "layout");
}
export async function starMemo(id: string): Promise<void> {
  await requirePerm("update");
  const u = await requireUser();
  await saveMemos(u.id, (await loadMemos(u.id)).map((x) => (x.id === id ? { ...x, star: !x.star } : x)));
  revalidatePath("/", "layout");
}
export async function deleteMemo(id: string): Promise<void> {
  await requirePerm("delete");
  const u = await requireUser();
  await saveMemos(u.id, (await loadMemos(u.id)).filter((x) => x.id !== id));
  revalidatePath("/", "layout");
}
