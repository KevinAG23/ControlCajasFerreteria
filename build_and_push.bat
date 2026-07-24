@echo off
echo ===================================================
echo   Compilando y subiendo imagenes a Docker Hub
echo ===================================================
echo.

echo 1. Compilando y subiendo Frontend...
docker build -t kevinagk/node-frontend:latest ./frontend
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Error al compilar el Frontend. Asegurate de tener Docker Desktop iniciado.
    pause
    exit /b %ERRORLEVEL%
)
docker push kevinagk/node-frontend:latest

echo.
echo 2. Compilando y subiendo Admin API...
docker build -t kevinagk/cajas_api_admin:latest ./backend_admin
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Error al compilar Admin API.
    pause
    exit /b %ERRORLEVEL%
)
docker push kevinagk/cajas_api_admin:latest

echo.
echo 3. Compilando y subiendo API Principal y Workers...
docker build -t kevinagk/cajas_api:v2-optimized -f Dockerfile.api .
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Error al compilar la API Principal.
    pause
    exit /b %ERRORLEVEL%
)
docker push kevinagk/cajas_api:v2-optimized

echo.
echo 4. Compilando y subiendo WhisperX Worker...
docker build -t kevinagk/cajas_whisperx:v3-resource-limits -f Dockerfile.whisperx .
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Error al compilar el WhisperX Worker.
    pause
    exit /b %ERRORLEVEL%
)
docker push kevinagk/cajas_whisperx:v3-resource-limits

echo.
echo ===================================================
echo   [OK] Proceso finalizado con exito!
echo   Imagenes actualizadas en Docker Hub.
echo.
echo   Ahora puedes ir a tu servidor Linux y correr:
echo   docker compose pull && docker compose up -d
echo ===================================================
pause
