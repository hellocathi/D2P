import { uploadPng } from "./index";
export interface UploadAdapter {
  readonly kind: "local" | "mock" | "scm";
  upload(blob: Blob, signal: AbortSignal): Promise<string>;
}
export class LocalUploadAdapter implements UploadAdapter {
  readonly kind = "local";
  upload = uploadPng;
}
/** Explicit mock, using the real local HTTP storage. No invented SCM endpoint. */
export class MockScmAdapter implements UploadAdapter {
  readonly kind = "mock";
  constructor(private local: UploadAdapter = new LocalUploadAdapter()) {}
  async upload(blob: Blob, signal: AbortSignal) {
    return this.local.upload(blob, signal);
  }
}
// A real ScmAdapter must be implemented only against supplied API documentation.
