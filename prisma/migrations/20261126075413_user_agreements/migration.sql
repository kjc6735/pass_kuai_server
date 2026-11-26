-- CreateEnum
CREATE TYPE "agreement_type" AS ENUM ('terms', 'privacy', 'overseas_transfer', 'age_14');

-- CreateTable
CREATE TABLE "user_agreements" (
    "user_id" UUID NOT NULL,
    "type" "agreement_type" NOT NULL,
    "version" VARCHAR(20) NOT NULL,
    "agreed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_agreements_pkey" PRIMARY KEY ("user_id","type","version")
);

-- AddForeignKey
ALTER TABLE "user_agreements" ADD CONSTRAINT "user_agreements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
