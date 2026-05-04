@echo off
cd /d "%~dp0"

echo -----------------------------------------
echo  EduPrompt Backend - Local Development
echo -----------------------------------------
echo.

if not exist .env (
    echo ERROR: .env file not found!
    echo Please create .env in: %~dp0
    echo.
    pause
    exit /b 1
)

echo .env found OK
python --version
echo.

if not exist venv\ (
    echo Creating virtual environment...
    python -m venv venv
    if errorlevel 1 (
        echo ERROR: Failed to create venv
        pause
        exit /b 1
    )
    echo Installing dependencies...
    call venv\Scripts\activate.bat
    pip install -r requirements.txt
    if errorlevel 1 (
        echo ERROR: Failed to install dependencies
        pause
        exit /b 1
    )
) else (
    echo Activating existing venv...
    call venv\Scripts\activate.bat
)

echo.
echo Starting backend at http://localhost:8000
echo Docs at http://localhost:8000/docs
echo Press Ctrl+C to stop
echo.

python -m uvicorn api.main:app --reload --port 8000

echo.
echo Server stopped.
pause
