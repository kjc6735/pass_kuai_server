# 서버 DB 설계 (초안)

> 2026-11-21 작성, 2026-11-23 소셜 로그인만 쓰도록 수정(`*_social_login_only` 마이그레이션). 스키마 구현됨(`prisma/schema.prisma`). 아직 API에서 쓰지 않음. 앱은 온라인 전용(A안, 7장)으로 확정.
>
> **로컬에서 쓰기:** `npm run db:up`(PostgreSQL 컨테이너, 호스트 15432 포트) → `npm run db:migrate`(마이그레이션 적용) → `npm run test:db`(스키마 규칙 테스트, 별도 DB `passkuai_test` 사용). 스키마를 바꿀 때는 `npm run db:migrate -- --name <이름>`. DB 내용 보기: `npm run db:studio`.
> **Prisma에 없는 제약은 마이그레이션 SQL에 직접 넣음:** SRS 레벨 0~5, 사용량 음수 금지. (아이디·이메일 관련 제약은 소셜 로그인만 쓰기로 하면서 지움)
> **배포 때 정할 것:** 운영 DB에 마이그레이션을 적용하는 방법(실행 이미지에는 Prisma CLI가 없음 → 배포 단계에서 별도 실행).
> 배경: 1차 출시부터 로그인 필수(**카카오·Apple·Google만**, 아이디·비밀번호와 이메일 인증 없음), 단어장·복습 기록은 서버(계정)에 저장. 앱을 실제 사용자에게 배포한 적이 없어서 기기 데이터 이전은 없음.

관련 문서: 앱 로컬 DB [pass_kuai_app/docs/architecture/table.md](../../pass_kuai_app/docs/architecture/table.md), 계획 [PLAN.md](../../pass_kuai_app/docs/PLAN.md)

---

## 0. 지금 상태와 바꾸는 이유

- 서버에는 DB가 없습니다. 인증은 기기 토큰(JWT에 deviceId), 사용량은 서버 메모리(`UsageService`)에서 셉니다. 그래서 서버를 재시작하면 사용량이 초기화되고, 서버가 여러 대면 따로 셉니다.
- 단어장·문장·복습 기록은 앱 기기(drift)에만 있습니다. 앱이 서버 분석 결과를 받아 직접 저장합니다.

**바꾸는 원칙**
1. **단어장 내용은 서버가 만든 분석 결과에서만 만든다.** 앱은 "몇 번째 분석의 몇 번째 문장/단어를 저장"이라고 위치만 보내고, 내용(한자·병음·뜻)은 보내지 않는다. 앱이 보낸 임의 단어가 단어장에 들어가 나중에 LLM 입력으로 쓰이는 일을 막는다.
2. **모든 사용자 데이터는 `user_id`를 갖고, 계정을 지우면 함께 지워진다**(`ON DELETE CASCADE`). 사용자가 입력한 문장에는 개인정보가 섞일 수 있어서 사용자끼리 공유하는 테이블을 두지 않는다.
3. **사용량은 DB에서 센다.** 서버 재시작·여러 대에도 정확하게.

**기술 선택(제안):** PostgreSQL + Prisma(스키마 파일과 마이그레이션 이력이 한곳에 남음). 로컬은 `lab/infra/docker-compose.yml`에 postgres 컨테이너를 추가.

---

## 1. 전체 구조

```
users ─┬─ social_accounts        (카카오·Apple·Google 연결, 로그인 수단)
       ├─ refresh_tokens         (로그인 세션)
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
| `saved_at` | timestamptz | |

- UNIQUE(`user_id`, `sentence`): 같은 원문은 한 번만(앱 v6 규칙과 같음, 처음 저장한 번역 유지).
- INDEX(`user_id`, `card_next_review_at`), INDEX(`user_id`, `dictation_wrong_at`) (부분 인덱스는 Prisma가 관리하지 못해 일반 인덱스로), INDEX(`source_analysis_id`).
- 저장 API: `POST /vocab/sentences { analysisId, sentenceIndex }`.

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

- 지금 메모리의 `spentUsd`를 옮긴 것. `DAILY_BUDGET_USD` 확인에 씀.

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
| `analysis_results` | 7일 뒤 |
| `refresh_tokens` | 만료·폐기 후 7일 뒤 |
| `daily_usage` | 90일 뒤(문의 대응용으로만 남김) |

계정 삭제는 **30일 유예 후 삭제**로 정함(2026-11-23). 같은 소셜 계정으로는 30일이 지나 정리된 뒤에 다시 가입할 수 있어요. 시안 24-2의 "7일 안에" 문구는 "30일 안에"로 바꿔야 함.

---

## 6. 2차(AI 통화)에서 추가할 테이블 — 지금 만들지 않음

`calls`(통화 1건, 주제·난이도·시작/종료·과금 초), `call_turns`(말풍선, 화자·중국어·번역·순서), `call_recordings`(내 목소리 파일 위치, 통화 삭제 시 함께 삭제), `call_expressions`(새 표현·문법), `call_corrections`(고친 문장), `grammar_cards`(문법 카드 SRS). 통화에서 저장한 단어·문장은 위 `vocab_words`/`vocab_sentences`에 `source_call_id`를 더해 넣습니다. 1차 테이블은 이 확장을 막지 않게 만들었습니다.

---

## 7. 앱 쪽 영향 — **A안(온라인 전용)으로 확정** (2026-11-21)

- 서버가 단어장의 유일한 원본. 1차는 온라인 전용.
- **앱 drift DB 제거:** `lib/database/` 테이블 5개(`words`, `sentences`, `sentence_words`, `saved_words`, `saved_sentences`)와 마이그레이션(v5~v7)·관련 테스트를 지운다. 화면은 API로 받아 Riverpod이 메모리에 들고 있는다.
- 앱이 기기에 저장하는 것은 로그인 토큰(secure storage)뿐.
- 복습 결과(알았어요/몰랐어요, 받아쓰기 맞음/틀림)는 바로 서버에 보낸다. SRS 계산(`lib/service/srs.dart`)은 서버로 옮기고 앱은 결과만 받는다(앱이 레벨·날짜를 보내면 조작 가능).
- 나중에 오프라인 복습(B안)을 넣을 때는 앱에 서버와 같은 모양의 캐시 테이블(서버 id 기준) + 보내지 못한 복습 결과 큐를 추가한다. 서버 테이블은 바꾸지 않아도 되게 설계했다.
