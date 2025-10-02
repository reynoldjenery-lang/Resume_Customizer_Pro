@echo off
setlocal enabledelayedexpansion

:: Unified runner for development and production (Batch alternative)
:: Usage: dev.bat [development|production] [port]

set "ENVIRONMENT=%~1"
set "PORT=%~2"

if "%ENVIRONMENT%"=="" set "ENVIRONMENT=development"
if "%PORT%"=="" set "PORT=5000"

echo.
echo ==========================================
echo    Resume Customizer Pro - %ENVIRONMENT%
echo ==========================================
echo.

:: Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js is not installed or not in PATH
    echo 💡 Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

:: Check if npm is available  
npm --version >nul 2>&1
if errorlevel 1 (
    echo ❌ npm is not available
    echo 💡 Please install Node.js which includes npm
    pause
    exit /b 1
)

:: Load environment variables from .env file
if exist ".env" (
    echo 📋 Loading environment variables from .env
    for /f "usebackq tokens=1,2 delims==" %%a in (".env") do (
        if not "%%a"=="" if not "%%a:~0,1%%"=="#" (
            set "%%a=%%b"
        )
    )
) else (
    echo ⚠️  .env file not found. Some features may not work.
)

:: Set NODE_ENV
set "NODE_ENV=%ENVIRONMENT%"

:: Kill any process using the port (Windows only)
echo 🔍 Checking if port %PORT% is in use...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT% "') do (
    echo 🛑 Killing process %%a on port %PORT%
    taskkill /PID %%a /F >nul 2>&1
)

:: Install dependencies if needed
if not exist "node_modules" (
    echo 📦 Installing dependencies...
    if exist "package-lock.json" (
        npm ci
    ) else (
        npm install
    )
    if errorlevel 1 (
        echo ❌ Dependency installation failed
        pause
        exit /b 1
    )
)

:: Run database migrations
echo 🗄️  Running database migrations...
npm run db:push
if errorlevel 1 (
    echo ❌ Database migration failed
    pause
    exit /b 1
)

:: Start the application
if "%ENVIRONMENT%"=="development" (
    echo 🚀 Starting development server on port %PORT%...
    npm run dev
) else (
    echo 🏗️  Building for production...
    npm run build
    if errorlevel 1 (
        echo ❌ Build failed
        pause
        exit /b 1
    )
    
    echo 🚀 Starting production server...
    npm run start
)

if errorlevel 1 (
    echo ❌ Application failed to start
    echo 📞 For support, visit: https://github.com/12shivam219/Resume_Customizer_Pro/issues
    pause
    exit /b 1
)