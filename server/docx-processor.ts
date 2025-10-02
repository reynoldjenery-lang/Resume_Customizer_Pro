import mammoth from 'mammoth';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType, ImageRun } from 'docx';
import * as fs from 'fs';
import { Buffer } from 'buffer';

export interface DocxProcessingResult {
  html: string;
  styles: string[];
  images: { [key: string]: Buffer };
  metadata: {
    wordCount: number;
    pageCount: number;
    author?: string;
    title?: string;
    lastModified?: Date;
    processingTime?: number;
    isLargeFile?: boolean;
  };
}

export interface DocxExportOptions {
  title?: string;
  author?: string;
  subject?: string;
  description?: string;
  preserveStyles?: boolean;
}

import { docxCache, redisService } from './services/redis';
import { createHash } from 'crypto';
import sanitizeHtmlLib from 'sanitize-html';
import { withRetry, ErrorRecoveryService } from './utils/error-recovery';
import { logger } from './utils/logger';
import { config } from './config';

export class DocxProcessor {
  private static readonly CACHE_WARM_BATCH_SIZE = 10;
  private static readonly POPULAR_TEMPLATES_CACHE_KEY = 'popular_templates';
  private static readonly PROCESSING_STATS_KEY = 'docx_processing_stats';
  private static processingQueue = new Map<string, Promise<DocxProcessingResult>>();

  // Robust sanitizer using sanitize-html with a conservative allowlist
  static sanitizeHtml(input: string): string {
    if (!input) return '';
    const clean = sanitizeHtmlLib(input, {
      allowedTags: [
        'a','b','i','em','strong','u','p','br','ul','ol','li','h1','h2','h3','h4','h5','h6','blockquote','pre','code','span'
      ],
      allowedAttributes: {
        a: ['href', 'name', 'target', 'rel'],
        span: ['class']
      },
      allowedSchemes: ['http','https','mailto'],
      allowProtocolRelative: false,
      transformTags: {
        'a': (tagName, attribs) => {
          const href = attribs.href || '';
          const safeHref = href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:') ? href : '#';
          return { tagName: 'a', attribs: { href: safeHref, rel: 'noopener noreferrer', target: '_blank' } };
        }
      },
      allowedStyles: {}
    });
    return clean;
  }

  /**
   * Parse DOCX file and extract content with full formatting - OPTIMIZED with Redis caching
   */
  static async parseDocx(buffer: Buffer, progressCallback?: (progress: number) => void, options: { skipCache?: boolean; priority?: 'high' | 'normal' | 'low' } = {}): Promise<DocxProcessingResult> {
    return withRetry(
      async () => {
        // Generate comprehensive cache key from buffer hash and options
        const contentHash = createHash('sha256').update(buffer).digest('hex');
        const cacheKey = `docx_parse:${contentHash}`;
        const statsKey = `${DocxProcessor.PROCESSING_STATS_KEY}:${contentHash}`;
        
        // Check if this exact document is already being processed (deduplication)
        const existingProcessing = DocxProcessor.processingQueue.get(cacheKey);
        if (existingProcessing) {
          logger.info({ cacheKey }, 'Document already being processed, waiting for result');
          const result = await existingProcessing;
          progressCallback?.(100);
          return result;
        }
        
        // Create processing promise and add to queue
        const processingPromise = DocxProcessor.performDocxParsing(
          buffer, contentHash, cacheKey, statsKey, progressCallback, options
        );
        
        DocxProcessor.processingQueue.set(cacheKey, processingPromise);
        
        try {
          const result = await processingPromise;
          return result;
        } finally {
          // Clean up processing queue
          DocxProcessor.processingQueue.delete(cacheKey);
        }
      },
      {
        maxAttempts: 2,
        baseDelay: 1000,
        retryCondition: (error: unknown) => {
          const msg = error instanceof Error ? error.message : String(error);
          return !msg.includes('invalid file format') &&
                 !msg.includes('corrupted') &&
                 !msg.includes('unsupported');
        }
      },
      {
        operation: 'docx_parsing',
        metadata: { bufferSize: buffer.length, priority: options.priority || 'normal' }
      }
    );
  }

  /**
   * Core DOCX parsing logic with enhanced caching
   */
  private static async performDocxParsing(
    buffer: Buffer, 
    contentHash: string, 
    cacheKey: string, 
    statsKey: string, 
    progressCallback?: (progress: number) => void,
    options: { skipCache?: boolean; priority?: string } = {}
  ): Promise<DocxProcessingResult> {
    const startTime = Date.now();
    progressCallback?.(5);
    
    // Try to get from cache first (unless explicitly skipped)
    if (!options.skipCache) {
      try {
        const cached = await docxCache.get(cacheKey);
        if (cached) {
          logger.info({ cacheKey, processingTime: 0 }, 'Cache hit - returning cached DOCX parsing result');
          progressCallback?.(100);
          
          // Update cache access statistics
          await DocxProcessor.updateProcessingStats(statsKey, {
            lastAccessed: new Date(),
            accessCount: 1,
            cacheHit: true
          });
          
          return cached;
        }
      } catch (cacheError) {
        logger.warn({ error: cacheError }, 'Redis cache unavailable for DOCX parsing');
      }
    }

    // Cache miss - start processing
    logger.info({ cacheKey, bufferSize: buffer.length, priority: options.priority }, 'Cache miss - starting DOCX parsing');
    
    // Report initial progress
    progressCallback?.(10);
    
    // OPTIMIZATION: Use different strategies based on file size and priority
    const isLargeFile = buffer.length > 5 * 1024 * 1024; // 5MB threshold
    const isHighPriority = options.priority === 'high';
    
    let result;
    if (isLargeFile && !isHighPriority) {
      logger.info({ bufferSize: buffer.length }, 'Large file detected, using optimized parser');
      // For large files, use minimal processing for speed
      result = await mammoth.convertToHtml(
        { buffer },
        {
          // Minimal options for speed
          includeEmbeddedStyleMap: false,
          includeDefaultStyleMap: false,
          // Skip image processing for speed unless high priority
        }
      );
    } else {
      // Full processing for smaller files or high priority
      const processingMode = isHighPriority ? 'high-quality' : 'standard';
      logger.debug({ processingMode, bufferSize: buffer.length }, 'Using full DOCX processing');
      
      result = await mammoth.convertToHtml(
        { buffer },
        {
          convertImage: isHighPriority ? mammoth.images.imgElement(function(image) {
            return image.read("base64").then(function(imageBuffer) {
              return {
                src: `data:${image.contentType};base64,${imageBuffer}`
              };
            });
          }) : undefined,
          includeEmbeddedStyleMap: true,
          includeDefaultStyleMap: true,
          styleMap: [
            "p[style-name='Heading 1'] => h1:fresh",
            "p[style-name='Heading 2'] => h2:fresh", 
            "p[style-name='Heading 3'] => h3:fresh",
            "p[style-name='Title'] => h1.title:fresh",
            "p[style-name='Subtitle'] => h2.subtitle:fresh",
            "p[style-name='Quote'] => blockquote:fresh",
            "r[style-name='Strong'] => strong:fresh",
            "r[style-name='Emphasis'] => em:fresh"
          ]
        }
      );
    }
      
      progressCallback?.(60);

      // OPTIMIZATION: Fast metadata extraction without full text processing
      let wordCount: number;
      let rawText: string;
      
      if (isLargeFile) {
        // For large files, estimate from HTML content
        const textOnly = result.value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        const words = textOnly.split(' ').filter(word => word.length > 0);
        wordCount = words.length;
        rawText = textOnly;
      } else {
        // Full text extraction for smaller files
        const rawResult = await mammoth.extractRawText({ buffer });
        rawText = rawResult.value;
        wordCount = rawText.split(/\s+/).filter(word => word.length > 0).length;
      }

      // Estimate page count (optimized calculation)
      const pageCount = Math.max(1, Math.ceil(wordCount / 250));

      // Sanitize HTML and wrap for rendering
      const safeHtml = DocxProcessor.sanitizeHtml(result.value);
      const wrappedHtml = `<div class=\"doc-page resume-content\">${safeHtml}</div>`;

      progressCallback?.(95);
      
      const processingTime = Date.now() - startTime;
      const processingResult: DocxProcessingResult = {
        html: wrappedHtml,
        styles: result.messages?.map(msg => msg.message) || [],
        images: {}, // Populated separately if needed
        metadata: {
          wordCount,
          pageCount,
          title: 'Resume Document',
          author: 'Resume Author',
          lastModified: new Date(),
          processingTime,
          isLargeFile
        }
      };

      progressCallback?.(100);
      
    // Cache the result with intelligent TTL based on file characteristics
    try {
      // Determine cache TTL based on file size and processing time
      const baseTTL = config.redis.cacheTTL.docx;
      let customTTL = baseTTL;
      
      if (isLargeFile) {
        // Cache large files longer since they're expensive to process
        customTTL = baseTTL * 2;
      }
      if (processingTime > 10000) {
        // Cache slow-processing files longer
        customTTL = Math.max(customTTL, baseTTL * 1.5);
      }
      
      await docxCache.set(cacheKey, processingResult, customTTL);
      logger.info({ cacheKey, customTTL, processingTime }, 'DOCX parsing result cached');
      
      // Update processing statistics
      await DocxProcessor.updateProcessingStats(statsKey, {
        lastProcessed: new Date(),
        processingTime,
        bufferSize: buffer.length,
        wordCount,
        pageCount,
        cacheHit: false,
        isLargeFile
      });
      
      // Track popular documents for cache warming
      await DocxProcessor.trackPopularDocument(contentHash, {
        processingTime,
        wordCount,
        pageCount,
        bufferSize: buffer.length
      });
      
    } catch (cacheError) {
      logger.warn({ error: cacheError }, 'Failed to cache DOCX processing result');
    }
    
    logger.info({ 
      processingTime, 
      wordCount, 
      pageCount, 
      bufferSize: buffer.length,
      isLargeFile,
      priority: options.priority 
    }, 'DOCX parsing completed');
    
    return processingResult;
  }
  
  /**
   * Update processing statistics for analytics and optimization
   */
  private static async updateProcessingStats(statsKey: string, stats: any): Promise<void> {
    try {
      await redisService.executeCommand(
        async () => {
          const client = redisService.getClient();
          const pipeline = client.pipeline();
          
          // Update individual stats
          Object.entries(stats).forEach(([key, value]) => {
            if (key === 'accessCount') {
              pipeline.hincrby(statsKey, key, value as number);
            } else {
              pipeline.hset(statsKey, key, JSON.stringify(value));
            }
          });
          
          // Set expiration
          pipeline.expire(statsKey, config.redis.cacheTTL.analytics);
          
          await pipeline.exec();
        },
        'update_processing_stats'
      );
    } catch (error) {
      logger.error({ error, statsKey }, 'Failed to update processing stats');
    }
  }
  
  /**
   * Track popular documents for proactive cache warming
   */
  private static async trackPopularDocument(contentHash: string, metadata: any): Promise<void> {
    try {
      await redisService.executeCommand(
        async () => {
          const client = redisService.getClient();
          const score = Date.now(); // Use timestamp as score for recency
          
          await client.zadd(
            DocxProcessor.POPULAR_TEMPLATES_CACHE_KEY,
            score,
            JSON.stringify({ contentHash, ...metadata })
          );
          
          // Keep only top 100 popular documents
          await client.zremrangebyrank(DocxProcessor.POPULAR_TEMPLATES_CACHE_KEY, 0, -101);
          
          // Set expiration for the sorted set
          await client.expire(DocxProcessor.POPULAR_TEMPLATES_CACHE_KEY, config.redis.cacheTTL.analytics);
        },
        'track_popular_document'
      );
    } catch (error) {
      logger.error({ error, contentHash }, 'Failed to track popular document');
    }
  }

  /**
   * Convert HTML content back to DOCX with proper formatting
   */
  static async generateDocx(htmlContent: string, options: DocxExportOptions = {}): Promise<Buffer> {
    return withRetry(
      async () => {
        console.log('🔄 Starting DOCX generation...');

        // Sanitize incoming HTML defensively
        const cleanHtml = DocxProcessor.sanitizeHtml(htmlContent);

        // Parse HTML and convert to DOCX elements
        const paragraphs = this.htmlToDocxElements(cleanHtml);

      // Create new document
      const doc = new Document({
        creator: options.author || "Resume Customizer Pro",
        title: options.title || "Resume Document",
        description: options.description || "Generated by Resume Customizer Pro",
        sections: [
          {
            properties: {
              page: {
                margin: {
                  top: 720,  // 0.5 inch
                  bottom: 720,
                  left: 720,
                  right: 720,
                },
                size: {
                  orientation: "portrait",
                  width: 12240, // 8.5 inch
                  height: 15840, // 11 inch
                },
              },
            },
            children: paragraphs,
          },
        ],
      });

        // Generate DOCX buffer
        const buffer = await Packer.toBuffer(doc);
        console.log('✅ DOCX generated successfully');
        return buffer;
      },
      {
        maxAttempts: 2,
        baseDelay: 500
      },
      {
        operation: 'docx_generation',
        metadata: { contentLength: htmlContent.length }
      }
    );
  }

  /**
   * Convert HTML elements to DOCX elements
   */
  private static htmlToDocxElements(html: string): Array<Paragraph | Table> {
    const elements: Array<Paragraph | Table> = [];
    
    // Simple HTML to DOCX conversion (this would be much more sophisticated in production)
    // Split by major HTML elements
    const htmlWithoutTags = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove scripts
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ''); // Remove styles

    // Parse common HTML elements
    const lines = htmlWithoutTags.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      if (line.includes('<h1')) {
        elements.push(new Paragraph({
          text: this.extractTextFromHtml(line),
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 200 }
        }));
      } else if (line.includes('<h2')) {
        elements.push(new Paragraph({
          text: this.extractTextFromHtml(line),
          heading: HeadingLevel.HEADING_2,
          spacing: { after: 150 }
        }));
      } else if (line.includes('<h3')) {
        elements.push(new Paragraph({
          text: this.extractTextFromHtml(line),
          heading: HeadingLevel.HEADING_3,
          spacing: { after: 100 }
        }));
      } else if (line.includes('<li')) {
        elements.push(new Paragraph({
          text: `• ${this.extractTextFromHtml(line)}`,
          spacing: { after: 100 }
        }));
      } else if (line.trim() && !line.includes('<div') && !line.includes('</div>')) {
        // Regular paragraph
        const text = this.extractTextFromHtml(line);
        if (text.trim()) {
          elements.push(new Paragraph({
            children: [new TextRun(text)],
            spacing: { after: 120 }
          }));
        }
      }
    }

    // Ensure we have at least one paragraph
    if (elements.length === 0) {
      elements.push(new Paragraph({
        children: [new TextRun("Resume content")],
      }));
    }

    return elements;
  }

  /**
   * Extract plain text from HTML
   */
  private static extractTextFromHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/&nbsp;/g, ' ') // Replace HTML entities
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
  }

  /**
   * Validate DOCX file with error recovery
   */
  static async validateDocx(buffer: Buffer): Promise<boolean> {
    return withRetry(
      async () => {
        // Quick validation using mammoth
        await mammoth.extractRawText({ buffer });
        
        // Additional validation - check for DOCX signature
        if (buffer.length < 4) {
          throw new Error('File too small to be a valid DOCX');
        }
        
        // Check ZIP signature (DOCX files are ZIP archives)
        const signature = buffer.slice(0, 4);
        if (signature[0] !== 0x50 || signature[1] !== 0x4B) {
          throw new Error('Invalid DOCX file signature');
        }
        
        return true;
      },
      {
        maxAttempts: 1, // Don't retry validation, it should be quick
        baseDelay: 0
      },
      {
        operation: 'docx_validation',
        metadata: { bufferSize: buffer.length }
      }
    ).catch(() => false); // Return false on any error
  }
  
  /**
   * Proactively warm cache with popular documents
   */
  static async warmCache(documentBuffers: Buffer[], options: { priority?: string; batchSize?: number } = {}): Promise<{ warmed: number; errors: number }> {
    const batchSize = options.batchSize || DocxProcessor.CACHE_WARM_BATCH_SIZE;
    let warmed = 0;
    let errors = 0;
    
    logger.info({ count: documentBuffers.length, batchSize }, 'Starting cache warming');
    
    // Process in batches to avoid overwhelming the system
    for (let i = 0; i < documentBuffers.length; i += batchSize) {
      const batch = documentBuffers.slice(i, i + batchSize);
      
      await Promise.allSettled(
        batch.map(async (buffer, index) => {
          try {
            await DocxProcessor.parseDocx(buffer, undefined, { 
              priority: options.priority as any || 'low'
            });
            warmed++;
            logger.debug({ index: i + index }, 'Document cached during warming');
          } catch (error) {
            errors++;
            logger.warn({ error, index: i + index }, 'Failed to cache document during warming');
          }
        })
      );
      
      // Small delay between batches to prevent overwhelming
      if (i + batchSize < documentBuffers.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    logger.info({ warmed, errors, total: documentBuffers.length }, 'Cache warming completed');
    return { warmed, errors };
  }
  
  /**
   * Get cache warming candidates based on popularity
   */
  static async getCacheWarmingCandidates(limit: number = 20): Promise<string[]> {
    try {
      return await redisService.executeCommand(
        async () => {
          const client = redisService.getClient();
          const results = await client.zrevrange(
            DocxProcessor.POPULAR_TEMPLATES_CACHE_KEY,
            0,
            limit - 1
          );
          
          return results.map((result: string) => {
            try {
              const parsed = JSON.parse(result);
              return parsed.contentHash;
            } catch {
              return null;
            }
          }).filter(Boolean);
        },
        'get_cache_warming_candidates'
      );
    } catch (error) {
      logger.error({ error }, 'Failed to get cache warming candidates');
      return [];
    }
  }
  
  /**
   * Get comprehensive processing statistics
   */
  static async getProcessingStats(): Promise<{
    totalProcessed: number;
    cacheHitRate: number;
    averageProcessingTime: number;
    popularDocuments: number;
    memoryUsage: { estimated: string; keys: number };
  }> {
    try {
      return await redisService.executeCommand(
        async () => {
          const client = redisService.getClient();
          
          // Get all processing stats keys
          const statsKeys = await client.keys(`${DocxProcessor.PROCESSING_STATS_KEY}:*`);
          
          let totalProcessed = 0;
          let totalCacheHits = 0;
          let totalProcessingTime = 0;
          let validStats = 0;
          
          for (const key of statsKeys) {
            try {
              const stats = await client.hgetall(key);
              if (stats.lastProcessed) {
                totalProcessed++;
                
                if (stats.cacheHit === 'true') totalCacheHits++;
                
                const processingTime = parseInt(stats.processingTime || '0');
                if (processingTime > 0) {
                  totalProcessingTime += processingTime;
                  validStats++;
                }
              }
            } catch (error) {
              logger.debug({ error, key }, 'Failed to parse processing stats');
            }
          }
          
          // Get popular documents count
          const popularCount = await client.zcard(DocxProcessor.POPULAR_TEMPLATES_CACHE_KEY);
          
          // Get cache stats
          const cacheStats = await docxCache.getStats();
          
          return {
            totalProcessed,
            cacheHitRate: totalProcessed > 0 ? (totalCacheHits / totalProcessed) * 100 : 0,
            averageProcessingTime: validStats > 0 ? totalProcessingTime / validStats : 0,
            popularDocuments: popularCount || 0,
            memoryUsage: {
              estimated: `${Math.round(cacheStats.totalKeys * 5)} KB`, // Rough estimate
              keys: cacheStats.totalKeys
            }
          };
        },
        'get_processing_stats'
      );
    } catch (error) {
      logger.error({ error }, 'Failed to get processing statistics');
      return {
        totalProcessed: 0,
        cacheHitRate: 0,
        averageProcessingTime: 0,
        popularDocuments: 0,
        memoryUsage: { estimated: '0 KB', keys: 0 }
      };
    }
  }
  
  /**
   * Optimize cache by removing old or rarely accessed entries
   */
  static async optimizeCache(): Promise<{ removed: number; optimized: number }> {
    logger.info('Starting DOCX cache optimization');
    let removed = 0;
    let optimized = 0;
    
    try {
      await redisService.executeCommand(
        async () => {
          const client = redisService.getClient();
          
          // Get all DOCX cache keys
          const docxKeys = await client.keys('docx:*');
          const statsKeys = await client.keys(`${DocxProcessor.PROCESSING_STATS_KEY}:*`);
          
          const now = Date.now();
          const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);
          
          for (const key of docxKeys) {
            const statsKey = key.replace('docx:', DocxProcessor.PROCESSING_STATS_KEY + ':');
            
            try {
              const stats = await client.hgetall(statsKey);
              const lastAccessed = parseInt(stats.lastAccessed || '0');
              const accessCount = parseInt(stats.accessCount || '0');
              
              // Remove if not accessed in a week and low access count
              if (lastAccessed < oneWeekAgo && accessCount < 3) {
                await client.del(key, statsKey);
                removed++;
              } else {
                optimized++;
              }
            } catch (error) {
              // If stats are missing, assume it's old and remove
              await client.del(key);
              removed++;
            }
          }
          
          // Clean up orphaned stats
          for (const statsKey of statsKeys) {
            const cacheKey = statsKey.replace(DocxProcessor.PROCESSING_STATS_KEY + ':', 'docx:');
            const exists = await client.exists(cacheKey);
            if (!exists) {
              await client.del(statsKey);
              removed++;
            }
          }
        },
        'optimize_docx_cache'
      );
      
      logger.info({ removed, optimized }, 'DOCX cache optimization completed');
    } catch (error) {
      logger.error({ error }, 'Failed to optimize DOCX cache');
    }
    
    return { removed, optimized };
  }
  
  /**
   * Scheduled cache maintenance (should be called periodically)
   */
  static async performMaintenance(): Promise<void> {
    logger.info('Starting scheduled DOCX cache maintenance');
    
    try {
      // Optimize cache
      const { removed, optimized } = await DocxProcessor.optimizeCache();
      
      // Clean up old popular documents tracking
      await redisService.executeCommand(
        async () => {
          const client = redisService.getClient();
          const oneMonthAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
          
          await client.zremrangebyscore(
            DocxProcessor.POPULAR_TEMPLATES_CACHE_KEY,
            0,
            oneMonthAgo
          );
        },
        'cleanup_popular_documents'
      );
      
      logger.info({ removed, optimized }, 'DOCX cache maintenance completed');
    } catch (error) {
      logger.error({ error }, 'DOCX cache maintenance failed');
    }
  }
}
