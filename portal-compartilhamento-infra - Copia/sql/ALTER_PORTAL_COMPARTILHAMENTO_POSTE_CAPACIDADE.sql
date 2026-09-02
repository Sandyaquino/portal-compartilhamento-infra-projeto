-- =====================================================================
--  Saturação do parque de postes
--  Adiciona a coluna CAPACIDADE em PORTAL_COMPARTILHAMENTO_POSTE.
--
--  Contexto
--  --------
--  O KPI "Esgotados" do Mapa de Postes e o modo "colorir por saturação"
--  dependem de saber quantos pontos de fixação cada poste comporta.
--  Hoje a tabela só tem BARRAMENTO / X / Y / BARRAMENTO_OFICIAL, então
--  não havia como calcular saturação e o endpoint /api/postes/resumo
--  quebrava o front (campos postes_esgotados / postes_sobrecarga ausentes).
--
--  Modelo adotado
--  --------------
--   - CAPACIDADE  -> pontos de fixação disponíveis para terceiros no poste.
--                    Valor padrão 5 para todo o parque; pode ser ajustado
--                    poste a poste depois (por tipo/altura, laudo, etc.).
--   - "pontos ocupados" NÃO vira coluna: é derivado em tempo de consulta
--     como COUNT(*) de PORTAL_COMPARTILHAMENTO_POSTE_OCUPACAO por BARRAMENTO
--     (cada registro de ocupação = 1 ponto de fixação usado).
--
--  Classificação (feita no backend / front, sem constraint):
--     ocupados <= 0                      -> disponível
--     ocupados <  60% da capacidade      -> disponível
--     ocupados >= 60% e < capacidade     -> quase esgotando
--     ocupados == capacidade             -> esgotado
--     ocupados >  capacidade             -> sobrecarga
--
--  Schema de trabalho: ajuste "CLB349328" se o seu for outro.
-- =====================================================================


-- 1) Adiciona a coluna com default 5 (SAP HANA já aplica o default às
--    linhas existentes ao adicionar a coluna).
ALTER TABLE "CLB349328"."PORTAL_COMPARTILHAMENTO_POSTE"
    ADD ("CAPACIDADE" INTEGER CS_INT DEFAULT 5);

-- 2) Garante que nenhuma linha antiga ficou com NULL (idempotente).
UPDATE "CLB349328"."PORTAL_COMPARTILHAMENTO_POSTE"
   SET "CAPACIDADE" = 5
 WHERE "CAPACIDADE" IS NULL;

-- 3) (Opcional, recomendado) trava a coluna como NOT NULL mantendo o default.
--    Rode só depois de confirmar que o passo 2 zerou os NULLs.
ALTER TABLE "CLB349328"."PORTAL_COMPARTILHAMENTO_POSTE"
    ALTER ("CAPACIDADE" INTEGER CS_INT DEFAULT 5 NOT NULL);


-- ---------------------------------------------------------------------
--  Conferência
-- ---------------------------------------------------------------------
-- Distribuição de capacidade no parque:
--   SELECT "CAPACIDADE", COUNT(*) AS QTD_POSTES
--     FROM "CLB349328"."PORTAL_COMPARTILHAMENTO_POSTE"
--    GROUP BY "CAPACIDADE" ORDER BY "CAPACIDADE";
--
-- Prévia dos postes esgotados / em sobrecarga (mesma conta do endpoint):
--   SELECT
--       COUNT(CASE WHEN T.QTD >= T.CAP THEN 1 END) AS ESGOTADOS,
--       COUNT(CASE WHEN T.QTD >  T.CAP THEN 1 END) AS SOBRECARGA
--   FROM (
--       SELECT COALESCE(P."CAPACIDADE", 5) AS CAP, COALESCE(OCC.QTD, 0) AS QTD
--         FROM "CLB349328"."PORTAL_COMPARTILHAMENTO_POSTE" P
--         LEFT JOIN (
--             SELECT "BARRAMENTO", COUNT(*) AS QTD
--               FROM "CLB349328"."PORTAL_COMPARTILHAMENTO_POSTE_OCUPACAO"
--              GROUP BY "BARRAMENTO"
--         ) OCC ON OCC."BARRAMENTO" = P."BARRAMENTO"
--   ) T
--   WHERE T.QTD > 0;
-- =====================================================================
