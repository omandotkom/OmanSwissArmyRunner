param (
    [string]$Url,
    [string]$Dest
)

try {
    # Force TLS 1.2+
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12 -bor [System.Net.SecurityProtocolType]::Tls13

    # Create Request
    $request = [System.Net.WebRequest]::Create($Url)
    $request.Method = "GET"
    $request.UserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
    $response = $request.GetResponse()
    
    $totalBytes = $response.ContentLength
    $responseStream = $response.GetResponseStream()
    
    # Create File Stream
    $fileStream = [System.IO.File]::Create($Dest)
    
    $bufferSize = 8192 # 8KB
    $buffer = New-Object byte[] $bufferSize
    $totalRead = 0
    $lastPercent = -1
    
    # Speed Calculation Vars
    $startTime = Get-Date
    $lastTime = Get-Date
    $bytesLastCheck = 0

    while ($true) {
        $readCount = $responseStream.Read($buffer, 0, $bufferSize)
        if ($readCount -eq 0) { break }
        
        $fileStream.Write($buffer, 0, $readCount)
        $totalRead += $readCount
        
        # Calculate Progress & Speed roughly every 100ms or on percent change
        $now = Get-Date
        $timeDiff = ($now - $lastTime).TotalSeconds

        if ($totalBytes -gt 0) {
            $percent = [Math]::Floor(($totalRead / $totalBytes) * 100)
            
            # Update every 1% OR if 1 second passed (to keep speed alive)
            if (($percent -gt $lastPercent) -or ($timeDiff -ge 1.0)) {
                
                # Speed Calculation
                $speedStr = "0 KB/s"
                if ($timeDiff -gt 0) {
                    $bytesDiff = $totalRead - $bytesLastCheck
                    $bytesPerSec = $bytesDiff / $timeDiff
                    
                    if ($bytesPerSec -gt 1048576) {
                        $speedStr = "{0:N1} MB/s" -f ($bytesPerSec / 1048576)
                    } else {
                        $speedStr = "{0:N0} KB/s" -f ($bytesPerSec / 1024)
                    }
                }

                # Output Format: PROGRESS:50|SPEED:1.5 MB/s
                Write-Host "PROGRESS:$percent|SPEED:$speedStr"
                
                $lastPercent = $percent
                $lastTime = $now
                $bytesLastCheck = $totalRead
            }
        }
    }
    
    # Clean up
    $fileStream.Close()
    $responseStream.Close()
    $response.Close()
    
    Write-Host "DONE"
    
} catch {
    if ($fileStream) { $fileStream.Close() }
    if ($responseStream) { $responseStream.Close() }
    Write-Host "ERROR:$($_.Exception.Message)"
    exit 1
}