# GitHub Actions — 스케줄 워크플로의 자동 비활성

- **last-verified**: 2026-10-18
- **출처**: https://docs.github.com/en/actions/using-workflows/disabling-and-enabling-a-workflow

## ⚠ 결론부터: 이중화 수단으로 부적합하다

GitHub Actions는 keep-alive 가이드에서 가장 흔히 추천되는 수단이다. 그런데:

> **스케줄 워크플로는 저장소에 60일간 활동이 없으면 자동 비활성된다.**

그리고 결정적으로:

> **워크플로 실행 자체는 "활동"으로 인정되지 않는다. 커밋만 타이머를 리셋한다.**
> 이슈 생성·PR 머지·태그·스타는 모두 불인정.

즉 **매일 돌고 있어도 60일간 커밋이 없으면 꺼진다.**

## 왜 이게 치명적인가

이 저장소가 다루는 시나리오는 "MVP를 만들어 두고 방치"다. 그 상황에서는:

```
Day 0    마지막 커밋
Day 7    Supabase 정지 위험 시작 → GH Actions가 막아 줌
Day 60   GH Actions 스케줄 자동 비활성
Day 67   Supabase 정지
```

**두 장치의 실패 모드가 독립이 아니다.** 더 오래 버티는 쪽도 결국 같은 이유(방치)로
죽는다. 이중화의 의미가 없다.

## 우회 방법과 그 비용

| 방법 | 동작 | 비용 |
|------|------|------|
| 워크플로가 타임스탬프 파일을 자가 커밋 | ✅ | **커밋 로그 오염**. 기본 `GITHUB_TOKEN` 커밋은 새 워크플로를 트리거하지 않는 등 함정도 있다 |
| 외부에서 `workflow_dispatch` 호출 | ✅ (활동으로 인정, 시각도 정확) | **외부 스케줄러가 또 필요** → 순환 |

전용 액션도 존재한다 (예: `efrecon/gh-action-keepalive`, Marketplace의 `Keepalive
Workflow`). 그만큼 흔한 함정이라는 뜻이다.

## 그럼 언제 쓰나

- **활발히 개발 중인 저장소** — 60일간 커밋이 없을 일이 없으면 문제되지 않는다
- 정확한 시각이 필요 없는 작업 (GH Actions 크론은 부하에 따라 지연된다)

## 참고: 공개/비공개 저장소

문서 원문은 *"In a public repository, scheduled workflows are automatically disabled
when no repository activity has occurred in 60 days"* 로 **공개 저장소**를 명시한다.
비공개 저장소에도 같은 정책이 적용된다는 2차 자료가 다수이나, 공식 문서에서 명시적으로
확인되지는 않았다. **확실한 쪽으로 가정하고 설계할 것.**

## 검증 방법

`scripts/doctor.mjs` 가 위 문서 페이지에서 `60 days` 문구를 확인한다.
