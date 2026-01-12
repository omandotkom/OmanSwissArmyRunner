# Health Check Script
# Returns system metrics in JSON format

$result = @{
    ramTotal = 0
    ramFree = 0
    diskFree = 0
    nodeVersion = "Not Found"
    portStatus = "Free"
    os = (Get-CimInstance Win32_OperatingSystem).Caption
}

try {
    # 1. RAM Info
    $osInfo = Get-CimInstance Win32_OperatingSystem
    $result.ramTotal = [Math]::Round($osInfo.TotalVisibleMemorySize / 1024, 2) # MB
    $result.ramFree = [Math]::Round($osInfo.FreePhysicalMemory / 1024, 2) # MB

    # 2. Disk Info (Current Drive)
    $currentDrive = (Get-Location).Drive.Name
    $disk = Get-PSDrive $currentDrive
    $result.diskFree = [Math]::Round($disk.Free / 1GB, 2) # GB

    # 3. Node Version (Specific Custom Binary)
    try {
        # Check for oman_node.exe in bin folder relative to current execution context
        # The script is usually run from the project root (where bin/ is located)
        $customNode = ".\bin\oman_node.exe"
        
        if (Test-Path $customNode) {
             # Use & operator to run the command path
             $nodeV = & $customNode -v 2>$null
             if ($nodeV) {
                $result.nodeVersion = "$($nodeV.Trim()) (Local)"
             }
        } else {
             $result.nodeVersion = "Missing (oman_node.exe)"
        }
    } catch {
        $result.nodeVersion = "Error Checking"
    }

    # 4. Port Check (1998)
    $port = 1998
    $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($conn) {
        $result.portStatus = "Occupied (PID $($conn.OwningProcess))"
    }

} catch {
    $result.error = $_.Exception.Message
}

# Output JSON
$result | ConvertTo-Json -Compress