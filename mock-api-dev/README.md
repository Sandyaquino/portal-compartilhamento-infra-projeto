# mock-api-dev

API fictícia para desenvolver o frontend localmente sem acesso ao SAP HANA
nem ao backend real (`portal-api - Copia`). Não tem nenhuma dependência —
só Node.js puro.

Fica de propósito fora das pastas dos dois projetos reais: nada no frontend
ou no backend é alterado para isso funcionar. O frontend já usa
`http://localhost:8000` como API por padrão (`lib/config.ts`), que é a porta
onde este mock escuta, então não é preciso nenhuma configuração adicional —
e no ambiente corporativo, onde a variável de API aponta pra API real, esse
mock nunca entra em cena.

## Rodar

```bash
node mock-api-dev/server.js
```

## O que já cobre

- `POST /auth/enviar-codigo` — gera um código de 6 dígitos fictício (fica
  visível no console e também é devolvido em `codigo_teste`, igual ao modo
  `PORTAL_AUTH_DEV_MODE=S` do backend real).
- `POST /auth/validar-codigo` — valida o código e devolve um token fictício.
- `GET /api/auth/me` — devolve um usuário fictício com perfil
  "Administrador" e as funcionalidades extras usadas pelo frontend
  (`EDITAR_CADASTRO_TECNICO`, `EDITAR_CADASTRO_EQUIPE`).

Qualquer outra rota chamada pelo frontend ainda não tem fixture — o mock
responde 404 e imprime `sem mock: MÉTODO /rota` no console, o que ajuda a
saber qual endpoint fictício adicionar em seguida conforme as telas forem
sendo testadas.
