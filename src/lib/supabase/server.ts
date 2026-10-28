/** 서버 전용 Supabase 클라이언트. 브라우저는 Supabase에 직접 접속하지 않고 이 서버만 거친다. */
import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} 환경변수가 없습니다. .env.local을 확인해 주세요 (README 참고).`);
  return v;
}

// 사내망 http 접속이라 secure는 끄고, 스크립트에서 읽지 못하게 httpOnly로 둔다.
export const COOKIE_OPTIONS = { httpOnly: true, sameSite: "lax" as const, secure: false, path: "/" };

/** 로그인한 사용자 권한으로 DB를 쓰는 클라이언트 (RLS 적용). */
export async function createClient() {
  const store = await cookies();
  return createServerClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    cookieOptions: COOKIE_OPTIONS,
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // 서버 컴포넌트에서는 쿠키를 쓸 수 없다. 세션 갱신은 proxy.ts가 맡는다.
        }
      },
    },
  });
}

/** 계정 관리 전용 (service role). RLS를 건너뛰므로 사용자 입력을 그대로 넘기지 않는다. */
export function createAdminClient() {
  return createPlainClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
