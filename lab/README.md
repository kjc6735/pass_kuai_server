# 실험 환경 (lab)

서버에 부하를 걸고 Grafana로 보는 환경이에요. 실제 Claude 대신 가짜 서버(`mock-llm`)를 써서 돈이 들지 않아요.

```
k6 ──▶ server(NestJS) ──▶ mock-llm(가짜 Claude)
           │                   │
           └──── /metrics ─────┴──▶ Prometheus ──▶ Grafana
k6 ─────────── 결과(remote write) ──▶ Prometheus
```

## 준비

Docker Desktop만 있으면 돼요. k6, Prometheus, Grafana는 컨테이너로 실행돼요.

## 켜고 끄기

```bash
npm run lab:up      # 서버, 가짜 Claude, Prometheus, Grafana를 빌드하고 켠다
npm run lab:down    # 끈다 (데이터는 남는다)
npm run lab:reset   # 끄고 쌓인 지표도 지운다
npm run lab:logs    # 서버와 가짜 Claude 로그
```

| 주소 | 내용 |
| --- | --- |
| http://localhost:3001 | Grafana. 로그인 없이 `pass_kuai 서버` 대시보드가 열린다 |
| http://localhost:9090 | Prometheus. Status > Targets에서 server, mock-llm이 UP인지 확인 |
| http://localhost:3000 | 서버 (`/health`, `/metrics`) |
| http://localhost:8080 | 가짜 Claude (`/config`, `/metrics`) |

서버 컨테이너는 CPU 1개, 메모리 512MB로 고정돼 있어요. 실험마다 조건을 같게 하기 위해서예요.

## 부하 걸기

```bash
npm run load:smoke                               # 연결 확인. 초당 1건, 30초
npm run load:sentence                            # 문장 분석, 초당 5 → 10 → 20 → 50 → 100건, 단계마다 2분
npm run load:word                                # 단어 조회, 초당 5 → 10 → 20 → 50건

RATES=5,10,20 STEP=1m npm run load:sentence      # 단계와 시간 바꾸기
DIST=uniform npm run load:word                   # 모든 단어를 같은 확률로 (기본은 skewed)
```

| 변수 | 기본값 | 뜻 |
| --- | --- | --- |
| `RATES` | 스크립트마다 다름 | 단계별 초당 요청 수 |
| `STEP` | `2m` | 한 단계를 유지하는 시간 |
| `RAMP` | `10s` | 다음 단계로 올라가는 시간 |
| `DIST` | `skewed` | `skewed`는 상위 10%가 요청의 절반, `uniform`은 균등 |
| `MAX_VUS` | `3000` | 동시에 기다릴 수 있는 가상 사용자 최대 수 |
| `TIMEOUT` | `60s` | 요청 하나의 제한 시간 |

부하 스크립트는 **초당 요청 수를 고정하는 방식**(arrival-rate)이에요. 서버가 느려져도 부하가 줄지 않아서 밀리는 모습이 그대로 보여요. 대시보드의 "놓친 반복"이 0보다 크면 k6가 목표 부하를 다 걸지 못한 것이니, 결과를 읽기 전에 먼저 확인하세요.

## 가짜 Claude 조절하기

켤 때는 환경 변수로, 켜진 뒤에는 `/config`로 바꿔요. 부하를 거는 도중에 바꿀 수 있어요.

```bash
curl localhost:8080/config                                                   # 지금 설정 보기
curl -X POST localhost:8080/config -H 'content-type: application/json' -d '{"latencyMs":15000}'   # 10배 느리게
curl -X POST localhost:8080/config -H 'content-type: application/json' -d '{"errorRate":0.3}'     # 30% 실패
curl -X POST localhost:8080/config -H 'content-type: application/json' -d '{"rpmLimit":300}'      # 분당 300건 한도
curl -X POST localhost:8080/config -H 'content-type: application/json' -d '{"dropRate":0.2}'      # 20% 확률로 글자 누락
```

| 키 | 시작값 (환경 변수) | 뜻 |
| --- | --- | --- |
| `latencyMs` | 1500 (`MOCK_LATENCY_MS`) | 평균 응답 시간 |
| `jitterMs` | 300 | 평균에서 ± 흔들림 |
| `tailRate`, `tailMs` | 0.01, 6000 | 가끔 나오는 긴 지연의 비율과 크기 |
| `errorRate`, `errorStatus` | 0, 529 | 실패 비율과 상태 코드 (429, 500, 529) |
| `rpmLimit` | 0 (`MOCK_RPM_LIMIT`) | 분당 요청 한도. 0이면 없음 |
| `dropRate` | 0 | 분석 결과에서 글자를 빠뜨리는 비율. 서버의 재요청을 유발 |

`lab:up` 전에 `MOCK_LATENCY_MS=800 npm run lab:up`처럼 시작값을 바꿀 수도 있어요.

서버의 Claude SDK 자동 재시도는 실험에서 기본으로 꺼져 있어요(`ANTHROPIC_MAX_RETRIES=0`). 켜고 비교하려면 `ANTHROPIC_MAX_RETRIES=2 npm run lab:up`으로 켜세요.

## Docker 없이 서버만 띄우기

```bash
npm run lab:mock                                  # 터미널 1: 가짜 Claude (8080)
ANTHROPIC_BASE_URL=http://localhost:8080 ANTHROPIC_API_KEY=mock ANTHROPIC_MAX_RETRIES=0 npm run start:dev   # 터미널 2
```

이때는 Prometheus와 Grafana가 없어서 `curl localhost:3000/metrics`로 값만 볼 수 있어요.

## 대시보드에서 보는 것

| 묶음 | 패널 | 볼 점 |
| --- | --- | --- |
| 서버 | 초당 요청 수, 응답 시간(p50/p95/p99), 상태 코드 | 부하를 올려도 처리량이 더 안 늘고 응답 시간만 느는 지점이 한계 |
| 서버 | 처리 중인 요청 수 | 초당 요청 × 응답 시간과 비슷해야 한다. 계속 쌓이면 뒤쪽이 막힌 것 |
| 서버 | 메모리, 이벤트 루프 지연, CPU와 GC | 힙은 평평한데 RSS만 오르면 Buffer 쪽을 의심 |
| AI 호출 | 호출 시간, 사용자 요청 대비 AI 호출, 응답 상태 | 서버가 센 수와 가짜 Claude가 받은 수가 다르면 숨은 재시도 |
| AI 호출 | 토큰 사용량, 문장 1건당 호출 횟수 | 비용과 재요청 |
| k6 | 가상 사용자, 놓친 반복, k6가 잰 응답 시간 | 부하 도구 쪽에서 본 값 |
