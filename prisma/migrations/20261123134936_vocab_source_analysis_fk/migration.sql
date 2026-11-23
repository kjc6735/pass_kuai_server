-- CreateIndex
CREATE INDEX "vocab_sentences_source_analysis_id_idx" ON "vocab_sentences"("source_analysis_id");

-- CreateIndex
CREATE INDEX "vocab_words_source_analysis_id_idx" ON "vocab_words"("source_analysis_id");

-- AddForeignKey
ALTER TABLE "vocab_words" ADD CONSTRAINT "vocab_words_source_analysis_id_fkey" FOREIGN KEY ("source_analysis_id") REFERENCES "analysis_results"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocab_sentences" ADD CONSTRAINT "vocab_sentences_source_analysis_id_fkey" FOREIGN KEY ("source_analysis_id") REFERENCES "analysis_results"("id") ON DELETE SET NULL ON UPDATE CASCADE;
