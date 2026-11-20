@echo off
rem Forwards to the installed npm when the calling process was started before
rem Node.js was added to PATH (its environment then lacks the Node folder).
setlocal
set "OW_NODE="
for %%D in ("%ProgramFiles%\nodejs" "%ProgramFiles(x86)%\nodejs" "%LOCALAPPDATA%\Programs\nodejs" "%NVM_SYMLINK%") do (
  if not defined OW_NODE if exist "%%~D\npm.cmd" set "OW_NODE=%%~D"
)
if not defined OW_NODE (
  echo npm.cmd shim: Node.js was not found. Install it from https://nodejs.org 1>&2
  exit /b 1
)
set "PATH=%OW_NODE%;%PATH%"
call "%OW_NODE%\npm.cmd" %*
exit /b %ERRORLEVEL%
