# pass_kuai 서버

중국어 학습 앱 pass_kuai의 API 서버예요. 문장을 AI로 분석하고, 단어장과 복습 기록을 계정에 저장해요.

- NestJS 11 · TypeScript · PostgreSQL(Prisma 7)
- AI: 문장 분석은 Claude(Anthropic), 발음 연습 음성 인식은 OpenAI
- 앱은 온라인 전용이에요. 단어장과 복습 기록의 원본은 서버에 있어요.

## 문서

| 문서 | 내용 |
| --- | --- |
| [docs/openapi.yaml](docs/openapi.yaml) | API 명세. 앱과 맞추는 기준 |
| [docs/database.md](docs/database.md) | DB 설계와 보관·삭제 규칙 |
| [lab/README.md](lab/README.md) | 부하 테스트 환경 (k6, 가짜 AI 서버, Grafana) |

명세를 Swagger 화면으로 보려면:

```bash
docker run -d --name pass-kuai-swagger -p 8081:8080 \
  -e SWAGGER_JSON=/spec/openapi.yaml -v "$PWD/docs:/spec:ro" \
  swaggerapi/swagger-ui:v5.17.14
# http://localhost:8081 (docs/를 그대로 읽어서 고치면 새로고침만 하면 돼요)
```

## 기능

| 영역 | API | 위치 |
| --- | --- | --- |
| 로그인·계정 | `POST /auth/social/{kakao,apple,google}`, `POST /auth/refresh`, `POST /auth/logout`, `GET /me`, `DELETE /me` | `src/auth` |
| 약관 동의 | `GET`·`POST /me/agreements`. 동의 전에는 다른 API가 403 `AGREEMENT_REQUIRED` | `src/agreement` |
| 문장 분석 | `POST /analyze/sentence` | `src/analyze` |
| 발음 연습 | `POST /stt/transcribe` | `src/stt` |
| 단어장 | `GET·POST /vocab/words`, `DELETE /vocab/words/{id}`, 문장도 같음(`/vocab/sentences`) | `src/vocab` |
| 복습 | `GET /me/review/summary`, `GET /me/review/due`, `POST /me/review/logs`, `PUT·DELETE /me/review/{mode}/{itemId}/suspend` | `src/review` |
| 운영 | `GET /health`, `GET /metrics`(Prometheus) | `src/health`, `src/metrics` |

공통으로 쓰는 것:
- `src/llm`: AI 호출(비용·토큰 기록, 잘린 응답 처리, 프롬프트 캐시)
- `src/usage`: 하루 분석 횟수·발음 연습 시간 한도, 서버 전체 하루 비용 상한
- `src/constants`: 상수와 에러 코드(`error-code.ts`), `src/utils`: 작은 함수들

**아직 없는 것:** `GET /me/usage`(명세에만 있음), 하루 사용량의 DB 저장(지금은 서버 메모리라 재시작하면 초기화). 1차 배포에서는 보류했어요.

**정리 작업:** 매일 한국 시간 새벽 4시에 7일이 지난 분석 결과, 쓸 수 없게 된 refresh token, 가입하고 7일 동안 약관에 동의하지 않은 계정을 지워요. 삭제 예정 계정은 1시간마다 정리해요. 규칙은 [docs/database.md](docs/database.md) 5장에 있어요.

## 로컬에서 실행

Node.js 22와 Docker가 필요해요.

```bash
npm install
cp .env.example .env     # 값 채우기 (아래 참고)
npm run db:up            # PostgreSQL 컨테이너 (localhost:15432)
npm run db:migrate       # 마이그레이션 적용
npm run start:dev        # http://localhost:3000
```

`.env`에서 꼭 채울 것:
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`: 없으면 분석·발음 연습만 실패해요. 돈을 쓰지 않으려면 가짜 AI 서버를 써요(`npm run lab:mock` 후 `ANTHROPIC_BASE_URL=http://localhost:8080`).
- 소셜 로그인(`KAKAO_APP_ID`, `GOOGLE_CLIENT_IDS`, `APPLE_*`): 쓰는 회사 것만 채우면 돼요.
- `JWT_SECRET`: 개발에서는 비워도 돼요.

운영(`NODE_ENV=production`)에서는 `DATABASE_URL`, `JWT_SECRET`(32자 이상), `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`가 없으면 서버가 뜨지 않아요.

각 변수 설명은 [.env.example](.env.example)에 있어요. 서버가 뜰 때 Joi로 검사해요(`src/config/env.schema.ts`).

### DB

```bash
npm run db:migrate -- --name <이름>   # 스키마(prisma/schema.prisma)를 바꾼 뒤 마이그레이션 만들기
npm run db:studio                     # DB 내용 보기
npm run db:reset                      # 로컬 DB를 지우고 처음부터 다시
```

Prisma로 표현할 수 없는 제약(복습 단계 0~5, 사용량 음수 금지 등)은 마이그레이션 SQL에 직접 넣어요.

## 테스트

```bash
npm test             # 단위 테스트 (src/**/*.spec.ts)
npm run test:e2e     # API 테스트. AI·소셜 로그인은 가짜로 바꾸고 DB 없이 돌아요 (test/*.e2e-spec.ts)
npm run test:db      # 실제 DB로 도는 테스트 (test/db/*.db-spec.ts). npm run db:up 필요
npm run lint
```

`test:db`는 개발 DB와 따로 `passkuai_test` DB를 만들어 써요(`TEST_DATABASE_URL`로 바꿀 수 있어요). 테스트마다 테이블을 비워요.

테스트 앱(`test/helpers.ts`의 `createTestApp`)은 약관 동의를 된 것으로 보고 돌아요. 동의 흐름을 확인하는 테스트만 `{ enforceAgreements: true }`로 실제 확인을 켜요. 테스트 서버는 `127.0.0.1`의 빈 포트에 한 번 열어서 그 주소로만 요청해요(요청이 다른 프로세스의 같은 포트로 가는 문제를 막으려고).

## 배포

`deploy/`에 Nginx → 서버 → PostgreSQL 구성이 있어요. 서버는 내부망에만 열리고 밖에서는 Nginx(80·443)로만 들어와요.

| 주소 | 내용 |
| --- | --- |
| `https://passkuai.com/api/...` | API. Nginx가 `/api`를 떼고 서버로 넘겨요(`/api/health` → 서버의 `/health`) |
| `https://passkuai.com/` | 소개 페이지 (`deploy/site/index.html`) |

`www.passkuai.com`과 `http://`는 `https://passkuai.com`으로 넘겨요. `/api/metrics`는 밖에서 막아요.

### 처음 한 번

DNS에서 `passkuai.com`, `www.passkuai.com`의 A 레코드를 서버 IP로 연결하고, 서버의 80·443 포트를 열어 둬요.

```bash
cd deploy
cp .env.example .env          # 운영 값 채우기
./init-cert.sh <이메일>         # Let's Encrypt 인증서 받기 (80 포트를 잠깐 씀)
docker compose up -d --build
curl https://passkuai.com/api/health
```

### 업데이트

```bash
git pull && cd deploy && docker compose up -d --build
```

- 서버보다 먼저 `migrate` 컨테이너가 `prisma migrate deploy`를 한 번 실행해요. 실행 이미지에는 Prisma CLI가 없어서 따로 둔 거예요.
- 서버는 `/health`가 응답해야 준비된 것으로 보고, 그다음 Nginx가 떠요.
- Nginx 뒤에 있어서 `TRUST_PROXY=1`로 실제 접속 IP를 써요.
- 인증서는 `certbot` 컨테이너가 12시간마다 갱신을 확인하고, Nginx는 6시간마다 다시 읽어요. 인증서는 `letsencrypt` 볼륨에 있어요.
- 컨테이너 로그는 컨테이너마다 20MB × 5개까지만 남겨요.
