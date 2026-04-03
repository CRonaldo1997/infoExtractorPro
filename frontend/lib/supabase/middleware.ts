import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
    let supabaseResponse = NextResponse.next({
        request,
    });

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value }) =>
                            request.cookies.set(name, value)
                        );
                        supabaseResponse = NextResponse.next({
                            request,
                        });
                        cookiesToSet.forEach(({ name, value, options }) =>
                            supabaseResponse.cookies.set(name, value, options)
                        );
                    } catch {
                        // Cookie values with non-ASCII characters (e.g. Chinese username in
                        // user_metadata) cannot be represented as ByteString. This is safe to
                        // ignore – the session token itself is base64url-encoded and will be
                        // handled correctly on the next request.
                    }
                },
            },
        }
    );

    // 刷新 session，保持 token 不过期
    const {
        data: { user },
    } = await supabase.auth.getUser();

    const pathname = request.nextUrl.pathname;

    // 未登录用户访问受保护路由时，重定向到登录页
    const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/register');
    const isProtectedRoute = !isAuthPage;

    if (!user && isProtectedRoute) {
        const url = request.nextUrl.clone();
        url.pathname = '/login';
        return NextResponse.redirect(url);
    }

    // 已登录用户访问登录/注册页，重定向到首页
    if (user && isAuthPage) {
        const url = request.nextUrl.clone();
        url.pathname = '/';
        return NextResponse.redirect(url);
    }

    return supabaseResponse;
}
