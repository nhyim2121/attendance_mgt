"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { NODE_KINDS, type NodeKind, ORG_FIELDS, type OrgCompany, type OrgField, type OrgNode, type OrgView } from "@/lib/인사노무/org";
import * as store from "@/lib/store";

export async function saveViewsAction(views: OrgView[]): Promise<{ ok?: string; error?: string }> {
  await requireUser();
  const fields = Object.keys(ORG_FIELDS) as OrgField[];
  const clean = views.filter((v) => String(v.name).trim()).map((v, i) => ({
    id: String(v.id || `v${Date.now()}${i}`).slice(0, 40), name: String(v.name).trim().slice(0, 30),
    title: String(v.title ?? "").trim().slice(0, 60), fields: (v.fields ?? []).filter((f) => fields.includes(f)),
    depts: (v.depts ?? []).map(String), showCount: !!v.showCount, layout: v.layout === "table" ? "table" : "chart",
    exclude: (v.exclude ?? []).map((x) => String(x).trim()).filter(Boolean),
  } satisfies OrgView));
  if (!clean.length) return { error: "보기를 하나 이상 남겨 주세요." };
  if (new Set(clean.map((v) => v.name)).size !== clean.length) return { error: "보기 이름이 겹칩니다." };
  await store.setSetting("org_views", clean);
  revalidatePath("/org");
  return { ok: `조직도 보기 ${clean.length}개를 저장했습니다.` };
}

export async function saveStructureAction(nodes: OrgNode[], company: OrgCompany): Promise<{ ok?: string; error?: string }> {
  await requireUser();
  const str = (x: unknown, n: number) => String(x ?? "").trim().slice(0, n);
  const clean = nodes.map((n, i) => ({
    id: str(n.id, 40) || `n${Date.now()}${i}`, parent: n.parent ? str(n.parent, 40) : null,
    kind: (n.kind in NODE_KINDS ? n.kind : "unit") as NodeKind, label: str(n.label, 40), head: str(n.head, 40),
    dept: str(n.dept, 40), members: (n.members ?? []).map((m) => str(m, 40)).filter(Boolean),
    extra: (n.extra ?? []).map((m) => str(m, 40)).filter(Boolean),
    ...(/^#[0-9a-f]{6}$/i.test(String(n.color)) ? { color: String(n.color) } : {}),
    ...(str(n.headPhone, 20) ? { headPhone: str(n.headPhone, 20) } : {}),
  } satisfies OrgNode));
  if (!clean.length) return { error: "상자를 하나 이상 남겨 주세요." };
  if (clean.some((n) => !n.label)) return { error: "이름이 빈 상자가 있습니다." };
  const ids = new Set(clean.map((n) => n.id));
  if (ids.size !== clean.length) return { error: "상자 번호가 겹칩니다. 새로고침 후 다시 해 주세요." };
  for (const n of clean) {
    if (n.parent && !ids.has(n.parent)) n.parent = null;
    const seen = new Set([n.id]);
    for (let p = n.parent; p; p = clean.find((x) => x.id === p)!.parent) {
      if (seen.has(p)) return { error: `'${n.label}'의 상위가 자기 아래 상자로 돌아옵니다.` };
      seen.add(p);
    }
  }
  const logo = String(company?.logo ?? "");
  if (logo && (!/^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,/.test(logo) || logo.length > 700_000))
    return { error: "로고는 500KB 이하의 그림 파일(PNG·JPG·SVG)만 됩니다." };
  await store.setSetting("org_nodes", clean);
  await store.setSetting("org_company", { name: str(company?.name, 60), nameEn: str(company?.nameEn, 80), logo });
  revalidatePath("/org");
  return { ok: `조직 구조(상자 ${clean.length}개)를 저장했습니다.` };
}
