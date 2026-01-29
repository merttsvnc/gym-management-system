/**
 * Storage service interface for file uploads
 * Abstracts storage implementation (R2, local disk, etc.)
 */
export interface StorageService {
  /**
   * Uploads a file buffer to storage
   * @param buffer - File buffer to upload
   * @param key - Object key/path in storage (e.g., "tenants/123/members/456/uuid.jpg")
   * @param contentType - MIME type of the file (e.g., "image/jpeg")
   * @returns Public URL of the uploaded file
   */
  upload(buffer: Buffer, key: string, contentType: string): Promise<string>;
}
