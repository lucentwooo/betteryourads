/**
 * Kie.ai API Client for Nano Banana 2
 * Handles task creation, polling, and image download
 */

import * as fs from 'fs';
import * as path from 'path';

interface KieConfig {
  apiKey: string;
  baseUrl?: string;
}

interface TaskResponse {
  code: number;
  msg: string;
  data?: {
    taskId?: string;
    task_id?: string;
    recordId?: string;
    status?: 'pending' | 'processing' | 'completed' | 'failed';
    output?: {
      image_url?: string;
      images?: string[];
    };
  };
}

export class KieClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: KieConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.kie.ai';
  }

  /**
   * Create a new image generation task
   */
  async createTask(params: {
    prompt: string;
    aspectRatio?: string;
    resolution?: '1K' | '2K' | '4K';
    outputFormat?: 'png' | 'jpg';
    imageInput?: string[];
  }): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/v1/jobs/createTask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: 'nano-banana-2',
        input: {
          prompt: params.prompt,
          aspect_ratio: params.aspectRatio || '1:1',
          resolution: params.resolution || '1K',
          output_format: params.outputFormat || 'png',
          image_input: params.imageInput || [],
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create task: ${error}`);
    }

    const result: TaskResponse = await response.json();

    if (result.code !== 200) {
      throw new Error(`API Error: ${result.msg}`);
    }

    const taskId = result.data?.taskId || result.data?.task_id || '';
    console.log(`   Task ID: ${taskId}`);
    return taskId;
  }

  /**
   * Get task status and results
   * Note: Kie.ai status endpoint is unreliable, so we also try alternative methods
   */
  async getTaskStatus(taskId: string): Promise<TaskResponse['data']> {
    // Try the standard endpoint first
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/jobs/getTaskDetail?task_id=${taskId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (response.ok) {
        const result: TaskResponse = await response.json();
        return result.data;
      }
    } catch (e) {
      // Continue to fallback
    }

    // Fallback: Try to get status via record endpoint
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/records/${taskId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (response.ok) {
        const result: TaskResponse = await response.json();
        return result.data;
      }
    } catch (e) {
      // Continue
    }

    return undefined;
  }

  /**
   * Construct image URL from known patterns
   * Since status endpoint is flaky, we construct the URL directly
   */
  constructImageUrl(taskId: string): string {
    // Based on observed pattern: tempfile.aiquickdraw.com/images/{timestamp}-{random}.png
    // We can't predict the exact URL, but we know the base domain
    return `https://tempfile.aiquickdraw.com/images/`;
  }

  /**
   * Poll for task completion
   */
  async pollForCompletion(
    taskId: string,
    options?: {
      maxAttempts?: number;
      intervalMs?: number;
      onProgress?: (status: string) => void;
    }
  ): Promise<string> {
    const maxAttempts = options?.maxAttempts || 60;
    const intervalMs = options?.intervalMs || 5000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const data = await this.getTaskStatus(taskId);

      if (!data) {
        throw new Error('No data returned from task status check');
      }

      const status = data.status;
      if (status) options?.onProgress?.(status);

      if (status === 'completed') {
        const imageUrl = data.output?.image_url || data.output?.images?.[0];
        if (!imageUrl) {
          throw new Error('Task completed but no image URL found');
        }
        return imageUrl;
      }

      if (status === 'failed') {
        throw new Error('Image generation failed');
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    throw new Error(`Task did not complete within ${maxAttempts} attempts`);
  }

  /**
   * Download image from URL
   */
  async downloadImage(imageUrl: string, outputPath: string): Promise<void> {
    const response = await fetch(imageUrl);

    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    fs.writeFileSync(outputPath, Buffer.from(buffer));
  }

  /**
   * Generate image with polling
   */
  async generateImage(params: {
    prompt: string;
    aspectRatio?: string;
    resolution?: '1K' | '2K' | '4K';
    outputFormat?: 'png' | 'jpg';
    outputPath: string;
    onProgress?: (status: string) => void;
  }): Promise<void> {
    // Create task
    console.log('Creating generation task...');
    const taskId = await this.createTask({
      prompt: params.prompt,
      aspectRatio: params.aspectRatio,
      resolution: params.resolution,
      outputFormat: params.outputFormat,
    });

    console.log(`Task created: ${taskId}`);

    // Poll for completion
    console.log('Waiting for generation to complete...');
    const imageUrl = await this.pollForCompletion(taskId, {
      onProgress: params.onProgress,
    });

    // Download image
    console.log('Downloading generated image...');
    await this.downloadImage(imageUrl, params.outputPath);

    console.log(`Image saved to: ${params.outputPath}`);
  }
}
