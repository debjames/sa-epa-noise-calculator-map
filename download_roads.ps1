$ErrorActionPreference = "Stop"
$outDir = Split-Path -Parent $MyInvocation.MyCommand.Path

$baseUrl = "https://geohub.sa.gov.au/server/rest/services/SAPPA/PropertyPlanningAtlasV18/MapServer/210/query"

Write-Host "Downloading designated road polygons from SAPPA GeoHub layer 210..." -ForegroundColor Cyan

# Query all features with pagination
$allFeatures = @()
$offset = 0
$batchSize = 1000

while ($true) {
    Write-Host "  Querying offset $offset..."
    $url = "$baseUrl`?where=1%3D1&outFields=designatedroad&returnGeometry=true&outSR=4326&f=geojson&resultOffset=$offset&resultRecordCount=$batchSize"

    try {
        $response = Invoke-RestMethod -Uri $url -TimeoutSec 30
    } catch {
        Write-Host "ERROR: $_" -ForegroundColor Red
        Write-Host ""
        Write-Host "Cannot reach geohub.sa.gov.au. Trying alternative..." -ForegroundColor Yellow

        # Try alternative: use ogr2ogr if available
        $ogr = "C:\Program Files\QGIS 3.40.8\bin\ogr2ogr.exe"
        if (Test-Path $ogr) {
            Write-Host "Using ogr2ogr to download..." -ForegroundColor Cyan
            foreach ($type in @("Type A", "Type B", "Type R")) {
                $letter = $type.Split(" ")[1].ToLower()
                $outFile = Join-Path $outDir "road_type_$letter.geojson"
                $where = "designatedroad='$type'"
                Write-Host "  Downloading $type roads..."
                & $ogr -f GeoJSON $outFile `
                    "ESRIJSON:$baseUrl`?where=$([uri]::EscapeDataString($where))&outFields=designatedroad&returnGeometry=true&outSR=4326&f=json" `
                    -t_srs EPSG:4326 -lco COORDINATE_PRECISION=5 2>&1
                if (Test-Path $outFile) {
                    $size = (Get-Item $outFile).Length / 1KB
                    Write-Host "    Saved: $outFile ($([math]::Round($size))KB)" -ForegroundColor Green
                }
            }
        } else {
            Write-Host "QGIS/ogr2ogr not found. Please download manually from SAPPA." -ForegroundColor Red
        }
        return
    }

    if (-not $response.features -or $response.features.Count -eq 0) { break }
    $allFeatures += $response.features
    Write-Host "    Got $($response.features.Count) features (total: $($allFeatures.Count))"

    if ($response.features.Count -lt $batchSize) { break }
    $offset += $batchSize
}

Write-Host "Total features: $($allFeatures.Count)" -ForegroundColor Green

# Split by road type and save
foreach ($type in @("Type A", "Type B", "Type R")) {
    $features = $allFeatures | Where-Object { $_.properties.designatedroad -eq $type }
    $letter = $type.Split(" ")[1].ToLower()
    $outFile = Join-Path $outDir "road_type_$letter.geojson"

    $fc = @{
        type = "FeatureCollection"
        features = @($features)
    }

    $fc | ConvertTo-Json -Depth 20 -Compress | Set-Content -Path $outFile -Encoding UTF8
    $size = (Get-Item $outFile).Length / 1KB
    Write-Host "$type`: $($features.Count) features -> $outFile ($([math]::Round($size))KB)" -ForegroundColor Green
}

Write-Host ""
Write-Host "Done! Road polygon files saved to: $outDir" -ForegroundColor Cyan
