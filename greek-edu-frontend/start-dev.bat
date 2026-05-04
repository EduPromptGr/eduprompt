@echo off
cd /d "%~dp0"

echo -----------------------------------------
echo  EduPrompt Frontend - Local Development
echo -----------------------------------------
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js not found!
    echo Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

if not exist node_modules\ (
    echo Installing dependencies...
    npm install
    if errorlevel 1 (
        echo ERROR: npm install failed
        pause
        exit /b 1
    )
)

echo.
echo Starting frontend at http://localhost:3000
echo Press Ctrl+C to stop
echo.

npm run dev

echo.
pause
