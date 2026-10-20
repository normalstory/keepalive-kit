# Supabase — 무료 플랜 프로젝트 정지

- **last-verified**: 2026-10-20
- **출처**: https://supabase.com/docs/guides/platform/free-project-pausing

## 정지 조건

| 항목 | 값 |
|------|-----|
| 판정 창 | **지난 1주** (`over the past week`) |
| 조건 | 해당 기간 DB 활동이 충분하지 않으면 정지 |
| 사전 경고 | **정지 약 1주 전 경고 메일** (`roughly one week before`) + 정지 시점 메일, 총 2통 |
| 복구 | 대시보드에서 **수동** 재개 |

## 무엇이 "활동"인가

- Supabase 대시보드로 프로젝트 방문
- 프로젝트로의 API 호출
- 연결된 애플리케이션의 요청

문서 표현: *"typically a few user requests to the database each day over the previous
week is enough"* — 정확한 임계값은 공개돼 있지 않다. **하루 1회면 7배 여유**다.

## ⚠ pg_cron은 해결책이 아니다

pg_cron은 **DB 안에서** 도는 스케줄러다. 프로젝트가 정지되면 Postgres 인스턴스가
멈추므로 pg_cron도 같이 멈춘다. **반드시 바깥에서 들어오는 요청**이어야 한다.

이것이 이 저장소가 존재하는 이유다 — 가장 직관적인 해법이 작동하지 않는다.

## 함의

**경고 메일이 1주 전에 온다**는 점이 중요하다. 즉 플랫폼 자체가 이미 dead man's
switch 역할을 한다. 별도 감시 장치를 만들기 전에 이걸 먼저 계산에 넣을 것
(README 원칙 8).

## 유사 정책이 있는 서비스

아직 이 저장소에서 검증하지 않았다. 기여 환영:

- Neon (무료 티어 자동 suspend)
- Render (무료 웹 서비스 idle spin-down)
- Fly.io (머신 auto-stop)
- Railway / PlanetScale

## ⚠ 표현 주의 — "7일"은 문서의 표현이 아니다

많은 2차 자료가 "7 days"라고 쓰지만, 공식 문서는 **`over the past week`** /
**`roughly one week before the pause`** 라고만 적는다. 실질은 같아도 **검사와 인용은
원문 표현으로** 해야 한다.

2026-10-20 `doctor.mjs` 가 `/7\s*day/` 로 검사하다가 실패했고, 확인 결과 정책 변경이
아니라 **이 문서(와 doctor)의 요약이 부정확**한 것이었다. doctor 가 잡아낸 최초 사례다.

## 검증 방법

`scripts/doctor.mjs` 가 위 문서 페이지에서 `past week` / `one week` / `paus` 문구를
확인한다. 사라지면 정책이 바뀐 것이므로 이 파일을 갱신해야 한다.
