import { PrismaClient } from '@prisma/client'

// NOTE: the global cache key is versioned (prisma_v2). The previous key
// (`prisma`) held a Prisma engine process whose SQLite file descriptors went
// stale (SQLITE_READONLY_CANTINIT on every write after the -wal/-shm files
// were lost mid-session). Renaming the key forces any hot-reloaded route to
// construct a fresh client with clean file descriptors. Bump the suffix if
// this ever happens again.
const globalForPrisma = globalThis as unknown as {
  prisma_v2: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma_v2 ??
  new PrismaClient({
    log: ['query'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma_v2 = db
