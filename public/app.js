'use strict';

// Numeração oficial do Cofinanciamento Federal (C1–C7, B1–B6, M1–M2)
const CODIGO_OFICIAL = {
  3: 'C1', 9: 'C2', 6: 'C3', 4: 'C4', 5: 'C5', 8: 'C6', 7: 'C7',
  10: 'B1', 11: 'B2', 12: 'B3', 13: 'B4', 14: 'B5', 15: 'B6',
  1: 'M1', 2: 'M2'
};

const ORDEM_BLOCOS = ['eSF/eAP', 'eSB', 'eMulti'];
const NOME_BLOCO = {
  'eSF/eAP': 'Equipes de Saúde da Família / Atenção Primária',
  eSB: 'Equipes de Saúde Bucal',
  eMulti: 'Equipes eMulti'
};

const NOME_FAIXA = {
  otimo: 'Ótimo',
  bom: 'Bom',
  suficiente: 'Suficiente',
  regular: 'Regular',
  sem: 'Sem cálculo'
};

const ITENS_PAGINA = 50;

const estado = {
  usuario: null,
  abaAtiva: 'painel',
  resultado: null,
  planos: [],
  unidade: 'todas',
  equipe: 'todas',
  compararPeriodo: true,
  filtroBloco: 'todos',
  buscaIndicador: '',
  filtroRanking: 'unidades',
  buscaRanking: '',
  filtroStatusPlano: 'todos',
  periodo: { inicio: '2026-01-01', fim: '2026-04-30' },
  detalhe: null,
  equipeDetalhe: 'todas',
  unidadeDetalhe: 'todas',
  buscaPessoa: '',
  soPendencia: true,
  pagina: 1
};

// ---------------------------------------------------------------------------
// Helpers de DOM e Formatação
// ---------------------------------------------------------------------------
function el(tag, classe, texto) {
  const n = document.createElement(tag);
  if (classe) n.className = classe;
  if (texto !== undefined && texto !== null) n.textContent = texto;
  return n;
}

function svg(caminho, classe) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  if (classe) s.setAttribute('class', classe);
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', caminho);
  s.appendChild(p);
  return s;
}

function formatar(v, casas = 1) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: casas }).format(v);
}

function formatarData(iso) {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
}

// ---------------------------------------------------------------------------
// Sistema de Loading & Feedback Visual
// ---------------------------------------------------------------------------
function mostrarLoading(titulo, subtitulo, bloquearTela = true) {
  const barraTopo = document.getElementById('barraProgressoTopo');
  const overlay = document.getElementById('overlayLoading');
  const elTitulo = document.getElementById('txtLoadingTitulo');
  const elSub = document.getElementById('txtLoadingSub');
  const btnAtualizar = document.getElementById('btnAtualizar');

  if (barraTopo) barraTopo.classList.add('ativo');

  if (bloquearTela && overlay) {
    if (elTitulo && titulo) elTitulo.textContent = titulo;
    if (elSub && subtitulo) elSub.textContent = subtitulo;
    overlay.classList.add('ativo');
  }

  if (btnAtualizar) {
    btnAtualizar.disabled = true;
    btnAtualizar.innerHTML = '<span class="spinner-btn"></span> <span>Consultando banco…</span>';
  }
}

function esconderLoading() {
  const barraTopo = document.getElementById('barraProgressoTopo');
  const overlay = document.getElementById('overlayLoading');
  const btnAtualizar = document.getElementById('btnAtualizar');

  if (barraTopo) barraTopo.classList.remove('ativo');
  if (overlay) overlay.classList.remove('ativo');

  if (btnAtualizar) {
    btnAtualizar.disabled = false;
    btnAtualizar.innerHTML = '<svg viewBox="0 0 24 24" class="ic-botao"><path d="M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z"/></svg><span>Recalcular</span>';
  }
}

function codigoIndicador(ind) {
  const id = typeof ind === 'object' && ind !== null ? ind.id : ind;
  return CODIGO_OFICIAL[id] || ('Ind ' + id);
}

function faixaCor(valor, ind) {
  if (valor === null || valor === undefined) return 'sem';
  const id = typeof ind === 'object' && ind !== null ? ind.id : ind;
  if (id === 3 || id === 'C1' || id === '3') {
    if (valor > 50 && valor <= 70) return 'otimo';
    if (valor > 30 && valor <= 50) return 'bom';
    if (valor > 10 && valor <= 30) return 'suficiente';
    return 'regular';
  }
  // Indicador 15 (B6 - Taxa de exodontias) sentido inverso
  if (id === 15 || id === 'B6' || id === '15') {
    if (valor <= 8) return 'otimo';
    if (valor <= 12) return 'bom';
    if (valor <= 20) return 'suficiente';
    return 'regular';
  }
  if (valor > 75) return 'otimo';
  if (valor > 50) return 'bom';
  if (valor > 25) return 'suficiente';
  return 'regular';
}

function badgeFaixa(valor, ind) {
  const c = faixaCor(valor, ind);
  return el('span', 'badge ' + c, NOME_FAIXA[c] || 'Sem cálculo');
}

function proximaFaixa(valor, ind) {
  if (valor === null || valor === undefined) return null;
  const id = typeof ind === 'object' && ind !== null ? ind.id : ind;
  if (id === 3 || id === 'C1' || id === '3') {
    if (valor <= 10) return { nome: 'Suficiente', falta: Math.round((10.01 - valor) * 10) / 10 };
    if (valor <= 30) return { nome: 'Bom', falta: Math.round((30.01 - valor) * 10) / 10 };
    if (valor <= 50) return { nome: 'Ótimo (50% a 70%)', falta: Math.round((50.01 - valor) * 10) / 10 };
    if (valor > 70) return { nome: 'Faixa ideal', excesso: Math.round((valor - 70) * 10) / 10 };
    return null;
  }
  if (id === 15 || id === 'B6' || id === '15') {
    if (valor > 20) return { nome: 'Suficiente (≤ 20%)', falta: Math.round((valor - 20) * 10) / 10 };
    if (valor > 12) return { nome: 'Bom (≤ 12%)', falta: Math.round((valor - 12) * 10) / 10 };
    if (valor > 8) return { nome: 'Ótimo (≤ 8%)', falta: Math.round((valor - 8) * 10) / 10 };
    return null;
  }
  if (valor <= 25) return { nome: 'Suficiente', falta: Math.round((25.01 - valor) * 10) / 10 };
  if (valor <= 50) return { nome: 'Bom', falta: Math.round((50.01 - valor) * 10) / 10 };
  if (valor <= 75) return { nome: 'Ótimo', falta: Math.round((75.01 - valor) * 10) / 10 };
  return null;
}

// ---------------------------------------------------------------------------
// Navegação em Abas & Visualizações
// ---------------------------------------------------------------------------
function alternarAba(abaId) {
  estado.abaAtiva = abaId;

  // Atualiza sidebar
  document.querySelectorAll('.sidebar .menu-item[data-nav]').forEach((btn) => {
    btn.classList.toggle('ativo', btn.dataset.nav === abaId);
  });

  // Atualiza abas superiores
  document.querySelectorAll('.abas-navegacao .aba-item').forEach((tab) => {
    const ativa = tab.dataset.tab === abaId;
    tab.classList.toggle('ativa', ativa);
    tab.setAttribute('aria-selected', ativa ? 'true' : 'false');
  });

  // Alterna seções principais
  const secoes = {
    painel: document.getElementById('viewPainel'),
    decisao: document.getElementById('viewDecisao'),
    comparacao: document.getElementById('viewComparacao'),
    evolucao: document.getElementById('viewEvolucao'),
    plano: document.getElementById('viewPlano'),
    detalhe: document.getElementById('viewDetalhe')
  };

  for (const [chave, sec] of Object.entries(secoes)) {
    if (sec) sec.hidden = chave !== abaId;
  }

  // Renderizações específicas ao abrir a aba
  if (abaId === 'decisao') renderizarApoioDecisao();
  else if (abaId === 'comparacao') renderizarComparacaoRanking();
  else if (abaId === 'evolucao') renderizarEvolucaoQuadrimestral();
  else if (abaId === 'plano') carregarPlanosAcao();
}

// ---------------------------------------------------------------------------
// Gestão de Competências (Quadrimestres)
// ---------------------------------------------------------------------------
const ATALHOS_DATAS = {
  q1_2026: { inicio: '2026-01-01', fim: '2026-04-30' },
  q2_2026: { inicio: '2026-05-01', fim: '2026-08-31' },
  q3_2026: { inicio: '2026-09-01', fim: '2026-12-31' },
  ano_2026: { inicio: '2026-01-01', fim: '2026-12-31' }
};

function configurarAtalhosPeriodo() {
  const container = document.getElementById('atalhosQuadrimestre');
  if (!container) return;

  container.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.btn-q');
    if (!btn) return;

    container.querySelectorAll('.btn-q').forEach((b) => b.classList.remove('ativo'));
    btn.classList.add('ativo');

    const chave = btn.dataset.q;
    const linhaCustom = document.getElementById('linhaDatasCustom');

    if (chave === 'custom') {
      if (linhaCustom) linhaCustom.hidden = false;
    } else {
      if (linhaCustom) linhaCustom.hidden = true;
      if (ATALHOS_DATAS[chave]) {
        estado.periodo = { ...ATALHOS_DATAS[chave] };
        const ini = document.getElementById('dataInicio');
        const fim = document.getElementById('dataFim');
        if (ini) ini.value = estado.periodo.inicio;
        if (fim) fim.value = estado.periodo.fim;
        atualizar();
      }
    }
  });

  const ini = document.getElementById('dataInicio');
  const fim = document.getElementById('dataFim');
  if (ini && fim) {
    ini.value = estado.periodo.inicio;
    fim.value = estado.periodo.fim;
  }
}

// ---------------------------------------------------------------------------
// Renderização do Painel Executivo
// ---------------------------------------------------------------------------
function renderizarPainel() {
  const r = estado.resultado;
  if (!r) return;

  const isf = r.isf || { valor: null, nota10: null, faixa: null, distribuicao: {}, blocos: {} };

  // 1. Cards Executivos de Resumo
  const elValGeral = document.getElementById('valorIsfGeral');
  const elBadgeGeral = document.getElementById('badgeIsfGeral');
  const elDeltaGeral = document.getElementById('deltaIsfGeral');
  const elProgGeral = document.getElementById('progressoIsfGeral');
  const elSubGeral = document.getElementById('subtextoIsfGeral');

  if (elValGeral) elValGeral.textContent = isf.nota10 !== null ? isf.nota10.toFixed(2) : '—';
  if (elBadgeGeral) {
    elBadgeGeral.textContent = isf.faixa ? isf.faixa.nome : 'Sem faixa';
    elBadgeGeral.className = 'badge-faixa ' + (isf.faixa ? isf.faixa.cor : 'sem');
  }
  if (elProgGeral) {
    elProgGeral.style.width = isf.valor !== null ? Math.min(100, Math.max(0, isf.valor)) + '%' : '0%';
  }
  if (elDeltaGeral) {
    if (r.deltas && r.deltas.deltaIsf !== null && r.deltas.deltaIsf !== undefined) {
      const d = r.deltas.deltaIsf;
      elDeltaGeral.hidden = false;
      elDeltaGeral.className = 'kpi-delta ' + (d > 0.05 ? 'subiu' : d < -0.05 ? 'desceu' : 'estavel');
      elDeltaGeral.textContent = (d > 0 ? '+' : '') + d.toFixed(2) + (d > 0.05 ? ' ↗' : d < -0.05 ? ' ↘' : ' ➔');
      elDeltaGeral.title = `Comparado a ${r.deltas.periodoAnteriorRotulo || 'anterior'}`;
    } else {
      elDeltaGeral.hidden = true;
    }
  }
  if (elSubGeral) {
    elSubGeral.textContent = `${isf.totalAvaliados || 0} de ${isf.totalIndicadores || 15} indicadores avaliados`;
  }

  // Bloco eSF / eAP
  const esfBloco = isf.blocos && isf.blocos['eSF/eAP'];
  const elValEsf = document.getElementById('valorIsfEsf');
  const elBadgeEsf = document.getElementById('badgeIsfEsf');
  const elProgEsf = document.getElementById('progressoIsfEsf');
  if (elValEsf) elValEsf.textContent = esfBloco && esfBloco.nota10 !== null ? esfBloco.nota10.toFixed(2) : '—';
  if (elBadgeEsf && esfBloco) {
    elBadgeEsf.textContent = esfBloco.faixa ? esfBloco.faixa.nome : 'Sem faixa';
    elBadgeEsf.className = 'badge-faixa ' + (esfBloco.faixa ? esfBloco.faixa.cor : 'sem');
  }
  if (elProgEsf && esfBloco) {
    elProgEsf.style.width = esfBloco.media !== null ? Math.min(100, Math.max(0, esfBloco.media)) + '%' : '0%';
  }

  // Bloco Saúde Bucal
  const esbBloco = isf.blocos && isf.blocos.eSB;
  const elValEsb = document.getElementById('valorIsfEsb');
  const elBadgeEsb = document.getElementById('badgeIsfEsb');
  const elProgEsb = document.getElementById('progressoIsfEsb');
  if (elValEsb) elValEsb.textContent = esbBloco && esbBloco.nota10 !== null ? esbBloco.nota10.toFixed(2) : '—';
  if (elBadgeEsb && esbBloco) {
    elBadgeEsb.textContent = esbBloco.faixa ? esbBloco.faixa.nome : 'Sem faixa';
    elBadgeEsb.className = 'badge-faixa ' + (esbBloco.faixa ? esbBloco.faixa.cor : 'sem');
  }
  if (elProgEsb && esbBloco) {
    elProgEsb.style.width = esbBloco.media !== null ? Math.min(100, Math.max(0, esbBloco.media)) + '%' : '0%';
  }

  // Distribuição de Faixas
  const dist = isf.distribuicao || { otimo: 0, bom: 0, suficiente: 0, regular: 0 };
  const total = (dist.otimo + dist.bom + dist.suficiente + dist.regular) || 1;
  const segO = document.getElementById('segOtimo');
  const segB = document.getElementById('segBom');
  const segS = document.getElementById('segSuficiente');
  const segR = document.getElementById('segRegular');
  if (segO) segO.style.width = (dist.otimo / total * 100) + '%';
  if (segB) segB.style.width = (dist.bom / total * 100) + '%';
  if (segS) segS.style.width = (dist.suficiente / total * 100) + '%';
  if (segR) segR.style.width = (dist.regular / total * 100) + '%';

  const qO = document.getElementById('qtdOtimo');
  const qB = document.getElementById('qtdBom');
  const qS = document.getElementById('qtdSuficiente');
  const qR = document.getElementById('qtdRegular');
  if (qO) qO.textContent = dist.otimo;
  if (qB) qB.textContent = dist.bom;
  if (qS) qS.textContent = dist.suficiente;
  if (qR) qR.textContent = dist.regular;

  // 2. Banner de Prioridades Clínicas Destaque (Decision Support Imediato)
  renderizarBannerPrioridades(r.prioridadesClinicas || []);

  // 3. Grid dos Indicadores da APS
  renderizarGridIndicadores(r.indicadores || [], r.comparacao);

  // 4. Diagnóstico de Fontes
  renderizarFontes(r.fontes || []);
}

function renderizarBannerPrioridades(prioridades) {
  const banner = document.getElementById('bannerPrioridades');
  const container = document.getElementById('cardsPrioridadesDestaque');
  const contador = document.getElementById('contadorPrioridades');

  if (contador) contador.textContent = prioridades.length;

  if (!prioridades || !prioridades.length) {
    if (banner) banner.hidden = true;
    return;
  }

  if (banner) banner.hidden = false;
  if (!container) return;

  container.innerHTML = '';
  // Exibe as top 3 prioridades no painel executivo
  const top3 = prioridades.slice(0, 3);

  top3.forEach((p) => {
    const card = el('div', 'card-prioridade-item');

    const topo = el('div', 'prio-topo');
    topo.appendChild(el('span', 'prio-codigo', p.indicadorCodigo));
    topo.appendChild(el('span', 'prio-impacto', p.impactoPontos));
    card.appendChild(topo);

    card.appendChild(el('div', 'prio-titulo', p.titulo));
    card.appendChild(el('div', 'prio-descricao', p.descricao));

    const meta = el('div', 'prio-meta-linha');
    meta.appendChild(el('span', 'prio-pendentes', `⚠️ ${p.pendentes} pacientes pendentes`));

    const btnAdd = el('button', 'btn-adicionar-plano-rapido', '+ Adicionar ao Plano');
    btnAdd.type = 'button';
    btnAdd.addEventListener('click', () => {
      abrirModalNovoPlano({
        titulo: p.titulo,
        descricao: p.descricao,
        indicadorId: p.indicadorId,
        indicadorCodigo: p.indicadorCodigo,
        indicadorTitulo: p.indicadorTitulo,
        metaPacientes: p.pendentes,
        categoriaAcao: p.categoriaAcao,
        impactoEsperado: p.impactoPontos
      });
    });
    meta.appendChild(btnAdd);
    card.appendChild(meta);

    container.appendChild(card);
  });
}

function renderizarGridIndicadores(indicadores, comparacao) {
  const container = document.getElementById('blocos');
  const semRes = document.getElementById('semResultado');
  if (!container) return;

  container.innerHTML = '';

  // Filtra por bloco e busca textual
  let lista = indicadores;
  if (estado.filtroBloco !== 'todos') {
    lista = lista.filter((i) => i.bloco === estado.filtroBloco);
  }
  if (estado.buscaIndicador) {
    const termo = estado.buscaIndicador.toLowerCase();
    lista = lista.filter((i) =>
      i.titulo.toLowerCase().includes(termo) ||
      (codigoIndicador(i).toLowerCase().includes(termo)) ||
      (i.bloco.toLowerCase().includes(termo))
    );
  }

  if (!lista.length) {
    if (semRes) semRes.hidden = false;
    return;
  }
  if (semRes) semRes.hidden = true;

  // Agrupa por blocos
  const blocosAgrupados = {};
  for (const b of ORDEM_BLOCOS) blocosAgrupados[b] = [];
  for (const ind of lista) {
    if (!blocosAgrupados[ind.bloco]) blocosAgrupados[ind.bloco] = [];
    blocosAgrupados[ind.bloco].push(ind);
  }

  for (const blocoNome of ORDEM_BLOCOS) {
    const itens = blocosAgrupados[blocoNome];
    if (!itens || !itens.length) continue;

    const secaoBloco = el('div', 'secao-bloco-indicadores');
    const cab = el('div', 'secao-bloco-cabecalho');
    cab.appendChild(el('h3', 'secao-bloco-titulo', NOME_BLOCO[blocoNome] || blocoNome));
    cab.appendChild(el('span', 'secao-bloco-qtd', `${itens.length} indicador(es)`));
    secaoBloco.appendChild(cab);

    const grade = el('div', 'grade');

    for (const ind of itens) {
      const card = el('div', 'card-indicador-moderno');

      // Topo do card
      const cTopo = el('div', 'card-ind-topo');
      const codBadge = el('span', 'badge-codigo-ind', codigoIndicador(ind));
      cTopo.appendChild(codBadge);

      const fxBadge = badgeFaixa(ind.valor, ind);
      cTopo.appendChild(fxBadge);
      card.appendChild(cTopo);

      // Título
      card.appendChild(el('h4', 'card-ind-titulo', ind.titulo));

      // Valor + Delta
      const valLinha = el('div', 'card-ind-valor-linha');
      const valTxt = ind.valor !== null ? formatar(ind.valor) + '%' : '—';
      valLinha.appendChild(el('span', 'card-ind-percentual', valTxt));

      if (ind.delta !== null && ind.delta !== undefined) {
        const dPill = el('span', 'delta-indicador-pill ' + ind.tendencia);
        dPill.textContent = (ind.delta > 0 ? '+' : '') + formatar(ind.delta) + '%' + (ind.delta > 0.5 ? ' ↗' : ind.delta < -0.5 ? ' ↘' : ' ➔');
        dPill.title = `Variação em relação a ${ind.valorAnterior !== null ? formatar(ind.valorAnterior) + '%' : 'anterior'}`;
        valLinha.appendChild(dPill);
      }
      card.appendChild(valLinha);

      // Barra de Comparação por Unidades
      if (comparacao && comparacao.length > 1) {
        const barraUnidades = el('div', 'barra-comparacao-unidades');
        barraUnidades.title = 'Distribuição do resultado entre as unidades de saúde';
        for (const u of comparacao) {
          const indU = u.indicadores.find((x) => x.id === ind.id);
          const cor = indU ? faixaCor(indU.valor, ind) : 'sem';
          const pedaco = el('span', 'pedaco-unidade ' + cor);
          pedaco.title = `${u.unidade.nome}: ${indU && indU.valor !== null ? formatar(indU.valor) + '%' : 'Sem dados'}`;
          barraUnidades.appendChild(pedaco);
        }
        card.appendChild(barraUnidades);
      }

      // Rodapé com Próxima Faixa & Botão Detalhe
      const rodape = el('div', 'card-ind-rodape-acoes');
      const prox = proximaFaixa(ind.valor, ind);
      const proxDiv = el('div', 'meta-proxima-texto');
      if (prox) {
        if (prox.falta) proxDiv.innerHTML = `Faltam <b>${prox.falta}%</b> p/ faixa ${prox.nome}`;
        else if (prox.excesso) proxDiv.innerHTML = `Na ${prox.nome}`;
      } else {
        proxDiv.textContent = ind.valor !== null ? 'Faixa atingida' : 'Aguardando apuração';
      }
      rodape.appendChild(proxDiv);

      const btnDet = el('button', 'btn-ver-detalhe-ind');
      btnDet.type = 'button';
      btnDet.appendChild(el('span', null, 'Detalhar'));
      btnDet.appendChild(svg('M5 13h11.86l-5.43 5.43 1.42 1.42L21.71 11.7l-8.86-8.85-1.42 1.42L16.86 10H5v3z'));
      btnDet.addEventListener('click', () => abrirDetalhe(ind.id));
      rodape.appendChild(btnDet);

      card.appendChild(rodape);
      grade.appendChild(card);
    }

    secaoBloco.appendChild(grade);
    container.appendChild(secaoBloco);
  }
}

const NOMES_FONTES = {
  emulti: 'Equipes eMulti cadastradas',
  atendimentos: 'Atendimentos individuais (médico e enfermagem)',
  listagemGeral: 'Cadastro geral de cidadãos vinculados',
  demandaAcesso: 'Atendimentos por tipo de demanda (programada e espontânea)',
  listagemDiabetes: 'Cidadãos com condição de diabetes vinculados',
  listagemHipertensao: 'Cidadãos com condição de hipertensão arterial vinculados',
  listagemGestante: 'Gestantes e puérperas com acompanhamento de pré-natal',
  listagemSaudeMulher: 'Mulheres em idade fértil (citopatológico e mamografia)',
  listagemIdosa: 'População idosa (60 anos ou mais)',
  listagemDesenvolvimento: 'Crianças até 2 anos (puericultura e desenvolvimento)',
  listagemSaudeBucal: 'Atendimentos e procedimentos odontológicos',
  vinculados: 'Base de vinculação cidadão-equipe de saúde',
  equipes: 'Cadastro das equipes de saúde da APS (INE)',
  unidades: 'Cadastro das unidades básicas de saúde (CNES)',
  absenteismos: 'Registros de agendamentos e absenteísmo'
};

function renderizarFontes(fontes) {
  const corpo = document.getElementById('corpoFontes');
  const badgeTotal = document.getElementById('badgeTotalFontes');
  const pillBanco = document.getElementById('pillStatusBanco');
  if (!corpo) return;
  corpo.innerHTML = '';

  if (badgeTotal) badgeTotal.textContent = `${fontes.length} fontes auditadas`;

  const temErro = fontes.some((f) => f.status === 'sem_acesso' || f.status === 'erro');
  if (pillBanco) {
    if (temErro) {
      pillBanco.textContent = 'Alerta em Fontes';
      pillBanco.style.background = '#fff1f2';
      pillBanco.style.color = '#e11d48';
      pillBanco.style.borderColor = '#fecdd3';
    } else {
      pillBanco.textContent = 'PostgreSQL Conectado';
      pillBanco.style.background = 'var(--otimo-fundo)';
      pillBanco.style.color = 'var(--otimo)';
      pillBanco.style.borderColor = 'var(--otimo-borda)';
    }
  }

  fontes.forEach((f) => {
    const tr = el('tr');

    const tdNome = el('td');
    tdNome.appendChild(el('code', 'codigo-fonte', f.id));
    if (NOMES_FONTES[f.id]) {
      tdNome.appendChild(el('span', 'nome-fonte-amigavel', NOMES_FONTES[f.id]));
    }
    tr.appendChild(tdNome);

    const tdSt = el('td');
    const badgeCls = f.status === 'ok' ? 'ok' : f.status === 'sem_acesso' || f.status === 'erro' ? 'erro' : 'sem_dados';
    const badgeLabel = f.status === 'ok' ? 'Conectado' : f.status === 'sem_acesso' ? 'Sem Acesso' : f.status === 'sem_dados' ? 'Sem Dados' : f.status;
    tdSt.appendChild(el('span', 'badge-fonte-status ' + badgeCls, badgeLabel));
    tr.appendChild(tdSt);

    tr.appendChild(el('td', 'dir font-semibold', f.registros !== null ? formatar(f.registros, 0) : '—'));
    tr.appendChild(el('td', null, f.detalhe || '—'));
    corpo.appendChild(tr);
  });
}

// ---------------------------------------------------------------------------
// ABA 2: APOIO À DECISÃO & RESPOSTA ÀS 6 PERGUNTAS DE GESTÃO
// ---------------------------------------------------------------------------
function renderizarApoioDecisao() {
  const r = estado.resultado;
  if (!r) return;

  const container = document.getElementById('gridPerguntasGestao');
  if (!container) return;
  container.innerHTML = '';

  const analise = r.analiseDecisao;
  if (!analise || !analise.perguntas) return;

  analise.perguntas.forEach((p) => {
    const card = el('div', 'card-pergunta-gestao');

    const cab = el('div', 'cabecalho-pergunta');
    cab.appendChild(el('div', 'num-pergunta', String(p.numero)));
    cab.appendChild(el('h3', 'titulo-pergunta', p.pergunta));
    card.appendChild(cab);

    card.appendChild(el('div', 'resposta-destaque', p.respostaResumida));

    // Detalhamento específico de cada pergunta
    if (p.fatos && p.fatos.length) {
      const ul = el('ul', 'lista-fatos-gestao');
      p.fatos.forEach((f) => ul.appendChild(el('li', 'item-fato-gestao', f)));
      card.appendChild(ul);
    }

    if (p.indicadoresCriticos && p.indicadoresCriticos.length) {
      const listaCriticos = el('div', 'grid-cards-prioridades');
      p.indicadoresCriticos.forEach((c) => {
        const item = el('div', 'card-prioridade-item');
        item.appendChild(el('div', 'prio-codigo', `${c.codigo} — ${c.faixa}`));
        item.appendChild(el('div', 'prio-titulo', c.titulo));
        item.appendChild(el('div', 'prio-pendentes', `Resultado Atual: ${formatar(c.valor)}%`));
        const btn = el('button', 'btn-adicionar-plano-rapido', 'Ver Cidadãos Pendentes');
        btn.addEventListener('click', () => abrirDetalhe(c.id));
        item.appendChild(btn);
        listaCriticos.appendChild(item);
      });
      card.appendChild(listaCriticos);
    }

    if (p.gargalosIdentificados && p.gargalosIdentificados.length) {
      const ulGargalos = el('ul', 'lista-fatos-gestao');
      p.gargalosIdentificados.forEach((g) => {
        const li = el('li', 'item-fato-gestao');
        li.innerHTML = `<b>${g.indicador}:</b> ${g.gargalo} <span class="badge otimo">${g.impacto}</span>`;
        ulGargalos.appendChild(li);
      });
      card.appendChild(ulGargalos);
    }

    if (p.acoesImediatas && p.acoesImediatas.length) {
      const gridAcoes = el('div', 'grid-cards-prioridades');
      p.acoesImediatas.forEach((a) => {
        const item = el('div', 'card-prioridade-item');
        item.appendChild(el('div', 'prio-codigo', `${a.indicadorCodigo} (${a.perfilAlvo})`));
        item.appendChild(el('div', 'prio-titulo', a.titulo));
        item.appendChild(el('div', 'prio-descricao', a.descricao));
        const meta = el('div', 'prio-meta-linha');
        meta.appendChild(el('span', 'prio-pendentes', `⚠️ ${a.pendentes} pendentes`));
        const btn = el('button', 'btn-adicionar-plano-rapido', '+ Criar Ação');
        btn.addEventListener('click', () => {
          abrirModalNovoPlano({
            titulo: a.titulo,
            descricao: a.descricao,
            indicadorId: a.indicadorId,
            indicadorCodigo: a.indicadorCodigo,
            indicadorTitulo: a.indicadorTitulo,
            metaPacientes: a.pendentes,
            categoriaAcao: a.categoriaAcao,
            impactoEsperado: a.impactoPontos
          });
        });
        meta.appendChild(btn);
        item.appendChild(meta);
        gridAcoes.appendChild(item);
      });
      card.appendChild(gridAcoes);
    }

    if (p.metodologia) {
      card.appendChild(el('p', 'prio-descricao', p.metodologia));
    }

    container.appendChild(card);
  });
}

// ---------------------------------------------------------------------------
// ABA 3: COMPARAÇÃO & RANKING
// ---------------------------------------------------------------------------
function renderizarComparacaoRanking() {
  const r = estado.resultado;
  if (!r || !r.comparacao) return;

  const corpo = document.getElementById('corpoRankingGeral');
  if (!corpo) return;
  corpo.innerHTML = '';

  const tipo = estado.filtroRanking; // 'unidades' ou 'equipes'
  let itens = [];

  if (tipo === 'unidades') {
    itens = r.comparacao.map((u) => {
      const avaliados = u.indicadores.filter((i) => i.valor !== null);
      const soma = avaliados.reduce((s, i) => s + i.valor, 0);
      const media = avaliados.length ? soma / avaliados.length : null;
      const otimos = u.indicadores.filter((i) => i.faixa && i.faixa.cor === 'otimo').length;
      const regulares = u.indicadores.filter((i) => i.faixa && i.faixa.cor === 'regular').length;

      return {
        nome: u.unidade.nome,
        cnes: u.unidade.cnes || '—',
        pessoas: u.unidade.pessoas,
        isf: media !== null ? Math.round((media / 10) * 100) / 100 : null,
        faixa: media !== null ? faixaCor(media, null) : 'sem',
        otimos,
        regulares
      };
    });
  }

  // Ordena por maior ISF
  itens.sort((a, b) => (b.isf || 0) - (a.isf || 0));

  // Filtro de busca
  if (estado.buscaRanking) {
    const termo = estado.buscaRanking.toLowerCase();
    itens = itens.filter((i) => i.nome.toLowerCase().includes(termo) || String(i.cnes).includes(termo));
  }

  itens.forEach((item, idx) => {
    const tr = el('tr');
    tr.appendChild(el('td', 'centro font-bold', String(idx + 1)));
    tr.appendChild(el('td', 'font-semibold', item.nome));
    tr.appendChild(el('td', null, item.cnes));
    tr.appendChild(el('td', 'dir', item.pessoas ? formatar(item.pessoas, 0) : '—'));
    tr.appendChild(el('td', 'dir font-bold', item.isf !== null ? item.isf.toFixed(2) : '—'));
    const tdFaixa = el('td', 'centro');
    tdFaixa.appendChild(el('span', 'badge ' + item.faixa, NOME_FAIXA[item.faixa]));
    tr.appendChild(tdFaixa);
    tr.appendChild(el('td', 'centro font-bold text-green', String(item.otimos)));
    tr.appendChild(el('td', 'centro font-bold text-red', String(item.regulares)));
    corpo.appendChild(tr);
  });
}

// ---------------------------------------------------------------------------
// ABA 4: EVOLUÇÃO QUADRIMESTRAL
// ---------------------------------------------------------------------------
function renderizarEvolucaoQuadrimestral() {
  const r = estado.resultado;
  if (!r) return;

  const corpo = document.getElementById('corpoEvolucaoQuadrimestral');
  if (!corpo) return;
  corpo.innerHTML = '';

  const indicadores = r.indicadores || [];

  indicadores.forEach((ind) => {
    const tr = el('tr');
    tr.appendChild(el('td', 'font-bold', codigoIndicador(ind)));
    tr.appendChild(el('td', null, ind.titulo));
    tr.appendChild(el('td', null, ind.bloco));

    tr.appendChild(el('td', 'dir font-semibold', ind.valor !== null ? formatar(ind.valor) + '%' : '—'));
    tr.appendChild(el('td', 'dir', ind.valorAnterior !== null && ind.valorAnterior !== undefined ? formatar(ind.valorAnterior) + '%' : '—'));

    const tdDelta = el('td', 'centro');
    if (ind.delta !== null && ind.delta !== undefined) {
      const dPill = el('span', 'tendencia-tag ' + ind.tendencia);
      dPill.textContent = (ind.delta > 0 ? '+' : '') + formatar(ind.delta) + '%';
      tdDelta.appendChild(dPill);
    } else {
      tdDelta.textContent = '—';
    }
    tr.appendChild(tdDelta);

    const tdTend = el('td', 'centro');
    const tendIcon = ind.tendencia === 'subiu' ? '↗️ Melhorou' : ind.tendencia === 'desceu' ? '↘️ Caiu' : '➡️ Estável';
    tdTend.textContent = ind.delta !== null && ind.delta !== undefined ? tendIcon : '—';
    tr.appendChild(tdTend);

    corpo.appendChild(tr);
  });
}

// ---------------------------------------------------------------------------
// ABA 5: PLANO DE AÇÃO DA EQUIPE (CRUD)
// ---------------------------------------------------------------------------
async function carregarPlanosAcao() {
  try {
    const r = await fetch('/api/plano-acao');
    const d = await r.json();
    if (d.ok) {
      estado.planos = d.planos || [];
      renderizarPlanosAcao();
    }
  } catch (e) {
    console.error('Erro ao carregar planos de ação:', e);
  }
}

function renderizarPlanosAcao() {
  const container = document.getElementById('gridPlanosAcao');
  const msgVazio = document.getElementById('msgVazioPlano');
  if (!container) return;
  container.innerHTML = '';

  let lista = estado.planos;
  if (estado.filtroStatusPlano !== 'todos') {
    lista = lista.filter((p) => p.status === estado.filtroStatusPlano);
  }

  if (!lista.length) {
    if (msgVazio) msgVazio.hidden = false;
    return;
  }
  if (msgVazio) msgVazio.hidden = true;

  lista.forEach((p) => {
    const card = el('div', 'card-plano');

    const cab = el('div', 'plano-cab');
    cab.appendChild(el('span', 'plano-status-badge ' + p.status, p.status.replace('_', ' ')));
    if (p.indicadorCodigo) cab.appendChild(el('span', 'prio-codigo', p.indicadorCodigo));
    card.appendChild(cab);

    card.appendChild(el('h3', 'plano-titulo-card', p.titulo));
    if (p.indicadorTitulo) card.appendChild(el('div', 'plano-ind-vinculado', p.indicadorTitulo));
    if (p.descricao) card.appendChild(el('div', 'plano-desc', p.descricao));

    const metaInfo = el('div', 'plano-meta-info');
    metaInfo.innerHTML = `<span>👤 <b>${p.responsavel}</b></span><span>📅 Prazo: <b>${formatarData(p.prazo)}</b></span>`;
    card.appendChild(metaInfo);

    if (p.metaPacientes) {
      const progLinha = el('div', 'prio-meta-linha');
      progLinha.innerHTML = `<span>Meta: <b>${p.pacientesAlcancados || 0} / ${p.metaPacientes}</b> cidadãos</span>`;
      card.appendChild(progLinha);
    }

    const acoesLinha = el('div', 'plano-acoes-linha');
    if (p.status === 'planejado') {
      const btnIni = el('button', 'botao secundario btn-sm', 'Iniciar Execução');
      btnIni.addEventListener('click', () => atualizarStatusPlano(p.id, 'em_andamento'));
      acoesLinha.appendChild(btnIni);
    } else if (p.status === 'em_andamento') {
      const btnConcl = el('button', 'botao sucesso btn-sm', 'Concluir Ação');
      btnConcl.addEventListener('click', () => atualizarStatusPlano(p.id, 'concluido'));
      acoesLinha.appendChild(btnConcl);
    }

    const btnExc = el('button', 'icone', '🗑️');
    btnExc.title = 'Excluir esta ação';
    btnExc.addEventListener('click', () => excluirPlano(p.id));
    acoesLinha.appendChild(btnExc);

    card.appendChild(acoesLinha);
    container.appendChild(card);
  });
}

async function atualizarStatusPlano(id, status) {
  try {
    const r = await fetch('/api/plano-acao', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status })
    });
    const d = await r.json();
    if (d.ok) carregarPlanosAcao();
  } catch (e) {
    console.error('Erro ao atualizar plano:', e);
  }
}

async function excluirPlano(id) {
  if (!confirm('Deseja realmente remover esta ação do plano da equipe?')) return;
  try {
    const r = await fetch(`/api/plano-acao?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    const d = await r.json();
    if (d.ok) carregarPlanosAcao();
  } catch (e) {
    console.error('Erro ao excluir plano:', e);
  }
}

function abrirModalNovoPlano(dados = {}) {
  const modal = document.getElementById('modalPlanoAcao');
  if (!modal) return;

  document.getElementById('planoId').value = dados.id || '';
  document.getElementById('planoTituloInput').value = dados.titulo || '';
  document.getElementById('planoDescricao').value = dados.descricao || '';
  document.getElementById('planoIndicadorId').value = dados.indicadorId || '';
  document.getElementById('planoIndicadorTituloInput').value = dados.indicadorTitulo ? `${dados.indicadorCodigo || ''} - ${dados.indicadorTitulo}` : '';
  document.getElementById('planoResponsavelInput').value = dados.responsavel || (estado.usuario ? estado.usuario.nome : '');
  document.getElementById('planoMetaPacientes').value = dados.metaPacientes || '';
  document.getElementById('planoCategoriaSelect').value = dados.categoriaAcao || 'Busca Ativa';
  document.getElementById('planoStatusSelect').value = dados.status || 'planejado';

  const dtPrazo = document.getElementById('planoPrazo');
  if (dtPrazo) {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    dtPrazo.value = d.toISOString().slice(0, 10);
  }

  modal.showModal();
}

function configurarModalPlano() {
  const modal = document.getElementById('modalPlanoAcao');
  const btnFechar = document.getElementById('btnFecharModalPlano');
  const btnCancelar = document.getElementById('btnCancelarModalPlano');
  const btnNovaAcao = document.getElementById('btnNovaAcao');
  const form = document.getElementById('formPlanoAcao');

  if (btnFechar) btnFechar.addEventListener('click', () => modal.close());
  if (btnCancelar) btnCancelar.addEventListener('click', () => modal.close());
  if (btnNovaAcao) btnNovaAcao.addEventListener('click', () => abrirModalNovoPlano());

  if (form) {
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const payload = {
        id: document.getElementById('planoId').value || undefined,
        titulo: document.getElementById('planoTituloInput').value,
        descricao: document.getElementById('planoDescricao').value,
        indicadorId: document.getElementById('planoIndicadorId').value || null,
        indicadorTitulo: document.getElementById('planoIndicadorTituloInput').value,
        responsavel: document.getElementById('planoResponsavelInput').value,
        categoriaAcao: document.getElementById('planoCategoriaSelect').value,
        metaPacientes: document.getElementById('planoMetaPacientes').value,
        prazo: document.getElementById('planoPrazo').value,
        status: document.getElementById('planoStatusSelect').value
      };

      try {
        const r = await fetch('/api/plano-acao', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const d = await r.json();
        if (d.ok) {
          modal.close();
          alternarAba('plano');
          carregarPlanosAcao();
        }
      } catch (e) {
        alert('Erro ao salvar plano: ' + e.message);
      }
    });
  }
}

// ---------------------------------------------------------------------------
// VIEW DETALHE: DRILL-DOWN E LISTA NOMINAL (BUSCA ATIVA LGPD)
// ---------------------------------------------------------------------------
async function abrirDetalhe(indicadorId) {
  alternarAba('detalhe');
  const detCodigo = document.getElementById('detCodigoOficial');
  const detTitulo = document.getElementById('detTitulo');
  const detFormula = document.getElementById('detFormula');
  const migalha = document.getElementById('migalhaDetalhe');
  const loadingState = document.getElementById('detLoadingState');
  const praticasCartao = document.getElementById('detPraticasCartao');
  const equipesCartao = document.getElementById('detEquipesCartao');
  const pessoasCartao = document.getElementById('detPessoasCartao');
  const detKpis = document.getElementById('detKpis');

  if (detCodigo) detCodigo.textContent = CODIGO_OFICIAL[indicadorId] || ('Ind ' + indicadorId);
  if (migalha) migalha.textContent = CODIGO_OFICIAL[indicadorId] || ('Indicador ' + indicadorId);
  if (detTitulo) detTitulo.textContent = 'Carregando indicador…';
  if (detFormula) detFormula.textContent = 'Consultando prontuário eletrônico no banco…';

  if (loadingState) loadingState.hidden = false;
  if (praticasCartao) praticasCartao.hidden = true;
  if (equipesCartao) equipesCartao.hidden = true;
  if (pessoasCartao) pessoasCartao.hidden = true;
  if (detKpis) detKpis.innerHTML = '';

  mostrarLoading('Carregando Detalhes do Indicador', 'Buscando lista nominal e avaliando boas práticas no PostgreSQL…', false);

  const payload = {
    indicador: indicadorId,
    periodo: estado.periodo,
    unidade: estado.unidade !== 'todas' ? estado.unidade : null,
    equipe: estado.equipe !== 'todas' ? estado.equipe : null
  };

  try {
    const r = await fetch('/api/detalhe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const d = await r.json();
    if (d.erro) {
      alert(d.erro);
      return;
    }
    estado.detalhe = d;

    if (detTitulo) detTitulo.textContent = d.indicador.titulo;
    if (detFormula) detFormula.textContent = d.indicador.formula;

    const detFaixa = document.getElementById('detFaixa');
    if (detFaixa && d.municipio) {
      detFaixa.textContent = d.municipio.faixa ? d.municipio.faixa.nome : 'Sem faixa';
      detFaixa.className = 'badge-faixa ' + (d.municipio.faixa ? d.municipio.faixa.cor : 'sem');
    }

    if (praticasCartao) praticasCartao.hidden = false;
    renderizarDetalheKpis(d);
    renderizarDetalhePraticas(d.praticas || []);
    renderizarDetalheEquipes(d.porEquipe || []);
    renderizarDetalhePessoas(d);
  } catch (e) {
    console.error('Erro ao carregar detalhe do indicador:', e);
  } finally {
    if (loadingState) loadingState.hidden = true;
    esconderLoading();
  }
}

function renderizarDetalheKpis(d) {
  const container = document.getElementById('detKpis');
  if (!container) return;
  container.innerHTML = '';

  const mun = d.municipio || {};
  const kpis = [
    { rotulo: 'Resultado Obtido', valor: mun.valor !== null ? formatar(mun.valor) + '%' : '—' },
    { rotulo: 'Numerador', valor: mun.numerador !== null ? formatar(mun.numerador, 0) : '—' },
    { rotulo: 'Denominador (Elegíveis)', valor: mun.denominador !== null ? formatar(mun.denominador, 0) : '—' },
    { rotulo: 'Classificação Atual', valor: mun.faixa ? mun.faixa.nome : 'Sem faixa' }
  ];

  kpis.forEach((k) => {
    const c = el('div', 'cartao kpi');
    c.appendChild(el('div', 'kpi-rotulo', k.rotulo));
    c.appendChild(el('div', 'kpi-valor', k.valor));
    container.appendChild(c);
  });
}

function renderizarDetalhePraticas(praticas) {
  const corpo = document.getElementById('detCorpoPraticas');
  if (!corpo) return;
  corpo.innerHTML = '';

  praticas.forEach((p) => {
    const tr = el('tr');
    tr.appendChild(el('td', null, p.descricao));
    tr.appendChild(el('td', 'centro font-bold', p.peso ? p.peso + ' pts' : '—'));
    const tdSt = el('td', 'centro');
    tdSt.appendChild(el('span', p.habilitada ? 'st-ok' : 'st-neutro', p.habilitada ? 'Oficial / Vigente' : 'Pendente de Fonte'));
    tr.appendChild(tdSt);
    corpo.appendChild(tr);
  });
}

function renderizarDetalheEquipes(equipes) {
  const card = document.getElementById('detEquipesCartao');
  const tabela = document.getElementById('detTabelaEquipes');
  if (!card || !tabela) return;

  if (!equipes.length) {
    card.hidden = true;
    return;
  }
  card.hidden = false;

  const corpo = tabela.querySelector('tbody');
  corpo.innerHTML = '';

  equipes.forEach((e) => {
    const tr = el('tr');
    tr.appendChild(el('td', 'font-semibold', e.nome || 'Sem equipe vinculada'));
    tr.appendChild(el('td', null, e.ine || '—'));
    tr.appendChild(el('td', 'dir', formatar(e.elegiveis, 0)));
    tr.appendChild(el('td', 'dir font-bold', e.valor !== null ? formatar(e.valor) + '%' : '—'));
    const tdF = el('td', 'centro');
    tdF.appendChild(el('span', 'badge ' + (e.faixa ? e.faixa.cor : 'sem'), e.faixa ? e.faixa.nome : 'Sem faixa'));
    tr.appendChild(tdF);
    corpo.appendChild(tr);
  });
}

function renderizarDetalhePessoas(d) {
  const card = document.getElementById('detPessoasCartao');
  const tabela = document.getElementById('detTabelaPessoas');
  const elPag = document.getElementById('detPaginacao');
  if (!card || !tabela) return;

  const pessoas = d.pessoas || [];
  if (!pessoas.length) {
    card.hidden = true;
    return;
  }
  card.hidden = false;

  // Filtragem
  let filtradas = pessoas;
  if (estado.soPendencia) {
    filtradas = filtradas.filter((p) => (p.pontos || 0) < 100);
  }
  if (estado.buscaPessoa) {
    const t = estado.buscaPessoa.toLowerCase();
    filtradas = filtradas.filter((p) =>
      (p.nome && p.nome.toLowerCase().includes(t)) ||
      (p.equipeNome && p.equipeNome.toLowerCase().includes(t))
    );
  }

  // Cabeçalho da tabela
  const thead = tabela.querySelector('thead');
  thead.innerHTML = '';
  const trH = el('tr');
  trH.appendChild(el('th', null, 'Cidadão / Usuário'));
  trH.appendChild(el('th', null, 'Nascimento'));
  trH.appendChild(el('th', null, 'Equipe'));
  (d.praticas || []).forEach((p) => {
    trH.appendChild(el('th', 'centro', p.rotulo || p.descricao));
  });
  trH.appendChild(el('th', 'dir', 'Pontuação'));
  thead.appendChild(trH);

  // Paginação
  const total = filtradas.length;
  const totalPags = Math.ceil(total / ITENS_PAGINA) || 1;
  if (estado.pagina > totalPags) estado.pagina = totalPags;
  const inicio = (estado.pagina - 1) * ITENS_PAGINA;
  const fim = Math.min(inicio + ITENS_PAGINA, total);
  const paginaItens = filtradas.slice(inicio, fim);

  if (elPag) elPag.textContent = `Exibindo ${total ? inicio + 1 : 0}–${fim} de ${total} cidadão(s)`;

  const tbody = tabela.querySelector('tbody');
  tbody.innerHTML = '';

  paginaItens.forEach((p) => {
    const tr = el('tr');
    tr.appendChild(el('td', 'font-semibold', p.nome || 'Nome protegido (LGPD)'));
    tr.appendChild(el('td', null, formatarData(p.nascimento)));
    tr.appendChild(el('td', null, p.equipeNome || p.equipe || '—'));

    // Status de cada prática
    const mapaPraticas = new Map();
    (p.praticas || []).forEach((it) => mapaPraticas.set(it.id, it.status));

    (d.praticas || []).forEach((meta) => {
      const st = mapaPraticas.get(meta.id) || 'na';
      const td = el('td', 'centro');
      if (st === 'sim') td.innerHTML = '<span class="icone-sim" title="Prática cumprida">✓</span>';
      else if (st === 'nao') td.innerHTML = '<span class="icone-nao" title="Pendente de realização">✗</span>';
      else td.innerHTML = '<span class="icone-na" title="Não aplicável">—</span>';
      tr.appendChild(td);
    });

    const tdPts = el('td', 'dir font-bold pontos');
    tdPts.textContent = p.pontos !== null && p.pontos !== undefined ? p.pontos + ' pts' : '—';
    tr.appendChild(tdPts);

    tbody.appendChild(tr);
  });
}

function exportarCsv() {
  const d = estado.detalhe;
  if (!d || !d.pessoas || !d.pessoas.length) return;

  const linhas = [];
  const cabecalho = ['Cidadão', 'Nascimento', 'Equipe', ...(d.praticas || []).map((p) => p.rotulo || p.descricao), 'Pontuação'];
  linhas.push(cabecalho.map((c) => `"${c.replace(/"/g, '""')}"`).join(';'));

  let lista = d.pessoas;
  if (estado.soPendencia) lista = lista.filter((p) => (p.pontos || 0) < 100);

  lista.forEach((p) => {
    const mapa = new Map();
    (p.praticas || []).forEach((it) => mapa.set(it.id, it.status));

    const linha = [
      p.nome || '',
      formatarData(p.nascimento),
      p.equipeNome || p.equipe || '',
      ...(d.praticas || []).map((m) => {
        const s = mapa.get(m.id);
        return s === 'sim' ? 'CUMPRIDO' : s === 'nao' ? 'PENDENTE' : 'N/A';
      }),
      p.pontos !== null ? String(p.pontos) : ''
    ];
    linhas.push(linha.map((c) => `"${c.replace(/"/g, '""')}"`).join(';'));
  });

  const blob = new Blob(['\uFEFF' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = el('a');
  a.href = url;
  a.download = `busca_ativa_${codigoIndicador(d.indicador)}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Inicialização e Cargas de Dados
// ---------------------------------------------------------------------------
async function carregarSessao() {
  try {
    const r = await fetch('/api/auth/sessao');
    const d = await r.json();
    if (!d.autenticado) {
      window.location.href = '/login.html';
      return;
    }
    const u = d.usuario;
    estado.usuario = u;

    const elNome = document.getElementById('usuarioNome');
    const elCat = document.getElementById('usuarioCategoria');
    const elEscopo = document.getElementById('usuarioEscopo');
    const elAvatar = document.getElementById('usuarioAvatar');
    const elEscopoBadge = document.getElementById('txtEscopoBadge');
    const linkAdmin = document.getElementById('linkAdmin');

    if (elNome) elNome.textContent = u.nome;
    if (elCat) elCat.textContent = u.categoriaNome || 'Usuário';

    const descEscopo = u.permissoes ? u.permissoes.descricaoEscopo : 'Escopo Municipal';
    if (elEscopo) elEscopo.textContent = descEscopo;
    if (elEscopoBadge) elEscopoBadge.textContent = descEscopo;

    if (elAvatar) {
      const p = (u.nome || 'US').trim().split(/\s+/);
      elAvatar.textContent = (p[0][0] + (p[1] ? p[1][0] : '')).toUpperCase();
    }

    if (linkAdmin && (!u.permissoes || !u.permissoes.podeAcessarAdmin)) {
      linkAdmin.style.display = 'none';
      const sep = linkAdmin.previousElementSibling;
      if (sep && sep.classList.contains('menu-sep')) sep.style.display = 'none';
    }

    // Se o usuário tiver restrição obrigatória de unidade/equipe, fixa no estado
    if (u.permissoes && !u.permissoes.podeVerTodasUnidades) {
      if (u.unidadeId) estado.unidade = String(u.unidadeId);
      if (u.equipeIne) estado.equipe = String(u.equipeIne);
    }

    const btnSair = document.getElementById('btnSair');
    if (btnSair) {
      btnSair.addEventListener('click', () => {
        fetch('/api/auth/logout', { method: 'POST' }).finally(() => {
          window.location.href = '/login.html';
        });
      });
    }
  } catch (e) {
    console.error('Erro ao carregar sessão:', e);
  }
}

async function carregarUnidades() {
  try {
    const r = await fetch('/api/unidades');
    const d = await r.json();
    const select = document.getElementById('selectUnidade');
    const selectDet = document.getElementById('detUnidade');

    if (!select || !d.unidades) return;
    select.innerHTML = '<option value="todas">Município Completo (Todas as Unidades)</option>';
    if (selectDet) selectDet.innerHTML = '<option value="todas">Todas as Unidades</option>';

    d.unidades.forEach((u) => {
      const opt = el('option', null, u.nome + (u.bairro ? ` — ${u.bairro}` : ''));
      opt.value = String(u.id);
      select.appendChild(opt);
      if (selectDet) {
        const optDet = el('option', null, u.nome);
        optDet.value = String(u.id);
        selectDet.appendChild(optDet);
      }
    });

    if (estado.unidade && estado.unidade !== 'todas') {
      select.value = estado.unidade;
      if (estado.usuario && estado.usuario.permissoes && !estado.usuario.permissoes.podeVerTodasUnidades) {
        select.disabled = true;
      }
    }
  } catch (e) {
    console.error('Erro ao carregar unidades:', e);
  }
}

async function atualizar(comLoading = true) {
  if (comLoading) {
    mostrarLoading('Calculando Indicadores da APS', 'Consultando microdados no PostgreSQL e processando regras ministeriais…', true);
  } else {
    mostrarLoading(null, null, false);
  }

  const payload = {
    periodo: estado.periodo,
    unidade: estado.unidade !== 'todas' ? estado.unidade : null,
    equipe: estado.equipe !== 'todas' ? estado.equipe : null,
    compararPeriodoAnterior: estado.compararPeriodo
  };

  try {
    const r = await fetch('/api/avaliar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const d = await r.json();
    if (d.erro) {
      alert(d.erro);
      return;
    }
    estado.resultado = d;
    renderizarPainel();
    if (estado.abaAtiva === 'decisao') renderizarApoioDecisao();
    else if (estado.abaAtiva === 'comparacao') renderizarComparacaoRanking();
    else if (estado.abaAtiva === 'evolucao') renderizarEvolucaoQuadrimestral();
  } catch (e) {
    console.error('Erro na avaliação:', e);
  } finally {
    esconderLoading();
  }
}

async function carregarStatus() {
  const ponto = document.getElementById('pontoSessao');
  const txt = document.getElementById('txtSessao');
  try {
    const r = await fetch('/api/status');
    const d = await r.json();
    if (ponto) ponto.className = 'ponto ' + (d.banco && d.banco.alvoConectado ? 'verde' : 'vermelho');
    if (txt) txt.textContent = d.banco && d.banco.alvoConectado ? 'PostgreSQL Online' : 'Sem Conexão';
  } catch (e) {
    if (ponto) ponto.className = 'ponto vermelho';
    if (txt) txt.textContent = 'Erro Conexão';
  }
}

// ---------------------------------------------------------------------------
// Event Listeners Globais
// ---------------------------------------------------------------------------
function configurarEventos() {
  // Sidebar e Abas de Navegação
  document.querySelectorAll('.sidebar .menu-item[data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => alternarAba(btn.dataset.nav));
  });

  document.querySelectorAll('.abas-navegacao .aba-item').forEach((tab) => {
    tab.addEventListener('click', () => alternarAba(tab.dataset.tab));
  });

  // Botão de ir para decisão do banner
  const btnIrDec = document.getElementById('btnIrParaDecisao');
  if (btnIrDec) btnIrDec.addEventListener('click', () => alternarAba('decisao'));

  // Botão voltar do detalhe
  const btnVoltarPainel = document.getElementById('btnVoltarPainel');
  if (btnVoltarPainel) btnVoltarPainel.addEventListener('click', () => alternarAba('painel'));

  // Filtros de bloco de indicadores
  const contBlocos = document.getElementById('botoesFiltroBloco');
  if (contBlocos) {
    contBlocos.addEventListener('click', (ev) => {
      const btn = ev.target.closest('.btn-filtro-bloco');
      if (!btn) return;
      contBlocos.querySelectorAll('.btn-filtro-bloco').forEach((b) => b.classList.remove('ativo'));
      btn.classList.add('ativo');
      estado.filtroBloco = btn.dataset.bloco;
      if (estado.resultado) renderizarGridIndicadores(estado.resultado.indicadores, estado.resultado.comparacao);
    });
  }

  // Busca de indicadores
  const buscaInd = document.getElementById('buscaIndicadorInput');
  if (buscaInd) {
    buscaInd.addEventListener('input', (ev) => {
      estado.buscaIndicador = ev.target.value.trim();
      if (estado.resultado) renderizarGridIndicadores(estado.resultado.indicadores, estado.resultado.comparacao);
    });
  }

  // Filtro de unidade e equipe
  const selUni = document.getElementById('selectUnidade');
  if (selUni) {
    selUni.addEventListener('change', (ev) => {
      estado.unidade = ev.target.value;
      atualizar();
    });
  }

  const selEq = document.getElementById('selectEquipe');
  if (selEq) {
    selEq.addEventListener('change', (ev) => {
      estado.equipe = ev.target.value;
      atualizar();
    });
  }

  const chkComp = document.getElementById('chkCompararPeriodo');
  if (chkComp) {
    chkComp.addEventListener('change', (ev) => {
      estado.compararPeriodo = ev.target.checked;
    });
  }

  const btnRecalc = document.getElementById('btnAtualizar');
  if (btnRecalc) btnRecalc.addEventListener('click', () => atualizar(true));

  // Filtros de Ranking
  const toggleRank = document.getElementById('toggleTipoComparacao');
  if (toggleRank) {
    toggleRank.addEventListener('click', (ev) => {
      const btn = ev.target.closest('button');
      if (!btn) return;
      toggleRank.querySelectorAll('button').forEach((b) => b.classList.remove('ativo'));
      btn.classList.add('ativo');
      estado.filtroRanking = btn.dataset.alvo;
      renderizarComparacaoRanking();
    });
  }

  const buscaRank = document.getElementById('buscaRankingInput');
  if (buscaRank) {
    buscaRank.addEventListener('input', (ev) => {
      estado.buscaRanking = ev.target.value.trim();
      renderizarComparacaoRanking();
    });
  }

  // Filtro de Status do Plano de Ação
  const contStatusPlano = document.getElementById('filtroStatusPlano');
  if (contStatusPlano) {
    contStatusPlano.addEventListener('click', (ev) => {
      const btn = ev.target.closest('button');
      if (!btn) return;
      contStatusPlano.querySelectorAll('button').forEach((b) => b.classList.remove('ativo'));
      btn.classList.add('ativo');
      estado.filtroStatusPlano = btn.dataset.status;
      renderizarPlanosAcao();
    });
  }

  // Detalhe: Pendências e Busca Nominal
  const chkPend = document.getElementById('soPendencia');
  if (chkPend) {
    chkPend.addEventListener('change', (ev) => {
      estado.soPendencia = ev.target.checked;
      estado.pagina = 1;
      if (estado.detalhe) renderizarDetalhePessoas(estado.detalhe);
    });
  }

  const buscaPess = document.getElementById('buscaPessoa');
  if (buscaPess) {
    buscaPess.addEventListener('input', (ev) => {
      estado.buscaPessoa = ev.target.value.trim();
      estado.pagina = 1;
      if (estado.detalhe) renderizarDetalhePessoas(estado.detalhe);
    });
  }

  const btnAnt = document.getElementById('btnAnterior');
  const btnProx = document.getElementById('btnProxima');
  if (btnAnt) {
    btnAnt.addEventListener('click', () => {
      if (estado.pagina > 1) {
        estado.pagina--;
        if (estado.detalhe) renderizarDetalhePessoas(estado.detalhe);
      }
    });
  }
  if (btnProx) {
    btnProx.addEventListener('click', () => {
      estado.pagina++;
      if (estado.detalhe) renderizarDetalhePessoas(estado.detalhe);
    });
  }

  const btnExp = document.getElementById('btnExportar');
  if (btnExp) btnExp.addEventListener('click', exportarCsv);

  const btnDem = document.getElementById('btnDemonstrar');
  if (btnDem) {
    btnDem.addEventListener('click', () => {
      const url = new URL(window.location.href);
      if (url.searchParams.get('demo') === '1') url.searchParams.delete('demo');
      else url.searchParams.set('demo', '1');
      window.location.href = url.toString();
    });
  }

  configurarModalPlano();
}

// ---------------------------------------------------------------------------
// Inicialização da Aplicação
// ---------------------------------------------------------------------------
async function iniciar() {
  mostrarLoading('Conectando ao e-SUS APS', 'Verificando credenciais e apurando indicadores no banco de dados…', true);
  try {
    configurarEventos();
    configurarAtalhosPeriodo();
    await carregarSessao();
    await carregarStatus();
    await carregarUnidades();
    await atualizar(false);
    await carregarPlanosAcao();
  } catch (e) {
    console.error('Erro na inicialização:', e);
  } finally {
    esconderLoading();
  }
}

iniciar();
