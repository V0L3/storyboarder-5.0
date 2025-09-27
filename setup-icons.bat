@echo off
echo Setting up Storyboarder build icons...
echo.

REM Create build directory structure
if not exist "build" mkdir build
if not exist "build\fileassociation" mkdir build\fileassociation

echo Copying source icon files...
copy "src\img\logoicon.png" "build\logoicon.png" >nul 2>&1
copy "src\img\fileicon.png" "build\fileassociation\file.png" >nul 2>&1
copy "src\img\logoicon.png" "build\background.png" >nul 2>&1

echo.
echo ✅ Build directory structure created!
echo.
echo 📋 Next steps to complete icon setup:
echo.
echo 1. Convert logoicon.png to ICO format:
echo    - Go to https://convertio.co/png-ico/
echo    - Upload build\logoicon.png
echo    - Download and save as build\icon.ico
echo.
echo 2. Convert logoicon.png to ICNS format:
echo    - Go to https://convertio.co/png-icns/
echo    - Upload build\logoicon.png  
echo    - Download and save as build\icon.icns
echo.
echo 3. Build the application:
echo    - Run: npm run dist:win
echo.
echo 📁 Current build directory:
dir build /b
echo.
echo Press any key to continue...
pause >nul
