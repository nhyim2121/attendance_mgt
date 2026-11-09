/** 직원 캐릭터 그림 (증명사진으로 브라우저에서 만든 PNG). ga_files ref='avatar:<이름>', 관리자만. 원본 사진은 저장하지 않는다. 서버 전용. */
import "server-only";
import { createClient } from "../supabase/server";
import { addFile, loadFiles } from "../총무/mail";

const ref = (name: string) => `avatar:${name}`;

/** 이름 → 파일 번호 (가장 최근 것) */
export async function loadAvatars(): Promise<Record<string, number>> {
  const m = await loadFiles("avatar:");
  return Object.fromEntries([...m].map(([r, files]) => [r.slice(7), files[files.length - 1].id]));
}

export async function removeAvatar(name: string): Promise<void> {
  const sb = await createClient();
  const { error } = await sb.from("ga_files").delete().eq("ref", ref(name));
  if (error) throw new Error(`캐릭터 지우기 실패: ${error.message}`);
}

export async function setAvatar(name: string, png: Uint8Array): Promise<void> {
  await removeAvatar(name);
  await addFile(ref(name), `${name}.png`, "image/png", png);
}

/** 이름을 바꾸면 캐릭터도 따라간다 */
export async function renameAvatar(from: string, to: string): Promise<void> {
  if (from === to) return;
  const sb = await createClient();
  const { error } = await sb.from("ga_files").update({ ref: ref(to), file_name: `${to}.png` }).eq("ref", ref(from));
  if (error) throw new Error(`캐릭터 이름 바꾸기 실패: ${error.message}`);
}
