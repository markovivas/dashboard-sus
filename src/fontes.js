'use strict';

const banco = require('./banco');

const PERIODO_PADRAO = { inicio: null, fim: null };

function periodo(ctx) {
  return ctx.periodo || PERIODO_PADRAO;
}

function classePorErro(e) {
  const msg = String((e && e.message) || e);
  if (/ECONNREFUSED|ETIMEDOUT|ENOTFOUND|password authentication|Senha|senha inválida|does not exist|Acesso negado/i.test(msg)) {
    if (/does not exist/i.test(msg)) return 'entrada_invalida';
    if (/password authentication|senha/i.test(msg)) return 'sem_acesso';
    return 'erro';
  }
  return 'erro';
}

function erroFonte(id, descricao, e) {
  return { id, descricao, status: classePorErro(e), detalhe: String((e && e.message) || e), dados: null };
}

// ---------------------------------------------------------------------------
// Pessoas vinculadas: base comum usada por quase todos os indicadores
// ---------------------------------------------------------------------------
const SQL_BASE_VINCULADOS = `
  select
    vc.co_cidadao                                        as cidadao_id,
    fp.co_seq_fat_cidadao_pec                            as fat_id,
    coalesce(fp.no_cidadao, c.no_cidadao)                as nome,
    to_char(tn.dt_registro, 'YYYY-MM-DD')                as nascimento,
    vc.nu_ine                                            as ine,
    vc.nu_cnes                                           as cnes,
    du.co_seq_dim_unidade_saude                          as unidade_id,
    du.no_unidade_saude                                  as unidade_nome,
    du.nu_cnes                                           as unidade_cnes,
    du.no_bairro                                         as unidade_bairro
  from tb_cidadao_vinculacao_equipe vc
  join tb_cidadao c  on c.co_seq_cidadao = vc.co_cidadao
  left join tb_fat_cidadao_pec fp on fp.co_cidadao = vc.co_cidadao and fp.st_faleceu <> 1
  left join tb_dim_tempo tn on tn.co_seq_dim_tempo = fp.co_dim_tempo_nascimento
  left join tb_dim_unidade_saude du on du.co_seq_dim_unidade_saude = fp.co_dim_unidade_saude_vinc
  where coalesce(vc.st_saida_cadastro_obito, 0) <> 1
    and coalesce(fp.st_faleceu, 0) <> 1
`;

// Ponte INE -> CNES: tb_dim_equipe não tem unidade; o caminho é a tabela transacional
const SQL_UNIDADE_DA_EQUIPE = `
  left join tb_equipe te on te.nu_ine = de.nu_ine
  left join tb_unidade_saude tu on tu.co_seq_unidade_saude = te.co_unidade_saude
  left join tb_dim_unidade_saude du on du.nu_cnes = tu.nu_cnes
`;

// Últimos atendimentos por pessoa (médico/enfermagem/odonto/dom)
const SQL_ULTIMOS_ATEND = `
  select
    p.co_fat_cidadao_pec,
    max(case when c.ds_filtro ilike 'MÉDIC%' or c.nu_cbo like '22%'
              then t.dt_registro end) as ult_medico,
    max(case when c.ds_filtro ilike 'ENFERMEIR%' or c.nu_cbo like '21%'
              then t.dt_registro end) as ult_enfermagem,
    max(t.dt_registro)                as ult_atendimento
  from tb_fat_atendimento_individual p
  join tb_dim_tempo t on t.co_seq_dim_tempo = p.co_dim_tempo
  left join tb_dim_cbo c on c.co_seq_dim_cbo = p.co_dim_cbo_1
  where p.co_fat_cidadao_pec is not null
  group by 1
`;

const SQL_ULTIMO_ODONTO = `
  select
    p.co_fat_cidadao_pec,
    max(t.dt_registro) as ult_odonto
  from tb_fat_atendimento_odonto p
  join tb_dim_tempo t on t.co_seq_dim_tempo = p.co_dim_tempo
  where p.co_fat_cidadao_pec is not null
  group by 1
`;

const SQL_ULTIMA_VDOM = `
  select
    co_fat_cidadao_pec,
    max(dt_registro) as ult_vdom,
    count(distinct dt_registro::date) as qtd_vdom,
    case when max(dt_registro::date) - min(dt_registro::date) >= 30 and count(distinct dt_registro::date) >= 2 then 1 else 0 end as vdom_30d
  from (
    select v.co_fat_cidadao_pec, t.dt_registro
    from tb_fat_visita_domiciliar v
    join tb_dim_tempo t on t.co_seq_dim_tempo = v.co_dim_tempo
    where v.co_fat_cidadao_pec is not null and v.co_dim_desfecho_visita = 1
    UNION ALL
    select p.co_fat_cidadao_pec, t.dt_registro
    from tb_fat_atendimento_domiciliar p
    join tb_dim_tempo t on t.co_seq_dim_tempo = p.co_dim_tempo
    where p.co_fat_cidadao_pec is not null
  ) v_todas
  group by 1
`;

const SQL_ULTIMA_GLICADA = `
  left join (
    select
      coalesce(pap.co_fat_cidadao_pec, e.co_fat_cidadao_pec) as co_fat_cidadao_pec,
      max(t.dt_registro) as ult_glicada
    from tb_dim_procedimento dp
    left join tb_fat_atd_ind_procedimentos pap on (pap.co_dim_procedimento_avaliado = dp.co_seq_dim_procedimento or pap.co_dim_procedimento_solicitado = dp.co_seq_dim_procedimento)
    left join tb_fat_atd_ind_exames e on e.co_dim_procedimento = dp.co_seq_dim_procedimento
    join tb_dim_tempo t on t.co_seq_dim_tempo = coalesce(pap.co_dim_tempo, e.co_dim_tempo)
    where dp.co_proced in ('0202010503', 'ABEX008') or dp.ds_proced ilike '%glicada%'
    group by 1
  ) gl on gl.co_fat_cidadao_pec = d.co_fat_cidadao_pec
`;

const SQL_VACINAS = `
  select
    v.co_fat_cidadao_pec,
    max(case when di.nu_identificador in ('33', '44', '77') or di.no_imunobiologico ilike '%influenza%' then t.dt_registro end) as ult_influenza,
    max(case when di.nu_identificador in ('67', '93') or di.no_imunobiologico ilike '%hpv%' then t.dt_registro end) as ult_hpv,
    max(case when di.nu_identificador = '57' or di.no_imunobiologico ilike '%dtpa%' then t.dt_registro end) as ult_dtpa,
    max(case when di.nu_identificador in ('42', '29', '43') then t.dt_registro end) as ult_penta
  from tb_fat_vacinacao_vacina vv
  join tb_fat_vacinacao v on v.co_seq_fat_vacinacao = vv.co_fat_vacinacao
  join tb_dim_tempo t on t.co_seq_dim_tempo = coalesce(vv.co_dim_tempo_vacina_aplicada, vv.co_dim_tempo, v.co_dim_tempo)
  join tb_dim_imunobiologico di on di.co_seq_dim_imunobiologico = vv.co_dim_imunobiologico
  where v.co_fat_cidadao_pec is not null
  group by 1
`;

async function pessoasVinculadas(ctx) {
  const p = periodo(ctx);
  const sql = `
    with vinc as (${SQL_BASE_VINCULADOS}),
         atd as (${SQL_ULTIMOS_ATEND}),
         odo as (${SQL_ULTIMO_ODONTO}),
         vdm as (${SQL_ULTIMA_VDOM}),
         peso as (
           select distinct on (p.co_fat_cidadao_pec) p.co_fat_cidadao_pec,
                  p.nu_peso, p.nu_altura, t.dt_registro as dt_medicao
           from tb_fat_atendimento_individual p
           join tb_dim_tempo t on t.co_seq_dim_tempo = p.co_dim_tempo
           where p.co_fat_cidadao_pec is not null and (p.nu_peso is not null or p.nu_altura is not null)
           order by p.co_fat_cidadao_pec, t.dt_registro desc
         )
    select
      v.cidadao_id,
      v.nome,
      v.nascimento,
      v.ine,
      v.cnes,
      v.unidade_id,
      v.unidade_nome,
      v.unidade_cnes,
      v.unidade_bairro,
      to_char(a.ult_medico,      'YYYY-MM-DD') as data_ult_medico,
      to_char(a.ult_enfermagem,  'YYYY-MM-DD') as data_ult_enfermagem,
      to_char(o.ult_odonto,      'YYYY-MM-DD') as data_ult_odonto,
      to_char(d.ult_vdom,        'YYYY-MM-DD') as data_ult_vdom,
      to_char(a.ult_atendimento, 'YYYY-MM-DD') as data_ult_atendimento,
      pe.nu_peso,
      pe.nu_altura,
      to_char(pe.dt_medicao, 'YYYY-MM-DD') as data_medicao
    from vinc v
    left join atd a on a.co_fat_cidadao_pec = coalesce(v.fat_id, v.cidadao_id)
    left join odo o on o.co_fat_cidadao_pec = coalesce(v.fat_id, v.cidadao_id)
    left join vdm d on d.co_fat_cidadao_pec = coalesce(v.fat_id, v.cidadao_id)
    left join peso pe on pe.co_fat_cidadao_pec = coalesce(v.fat_id, v.cidadao_id)
    where (:inicio::date is null or coalesce(a.ult_atendimento, o.ult_odonto) >= :inicio::date)
  `;
  const linhas = await banco.consultar(sql, { inicio: p.inicio });
  return linhas;
}

function paraLinha(r) {
  return {
    cidadaoId: r.cidadao_id,
    nomeCidadao: r.nome,
    dataNascimentoCidadao: r.nascimento,
    equipe: r.ine || null,
    microarea: r.cnes || null,
    unidadeId: r.unidade_id || null,
    unidade: r.unidade_nome || null,
    unidadeCnes: r.unidade_cnes || null,
    unidadeBairro: r.unidade_bairro || null,
    dataUltimoAtendimentoMedico: r.data_ult_medico,
    dataUltimoAtendimentoEnfermagem: r.data_ult_enfermagem,
    dataUltimoAtendimentoOdontologico: r.data_ult_odonto,
    dataUltimaVisitaDomiciliar: r.data_ult_vdom,
    ultimaMedicaoPeso: r.nu_peso,
    ultimaMedicaoAltura: r.nu_altura,
    dataUltimaMedicaoPesoAltura: r.data_medicao
  };
}

// ---------------------------------------------------------------------------
// Pessoas com condição (CID) — diabetes, hipertensão, desenvolvimento etc.
// ---------------------------------------------------------------------------
function sqlPorCid(prefixo) {
  return `
    with diagnosticados as (
      select distinct p.co_fat_cidadao_pec
      from tb_fat_atd_ind_problemas p
      join tb_dim_cid c on c.co_seq_dim_cid = p.co_dim_cid
      where c.nu_cid ~ '${prefixo}'
        and p.co_fat_cidadao_pec is not null
        and coalesce(p.co_dim_situacao_problema, 1) <> 0
    )
  `;
}

// ---------------------------------------------------------------------------
// Fontes
// ---------------------------------------------------------------------------
const FONTES = {
  vinculados: {
    descricao: 'Pessoas vinculadas às equipes',
    buscar: async (ctx) => {
      try {
        const linhas = (await pessoasVinculadas(ctx)).map(paraLinha);
        return {
          id: 'vinculados',
          descricao: 'Pessoas vinculadas às equipes',
          status: linhas.length ? 'ok' : 'sem_dados',
          detalhe: linhas.length ? null : 'nenhuma pessoa vinculada no período',
          dados: { linhas, total: linhas.length, truncado: false }
        };
      } catch (e) {
        return erroFonte('vinculados', 'Pessoas vinculadas às equipes', e);
      }
    }
  },

  equipes: {
    descricao: 'Equipes cadastradas',
    buscar: async () => {
      try {
        const linhas = await banco.consultar(`
          select de.co_seq_dim_equipe as id, de.no_equipe as nome, de.nu_ine as ine,
                 du.co_seq_dim_unidade_saude as unidade_id,
                 du.no_unidade_saude         as unidade_nome,
                 du.nu_cnes                  as unidade_cnes
          from tb_dim_equipe de
          ${SQL_UNIDADE_DA_EQUIPE}
          where coalesce(de.st_registro_valido, 1) <> 0
          order by de.no_equipe
        `);
        return {
          id: 'equipes',
          descricao: 'Equipes cadastradas',
          status: linhas.length ? 'ok' : 'sem_dados',
          detalhe: null,
          dados: { linhas, total: linhas.length, truncado: false }
        };
      } catch (e) {
        return erroFonte('equipes', 'Equipes cadastradas', e);
      }
    }
  },

  emulti: {
    descricao: 'Equipes eMulti',
    buscar: async () => {
      try {
        const linhas = await banco.consultar(`
          select de.co_seq_dim_equipe as id, de.no_equipe as nome, de.nu_ine as ine,
                 du.co_seq_dim_unidade_saude as unidade_id,
                 du.no_unidade_saude         as unidade_nome,
                 du.nu_cnes                  as unidade_cnes
          from tb_dim_equipe de
          ${SQL_UNIDADE_DA_EQUIPE}
          where de.no_equipe ilike '%emulti%' or de.no_equipe ilike '%e-multi%'
             or de.ds_filtro ilike '%emulti%'
          order by de.no_equipe
        `);
        return {
          id: 'emulti',
          descricao: 'Equipes eMulti',
          status: 'ok',
          detalhe: linhas.length ? null : 'nenhuma equipe eMulti localizada pelo nome',
          dados: { linhas, total: linhas.length, truncado: false }
        };
      } catch (e) {
        return erroFonte('emulti', 'Equipes eMulti', e);
      }
    }
  },

  unidades: {
    descricao: 'Unidades de saúde com população vinculada',
    buscar: async () => {
      try {
        const linhas = await banco.consultar(`
          select du.co_seq_dim_unidade_saude as id,
                 du.nu_cnes,
                 du.no_unidade_saude,
                 du.no_bairro,
                 count(distinct vc.co_cidadao)::int as pessoas
          from tb_cidadao_vinculacao_equipe vc
          left join tb_dim_unidade_saude du on du.nu_cnes = vc.nu_cnes
          where coalesce(vc.st_saida_cadastro_obito, 0) <> 1
          group by 1, 2, 3, 4
          order by pessoas desc, du.no_unidade_saude
        `);
        // bucket sintético para quem não tem unidade resolvida — mantém os totais coerentes
        const totalGeral = linhas.reduce((s, l) => s + (l.pessoas || 0), 0);
        const semVinculo = await banco.um(`
          select count(distinct vc.co_cidadao)::int as pessoas
          from tb_cidadao_vinculacao_equipe vc
          left join tb_fat_cidadao_pec fp on fp.co_cidadao = vc.co_cidadao and fp.st_faleceu <> 1
          left join tb_dim_unidade_saude du on du.co_seq_dim_unidade_saude = fp.co_dim_unidade_saude_vinc
          where coalesce(vc.st_saida_cadastro_obito, 0) <> 1
            and coalesce(fp.st_faleceu, 0) <> 1
            and du.co_seq_dim_unidade_saude is null
        `).catch(() => ({ pessoas: 0 }));

        const mapeado = linhas
          .filter((l) => l.id !== null && l.id !== undefined)
          .map((l) => ({
            id: l.id,
            cnes: l.nu_cnes,
            nome: l.no_unidade_saude,
            bairro: l.no_bairro,
            pessoas: l.pessoas
          }));

        const buckets = semVinculo && semVinculo.pessoas
          ? [{ id: 'sem_unidade', cnes: null, nome: 'Não vinculada', bairro: null, pessoas: semVinculo.pessoas }]
          : [];

        return {
          id: 'unidades',
          descricao: 'Unidades de saúde com população vinculada',
          status: mapeado.length ? 'ok' : 'sem_dados',
          detalhe: mapeado.length ? null : 'nenhuma unidade com população vinculada',
          dados: {
            linhas: [...mapeado, ...buckets],
            total: mapeado.length,
            totalPessoas: totalGeral + (semVinculo && semVinculo.pessoas ? semVinculo.pessoas : 0),
            truncado: false
          }
        };
      } catch (e) {
        return erroFonte('unidades', 'Unidades de saúde', e);
      }
    }
  },

  // ---- condições clínicas (diagnóstico por CID, CIAP e Cadastro Individual) --
  listagemDiabetes: condicao('listagemDiabetes', 'Pessoas com diabetes (CID E10–E14, CIAP T89–T90 ou Cadastro ACS)', {
    regex: 'E1[0-4]',
    ciaps: ['T89', 'T90'],
    cadField: 'fci.st_diabete',
    peDiabetico: true,
    pa: true,
    glicada: true
  }),
  listagemHipertensao: condicao('listagemHipertensao', 'Pessoas com hipertensão (CID I10–I15, CIAP K86–K87 ou Cadastro ACS)', {
    regex: 'I1[0-5]',
    ciaps: ['K86', 'K87'],
    cadField: 'fci.st_hipertensao_arterial',
    pa: true
  }),

  listagemGeral: {
    descricao: 'Listagem geral de pessoas vinculadas',
    buscar: async (ctx) => {
      try {
        const linhas = (await pessoasVinculadas(ctx)).map(paraLinha);
        return {
          id: 'listagemGeral',
          descricao: 'Listagem geral de pessoas vinculadas',
          status: linhas.length ? 'ok' : 'sem_dados',
          detalhe: null,
          dados: { linhas, total: linhas.length, truncado: false }
        };
      } catch (e) {
        return erroFonte('listagemGeral', 'Listagem geral de pessoas vinculadas', e);
      }
    }
  },

  demandaAcesso: {
    descricao: 'Mais acesso à APS — demanda programada vs total (C1)',
    buscar: async (ctx) => {
      try {
        const p = periodo(ctx);
        const linhas = await banco.consultar(`
          select
            coalesce(fp.co_dim_unidade_saude_vinc, a.co_dim_unidade_saude_1) as unidade_id,
            du.no_unidade_saude                                              as unidade_nome,
            du.nu_cnes                                                       as unidade_cnes,
            de.nu_ine                                                        as ine,
            de.no_equipe                                                     as equipe,
            sum(case when dta.nu_identificador in ('1', '2') then 1 else 0 end)::int as programada,
            sum(case when dta.nu_identificador in ('3', '4', '5', '6') then 1 else 0 end)::int as espontanea,
            count(*)::int                                                    as total
          from tb_fat_atendimento_individual a
          join tb_dim_tempo t on t.co_seq_dim_tempo = a.co_dim_tempo
          join tb_dim_tipo_atendimento dta on dta.co_seq_dim_tipo_atendimento = a.co_dim_tipo_atendimento
          left join tb_dim_equipe de on de.co_seq_dim_equipe = a.co_dim_equipe_1
          left join tb_fat_cidadao_pec fp on fp.co_seq_fat_cidadao_pec = a.co_fat_cidadao_pec
          left join tb_dim_unidade_saude du on du.co_seq_dim_unidade_saude = coalesce(fp.co_dim_unidade_saude_vinc, a.co_dim_unidade_saude_1)
          left join tb_dim_cbo c on c.co_seq_dim_cbo = a.co_dim_cbo_1
          where (:inicio::date is null or t.dt_registro >= :inicio::date)
            and (:fim::date   is null or t.dt_registro <= :fim::date)
            and dta.nu_identificador in ('1', '2', '3', '4', '5', '6')
            and (c.ds_filtro ilike 'MÉDIC%' or c.ds_filtro ilike 'ENFERMEIR%' or c.nu_cbo like '22%')
          group by 1, 2, 3, 4, 5
          order by total desc
        `, { inicio: p.inicio, fim: p.fim });

        const totalGeral = linhas.reduce((s, l) => s + (l.total || 0), 0);
        return {
          id: 'demandaAcesso',
          descricao: 'Mais acesso à APS — demanda programada vs total (C1)',
          status: totalGeral > 0 ? 'ok' : 'sem_dados',
          detalhe: null,
          dados: {
            linhas,
            total: totalGeral,
            truncado: false
          }
        };
      } catch (e) {
        return erroFonte('demandaAcesso', 'Mais acesso à APS (C1)', e);
      }
    }
  },

  listagemGestante: {
    descricao: 'Cuidado na gestação e puerpério (C3)',
    buscar: async (ctx) => {
      try {
        const p = periodo(ctx);
        const linhas = await banco.consultar(`
          select
            fp.co_cidadao                                     as cidadao_id,
            fp.no_cidadao                                     as nome,
            to_char(tn.dt_registro, 'YYYY-MM-DD')             as nascimento,
            to_char(g.dt_inicio_gestacao, 'YYYY-MM-DD')       as inicio_gestacao,
            to_char(g.dt_inicio_puerperio, 'YYYY-MM-DD')      as inicio_puerperio,
            to_char(g.dt_fim_puerperio, 'YYYY-MM-DD')         as fim_puerperio,
            to_char(g.dt_ultima_fai_pre_natal, 'YYYY-MM-DD')  as ultima_consulta_pre_natal,
            to_char(g.dt_fai_puerperio, 'YYYY-MM-DD')         as ultima_consulta_puerperio,
            to_char(g.dt_fvd_ultimo, 'YYYY-MM-DD')            as ultima_visita_domiciliar,
            to_char(g.dt_fao_ultimo, 'YYYY-MM-DD')            as ultima_consulta_odonto,
            g.nu_idade_gestacional                            as idade_gestacional_1a_consulta,
            coalesce(g.co_gestacao, 0)                        as qtd_consultas,
            coalesce(g.co_peso, 0)                            as qtd_peso_altura,
            (
              select count(*)::int
              from tb_fat_atendimento_individual a
              join tb_dim_tempo t on t.co_seq_dim_tempo = a.co_dim_tempo
              where a.co_fat_cidadao_pec = g.co_fat_cidadao_pec
                and (a.nu_pressao_sistolica is not null or a.nu_pressao_diastolica is not null)
                and (g.dt_inicio_gestacao is null or t.dt_registro >= g.dt_inicio_gestacao)
                and (g.dt_fim_puerperio is null or t.dt_registro <= g.dt_fim_puerperio)
            )                                                 as qtd_pa,
            (
              select count(*)::int
              from tb_fat_visita_domiciliar vd
              join tb_dim_tempo t on t.co_seq_dim_tempo = vd.co_dim_tempo
              where vd.co_fat_cidadao_pec = g.co_fat_cidadao_pec
                and vd.co_dim_desfecho_visita = 1
                and (g.dt_inicio_gestacao is null or t.dt_registro >= g.dt_inicio_gestacao)
                and (g.dt_inicio_puerperio is null or t.dt_registro < g.dt_inicio_puerperio)
            )                                                 as qtd_vdom_gestacao,
            (
              select count(*)::int
              from tb_fat_visita_domiciliar vd
              join tb_dim_tempo t on t.co_seq_dim_tempo = vd.co_dim_tempo
              where vd.co_fat_cidadao_pec = g.co_fat_cidadao_pec
                and vd.co_dim_desfecho_visita = 1
                and (g.dt_inicio_puerperio is not null and t.dt_registro >= g.dt_inicio_puerperio)
                and (g.dt_fim_puerperio is null or t.dt_registro <= g.dt_fim_puerperio)
            )                                                 as qtd_vdom_puerperio,
            g.st_solicitacao_vdrl                             as solicitacao_vdrl,
            g.st_avaliacao_vdrl                               as avaliacao_vdrl,
            (select max(pn.st_alto_risco)
               from tb_pre_natal pn
               join tb_prontuario pr on pr.co_seq_prontuario = pn.co_prontuario
              where pr.co_cidadao = fp.co_cidadao)                as alto_risco,
            g.st_ultima_vacina_em_dia                         as vacina_em_dia,
            vc.nu_ine                                         as ine,
            du.co_seq_dim_unidade_saude                       as unidade_id,
            du.no_unidade_saude                               as unidade_nome,
            du.nu_cnes                                        as unidade_cnes,
            du.no_bairro                                      as unidade_bairro
          from tb_fat_rel_op_gestante g
          join tb_fat_cidadao_pec fp on fp.co_seq_fat_cidadao_pec = g.co_fat_cidadao_pec
          left join tb_cidadao_vinculacao_equipe vc on vc.co_cidadao = fp.co_cidadao
          left join tb_dim_tempo tn on tn.co_seq_dim_tempo = fp.co_dim_tempo_nascimento
          left join tb_dim_unidade_saude du on du.co_seq_dim_unidade_saude = fp.co_dim_unidade_saude_vinc
          where (g.dt_inicio_gestacao is null or g.dt_inicio_gestacao >= :inicio::date)
            and (g.dt_inicio_gestacao is null or g.dt_inicio_gestacao <= :fim::date)
            and coalesce(fp.st_faleceu, 0) <> 1
          order by fp.no_cidadao
        `, { inicio: p.inicio, fim: p.fim });

        const mapeado = linhas.map((r) => ({
          cidadaoId: r.cidadao_id,
          nomeCidadao: r.nome,
          dataNascimentoCidadao: r.nascimento,
          equipe: r.ine || null,
          unidadeId: r.unidade_id || null,
          unidade: r.unidade_nome || null,
          unidadeCnes: r.unidade_cnes || null,
          unidadeBairro: r.unidade_bairro || null,
          inicioGestacao: r.inicio_gestacao,
          inicioPuerperio: r.inicio_puerperio,
          fimPuerperio: r.fim_puerperio,
          idadeGestacionalPrimeiraConsulta: r.idade_gestacional_1a_consulta,
          dataUltimoAtendimentoMedico: r.ultima_consulta_pre_natal,
          dataUltimoAtendimentoEnfermagem: r.ultima_consulta_puerperio,
          dataUltimaVisitaDomiciliar: r.ultima_visita_domiciliar,
          dataUltimoAtendimentoOdontologico: r.ultima_consulta_odonto,
          qtdConsultas: Number(r.qtd_consultas) || 0,
          qtdAfericoesPa: Number(r.qtd_pa) || 0,
          qtdMedicoesPesoAltura: Number(r.qtd_peso_altura) || 0,
          qtdVisitasAcsGestacao: Number(r.qtd_vdom_gestacao) || 0,
          qtdVisitasAcsPuerperio: Number(r.qtd_vdom_puerperio) || 0,
          solicitacaoVdrl: Number(r.solicitacao_vdrl) === 1,
          avaliacaoVdrl: Number(r.avaliacao_vdrl) === 1,
          altoRisco: r.alto_risco,
          vacinaEmDia: Number(r.vacina_em_dia) === 1
        }));
        return {
          id: 'listagemGestante',
          descricao: 'Cuidado na gestação e puerpério (C3)',
          status: mapeado.length ? 'ok' : 'sem_dados',
          detalhe: null,
          dados: { linhas: mapeado, total: mapeado.length, truncado: false }
        };
      } catch (e) {
        return erroFonte('listagemGestante', 'Gestantes e puérperas (C3)', e);
      }
    }
  },

  listagemIdosa: {
    descricao: 'Pessoas idosas — 60 anos ou mais (C6)',
    buscar: async (ctx) => {
      try {
        const p = periodo(ctx);
        const linhas = await banco.consultar(`
          with vinc as (${SQL_BASE_VINCULADOS}),
               atd as (${SQL_ULTIMOS_ATEND}),
               vdm as (${SQL_ULTIMA_VDOM}),
               vac as (${SQL_VACINAS}),
               peso as (
                 select distinct on (p.co_fat_cidadao_pec) p.co_fat_cidadao_pec,
                        p.nu_peso, p.nu_altura, t.dt_registro as dt_medicao
                 from tb_fat_atendimento_individual p
                 join tb_dim_tempo t on t.co_seq_dim_tempo = p.co_dim_tempo
                 where p.co_fat_cidadao_pec is not null and (p.nu_peso is not null or p.nu_altura is not null)
                 order by p.co_fat_cidadao_pec, t.dt_registro desc
               )
          select
            v.cidadao_id,
            v.nome,
            v.nascimento,
            v.ine,
            v.cnes,
            v.unidade_id,
            v.unidade_nome,
            v.unidade_cnes,
            v.unidade_bairro,
            to_char(a.ult_medico,      'YYYY-MM-DD') as data_ult_medico,
            to_char(a.ult_enfermagem,  'YYYY-MM-DD') as data_ult_enfermagem,
            to_char(d.ult_vdom,        'YYYY-MM-DD') as data_ult_vdom,
            d.vdom_30d,
            d.qtd_vdom,
            to_char(vc.ult_influenza,  'YYYY-MM-DD') as data_ult_influenza,
            pe.nu_peso,
            pe.nu_altura,
            to_char(pe.dt_medicao,     'YYYY-MM-DD') as data_medicao
          from vinc v
          left join atd a on a.co_fat_cidadao_pec = coalesce(v.fat_id, v.cidadao_id)
          left join vdm d on d.co_fat_cidadao_pec = coalesce(v.fat_id, v.cidadao_id)
          left join vac vc on vc.co_fat_cidadao_pec = coalesce(v.fat_id, v.cidadao_id)
          left join peso pe on pe.co_fat_cidadao_pec = coalesce(v.fat_id, v.cidadao_id)
          where v.nascimento is not null
            and age(coalesce(:fim::date, current_date), v.nascimento::date) >= '60 years'::interval
          order by v.nome
        `, { fim: p.fim });

        const mapeado = linhas.map((r) => ({
          cidadaoId: r.cidadao_id,
          nomeCidadao: r.nome,
          dataNascimentoCidadao: r.nascimento,
          equipe: r.ine || null,
          unidadeId: r.unidade_id || null,
          unidade: r.unidade_nome || null,
          unidadeCnes: r.unidade_cnes || null,
          unidadeBairro: r.unidade_bairro || null,
          dataUltimoAtendimentoMedico: r.data_ult_medico,
          dataUltimoAtendimentoEnfermagem: r.data_ult_enfermagem,
          dataUltimaVisitaDomiciliar: r.data_ult_vdom,
          visitasAcs30d: Number(r.vdom_30d) === 1,
          qtdVisitasAcs: Number(r.qtd_vdom) || 0,
          dataUltimaVacinaInfluenza: r.data_ult_influenza || null,
          ultimaMedicaoPeso: r.nu_peso,
          ultimaMedicaoAltura: r.nu_altura,
          dataUltimaMedicaoPesoAltura: r.data_medicao
        }));

        return {
          id: 'listagemIdosa',
          descricao: 'Pessoas idosas — 60 anos ou mais (C6)',
          status: mapeado.length ? 'ok' : 'sem_dados',
          detalhe: null,
          dados: { linhas: mapeado, total: mapeado.length, truncado: false }
        };
      } catch (e) {
        return erroFonte('listagemIdosa', 'Pessoas idosas (C6)', e);
      }
    }
  },

  listagemDesenvolvimento: {
    descricao: 'Cuidado no desenvolvimento infantil — até 2 anos (C2)',
    buscar: async (ctx) => {
      try {
        const p = periodo(ctx);
        const linhas = await banco.consultar(`
          with vinc as (${SQL_BASE_VINCULADOS}),
               atd as (
                 select 
                   p.co_fat_cidadao_pec,
                   min(t.dt_registro) as dt_primeira_consulta,
                   count(distinct p.co_seq_fat_atd_ind) as qtd_consultas,
                   count(distinct case when p.nu_peso is not null and p.nu_altura is not null then t.dt_registro::date end) as qtd_peso_altura,
                   max(case when c.ds_filtro ilike 'MÉDIC%' or c.nu_cbo like '22%' then t.dt_registro end) as ult_medico,
                   max(case when c.ds_filtro ilike 'ENFERMEIR%' or c.nu_cbo like '21%' then t.dt_registro end) as ult_enfermagem
                 from tb_fat_atendimento_individual p
                 join tb_dim_tempo t on t.co_seq_dim_tempo = p.co_dim_tempo
                 left join tb_dim_cbo c on c.co_seq_dim_cbo = p.co_dim_cbo_1
                 where p.co_fat_cidadao_pec is not null
                 group by 1
               ),
               vdm as (${SQL_ULTIMA_VDOM}),
               vac as (${SQL_VACINAS}),
               peso as (
                 select distinct on (p.co_fat_cidadao_pec) p.co_fat_cidadao_pec,
                        p.nu_peso, p.nu_altura, t.dt_registro as dt_medicao
                 from tb_fat_atendimento_individual p
                 join tb_dim_tempo t on t.co_seq_dim_tempo = p.co_dim_tempo
                 where p.co_fat_cidadao_pec is not null and (p.nu_peso is not null or p.nu_altura is not null)
                 order by p.co_fat_cidadao_pec, t.dt_registro desc
               )
          select
            v.cidadao_id,
            v.nome,
            v.nascimento,
            v.ine,
            v.unidade_id,
            v.unidade_nome,
            v.unidade_cnes,
            v.unidade_bairro,
            to_char(a.dt_primeira_consulta, 'YYYY-MM-DD') as dt_primeira_consulta,
            coalesce(a.qtd_consultas, 0)::int             as qtd_consultas,
            coalesce(a.qtd_peso_altura, 0)::int           as qtd_peso_altura,
            to_char(a.ult_medico,      'YYYY-MM-DD')      as data_ult_medico,
            to_char(a.ult_enfermagem,  'YYYY-MM-DD')      as data_ult_enfermagem,
            to_char(d.ult_vdom,        'YYYY-MM-DD')      as data_ult_vdom,
            d.qtd_vdom,
            d.vdom_30d,
            to_char(vc.ult_penta,      'YYYY-MM-DD')      as data_ult_vacina,
            pe.nu_peso,
            pe.nu_altura,
            to_char(pe.dt_medicao,     'YYYY-MM-DD')      as data_medicao
          from vinc v
          left join atd a on a.co_fat_cidadao_pec = coalesce(v.fat_id, v.cidadao_id)
          left join vdm d on d.co_fat_cidadao_pec = coalesce(v.fat_id, v.cidadao_id)
          left join vac vc on vc.co_fat_cidadao_pec = coalesce(v.fat_id, v.cidadao_id)
          left join peso pe on pe.co_fat_cidadao_pec = coalesce(v.fat_id, v.cidadao_id)
          where v.nascimento is not null
            and age(coalesce(:fim::date, current_date), v.nascimento::date) <= '2 years'::interval
          order by v.nome
        `, { fim: p.fim });

        const mapeado = linhas.map((r) => {
          let consulta30d = false;
          if (r.nascimento && r.dt_primeira_consulta) {
            const dn = new Date(r.nascimento);
            const dc = new Date(r.dt_primeira_consulta);
            const diffDias = (dc - dn) / (24 * 3600 * 1000);
            consulta30d = diffDias >= 0 && diffDias <= 30;
          }
          return {
            cidadaoId: r.cidadao_id,
            nomeCidadao: r.nome,
            dataNascimentoCidadao: r.nascimento,
            equipe: r.ine || null,
            unidadeId: r.unidade_id || null,
            unidade: r.unidade_nome || null,
            unidadeCnes: r.unidade_cnes || null,
            unidadeBairro: r.unidade_bairro || null,
            dataPrimeiraConsulta: r.dt_primeira_consulta,
            primeiraConsulta30d: consulta30d,
            qtdConsultas: r.qtd_consultas,
            qtdPesoAltura: r.qtd_peso_altura,
            dataUltimoAtendimentoMedico: r.data_ult_medico,
            dataUltimoAtendimentoEnfermagem: r.data_ult_enfermagem,
            dataUltimaVisitaDomiciliar: r.data_ult_vdom,
            qtdVisitasAcs: Number(r.qtd_vdom) || 0,
            visitasAcs30d: Number(r.vdom_30d) === 1,
            dataUltimaVacina: r.data_ult_vacina || null,
            ultimaMedicaoPeso: r.nu_peso,
            ultimaMedicaoAltura: r.nu_altura,
            dataUltimaMedicaoPesoAltura: r.data_medicao
          };
        });

        return {
          id: 'listagemDesenvolvimento',
          descricao: 'Cuidado no desenvolvimento infantil — até 2 anos (C2)',
          status: mapeado.length ? 'ok' : 'sem_dados',
          detalhe: null,
          dados: { linhas: mapeado, total: mapeado.length, truncado: false }
        };
      } catch (e) {
        return erroFonte('listagemDesenvolvimento', 'Desenvolvimento infantil (C2)', e);
      }
    }
  },

  listagemSaudeMulher: {
    descricao: 'Cuidado da mulher na prevenção do câncer (C7)',
    buscar: async (ctx) => {
      try {
        const p = periodo(ctx);
        const linhas = await banco.consultar(`
          with mulheres as (
            select 
              fp.co_seq_fat_cidadao_pec as cidadao_id,
              fp.no_cidadao             as nome,
              to_char(tn.dt_registro, 'YYYY-MM-DD') as nascimento,
              vc.nu_ine                 as ine,
              du.co_seq_dim_unidade_saude as unidade_id,
              du.no_unidade_saude       as unidade_nome,
              du.nu_cnes                as unidade_cnes,
              du.no_bairro              as unidade_bairro
            from tb_cidadao_vinculacao_equipe vc
            join tb_fat_cidadao_pec fp on fp.co_cidadao = vc.co_cidadao and coalesce(fp.st_faleceu, 0) <> 1
            join tb_dim_tempo tn on tn.co_seq_dim_tempo = fp.co_dim_tempo_nascimento
            left join tb_dim_unidade_saude du on du.co_seq_dim_unidade_saude = fp.co_dim_unidade_saude_vinc
            left join tb_dim_sexo s on s.co_seq_dim_sexo = fp.co_dim_sexo
            where coalesce(vc.st_saida_cadastro_obito, 0) <> 1
              and (s.ds_sexo ilike 'fem%' or s.nu_identificador = 'F')
          ),
          cit as (
            select pap.co_fat_cidadao_pec, max(t.dt_registro) as ult_cit
            from tb_fat_proced_atend_proced pap
            join tb_dim_procedimento dp on dp.co_seq_dim_procedimento = pap.co_dim_procedimento
            join tb_dim_tempo t on t.co_seq_dim_tempo = pap.co_dim_tempo
            where dp.co_proced in ('0201020033', '0203010086', '0203010019', 'ABPG010')
            group by 1
          ),
          mam as (
            select pap.co_fat_cidadao_pec, max(t.dt_registro) as ult_mam
            from tb_fat_atd_ind_procedimentos pap
            join tb_dim_procedimento dp on dp.co_seq_dim_procedimento = coalesce(pap.co_dim_procedimento_avaliado, pap.co_dim_procedimento_solicitado)
            join tb_dim_tempo t on t.co_seq_dim_tempo = pap.co_dim_tempo
            where dp.co_proced in ('0204030030', '0204030188')
            group by 1
          ),
          hpv as (
            select v.co_fat_cidadao_pec, max(t.dt_registro) as ult_hpv
            from tb_fat_vacinacao_vacina vv
            join tb_fat_vacinacao v on v.co_seq_fat_vacinacao = vv.co_fat_vacinacao
            join tb_dim_imunobiologico di on di.co_seq_dim_imunobiologico = vv.co_dim_imunobiologico
            join tb_dim_tempo t on t.co_seq_dim_tempo = coalesce(vv.co_dim_tempo_vacina_aplicada, vv.co_dim_tempo, v.co_dim_tempo)
            where di.nu_identificador in ('67', '93')
            group by 1
          ),
          ssr as (
            select a.co_fat_cidadao_pec, max(t.dt_registro) as ult_ssr
            from tb_fat_atendimento_individual a
            join tb_dim_tempo t on t.co_seq_dim_tempo = a.co_dim_tempo
            where a.co_fat_cidadao_pec is not null
            group by 1
          )
          select 
            m.cidadao_id,
            m.nome,
            m.nascimento,
            m.ine,
            m.unidade_id,
            m.unidade_nome,
            m.unidade_cnes,
            m.unidade_bairro,
            to_char(c.ult_cit,  'YYYY-MM-DD') as data_ult_cit,
            to_char(h.ult_hpv,  'YYYY-MM-DD') as data_ult_hpv,
            to_char(s.ult_ssr,  'YYYY-MM-DD') as data_ult_ssr,
            to_char(ma.ult_mam, 'YYYY-MM-DD') as data_ult_mam
          from mulheres m
          left join cit c on c.co_fat_cidadao_pec = m.cidadao_id
          left join hpv h on h.co_fat_cidadao_pec = m.cidadao_id
          left join ssr s on s.co_fat_cidadao_pec = m.cidadao_id
          left join mam ma on ma.co_fat_cidadao_pec = m.cidadao_id
          order by m.nome
        `);

        const mapeado = linhas.map((r) => ({
          cidadaoId: r.cidadao_id,
          nomeCidadao: r.nome,
          dataNascimentoCidadao: r.nascimento,
          equipe: r.ine || null,
          unidadeId: r.unidade_id || null,
          unidade: r.unidade_nome || null,
          unidadeCnes: r.unidade_cnes || null,
          unidadeBairro: r.unidade_bairro || null,
          dataUltimoCitopatologico: r.data_ult_cit || null,
          dataUltimaVacinaHpv: r.data_ult_hpv || null,
          dataUltimoAtendimentoSaudeSexual: r.data_ult_ssr || null,
          dataUltimaMamografia: r.data_ult_mam || null
        }));

        return {
          id: 'listagemSaudeMulher',
          descricao: 'Cuidado da mulher na prevenção do câncer (C7)',
          status: mapeado.length ? 'ok' : 'sem_dados',
          detalhe: null,
          dados: { linhas: mapeado, total: mapeado.length, truncado: false }
        };
      } catch (e) {
        return erroFonte('listagemSaudeMulher', 'Saúde da mulher (C7)', e);
      }
    }
  },

  listagemSaudeBucal: {
    descricao: 'Atendimentos odontológicos',
    buscar: async (ctx) => {
      try {
        const p = periodo(ctx);
        const linhas = await banco.consultar(`
          select
            o.co_fat_cidadao_pec                                 as cidadao_id,
            fp.no_cidadao                                        as nome,
            to_char(tn.dt_registro, 'YYYY-MM-DD')                as nascimento,
            count(distinct o.co_seq_fat_atd_odnt)::int           as atendimentos,
            max(t.dt_registro)::date                             as ultimo_atendimento,
            max(case when o.st_conduta_tratamento_concluid = 1
                     then 1 else 0 end)::int                     as tratamento_concluido,
            count(distinct o.co_seq_fat_atd_odnt)
              filter (where tp.co_proced = '0301010153')::int    as primeira_consulta_programada,
            count(distinct o.co_seq_fat_atd_odnt)
              filter (where tp.co_proced = '0101020031')::int    as escovacao_supervisionada,
            count(distinct o.co_seq_fat_atd_odnt)
              filter (where tp.co_proced in ('ABPO004','0101020066'))::int as selantes,
            count(distinct o.co_seq_fat_atd_odnt)
              filter (where tp.co_proced in ('ABPO005','0101020074','ABPO010','ABPO015','ABPO016','0101020023'))::int as preventivos,
            count(distinct o.co_seq_fat_atd_odnt)
              filter (where tp.ds_proced ilike 'RESTAURAÇÃO%')::int as restauracoes,
            count(distinct o.co_seq_fat_atd_odnt)
              filter (where tp.co_proced = '0307010074')::int    as restauracoes_art,
            count(distinct o.co_seq_fat_atd_odnt)
              filter (where tp.co_proced like '0414%'
                       or tp.ds_proced ilike '%EXODONTIA%'
                       or tp.ds_proced ilike 'REMOÇÃO DE DENTE%')::int as exodontias,
            vc.nu_ine                                             as ine,
            du.co_seq_dim_unidade_saude                           as unidade_id,
            du.no_unidade_saude                                   as unidade_nome,
            du.nu_cnes                                            as unidade_cnes,
            du.no_bairro                                          as unidade_bairro
          from tb_fat_atendimento_odonto o
          join tb_dim_tempo t on t.co_seq_dim_tempo = o.co_dim_tempo
          left join tb_fat_cidadao_pec fp on fp.co_seq_fat_cidadao_pec = o.co_fat_cidadao_pec
          left join tb_cidadao_vinculacao_equipe vc on vc.co_cidadao = fp.co_cidadao
          left join tb_dim_tempo tn on tn.co_seq_dim_tempo = fp.co_dim_tempo_nascimento
          left join tb_dim_unidade_saude du on du.co_seq_dim_unidade_saude = fp.co_dim_unidade_saude_vinc
          left join tb_fat_atend_odonto_proced op on op.co_fat_atd_odnt = o.co_seq_fat_atd_odnt
          left join tb_dim_procedimento tp on tp.co_seq_dim_procedimento = op.co_dim_procedimento
          where o.co_fat_cidadao_pec is not null
            and (:inicio::date is null or t.dt_registro >= :inicio::date)
            and (:fim::date   is null or t.dt_registro <= :fim::date)
          group by 1, 2, 3, vc.nu_ine, du.co_seq_dim_unidade_saude, du.no_unidade_saude, du.nu_cnes, du.no_bairro
        `, { inicio: p.inicio, fim: p.fim });

        const mapeado = linhas.map((r) => ({
          cidadaoId: r.cidadao_id,
          nomeCidadao: r.nome,
          dataNascimentoCidadao: r.nascimento,
          equipe: r.ine || null,
          unidadeId: r.unidade_id || null,
          unidade: r.unidade_nome || null,
          unidadeCnes: r.unidade_cnes || null,
          unidadeBairro: r.unidade_bairro || null,
          atendimentos: r.atendimentos,
          dataUltimoAtendimentoOdontologico: r.ultimo_atendimento,
          tratamentoConcluido: r.tratamento_concluido,
          primeiraConsultaProgramada: r.primeira_consulta_programada,
          escovacaoSupervisionada: r.escovacao_supervisionada,
          selantes: r.selantes,
          procedimentosPreventivos: r.preventivos,
          restauracoes: r.restauracoes,
          restauracoesArt: r.restauracoes_art,
          exodontias: r.exodontias
        }));
        return {
          id: 'listagemSaudeBucal',
          descricao: 'Atendimentos odontológicos',
          status: mapeado.length ? 'ok' : 'sem_dados',
          detalhe: null,
          dados: { linhas: mapeado, total: mapeado.length, truncado: false }
        };
      } catch (e) {
        return erroFonte('listagemSaudeBucal', 'Atendimentos odontológicos', e);
      }
    }
  },

  absenteismos: {
    descricao: 'Absenteísmo (atendimentos por equipe)',
    buscar: async (ctx) => {
      try {
        const p = periodo(ctx);
        const linhas = await banco.consultar(`
          select
            de.no_equipe                                       as equipe,
            du.co_seq_dim_unidade_saude                        as unidade_id,
            du.no_unidade_saude                                as unidade_nome,
            count(*)::int                                      as atendimentos,
            count(distinct a.co_fat_cidadao_pec)::int          as pessoas
          from tb_fat_atendimento_individual a
          join tb_dim_tempo t on t.co_seq_dim_tempo = a.co_dim_tempo
          left join tb_dim_equipe de on de.co_seq_dim_equipe = a.co_dim_equipe_1
          ${SQL_UNIDADE_DA_EQUIPE}
          where (:inicio::date is null or t.dt_registro >= :inicio::date)
            and (:fim::date   is null or t.dt_registro <= :fim::date)
          group by 1, 2, 3
          order by 5 desc
        `, { inicio: p.inicio, fim: p.fim });
        return {
          id: 'absenteismos',
          descricao: 'Absenteísmo (atendimentos por equipe)',
          status: linhas.length ? 'ok' : 'sem_dados',
          detalhe: null,
          dados: { linhas, total: linhas.length, truncado: false }
        };
      } catch (e) {
        return erroFonte('absenteismos', 'Absenteísmo', e);
      }
    }
  },

  atendimentos: {
    descricao: 'Atendimentos individuais no período',
    buscar: async (ctx) => {
      try {
        const p = periodo(ctx);
        // uma linha por unidade de vínculo — permite filtro e comparação sem nova consulta
        const linhas = await banco.consultar(`
          select
            fp.co_dim_unidade_saude_vinc                         as unidade_id,
            du.no_unidade_saude                                  as unidade_nome,
            count(*)::int                                        as total,
            count(distinct a.co_fat_cidadao_pec)::int            as pessoas,
            min(t.dt_registro)::date                             as primeiro,
            max(t.dt_registro)::date                             as ultimo
          from tb_fat_atendimento_individual a
          join tb_dim_tempo t on t.co_seq_dim_tempo = a.co_dim_tempo
          left join tb_fat_cidadao_pec fp on fp.co_seq_fat_cidadao_pec = a.co_fat_cidadao_pec
          left join tb_dim_unidade_saude du on du.co_seq_dim_unidade_saude = fp.co_dim_unidade_saude_vinc
          where (:inicio::date is null or t.dt_registro >= :inicio::date)
            and (:fim::date   is null or t.dt_registro <= :fim::date)
          group by 1, 2
          order by 3 desc
        `, { inicio: p.inicio, fim: p.fim });
        const total = linhas.reduce((s, l) => s + (l.total || 0), 0);
        return {
          id: 'atendimentos',
          descricao: 'Atendimentos individuais no período',
          status: total > 0 ? 'ok' : 'sem_dados',
          detalhe: null,
          dados: {
            linhas,
            total,
            pessoas: linhas.reduce((s, l) => s + (l.pessoas || 0), 0),
            truncado: false
          }
        };
      } catch (e) {
        return erroFonte('atendimentos', 'Atendimentos individuais', e);
      }
    }
  }
};

// Último exame do pé diabético (03.01.04.009-5) por pessoa no período
const SQL_PE_DIABETICO = `
  left join (
    select pp.co_fat_cidadao_pec, max(tt.dt_registro) as ult_pe_diabetico
    from tb_fat_proced_atend_proced pp
    join tb_dim_tempo tt on tt.co_seq_dim_tempo = pp.co_dim_tempo
    join tb_dim_procedimento dp on dp.co_seq_dim_procedimento = pp.co_dim_procedimento
    where dp.co_proced = '0301040095'
      and pp.co_fat_cidadao_pec is not null
      and (:inicio::date is null or tt.dt_registro >= :inicio::date)
      and (:fim::date   is null or tt.dt_registro <= :fim::date)
    group by 1
  ) pd on pd.co_fat_cidadao_pec = d.co_fat_cidadao_pec
`;

// Helper: fonte por condição clínica (CID-10, CIAP-2 e Cadastro Individual)
function condicao(id, descricao, configCondicao, opcoesLegadas = {}) {
  const cfg = typeof configCondicao === 'string'
    ? { regex: configCondicao, ...opcoesLegadas }
    : { ...configCondicao, ...opcoesLegadas };

  const regex = cfg.regex;
  const ciaps = cfg.ciaps || [];
  const ciapSql = ciaps.length ? ciaps.map((c) => `'${c}'`).join(',') : "''";
  const cadField = cfg.cadField;
  const comPeDiabetico = !!cfg.peDiabetico;
  const comPA = !!cfg.pa;
  const comGlicada = !!cfg.glicada;

  return {
    descricao,
    buscar: async (ctx) => {
      try {
        const p = periodo(ctx);
        const sql = `
          with diagnosticados as (
            select distinct p.co_fat_cidadao_pec
            from tb_fat_atd_ind_problemas p
            left join tb_dim_cid c on c.co_seq_dim_cid = p.co_dim_cid
            left join tb_dim_ciap ci on ci.co_seq_dim_ciap = p.co_dim_ciap
            where (c.nu_cid ~ '${regex}' or ci.nu_ciap in (${ciapSql}))
              and p.co_fat_cidadao_pec is not null
              and coalesce(p.co_dim_situacao_problema, 1) <> 0
            ${cadField ? `
            UNION
            select distinct coalesce(fp.co_seq_fat_cidadao_pec, fci.co_fat_cidadao_pec) as co_fat_cidadao_pec
            from tb_fat_cad_individual fci
            left join tb_fat_cidadao_pec fp on fp.co_seq_fat_cidadao_pec = fci.co_fat_cidadao_pec or fp.co_cidadao = fci.co_fat_cidadao_pec
            where ${cadField} = 1
              and coalesce(fp.co_seq_fat_cidadao_pec, fci.co_fat_cidadao_pec) is not null
            ` : ''}
          )
          select
            d.co_fat_cidadao_pec                                  as cidadao_id,
            fp.no_cidadao                                         as nome,
            to_char(tn.dt_registro, 'YYYY-MM-DD')                 as nascimento,
            to_char(a.ult_medico,     'YYYY-MM-DD')               as data_ult_medico,
            to_char(a.ult_enfermagem, 'YYYY-MM-DD')               as data_ult_enfermagem,
            to_char(o.ult_odonto,     'YYYY-MM-DD')               as data_ult_odonto,
            to_char(v.ult_vdom,       'YYYY-MM-DD')               as data_ult_vdom,
            v.qtd_vdom,
            v.vdom_30d,
            pe.nu_peso, pe.nu_altura,
            to_char(pe.dt_medicao, 'YYYY-MM-DD')                  as data_medicao,
            ${comPA ? `
            pa.pressao_arterial,
            pa.dt_pa as data_pa,
            ` : ''}
            ${comGlicada ? `
            to_char(gl.ult_glicada, 'YYYY-MM-DD') as data_glicada,
            ` : ''}
            coalesce(
              (select string_agg(distinct coalesce(nullif(c.nu_cid, '-'), ci.nu_ciap), ', ')
                 from tb_fat_atd_ind_problemas pp
                 left join tb_dim_cid c on c.co_seq_dim_cid = pp.co_dim_cid
                 left join tb_dim_ciap ci on ci.co_seq_dim_ciap = pp.co_dim_ciap
                where pp.co_fat_cidadao_pec = d.co_fat_cidadao_pec
                  and (c.nu_cid ~ '${regex}' or ci.nu_ciap in (${ciapSql}))),
              'Cadastro Individual (ACS)'
            )                                                     as cids,
            vc.nu_ine                                             as ine,
            du.co_seq_dim_unidade_saude                           as unidade_id,
            du.no_unidade_saude                                   as unidade_nome,
            du.nu_cnes                                            as unidade_cnes,
            du.no_bairro                                          as unidade_bairro${comPeDiabetico ? `,
            to_char(pd.ult_pe_diabetico, 'YYYY-MM-DD')            as data_pe_diabetico` : ''}
          from diagnosticados d
          join tb_fat_cidadao_pec fp on fp.co_seq_fat_cidadao_pec = d.co_fat_cidadao_pec
          left join tb_cidadao_vinculacao_equipe vc on vc.co_cidadao = fp.co_cidadao
          left join tb_dim_unidade_saude du on du.co_seq_dim_unidade_saude = fp.co_dim_unidade_saude_vinc
          left join tb_dim_tempo tn on tn.co_seq_dim_tempo = fp.co_dim_tempo_nascimento
          left join (${SQL_ULTIMOS_ATEND}) a on a.co_fat_cidadao_pec = d.co_fat_cidadao_pec
          left join (${SQL_ULTIMO_ODONTO}) o on o.co_fat_cidadao_pec = d.co_fat_cidadao_pec
          left join (${SQL_ULTIMA_VDOM})  v on v.co_fat_cidadao_pec = d.co_fat_cidadao_pec${comPeDiabetico ? SQL_PE_DIABETICO : ''}${comGlicada ? SQL_ULTIMA_GLICADA : ''}
          left join (
            select distinct on (co_fat_cidadao_pec) co_fat_cidadao_pec,
                   nu_peso, nu_altura, t.dt_registro as dt_medicao
            from tb_fat_atendimento_individual p
            join tb_dim_tempo t on t.co_seq_dim_tempo = p.co_dim_tempo
            where p.co_fat_cidadao_pec is not null and (p.nu_peso is not null or p.nu_altura is not null)
            order by co_fat_cidadao_pec, t.dt_registro desc
          ) pe on pe.co_fat_cidadao_pec = d.co_fat_cidadao_pec
          ${comPA ? `
          left join (
            select distinct on (co_fat_cidadao_pec) co_fat_cidadao_pec,
                   case when nu_pressao_sistolica is not null and nu_pressao_diastolica is not null
                        then concat(nu_pressao_sistolica::text, '/', nu_pressao_diastolica::text)
                        else coalesce(nu_pressao_sistolica::text, nu_pressao_diastolica::text) end as pressao_arterial,
                   to_char(t.dt_registro, 'YYYY-MM-DD') as dt_pa
            from tb_fat_atendimento_individual p
            join tb_dim_tempo t on t.co_seq_dim_tempo = p.co_dim_tempo
            where p.co_fat_cidadao_pec is not null and (p.nu_pressao_sistolica is not null or p.nu_pressao_diastolica is not null)
            order by co_fat_cidadao_pec, t.dt_registro desc
          ) pa on pa.co_fat_cidadao_pec = d.co_fat_cidadao_pec
          ` : ''}
          where coalesce(fp.st_faleceu, 0) <> 1
          order by fp.no_cidadao
        `;
        const brutas = await banco.consultar(sql, { inicio: p.inicio, fim: p.fim });
        const linhas = brutas.map((r) => ({
          cidadaoId: r.cidadao_id,
          nomeCidadao: r.nome,
          dataNascimentoCidadao: r.nascimento,
          equipe: r.ine || null,
          unidadeId: r.unidade_id || null,
          unidade: r.unidade_nome || null,
          unidadeCnes: r.unidade_cnes || null,
          unidadeBairro: r.unidade_bairro || null,
          dataUltimoAtendimentoMedico: r.data_ult_medico,
          dataUltimoAtendimentoEnfermagem: r.data_ult_enfermagem,
          dataUltimoAtendimentoOdontologico: r.data_ult_odonto,
          dataUltimaVisitaDomiciliar: r.data_ult_vdom,
          visitasAcs30d: Number(r.vdom_30d) === 1,
          qtdVisitasAcs: Number(r.qtd_vdom) || 0,
          ultimaMedicaoPeso: r.nu_peso,
          ultimaMedicaoAltura: r.nu_altura,
          dataUltimaMedicaoPesoAltura: r.data_medicao,
          ultimaMedicaoPressaoArterial: r.pressao_arterial || null,
          dataUltimaMedicaoPressaoArterial: r.data_pa || null,
          dataUltimoPeDiabetico: r.data_pe_diabetico || null,
          dataUltimaHemoglobinaGlicada: r.data_glicada || null,
          cids: r.cids
        }));
        return {
          id,
          descricao,
          status: linhas.length ? 'ok' : 'sem_dados',
          detalhe: linhas.length ? null : 'nenhum diagnóstico registrado no período',
          dados: { linhas, total: linhas.length, truncado: false }
        };
      } catch (e) {
        return erroFonte(id, descricao, e);
      }
    }
  };
}

async function executarTodas(ctx) {
  const permitidos = ctx && Array.isArray(ctx.apenas) ? new Set(ctx.apenas) : null;
  const ids = Object.keys(FONTES).filter((id) => !permitidos || permitidos.has(id));
  const resultados = await Promise.all(
    ids.map(async (id) => {
      try {
        return await FONTES[id].buscar(ctx);
      } catch (e) {
        return erroFonte(id, FONTES[id].descricao, e);
      }
    })
  );
  const mapa = {};
  for (const r of resultados) mapa[r.id] = r;
  return mapa;
}

module.exports = { FONTES, executarTodas, paraLinha };
