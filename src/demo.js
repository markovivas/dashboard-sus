'use strict';

const { INDICADORES } = require('./indicadores');
const { calcularISF } = require('./decisao');

// Valores ficticios apenas para validar a interface. Nunca usados quando a fonte real responde.
const AMOSTRAS = {
  1: { numerador: 42, denominador: 3, valor: 78.5, status: 'parcial' },
  2: { numerador: 1840, denominador: 960, valor: 1.9, status: 'ok' },
  3: { numerador: 580, denominador: 1000, valor: 58.0, status: 'ok' },
  4: { numerador: 64, denominador: 180, valor: 35.6, status: 'ok' },
  5: { numerador: 96, denominador: 240, valor: 40.0, status: 'ok' },
  6: { numerador: 22, denominador: 40, valor: 55.0, status: 'ok' },
  7: { numerador: 28, denominador: 90, valor: 31.1, status: 'ok' },
  8: { numerador: 51, denominador: 210, valor: 24.3, status: 'ok' },
  9: { numerador: 33, denominador: 120, valor: 27.5, status: 'ok' },
  10: { numerador: 58, denominador: 200, valor: 29.0, status: 'ok' },
  11: { numerador: 44, denominador: 150, valor: 29.3, status: 'ok' },
  12: { numerador: 21, denominador: 90, valor: 23.3, status: 'ok' },
  13: { numerador: 12, denominador: 60, valor: 20.0, status: 'ok' },
  14: { numerador: 37, denominador: 200, valor: 18.5, status: 'ok' },
  15: { numerador: 9, denominador: 120, valor: 7.5, status: 'ok' }
};

function faixaDe(valor, ind) {
  if (valor === null || valor === undefined) return null;
  const id = typeof ind === 'object' && ind !== null ? ind.id : ind;
  if (id === 3 || id === 'C1' || id === '3') {
    if (valor > 50 && valor <= 70) return { nome: 'Ótimo', cor: 'otimo' };
    if (valor > 30 && valor <= 50) return { nome: 'Bom', cor: 'bom' };
    if (valor > 10 && valor <= 30) return { nome: 'Suficiente', cor: 'suficiente' };
    return { nome: 'Regular', cor: 'regular' };
  }
  if (valor > 75) return { nome: 'Ótimo', cor: 'otimo' };
  if (valor > 50) return { nome: 'Bom', cor: 'bom' };
  if (valor > 25) return { nome: 'Suficiente', cor: 'suficiente' };
  return { nome: 'Regular', cor: 'regular' };
}

const UNIDADES_DEMO = [
  { id: 1, cnes: '9999001', nome: 'UBS Demonstração Central', bairro: 'Centro', pessoas: 1840 },
  { id: 2, cnes: '9999002', nome: 'UBS Demonstração Norte', bairro: 'Jardim Norte', pessoas: 1120 },
  { id: 3, cnes: '9999003', nome: 'UBS Demonstração Sul', bairro: 'Vila Sul', pessoas: 760 },
  { id: 'sem_unidade', cnes: null, nome: 'Não vinculada', bairro: null, pessoas: 210 }
];

function ruido(seed) {
  let s = 0;
  for (const c of String(seed)) s = (s * 31 + c.charCodeAt(0)) % 1000;
  return ((s % 25) - 12) / 100;
}

function indicadoresDemo(base, unidade) {
  return base.map((ind) => {
    const a = AMOSTRAS[ind.id] || { numerador: 0, denominador: 1, valor: null, status: 'formula_pendente' };
    let valor = a.valor;
    if (valor !== null && unidade && unidade.id !== UNIDADES_DEMO[0].id) {
      valor = Math.max(0, Math.min(100, Math.round((valor * (1 + ruido(unidade.id + ':' + ind.id))) * 10) / 10));
    }
    return {
      ...ind,
      valor,
      numerador: valor === null ? a.numerador : Math.round((valor / 100) * (a.denominador || 0)),
      faixa: faixaDe(valor, ind.id)
    };
  });
}

function normalizarPeriodoDemo(params, config) {
  const p = params && params.periodo;
  if (p && p.inicio && p.fim) {
    return {
      inicio: String(p.inicio).trim(),
      fim: String(p.fim).trim()
    };
  }
  return config && config.periodo ? { ...config.periodo } : { inicio: null, fim: null };
}

function gerar(config, params) {
  const agora = new Date().toISOString();
  const periodo = normalizarPeriodoDemo(params, config);
  const ref = (periodo && periodo.fim) ? new Date(periodo.fim + 'T23:59:59') : new Date();
  const ctx = {
    periodo,
    periodoUnidade: config.periodoUnidade,
    tamanhoPagina: 1,
    maxPaginas: 1,
    ref: isNaN(ref.getTime()) ? new Date() : ref
  };
  const base = INDICADORES.map((ind) => {
    const a = AMOSTRAS[ind.id] || { numerador: 0, denominador: 1, valor: null, status: 'formula_pendente' };
    const praticasBase = ind.novasPraticas ? ind.novasPraticas(ctx) : [];
    const praticas = praticasBase.length
      ? praticasBase.map((p, i) => ({
          descricao: p.descricao,
          peso: p.peso,
          status: i % 3 === 2 ? 'pendente' : 'implementada',
          fonte: p.fonte || null
        }))
      : (ind.proximosPassos || []).map((passo) => ({
          descricao: passo,
          peso: null,
          status: 'pendente',
          fonte: null
        }));
    const total = praticas.length;
    const implementadas = praticas.filter((p) => p.status === 'implementada').length;
    return {
      id: ind.id,
      bloco: ind.bloco,
      titulo: ind.titulo,
      formula: ind.formula,
      formulaOficial: ind.formulaOficial || 'a_confirmar',
      estilo: ind.estilo,
      numerador: a.numerador,
      denominador: a.denominador,
      valor: a.valor,
      faixa: faixaDe(a.valor, ind.id),
      status: total && implementadas < total ? 'parcial' : a.status,
      cobertura: total ? { total, implementadas } : null,
      praticas,
      detalhe: 'valores de demonstração',
      fontes: ind.fontes,
      proximosPassos: (ind.proximosPassos || []).concat(['Confirmar fórmula na ficha técnica oficial'])
    };
  });

  const comparacao = UNIDADES_DEMO.map((u) => ({
    unidade: u,
    indicadores: indicadoresDemo(base, u)
  }));

  const isf = calcularISF(base);
  return {
    geradoEm: agora,
    demonstracao: true,
    contexto: { periodo, periodoUnidade: config.periodoUnidade },
    unidades: UNIDADES_DEMO,
    comparacao,
    fontes: [
      { id: 'demo', descricao: 'Dados de demonstração (sem leitura do banco)', status: 'ok', detalhe: 'modo demonstração', registros: null, truncado: false }
    ],
    indicadores: base,
    isf,
    prioridadesClinicas: [
      {
        id: 'c4_pe_diabetico',
        indicadorId: 4,
        indicadorCodigo: 'C4',
        indicadorTitulo: 'Cuidado da pessoa com diabetes',
        titulo: 'Realizar exame do pé diabético em diabéticos vinculados',
        descricao: 'Avaliação clínica dos pés com teste de monofilamento.',
        categoriaAcao: 'Procedimento Clínico',
        perfilAlvo: 'Médicos e Enfermeiros',
        pendentes: 116,
        total: 180,
        percentualPendente: 64.4,
        impactoPontos: '+15 pts no C4',
        prioridade: 'alta'
      },
      {
        id: 'c5_afericao_pa',
        indicadorId: 5,
        indicadorCodigo: 'C5',
        indicadorTitulo: 'Cuidado da pessoa com hipertensão',
        titulo: 'Aferir e registrar Pressão Arterial de pessoas com hipertensão',
        descricao: 'Pelo menos 1 registro de PA nos últimos 6 meses.',
        categoriaAcao: 'Procedimento Clínico',
        perfilAlvo: 'Médicos, Enfermeiros e Técnicos',
        pendentes: 144,
        total: 240,
        percentualPendente: 60.0,
        impactoPontos: '+25 pts no C5',
        prioridade: 'alta'
      },
      {
        id: 'c3_saude_bucal_gestante',
        indicadorId: 6,
        indicadorCodigo: 'C3',
        indicadorTitulo: 'Cuidado da gestante e do puerpério',
        titulo: 'Atendimento odontológico para gestantes no pré-natal',
        descricao: 'Consulta em saúde bucal durante o pré-natal.',
        categoriaAcao: 'Saúde Bucal',
        perfilAlvo: 'Cirurgiões-Dentistas',
        pendentes: 18,
        total: 40,
        percentualPendente: 45.0,
        impactoPontos: '+9 pts no C3',
        prioridade: 'alta'
      }
    ],
    analiseDecisao: {
      perguntas: [
        {
          numero: 1,
          pergunta: 'Como está o desempenho da minha equipe ou unidade?',
          respostaResumida: `Nota Sintética Final (ISF) de demonstração é ${isf.nota10 !== null ? isf.nota10.toFixed(2) : '—'} / 10.0.`
        },
        {
          numero: 2,
          pergunta: 'Quais indicadores precisam de mais atenção?',
          respostaResumida: 'Indicadores C4 (Diabetes), C5 (Hipertensão) e C7 (Mulher/Câncer) estão em faixas que demandam busca ativa.'
        },
        {
          numero: 3,
          pergunta: 'O que mudou em relação ao período anterior?',
          respostaResumida: 'Evolução estável na maioria dos indicadores.'
        },
        {
          numero: 4,
          pergunta: 'Quais fatores podem explicar o resultado?',
          respostaResumida: 'Lacunas no exame do pé diabético e aferições de PA semestrais.'
        },
        {
          numero: 5,
          pergunta: 'Quais ações práticas podem ser priorizadas?',
          respostaResumida: 'Busca ativa de 116 diabéticos sem avaliação dos pés e 144 hipertensos sem PA nos últimos 6 meses.'
        },
        {
          numero: 6,
          pergunta: 'Como acompanhar se as ações produziram melhorias?',
          respostaResumida: 'Acompanhar na aba Plano de Ação a evolução das convocações de busca ativa.'
        }
      ]
    },
    diagnostico: { fonte: 'demonstracao', periodo, totalFontes: 1, fontesOk: 1, fontesSemAcesso: 0, demonstracao: true }
  };
}

// ---------------- detalhe de um indicador (modo demonstração) ----------------

const EQUIPES_DEMO = [
  { ine: '9001000001', nome: 'eSF 01 Demonstração' },
  { ine: '9001000002', nome: 'eSF 02 Demonstração' },
  { ine: '9001000003', nome: 'eSF 03 Demonstração' },
  { ine: '9002000001', nome: 'eAP 01 Demonstração' },
  { ine: '9003000001', nome: 'eMulti Demonstração' },
  null // sem equipe
];

function gerador(seed) {
  let s = 7;
  for (const c of String(seed)) s = (s * 131 + c.charCodeAt(0)) % 100000;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

function detalhar(config, params) {
  const id = Number(params && params.indicador);
  const ind = INDICADORES.find((i) => i.id === id);
  if (!ind) return { erro: 'indicador não encontrado' };

  const unidade = params && params.unidade ? params.unidade : null;
  const a = AMOSTRAS[id] || { numerador: 0, denominador: 1, valor: null, status: 'formula_pendente' };
  const periodo = normalizarPeriodoDemo(params, config);
  const ref = (periodo && periodo.fim) ? new Date(periodo.fim + 'T23:59:59') : new Date();
  const ctx = {
    periodo,
    periodoUnidade: config.periodoUnidade,
    tamanhoPagina: 1,
    maxPaginas: 1,
    unidade,
    ref: isNaN(ref.getTime()) ? new Date() : ref
  };

  let valor = a.valor;
  if (valor !== null && unidade) {
    const ud = UNIDADES_DEMO.find((u) => String(u.id) === String(unidade));
    if (ud && ud.id !== UNIDADES_DEMO[0].id) {
      valor = Math.max(0, Math.min(100, Math.round((valor * (1 + ruido(ud.id + ':' + id))) * 10) / 10));
    }
  }

  const praticasBrutas = ind.novasPraticas ? ind.novasPraticas(ctx) : [];
  const praticas = praticasBrutas.length
    ? praticasBrutas.map((p, i) => ({
        id: p.id || 'p' + i,
        descricao: p.descricao,
        rotulo: String(p.id || 'p' + i)
          .split(/[-_]/)
          .map((t, j) => (j === 0 ? t.charAt(0).toUpperCase() + t.slice(1) : t))
          .join(' '),
        peso: p.peso || 1,
        habilitada: true
      }))
    : ind.estilo === 'pendente'
      ? []
      : id === 3
        ? [
            { id: 'programada', descricao: 'Atendimentos por demanda programada (agendada programada, cuidado continuado e agendada)', rotulo: 'Demanda programada', peso: 1, habilitada: true },
            { id: 'espontanea', descricao: 'Atendimentos por demanda espontânea (escuta inicial, urgência etc.)', rotulo: 'Demanda espontânea', peso: 0, habilitada: true }
          ]
        : [{ id: 'pratica', descricao: 'Boas práticas do indicador', rotulo: 'Prática', peso: 1, habilitada: true }];

  const temFormula = ind.estilo !== 'pendente';
  const ehListagem = ind.estilo === 'pessoa' || ind.estilo === 'agregado' || ind.estilo === 'populacao';

  const porEquipe = [];
  const pessoas = [];
  let elegiveis = 0;

  if (ehListagem && valor !== null && temFormula) {
    const total = Math.min(Math.max(a.denominador || 40, 12), 60);
    const rnd = gerador('detalhe:' + id + ':' + (unidade || 'municipio'));
    const unidadeNome = unidade
      ? (UNIDADES_DEMO.find((u) => String(u.id) === String(unidade)) || {}).nome || null
      : null;

    for (let i = 0; i < total; i++) {
      const eq = EQUIPES_DEMO[i % EQUIPES_DEMO.length];
      const u = unidadeNome || UNIDADES_DEMO[Math.floor(rnd() * 3)].nome;
      const itens = praticas.map((p) => {
        const st = !p.habilitada ? 'na' : rnd() * 100 < valor ? 'sim' : 'nao';
        return { id: p.id, descricao: p.descricao, peso: p.peso, status: st };
      });
      const comPeso = itens.filter((x) => x.peso);
      const soma = comPeso.reduce((s, x) => s + x.peso, 0);
      const atingidos = comPeso.filter((x) => x.status === 'sim').reduce((s, x) => s + x.peso, 0);
      const pontos = soma ? Math.round((atingidos / soma) * 100) : null;
      const ano = 1940 + Math.floor(rnd() * 80);
      const mes = 1 + Math.floor(rnd() * 12);
      const dia = 1 + Math.floor(rnd() * 28);
      pessoas.push({
        nome: 'Pessoa Demo ' + String(i + 1).padStart(3, '0'),
        nascimento: `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`,
        equipe: eq ? eq.ine : null,
        equipeNome: eq ? eq.nome : null,
        unidade: u,
        praticas: itens,
        pontos
      });
    }

    elegiveis = pessoas.length;
    for (const e of EQUIPES_DEMO) {
      const grupo = pessoas.filter((p) => (p.equipe || null) === (e ? e.ine : null));
      if (!grupo.length) continue;
      const medias = grupo.map((p) => p.pontos || 0);
      const v = Math.round((medias.reduce((s, x) => s + x, 0) / medias.length) * 10) / 10;
      porEquipe.push({
        ine: e ? e.ine : null,
        nome: e ? e.nome : 'Sem equipe vinculada',
        elegiveis: grupo.length,
        numerador: Math.round(grupo.filter((p) => p.pontos === 100).length),
        denominador: grupo.length,
        valor: v,
        faixa: faixaDe(v, id)
      });
    }
    porEquipe.sort((x, y) => y.valor - x.valor);
  }

  let status = 'ok';
  if (!temFormula) status = 'formula_pendente';
  else if (!ehListagem) status = 'sem_dados';

  return {
    geradoEm: new Date().toISOString(),
    demonstracao: true,
    contexto: { periodo, unidade },
    indicador: {
      id: ind.id,
      bloco: ind.bloco,
      titulo: ind.titulo,
      formula: ind.formula,
      formulaOficial: ind.formulaOficial || 'a_confirmar',
      estilo: ind.estilo,
      inverso: id === 15,
      proximosPassos: ind.proximosPassos || []
    },
    status,
    detalhe: !ehListagem && temFormula
      ? 'Indicador agregado sem lista nominal — o detalhe nominal só existe para os indicadores por pessoa.'
      : null,
    municipio: {
      numerador: valor === null ? a.numerador : Math.round((valor / 100) * (a.denominador || 0)),
      denominador: a.denominador,
      valor,
      faixa: faixaDe(valor, id)
    },
    elegiveis,
    praticas,
    porEquipe,
    pessoas,
    totalPessoas: pessoas.length
  };
}

module.exports = { gerar, detalhar };
