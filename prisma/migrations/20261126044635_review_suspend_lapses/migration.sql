-- AlterTable
ALTER TABLE "vocab_sentences" ADD COLUMN     "card_lapses" SMALLINT NOT NULL DEFAULT 0,
ADD COLUMN     "card_suspended_at" TIMESTAMPTZ(3),
ADD COLUMN     "dictation_lapses" SMALLINT NOT NULL DEFAULT 0,
ADD COLUMN     "dictation_suspended_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "vocab_words" ADD COLUMN     "lapses" SMALLINT NOT NULL DEFAULT 0,
ADD COLUMN     "suspended_at" TIMESTAMPTZ(3);

ALTER TABLE "vocab_words" ADD CONSTRAINT "vocab_words_lapses_non_negative" CHECK ("lapses" >= 0);
ALTER TABLE "vocab_sentences" ADD CONSTRAINT "vocab_sentences_lapses_non_negative" CHECK ("card_lapses" >= 0 AND "dictation_lapses" >= 0);
