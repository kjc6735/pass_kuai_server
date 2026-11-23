/*
  Warnings:

  - You are about to drop the column `email` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `email_verified_at` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `password_hash` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `username` on the `users` table. All the data in the column will be lost.
  - You are about to drop the `email_verifications` table. If the table is not empty, all the data it contains will be lost.

*/
-- 소셜 로그인만 쓰기로 함(2026-11-23). 첫 마이그레이션에서 직접 넣은 users 체크 제약을 먼저 지운다.
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_username_password_together";
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_email_lowercase";
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_username_format";

-- CreateEnum
CREATE TYPE "delete_reason" AS ENUM ('not_using', 'not_enough_call_time', 'missing_feature', 'privacy', 'other');

-- DropIndex
DROP INDEX "users_email_key";

-- DropIndex
DROP INDEX "users_username_key";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "email",
DROP COLUMN "email_verified_at",
DROP COLUMN "password_hash",
DROP COLUMN "username";

-- DropTable
DROP TABLE "email_verifications";

-- DropEnum
DROP TYPE "email_purpose";

-- CreateTable
CREATE TABLE "account_deletion_reasons" (
    "id" BIGSERIAL NOT NULL,
    "reason" "delete_reason" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_deletion_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "account_deletion_reasons_created_at_idx" ON "account_deletion_reasons"("created_at");
