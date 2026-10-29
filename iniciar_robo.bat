@echo off
title Robo WhatsApp - Evolution API (Drogaria)
color 0A

echo ========================================================
echo   INICIANDO ROBO DE WHATSAPP - SISTEMA DE ENCOMENDAS
echo   Conectado ao Supabase PostgreSQL
echo   Porta: 8080
echo ========================================================
echo.

cd /d "%~dp0evolution-api"

:loop
echo [%date% %time%] Servidor Evolution API iniciando...
node dist/main.js

echo.
echo [AVISO] O servidor parou inesperadamente! Reiniciando em 5 segundos...
timeout /t 5 >nul
goto loop

