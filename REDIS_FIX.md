# Redis Exit Code 1 Fix

## Problem
Your application is terminating with exit code 1 due to Redis health monitoring detecting high latency (8444ms) from the in-memory Redis fallback.

## Quick Fix
Add this environment variable to your .env file to disable Redis monitoring:

```bash
REDIS_MONITORING_ENABLED=false
```

## Alternative Fix
If you want to keep monitoring but reduce false alerts, adjust the thresholds:

```bash
REDIS_LATENCY_CRITICAL=10000
REDIS_LATENCY_WARNING=5000
```

## Root Cause
- App uses in-memory Redis fallback when no real Redis server is available
- Health monitoring system still runs and detects "critical" latency
- This triggers error conditions that can cause app termination

## Long-term Solution
1. Install and run a real Redis server locally
2. Or use a cloud Redis service (Redis Cloud, AWS ElastiCache, etc.)
3. Update REDIS_HOST in .env to point to real Redis instance
