// 1차 — 플랫폼 내장 크론이 호출하는 엔드포인트.
//
// Vercel 기준: 프로젝트에 CRON_SECRET 환경변수를 두면 플랫폼이 자동으로
// `Authorization: Bearer <secret>` 을 붙여 호출한다. (환경변수 변경은 재배포 후 반영)
//
// ⚠ 이 URL 을 외부 cron 서비스에 등록하지 말 것 — 시크릿이 제3자 DB 에 저장된다.
//   외부용은 wake-route.ts 를 쓴다.
//
// 로그를 꼭 남길 것. 인증 실패는 DB 를 건드리지 않고 즉시 반환하므로, 로그가 없으면
// "아주 빨리 성공" 과 "막혀서 아무것도 안 함" 을 소요시간으로 구분할 수 없다.

import { prisma } from "@/lib/prisma"; // ← 각자의 DB 클라이언트로 교체

export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      console.warn(
        `[keep-alive] 401 unauthorized — header=${auth ? "present-but-mismatch" : "absent"}`,
      );
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const startedAt = Date.now();
  try {
    // 가장 가벼운 실제 쿼리. 테이블을 읽지 않아 스키마 변경에 영향받지 않는다.
    await prisma.$queryRaw`select 1`;
    const ms = Date.now() - startedAt;
    console.info(`[keep-alive] ok ms=${ms} secret=${secret ? "on" : "off"}`);
    return Response.json({ ok: true, ms, at: new Date().toISOString() });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[keep-alive] DB 응답 실패:", message);

    // 알림을 붙인다면 여기. 단 링크 목적지는 DB 에 의존하지 않는 곳으로 (원칙 5).
    // await notifyOps({ title: "DB 응답 실패", clickPath: "/api/wake" });

    return Response.json({ ok: false, error: message.slice(0, 200) }, { status: 503 });
  }
}
