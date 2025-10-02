# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

Resume Customizer Pro is a full-stack TypeScript application for creating, editing, and managing professional resumes with DOCX compatibility and AI-powered tech stack analysis. The application features a React frontend with Express backend, PostgreSQL database, and sophisticated document processing capabilities.

## Development Commands

### Starting Development
```bash
# Full development setup (recommended)
./dev.ps1

# Alternative: Manual npm commands
npm install
npm run db:push
npm run dev

# Start client only (if server is running separately)
npm run dev:client
```

### Database Operations
```bash
# Generate migrations after schema changes
npm run db:generate

# Apply database migrations
npm run db:push

# Open Drizzle Studio (database GUI)
npm run db:studio
```

### Build and Production
```bash
# Full production build
npm run build

# Start production server
npm start

# Build and start (combined)
npm run start:prod

# PM2 process management
npm run pm2:start
npm run pm2:reload
npm run pm2:stop
```

### Testing and Quality
```bash
# Type checking
npm run check

# Linting and formatting
npm run lint

# Environment variable validation
npm run check:env

# Bundle analysis
npm run analyze
npm run optimize
```

### Single Test Running
Currently, no test framework is configured. To run individual tests in the future:
```bash
# Example commands (when tests are added)
# npm run test -- --testNamePattern="specific test"
# npm run test:watch -- --testPathPattern="path/to/test"
```

## Architecture Overview

### Core Structure
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS + Radix UI
- **Backend**: Express.js + TypeScript + Drizzle ORM + PostgreSQL
- **Shared**: Common types and database schema in `/shared` directory
- **Database**: PostgreSQL with Drizzle ORM for type-safe operations

### Directory Structure
```
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # React components
│   │   │   ├── ui/         # Shadcn/ui components
│   │   │   ├── auth/       # Authentication components
│   │   │   └── marketing/  # CRM/marketing module
│   │   ├── pages/          # Route components
│   │   ├── hooks/          # Custom React hooks
│   │   └── lib/            # Client utilities
├── server/                 # Express backend
│   ├── routes/             # API route handlers
│   ├── controllers/        # Business logic controllers
│   ├── services/           # External service integrations
│   ├── middleware/         # Custom middleware
│   ├── utils/              # Server utilities
│   └── config/             # Server configuration
├── shared/                 # Shared types and schemas
│   ├── schema.ts           # Database schema (Drizzle)
│   └── activity.ts         # Activity tracking schema
├── migrations/             # Database migration files
└── scripts/                # Build and utility scripts
```

### Key Architectural Patterns

#### Database Layer
- **Drizzle ORM** with PostgreSQL for type-safe database operations
- **Schema-first approach** with shared types between frontend and backend
- **Comprehensive indexing** for performance optimization
- **Activity tracking** and audit logging built-in
- **Session management** via database-backed sessions

#### Authentication System
- **JWT + Refresh Token** architecture for secure authentication
- **Passport.js** integration for multiple auth strategies
- **Two-factor authentication** support with TOTP
- **Account security** with failed login tracking and account lockout
- **Device tracking** for security monitoring

#### Document Processing Pipeline
- **DOCX Parser**: Mammoth.js for DOCX to HTML conversion with style preservation
- **DOCX Generator**: docx library for high-fidelity DOCX export
- **Streaming Support**: Memory-efficient processing for large files
- **Tech Stack Analysis**: AI-powered categorization of resume content
- **Template System**: Professional resume templates with customization

#### File Upload & Storage
- **Multer** for multipart file uploads with validation
- **Google Drive Integration** via OAuth 2.0 for cloud file access
- **Ephemeral Resumes** with session-based temporary storage
- **File Type Validation** and size limits for security

#### API Architecture
- **RESTful Design** with consistent error handling
- **Rate Limiting** per user/IP with database backing
- **Request Logging** with performance metrics
- **Bulk Operations** for processing multiple resumes
- **WebSocket Support** for real-time updates

## Development Workflow

### Making Database Changes
1. Modify schema in `shared/schema.ts` or `shared/activity.ts`
2. Generate migration: `npm run db:generate`
3. Review generated migration in `migrations/`
4. Apply changes: `npm run db:push`
5. Update related API endpoints and frontend components

### Adding New Features
1. **Backend**: Create route in `server/routes/`, add controller logic
2. **Frontend**: Add components in `client/src/components/`
3. **Shared**: Update types in `shared/` if needed
4. **Database**: Update schema if data persistence is required

### Component Development
- Use **Radix UI** primitives for accessible components
- Follow **shadcn/ui** patterns for consistent styling
- Implement **responsive design** with Tailwind CSS
- Add **loading states** and **error boundaries**

### API Development
- Implement **proper error handling** with consistent JSON responses
- Add **input validation** using Zod schemas
- Include **rate limiting** for sensitive endpoints
- Add **activity logging** for audit trails

## Important Technical Details

### Environment Configuration
- Copy `.env.example` to `.env` and configure required variables
- **DATABASE_URL** is required for Drizzle ORM connection
- **Email settings** required for user verification and notifications
- **Google OAuth** credentials needed for Drive integration

### DOCX Processing
- **Memory limits**: Large files (>5MB) use streaming processing
- **Style preservation**: Mammoth.js maintains formatting during conversion
- **Export optimization**: Advanced chunking for better performance
- **Error handling**: Graceful fallbacks for unsupported document features

### Security Features
- **Helmet.js** for security headers with development-friendly CSP
- **Rate limiting** on authentication endpoints
- **Input sanitization** and validation on all endpoints
- **CORS configuration** for production deployment
- **Session security** with secure cookie settings

### Performance Optimizations
- **Bundle splitting** by vendor, UI components, and functionality
- **Code splitting** with lazy-loaded route components
- **Image optimization** with imagemin for production builds
- **Compression** with gzip and brotli for static assets
- **Database indexing** on frequently queried columns

### Marketing/CRM Module
- **Requirements tracking** for job applications
- **Interview scheduling** and management
- **Email threading** for organized communication
- **Attachment management** with file versioning
- **Export functionality** for reports and analytics

## Common Pitfalls to Avoid

1. **Database migrations**: Always generate and review migrations before applying
2. **File uploads**: Respect size limits and validate file types strictly
3. **Authentication**: Don't bypass middleware on protected routes
4. **DOCX processing**: Handle memory constraints for large files
5. **Environment variables**: Ensure all required vars are set before deployment
6. **Rate limiting**: Consider impact on legitimate users when setting limits

## Development Tools Integration

### IDE Configuration
- **TypeScript**: Full type checking enabled with strict mode
- **ESLint**: Configured with React and TypeScript rules
- **Prettier**: Code formatting with consistent style
- **Path aliases**: `@/` for client src, `@shared/` for shared code

### Browser Development
- **React DevTools**: Component debugging and state inspection
- **Vite HMR**: Fast hot module replacement in development
- **Source maps**: Enabled for development debugging
- **Console warnings**: ESLint warns for production console usage

## Deployment Considerations

- **Build optimization**: Advanced tree shaking and minification
- **Static assets**: Proper caching headers and CDN integration
- **Database connections**: Connection pooling for production load
- **Error monitoring**: Integration points for Sentry or similar tools
- **Health checks**: `/health` endpoint for load balancer monitoring
- **Process management**: PM2 configuration for production deployment