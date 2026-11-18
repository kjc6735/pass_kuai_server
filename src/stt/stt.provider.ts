export interface AudioFile {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

/** 음성 인식 구현을 바꿔 끼울 수 있게 한 경계. OpenAI, 직접 운영하는 Whisper, 테스트용 가짜가 들어온다. */
export abstract class SttProvider {
  abstract readonly model: string;
  abstract transcribe(audio: AudioFile): Promise<string>;
}
