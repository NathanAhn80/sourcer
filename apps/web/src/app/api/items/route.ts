import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  computePerformanceMultiple,
  gradeFromMultiple,
  gradeFromMultipleXhs,
} from "@/lib/grades";

const collectSchema = z.object({
  platform: z.enum(["threads", "xiaohongshu"]),
  externalId: z.string().min(1),
  url: z.string().url(),
  authorHandle: z.string().optional().nullable(),
  authorName: z.string().optional().nullable(),
  caption: z.string().optional().nullable(),
  thumbnailUrl: z.string().optional().nullable(),
  mediaUrls: z.array(z.string()).optional().default([]),
  views: z.number().int().nonnegative().optional().nullable(),
  likes: z.number().int().nonnegative().optional().nullable(),
  replies: z.number().int().nonnegative().optional().nullable(),
  reposts: z.number().int().nonnegative().optional().nullable(),
  followers: z.number().int().nonnegative().optional().nullable(),
  avgLikes: z.number().nonnegative().optional().nullable(),
  metrics: z.record(z.unknown()).optional().default({}),
});

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET(request: Request) {
  const user = await requireUser(request);
  if (!user) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "Invalid API key" } },
      { status: 401, headers: corsHeaders() },
    );
  }

  const { searchParams } = new URL(request.url);
  const platform = searchParams.get("platform");

  const items = await prisma.item.findMany({
    where: {
      userId: user.id,
      ...(platform ? { platform } : {}),
    },
    orderBy: { collectedAt: "desc" },
    take: 200,
  });

  return NextResponse.json(
    {
      data: items.map((item) => ({
        ...item,
        mediaUrls: safeJsonArray(item.mediaUrls),
        metrics: safeJsonObject(item.metricsJson),
      })),
    },
    { headers: corsHeaders() },
  );
}

export async function POST(request: Request) {
  const user = await requireUser(request);
  if (!user) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "Invalid API key" } },
      { status: 401, headers: corsHeaders() },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "bad_request", message: "Invalid JSON" } },
      { status: 400, headers: corsHeaders() },
    );
  }

  const parsed = collectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "validation", message: parsed.error.message } },
      { status: 400, headers: corsHeaders() },
    );
  }

  const input = parsed.data;
  const multiple = computePerformanceMultiple({
    views: input.views,
    likes: input.likes,
    followers: input.followers,
    avgLikes: input.avgLikes,
  });
  const grade =
    input.platform === "xiaohongshu"
      ? gradeFromMultipleXhs(multiple)
      : gradeFromMultiple(multiple);

  const item = await prisma.item.upsert({
    where: {
      userId_platform_externalId: {
        userId: user.id,
        platform: input.platform,
        externalId: input.externalId,
      },
    },
    create: {
      userId: user.id,
      platform: input.platform,
      externalId: input.externalId,
      url: input.url,
      authorHandle: input.authorHandle ?? null,
      authorName: input.authorName ?? null,
      caption: input.caption ?? null,
      thumbnailUrl: input.thumbnailUrl ?? null,
      mediaUrls: JSON.stringify(input.mediaUrls),
      views: input.views ?? null,
      likes: input.likes ?? null,
      replies: input.replies ?? null,
      reposts: input.reposts ?? null,
      followers: input.followers ?? null,
      performanceMultiple: multiple,
      grade,
      metricsJson: JSON.stringify(input.metrics),
    },
    update: {
      url: input.url,
      authorHandle: input.authorHandle ?? null,
      authorName: input.authorName ?? null,
      caption: input.caption ?? null,
      thumbnailUrl: input.thumbnailUrl ?? null,
      mediaUrls: JSON.stringify(input.mediaUrls),
      views: input.views ?? null,
      likes: input.likes ?? null,
      replies: input.replies ?? null,
      reposts: input.reposts ?? null,
      followers: input.followers ?? null,
      performanceMultiple: multiple,
      grade,
      metricsJson: JSON.stringify(input.metrics),
      collectedAt: new Date(),
    },
  });

  return NextResponse.json(
    {
      data: {
        ...item,
        mediaUrls: safeJsonArray(item.mediaUrls),
        metrics: safeJsonObject(item.metricsJson),
      },
    },
    { status: 201, headers: corsHeaders() },
  );
}

function safeJsonArray(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function safeJsonObject(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}
