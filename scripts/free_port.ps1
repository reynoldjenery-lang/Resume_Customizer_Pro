param([int]$Port = 5000)
$matches = netstat -ano | Select-String ":$Port "
if ($matches) {
  $pids = @()
  foreach ($m in $matches) {
    $line = $m.Line
    if (-not $line) { $line = [string]$m }
    $parts = ($line -split "\s+") | Where-Object { $_ -ne "" }
    if ($parts.Count -ge 5) {
      $procId = $parts[-1].Trim()
      if ($procId -match '^[0-9]+$') { $pids += [int]$procId }
    }
  }
  $pids = $pids | Sort-Object -Unique
  foreach ($proc in $pids) {
    try { Stop-Process -Id $proc -Force -ErrorAction SilentlyContinue } catch {}
  }
}
