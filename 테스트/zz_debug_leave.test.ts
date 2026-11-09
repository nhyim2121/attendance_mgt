// 임시 디버그 (삭제 예정)
import { test, vi } from "vitest";
import { createClient as plain } from "@supabase/supabase-js";
process.loadEnvFile(".env.local");
const admin = plain(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => {} }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => admin, createAdminClient: () => admin }));
vi.mock("react", async (orig) => ({ ...(await orig<object>()), cache: <T>(f: T) => f }));
test("dump", async () => {
  const { loadBase, getLeavePolicy } = await import("@/lib/인사노무/data");
  const store = await import("@/lib/store");
  const { leaveBalances } = await import("@/lib/인사노무/vacation");
  const [base, policy, adj] = await Promise.all([loadBase(), getLeavePolicy(), store.loadAdjusts()]);
  const bal = leaveBalances(base.employees, base.leaves, adj, 2026, "2026-11-04", policy);
  const fs = await import("node:fs");
  fs.writeFileSync(process.env.OUT!, JSON.stringify({ policy, adj: adj.filter((a) => a.fy === 2026), emps: base.employees.map((e) => [e.name, e.joinDate]),
    bal: bal.map((b) => ({ name: b.name, annual: b.annual, monthly: b.monthly, later: b.monthlyLater, adjust: b.adjust, expired: b.expired, total: b.total, used: b.used, planned: b.planned, remain: b.remain,
      items: b.items.map((i) => [i.day, i.type, i.applied, i.days, i.hours, i.content.replace(/\n/g, " | "), i.src]) })) }, null, 1));
}, 60000);
