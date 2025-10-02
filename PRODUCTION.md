# Production Deployment Guide

## 🚀 Quick Start

### Build for Production
```bash
npm run build
```

### Start Production Server
```bash
npm start
```

### Full Production Build & Start
```bash
npm run start:prod
```

## 📦 Optimizations Applied

### Dependencies Cleaned Up
- ✅ Removed unused Radix UI components (saved ~2MB)
- ✅ Removed unused development dependencies
- ✅ Moved type definitions to devDependencies
- ✅ Kept only essential production packages

### Bundle Optimizations
- ✅ Advanced code splitting by vendor chunks
- ✅ Terser minification with aggressive settings
- ✅ Tree shaking enabled
- ✅ Asset inlining for files < 8KB
- ✅ Organized output structure (js/, css/, img/, assets/)

### Compression
- ✅ Gzip compression (level 9)
- ✅ Brotli compression (quality 11)
- ✅ Smart compression (skips files < 1KB)
- ✅ Compression statistics logging

### Performance Features
- ✅ ES2020 target for modern browsers
- ✅ CSS code splitting
- ✅ Image optimization with imagemin
- ✅ Console removal in production
- ✅ Source maps disabled for production

## 🐳 Docker Deployment

### Build Docker Image
```bash
docker build -t resume-customizer-pro .
```

### Run Container
```bash
docker run -p 3000:3000 -e NODE_ENV=production resume-customizer-pro
```

## 📊 Bundle Analysis

Run bundle analysis:
```bash
npm run optimize
```

This will show:
- Individual chunk sizes
- Total bundle size
- Asset breakdown
- Performance recommendations

## 🔧 Environment Configuration

1. Copy environment template:
```bash
cp .env.production.example .env.production
```

2. Configure your production variables:
- `DATABASE_URL`: Your production database
- `SESSION_SECRET`: Secure session secret
- `CORS_ORIGIN`: Your domain
- And other environment-specific settings

## 📈 Performance Monitoring

### Recommended Tools
- **Lighthouse**: Core Web Vitals monitoring
- **WebPageTest**: Performance testing
- **Bundle Analyzer**: Webpack bundle analysis
- **PM2**: Process monitoring

### Key Metrics to Monitor
- First Contentful Paint (FCP) < 1.8s
- Largest Contentful Paint (LCP) < 2.5s
- Cumulative Layout Shift (CLS) < 0.1
- First Input Delay (FID) < 100ms

## 🚦 Production Checklist

### Before Deployment
- [ ] Run `npm run build` successfully
- [ ] Test with `npm run start:prod`
- [ ] Check bundle sizes with `npm run optimize`
- [ ] Verify environment variables
- [ ] Test database connections
- [ ] Validate file upload functionality

### Server Configuration
- [ ] Enable gzip/brotli compression
- [ ] Set cache headers (max-age=31536000 for assets)
- [ ] Configure HTTPS
- [ ] Set up CDN for static assets
- [ ] Enable HTTP/2
- [ ] Configure security headers

### Monitoring Setup
- [ ] Set up error tracking (Sentry, etc.)
- [ ] Configure performance monitoring
- [ ] Set up uptime monitoring
- [ ] Configure log aggregation
- [ ] Set up alerts for critical metrics

## 🔄 PM2 Process Management

### Start with PM2
```bash
npm run pm2:start
```

### Reload (Zero Downtime)
```bash
npm run pm2:reload
```

### Stop
```bash
npm run pm2:stop
```

### Monitor
```bash
pm2 monit
```

## 📁 File Structure (Production)

```
dist/
├── public/           # Client build output
│   ├── js/          # JavaScript chunks
│   ├── css/         # Stylesheets
│   ├── img/         # Optimized images
│   └── assets/      # Other assets
└── index.js         # Server bundle
```

## 🔍 Troubleshooting

### Large Bundle Size
- Check `npm run optimize` output
- Consider lazy loading for large components
- Review vendor chunk splitting

### Slow Build Times
- Clear node_modules and reinstall
- Check for circular dependencies
- Consider upgrading Node.js version

### Runtime Errors
- Check server logs in `logs/` directory
- Verify environment variables
- Test database connectivity

## 📞 Support

For production issues:
1. Check the logs in `logs/` directory
2. Run `npm run optimize` for bundle analysis
3. Verify environment configuration
4. Check server resource usage
