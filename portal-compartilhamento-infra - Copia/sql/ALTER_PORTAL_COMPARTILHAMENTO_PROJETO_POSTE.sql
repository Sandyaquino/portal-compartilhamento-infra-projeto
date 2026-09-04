-- =====================================================================
--  PROJETO_POSTE: colunas da Planilha de Postes do provedor
--
--  O provedor entrega uma planilha (.xlsx) com uma linha por poste. Alem
--  do que ja existia (IDENTIFICADOR_POSTE, BARRAMENTO, LATITUDE/LONGITUDE,
--  MUNICIPIO, LOGRADOURO), a planilha traz o tipo de ocupacao, a
--  especificacao estrutural do poste e os dados mecanicos.
--
--  Colunas da planilha  ->  coluna aqui
--    OCUPACAO            ->  OCUPACAO_TIPO           (COMPARTILHADO | NOVO)
--    N POSTE             ->  IDENTIFICADOR_POSTE     (ja existia)
--    ENDERECO            ->  LOGRADOURO              (ja existia)
--    MUNICIPIO           ->  MUNICIPIO               (ja existia)
--    POSTE               ->  ESPECIFICACAO_POSTE     (ex.: "DT 400/12")
--    BARRAMENTO          ->  BARRAMENTO              (ja existia; pode vir "ILEGIVEL")
--    LATITUDE/LONGITUDE  ->  LATITUDE/LONGITUDE      (ja existia)
--    FIXACAO             ->  FIXACAO                 (Ancoragem | Passagem)
--    CORDOALHA           ->  CORDOALHA              (S | N)
--    ANGULO              ->  ANGULO                  (graus)
--    RESULTANTE          ->  ESFORCO_RESULTANTE_KGF  (Kgf)
--
--  Rodar DEPOIS de sql/PORTAL_COMPARTILHAMENTO_PROJETO.sql.
--  Schema de trabalho: ajuste "CLB349328" se o seu for outro.
-- =====================================================================

ALTER TABLE "CLB349328"."PORTAL_COMPARTILHAMENTO_PROJETO_POSTE" ADD (
    "OCUPACAO_TIPO"          NVARCHAR(20),      -- COMPARTILHADO | NOVO
    "ESPECIFICACAO_POSTE"    NVARCHAR(40),      -- ex.: "DT 400/12", "CIRC 1000/12"
    "FIXACAO"                NVARCHAR(20),      -- Ancoragem | Passagem
    "CORDOALHA"              NVARCHAR(1),       -- S | N
    "ANGULO"                 DECIMAL(6,2),      -- graus
    "ESFORCO_RESULTANTE_KGF" DECIMAL(10,2)     -- Kgf
);

CREATE INDEX "IX_PROJPOSTE_OCUPACAO"
    ON "CLB349328"."PORTAL_COMPARTILHAMENTO_PROJETO_POSTE" ("OCUPACAO_TIPO");
