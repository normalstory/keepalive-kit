// 2차·수동 — 외부 cron 서비스와 알림 버튼이 호출하는 엔드포인트.
//
// 설계 의도: **비밀이 필요 없을 만큼 무해하게** 만든다 (README 원칙 2).
//   · 인증 없음 · 비밀 없음 · 반환 데이터 없음 (`select 1` 한 번)
//   · 남용의 최대치가 "DB 를 깨우는 것" 인데 그게 이 엔드포인트의 목적이다
//   · 연타만 쿨다운으로 막는다
//
// 덕분에 외부 업체 선택이 "신뢰 문제" 가 아니라 "가용성 문제" 로 내려온다.

import { prisma } from "@/lib/prisma"; // ← 각자의 DB 클라이언트로 교체

export const dynamic = "force-dynamic";
export const maxDuration = 15;

// 인스턴스별 메모리라 완벽하진 않다. 목적은 사고성 연타 차단이므로 이 정도면 충분하다.
let lastRunMs = 0;
const COOLDOWN_MS = 10_000;

export async function GET(req: Request): Promise<Response> {
  const wantsHtml = (req.headers.get("accept") ?? "").includes("text/html");

  // 호출 출처 — 1차/2차/수동 중 어느 층이 돌고 있는지 로그에서 구분한다.
  // 값은 신뢰하지 않는다. 로그용일 뿐 분기에 쓰지 않는다.
  const via = new URL(req.url).searchParams.get("via")?.slice(0, 24) ?? "unknown";
  console.info(`[wake] via=${via} ua=${(req.headers.get("user-agent") ?? "").slice(0, 60)}`);

  const now = Date.now();
  if (now - lastRunMs < COOLDOWN_MS) {
    return respond(wantsHtml, { ok: true, message: "방금 깨웠어요." });
  }
  lastRunMs = now;

  try {
    await prisma.$queryRaw`select 1`;
    return respond(wantsHtml, { ok: true, message: "깨웠어요. DB 가 정상 응답합니다." });
  } catch (e) {
    return respond(
      wantsHtml,
      { ok: false, message: "DB 가 응답하지 않아요.", detail: e instanceof Error ? e.message.slice(0, 200) : "" },
      503,
    );
  }
}

// 알림 버튼(ntfy http 액션)은 JSON 이면 충분하지만, 북마크로 브라우저에서 열었을 때
// 날것의 JSON 보다 한 줄 안내가 낫다.
function respond(html: boolean, body: Record<string, unknown>, status = 200): Response {
  if (!html) return Response.json(body, { status });
  const mark = body.ok ? "✓" : "⚠";
  const color = body.ok ? "#16a34a" : "#dc2626";
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<div style="font:15px -apple-system,sans-serif;display:grid;place-items:center;height:100vh;margin:0">
<div style="text-align:center"><div style="font-size:48px;color:${color}">${mark}</div>
<p>${String(body.message)}</p></div></div>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}
