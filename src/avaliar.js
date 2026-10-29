'use strict';

const { executarTodas } = require('./fontes');
const { INDICADORES, avaliarIndicadores, avaliarPorUnidade, filtrarPorUnidade, filtrarPorEquipe, detalheIndicador } = require('./indicadores');
const { calcularPeriodoAnterior, calcularISF, gerarPrioridadesClinicas, gerarAnaliseDecisao } = require('./decisao');

function normalizarUnidade(params) {
  const bruto = params && params.unidade;
  if (bruto === undefined || bruto === null || bruto === '' || bruto === 'todas') return null;
  return bruto;
}

function normalizarEquipe(params) {
  const bruto = params && params.equipe;
  if (bruto === undefined || bruto === null || bruto === '' || bruto === 'todas') return null;
  return bruto;
}

function normalizarPeriodo(params, config) {
  const p = params && params.periodo;
  if (p && p.inicio && p.fim) {
    return {
      inicio: String(p.inicio).trim(),
      fim: String(p.fim).trim()
    };
  }
  return config && config.periodo ? { ...config.periodo } : { inicio: null, fim: null };
}

function montarContexto(config, params) {
  const unidade = normalizarUnidade(params);
  const equipe = normalizarEquipe(params);
  const periodo = normalizarPeriodo(params, config);
  const ref = (periodo && periodo.fim)
    ? new Date(periodo.fim + 'T23:59:59')
    : new Date();

  return {
    periodo,
    periodoUnidade: config.periodoUnidade,
    tamanhoPagina: config.tamanhoPagina,
    maxPaginas: config.maxPaginas,
    unidade,
    equipe,
    comparar: !!(params && params.comparar),
    ref: isNaN(ref.getTime()) ? new Date() : ref
  };
}

function fontesNecessarias() {
  const ids = new Set();
  for (const ind of INDICADORES) for (const f of ind.fontes) ids.add(f);
  return [...ids];
}

function listaUnidades(mapa) {
  const f = mapa.unidades;
  if (!f || !f.dados || !Array.isArray(f.dados.linhas)) return [];
  return f.dados.linhas.map((l) => ({
    id: l.id,
    nome: l.nome,
    cnes: l.cnes,
    bairro: l.bairro,
    pessoas: l.pessoas
  }));
}

async function executar(config, params) {
  const ctx = montarContexto(config, params);
  const mapa = await executarTodas(ctx);
  const ids = fontesNecessarias();

  const fontes = {};
  for (const id of ids) {
    fontes[id] =
      mapa[id] || { id, descricao: 'fonte não encontrada', status: 'erro', detalhe: id, dados: null };
  }
  // fontes extras úteis para diagnóstico
  for (const id of Object.keys(mapa)) if (!fontes[id]) fontes[id] = mapa[id];

  const unidades = listaUnidades(mapa);
  let fontesFiltradas = ctx.unidade ? filtrarPorUnidade(fontes, ctx.unidade) : fontes;
  if (ctx.equipe) {
    fontesFiltradas = filtrarPorEquipe(fontesFiltradas, ctx.equipe);
  }
  const indicadores = avaliarIndicadores(fontesFiltradas, ctx);

  // Cálculo do ISF e indicadores por bloco
  const isf = calcularISF(indicadores);

  // Diagnóstico clínico e prioridades de ação imediata
  const prioridadesClinicas = gerarPrioridadesClinicas(fontesFiltradas, ctx, indicadores);

  // Cálculo de tendência em relação ao período anterior (se aplicável)
  let deltas = null;
  if (params && params.compararPeriodoAnterior && ctx.periodo && ctx.periodo.inicio && ctx.periodo.fim) {
    const periodoAnt = calcularPeriodoAnterior(ctx.periodo);
    if (periodoAnt) {
      try {
        const ctxAnt = { ...ctx, periodo: periodoAnt };
        const mapaAnt = await executarTodas(ctxAnt);
        let fontesAnt = ctx.unidade ? filtrarPorUnidade(mapaAnt, ctx.unidade) : mapaAnt;
        if (ctx.equipe) fontesAnt = filtrarPorEquipe(fontesAnt, ctx.equipe);
        const indicadoresAnt = avaliarIndicadores(fontesAnt, ctxAnt);
        const isfAnt = calcularISF(indicadoresAnt);

        const mapaValoresAnt = new Map();
        for (const ia of indicadoresAnt) {
          mapaValoresAnt.set(ia.id, ia);
        }

        for (const ind of indicadores) {
          const ia = mapaValoresAnt.get(ind.id);
          if (ia && ia.valor !== null && ind.valor !== null) {
            const d = Math.round((ind.valor - ia.valor) * 10) / 10;
            ind.valorAnterior = ia.valor;
            ind.faixaAnterior = ia.faixa;
            ind.delta = d;
            ind.tendencia = d > 0.5 ? 'subiu' : d < -0.5 ? 'desceu' : 'estavel';
          } else if (ia && ia.valor !== null) {
            ind.valorAnterior = ia.valor;
            ind.faixaAnterior = ia.faixa;
          }
        }

        deltas = {
          periodoAnterior: periodoAnt,
          periodoAnteriorRotulo: periodoAnt.rotulo,
          isfAnterior: isfAnt.nota10,
          deltaIsf: (isf.nota10 !== null && isfAnt.nota10 !== null)
            ? Math.round((isf.nota10 - isfAnt.nota10) * 100) / 100
            : null
        };
      } catch (e) {
        console.error('Erro ao calcular período anterior:', e);
      }
    }
  }

  // Análise estruturada de apoio à tomada de decisão (respostas às 6 perguntas)
  const analiseDecisao = gerarAnaliseDecisao(indicadores, isf, prioridadesClinicas, deltas, ctx);

  // comparacao sempre calculada: alimenta a barra segmentada por unidade nos cards
  const comparacao = unidades.length ? avaliarPorUnidade(fontes, unidades, ctx) : null;

  const fontesParaResumo = fontesFiltradas;
  const resumo = Object.values(fontesParaResumo).map((f) => ({
    id: f.id,
    descricao: f.descricao,
    status: f.status,
    detalhe: f.detalhe,
    registros: f.dados && f.dados.total !== undefined && f.dados.total !== null
      ? f.dados.total
      : f.dados && f.dados.linhas
        ? f.dados.linhas.length
        : null,
    truncado: f.dados && f.dados.truncado ? true : false
  }));

  const diagnostico = {
    fonte: 'banco_dados',
    periodo: ctx.periodo,
    unidade: ctx.unidade,
    totalFontes: resumo.length,
    fontesOk: resumo.filter((f) => f.status === 'ok').length,
    fontesSemAcesso: resumo.filter((f) => f.status === 'sem_acesso').length
  };

  return {
    geradoEm: new Date().toISOString(),
    contexto: ctx,
    unidades,
    comparacao,
    fontes: resumo,
    indicadores,
    isf,
    prioridadesClinicas,
    analiseDecisao,
    deltas,
    diagnostico
  };
}

async function detalhar(config, params) {
  const id = Number(params && params.indicador);
  const ind = INDICADORES.find((i) => i.id === id);
  if (!ind) return { erro: 'indicador não encontrado' };

  const ctx = montarContexto(config, params);
  // só as fontes do indicador + equipes (nomes do ranking)
  const ids = [...new Set([...ind.fontes, 'equipes'])];
  const mapa = await executarTodas({ ...ctx, apenas: ids });
  const fontes = {};
  for (const fid of ids) {
    fontes[fid] = mapa[fid] || { id: fid, descricao: 'fonte não encontrada', status: 'erro', detalhe: fid, dados: null };
  }

  const r = detalheIndicador(fontes, id, ctx);

  const nomes = new Map();
  const eq = fontes.equipes;
  if (eq && eq.dados && Array.isArray(eq.dados.linhas)) {
    for (const e of eq.dados.linhas) if (e.ine) nomes.set(String(e.ine), e.nome);
  }
  const porEquipe = (r.porEquipe || []).map((e) => ({
    ...e,
    nome: e.ine ? (nomes.get(String(e.ine)) || null) : 'Sem equipe vinculada'
  }));
  const pessoas = (r.pessoas || []).map((p) => ({
    ...p,
    equipeNome: p.equipe ? (nomes.get(String(p.equipe)) || null) : null
  }));

  return {
    geradoEm: new Date().toISOString(),
    contexto: { periodo: ctx.periodo, unidade: ctx.unidade },
    ...r,
    porEquipe,
    pessoas
  };
}

module.exports = { executar, detalhar, montarContexto };
