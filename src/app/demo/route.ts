import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = "/dashboard";
  url.search = "";

  const response = NextResponse.redirect(url);

  // Set demo mode session cookie (active for 7 days)
  response.cookies.set("leadrescue_demo", "true", {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });

  return response;
}
