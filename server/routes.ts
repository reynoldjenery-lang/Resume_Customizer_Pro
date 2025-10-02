import type { Express } from "express";
import { createServer, type Server } from "http";
import passport from "passport";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, hashPassword } from "./localAuth";
import { insertResumeSchema, insertTechStackSchema, insertPointGroupSchema, insertProcessingHistorySchema, type Point, authRateLimits, users, emailRateLimits } from "@shared/schema";
import { db } from "./db";
import { ActivityTracker } from './utils/activityTracker';
import adminActivityRoutes from './routes/adminActivityRoutes';
import attachmentsRoutes from './routes/attachments';
import authRoutes from './routes/authRoutes';
import { eq } from "drizzle-orm";
import { DocxProcessor } from "./docx-processor";
import multer from "multer";
import { z } from "zod";
import path from 'path';
import { existsSync } from 'fs';
import fsp from 'fs/promises';
import { randomUUID } from 'crypto';
import { Limiter } from './utils/limiter';
import { withRetry, withDbRetry, ErrorRecoveryService } from './utils/error-recovery';
import { jobProcessor } from './utils/job-processor';
import { redisService } from './services/redis';

// Helper functions for tech stack processing
interface TechStackData {
  name: string;
  bulletPoints: string[];
}

function parseTechStackInputOptimized(input: string): TechStackData[] {
  const techStacks: TechStackData[] = [];
  const lines = input.split('\n').map(line => line.trim()).filter(Boolean);
  
  let currentTechStack: TechStackData | null = null;
  
  for (const line of lines) {
    if (!line.startsWith('•')) {
      // This is a tech stack name
      if (currentTechStack) {
        techStacks.push(currentTechStack);
      }
      currentTechStack = {
        name: line,
        bulletPoints: []
      };
    } else if (currentTechStack) {
      // This is a bullet point
      currentTechStack.bulletPoints.push(line.substring(1).trim());
    }
  }
  
  if (currentTechStack) {
    techStacks.push(currentTechStack);
  }
  
  return techStacks;
}

function generatePointGroupsAuto(techStacks: TechStackData[]): Point[][] {
  // Flatten all points with their tech stack names
  const allPoints: Point[] = techStacks.flatMap(ts => 
    ts.bulletPoints.map(point => ({
      techStack: ts.name,
      text: point
    }))
  );
  
  // Calculate optimal group size based on total points
  const totalPoints = allPoints.length;
  let optimalGroupSize: number;
  
  if (totalPoints <= 12) {
    // For small datasets, use 4 points per group
    optimalGroupSize = 4;
  } else if (totalPoints <= 24) {
    // For medium datasets, use 5-6 points per group
    optimalGroupSize = 5;
  } else {
    // For large datasets, use 6-7 points per group
    optimalGroupSize = 6;
  }
  
  // Ensure we don't have tiny groups at the end
  const numGroups = Math.ceil(totalPoints / optimalGroupSize);
  const adjustedGroupSize = Math.ceil(totalPoints / numGroups);
  
  // ...existing code...
  
  // Sort points by tech stack for even distribution across groups
  allPoints.sort((a, b) => a.techStack.localeCompare(b.techStack));
  
  // Distribute points evenly across groups using round-robin
  const groups: Point[][] = Array.from({ length: numGroups }, () => []);
  
  allPoints.forEach((point, index) => {
    const groupIndex = index % numGroups;
    groups[groupIndex].push(point);
  });
  
  // Filter out empty groups and ensure all groups have at least 3 points
  const validGroups = groups.filter(group => group.length >= 3);
  
  // ...existing code...
  return validGroups;
}

// Configure multer for file uploads (env-driven limits)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Number(process.env.MAX_FILE_SIZE || 25_000_000),
    files: Number(process.env.MAX_FILES_PER_REQUEST || 3),
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      cb(null, true);
    } else {
      cb(new Error('Only DOCX files are allowed'));
    }
  },
});

// Validation schemas for auto-processing
const techStackInputSchema = z.object({
  input: z.string().min(1, "Tech stack input is required"),
});

const resumeContentSchema = z.object({
  content: z.string().min(1, "Content is required"),
});

const bulkProcessingSchema = z.object({
  resumeIds: z.array(z.string().uuid("Invalid resume ID format")).min(1, "At least one resume ID required"),
  input: z.string().min(1, "Tech stack input is required"),
});

const bulkExportSchema = z.object({
  resumeIds: z.array(z.string().uuid("Invalid resume ID format")).min(1, "At least one resume ID required"),
  format: z.enum(['docx']).optional().default('docx'),
});

const bulkSaveSchema = z.object({
  updates: z.array(z.object({
    resumeId: z.string().uuid("Invalid resume ID format"),
    content: z.string().min(1, "Content is required"),
  })).min(1, "At least one update required"),
});

const exportOptionsSchema = z.object({
  content: z.string().optional(),
  options: z.object({
    title: z.string().optional(),
    author: z.string().optional(),
    margins: z.object({
      top: z.number().optional(),
      bottom: z.number().optional(),
      left: z.number().optional(),
      right: z.number().optional(),
    }).optional(),
  }).optional(),
});

const authSchema = z.object({
  email: z.string().email("Invalid email format").min(1, "Email is required"),
  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/, "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character"),
});

// Standardized logging helper
function logRequest(method: string, path: string, userId?: string, extra?: any) {
  const timestamp = new Date().toISOString();
  const userInfo = userId ? ` - User: ${userId}` : '';
  const extraInfo = extra ? ` - ${JSON.stringify(extra)}` : '';
  console.log(`🔍 [${timestamp}] ${method} ${path}${userInfo}${extraInfo}`);
}

function logSuccess(operation: string, details?: any) {
  const detailsInfo = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`✅ ${operation}${detailsInfo}`);
}

function logError(operation: string, error: any, context?: any) {
  const contextInfo = context ? ` - Context: ${JSON.stringify(context)}` : '';
  console.error(`💥 ${operation} failed:`, error, contextInfo);
}

// Helper function to verify resume ownership
async function verifyResumeOwnership(resumeId: string, userId: string) {
  const resume = await storage.getResumeById(resumeId);
  
  if (!resume) {
    return { error: { status: 404, message: "Resume not found" } };
  }
  
  if (resume.userId !== userId) {
    return { error: { status: 403, message: "Access denied" } };
  }
  
  return { resume };
}

// Helper function for bulk resume ownership verification
async function verifyBulkResumeOwnership(resumeIds: string[], userId: string) {
  const resumeChecks = await Promise.all(
    resumeIds.map(async (id: string, index: number) => {
      logRequest('VERIFY', `/resumes/${id}`, userId, { index: index + 1, total: resumeIds.length });
      const resume = await storage.getResumeById(id);
      if (!resume) {
        logError('Resume verification', `Resume not found: ${id}`);
        return null;
      }
      if (resume.userId !== userId) {
        logError('Resume verification', `Access denied to resume ${id}`, { owner: resume.userId, requestor: userId });
        return null;
      }
      logSuccess(`Resume ${id} verified`);
      return resume;
    })
  );
  
  const validResumes = resumeChecks.filter(Boolean);
  
  if (validResumes.length !== resumeIds.length) {
    const invalidResumes = resumeIds.filter((id, index) => !resumeChecks[index]);
    return {
      error: {
        status: 403,
        message: "Access denied to some resumes",
        invalidResumes,
        details: "Some resumes were not found or you don't have permission to access them"
      }
    };
  }
  
  return { validResumes };
}

// Helper function for standard error responses
function handleValidationError(error: z.ZodError, res: any) {
  return res.status(400).json({
    message: "Invalid request data",
    errors: error.errors.map(err => ({
      path: err.path.join('.'),
      message: err.message
    }))
  });
}

// Helper function for standard server error responses
function handleServerError(error: any, operation: string, res: any, context?: any) {
  logError(operation, error, context);
  return res.status(500).json({
    message: `Failed to ${operation.toLowerCase()}`,
    error: error instanceof Error ? error.message : "Unknown error"
  });
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Capture UTM params into a short-lived cookie so multi-step flows retain attribution
  function utmCookieMiddleware(req: any, res: any, next: any) {
    try {
      const q = req.query || {};
      const present = q.utm_source || q.utm_medium || q.utm_campaign || q.utm_term || q.utm_content;
      if (present) {
        const referrer = (req.headers['referer'] || req.headers['referrer'] || '') as string;
        const data = {
          utm: {
            source: q.utm_source,
            medium: q.utm_medium,
            campaign: q.utm_campaign,
            term: q.utm_term,
            content: q.utm_content,
          },
          referrer,
          ts: Date.now(),
        };
        const encoded = Buffer.from(JSON.stringify(data), 'utf8').toString('base64');
        res.cookie('utm_params', encoded, {
          maxAge: 30 * 60 * 1000, // 30 minutes
          httpOnly: true,
          sameSite: 'lax',
          path: '/',
        });
      }
    } catch {}
    next();
  }

  app.use(utmCookieMiddleware);
  // Auth middleware
  await setupAuth(app);
  
  // Register activity tracking routes
  app.use('/api/user/activity', (await import('./routes/activityRoutes')).default);

  // Simple in-memory rate limiting per email+IP for login attempts
  type AttemptRecord = { count: number; first: number };
  const loginAttempts = new Map<string, AttemptRecord>();
  const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
  const MAX_ATTEMPTS = 10; // per window per email+IP

  const loginRateLimiter = async (req: any, res: any, next: any) => {
    const email = (req.body?.email || '').toLowerCase();
    const ip = String(req.ip || 'unknown');
    const now = new Date();

    if (!email) return next();

    // Fetch current record
    const rec = await db.query.authRateLimits.findFirst({
      where: (t, { and, eq }) => and(eq(t.email, email), eq(t.ip, ip)),
    });

    // If currently blocked, enforce it
    if (rec?.blockedUntil && rec.blockedUntil > now) {
      const retryAfter = Math.ceil((rec.blockedUntil.getTime() - now.getTime()) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ message: 'Too many login attempts. Please try again later.' });
    }

    let count = rec?.count ?? 0;
    let windowStart = rec?.windowStart ?? now;

    if (now.getTime() - windowStart.getTime() > WINDOW_MS) {
      count = 0;
      windowStart = now;
    }
    count += 1;

    // Determine block
    const shouldBlock = count > MAX_ATTEMPTS;
    const blockedUntil = shouldBlock ? new Date(windowStart.getTime() + WINDOW_MS) : null;

    // Upsert record
    await db
      .insert(authRateLimits)
      .values({ email, ip, count, windowStart, blockedUntil: blockedUntil ?? undefined, updatedAt: now })
      .onConflictDoUpdate({
        target: [authRateLimits.email, authRateLimits.ip],
        set: { count, windowStart, blockedUntil: blockedUntil ?? null, updatedAt: now },
      });

    if (shouldBlock) {
      const retryAfter = Math.ceil((blockedUntil!.getTime() - now.getTime()) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ message: 'Too many login attempts. Please try again later.' });
    }

    next();
  };

  // Per-user job submission quotas and coarse in-flight limits (Redis-backed)
  // Uses fixed window counters for simplicity and multi-instance safety.
  async function __canSubmitJobDetailed(userId: string): Promise<boolean> {
    // Delegate to Redis service helper for fully atomic check
    const ok = await (await import('./services/redis')).tryAcquireJobQuota({
      userId,
    });
    return ok;
  }

  function parseCookies(header?: string) {
    const result: Record<string, string> = {};
    if (!header) return result;
    header.split(';').forEach((pair) => {
      const idx = pair.indexOf('=');
      if (idx > -1) {
        const k = pair.slice(0, idx).trim();
        const v = pair.slice(idx + 1).trim();
        result[k] = decodeURIComponent(v);
      }
    });
    return result;
  }

  function extractTrackingInfo(req: any) {
    let referrer = (req.headers['referer'] || req.headers['referrer'] || '') as string;
    const q = req.query || {};
    const utm: any = {
      source: q.utm_source,
      medium: q.utm_medium,
      campaign: q.utm_campaign,
      term: q.utm_term,
      content: q.utm_content,
    };

    // If no UTM in query, fallback to cookie
    if (!utm.source && !utm.medium && !utm.campaign && !utm.term && !utm.content) {
      try {
        const cookies = parseCookies(req.headers.cookie);
        const raw = cookies['utm_params'];
        if (raw) {
          const decoded = Buffer.from(raw, 'base64').toString('utf8');
          const obj = JSON.parse(decoded);
          if (obj?.utm) {
            Object.assign(utm, obj.utm);
          }
          if (!referrer && obj?.referrer) {
            referrer = obj.referrer;
          }
        }
      } catch {}
    }

    Object.keys(utm).forEach((k) => utm[k] === undefined && delete utm[k]);
    return { referrer, utm: Object.keys(utm).length ? utm : undefined };
  }

  // Admin activity routes
  app.use('/api/admin/activity', adminActivityRoutes);
  
  // Enhanced admin endpoints for monitoring
  app.get('/api/admin/queue/stats', isAuthenticated, async (req: any, res) => {
    try {
      // Only allow admin users (add your admin check logic here)
      const stats = await jobProcessor.getQueueStats();
      res.json(stats);
    } catch (error) {
      console.error('Failed to get queue stats:', error);
      res.status(500).json({ error: 'Failed to get queue stats' });
    }
  });

  app.get('/api/admin/errors/stats', isAuthenticated, (req: any, res) => {
    try {
      const stats = ErrorRecoveryService.getInstance().getStats();
      res.json(stats);
    } catch (error) {
      console.error('Failed to get error stats:', error);
      res.status(500).json({ error: 'Failed to get error stats' });
    }
  });

  app.post('/api/admin/queue/cleanup', isAuthenticated, async (req: any, res) => {
    try {
      const { olderThanDays = 7 } = req.body;
      await jobProcessor.cleanupOldJobs(olderThanDays);
      res.json({ success: true, message: `Cleaned up jobs older than ${olderThanDays} days` });
    } catch (error) {
      console.error('Failed to cleanup old jobs:', error);
      res.status(500).json({ error: 'Failed to cleanup old jobs' });
    }
  });
  
  // Marketing module routes
  app.use('/api/marketing', (await import('./routes/marketingRoutes')).default);
  
  // File attachment routes
  app.use('/api/attachments', attachmentsRoutes);

  // Apply rate limiting to login while delegating to AuthController via authRoutes
  app.post('/api/auth/login', loginRateLimiter, (_req, _res, next) => {
    // Pass through to the route defined in authRoutes (AuthController.login)
    next();
  });

  // Auth routes (from authRoutes.ts)
  app.use('/api/auth', authRoutes);

  // Google Drive integration routes
  app.use('/api/google-drive', (await import('./routes/googleDriveRoutes')).default);

  app.post('/api/auth/register', async (req, res) => {
    try {
      logRequest('POST', '/api/auth/register');
      
      const { email, password } = authSchema.parse(req.body);
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        logError('Registration', 'Email already registered', { email });
        return res.status(400).json({ message: 'Email already registered' });
      }
      
      const hashedPassword = await hashPassword(password);

      // Generate verification token and store on user
      const { AuthService } = await import('./services/authService');
      const verification = AuthService.generateEmailVerificationToken();

      // Create user with verification fields (store only hash)
      const [user] = await db
        .insert(users)
        .values({
          email,
          password: hashedPassword,
          emailVerificationToken: verification.tokenHash,
          emailVerificationExpires: verification.expiresAt,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      // Send verification email (send raw token to user)
      const displayName = 'User';
      await AuthService.sendVerificationEmail(email, displayName, verification.token);

      // Log activity (do NOT auto-login)
      try {
        const { referrer, utm } = extractTrackingInfo(req);
        await ActivityTracker.logActivity(
          user.id,
          'register',
          'success',
          { method: 'email', referrer, utm },
          req
        );
      } catch {}

      logSuccess('User registered (verification required)', { userId: user.id, email: user.email });
      return res.status(201).json({
        message: 'Registration successful. Please check your email to verify your account.',
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return handleValidationError(error, res);
      }
      return handleServerError(error, 'Register user', res);
    }
  });

  // Logout is handled by AuthController (supports both session and token logout)

  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Resend email verification
  // Minimal DB-backed rate limit: max 3 per 5 minutes per email+IP
  const resendVerificationRateLimiter = async (req: any, res: any, next: any) => {
    try {
      const email = String(req.body?.email || '').toLowerCase().trim();
      const ip = String(req.ip || 'unknown');
      const action = 'resend_verification';
      const WINDOW_MS = 5 * 60 * 1000;
      const MAX_ATTEMPTS = 3;
      const now = new Date();

      if (!email) return res.status(400).json({ message: 'Invalid email' });

      const rec = await db.query.emailRateLimits.findFirst({
        where: (t, { and, eq }) => and(eq(t.action, action), eq(t.email, email), eq(t.ip, ip)),
      });

      if (rec?.blockedUntil && rec.blockedUntil > now) {
        const retryAfter = Math.ceil((rec.blockedUntil.getTime() - now.getTime()) / 1000);
        res.set('Retry-After', String(retryAfter));
        return res.status(429).json({ message: 'Too many requests. Please try again later.' });
      }

      let count = rec?.count ?? 0;
      let windowStart = rec?.windowStart ?? now;

      if (now.getTime() - windowStart.getTime() > WINDOW_MS) {
        count = 0;
        windowStart = now;
      }
      count += 1;

      const shouldBlock = count > MAX_ATTEMPTS;
      const blockedUntil = shouldBlock ? new Date(windowStart.getTime() + WINDOW_MS) : null;

      await db
        .insert(emailRateLimits)
        .values({ action, email, ip, count, windowStart, blockedUntil: blockedUntil ?? undefined, updatedAt: now })
        .onConflictDoUpdate({
          target: [emailRateLimits.action, emailRateLimits.email, emailRateLimits.ip],
          set: { count, windowStart, blockedUntil: blockedUntil ?? null, updatedAt: now },
        });

      if (shouldBlock) {
        const retryAfter = Math.ceil((blockedUntil!.getTime() - now.getTime()) / 1000);
        res.set('Retry-After', String(retryAfter));
        return res.status(429).json({ message: 'Too many requests. Please try again later.' });
      }

      next();
    } catch (e) {
      return res.status(500).json({ message: 'Rate limit error' });
    }
  };

  app.post('/api/auth/resend-verification', resendVerificationRateLimiter, async (req, res) => {
    try {
      const email = String(req.body?.email || '').toLowerCase().trim();
      if (!email || !/.+@.+\..+/.test(email)) {
        return res.status(400).json({ message: 'Invalid email' });
      }

      const user = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.email, email) });

      if (user?.emailVerified) {
        return res.json({ message: 'Email already verified' });
      }

      if (user) {
        const verification = (await import('./services/authService')).AuthService.generateEmailVerificationToken();
        await db.update(users).set({
          emailVerificationToken: verification.tokenHash,
          emailVerificationExpires: verification.expiresAt,
          updatedAt: new Date(),
        }).where(eq(users.id, user.id));

        const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || 'User';
        await (await import('./services/authService')).AuthService.sendVerificationEmail(email, name, verification.token);
      }

      // Always return success to avoid email enumeration
      res.json({ message: 'If an account exists, a verification email has been sent.' });
    } catch (e: any) {
      res.status(500).json({ message: 'Failed to resend verification email' });
    }
  });

  // Email verification route
  app.get('/api/auth/verify-email', async (req, res) => {
    try {
      const token = String(req.query.token || '');
      if (!token) {
        return res.status(400).json({ message: 'Missing token' });
      }
      await (await import('./services/authService')).AuthService.verifyEmailToken(token);
      res.json({ message: 'Email verified' });
    } catch (e: any) {
      res.status(400).json({ message: e?.message || 'Invalid or expired token' });
    }
  });

  // User Stats route
  app.get('/api/user/stats', isAuthenticated, async (req: any, res) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      console.log('Routes: Fetching stats for user:', req.user.id);
      const stats = await storage.getUserStats(req.user.id);
      
      if (!stats) {
        return res.status(404).json({ message: "Stats not found" });
      }
      
      res.json(stats);
    } catch (error) {
      console.error("Error fetching user stats:", error);
      res.status(500).json({ 
        message: "Failed to fetch user stats",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Resume routes
  app.get('/api/resumes', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      logRequest('GET', '/api/resumes', userId);
      
      const resumes = await storage.getResumesByUserId(userId);
      
      console.log(`📋 Fetched ${resumes.length} resumes for user ${userId}`);
      res.json(resumes);
    } catch (error) {
      console.error("Error fetching resumes:", error);
      res.status(500).json({ 
        message: "Failed to fetch resumes",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.get('/api/resumes/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      logRequest('GET', `/api/resumes/${id}`, userId);
      
      const resume = await storage.getResumeById(id);
      
      if (!resume) {
        return res.status(404).json({ message: "Resume not found" });
      }
      
      if (resume.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      console.log(`📄 Fetched resume ${id} for user ${userId}`);
      res.json(resume);
    } catch (error) {
      console.error("Error fetching resume:", error);
      res.status(500).json({ 
        message: "Failed to fetch resume",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.patch('/api/resumes/bulk/content', isAuthenticated, async (req: any, res) => {
    try {
      // Validate request body using Zod
      const { updates } = bulkSaveSchema.parse(req.body);
      const userId = req.user.id;

      console.log(`\ud83d\udcbe BULK SAVE: ${updates.length} resumes`);

      // Verify user owns all resumes
      const resumeChecks = await Promise.all(
        updates.map(async (update: any) => {
          const resume = await storage.getResumeById(update.resumeId);
          return resume && resume.userId === userId;
        })
      );

      if (resumeChecks.some(check => !check)) {
        return res.status(403).json({ message: "Access denied to some resumes" });
      }

      // Save all contents in parallel
      const savePromises = updates.map(async (update: any) => {
        try {
          await storage.updateResumeContent(update.resumeId, update.content);
          await storage.updateResumeStatus(update.resumeId, "customized");
          return { resumeId: update.resumeId, success: true };
        } catch (error) {
          console.error(`Failed to save resume ${update.resumeId}:`, error);
          return { resumeId: update.resumeId, success: false, error: error instanceof Error ? error.message : "Unknown error" };
        }
      });

      const results = await Promise.all(savePromises);
      const successCount = results.filter(r => r.success).length;

      console.log(`\ud83d\udcbe BULK SAVE completed: ${successCount}/${updates.length} successful`);

      res.json({
        success: true,
        saved: successCount,
        total: updates.length,
        results
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      console.error("\ud83d\udca5 Bulk save failed:", error);
      res.status(500).json({ message: "Bulk save failed" });
    }
  });

  // Rate limiter configuration defaults (env-overridable)
  const RATE_WINDOW_MS = Number(process.env.RATE_WINDOW_MS || 60_000); // default 1 minute
  const RATE_UPLOAD_MAX = Number(process.env.RATE_UPLOAD_MAX || 10);
  const RATE_EXPORT_MAX = Number(process.env.RATE_EXPORT_MAX || 30);

  const makeRateLimiter = (action: string, windowMs: number, max: number) => async (req: any, res: any, next: any) => {
    try {
      const subjectKey = String(req.user?.id || 'anonymous');
      const ip = String(req.ip || 'unknown');
      const now = new Date();

      const rec = await db.query.emailRateLimits.findFirst({
        where: (t, { and, eq }) => and(eq(t.action, action), eq(t.email, subjectKey), eq(t.ip, ip)),
      });

      if (rec?.blockedUntil && rec.blockedUntil > now) {
        const retryAfter = Math.ceil((rec.blockedUntil.getTime() - now.getTime()) / 1000);
        res.set('Retry-After', String(retryAfter));
        return res.status(429).json({ message: 'Too many requests. Please try again later.' });
      }

      let count = rec?.count ?? 0;
      let windowStart = rec?.windowStart ?? now;
      if (now.getTime() - windowStart.getTime() > windowMs) {
        count = 0;
        windowStart = now;
      }
      count += 1;

      const shouldBlock = count > max;
      const blockedUntil = shouldBlock ? new Date(windowStart.getTime() + windowMs) : null;

      await db
        .insert(emailRateLimits)
        .values({ action, email: subjectKey, ip, count, windowStart, blockedUntil: blockedUntil ?? undefined, updatedAt: now })
        .onConflictDoUpdate({
          target: [emailRateLimits.action, emailRateLimits.email, emailRateLimits.ip],
          set: { count, windowStart, blockedUntil: blockedUntil ?? null, updatedAt: now },
        });

      if (shouldBlock) {
        const retryAfter = Math.ceil((blockedUntil!.getTime() - now.getTime()) / 1000);
        res.set('Retry-After', String(retryAfter));
        return res.status(429).json({ message: 'Too many requests. Please try again later.' });
      }

      next();
    } catch (e) {
      return res.status(500).json({ message: 'Rate limit error' });
    }
  };

  const uploadRateLimiter = makeRateLimiter('upload_resume', RATE_WINDOW_MS, RATE_UPLOAD_MAX);
  const exportRateLimiter = makeRateLimiter('export_docx', RATE_WINDOW_MS, RATE_EXPORT_MAX);

  app.post('/api/resumes/upload', isAuthenticated, uploadRateLimiter, upload.array('files'), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const sessionId = req.sessionID as string | undefined;
      const files = req.files as Express.Multer.File[];
      const MAX_SYNC_DOCX_SIZE = Number(process.env.MAX_SYNC_DOCX_SIZE || 7_000_000);
      
      if (!files || files.length === 0) {
        return res.status(400).json({ message: "No files uploaded" });
      }

      if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const startTime = Date.now();
      console.log(`⚡ ULTRA-FAST upload started: ${files.length} files`);
      
      // Ensure resume upload directory exists
      const baseUploadPath = process.env.FILE_STORAGE_PATH || process.env.UPLOAD_PATH || './uploads';
      const resumesDir = path.resolve(process.cwd(), baseUploadPath, 'resumes');
      if (!existsSync(resumesDir)) {
        await fsp.mkdir(resumesDir, { recursive: true });
      }
      
      // EXTREME PERFORMANCE: Process files in parallel with DOCX content extraction
      const uploadPromises = files.map(async (file, index) => {
        const fileStartTime = Date.now();
        
        // Extract actual content from DOCX file
        let extractedContent: string = '';
        let queueBackground = false;
        
        // PERFORMANCE OPTIMIZATION: Only do basic validation during upload
        // Defer all heavy DOCX processing to background jobs for much faster uploads
        if (file.size <= 2_000_000) { // Only process files smaller than 2MB synchronously
          try {
            // Quick validation only - no full processing
            const isValidDocx = await DocxProcessor.validateDocx(file.buffer);
            if (!isValidDocx) {
              throw new Error(`Invalid DOCX file: ${file.originalname}`);
            }
            // For small files, still queue for background processing for consistency
            queueBackground = true;
          } catch (error) {
            console.error(`File validation failed ${file.originalname}:`, error);
          }
        } else {
          queueBackground = true;
        }
        
        // Persist original file to disk
        const uniqueName = `${randomUUID()}.docx`;
        const absolutePath = path.join(resumesDir, uniqueName);
        await fsp.writeFile(absolutePath, file.buffer);
        const relativePath = path.relative(process.cwd(), absolutePath);
        
        const resumeData = insertResumeSchema.parse({
          userId,
          fileName: file.originalname,
          originalPath: relativePath,
          customizedContent: null, // Will be populated by background job
          fileSize: file.size,
          status: "uploaded", // Always start as uploaded, background job will update to ready
          ephemeral: true,
          sessionId: sessionId,
        } as any);

        const resume = await storage.createResume(resumeData);

        // Always queue background processing for fast uploads
        try {
          await jobProcessor.addJob('process_docx', {
            resumeId: resume.id,
            input: null,
            userId
          }, {
            priority: file.size > 2_000_000 ? 3 : 2, // Lower priority for larger files
            maxAttempts: 3,
            userId
          });
          console.log(`📨 Queued background DOCX processing for: ${file.originalname}`);
        } catch (e) {
          console.warn('Failed to queue background DOCX processing job', e);
        }

        const fileTime = Date.now() - fileStartTime;
        console.log(`⚡ File ${index + 1}/${files.length} done in ${fileTime}ms: ${file.originalname}`);
        
        return resume;
      });
      
      const uploadedResumes = await Promise.all(uploadPromises);
      const totalTime = Date.now() - startTime;
      
      console.log(`🚀 ULTRA-FAST upload completed: ${files.length} files in ${totalTime}ms (avg: ${Math.round(totalTime/files.length)}ms/file)`);
      res.json(uploadedResumes);
      
    } catch (error) {
      console.error("💥 Upload failed:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to upload resumes" 
      });
    }
  });

  app.patch('/api/resumes/:id/content', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      
      // Validate request body
      const { content } = resumeContentSchema.parse(req.body);
      
      // Verify resume ownership
      const ownershipResult = await verifyResumeOwnership(id, userId);
      if (ownershipResult.error) {
        return res.status(ownershipResult.error.status).json({ message: ownershipResult.error.message });
      }

      // Enhanced database operations with retry
      await withDbRetry(
        () => storage.updateResumeContent(id, content),
        {
          operation: 'update_resume_content',
          userId,
          resumeId: id
        }
      );
      await withDbRetry(
        () => storage.updateResumeStatus(id, "customized"),
        {
          operation: 'update_resume_status',
          userId,
          resumeId: id
        }
      );
      
      console.log(`✅ Updated content for resume: ${id}`);
      res.json({ message: "Resume content updated successfully" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      console.error("💥 Error updating resume content:", error);
      res.status(500).json({ message: "Failed to update resume content" });
    }
  });

  app.delete('/api/resumes/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const resume = await storage.getResumeById(id);
      
      if (!resume) {
        return res.status(404).json({ message: "Resume not found" });
      }
      
      // Check if user owns this resume
      if (!req.user?.id || resume.userId !== req.user.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      await storage.deleteResume(id);
      res.json({ message: "Resume deleted successfully" });
    } catch (error) {
      console.error("Error deleting resume:", error);
      res.status(500).json({ 
        message: "Failed to delete resume",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });


  // BULK OPERATIONS: Process multiple resumes with same tech stack input
  // NOTE: This route MUST come BEFORE the individual processing route to avoid route conflicts
  app.post('/api/resumes/bulk/process-tech-stack', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      logRequest('POST', '/api/resumes/bulk/process-tech-stack', userId);
      
      // Enforce per-user job submission quotas (bulk)
      if (!(await __canSubmitJobDetailed(userId))) {
        return res.status(429).json({ message: 'Too many processing requests. Please slow down and try again shortly.' });
      }

      // Validate request body
      const { resumeIds, input } = bulkProcessingSchema.parse(req.body);
      
      const startTime = Date.now();
      logSuccess(`Starting bulk processing for ${resumeIds.length} resumes`);
      
      // Verify user owns all resumes
      const ownershipResult = await verifyBulkResumeOwnership(resumeIds, userId);
      if (ownershipResult.error) {
        return res.status(ownershipResult.error.status).json(ownershipResult.error);
      }
      
      // Process all resumes in parallel
      const processingPromises = resumeIds.map(async (resumeId: string) => {
        try {
          // Parse tech stack input with optimized algorithm
          const techStacksData = parseTechStackInputOptimized(input);
          
          // Clear existing data
          await Promise.all([
            storage.deleteTechStacksByResumeId(resumeId),
            storage.deletePointGroupsByResumeId(resumeId)
          ]);
          
          // Prepare batch data for tech stacks
          const techStacksBatchData = techStacksData.map(techStackData => ({
            resumeId,
            name: techStackData.name,
            bulletPoints: techStackData.bulletPoints,
          }));
          
          // BATCH INSERT: Save all tech stacks
          await storage.createTechStacksBatch(techStacksBatchData);
          
          // Generate point groups using automatic distribution
          const pointGroups = generatePointGroupsAuto(techStacksData);
          
          // Prepare batch data for point groups
          const pointGroupsBatchData = pointGroups.map((group, i) => ({
            resumeId,
            name: `Group ${String.fromCharCode(65 + i)}`,
            points: group,
          }));
          
          // BATCH INSERT: Save all point groups
          await storage.createPointGroupsBatch(pointGroupsBatchData);
          
          // Update resume status
          await storage.updateResumeStatus(resumeId, "ready");
          
          return { resumeId, success: true, pointGroups: pointGroupsBatchData.length };
        } catch (error) {
          console.error(`Failed to process resume ${resumeId}:`, error);
          return { resumeId, success: false, error: error instanceof Error ? error.message : "Unknown error" };
        }
      });
      
      const results = await Promise.all(processingPromises);
      const totalTime = Date.now() - startTime;
      
      const successCount = results.filter(r => r.success).length;
      const failureCount = results.length - successCount;
      
      console.log(`🚀 BULK PROCESSING completed: ${successCount} successful, ${failureCount} failed in ${totalTime}ms`);
      
      // Save bulk processing history
      const bulkHistory = {
        userId,
        resumeIds,
        input,
        results,
        processingTime: totalTime,
        timestamp: new Date()
      };
      
      res.json({
        success: true,
        processed: results.length,
        successful: successCount,
        failed: failureCount,
        results,
        processingTime: totalTime,
        bulkHistory
      });
      
    } catch (error) {
      console.error("💥 Bulk processing failed:", error);
      res.status(500).json({ message: "Bulk processing failed" });
    }
  });

  // ULTRA-FAST Tech stack processing with batch operations (Individual Resume)
  app.post('/api/resumes/:id/process-tech-stack', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const startTime = Date.now();
      
      console.log(`⚡ ULTRA-FAST tech stack processing started for resume: ${id}`);
      
      const resume = await storage.getResumeById(id);
      if (!resume) {
        return res.status(404).json({ message: "Resume not found" });
      }

      // FIXED: Use consistent user ID checking
      const userId = req.user.id;
      if (resume.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { input } = techStackInputSchema.parse(req.body);

      // Parse tech stack input with optimized algorithm
      const parseStartTime = Date.now();
      const techStacksData = parseTechStackInputOptimized(input);
      const parseTime = Date.now() - parseStartTime;
      console.log(`⚡ Parsing completed in ${parseTime}ms`);
      
      // ULTRA-FAST: Clear existing data first
      const dbStartTime = Date.now();
      await Promise.all([
        storage.deleteTechStacksByResumeId(id),
        storage.deletePointGroupsByResumeId(id)
      ]);
      
      // Prepare batch data for tech stacks
      const techStacksBatchData = techStacksData.map(techStackData => ({
        resumeId: id,
        name: techStackData.name,
        bulletPoints: techStackData.bulletPoints,
      }));
      
      // BATCH INSERT: Save all tech stacks in one operation
      const savedTechStacks = await storage.createTechStacksBatch(techStacksBatchData);
      console.log(`⚡ Saved ${savedTechStacks.length} tech stacks in batch`);
      
      // Generate point groups using automatic distribution
      const pointGroups = generatePointGroupsAuto(techStacksData);
      
      // Prepare batch data for point groups
      const pointGroupsBatchData = pointGroups.map((group, i) => ({
        resumeId: id,
        name: `Group ${String.fromCharCode(65 + i)}`, // A, B, C, etc.
        points: group,
      }));
      
      // BATCH INSERT: Save all point groups in one operation
      await storage.createPointGroupsBatch(pointGroupsBatchData);
      console.log(`⚡ Saved ${pointGroupsBatchData.length} point groups in batch`);
      
      const dbTime = Date.now() - dbStartTime;
      console.log(`⚡ Database operations completed in ${dbTime}ms`);
      
      // Get the saved groups for response (cached from transaction)
      const savedGroups = await storage.getPointGroupsByResumeId(id);
      
      // Calculate average group size for response
      const avgGroupSize = savedGroups.length > 0 
        ? Math.round(savedGroups.reduce((sum, group) => sum + (group.points as Point[]).length, 0) / savedGroups.length)
        : 0;
      
      // Save processing history and update status in parallel
      const processingTime = Date.now() - startTime;
      await Promise.all([
        storage.createProcessingHistory({
          resumeId: id,
          input,
          output: savedGroups,
          settings: { autoDistribution: true, avgGroupSize },
          processingTime,
        }),
        storage.updateResumeStatus(id, "ready")
      ]);

      const totalTime = Date.now() - startTime;
      console.log(`🚀 ULTRA-FAST tech stack processing completed in ${totalTime}ms`);
      
      // Invalidate cache for this user
      (storage as any).invalidateUserCache?.(userId);

      res.json({
        groups: savedGroups,
        processingTime: totalTime,
        totalPoints: techStacksData.reduce((sum, ts) => sum + ts.bulletPoints.length, 0),
        avgGroupSize,
        distribution: 'auto',
        performance: {
          parseTime,
          dbTime,
          totalTime
        }
      });
    } catch (error) {
      console.error("💥 Tech stack processing failed:", error);
      res.status(500).json({ message: "Failed to process tech stack" });
    }
  });

  // Point groups routes
  app.get('/api/resumes/:id/point-groups', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const resume = await storage.getResumeById(id);
      
      if (!resume) {
        return res.status(404).json({ message: "Resume not found" });
      }
      
      // Check if user owns this resume (FIXED: Use consistent user ID)
      const userId = req.user.id;
      if (resume.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const pointGroups = await storage.getPointGroupsByResumeId(id);
      res.json(pointGroups);
    } catch (error) {
      console.error("Error fetching point groups:", error);
      res.status(500).json({ message: "Failed to fetch point groups" });
    }
  });

  // Tech stacks routes
  app.get('/api/resumes/:id/tech-stacks', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const resume = await storage.getResumeById(id);
      
      if (!resume) {
        return res.status(404).json({ message: "Resume not found" });
      }
      
      // Check if user owns this resume (FIXED: Use consistent user ID)
      const userId = req.user.id;
      if (resume.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const techStacks = await storage.getTechStacksByResumeId(id);
      res.json(techStacks);
    } catch (error) {
      console.error("Error fetching tech stacks:", error);
      res.status(500).json({ message: "Failed to fetch tech stacks" });
    }
  });

  // Processing history routes
  app.get('/api/resumes/:id/processing-history', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const resume = await storage.getResumeById(id);
      
      if (!resume) {
        return res.status(404).json({ message: "Resume not found" });
      }
      
      // Check if user owns this resume (FIXED: Use consistent user ID)
      const userId = req.user.id;
      if (resume.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const history = await storage.getProcessingHistoryByResumeId(id);
      res.json(history);
    } catch (error) {
      console.error("Error fetching processing history:", error);
      res.status(500).json({ message: "Failed to fetch processing history" });
    }
  });

  // Background job processing route
  app.post('/api/resumes/:id/process-async', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      
      // Enforce per-user job submission quotas
      if (!(await __canSubmitJobDetailed(userId))) {
        return res.status(429).json({ message: 'Too many background jobs submitted. Please try again later.' });
      }
      
      // Verify resume ownership
      const ownershipResult = await verifyResumeOwnership(id, userId);
      if (ownershipResult.error) {
        return res.status(ownershipResult.error.status).json({ message: ownershipResult.error.message });
      }

      const resume = ownershipResult.resume;
      const { input } = req.body;

      // Add job to background processor
      const jobId = await jobProcessor.addJob('process_docx', {
        resumeId: id,
        input,
        userId
      }, {
        priority: 1,
        maxAttempts: 3,
        userId
      });

      res.json({
        success: true,
        jobId,
        message: 'Resume processing started in background',
        statusUrl: `/api/jobs/${jobId}/status`
      });
    } catch (error) {
      console.error('Failed to start async processing:', error);
      res.status(500).json({ 
        error: 'Failed to start processing',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Job status endpoint
  app.get('/api/jobs/:jobId/status', isAuthenticated, async (req: any, res) => {
    try {
      const { jobId } = req.params;
      const status = await jobProcessor.getJobStatus(jobId);
      res.json(status);
    } catch (error) {
      console.error('Failed to get job status:', error);
      res.status(500).json({ 
        error: 'Failed to get job status',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Cancel job endpoint
  app.delete('/api/jobs/:jobId', isAuthenticated, async (req: any, res) => {
    try {
      const { jobId } = req.params;
      const cancelled = await jobProcessor.cancelJob(jobId);
      
      if (cancelled) {
        res.json({ success: true, message: 'Job cancelled' });
      } else {
        res.status(404).json({ error: 'Job not found or cannot be cancelled' });
      }
    } catch (error) {
      console.error('Failed to cancel job:', error);
      res.status(500).json({ 
        error: 'Failed to cancel job',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // DOCX Export route - Generate real DOCX from HTML content
  app.post('/api/resumes/:id/export-docx', isAuthenticated, exportRateLimiter, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { content, options = {} } = req.body;
      
      const resume = await storage.getResumeById(id);
      if (!resume) {
        return res.status(404).json({ message: "Resume not found" });
      }
      
      // Check if user owns this resume
      const userId = req.user.id;
      if (resume.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Use provided content or resume's customized content or original content
      const htmlContent = content || resume.customizedContent || resume.originalContent || '';
      
      if (!htmlContent) {
        return res.status(400).json({ message: "No content available to export" });
      }
      
      // Enhanced DOCX generation with error recovery
      const docxBuffer = await withRetry(
        () => DocxProcessor.generateDocx(htmlContent, {
          title: resume.fileName?.replace('.docx', '') || 'Resume',
          author: 'Resume Customizer Pro User',
          ...options
        }),
        {
          maxAttempts: 3,
          baseDelay: 500
        },
        {
          operation: 'docx_export',
          userId,
          resumeId: id
        }
      );
      
      // Set proper headers for DOCX download
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${resume.fileName || 'resume.docx'}"`);
      res.setHeader('Content-Length', docxBuffer.length.toString());
      
      // Send the DOCX file
      res.end(docxBuffer);
      
      console.log(`📤 DOCX exported successfully: ${resume.fileName || 'resume.docx'}`);
      
    } catch (error) {
      console.error("💥 DOCX export failed:", error);
      res.status(500).json({ 
        message: "Failed to export DOCX",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // BULK EXPORT: Export multiple resumes as ZIP
  app.post('/api/resumes/bulk/export', isAuthenticated, exportRateLimiter, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { resumeIds } = bulkExportSchema.parse(req.body);
      
      // Verify user owns all resumes
      const ownershipResult = await verifyBulkResumeOwnership(resumeIds, userId);
      if (ownershipResult.error) {
        return res.status(ownershipResult.error.status).json(ownershipResult.error);
      }
      
      const resumeData = ownershipResult.validResumes!;
      
      if (resumeData.length === 1) {
        // Single resume - direct DOCX download
        const resume = resumeData[0];
        if (!resume) {
          return res.status(400).json({ message: "Resume not found" });
        }
        
        const content = resume.customizedContent || resume.originalContent || '';
        
        if (!content) {
          return res.status(400).json({ message: "No content to export" });
        }
        
        const docxBuffer = await DocxProcessor.generateDocx(content, {
          title: resume.fileName?.replace('.docx', '') || 'Resume',
          author: 'Resume Customizer Pro User'
        });
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="${resume.fileName || 'resume.docx'}"`);
        res.end(docxBuffer);
      } else {
        // Multiple resumes - ZIP archive
        const JSZip = (await import('jszip')).default;
        const zip = new JSZip();
        const genLimiter = new Limiter(Number(process.env.DOC_PROCESS_CONCURRENCY || 2));
        
        // Add each resume to ZIP (concurrency-limited generation)
        await Promise.all(resumeData.map(async (resume) => {
          if (!resume) return; // Skip null/undefined resumes
          
          const content = resume.customizedContent || '';
          if (content) {
            const docxBuffer = await genLimiter.run(() => DocxProcessor.generateDocx(content, {
              title: resume.fileName?.replace('.docx', '') || 'Resume',
              author: 'Resume Customizer Pro User'
            }));
            
            zip.file(resume.fileName || 'resume.docx', docxBuffer);
          }
        }));
        
        const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
        
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="resumes-${new Date().toISOString().split('T')[0]}.zip"`);
        res.end(zipBuffer);
      }
      
      console.log(`📦 BULK EXPORT completed: ${resumeIds.length} resumes`);
      
    } catch (error) {
      console.error("💥 Bulk export failed:", error);
      res.status(500).json({ 
        message: "Bulk export failed",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  
  // BULK SAVE: Save multiple resume contents simultaneously
  app.patch('/api/resumes/bulk/content', isAuthenticated, async (req: any, res) => {
    try {
      const { updates } = req.body; // Array of {resumeId, content}
      const userId = req.user.id;
      
      if (!Array.isArray(updates) || updates.length === 0) {
        return res.status(400).json({ message: "Updates array is required" });
      }
      
      console.log(`💾 BULK SAVE: ${updates.length} resumes`);
      
      // Verify user owns all resumes
      const resumeChecks = await Promise.all(
        updates.map(async (update: any) => {
          const resume = await storage.getResumeById(update.resumeId);
          return resume && resume.userId === userId;
        })
      );
      
      if (resumeChecks.some(check => !check)) {
        return res.status(403).json({ message: "Access denied to some resumes" });
      }
      
      // Save all contents in parallel
      const savePromises = updates.map(async (update: any) => {
        try {
          await storage.updateResumeContent(update.resumeId, update.content);
          await storage.updateResumeStatus(update.resumeId, "customized");
          return { resumeId: update.resumeId, success: true };
        } catch (error) {
          console.error(`Failed to save resume ${update.resumeId}:`, error);
          return { resumeId: update.resumeId, success: false, error: error instanceof Error ? error.message : "Unknown error" };
        }
      });
      
      const results = await Promise.all(savePromises);
      const successCount = results.filter(r => r.success).length;
      
      console.log(`💾 BULK SAVE completed: ${successCount}/${updates.length} successful`);
      
      res.json({
        success: true,
        saved: successCount,
        total: updates.length,
        results
      });
      
    } catch (error) {
      console.error("💥 Bulk save failed:", error);
      res.status(500).json({ message: "Bulk save failed" });
    }
  });

  // Note: User stats route moved to avoid duplication (see line 181)

  const httpServer = createServer(app);
  return httpServer;
}

