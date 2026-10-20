#!/usr/bin/env node
//
// keepalive-kit doctor — 이 저장소가 적어 둔 주장이 아직 유효한지 다시 확인한다.
//
// 공급자 정책과 동작은 수시로 바뀐다. 문서를 자주 고치는 것으로는 따라갈 수 없으므로,
// 문서가 스스로 "나 낡았다" 고 말하게 만든다.
//
//   node scripts/doctor.mjs            공개 문서 기반 검사 (네트워크만 필요)
//   NTFY_TOPIC=xxx node scripts/doctor.mjs --live   실제 동작까지 검사 (약 25초 소요)
//
// 의존성 0 — node 내장만 사용한다.
//
// 검사가 실패하면 그 지점이 곧 기여 시작점이다. providers/*.md 의 last-verified 를
// 갱신하고 무엇이 바뀌었는지 적어 주세요.

const LIVE = process.argv.includes("--live");
const TIMEOUT_MS = 15_000;

let pass = 0;
let fail = 0;
const failures = [];

function ok(label, detail = "") {
  pass++;
  console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ""}`);
}

function bad(label, detail) {
  fail++;
  failures.push({ label, detail });
  console.log(`  ✗ ${label}`);
  if (detail) console.log(`      ${detail}`);
}

async function fetchText(url) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "user-agent": "keepalive-kit-doctor" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// ── 문서 주장 검사 ────────────────────────────────────────────────
//
// 공개 문서를 받아 핵심 문구가 남아 있는지 본다. 문구가 사라졌다 = 정책이 바뀌었을
// 가능성이 높다. 문서 리라이팅만으로도 실패할 수 있으나, 그때도 사람이 한 번 보는 게 맞다.

const DOC_CLAIMS = [
  {
    file: "providers/supabase.md",
    claim: "무료 플랜은 '지난 1주' 활동 부족 시 정지된다",
    url: "https://supabase.com/docs/guides/platform/free-project-pausing",
    // ⚠ 문서는 "7 days" 라고 쓰지 않는다 — "over the past week" / "roughly one week
    //   before the pause" 다. 2026-10-20 doctor 가 이 불일치를 잡아냈다 (최초 사례).
    //   요약문이 아니라 원문 표현으로 검사할 것.
    expect: [/past week/i, /one week/i, /paus/i],
  },
  {
    file: "providers/vercel-cron.md",
    claim: "Vercel Cron 의 시간대는 항상 UTC",
    url: "https://vercel.com/docs/cron-jobs",
    expect: [/timezone is always UTC/i],
  },
  {
    file: "providers/vercel-cron.md",
    claim: "Hobby 는 크론이 하루 1회 · 시 단위 정밀도",
    url: "https://vercel.com/docs/cron-jobs/usage-and-pricing",
    expect: [/once per day/i, /Hobby/],
  },
  {
    file: "providers/vercel-cron.md",
    claim: "Hobby 런타임 로그 보존은 1시간",
    url: "https://vercel.com/docs/logs/runtime",
    expect: [/1 hour of logs/i],
  },
  {
    file: "providers/github-actions.md",
    claim: "스케줄 워크플로는 60일 무활동 시 자동 비활성",
    url: "https://docs.github.com/en/actions/using-workflows/disabling-and-enabling-a-workflow",
    expect: [/60 days/i],
  },
];

async function checkDocs() {
  console.log("\n▶ 문서 주장 검사");
  for (const c of DOC_CLAIMS) {
    try {
      const body = await fetchText(c.url);
      const missing = c.expect.filter((re) => !re.test(body));
      if (missing.length === 0) {
        ok(c.claim);
      } else {
        bad(
          c.claim,
          `${c.file} — 문구를 못 찾음: ${missing.map(String).join(", ")}\n      ${c.url}`,
        );
      }
    } catch (e) {
      bad(c.claim, `${c.file} — 문서를 받지 못함: ${e.message}\n      ${c.url}`);
    }
  }
}

// ── 실동작 검사 (--live) ──────────────────────────────────────────

const NTFY_SERVER = (process.env.NTFY_SERVER ?? "https://ntfy.sh").replace(/\/$/, "");

async function ntfyPublish(body, extraHeaders = {}) {
  const res = await fetch(NTFY_SERVER, {
    method: "POST",
    headers: { "content-type": "application/json", ...extraHeaders },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`publish HTTP ${res.status}`);
  return res.json();
}

async function ntfyPoll(topic, since = "2m") {
  const text = await fetchText(
    `${NTFY_SERVER}/${topic}/json?poll=1&since=${since}`,
  );
  return text
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

async function checkLive() {
  const topic = process.env.NTFY_TOPIC;
  console.log("\n▶ 실동작 검사 (--live)");

  if (!topic) {
    console.log("  · NTFY_TOPIC 미설정 — ntfy 검사 건너뜀");
    console.log("    NTFY_TOPIC=<토픽> node scripts/doctor.mjs --live");
    return;
  }

  const stamp = Math.random().toString(36).slice(2, 8);

  // 1) 공개 토픽은 읽기도 가능한가 (providers/ntfy.md 주장)
  try {
    const marker = `doctor-read-${stamp}`;
    await ntfyPublish({ topic, title: marker, message: "doctor", priority: 1 });
    await new Promise((r) => setTimeout(r, 1500));
    const msgs = await ntfyPoll(topic);
    if (msgs.some((m) => m.title === marker)) {
      ok(
        "공개 토픽은 과거 메시지가 읽힌다",
        "→ 알림 본문에 제3자 개인정보 금지 (원칙 4)",
      );
    } else {
      bad(
        "공개 토픽은 과거 메시지가 읽힌다",
        "providers/ntfy.md — 읽히지 않았다. 정책이 바뀌었을 수 있으니 확인 필요",
      );
    }
  } catch (e) {
    bad("공개 토픽 읽기 검사", e.message);
  }

  // 2) 예약 취소는 신뢰할 수 없다 (providers/ntfy.md 핵심 주장)
  //
  //    ⚠ 1회 표본으로 단정하지 않는다. 처음 이 동작을 조사할 때 2회 연속 "도착" 을 보고
  //    "취소는 동작하지 않는다" 고 결론냈는데, 표본을 5회로 늘리니 3/5 도착이었다 —
  //    즉 비결정적이다. 같은 실수를 반복하지 않도록 3회 반복한다.
  //
  //    판정: 한 번이라도 도착 → 신뢰 불가(현재 결론 유지, 통과)
  //          3회 모두 취소 성공 → ntfy 가 고쳤을 수 있음(실패로 띄워 재검토 유도)
  const TRIALS = 3;
  try {
    let arrivedCount = 0;
    for (let i = 1; i <= TRIALS; i++) {
      const sched = await ntfyPublish(
        { topic, title: `doctor-cancel-${stamp}-${i}`, message: "doctor", priority: 1 },
        { delay: "12s" },
      );
      const del = await fetch(`${NTFY_SERVER}/${topic}/${sched.id}`, {
        method: "DELETE",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const delBody = await del.json().catch(() => ({}));
      await new Promise((r) => setTimeout(r, 22_000));
      const msgs = await ntfyPoll(topic, "3m");
      const arrived = msgs.some((m) => m.id === sched.id);
      if (arrived) arrivedCount++;
      console.log(
        `    #${i} del=${del.status}/${delBody.event ?? "?"} → ${arrived ? "도착(취소 실패)" : "미도착(취소 성공)"}`,
      );
    }

    if (arrivedCount > 0) {
      ok(
        "예약 취소는 신뢰할 수 없다",
        `${TRIALS}회 중 ${arrivedCount}회 도착 — dead man's switch 로 쓰지 말 것`,
      );
    } else {
      bad(
        "예약 취소는 신뢰할 수 없다",
        `providers/ntfy.md — ${TRIALS}회 모두 취소에 성공했다. ntfy 가 동작을 고쳤을 수 있다.\n` +
          "      사실이라면 예약+취소 dead man's switch 가 가능해진다 — 표본을 더 늘려 확인 후 문서 갱신",
      );
    }
  } catch (e) {
    bad("예약 취소 동작 검사", e.message);
  }
}

// ── 실행 ──────────────────────────────────────────────────────────

console.log("keepalive-kit doctor");
console.log("문서에 적힌 주장이 아직 유효한지 확인합니다.");

await checkDocs();
if (LIVE) await checkLive();
else console.log("\n· 실동작 검사는 --live 로 실행 (ntfy 발행/취소를 실제로 시도)");

console.log(`\n${pass} 통과 / ${fail} 실패`);

if (fail > 0) {
  console.log("\n실패한 항목은 공급자 동작이 바뀌었다는 신호일 수 있습니다.");
  console.log("해당 providers/*.md 의 last-verified 와 내용을 갱신해 주세요:");
  for (const f of failures) console.log(`  · ${f.label}`);
}

process.exit(fail === 0 ? 0 : 1);
