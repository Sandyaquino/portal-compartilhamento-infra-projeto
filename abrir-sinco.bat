@echo off

set PATH=C:\Users\U349328\Desktop\COMPARTILHAMENTO_INFRAESTRUTURA\PROJETO\node-v24.18.0-win-x64;%PATH%

cd /d C:\Users\U349328\Desktop\COMPARTILHAMENTO_INFRAESTRUTURA\PROJETO\portal-compartilhamento-infra

set PATH=C:\Users\U349328\Desktop\COMPARTILHAMENTO_INFRAESTRUTURA\PROJETO\workspace_projeto\portal-compartilhamento-infra-projeto\node-v24.18.0-win-x64;%PATH%

npm run dev
venv\Scripts\activate
uvicorn main:app --reload