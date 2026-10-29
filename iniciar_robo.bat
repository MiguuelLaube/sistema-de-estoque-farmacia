@echo off
title Robo WhatsApp + Cloudflare Tunnel (Drogaria)
color 0A

echo ========================================================
echo   INICIANDO ROBO DE WHATSAPP + CLOUDFLARE TUNNEL
echo ========================================================
echo.

cd /d "%~dp0"

echo [1/2] Iniciando Servidor da Evolution API em segundo plano...
start "Evolution API Server" cmd /k "cd /d %~dp0evolution-api && node dist/main.js"

echo [2/2] Abrindo Tunel Seguro do Cloudflare...
echo.
echo ========================================================
echo   COPIE O LINK HTTPS ABAIXO E COLE NAS CONFIGURACOES DO SITE
echo   Exemplo: https://xxxxxxxxxxxx.trycloudflare.com
echo ========================================================
echo.

.\cloudflared.exe tunnel --url http://localhost:8080
pause
