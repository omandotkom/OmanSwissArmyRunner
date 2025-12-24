param (
    [string]$Url,
    [string]$Dest
)

try {
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

    while ($true) {
        $readCount = $responseStream.Read($buffer, 0, $bufferSize)
        if ($readCount -eq 0) { break }
        
        $fileStream.Write($buffer, 0, $readCount)
        $totalRead += $readCount
        
        if ($totalBytes -gt 0) {
            $percent = [Math]::Floor(($totalRead / $totalBytes) * 100)
            # Only output if percent changed to reduce spam
            if ($percent -gt $lastPercent) {
                Write-Host "PROGRESS:$percent"
                $lastPercent = $percent
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