import { prisma } from "./db";

export async function requireUser(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  const key = match?.[1]?.trim();
  if (!key) {
    return null;
  }
  return prisma.user.findUnique({ where: { apiKey: key } });
}
