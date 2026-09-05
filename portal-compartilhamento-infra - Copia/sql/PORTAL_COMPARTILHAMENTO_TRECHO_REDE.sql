-- =====================================================================
--  Segmentos da rede de distribuicao (media e baixa tensao)
--  Tabela PORTAL_COMPARTILHAMENTO_TRECHO_REDE
--
--  Contexto
--  --------
--  Cada linha e um TRECHO (aresta) da rede eletrica de distribuicao,
--  ligando dois pontos de grade / barramentos: um inicial e um final,
--  com as coordenadas dos dois lados, o alimentador ao qual pertence, a
--  extensao em metros e o tipo (ENTIDADE):
--      'TRECHO DE MT' -> media tensao (rede primaria / troncos)
--      'TRECHO DE BT' -> baixa tensao (rede secundaria / ramais)
--
--  Origem: extracao do GIS da distribuidora (arquivo de trechos BT/MT).
--  Colunas do arquivo: MUNICIPIO, ID_TBT, PG_INICIAL, PG_FINAL,
--  BARRAMENTO (inicial), LONG_INICIAL, LAT_INICIAL, BARRAMENTO (final),
--  LONG_FINAL, LAT_FINAL, ALIMENTADOR, EXTENSAO, ENTIDADE.
--
--  Para que serve no compartilhamento
--  ----------------------------------
--  O cabo de fibra otica de um provedor percorre fisicamente essa mesma
--  rede (segue os postes da BT, e as vezes da MT). Montando o GRAFO
--  (nos = barramentos, arestas = trechos) da pra reconstituir o caminho
--  teorico da fibra e cruzar com POSTE_OCUPACAO:
--
--    Se um provedor esta declarado no poste A e no poste C, e existe um
--    caminho A - B - C pela rede (mesmo alimentador, poucos trechos),
--    entao o poste B quase certamente carrega a fibra desse provedor e
--    deveria estar sendo faturado. Se B nao tem ocupacao, o algoritmo de
--    "postes na rota nao faturados" aponta B como suspeito.
--
--  BARRAMENTO_INICIAL / BARRAMENTO_FINAL casam com
--  PORTAL_COMPARTILHAMENTO_POSTE_OCUPACAO.BARRAMENTO (e com
--  PORTAL_COMPARTILHAMENTO_POSTE.BARRAMENTO / BASE_POSTE.DE_BARRAMENTO).
--
--  Schema de trabalho: ajuste "CLB349328" se o seu for outro.
-- =====================================================================

CREATE COLUMN TABLE "CLB349328"."PORTAL_COMPARTILHAMENTO_TRECHO_REDE"
(
    "ID_TRECHO"            BIGINT         NOT NULL,     -- chave (use ID_TBT da origem ou um surrogate)
    "MUNICIPIO"            NVARCHAR(120),
    "ID_TBT"              BIGINT,                       -- id do trecho no sistema de origem (GIS)

    "PG_INICIAL"           BIGINT,                      -- ponto de grade inicial
    "PG_FINAL"             BIGINT,                      -- ponto de grade final

    "BARRAMENTO_INICIAL"   NVARCHAR(50),                -- casa com POSTE_OCUPACAO.BARRAMENTO
    "LONGITUDE_INICIAL"    DECIMAL(18,10),              -- X do no inicial
    "LATITUDE_INICIAL"     DECIMAL(18,10),              -- Y do no inicial

    "BARRAMENTO_FINAL"     NVARCHAR(50),                -- casa com POSTE_OCUPACAO.BARRAMENTO
    "LONGITUDE_FINAL"      DECIMAL(18,10),              -- X do no final
    "LATITUDE_FINAL"       DECIMAL(18,10),              -- Y do no final

    "ALIMENTADOR"          NVARCHAR(30),                -- codigo do alimentador (ex.: AGS-01Z1)
    "EXTENSAO_M"           DECIMAL(12,2),               -- comprimento do trecho, em metros
    "ENTIDADE"             NVARCHAR(20),                -- 'TRECHO DE MT' | 'TRECHO DE BT'

    "DATA_ATUALIZACAO"     LONGDATE CS_LONGDATE,        -- ultima carga que trouxe/atualizou a linha
    "CARGA_ID"             NVARCHAR(40),
    "ATIVO"               NVARCHAR(1)    DEFAULT 'S',
    "CREATED_AT"           LONGDATE CS_LONGDATE,

    PRIMARY KEY ("ID_TRECHO"),
    CONSTRAINT "CK_TRECHO_REDE_ENTIDADE" CHECK ("ENTIDADE" IN ('TRECHO DE MT', 'TRECHO DE BT'))
)
UNLOAD PRIORITY 5 AUTO MERGE;

-- Percursos do grafo partem de um barramento e "andam" pelas arestas:
-- indices dos dois lados + por alimentador/municipio para recortar o escopo.
CREATE INDEX "IX_TRECHOREDE_BARR_INI"  ON "CLB349328"."PORTAL_COMPARTILHAMENTO_TRECHO_REDE" ("BARRAMENTO_INICIAL");
CREATE INDEX "IX_TRECHOREDE_BARR_FIM"  ON "CLB349328"."PORTAL_COMPARTILHAMENTO_TRECHO_REDE" ("BARRAMENTO_FINAL");
CREATE INDEX "IX_TRECHOREDE_ALIMENT"   ON "CLB349328"."PORTAL_COMPARTILHAMENTO_TRECHO_REDE" ("ALIMENTADOR");
CREATE INDEX "IX_TRECHOREDE_MUNICIPIO" ON "CLB349328"."PORTAL_COMPARTILHAMENTO_TRECHO_REDE" ("MUNICIPIO");
CREATE INDEX "IX_TRECHOREDE_ENTIDADE"  ON "CLB349328"."PORTAL_COMPARTILHAMENTO_TRECHO_REDE" ("ENTIDADE");
CREATE INDEX "IX_TRECHOREDE_LATLNG_INI" ON "CLB349328"."PORTAL_COMPARTILHAMENTO_TRECHO_REDE" ("LATITUDE_INICIAL", "LONGITUDE_INICIAL");


-- ---------------------------------------------------------------------
--  VIEW auxiliar: arestas normalizadas (uma linha por sentido logico
--  ja nao importa - o grafo e nao-direcionado). Facilita montar a
--  lista de adjacencia no backend / conferir no SQL.
-- ---------------------------------------------------------------------
CREATE VIEW "CLB349328"."V_PORTAL_COMPARTILHAMENTO_REDE_ARESTA" AS
SELECT "ID_TRECHO", "MUNICIPIO", "ALIMENTADOR", "ENTIDADE", "EXTENSAO_M",
       "BARRAMENTO_INICIAL" AS "DE", "LONGITUDE_INICIAL" AS "DE_X", "LATITUDE_INICIAL" AS "DE_Y",
       "BARRAMENTO_FINAL"   AS "PARA", "LONGITUDE_FINAL"  AS "PARA_X", "LATITUDE_FINAL" AS "PARA_Y"
FROM "CLB349328"."PORTAL_COMPARTILHAMENTO_TRECHO_REDE"
WHERE "ATIVO" = 'S' AND "BARRAMENTO_INICIAL" IS NOT NULL AND "BARRAMENTO_FINAL" IS NOT NULL;


-- ---------------------------------------------------------------------
--  VIEW: no da rede + se tem provedor declarado (une os dois lados dos
--  trechos e cruza com POSTE_OCUPACAO). "no sem ocupacao" no meio de um
--  corredor ocupado e o alvo da analise.
-- ---------------------------------------------------------------------
CREATE VIEW "CLB349328"."V_PORTAL_COMPARTILHAMENTO_REDE_NO" AS
SELECT N."BARRAMENTO", MAX(N."MUNICIPIO") AS "MUNICIPIO",
       MAX(N."X") AS "X", MAX(N."Y") AS "Y",
       CASE WHEN EXISTS (
           SELECT 1 FROM "CLB349328"."PORTAL_COMPARTILHAMENTO_POSTE_OCUPACAO" O
           WHERE O."BARRAMENTO" = N."BARRAMENTO" AND O."ID_OPERADORA" IS NOT NULL
       ) THEN 'S' ELSE 'N' END AS "TEM_PROVEDOR"
FROM (
    SELECT "BARRAMENTO_INICIAL" AS "BARRAMENTO", "MUNICIPIO", "LONGITUDE_INICIAL" AS "X", "LATITUDE_INICIAL" AS "Y"
      FROM "CLB349328"."PORTAL_COMPARTILHAMENTO_TRECHO_REDE" WHERE "ATIVO" = 'S'
    UNION ALL
    SELECT "BARRAMENTO_FINAL", "MUNICIPIO", "LONGITUDE_FINAL", "LATITUDE_FINAL"
      FROM "CLB349328"."PORTAL_COMPARTILHAMENTO_TRECHO_REDE" WHERE "ATIVO" = 'S'
) N
GROUP BY N."BARRAMENTO";


-- ---------------------------------------------------------------------
--  Conferencia
-- ---------------------------------------------------------------------
-- Trechos por tipo:
--   SELECT "ENTIDADE", COUNT(*), ROUND(SUM("EXTENSAO_M")/1000, 1) AS KM
--     FROM "CLB349328"."PORTAL_COMPARTILHAMENTO_TRECHO_REDE"
--    WHERE "ATIVO" = 'S' GROUP BY "ENTIDADE";
--
-- Grau de cada barramento (quantos trechos chegam nele) num alimentador:
--   SELECT "DE", COUNT(*) FROM "CLB349328"."V_PORTAL_COMPARTILHAMENTO_REDE_ARESTA"
--    WHERE "ALIMENTADOR" = ? GROUP BY "DE" ORDER BY 2 DESC;
--
-- Nos sem provedor no municipio (candidatos da analise, antes do grafo):
--   SELECT * FROM "CLB349328"."V_PORTAL_COMPARTILHAMENTO_REDE_NO"
--    WHERE "MUNICIPIO" = ? AND "TEM_PROVEDOR" = 'N';
-- =====================================================================
