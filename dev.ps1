# Unified runner for development and production (ASCII only)
param(
  [ValidateSet("development","production")]
  [string]$Environment = "development",
  [int]$Port = 5000,
  [switch]$UsePm2,
  [switch]$SkipMigrations
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Logging setup
$LogDir = Join-Path $PSScriptRoot "logs"
if (-not (Test-Path -LiteralPath $LogDir)) { New-Item -ItemType Directory -Path $LogDir | Out-Null }
$LogFile = Join-Path $LogDir ("app-{0}.log" -f (Get-Date -Format "yyyy-MM-dd"))

function Write-Log {
  param(
    [Parameter(Mandatory=$true)][string]$Message,
    [ValidateSet("INFO","WARNING","ERROR")][string]$Level = "INFO"
  )
  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  $line = "[{0}] [{1}] {2}" -f $timestamp, $Level, $Message
  Add-Content -LiteralPath $LogFile -Value $line
  Write-Host $line
}

function Require-Command {
  param([Parameter(Mandatory=$true)][string]$Name,[Parameter(Mandatory=$true)][string]$Hint)
  try {
    Get-Command $Name -ErrorAction Stop | Out-Null
  } catch {
    throw "$Name is required. $Hint"
  }
}

function Free-Port { 
  param([int]$Port)
  try {
    $matches = netstat -ano | Select-String (":" + $Port + " ")
    if ($matches) {
      $pids = @()
      foreach ($m in $matches) {
        $lineText = if ($m.Line) { $m.Line } else { $m.ToString() }
        $parts = ($lineText -split "\s+") | Where-Object { $_ -ne "" }
        if ($parts.Count -ge 5) {
          $procId = $parts[-1].Trim()
          if ($procId -match '^[0-9]+$' -and [int]$procId -gt 0) { $pids += [int]$procId }
        }
      }
      $pids = $pids | Sort-Object -Unique
      foreach ($pidToKill in $pids) {
        try { Stop-Process -Id $pidToKill -Force -ErrorAction Stop; Write-Log -Message ("Freed port {0} by killing PID {1}" -f $Port,$pidToKill) -Level "INFO" }
        catch { Write-Log -Message ("Could not kill PID {0} on port {1}" -f $pidToKill,$Port) -Level "WARNING" }
      }
    }
  } catch {
    Write-Log -Message ("Error freeing port {0}: {1}" -f $Port, $_.Exception.Message) -Level "WARNING"
  }
}

# Load environment variables from .env
$envFile = Join-Path $PSScriptRoot ".env"
if (Test-Path -LiteralPath $envFile) {
  Write-Log -Message "Loading environment variables from .env" -Level "INFO"
  Get-Content -LiteralPath $envFile | ForEach-Object {
    if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
      $name = $Matches[1].Trim()
      $value = $Matches[2].Trim().Trim('"').Trim("'")
      [System.Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
  }
} else {
  Write-Log -Message ".env file not found. Some features may not work." -Level "WARNING"
}

try {
  # Prerequisites
  Require-Command -Name "node" -Hint "Install Node.js from https://nodejs.org"
  Require-Command -Name "npm" -Hint "Install Node.js which includes npm"

  # Port check (development)
  if ($Environment -eq "development" -and $Port -gt 0) { Free-Port -Port $Port }

  # Environment setup
  $env:NODE_ENV = $Environment
  if ($Port -gt 0) { $env:PORT = "$Port" }

  # Dependencies
  if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot "node_modules"))) {
    Write-Log -Message "Installing dependencies..." -Level "INFO"
    if (Test-Path -LiteralPath (Join-Path $PSScriptRoot "package-lock.json")) { npm ci } else { npm install }
    if ($LASTEXITCODE -ne 0) { throw "Dependency installation failed" }
  }

  # Database migrations
  if (-not $SkipMigrations) {
    Write-Log -Message "Running database migrations..." -Level "INFO"
    npm run db:push
    if ($LASTEXITCODE -ne 0) { throw "Database migration failed" }
  }

  # Start application
  if ($Environment -eq "development") {
    Write-Log -Message "Starting development server..." -Level "INFO"
    # Run the development server
    npm run dev
    exit $LASTEXITCODE
  } else {
    Write-Log -Message "Building for production..." -Level "INFO"
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Build failed" }

    if ($UsePm2) {
      Require-Command -Name "pm2" -Hint "Install with: npm i -g pm2"
      Write-Log -Message "Starting with PM2..." -Level "INFO"
      npm run pm2:start
      exit $LASTEXITCODE
    } else {
      Write-Log -Message "Starting production server..." -Level "INFO"
      node dist/index.js
      exit $LASTEXITCODE
    }
  }
} catch {
  Write-Log -Message $_.Exception.Message -Level "ERROR"
  Write-Log -Message "For support, visit: https://github.com/12shivam219/Resume_Customizer_Pro/issues" -Level "WARNING"
  exit 1
}
