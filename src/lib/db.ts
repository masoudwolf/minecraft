import { PrismaClient } from '@prisma/client'

// ---------------------------------------------------------------------------
// Self-healing SQLite client for the long-lived dev server.
//
// History: the dev server process runs for many hours. Its Prisma query
// engine keeps open file descriptors on the SQLite db + WAL/SHM files. When
// those files are lost/replaced mid-session, every WRITE starts failing with
// SQLITE_READONLY_CANTINIT (1032, "attempt to write a readonly database")
// while reads keep working — a stale-engine state that survives HMR because
// the client is cached on globalThis.
//
// This happened twice (2026-09-27). The old "bump the cache key suffix"
// workaround only fixed it until the next occurrence, so the client now
// DETECTS that specific failure and transparently rebuilds itself once,
// then retries the failed operation on the fresh engine.
// ---------------------------------------------------------------------------

const CACHE_KEY = 'prisma_v3'

const globalForPrisma = globalThis as unknown as {
  prisma_v3?: PrismaClient
  prismaReviving?: boolean
}

function isStaleEngineError(e: unknown): boolean {
  const msg = String((e as Error)?.message ?? e ?? '')
  return (
    msg.includes('readonly database') ||
    msg.includes('SQLITE_READONLY') ||
    (e as { extendedCode?: number })?.extendedCode === 1032
  )
}

function createFreshClient(): PrismaClient {
  const client = new PrismaClient({ log: ['error', 'warn'] })

  const extended = client.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          try {
            return await query(args)
          } catch (error) {
            if (!isStaleEngineError(error)) throw error

            // Engine went stale — rebuild once and retry on the new client.
            if (!globalForPrisma.prismaReviving) {
              globalForPrisma.prismaReviving = true
              console.warn('[db] stale SQLite engine detected — rebuilding PrismaClient')
              const fresh = createFreshClient()
              globalForPrisma.prisma_v3 = fresh
              globalForPrisma.prismaReviving = false
            }

            const rebuilt = globalForPrisma.prisma_v3 as unknown as PrismaClient
            if (model) {
              const delegate = (rebuilt as unknown as Record<string, Record<string, unknown>>)[
                model.toLowerCase()
              ]
              if (delegate && typeof delegate[operation] === 'function') {
                return (delegate[operation] as (a: unknown) => Promise<unknown>)(args)
              }
            }
            throw error
          }
        },
      },
    },
  })

  return extended as unknown as PrismaClient
}

export const db = globalForPrisma.prisma_v3 ?? createFreshClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma_v3 = db
