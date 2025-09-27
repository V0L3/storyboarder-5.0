Write-Host "Setting up Storyboarder build icons..." -ForegroundColor Green
Write-Host ""

# Create build directory structure
if (!(Test-Path "build")) { New-Item -ItemType Directory -Name "build" }
if (!(Test-Path "build\fileassociation")) { New-Item -ItemType Directory -Path "build\fileassociation" }

Write-Host "Copying source icon files..." -ForegroundColor Yellow
Copy-Item "src\img\logoicon.png" "build\logoicon.png" -Force
Copy-Item "src\img\fileicon.png" "build\fileassociation\file.png" -Force  
Copy-Item "src\img\logoicon.png" "build\background.png" -Force

Write-Host ""
Write-Host "✅ Build directory structure created!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Next steps to complete icon setup:" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Convert logoicon.png to ICO format:" -ForegroundColor White
Write-Host "   - Go to https://convertio.co/png-ico/" -ForegroundColor Gray
Write-Host "   - Upload build\logoicon.png" -ForegroundColor Gray
Write-Host "   - Download and save as build\icon.ico" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Convert logoicon.png to ICNS format:" -ForegroundColor White
Write-Host "   - Go to https://convertio.co/png-icns/" -ForegroundColor Gray
Write-Host "   - Upload build\logoicon.png" -ForegroundColor Gray
Write-Host "   - Download and save as build\icon.icns" -ForegroundColor Gray
Write-Host ""
Write-Host "3. Build the application:" -ForegroundColor White
Write-Host "   - Run: npm run dist:win" -ForegroundColor Gray
Write-Host ""
Write-Host "📁 Current build directory:" -ForegroundColor Cyan
Get-ChildItem build | Format-Table Name, Length -AutoSize
Write-Host ""
Write-Host "Press any key to continue..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
