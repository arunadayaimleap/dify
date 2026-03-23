import type { NextRequest } from '@/next/server'
import { methodsFromProxy } from '@/utils/internal-api-proxy'

export const dynamic = 'force-dynamic'

const m = methodsFromProxy()
export const GET = (req: NextRequest) => m.GET(req)
export const POST = (req: NextRequest) => m.POST(req)
export const PUT = (req: NextRequest) => m.PUT(req)
export const PATCH = (req: NextRequest) => m.PATCH(req)
export const DELETE = (req: NextRequest) => m.DELETE(req)
export const OPTIONS = (req: NextRequest) => m.OPTIONS(req)
export const HEAD = (req: NextRequest) => m.HEAD(req)
