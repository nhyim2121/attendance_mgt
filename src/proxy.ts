/** 요청마다 로그인 세션을 갱신하고, 로그인하지 않았으면 로그인 화면으로 보낸다.
 *  계정별 권한(lib/perm.ts): 직접 권한을 정한 계정이 '읽기' 없는 영역의 화면을 열면 처음 화면으로 돌려보낸다.
 *  지금 주소는 x-path 머리글로 넘겨서, 서버 동작(requirePerm)이 어느 영역의 일인지 알 수 있게 한다. */
import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { areaOfPath } from "@/lib/대시/menu";
import { allows, isCustom, type PermTable, permsOf } from "@/lib/perm";

const COOKIE_OPTIONS = { httpOnly: true, sameSite: "lax" as const, secure: false, path: "/" };

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const headers = new Headers(request.headers);
  headers.set("x-path", encodeURI(path));
  let response = NextResponse.next({ request: { headers } });
  const supabase = createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    cookieOptions: COOKIE_OPTIONS,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request: { headers } });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await supabase.auth.getClaims();
  // 입찰 자동 불러오기는 로그인 대신 비밀 머리글로 확인한다 (route.ts)
  const isLogin = path.startsWith("/login") || path === "/api/bid/fetch";
  if (!data?.claims && !isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // 화면 열기 권한 (직접 정한 계정만, 화면 요청만). 입찰(/bid)은 따로 정한 규칙(canBid)을 따른다.
  const page = request.method === "GET" && !path.startsWith("/api") && !path.startsWith("/bid") && !isLogin;
  if (data?.claims && page) {
    const area = areaOfPath(path);
    if (area) {
      const [{ data: prof }, { data: set }] = await Promise.all([
        supabase.from("profiles").select("login_id, role").eq("id", data.claims.sub).maybeSingle(),
        supabase.from("settings").select("value").eq("key", "perms").maybeSingle(),
      ]);
      const table = (set?.value ?? null) as PermTable | null;
      if (prof && isCustom(table, prof.login_id, prof.role) && !allows(permsOf(table, prof.login_id, prof.role), area, "read")) {
        const url = request.nextUrl.clone();
        url.pathname = "/";
        url.search = `?denied=${area}`;
        return NextResponse.redirect(url);
      }
    }
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|fonts/|logo.png).*)"],
};
