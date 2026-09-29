export interface LinkTokenCodec {
  random(): string;
  hash(token: string): Promise<string>;
}
