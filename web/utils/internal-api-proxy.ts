import type { NextRequest } from '@/next/server'
import { Readable } from 'node:stream'
import { parse as parseSetCookie } from 'set-cookie-parser'
import { request as undiciRequest } from 'undici'
import { cookies } from '@/next/headers'
import { NextResponse } from '@/next/server'

const HOP_BY_HOP = new Set([
  'connection',
  'content-length',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'host',
])

function internalBase(): URL | null {
  const raw = process.env.INTERNAL_API_ORIGIN?.trim()
  if (!raw)
    return null
  try {
    return new URL(raw.endsWith('/') ? raw : `${raw}/`)
  }
  catch {
    return null
  }
}

function buildTarget(request: NextRequest): URL | null {
  const base = internalBase()
  if (!base)
    return null
  return new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, base)
}

/** Build header object for undici (fetch() drops multiple Set-Cookie from upstream). */
function filterToUndiciHeaders(incoming: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  incoming.forEach((value, key) => {
    const lk = key.toLowerCase()
    if (HOP_BY_HOP.has(lk))
      return
    if (lk === 'cookie') {
      const cur = out[key]
      out[key] = cur ? `${cur}; ${value}` : value
      return
    }
    out[key] = value
  })
  return out
}

/** Fetch Headers collapses multiple Set-Cookie into one invalid line; use the cookie store instead. */
async function applyUpstreamSetCookies(raw: string | string[] | undefined): Promise<void> {
  if (raw === undefined)
    return
  const lines = Array.isArray(raw) ? raw : [raw]
  const cookieStore = await cookies()
  for (const line of lines) {
    for (const c of parseSetCookie(line, { decodeValues: false })) {
      const options: Parameters<typeof cookieStore.set>[2] = {
        path: c.path || '/',
      }
      if (c.httpOnly)
        options.httpOnly = true
      if (c.secure)
        options.secure = true
      if (typeof c.maxAge === 'number')
        options.maxAge = c.maxAge
      if (c.expires)
        options.expires = c.expires
      // Never forward upstream Domain (e.g. COOKIE_DOMAIN=up.railway.app): PSL treats
      // *.up.railway.app as separate sites; a parent-domain cookie is invalid/rejected.
      if (c.sameSite) {
        const s = String(c.sameSite).toLowerCase()
        if (s === 'strict' || s === 'lax' || s === 'none')
          options.sameSite = s
      }
      cookieStore.set(c.name, c.value, options)
    }
  }
}

export async function proxyRequestToInternalApi(request: NextRequest): Promise<Response> {
  const target = buildTarget(request)
  if (!target) {
    return NextResponse.json(
      { error: 'INTERNAL_API_ORIGIN is not configured' },
      { status: 502 },
    )
  }

  let reqBody: Buffer | undefined
  if (request.method !== 'GET' && request.method !== 'HEAD')
    reqBody = Buffer.from(await request.arrayBuffer())

  const { statusCode, headers, body: resBody } = await undiciRequest(target, {
    method: request.method,
    headers: filterToUndiciHeaders(request.headers),
    body: reqBody?.length ? reqBody : undefined,
    maxRedirections: 0,
  })

  const outHeaders = new Headers()
  const setCookieHeaders: string[] = []
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined)
      continue
    if (key.toLowerCase() === 'set-cookie') {
      // Collect Set-Cookie headers to apply via Next.js cookie store AND pass to response
      if (Array.isArray(value)) {
        setCookieHeaders.push(...value)
      }
      else if (typeof value === 'string') {
        setCookieHeaders.push(value)
      }
      continue
    }
    if (Array.isArray(value)) {
      for (const v of value)
        outHeaders.append(key, v)
    }
    else {
      outHeaders.append(key, value)
    }
  }

  await applyUpstreamSetCookies(setCookieHeaders.length > 0 ? setCookieHeaders : undefined)

  let outBody: BodyInit | null = null
  if (request.method === 'HEAD' || statusCode === 204 || statusCode === 304)
    await resBody.dump({ limit: 0 })
  else
    outBody = Readable.toWeb(resBody)

  return new NextResponse(outBody, {
    status: statusCode,
    headers: outHeaders,
  })
}

export function methodsFromProxy(): Record<string, (req: NextRequest) => Promise<Response>> {
  const h = (req: NextRequest) => proxyRequestToInternalApi(req)
  return {
    GET: h,
    POST: h,
    PUT: h,
    PATCH: h,
    DELETE: h,
    OPTIONS: h,
    HEAD: h,
  }
}
