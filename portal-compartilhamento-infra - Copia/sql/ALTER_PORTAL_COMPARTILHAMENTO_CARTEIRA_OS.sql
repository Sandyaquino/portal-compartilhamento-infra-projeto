-- =====================================================================
--  CARTEIRA_OS: provedores conectados em cada poste da carteira
--
--  Cada OS da carteira passa a guardar quantos provedores estao naquele
--  poste e a lista (razao social + CNPJ), tirada de POSTE_OCUPACAO no
--  momento da geracao. Assim a equipe de campo ja sabe o que esperar em
--  cada visita sem ter que consultar o cadastro.
--
--  (O raio maximo de atuacao — que impede a carteira de espalhar servico
--  demais na semana — vai no PARAMETROS_JSON de CARTEIRA, sem coluna
--  nova: chave "raio_maximo_km".)
--
--  Rodar DEPOIS de sql/PORTAL_COMPARTILHAMENTO_CARTEIRA.sql.
--  Schema de trabalho: ajuste "CLB349328" se o seu for outro.
-- =====================================================================

ALTER TABLE "CLB349328"."PORTAL_COMPARTILHAMENTO_CARTEIRA_OS" ADD (
    "QTD_PROVEDORES"   INTEGER DEFAULT 0,
    "PROVEDORES_JSON"  NVARCHAR(2000)   -- [{ "RAZAO_SOCIAL": "...", "CNPJ": "..." }, ...]
);
