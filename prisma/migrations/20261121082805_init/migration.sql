-- CreateEnum
CREATE TYPE "social_provider" AS ENUM ('kakao', 'apple', 'google');

-- CreateEnum
CREATE TYPE "email_purpose" AS ENUM ('signup', 'find_id', 'reset_password', 'social_signup');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "username" VARCHAR(20),
    "password_hash" TEXT,
    "email" VARCHAR(254) NOT NULL,
    "email_verified_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" "social_provider" NOT NULL,
    "provider_user_id" VARCHAR(255) NOT NULL,
    "provider_email" VARCHAR(254),
    "apple_refresh_token" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verifications" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "purpose" "email_purpose" NOT NULL,
    "code_hash" TEXT NOT NULL,
    "attempts" SMALLINT NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "verified_at" TIMESTAMPTZ(3),
    "consumed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "family_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_results" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "input" VARCHAR(1000) NOT NULL,
    "result" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analysis_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vocab_words" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "word" VARCHAR(50) NOT NULL,
    "pinyin" VARCHAR(200) NOT NULL,
    "meaning" VARCHAR(200) NOT NULL,
    "pos" VARCHAR(50),
    "syllables" JSONB NOT NULL DEFAULT '[]',
    "source_analysis_id" UUID,
    "source_sentence" VARCHAR(1000),
    "srs_level" SMALLINT NOT NULL DEFAULT 0,
    "next_review_at" TIMESTAMPTZ(3),
    "last_reviewed_at" TIMESTAMPTZ(3),
    "saved_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vocab_words_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vocab_sentences" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "sentence" VARCHAR(1000) NOT NULL,
    "translation" VARCHAR(4000) NOT NULL,
    "pinyin" VARCHAR(8000) NOT NULL,
    "source_analysis_id" UUID,
    "card_srs_level" SMALLINT NOT NULL DEFAULT 0,
    "card_next_review_at" TIMESTAMPTZ(3),
    "card_last_reviewed_at" TIMESTAMPTZ(3),
    "dictation_last_at" TIMESTAMPTZ(3),
    "dictation_wrong_at" TIMESTAMPTZ(3),
    "saved_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vocab_sentences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vocab_sentence_words" (
    "sentence_id" BIGINT NOT NULL,
    "position" SMALLINT NOT NULL,
    "word" VARCHAR(50) NOT NULL,
    "pinyin" VARCHAR(200) NOT NULL,
    "meaning" VARCHAR(200) NOT NULL,
    "pos" VARCHAR(50),
    "syllables" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "vocab_sentence_words_pkey" PRIMARY KEY ("sentence_id","position")
);

-- CreateTable
CREATE TABLE "daily_usage" (
    "user_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "analyze_requests" INTEGER NOT NULL DEFAULT 0,
    "audio_seconds" INTEGER NOT NULL DEFAULT 0,
    "call_seconds" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "daily_usage_pkey" PRIMARY KEY ("user_id","day")
);

-- CreateTable
CREATE TABLE "daily_cost" (
    "day" DATE NOT NULL,
    "spent_usd" DECIMAL(10,4) NOT NULL DEFAULT 0,

    CONSTRAINT "daily_cost_pkey" PRIMARY KEY ("day")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "social_accounts_provider_provider_user_id_key" ON "social_accounts"("provider", "provider_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "social_accounts_user_id_provider_key" ON "social_accounts"("user_id", "provider");

-- CreateIndex
CREATE INDEX "email_verifications_email_purpose_created_at_idx" ON "email_verifications"("email", "purpose", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");

-- CreateIndex
CREATE INDEX "analysis_results_user_id_created_at_idx" ON "analysis_results"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "analysis_results_created_at_idx" ON "analysis_results"("created_at");

-- CreateIndex
CREATE INDEX "vocab_words_user_id_next_review_at_idx" ON "vocab_words"("user_id", "next_review_at");

-- CreateIndex
CREATE INDEX "vocab_words_user_id_saved_at_idx" ON "vocab_words"("user_id", "saved_at");

-- CreateIndex
CREATE UNIQUE INDEX "vocab_words_user_id_word_pinyin_meaning_key" ON "vocab_words"("user_id", "word", "pinyin", "meaning");

-- CreateIndex
CREATE INDEX "vocab_sentences_user_id_card_next_review_at_idx" ON "vocab_sentences"("user_id", "card_next_review_at");

-- CreateIndex
CREATE INDEX "vocab_sentences_user_id_dictation_wrong_at_idx" ON "vocab_sentences"("user_id", "dictation_wrong_at");

-- CreateIndex
CREATE INDEX "vocab_sentences_user_id_saved_at_idx" ON "vocab_sentences"("user_id", "saved_at");

-- CreateIndex
CREATE UNIQUE INDEX "vocab_sentences_user_id_sentence_key" ON "vocab_sentences"("user_id", "sentence");

-- CreateIndex
CREATE INDEX "daily_usage_day_idx" ON "daily_usage"("day");

-- AddForeignKey
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_results" ADD CONSTRAINT "analysis_results_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocab_words" ADD CONSTRAINT "vocab_words_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocab_sentences" ADD CONSTRAINT "vocab_sentences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocab_sentence_words" ADD CONSTRAINT "vocab_sentence_words_sentence_id_fkey" FOREIGN KEY ("sentence_id") REFERENCES "vocab_sentences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_usage" ADD CONSTRAINT "daily_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "users" ADD CONSTRAINT "users_username_password_together"
  CHECK (("username" IS NULL) = ("password_hash" IS NULL));

ALTER TABLE "users" ADD CONSTRAINT "users_email_lowercase" CHECK ("email" = lower("email"));
ALTER TABLE "users" ADD CONSTRAINT "users_username_format"
  CHECK ("username" IS NULL OR "username" ~ '^[a-z0-9_]{4,20}$');

ALTER TABLE "vocab_words" ADD CONSTRAINT "vocab_words_srs_level_range" CHECK ("srs_level" BETWEEN 0 AND 5);
ALTER TABLE "vocab_sentences" ADD CONSTRAINT "vocab_sentences_card_srs_level_range" CHECK ("card_srs_level" BETWEEN 0 AND 5);

ALTER TABLE "daily_usage" ADD CONSTRAINT "daily_usage_non_negative"
  CHECK ("analyze_requests" >= 0 AND "audio_seconds" >= 0 AND "call_seconds" >= 0);
ALTER TABLE "daily_cost" ADD CONSTRAINT "daily_cost_non_negative" CHECK ("spent_usd" >= 0);
