@echo off
setlocal EnableDelayedExpansion
title ROBO WHATSAPP - Painel (Evolution API + Tunel)
cd /d "%~dp0"
if not exist logs mkdir logs

:menu
cls
echo ========================================================
echo   ROBO WHATSAPP - ENCOMED
echo ========================================================
call :status
echo.
echo   [1] INICIAR robo (oculto, em segundo plano)
echo   [2] PARAR robo
echo   [3] REINICIAR robo
echo   [4] Ver link do tunel (e copiar)
echo   [5] Abrir pasta de logs
echo   [0] Sair
echo.
set /p op="Escolha: "
if "%op%"=="1" call :iniciar & goto menu
if "%op%"=="2" call :parar & pause & goto menu
if "%op%"=="3" call :parar & call :iniciar & goto menu
if "%op%"=="4" call :link & pause & goto menu
if "%op%"=="5" start "" explorer "%~dp0logs" & goto menu
if "%op%"=="0" exit /b
goto menu

:status
powershell -NoProfile -Command "$e=Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*dist/main.js*' }; $t=Get-Process cloudflared -ErrorAction SilentlyContinue; if($e){Write-Host '  Evolution API : ATIVA' -ForegroundColor Green}else{Write-Host '  Evolution API : PARADA' -ForegroundColor Red}; if($t){Write-Host '  Tunel         : ATIVO' -ForegroundColor Green}else{Write-Host '  Tunel         : PARADO' -ForegroundColor Red}; if(Test-Path 'logs\link_tunel.txt'){Write-Host ('  Link atual    : ' + (Get-Content 'logs\link_tunel.txt'))}"
exit /b

:parar
echo Parando robo e tunel...
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'node.exe' -and $_.CommandLine -like '*dist/main.js*') -or $_.Name -eq 'cloudflared.exe' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" >nul 2>&1
if exist logs\link_tunel.txt del logs\link_tunel.txt
echo Encerrado.
exit /b

:iniciar
call :parar >nul
echo Iniciando Evolution API (oculta)...
powershell -NoProfile -Command "Start-Process -FilePath 'node' -ArgumentList 'dist/main.js' -WorkingDirectory '%~dp0evolution-api' -WindowStyle Hidden -RedirectStandardOutput '%~dp0logs\evolution.log' -RedirectStandardError '%~dp0logs\evolution.err.log'"
echo Iniciando tunel Cloudflare (oculto)...
if exist logs\tunel.log del logs\tunel.log
powershell -NoProfile -Command "Start-Process -FilePath '%~dp0cloudflared.exe' -ArgumentList 'tunnel --url http://localhost:8080' -WindowStyle Hidden -RedirectStandardOutput '%~dp0logs\tunel.out.log' -RedirectStandardError '%~dp0logs\tunel.log'"
echo Aguardando link do tunel (ate 40s)...
call :link
pause
exit /b

:link
powershell -NoProfile -Command "$f='%~dp0logs\tunel.log'; $url=$null; for($i=0;$i -lt 40 -and -not $url;$i++){ if(Test-Path $f){ $m=Select-String -Path $f -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -First 1; if($m){$url=$m.Matches[0].Value} }; if(-not $url){Start-Sleep 1} }; if($url){ Set-Content -Path '%~dp0logs\link_tunel.txt' -Value $url; Set-Clipboard -Value $url; Write-Host ''; Write-Host ('LINK (ja copiado): ' + $url) -ForegroundColor Green; Write-Host 'Cole em Configuracoes > WhatsApp no site.' } else { Write-Host 'Link nao encontrado. O tunel esta ativo? Veja logs\tunel.log' -ForegroundColor Red }"
exit /b

