# Vercel Cron — 1차 스케줄러로 쓸 때의 제약

- **last-verified**: 2026-10-20
- **출처**: https://vercel.com/docs/cron-jobs · `/cron-jobs/usage-and-pricing` ·
  `/cron-jobs/manage-cron-jobs` · `/logs/runtime` · `/cli/crons`

## 장점 — 휴면에 강하다

**배포가 살아 있으면 계속 돈다.** 커밋 활동과 무관하다. 무료로 쓸 수 있는 수단 중
이 성질을 가진 거의 유일한 선택지다 (GitHub Actions와의 결정적 차이).

## Hobby 플랜 제약

| 항목 | Hobby | Pro |
|------|-------|-----|
| 프로젝트당 크론 수 | 100 | 100 |
| **최소 주기** | **하루 1회** | 1분 |
| **실행 정밀도** | **시(hour) 단위 ±59분** | 분 단위 |
| **런타임 로그 보존** | **1시간** | 1일 |

- 하루 1회보다 잦은 표현식은 **배포가 실패한다** (선택이 아니라 강제)
- `0 3 * * *` 는 `03:00:00`이 아니라 **`03:00:00~03:59:59` 중 임의 시각**

## ⚠ 시간대는 항상 UTC

> *"The timezone is always UTC"* — 설정 불가.

대시보드가 "At 03:00 AM"으로 표시해도 **UTC**다. 외부 스케줄러(대개 로컬 시간대)와
나란히 두면 반드시 헷갈린다.

```
0 3 * * *  (Vercel)  =  03:00 UTC  =  12:00 KST
```

## ⚠ 전달은 best effort

> 간헐적 네트워크 오류로 요청이 함수에 닿지 않을 수 있고, **그 경우 런타임 로그가
> 생성되지 않는다.** 같은 실행이 두 번 호출될 수도 있다.

→ 크론 핸들러는 **멱등(idempotent)** 이어야 한다. `select 1` 은 자연히 멱등이다.

## 관측 가능성 — 이게 가장 큰 함정

로그 보존 1시간 + 시간대 단위 실행 + best effort가 겹치면:

> **"로그에 없다"가 "실패했다"를 뜻하지 않는다.**
> 성공 후 보존 만료 / 인증 실패 / 아예 미실행, 셋 다 가능하다.

예정 실행을 사후에 확인하는 것은 사실상 불가능하다. **지금 돌려서 지금 보는 것**이
유일하게 실용적이다:

```bash
npx vercel link                              # ⚠ 아래 주의 참조
npx vercel crons run /api/cron/keep-alive    # 즉시 트리거 (beta)
# → 1시간 안에 Logs 확인
```

실측 예 (2026-10-20):
```
GET 200 /api/cron/keep-alive
[keep-alive] ok ms=216 secret=on
```
`secret=on` = Bearer 전송·검증 통과 · `ms=216` = 실제 DB 왕복
(인증 실패였다면 DB를 건드리지 않아 `ms` 자체가 없다).

## ⚠ `vercel link` 주의

`vercel link` 는 **로그인한 계정이 접근 가능한 프로젝트 중에서** 고른다. 계정이 여러 개면
엉뚱한 프로젝트에 연결되고, 그 상태로 `vercel deploy` 하면 **다른 프로젝트에 배포된다.**

실제 사고 (2026-10-20): 다른 계정으로 로그인해 `hellovercels-projects/normalstory` 에
연결됐고 `crons run` 이 "No cron jobs found" 로 실패했다. 연결 직후
`.vercel/project.json` 의 `projectName` 을 반드시 확인할 것.

`vercel link` 는 `.env.local` 에 `VERCEL_OIDC_TOKEN` 을 추가한다 (기존 변수는 보존).

## 시크릿 보호

프로젝트에 `CRON_SECRET` 환경변수를 두면 Vercel이 자동으로
`Authorization: Bearer <secret>` 헤더를 붙여 호출한다. 핸들러에서 비교하면 된다.

⚠ 환경변수 변경은 **재배포 후** 반영된다.

## 검증 방법

`scripts/doctor.mjs` 가 공식 문서에서 `timezone is always UTC` / `once per day` /
`1 hour of logs` 문구를 확인한다.
