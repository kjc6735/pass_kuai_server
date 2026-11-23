export interface AudioFile {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

export abstract class SttProvider {
  abstract readonly model: string;
  abstract transcribe(audio: AudioFile): Promise<string>;
}
