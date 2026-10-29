# Painel e-SUS APS — 15 Indicadores de Boas Práticas

Painel técnico para acompanhamento dos **15 indicadores de boas práticas do Componente de Qualidade do cofinanciamento federal da Atenção Primária à Saúde (APS)**.

O servidor lê **diretamente do PostgreSQL local** do e-SUS APS (schema DW, ~1180 tabelas), calcula os indicadores com base nas **Notas Metodológicas Oficiais do Ministério da Saúde** e serve uma interface web em `http://127.0.0.1:8088` — acessível também via rede local.

> **Nota Metodológica Oficial:** Os indicadores do bloco **Equipes de Saúde da Família e Atenção Primária (eSF/eAP — C1 a C7)** estão calculados em estrita conformidade com as Notas Metodológicas do Ministério da Saúde (disponíveis na pasta [`documentos/`](documentos/)).

---

## Requisitos

- Node.js **16+**
- PostgreSQL do e-SUS APS acessível (instalação local padrão: porta `5433`, banco `esus`)
- Pacote npm `pg` (já configurado — `npm install pg`)

## Como executar

```bash
cd dashboard
node server.js
```

- Painel Principal: **http://127.0.0.1:8088**
- Administração de Conexão: **http://127.0.0.1:8088/admin.html**

Variável de ambiente opcional: `PORTA` (sobrescreve a porta do `config.json`).

---

## Os 15 Indicadores e Situação Atual

O painel cobre os três blocos do cofinanciamento federal da APS:

### 1. Bloco eSF / eAP — Equipes de Saúde da Família e Atenção Primária (C1 a C7)
Calculados segundo as **Notas Metodológicas do Ministério da Saúde**:

| Cód. | ID | Indicador | População-Alvo | Fórmula / Boas Práticas Oficiais | Situação |
| :---: | :---: | :--- | :--- | :--- | :---: |
| **C1** | 3 | **Mais acesso à APS** | Atendimentos Médicos e de Enfermagem | $\frac{\text{Demanda Programada (agendada programada + cuidado continuado + agendada)}}{\text{Demanda Total (programada + espontânea)}} \times 100$<br>• **Faixas Oficiais**: Ótimo ($50 < \text{taxa} \le 70\%$), Bom ($30 < \text{taxa} \le 50\%$), Suficiente ($10 < \text{taxa} \le 30\%$) e Regular ($\le 10\%$ ou $> 70\%$). | **Oficial (100%)** |
| **C2** | 9 | **Cuidado no desenvolvimento infantil** | Crianças com até **02 anos** de vida | **5 práticas oficiais (20 pts cada, total 100)**:<br>• (A) 1ª consulta médica/enfermagem até o 30º dia de vida (20 pts)<br>• (B) Pelo menos 09 consultas até 2 anos de vida (20 pts)<br>• (C) Pelo menos 09 registros de peso e altura até 2 anos (20 pts)<br>• (D) Pelo menos 02 visitas de ACS: 1ª até 30d e 2ª até 6 meses (20 pts)<br>• (E) Vacinas recomendadas em dia (Penta, VIP, Tríplice Viral, Pneumo) (20 pts) | **Oficial (100%)** |
| **C3** | 6 | **Cuidado na gestação e puerpério** | Gestantes e Puérperas vinculadas | **11 práticas oficiais (total 100 pts)**:<br>• (A) 1ª consulta de pré-natal $\le 12$ semanas (10 pts)<br>• (B) $\ge 7$ consultas de pré-natal médico/enfermagem (9 pts)<br>• (C) $\ge 7$ aferições de PA na gestação (9 pts)<br>• (D) $\ge 7$ registros de peso e altura na gestação (9 pts)<br>• (E) $\ge 3$ visitas domiciliares de ACS no pré-natal (9 pts)<br>• (F) Vacina dTpa a partir da 20ª semana (9 pts)<br>• (G) Testes rápidos ou exames avaliados no 1º trimestre (9 pts)<br>• (H) Testes rápidos ou exames avaliados no 3º trimestre (9 pts)<br>• (I) Pelo menos 01 consulta no puerpério médica/enfermagem (9 pts)<br>• (J) Pelo menos 01 visita domiciliar de ACS no puerpério (9 pts)<br>• (K) Atendimento odontológico durante a gestação (9 pts) | **Oficial (100%)** |
| **C4** | 4 | **Cuidado da pessoa com diabetes** | Diabéticos vinculados (CID E10–E14, CIAP T89–T90 ou ACS) | **6 práticas oficiais (total 100 pts)**:<br>• (A) Consulta médica/enfermagem nos últimos 6 meses (20 pts)<br>• (B) Aferição de PA nos últimos 6 meses (15 pts)<br>• (C) Peso e altura simultâneos nos últimos 12 meses (15 pts)<br>• (D) $\ge 2$ visitas de ACS com intervalo mín. 30 dias nos últimos 12 meses (20 pts)<br>• (E) Hemoglobina glicada solicitada ou avaliada em 12 meses (15 pts)<br>• (F) Exame do pé diabético (03.01.04.009-5) em 12 meses (15 pts) | **Oficial (100%)** |
| **C5** | 5 | **Cuidado da pessoa com hipertensão** | Hipertensos vinculados (CID I10–I15, CIAP K86–K87 ou ACS) | **4 práticas oficiais (25 pts cada, total 100)**:<br>• (A) Consulta médica/enfermagem nos últimos 6 meses (25 pts)<br>• (B) Aferição de PA nos últimos 6 meses (25 pts)<br>• (C) Peso e altura simultâneos nos últimos 12 meses (25 pts)<br>• (D) $\ge 2$ visitas de ACS com intervalo mín. 30 dias nos últimos 12 meses (25 pts) | **Oficial (100%)** |
| **C6** | 8 | **Cuidado da pessoa idosa** | Pessoas com **60 anos ou mais** vinculadas | **4 práticas oficiais (25 pts cada, total 100)**:<br>• (A) Consulta médica/enfermagem nos últimos 12 meses (25 pts)<br>• (B) Peso e altura simultâneos nos últimos 12 meses (25 pts)<br>• (C) $\ge 2$ visitas de ACS com intervalo mín. 30 dias nos últimos 12 meses (25 pts)<br>• (D) Registro de 01 dose da vacina contra Influenza nos últimos 12 meses (25 pts) | **Oficial (100%)** |
| **C7** | 7 | **Cuidado da mulher na prevenção do câncer** | Mulheres vinculadas por subgrupos | **Média Ponderada Oficial**:<br>$$\frac{(A \times 20 + B \times 30 + C \times 30 + D \times 20)}{100}$$<br>• **A (peso 20)**: Citopatológico em mulheres de 25 a 64 anos (últimos 36 meses)<br>• **B (peso 30)**: Vacina HPV em meninas de 9 a 14 anos<br>• **C (peso 30)**: Consulta de saúde sexual e reprodutiva de 14 a 69 anos (últimos 12 meses)<br>• **D (peso 20)**: Mamografia de rastreamento de 50 a 69 anos (últimos 24 meses) | **Oficial (100%)** |

### 2. Bloco eSB — Equipes de Saúde Bucal (B1 a B6)

| Cód. | ID | Indicador | Fórmula Parametrizada | Situação |
| :---: | :---: | :--- | :--- | :---: |
| **B1** | 10 | Escovação dentária supervisionada | Pessoas de 6 a 14 anos com ação coletiva de escovação dental supervisionada (`0101020031`) / Pessoas de 6 a 14 anos atendidas $\times 100$ | Calculado |
| **B2** | 11 | Primeira consulta odontológica programada | Pessoas com 1ª consulta odontológica programada (`0301010153`) / Atendimentos odontológicos $\times 100$ | Calculado |
| **B3** | 12 | Tratamento odontológico concluído | Pessoas com conduta de tratamento concluído (`st_conduta_tratamento_concluid = 1`) / Atendimentos odontológicos $\times 100$ | Calculado |
| **B4** | 13 | Tratamento restaurador atraumático (ART) | Restaurações por técnica atraumática (`0307010074`) / Total de restaurações $\times 100$ | Calculado |
| **B5** | 14 | Procedimentos odontológicos preventivos | Pessoas com procedimentos preventivos (flúor, selante, profilaxia, higiene) / Atendimentos odontológicos $\times 100$ | Calculado |
| **B6** | 15 | Taxa de exodontias realizadas | Pessoas com exodontia (`0414%` ou remoção de dente) / Atendimentos odontológicos $\times 100$ *(sentido inverso)* | Calculado |

### 3. Bloco eMulti — Equipes Multiprofissionais (M1 e M2)

| Cód. | ID | Indicador | Situação |
| :---: | :---: | :--- | :---: |
| **M1** | 1 | Ações interprofissionais realizadas pela eMulti | Aguardando liberação e confirmação de fórmula oficial |
| **M2** | 2 | Média de atendimentos por pessoa assistida pela eMulti | Aguardando liberação e confirmação de fórmula oficial |

---

## Faixas de Desempenho e Metas

- **Padrão Geral (C2 a C7, B1 a B6)**:
  - **Ótimo**: $> 75\%$
  - **Bom**: $> 50\%$ e $\le 75\%$
  - **Suficiente**: $> 25\%$ e $\le 50\%$
  - **Regular**: $\le 25\%$
- **Regra Exclusiva do Indicador C1 (Mais Acesso à APS)**:
  - **Ótimo**: $> 50\%$ e $\le 70\%$ *(faixa ideal do Ministério da Saúde para equilíbrio entre oferta programada e acolhimento)*
  - **Bom**: $> 30\%$ e $\le 50\%$
  - **Suficiente**: $> 10\%$ e $\le 30\%$
  - **Regular**: $\le 10\%$ ou $> 70\%$ *(acima de 70% indica estrangulamento da demanda espontânea)*

---

## Fontes de Dados (Schema DW do e-SUS APS)

As consultas SQL operam sobre o schema `public` do banco PostgreSQL local do e-SUS APS:

| Identificador da Fonte | Tabelas Principais do DW | Finalidade |
|---|---|---|
| `demandaAcesso` | `tb_fat_atendimento_individual`, `tb_dim_tipo_atendimento`, `tb_dim_cbo` | Mapeamento dos tipos de demanda 1 e 2 (programada) vs 3 a 6 (espontânea) para o **C1**. |
| `listagemDesenvolvimento` | `tb_fat_cidadao_pec`, `tb_fat_atendimento_individual`, `tb_fat_visita_domiciliar`, `tb_fat_vacinacao_vacina` | Crianças com até 2 anos de idade, consultas, antropometria, visitas de ACS e vacinas (**C2**). |
| `listagemGestante` | `tb_fat_rel_op_gestante`, `tb_fat_atendimento_individual`, `tb_fat_visita_domiciliar` | Acompanhamento do pré-natal e puerpério: idade gestacional, PA, peso/altura, visitas e testes rápidos (**C3**). |
| `listagemDiabetes` | `tb_fat_atd_ind_problemas`, `tb_fat_cad_individual`, `tb_fat_proced_atend_proced`, `tb_fat_atd_ind_exames` | Pessoas com diabetes, consultas semestrais, PA, glicada (`ABEX008`), visitas de ACS e pé diabético (`0301040095`) (**C4**). |
| `listagemHipertensao` | `tb_fat_atd_ind_problemas`, `tb_fat_cad_individual`, `tb_fat_atendimento_individual`, `tb_fat_visita_domiciliar` | Pessoas com hipertensão, consultas semestrais, PA semestral, peso/altura e visitas de ACS (**C5**). |
| `listagemIdosa` | `tb_fat_cidadao_pec`, `tb_fat_atendimento_individual`, `tb_fat_visita_domiciliar`, `tb_fat_vacinacao_vacina` | Pessoas idosas (60+ anos), consulta anual, peso/altura, visitas de ACS e vacina da gripe (**C6**). |
| `listagemSaudeMulher` | `tb_fat_cidadao_pec`, `tb_fat_proced_atend_proced`, `tb_fat_atd_ind_procedimentos`, `tb_fat_vacinacao_vacina` | Mulheres vinculadas com rastreamento citopatológico (`ABPG010`/`0201020033`), mamografia (`0204030030`/`0204030188`), vacina HPV e saúde sexual (**C7**). |
| `listagemSaudeBucal` | `tb_fat_atendimento_odonto`, `tb_fat_atend_odonto_proced`, `tb_dim_procedimento` | Procedimentos odontológicos individuais para os indicadores **B1 a B6**. |
| `unidades` | `tb_dim_unidade_saude`, `tb_cidadao_vinculacao_equipe`, `tb_fat_cidadao_pec` | Base de unidades de saúde e vínculos de cidadãos. |
| `equipes` | `tb_dim_equipe`, `tb_unidade_saude` | Cadastro de equipes ativas com resolução INE $\leftrightarrow$ CNES. |

---

## Estrutura do Projeto

```
dashboard/
├── config.json          # Configuração de conexão com o PostgreSQL, porta e período padrão
├── server.js            # Servidor HTTP nativo (API REST, sessões com RBAC e arquivos estáticos)
├── src/
│   ├── auth.js          # Controle de acesso baseado em papéis (RBAC) com 12 categorias oficiais do e-SUS
│   ├── banco.js         # Pool pg, parse de JDBC, reconexão sem restart e testes de conexão
│   ├── fontes.js        # Consultas SQL otimizadas sobre o schema DW do e-SUS APS
│   ├── indicadores.js   # Regras ministeriais, pesos oficiais, cálculo e faixas (C1–C7, B1–B6, M1–M2)
│   ├── decisao.js       # Motor de apoio à decisão: ISF, deltas quadrimestrais e prioridades clínicas
│   ├── planoAcao.js     # Gerenciamento e persistência dos planos de ação da equipe (ciclo PDCA)
│   ├── avaliar.js       # Orquestração da apuração municipal, ranking, deltas e detalhamento
│   └── demo.js          # Gerador de dados fictícios para validação de interface sem banco
├── data/
│   └── planos_acao.json # Base de dados dos planos de ação pactuados pelas equipes
├── public/
│   ├── index.html       # Interface principal (Painel Executivo, Apoio à Decisão, Ranking, Evolução e Planos)
│   ├── login.html       # Tela de login moderna com seleção rápida de categoria e usuário
│   ├── admin.html       # Tela de configuração e teste de conexão do PostgreSQL
│   ├── app.js           # Lógica do painel em 5 abas, busca ativa, detalhamento e exportação CSV
│   ├── login.js         # Lógica da tela de login e preenchimento automático
│   ├── admin.js         # Lógica da tela administrativa
│   ├── styles.css       # Folha de estilos completa do painel reestruturado
│   ├── login.css        # Estilos modernos da tela de login
│   └── admin.css        # Estilos da interface de administração
└── documentos/          # Notas Metodológicas Oficiais do Ministério da Saúde (PDFs C1 a C7)
```

---

## Perfis de Acesso e Controle de Escopo (RBAC)

O sistema mapeia os usuários diretamente da base PostgreSQL do e-SUS APS em 12 categorias oficiais:

1. **Administrador da Instalação**: Administradores municipais e técnicos de infraestrutura com acesso pleno e controle de configurações.
2. **Coordenador**: Coordenadores de UBS, CEO, atenção domiciliar e coordenação geral da APS.
3. **Gestor Municipal / Estadual / Federal**: Visão municipal consolidada de todas as UBS, rankings, comparativos e auditoria completa.
4. **Médicos**: Foco no bloco eSF/eAP (C1–C7), prioridades clínicas e busca ativa nominal restrita à equipe (LGPD).
5. **Enfermeiros**: Atenção ao pré-natal, citopatológico, hipertensão, diabetes e busca ativa da equipe (LGPD).
6. **Cirurgiões Dentistas**: Foco no bloco de Saúde Bucal (B1–B6), ações coletivas de escovação supervisionada e lista bucal restrita.
7. **Auxiliares de Enfermagem e de Saúde Bucal**: Visualização operacional de procedimentos, pré-consultas e apoio em saúde bucal.
8. **Técnicos de Enfermagem e de Saúde Bucal**: Procedimentos técnicos, imunização, aferição de PA e hemoglobina glicada.
9. **Outros Profissionais de Nivel Superior**: Equipes eMulti (psicólogos, assistentes sociais, fisioterapeutas, farmacêuticos, nutricionistas).
10. **Agente Comunitário de Saúde (ACS)**: Destaque para cumprimento de visitas domiciliares com intervalo de 30 dias e busca ativa no território.
11. **Agente de Combate a Endemias (ACE)**: Vigilância territorial, visitas e ações integradas de combate a endemias.
12. **Profissional da Recepção**: Acompanhamento do acolhimento à demanda espontânea e agendamentos.

*Senha padrão inicial para todos os usuários cadastrados:* `Senha@2026`.

---

## As 5 Abas de Trabalho

1. **📊 Painel Executivo**: Cards do ISF Geral (0.0 a 10.0), ISF por bloco, resumo de faixas e grid completo com deltas temporais e barra segmentada por unidade.
2. **🎯 Apoio à Decisão**: Respostas estruturadas às 6 perguntas de gestão com fatos medidos, gargalos clínicos e intervenções imediatas recomendadas.
3. **⚖️ Comparação & Ranking**: Classificação territorial de desempenho entre as 49 unidades e equipes (INE).
4. **📈 Evolução Quadrimestral**: Quadro analítico de tendências comparando competências (ex: Q1 vs Q2 vs Q3).
5. **📋 Plano de Ação da Equipe**: Módulo interativo para acompanhamento de intervenções pactuadas, responsáveis e prazos.

---

## Endpoints da API

| Rota | Método | Descrição |
|---|---|---|
| `/` | GET | Interface web principal |
| `/login.html` | GET | Tela de autenticação por perfil |
| `/admin.html` | GET | Painel de administração do banco (restrito a gestores) |
| `/api/auth/categorias` | GET | Lista as 12 categorias de usuários com contagens reais |
| `/api/auth/usuarios` | GET | Lista os profissionais do banco filtrados por categoria ou busca |
| `/api/auth/login` | POST | Autentica o usuário e cria a sessão segura em cookie HTTP-only |
| `/api/auth/sessao` | GET | Informações do usuário logado e permissões de escopo |
| `/api/auth/logout` | POST | Encerra a sessão ativa |
| `/api/status` | GET | Estado da conexão com o PostgreSQL e período apurado |
| `/api/unidades` | GET | Lista de unidades de saúde autorizadas para o usuário |
| `/api/avaliar` | POST | Avaliação completa dos 15 indicadores, ISF, deltas, prioridades e análise de decisão |
| `/api/detalhe` | POST | Detalhamento técnico com boas práticas e lista nominal protegida por LGPD |
| `/api/plano-acao` | GET/POST/DELETE | CRUD dos planos de ação de melhoria contínua da equipe |
| `/api/banco/testar` | POST | Testa conectividade com parâmetros de banco |
| `/api/banco/salvar` | POST | Atualiza `config.json` e restabelece a conexão sem reiniciar o Node.js |

---

## Configuração (`config.json`)

```json
{
  "host": "0.0.0.0",
  "porta": 8088,
  "periodo": {
    "inicio": "2026-01-01",
    "fim": "2026-10-13"
  },
  "periodoUnidade": "MES",
  "maxPaginas": 10,
  "tamanhoPagina": 500,
  "banco": {
    "url": "jdbc:postgresql://localhost:5433/esus",
    "host": "localhost",
    "porta": "5433",
    "database": "esus",
    "usuario": "esus_leitura",
    "senha": "********",
    "ssl": false
  }
}
```

---

## Licença e Uso

Uso interno para gestão técnica e qualificação dos registros da Atenção Primária à Saúde no e-SUS APS.
