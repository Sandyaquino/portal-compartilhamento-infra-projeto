-- =====================================================================
--  Base de Postes Coelba  (cadastro de ativos)
--  Tabela PORTAL_COMPARTILHAMENTO_BASE_POSTE
--
--  Contexto
--  --------
--  Esta e a base MESTRE de todo poste da distribuidora - o registro de
--  ativos. Milhoes de linhas. NAO confundir com
--  PORTAL_COMPARTILHAMENTO_POSTE, que e o subconjunto do parque com
--  ocupacao de terceiros ja mapeada (usado no indicador de saturacao).
--
--  Origem: extracao do cadastro de ativos (arquivo BASE_POSTE.txt), com
--  as colunas NU_PG_ID / NU_LOCALIDADE_ID / DE_BARRAMENTO / MUNICIPIO /
--  NU_LATITUDE / NU_LONGITUDE. Acrescentamos:
--    - LOCALIDADE       -> nome da localidade (o arquivo so traz o ID)
--    - DATA_ATUALIZACAO -> quando este registro foi atualizado pela ultima
--                          carga (permite carga incremental / delta)
--    - CARGA_ID         -> identificador da carga que trouxe/atualizou a linha
--
--  Ligacao com compartilhamento
--  ----------------------------
--  DE_BARRAMENTO casa com PORTAL_COMPARTILHAMENTO_POSTE_OCUPACAO.BARRAMENTO.
--  "Poste sem provedor" = DE_BARRAMENTO que NAO aparece em POSTE_OCUPACAO
--  com uma operadora resolvida (ID_OPERADORA NOT NULL). E o alvo do caso
--  de uso de selecionar postes para fiscalizacao.
--
--  Estrategia de carregamento no mapa
--  ----------------------------------
--  O mapa NUNCA carrega a base inteira. Regras (aplicadas nos endpoints
--  /api/base-postes/*):
--    1. Navegacao por MUNICIPIO -> LOCALIDADE. O usuario escolhe e o mapa
--       da fitBounds na area.
--    2. Pontos individuais so quando a selecao e estreita: uma LOCALIDADE
--       escolhida, ou uma bbox de viewport pequena o suficiente
--       (area <= LIMITE_AREA_GRAUS2). Caso contrario o endpoint devolve so
--       agregacao (densidade por celula de grade), nao pontos.
--    3. Mesmo estreito, ha um teto de pontos (LIMITE_PONTOS) + flag
--       "truncado" para o front pedir mais zoom.
--    4. Indices por MUNICIPIO, NU_LOCALIDADE_ID e (NU_LATITUDE, NU_LONGITUDE)
--       para as consultas por bbox / localidade serem rapidas.
--
--  Schema de trabalho: ajuste "CLB349328" se o seu for outro.
-- =====================================================================

CREATE COLUMN TABLE "CLB349328"."PORTAL_COMPARTILHAMENTO_BASE_POSTE"
(
    "NU_PG_ID"          BIGINT        NOT NULL,        -- id do poste no cadastro de ativos
    "NU_LOCALIDADE_ID"  BIGINT,
    "LOCALIDADE"        NVARCHAR(120),                 -- nome da localidade (acrescentado)
    "DE_BARRAMENTO"     NVARCHAR(50),                  -- casa com POSTE_OCUPACAO.BARRAMENTO
    "MUNICIPIO"         NVARCHAR(120),
    "UF"               NVARCHAR(2)   DEFAULT 'BA',

    "NU_LATITUDE"       DECIMAL(18,10),                -- Y
    "NU_LONGITUDE"      DECIMAL(18,10),                -- X

    "DATA_ATUALIZACAO"  LONGDATE CS_LONGDATE,          -- ultima atualizacao do registro (acrescentado)
    "CARGA_ID"          NVARCHAR(40),                  -- id da carga que trouxe/atualizou a linha
    "ATIVO"            NVARCHAR(1)   DEFAULT 'S',

    PRIMARY KEY ("NU_PG_ID")
)
UNLOAD PRIORITY 5 AUTO MERGE;

CREATE INDEX "IX_BASEPOSTE_BARRAMENTO" ON "CLB349328"."PORTAL_COMPARTILHAMENTO_BASE_POSTE" ("DE_BARRAMENTO");
CREATE INDEX "IX_BASEPOSTE_MUNICIPIO"  ON "CLB349328"."PORTAL_COMPARTILHAMENTO_BASE_POSTE" ("MUNICIPIO");
CREATE INDEX "IX_BASEPOSTE_LOCALIDADE" ON "CLB349328"."PORTAL_COMPARTILHAMENTO_BASE_POSTE" ("NU_LOCALIDADE_ID");
CREATE INDEX "IX_BASEPOSTE_LATLNG"     ON "CLB349328"."PORTAL_COMPARTILHAMENTO_BASE_POSTE" ("NU_LATITUDE", "NU_LONGITUDE");
CREATE INDEX "IX_BASEPOSTE_ATUALIZ"    ON "CLB349328"."PORTAL_COMPARTILHAMENTO_BASE_POSTE" ("DATA_ATUALIZACAO");


-- ---------------------------------------------------------------------
--  VIEW: base de postes com o vinculo de ocupacao resolvido
--  (S = tem ao menos uma ocupacao com operadora identificada).
--  Usada pelos endpoints para o filtro "sem provedor".
-- ---------------------------------------------------------------------
CREATE VIEW "CLB349328"."V_PORTAL_COMPARTILHAMENTO_BASE_POSTE_VINCULO" AS
SELECT
    BP."NU_PG_ID",
    BP."NU_LOCALIDADE_ID",
    BP."LOCALIDADE",
    BP."DE_BARRAMENTO",
    BP."MUNICIPIO",
    BP."UF",
    BP."NU_LATITUDE",
    BP."NU_LONGITUDE",
    BP."DATA_ATUALIZACAO",
    CASE WHEN EXISTS (
        SELECT 1
        FROM "CLB349328"."PORTAL_COMPARTILHAMENTO_POSTE_OCUPACAO" O
        WHERE O."BARRAMENTO" = BP."DE_BARRAMENTO"
          AND O."ID_OPERADORA" IS NOT NULL
    ) THEN 'S' ELSE 'N' END AS "TEM_PROVEDOR"
FROM "CLB349328"."PORTAL_COMPARTILHAMENTO_BASE_POSTE" BP
WHERE BP."ATIVO" = 'S';


-- ---------------------------------------------------------------------
--  (opcional) catalogo de localidades - se quiser normalizar o nome
--  em vez de repetir na coluna LOCALIDADE.
-- ---------------------------------------------------------------------
-- CREATE COLUMN TABLE "CLB349328"."PORTAL_COMPARTILHAMENTO_BASE_LOCALIDADE"
-- (
--     "NU_LOCALIDADE_ID" BIGINT NOT NULL,
--     "NOME"             NVARCHAR(120),
--     "MUNICIPIO"        NVARCHAR(120),
--     "UF"               NVARCHAR(2) DEFAULT 'BA',
--     PRIMARY KEY ("NU_LOCALIDADE_ID")
-- ) UNLOAD PRIORITY 5 AUTO MERGE;


-- ---------------------------------------------------------------------
--  Conferencia
-- ---------------------------------------------------------------------
-- Total e vinculo:
--   SELECT "TEM_PROVEDOR", COUNT(*) FROM "CLB349328"."V_PORTAL_COMPARTILHAMENTO_BASE_POSTE_VINCULO"
--    GROUP BY "TEM_PROVEDOR";
--
-- Por municipio:
--   SELECT "MUNICIPIO", COUNT(*) FROM "CLB349328"."PORTAL_COMPARTILHAMENTO_BASE_POSTE"
--    WHERE "ATIVO" = 'S' GROUP BY "MUNICIPIO" ORDER BY 2 DESC;
--
-- Postes sem provedor numa bbox (o que o endpoint de selecao para
-- fiscalizacao faz):
--   SELECT V.* FROM "CLB349328"."V_PORTAL_COMPARTILHAMENTO_BASE_POSTE_VINCULO" V
--    WHERE V."TEM_PROVEDOR" = 'N'
--      AND V."NU_LONGITUDE" BETWEEN ? AND ?
--      AND V."NU_LATITUDE"  BETWEEN ? AND ?;
-- =====================================================================
