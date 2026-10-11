declare module 'word-extractor' {
  export default class WordExtractor {
    extract(source: Buffer): Promise<{ getBody(): string }>;
  }
}
