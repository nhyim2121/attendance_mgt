/** 요청마다 로그인 세션을 갱신하고, 로그인하지 않았으면 로그인 화면으로 보낸다. */
import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

const COOKIE_OPTIONS = { httpOnly: true, sameSite: "lax" as const, secure: false, path: "/" };

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    cookieOptions: COOKIE_OPTIONS,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await supabase.auth.getClaims();
  // 입찰 자동 불러오기는 로그인 대신 비밀 머리글로 확인한다 (route.ts)
  const isLogin = request.nextUrl.pathname.startsWith("/login") || request.nextUrl.pathname === "/api/bid/fetch";
  if (!data?.claims && !isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|fonts/|logo.png).*)"],
};
