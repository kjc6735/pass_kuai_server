# 서버 DB 설계

> 2026-11-21 작성, 2026-11-23 소셜 로그인만 쓰도록 수정(`*_social_login_only` 마이그레이션), 2026-11-24 복습 규칙 추가(3.5)와 구현 상태 반영, 2026-11-26 약관 동의(2.4) 추가. 스키마는 `prisma/schema.prisma`. 앱은 온라인 전용(A안, 7장)으로 확정.
>
> **구현 상태(2026-11-26):** 계정·소셜 로그인·토큰, 약관 동의, 분석 결과, 단어장, 복습은 API에서 씀. **`daily_usage`·`daily_cost`는 테이블만 있고 아직 안 씀**(사용량은 서버 메모리, 4장). 보관 기간 정리 작업은 `daily_usage`만 없음(5장).
>
> **로컬에서 쓰기:** `npm run db:up`(PostgreSQL 컨테이너, 호스트 15432 포트) → `npm run db:migrate`(마이그레이션 적용) → `npm run test:db`(스키마 규칙 테스트, 별도 DB `passkuai_test` 사용). 스키마를 바꿀 때는 `npm run db:migrate -- --name <이름>`. DB 내용 보기: `npm run db:studio`.
> **Prisma에 없는 제약은 마이그레이션 SQL에 직접 넣음:** SRS 레벨 0~5, 사용량 음수 금지. (아이디·이메일 관련 제약은 소셜 로그인만 쓰기로 하면서 지움)
> **운영 DB 마이그레이션:** 실행 이미지에는 Prisma CLI가 없어서 `deploy/docker-compose.yml`의 `migrate` 컨테이너(Dockerfile `migrate` 단계)가 서버보다 먼저 `prisma migrate deploy`를 한 번 실행함.
> 배경: 1차 출시부터 로그인 필수(**카카오·Apple·Google만**, 아이디·비밀번호와 이메일 인증 없음), 단어장·복습 기록은 서버(계정)에 저장. 앱을 실제 사용자에게 배포한 적이 없어서 기기 데이터 이전은 없음.

관련 문서: 앱 로컬 DB [pass_kuai_app/docs/architecture/table.md](../../pass_kuai_app/docs/architecture/table.md), 계획 [PLAN.md](../../pass_kuai_app/docs/PLAN.md)

---

## 0. 배경과 원칙

DB를 넣기 전(2026-11-21)에는 서버에 DB가 없었습니다. 인증은 기기 토큰(JWT에 deviceId)이었고, 단어장·문장·복습 기록은 앱 기기(drift)에만 있었습니다. 지금은 소셜 로그인 계정 기준으로 바뀌었고 단어장·복습 기록은 서버에 있습니다.

**원칙**
1. **단어장 내용은 서버가 만든 분석 결과에서만 만든다.** 앱은 "몇 번째 분석의 몇 번째 문장/단어를 저장"이라고 위치만 보내고, 내용(한자·병음·뜻)은 보내지 않는다. 앱이 보낸 임의 단어가 단어장에 들어가 나중에 LLM 입력으로 쓰이는 일을 막는다.
2. **모든 사용자 데이터는 `user_id`를 갖고, 계정을 지우면 함께 지워진다**(`ON DELETE CASCADE`). 사용자가 입력한 문장에는 개인정보가 섞일 수 있어서 사용자끼리 공유하는 테이블을 두지 않는다.
3. **사용량은 DB에서 센다.** 서버 재시작·여러 대에도 정확하게. (아직 안 함, 4장)

**기술:** PostgreSQL 17 + Prisma 7(스키마 파일과 마이그레이션 이력이 한곳에 남음). 로컬 DB는 `lab/infra/docker-compose.yml`의 postgres 컨테이너.

---

## 1. 전체 구조

```
users ─┬─ social_accounts        (카카오·Apple·Google 연결, 로그인 수단)
       ├─ refresh_tokens         (로그인 세션)
       ├─ user_agreements        (약관 동의 기록, 버전별)
       ├─ analysis_results       (서버가 만든 분석 결과, 7일 보관)
       ├─ vocab_words            (단어장 + 단어 카드 SRS)
       ├─ vocab_sentences ── vocab_sentence_words   (저장 문장 + 문장 카드·받아쓰기 기록)
       └─ daily_usage            (하루 사용량)

account_deletion_reasons  (계정 삭제 이유. 누구인지 알 수 없게 user_id 없음)
daily_cost                (서버 전체 하루 비용 상한)
```

앱 drift와 비교:

| 앱 (지금) | 서버 (새로) | 바뀌는 점 |
|---|---|---|
| `words` + `saved_words` | `vocab_words` | 서버에는 "검색했지만 저장 안 한 단어"를 따로 두지 않으므로 둘을 합침. 행이 있으면 저장된 것 |
| `sentences` + `saved_sentences` | `vocab_sentences` | 같은 이유로 합침 |
| `sentence_words` (단어 id 참조) | `vocab_sentence_words` (단어 내용 복사) | 문장 속 단어를 단어장 단어와 분리. 단어장에서 단어를 지워도 문장은 그대로, 정리(cleanup) 작업이 필요 없음 |
| 분석 결과는 화면 state에만 | `analysis_results` | 저장 요청의 근거가 되도록 서버가 보관 |

---

## 2. 계정

### 2.1 `users`

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | uuid PK | |
| `deletion_scheduled_at` | timestamptz NULL | 계정 삭제를 요청하면 30일 뒤 시각. NULL이 아니면 로그인·API를 막음(403 `ACCOUNT_DELETED`) |
| `created_at` / `updated_at` | timestamptz | |

- 로그인은 소셜 계정으로만 해서 아이디·비밀번호·이메일 컬럼이 없어요(2026-11-23). 이메일은 로그인에 필요 없어서 소셜 계정에서도 받지 않아요(`*_remove_provider_email` 마이그레이션).
- 계정에는 `social_accounts`가 최소 1개 있어야 함(앱 로직에서 보장).

### 2.2 `social_accounts`

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK → users, CASCADE | |
| `provider` | enum(`kakao`,`apple`,`google`) | |
| `provider_user_id` | varchar(255) | 각 회사가 주는 사용자 고유 id (Apple `sub`, Google `sub`, 카카오 회원번호) |
| `apple_refresh_token` | text NULL | 계정 삭제 시 Apple 연결 해제(revoke)에 필요. 쓰려면 우리 Apple 비밀키로 만든 client_secret이 있어야 해서 평문으로 저장 |
| `created_at` | timestamptz | |

- UNIQUE(`provider`, `provider_user_id`), UNIQUE(`user_id`, `provider`).
- 회사마다 고유 id만 저장해요. 같은 사람이 다른 회사로 로그인하면 다른 계정이에요(합치지 않음).

### 2.3 `refresh_tokens`

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK → users, CASCADE | |
| `token_hash` | text UNIQUE | 원문은 앱(secure storage)에만 |
| `family_id` | uuid | 같은 로그인에서 이어진 토큰 묶음. 이미 쓴 토큰이 다시 오면 묶음 전체 폐기(탈취 감지) |
| `expires_at` | timestamptz | 60일 |
| `revoked_at` | timestamptz NULL | 로그아웃·교체 |
| `created_at` | timestamptz | |

- 액세스 토큰은 DB 없이 JWT(30분, `sub`=user_id). 지금의 기기 토큰(365일)을 대체.
- 계정 삭제 시 CASCADE로 함께 지워짐.

### 2.4 `user_agreements` — 약관 동의 (2026-11-26)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `user_id` | uuid FK → users, CASCADE | |
| `type` | enum(`terms`, `privacy`, `overseas_transfer`, `age_14`) | 이용약관, 개인정보 수집·이용, 개인정보 국외 이전(Anthropic·OpenAI), 만 14세 이상 |
| `version` | varchar(20) | 동의한 약관 버전. 예: `2026-11-26` |
| `agreed_at` | timestamptz | 처음 동의한 시각(다시 보내도 바뀌지 않음) |

- PK(`user_id`, `type`, `version`): 버전마다 한 줄씩 쌓여요(덮어쓰지 않음). 언제 어느 버전에 동의했는지가 증빙이에요.
- 지금 필수인 버전은 `src/constants/agreement.ts`의 `AGREEMENT_VERSIONS`. 약관을 중요하게 바꾸면 여기 버전을 올리고 배포 → 새 버전에 동의하지 않은 사용자는 403 `AGREEMENT_REQUIRED`로 다시 동의 화면에 가요.
- 동의 확인은 전역 가드(`AgreementGuard`)가 요청마다 이 테이블을 한 번 세요. 동의 없이 쓸 수 있는 API는 `@AllowWithoutAgreement()`가 붙은 것(`GET`/`DELETE /me`, 로그아웃, `/me/agreements`)과 `@Public()`이에요.
- 동의 철회는 따로 없어요. 필수 동의를 철회하는 것은 계정 삭제와 같아요.
- 약관 웹 주소는 환경 변수 `TERMS_URL`, `PRIVACY_URL`(국외 이전은 처리방침 주소를 같이 써요).

---

## 3. 분석 결과와 단어장

### 3.1 `analysis_results` — 저장 요청의 근거

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | uuid PK | `POST /analyze/sentence` 응답에 `analysisId`로 같이 내려줌 |
| `user_id` | uuid FK → users, CASCADE | |
| `input` | varchar(1000) | 사용자가 넣은 원문 |
| `result` | jsonb | `AnalyzeResultDto` 검증을 통과한 결과 그대로(문장들 → 단어들 → 음절) |
| `created_at` | timestamptz | |

- INDEX(`user_id`, `created_at`).
- **7일 뒤 삭제**(하루 한 번 정리). 저장은 분석 직후 상세 화면에서 하므로 충분하고, 저장 안 한 입력문을 오래 갖고 있지 않음.
- 단어 뜻 찾기(`/analyze/word`)는 지금 앱에서 쓰지 않고 결과도 자유 텍스트라 저장하지 않음.

### 3.2 `vocab_words` — 단어장 + 단어 카드 SRS

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | bigint PK | |
| `user_id` | uuid FK → users, CASCADE | |
| `word` | varchar(50) | 한자 |
| `pinyin` | varchar(200) | |
| `meaning` | varchar(200) | |
| `pos` | varchar(50) NULL | 품사 |
| `syllables` | jsonb default `'[]'` | `[{hanzi, pinyin, tone}]`, 최대 50개 |
| `source_analysis_id` | uuid NULL FK → analysis_results, SET NULL | 어디서 저장했는지(분석 결과가 지워지면 NULL) |
| `source_sentence` | varchar(1000) NULL | 저장 당시 문장(카드 뒷면 예문용) |
| `srs_level` | smallint default 0 | 0~5, 간격 [0,1,3,7,14,30]일 |
| `next_review_at` | timestamptz NULL | NULL = 바로 복습 대상 |
| `last_reviewed_at` | timestamptz NULL | |
| `lapses` | smallint default 0 | 틀린 횟수(하루 최대 1). 0 이상(CHECK) |
| `suspended_at` | timestamptz NULL | 복습 그만 보기. NULL이 아니면 due·summary에서 빠짐 |
| `saved_at` | timestamptz | |

- UNIQUE(`user_id`, `word`, `pinyin`, `meaning`): 앱과 같은 규칙(같은 한자 다른 뜻은 별도 단어, 같은 단어 두 번 저장은 막음).
- INDEX(`user_id`, `next_review_at`): 오늘 복습할 단어 조회.
- INDEX(`source_analysis_id`): 분석 결과를 지울 때 이 칸을 NULL로 바꿀 행을 빨리 찾음.
- 저장 API: `POST /vocab/words { analysisId, sentenceIndex, wordIndex }` → 서버가 `analysis_results.result`에서 꺼내 복사.

### 3.3 `vocab_sentences` — 저장 문장 + 문장 카드·받아쓰기

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | bigint PK | |
| `user_id` | uuid FK → users, CASCADE | |
| `sentence` | varchar(1000) | |
| `translation` | varchar(4000) | |
| `pinyin` | varchar(8000) | 단어 병음을 공백으로 이은 것 |
| `source_analysis_id` | uuid NULL FK → analysis_results, SET NULL | 3.2와 같음 |
| `card_srs_level` | smallint default 0 | 문장 카드(알았어요/몰랐어요) |
| `card_next_review_at` | timestamptz NULL | |
| `card_last_reviewed_at` | timestamptz NULL | |
| `dictation_last_at` | timestamptz NULL | 마지막으로 받아쓰기 한 시각 |
| `dictation_wrong_at` | timestamptz NULL | NULL이 아니면 '틀린 문장 다시 하기'에 들어감. 맞히면 NULL |
| `card_lapses` / `dictation_lapses` | smallint default 0 | 문장 카드 / 받아쓰기·다시 하기에서 틀린 횟수. 0 이상(CHECK) |
| `card_suspended_at` / `dictation_suspended_at` | timestamptz NULL | 문장 카드 / 받아쓰기·다시 하기 그만 보기 |
| `saved_at` | timestamptz | |

- UNIQUE(`user_id`, `sentence`): 같은 원문은 한 번만(앱 v6 규칙과 같음, 처음 저장한 번역 유지).
- INDEX(`user_id`, `card_next_review_at`), INDEX(`user_id`, `dictation_wrong_at`) (부분 인덱스는 Prisma가 관리하지 못해 일반 인덱스로), INDEX(`source_analysis_id`).
- 저장 API: `POST /vocab/sentences { analysisId, sentenceIndex }`.

### 3.5 복습 규칙 (`src/review`, 2026-11-24, 2026-11-26 그만 보기·틀린 횟수·2단계 내리기 추가)

| 모드 | 쓰는 칸 | 결과 |
|---|---|---|
| `word` | `vocab_words.srs_level`·`next_review_at`·`last_reviewed_at` | known / unknown |
| `sentence` | `vocab_sentences.card_*` | known / unknown |
| `dictation`·`retry` | `vocab_sentences.dictation_last_at`·`dictation_wrong_at` | correct / wrong |

- **다음 복습일**(`src/review/srs.ts`): known이면 단계 +1(최대 5), 한국 시간 오늘 0시 + `[0,1,3,7,14,30][단계]`일. unknown이면 단계 −2(최소 0, `SRS_LAPSE_DROP`), 내일 0시. 오래 알던 카드를 한 번 틀렸다고 처음부터 하지 않게 하려는 것. 계속 틀리면 알아서 0까지 내려감.
- **오늘 복습할 카드:** `next_review_at`이 NULL이거나 내일 0시(KST)보다 이른 카드.
- **하루 100장, 모드별로 따로**(`REVIEW_DAILY_LIMIT`). 오늘 본 수 = 마지막 복습 시각이 오늘 0시(KST) 이후인 행 수. 받아쓰기와 다시 하기는 `dictation_last_at`을 같이 써서 합쳐 100장.
- **오늘 본 카드는 오늘 다시 나오지 않고, 같은 카드는 모드별로 하루에 한 번만 반영.** 같은 날 다시 오면 바꾸지 않고 지금 상태를 돌려줌. 동시 요청은 "읽은 값이 그대로일 때만 update"로 막음.
- 받아쓰기·다시 하기에서 wrong이면 `dictation_wrong_at` = 지금(다시 하기에 들어감), retry 모드에서 correct면 NULL. dictation 모드에서 correct면 그대로.
- 복습 기록 테이블(언제 무엇을 맞혔는지)은 두지 않음. 상태 칸만 바꿈. 통계·연속 학습일이 필요해지면 `review_logs`를 추가.
- **틀린 횟수:** unknown·wrong이면 +1. 하루 한 번만 반영되니 하루 최대 1. 몇 번부터 "자주 틀림"으로 보여줄지는 앱이 정함.
- **그만 보기:** `PUT`/`DELETE /me/review/{mode}/{itemId}/suspend`. 그만 본 카드는 due와 summary의 due에서 빠지고 total에는 남음. 단계·다음 복습일은 그대로라 다시 보면 이어서 함. retry는 dictation과 같은 칸(`dictation_suspended_at`)을 씀.

### 3.4 `vocab_sentence_words` — 문장 속 단어(순서대로)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `sentence_id` | bigint FK → vocab_sentences, CASCADE | |
| `position` | smallint | 0부터. 같은 단어 반복도 순서대로(我爱我家) |
| `word` / `pinyin` / `meaning` / `pos` / `syllables` | 3.2와 같음 | 단어장 단어를 참조하지 않고 내용을 복사 |

- PK(`sentence_id`, `position`).
- 문장 카드의 "단어 보기" 힌트와 문장 상세 화면에서 씀. 여기 있는 단어를 단어장에 넣는 것은 `POST /vocab/words { sentenceId, position }`(서버가 이 행에서 복사).

---

## 4. 사용량

> **아직 안 씀.** 지금 하루 한도와 비용 상한은 서버 메모리(`UsageService`)에서 셈. 그래서 서버를 재시작(배포)하면 초기화되고, 서버가 여러 대면 따로 셈. 아래 테이블로 옮기는 게 다음 작업.

### 4.1 `daily_usage` — 계정별 하루 사용량

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `user_id` | uuid FK → users, CASCADE | |
| `day` | date | KST 기준 날짜(`kstDay`) |
| `analyze_requests` | int default 0 | 분석 횟수 |
| `audio_seconds` | int default 0 | 발음 연습 음성 인식 시간 |
| `call_seconds` | int default 0 | 2차 AI 통화(지금은 0) |

- PK(`user_id`, `day`). 한도 확인과 증가를 한 문장으로: `INSERT … ON CONFLICT DO UPDATE SET analyze_requests = analyze_requests + 1 WHERE analyze_requests < 한도 RETURNING …` (행이 안 돌아오면 429).
- 사용량 기준이 기기 → **계정**으로 바뀜. 계정을 지웠다가 같은 소셜 계정으로 다시 가입해서 한도를 초기화하는 것은 하루 단위라 큰 문제가 아니어서 막지 않음.

### 4.2 `daily_cost` — 서버 전체 비용 상한

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `day` | date PK | |
| `spent_usd` | numeric(10,4) default 0 | |

- `UsageService`의 메모리 `spentUsd`를 옮길 자리. `DAILY_BUDGET_USD` 확인에 씀.
- 서버 전체가 한 행을 같이 바꿔서 동시 요청이 많으면 행 잠금을 기다림. 한 번에 짧아서 초당 수백 번까지는 괜찮다고 봄. 문제가 되면 서버 메모리에 모았다가 몇 초마다 더하는 방식으로 바꿈(비용 상한은 몇 초 늦어도 되는 안전장치).

---

### 4.3 `account_deletion_reasons` — 계정 삭제 이유 (시안 24-1, 선택)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | bigint PK | |
| `reason` | enum(`not_using`,`not_enough_call_time`,`missing_feature`,`privacy`,`other`) | |
| `created_at` | timestamptz | |

- `user_id`를 두지 않아서 계정을 지운 뒤에도 남고, 누구의 이유인지는 알 수 없어요. 이유를 고르지 않으면 행을 만들지 않아요.

## 5. 삭제·보관 규칙

| 대상 | 언제 지우나 |
|---|---|
| 계정 삭제 | 요청 시: refresh token 전부 폐기, 카카오 연결 끊기·Apple revoke, `deletion_scheduled_at` = 30일 뒤. 30일이 지나면 정리 작업(`AccountService.purgeExpiredAccounts`, 1시간마다)이 사용자 행 삭제 → 위 모든 테이블 CASCADE. 유예 기간에도 복구·조회는 안 됨 |
| 가입 후 약관에 한 번도 동의하지 않은 계정 | 가입하고 7일 뒤. `AgreementService.purgeUnagreedAccounts`(매일 04:00 KST). 동의 기록이 하나라도 있으면(예전 버전 포함) 지우지 않음. 소셜 로그인 연결(카카오·Apple) 해제는 하지 않음 |
| `analysis_results` | 만든 지 7일 뒤. `AnalysisResultService.purgeExpired`(매일 04:00 KST). 단어장의 `source_analysis_id`는 NULL이 되고 단어·문장은 남음. 정리 전이라도 7일이 지난 결과로는 저장할 수 없음(404) |
| `refresh_tokens` | `AuthService.purgeExpiredTokens`(매일 04:00 KST). ① 만료된 지 7일 지난 토큰 ② 묶음(family) 전체가 끝난 지 7일 지난 토큰(로그아웃·탈취 감지·계정 삭제). 살아 있는 묶음에서 교체된 토큰은 만료될 때까지 남김. 다시 쓰이면 탈취로 보고 묶음을 끊어야 해서 |
| `daily_usage` | 90일 뒤, 문의 대응용으로만 남김 (**사용량을 DB로 옮길 때 같이 만듦, 1차 보류**) |

정리 작업은 한 번에 1000행씩 지우고, 서버가 여러 대여도 같은 행을 지우는 것뿐이라 겹쳐 돌아도 괜찮아요.

계정 삭제는 **30일 유예 후 삭제**로 정함(2026-11-23). 같은 소셜 계정으로는 30일이 지나 정리된 뒤에 다시 가입할 수 있어요. 시안 24-2의 "7일 안에" 문구는 "30일 안에"로 바꿔야 함.

---

## 6. 2차(AI 통화)에서 추가할 테이블 — 지금 만들지 않음

`calls`(통화 1건, 주제·난이도·시작/종료·과금 초), `call_turns`(말풍선, 화자·중국어·번역·순서), `call_recordings`(내 목소리 파일 위치, 통화 삭제 시 함께 삭제), `call_expressions`(새 표현·문법), `call_corrections`(고친 문장), `grammar_cards`(문법 카드 SRS). 통화에서 저장한 단어·문장은 위 `vocab_words`/`vocab_sentences`에 `source_call_id`를 더해 넣습니다. 1차 테이블은 이 확장을 막지 않게 만들었습니다.

---

## 7. 앱 쪽 영향 — **A안(온라인 전용)으로 확정** (2026-11-21)

- 서버가 단어장의 유일한 원본. 1차는 온라인 전용.
- **앱 drift DB 제거:** `lib/database/` 테이블 5개(`words`, `sentences`, `sentence_words`, `saved_words`, `saved_sentences`)와 마이그레이션(v5~v7)·관련 테스트를 지운다. 화면은 API로 받아 Riverpod이 메모리에 들고 있는다.
- 앱이 기기에 저장하는 것은 로그인 토큰(secure storage)뿐.
- 복습 결과(알았어요/몰랐어요, 받아쓰기 맞음/틀림)는 카드마다 바로 서버에 보낸다(`POST /me/review/logs`). SRS 계산(`lib/service/srs.dart`)은 서버로 옮겼다(`src/review/srs.ts`, 3.5). 앱은 단계·날짜를 보내지 않는다.
- 회차 끝에 틀린 카드를 한 번 더 보여주는 것은 앱에서만 하고, 그 결과는 서버에 보내지 않는다(보내도 같은 날이라 서버가 무시함).
- 복습 기록을 기기에 두는 방안을 2026-11-24에 다시 검토했지만 서버에 두기로 유지했다. 기기를 바꾸거나 앱을 지우면 복습 단계가 사라지고, 서버 단어장과 동기화가 필요해지기 때문.
- 나중에 오프라인 복습(B안)을 넣을 때는 앱에 서버와 같은 모양의 캐시 테이블(서버 id 기준) + 보내지 못한 복습 결과 큐를 추가한다. 서버 테이블은 바꾸지 않아도 되게 설계했다.
