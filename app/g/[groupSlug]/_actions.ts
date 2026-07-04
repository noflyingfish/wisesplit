"use server";

import { cookies } from "next/headers";

export async function clearGroupCookie() {
  const cookieStore = await cookies();
  for (const cookie of cookieStore.getAll()) {
    if (cookie.name.startsWith("wisesplit_")) {
      cookieStore.delete(cookie.name);
    }
  }
}
