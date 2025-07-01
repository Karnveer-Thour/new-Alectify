import { CACHE_MANAGER, Inject, Injectable } from '@nestjs/common';
import * as AWS from 'aws-sdk';
import { Cache } from 'cache-manager';
import { CacheManager } from './cache-manager';

@Injectable()
export class S3 {
  s3: AWS.S3;
  constructor(accessKeyId, secrectAccessKey, region) {
    this.s3 = new AWS.S3({
      credentials: {
        accessKeyId: accessKeyId,
        secretAccessKey: secrectAccessKey,
      },
      region: region,
    });
  }

  /**
   * Upload file to S3
   *
   * @param {String} filename file name
   * @param {Object} data data object for file
   * @param {String} mimeType content mime type
   * @param {Boolean} isPrivate upload file as private
   */
  async upload(
    bucketName: string,
    filename,
    data,
    mimeType,
    isPrivate = false,
  ): Promise<any> {
    try {
      const accessLevel = isPrivate ? 'private' : 'public-read';
      const params = {
        ACL: accessLevel,
        Body: data,
        ContentType: mimeType,
        Bucket: bucketName,
        Key: filename,
      };
      const result = await this.s3.upload(params).promise();
      return result;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get signed file url S3
   *
   * @param {String} filename file name
   */
  async privateSignedUrl(
    bucketName: string,
    filename: string,
    expiry = 60 * 30, // default: 30 mins
  ): Promise<string> {
    try {
      // Check if signed URL already exists in cache
      let url: string = await CacheManager.cache.store.get(filename);
      console.log('Cached URL:', url);

      if (!url) {
        // Generate a new signed URL
        const params = {
          Bucket: bucketName,
          Key: filename,
          Expires: expiry, // Expiry in seconds
        };
        url = this.s3.getSignedUrl('getObject', params);
        console.log('Generated new URL:', url);
        console.log('filename', filename);
        await CacheManager.cache.store.set(filename, url, expiry * 0.9);
        // Cache it with TTL = 90% of expiry time
      }

      return url;
    } catch (error) {
      console.error('Error generating signed URL:', error);
      throw error;
    }
  }

  /**
   * Delete file to S3
   *
   * @param {String} fileurl fileurl
   */
  async deleteFile(bucketName: string, fileurl) {
    try {
      const params = {
        Bucket: bucketName,
        Key: fileurl,
      };
      const result = await this.s3.deleteObject(params).promise();

      return result;
    } catch (error) {
      throw error;
    }
  }

  async getAudioBufferFromS3(
    bucketName: string,
    filename: string,
  ): Promise<Buffer> {
    const params = {
      Bucket: bucketName,
      Key: filename,
    };

    const { Body } = await this.s3.getObject(params).promise();
    return Body as Buffer; // Cast to Buffer
  }
}
