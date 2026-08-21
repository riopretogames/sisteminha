@echo off
REM ===========================================================================
REM  Backup do banco do Sisteminha
REM ===========================================================================
REM
REM  COMO USAR: abra o Docker Desktop e espere ele ficar verde ("Engine
REM  running"), depois dE dois cliques neste arquivo.
REM
REM  O backup sai na pasta "backups", com a data no nome. Sao tres arquivos:
REM    - ..._schema.sql  a ESTRUTURA (tabelas, regras, permissoes)
REM    - ..._dados.sql   os DADOS (clientes, produtos, vendas, OS)
REM    - ..._roles.sql   os papeis de acesso
REM
REM  Para restaurar, os tres sao aplicados em ordem. Guarde os tres juntos.
REM
REM  POR QUE ISTO EXISTE: ate 21/08/2026 o banco nao tinha backup NENHUM, e
REM  o plano do Supabase que a loja usa nao faz backup automatico (conferido:
REM  "backups": [] e "pitr_enabled": false). Uma migration errada, um comando
REM  a mais, e nao existe volta.
REM ===========================================================================

setlocal
cd /d "%~dp0"

echo.
echo  Conferindo se o Docker esta rodando...
docker info >nul 2>&1
if errorlevel 1 (
  echo.
  echo  *** O DOCKER NAO ESTA RODANDO ***
  echo.
  echo  Abra o Docker Desktop, espere aparecer "Engine running" no canto
  echo  de baixo, e rode este arquivo de novo.
  echo.
  pause
  exit /b 1
)
echo  Docker ok.

if not exist "backups" mkdir "backups"

for /f "tokens=2 delims==" %%d in ('wmic os get localdatetime /value') do set DT=%%d
set CARIMBO=%DT:~0,4%-%DT:~4,2%-%DT:~6,2%_%DT:~8,2%h%DT:~10,2%

echo.
echo  Baixando a ESTRUTURA do banco...
call npx.cmd supabase db dump --linked -f "backups\%CARIMBO%_schema.sql"
if errorlevel 1 goto erro

echo.
echo  Baixando os DADOS...
call npx.cmd supabase db dump --linked --data-only -f "backups\%CARIMBO%_dados.sql"
if errorlevel 1 goto erro

echo.
echo  Baixando os PAPEIS de acesso...
call npx.cmd supabase db dump --linked --role-only -f "backups\%CARIMBO%_roles.sql"
if errorlevel 1 goto erro

echo.
echo  ========================================================
echo   BACKUP CONCLUIDO
echo  ========================================================
echo.
dir /b "backups\%CARIMBO%_*.sql"
echo.
echo  Os arquivos estao na pasta "backups".
echo.
echo  IMPORTANTE: copie essa pasta para fora deste computador
echo  (Google Drive, HD externo, pendrive). Backup que mora no
echo  mesmo lugar que o original nao protege contra o computador
echo  queimar ou ser roubado.
echo.
pause
exit /b 0

:erro
echo.
echo  *** DEU ERRO. O backup NAO foi concluido. ***
echo  Leia a mensagem acima e me mande o texto.
echo.
pause
exit /b 1
