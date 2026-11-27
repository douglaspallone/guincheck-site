"use client"

import { usePathname } from "next/navigation"
import { Analytics } from "@vercel/analytics/next"

// Páginas legais e o formulário de exclusão não carregam analytics (nem qualquer rastreamento).
const NO_ANALYTICS = ["/termos", "/privacidade", "/exclusao-de-conta"]

export function ConditionalAnalytics() {
  const pathname = usePathname() || ""
  const blocked = NO_ANALYTICS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  return blocked ? null : <Analytics />
}
