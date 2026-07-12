export type AudioObject = {
  key: string;
  sizeBytes: number;
  mediaType: string;
};

export interface AudioStorage {
  save(input: { key: string; audio: Buffer; mediaType: string }): Promise<AudioObject>;
  read(key: string): Promise<Buffer>;
}
