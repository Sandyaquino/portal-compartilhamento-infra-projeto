-- =====================================================================
--  Tabela de apoio: tempo médio de execução por atividade
--
--  Usada pelo gerador automático da Carteira de Análise Comercial
--  (Comercial -> Carteira de Análise -> "Gerar carteira automática") para
--  estimar o prazo factível de conclusão: carga do responsável (itens já
--  na fila + itens novos) x tempo médio da atividade / minutos úteis por
--  dia = dias úteis até zerar a fila.
--
--  Uma linha por fase da jornada (mesmo catálogo de
--  app/(app)/comercial/carteira-analise: Análise de Entrante, Análise
--  Cadastral, Documentação, Aprovação, Contratação, Contato com Provedor).
--  Schema de trabalho: ajuste "CLB349328" se o seu for outro.
-- =====================================================================

CREATE COLUMN TABLE "CLB349328"."PORTAL_COMPARTILHAMENTO_ATIVIDADE_TEMPO_PADRAO"
(
    "CODIGO_ATIVIDADE"      NVARCHAR(20) NOT NULL,   -- ENTRANTE | ETAPA_1 | ETAPA_2 | ETAPA_3 | ETAPA_4 | CONTATO
    "NOME"                  NVARCHAR(120) NOT NULL,
    "DESCRICAO"             NVARCHAR(300),
    "TEMPO_MEDIO_MINUTOS"   INTEGER NOT NULL,
    "ATIVO"                 NVARCHAR(1) DEFAULT 'S',
    "UPDATED_AT"            LONGDATE CS_LONGDATE,
    "UPDATED_BY"            NVARCHAR(100),
    PRIMARY KEY ("CODIGO_ATIVIDADE")
)
UNLOAD PRIORITY 5 AUTO MERGE;

INSERT INTO "CLB349328"."PORTAL_COMPARTILHAMENTO_ATIVIDADE_TEMPO_PADRAO"
    ("CODIGO_ATIVIDADE","NOME","DESCRICAO","TEMPO_MEDIO_MINUTOS","ATIVO") VALUES
    ('ENTRANTE','Análise de Entrante','Triagem inicial do cadastro recebido pelo formulário/e-mail.',90,'S');
INSERT INTO "CLB349328"."PORTAL_COMPARTILHAMENTO_ATIVIDADE_TEMPO_PADRAO"
    ("CODIGO_ATIVIDADE","NOME","DESCRICAO","TEMPO_MEDIO_MINUTOS","ATIVO") VALUES
    ('ETAPA_1','Análise Cadastral','Conferência dos dados cadastrais do provedor.',60,'S');
INSERT INTO "CLB349328"."PORTAL_COMPARTILHAMENTO_ATIVIDADE_TEMPO_PADRAO"
    ("CODIGO_ATIVIDADE","NOME","DESCRICAO","TEMPO_MEDIO_MINUTOS","ATIVO") VALUES
    ('ETAPA_2','Documentação','Validação da documentação exigida.',120,'S');
INSERT INTO "CLB349328"."PORTAL_COMPARTILHAMENTO_ATIVIDADE_TEMPO_PADRAO"
    ("CODIGO_ATIVIDADE","NOME","DESCRICAO","TEMPO_MEDIO_MINUTOS","ATIVO") VALUES
    ('ETAPA_3','Aprovação','Parecer final de aprovação.',45,'S');
INSERT INTO "CLB349328"."PORTAL_COMPARTILHAMENTO_ATIVIDADE_TEMPO_PADRAO"
    ("CODIGO_ATIVIDADE","NOME","DESCRICAO","TEMPO_MEDIO_MINUTOS","ATIVO") VALUES
    ('ETAPA_4','Contratação','Elaboração e formalização da minuta contratual.',150,'S');
INSERT INTO "CLB349328"."PORTAL_COMPARTILHAMENTO_ATIVIDADE_TEMPO_PADRAO"
    ("CODIGO_ATIVIDADE","NOME","DESCRICAO","TEMPO_MEDIO_MINUTOS","ATIVO") VALUES
    ('CONTATO','Contato com Provedor','Ligação/e-mail de acompanhamento com o provedor.',20,'S');
