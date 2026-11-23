-- AlterTable
ALTER TABLE "users" ADD COLUMN     "deletion_scheduled_at" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "users_deletion_scheduled_at_idx" ON "users"("deletion_scheduled_at");
