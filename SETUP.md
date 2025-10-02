# 🚀 Resume Customizer Pro - Setup Guide

## 📋 Prerequisites

Before running the application, ensure you have:

- **Node.js** (v18 or later) - [Download here](https://nodejs.org)
- **npm** (comes with Node.js)
- **PowerShell** (Windows) or **Bash** (Linux/Mac)

## 📧 Email Configuration Required

**⚠️ IMPORTANT**: You must configure email settings in your `.env` file for the application to send verification and password-reset emails. The server (not individual users) needs the credentials.

### Email provider (SMTP)

The app supports any SMTP-style transactional provider (SendGrid, Mailgun, Elastic Email, Gmail SMTP, etc.). Configure SMTP settings in `.env`:

```bash
EMAIL_PROVIDER=smtp
EMAIL_HOST=smtp.example.com
EMAIL_PORT=587
EMAIL_SECURE=false # true for port 465
EMAIL_USER=your-smtp-username
EMAIL_PASSWORD=your-smtp-password
EMAIL_FROM="Resume Customizer Pro" <no-reply@yourdomain.com>
APP_URL=https://your-production-site.com
```

Notes:

- Use a verified sending domain with your provider to improve deliverability (set SPF/DKIM records as your provider instructs).
- For staging and development, consider using Mailtrap or Ethereal to avoid sending real emails during tests.

#### Verifying a Sending Domain (recommended)

To avoid DMARC/SPF/DKIM rejections and improve deliverability, verify a sending domain with your chosen email provider and add the DNS records they provide.

General steps:

1. In your provider's dashboard add your sending domain (e.g. yourdomain.com).
2. The provider will give you SPF and DKIM DNS records — add these to your DNS provider.
3. Wait for DNS propagation and confirm the domain is verified in the provider dashboard.
4. Use a verified sending address in `EMAIL_FROM` (for example: `no-reply@yourdomain.com`).

This ensures the provider can authenticate on behalf of your domain and prevents recipient MTAs from rejecting messages due to DMARC.

### Option: Gmail (alternative)

If you prefer Gmail for sending, follow these steps:

1. Create a Gmail account or use an existing one.
2. Enable 2-Factor Authentication and create an App Password (recommended if using SMTP).
3. Set the following in `.env`:

```bash
EMAIL_PROVIDER=smtp
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
EMAIL_FROM="Resume Customizer Pro" <your-email@gmail.com>
```

### Development / Testing

- Use Mailtrap or Ethereal for dev so you don't deliver emails to real users accidentally.
- Add a `.env.example` to your repo (already provided) and never commit the real `.env`.

## ⚙️ Environment Setup

### 1. Update .env file

Open `.env` and update these lines with your email settings:

```bash
# Replace these with your actual email settings:
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-specific-password
EMAIL_FROM="Resume Customizer Pro" <your-email@gmail.com>
```

### 2. Optional: Update other settings

```bash
# Change port if needed (default: 5000)
PORT=5000

# Change app URL if different
APP_URL=http://localhost:5000
```

## 🏃‍♂️ Running the Application

### Quick email test setup

1) Copy the example env if you haven’t already

```powershell
Copy-Item -Path .env.example -Destination .env -ErrorAction SilentlyContinue
```

2) Edit .env and set these values (SMTP or Gmail app password)

```bash
EMAIL_PROVIDER=smtp
EMAIL_HOST=smtp.example.com
EMAIL_PORT=587
EMAIL_USER=your-user
EMAIL_PASSWORD=your-password
EMAIL_FROM="Resume Customizer Pro" <no-reply@yourdomain.com>

# Who should receive the test message
TEST_EMAIL_TO=you@example.com
# Optional
TEST_EMAIL_SUBJECT=Test email from Resume Customizer Pro
```

3) Run the test email sender

```powershell
npm run test:email
```

If it says “No recipient specified…”, make sure TEST_EMAIL_TO (or EMAIL_TO) is set in .env.

### Method 1: PowerShell Script (Recommended)

```powershell
# Development mode (default)
./dev.ps1

# With custom port
./dev.ps1 -Port 3000

# Production mode
./dev.ps1 -Environment production

# Skip database migrations
./dev.ps1 -SkipMigrations
```

### Method 2: Batch File (If PowerShell issues)

```cmd
# Development mode
dev.bat

# Production mode
dev.bat production

# Custom port
dev.bat development 3000
```

### Method 3: Manual npm commands

```bash
# Install dependencies
npm install

# Run database migrations
npm run db:push

# Start development server
npm run dev

# Or start production
npm run build && npm start
```

## 🔧 Troubleshooting

### PowerShell Execution Policy Issues

If you get execution policy errors:

```powershell
# Option 1: Change policy (as Administrator)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Option 2: Bypass for single execution
PowerShell -ExecutionPolicy Bypass -File dev.ps1
```

### Port Already in Use

The scripts automatically kill processes on the specified port, but you can manually check:

```cmd
# Find process using port 5000
netstat -ano | findstr :5000

# Kill process by PID
taskkill /PID <process_id> /F
```

### Database Connection Issues

1. Verify `DATABASE_URL` in `.env`
2. Check internet connection
3. Ensure Neon database is accessible

### Email Issues

1. Verify email credentials in `.env`
2. For Gmail, ensure App Password is used (not regular password)
3. Check if 2FA is enabled on Gmail account

## 📁 Project Structure

```
Resume_Customizer_Pro/
├── .env                 # Environment variables (UPDATE THIS!)
├── dev.ps1             # PowerShell development script
├── dev.bat             # Batch file alternative
├── package.json        # Dependencies and scripts
├── client/             # Frontend React application
├── server/             # Backend Express application
├── shared/             # Shared types and schemas
└── logs/               # Application logs
```

## 🌐 Accessing the Application

Once started successfully:

- **Frontend**: http://localhost:5000
- **Backend API**: http://localhost:5000/api
- **Database Studio**: `npm run db:studio`

## 📞 Support

If you encounter issues:

1. Check the logs in `logs/` directory
2. Verify all environment variables are set
3. Ensure email configuration is correct
4. Visit: [GitHub Issues](https://github.com/12shivam219/Resume_Customizer_Pro/issues)

---

## 🎯 Quick Start Checklist

- [ ] Node.js installed
- [ ] `.env` file updated with email settings
- [ ] Run `./dev.ps1` or `dev.bat`
- [ ] Access http://localhost:5000
- [ ] Test user registration/email verification

**Happy coding! 🚀**
