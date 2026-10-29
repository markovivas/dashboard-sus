'use strict';

const { dentroDe } = require('./indicadores');

function paraData(v) {
  if (!v) return null;
  if (typeof v === 'number') return new Date(v);
  const s = String(v);
  const d = new Date(s.length === 10 ? s + 'T00:00:00' : s);
  return isNaN(d.getTime()) ? null : d;
}

function idadeEm(nascimento, ref) {
  const n = paraData(nascimento);
  if (!n) return null;
  const b = ref || new Date();
  let idade = b.getFullYear() - n.getFullYear();
  const m = b.getMonth() - n.getMonth();
  if (m < 0 || (m === 0 && b.getDate() < n.getDate())) idade--;
  return idade;
}

function temConsultaRecente(linha, dias, ref) {
  return (
    dentroDe(linha.dataUltimoAtendimentoMedico, dias, ref) ||
    dentroDe(linha.dataUltimoAtendimentoEnfermagem, dias, ref)
  );
}

function calcularPeriodoAnterior(periodo) {
  if (!periodo || !periodo.inicio || !periodo.fim) return null;
  const dIni = new Date(periodo.inicio + 'T00:00:00');
  const dFim = new Date(periodo.fim + 'T23:59:59');
  if (isNaN(dIni.getTime()) || isNaN(dFim.getTime())) return null;

  const anoIni = dIni.getFullYear();
  const mesIni = dIni.getMonth() + 1;
  const diaIni = dIni.getDate();
  const mesFim = dFim.getMonth() + 1;
  const diaFim = dFim.getDate();

  // Q1: Jan 1 a Abr 30 -> Anterior: Q3 ano anterior
  if (mesIni === 1 && diaIni === 1 && mesFim === 4 && diaFim >= 30) {
    return {
      inicio: `${anoIni - 1}-09-01`,
      fim: `${anoIni - 1}-12-31`,
      rotulo: `Q3/${anoIni - 1}`
    };
  }
  // Q2: Mai 1 a Ago 31 -> Anterior: Q1 mesmo ano
  if (mesIni === 5 && diaIni === 1 && mesFim === 8 && diaFim >= 31) {
    return {
      inicio: `${anoIni}-01-01`,
      fim: `${anoIni}-04-30`,
      rotulo: `Q1/${anoIni}`
    };
  }
  // Q3: Set 1 a Dez 31 -> Anterior: Q2 mesmo ano
  if (mesIni === 9 && diaIni === 1 && mesFim === 12 && diaFim >= 31) {
    return {
      inicio: `${anoIni}-05-01`,
      fim: `${anoIni}-08-31`,
      rotulo: `Q2/${anoIni}`
    };
  }

  // Genérico: desloca pelo mesmo número de dias
  const duracao = dFim.getTime() - dIni.getTime();
  const antFim = new Date(dIni.getTime() - 86400000);
  const antIni = new Date(antFim.getTime() - duracao);
  return {
    inicio: antIni.toISOString().slice(0, 10),
    fim: antFim.toISOString().slice(0, 10),
    rotulo: 'Período anterior'
  };
}

function calcularISF(indicadores) {
  if (!Array.isArray(indicadores) || !indicadores.length) {
    return {
      valor: null,
      nota10: null,
      faixa: null,
      distribuicao: { otimo: 0, bom: 0, suficiente: 0, regular: 0, sem_dados: 0 },
      blocos: {}
    };
  }

  const distribuicao = { otimo: 0, bom: 0, suficiente: 0, regular: 0, sem_dados: 0 };
  const porBloco = {
    'eSF/eAP': [],
    eSB: [],
    eMulti: []
  };

  const avaliadosGerais = [];

  for (const ind of indicadores) {
    if (ind.faixa && ind.faixa.cor) {
      if (distribuicao[ind.faixa.cor] !== undefined) {
        distribuicao[ind.faixa.cor]++;
      }
    } else {
      distribuicao.sem_dados++;
    }

    if (ind.valor !== null && ind.valor !== undefined && !isNaN(ind.valor)) {
      avaliadosGerais.push(Number(ind.valor));
      if (porBloco[ind.bloco]) {
        porBloco[ind.bloco].push(Number(ind.valor));
      }
    }
  }

  const media = (lista) => {
    if (!lista.length) return null;
    const soma = lista.reduce((a, b) => a + b, 0);
    return Math.round((soma / lista.length) * 10) / 10;
  };

  const valorGeral = media(avaliadosGerais);
  const nota10 = valorGeral !== null ? Math.round((valorGeral / 10) * 100) / 100 : null;

  const faixaDeNota = (v) => {
    if (v === null || v === undefined) return null;
    if (v >= 75) return { nome: 'Ótimo', cor: 'otimo' };
    if (v >= 50) return { nome: 'Bom', cor: 'bom' };
    if (v >= 25) return { nome: 'Suficiente', cor: 'suficiente' };
    return { nome: 'Regular', cor: 'regular' };
  };

  const blocosResumo = {};
  for (const [bloco, valores] of Object.entries(porBloco)) {
    const med = media(valores);
    blocosResumo[bloco] = {
      media: med,
      nota10: med !== null ? Math.round((med / 10) * 100) / 100 : null,
      avaliados: valores.length,
      faixa: faixaDeNota(med)
    };
  }

  return {
    valor: valorGeral,
    nota10,
    faixa: faixaDeNota(valorGeral),
    distribuicao,
    blocos: blocosResumo,
    totalIndicadores: indicadores.length,
    totalAvaliados: avaliadosGerais.length
  };
}

function extrairLinhas(fontes, id) {
  const f = fontes && fontes[id];
  if (!f || !f.dados || !Array.isArray(f.dados.linhas)) return [];
  return f.dados.linhas;
}

function gerarPrioridadesClinicas(fontes, ctx, indicadores) {
  const prioridades = [];
  const ref = (ctx && ctx.ref) || new Date();

  // 1. Cuidado da pessoa com Diabetes (C4)
  const linDiab = extrairLinhas(fontes, 'listagemDiabetes');
  if (linDiab.length) {
    const semPe = linDiab.filter((l) => !dentroDe(l.dataUltimoPeDiabetico, 365, ref)).length;
    if (semPe > 0) {
      prioridades.push({
        id: 'c4_pe_diabetico',
        indicadorId: 4,
        indicadorCodigo: 'C4',
        indicadorTitulo: 'Cuidado da pessoa com diabetes',
        titulo: 'Realizar exame do pé diabético em diabéticos vinculados',
        descricao: 'Avaliação clínica dos pés com teste de sensibilidade monofilamento e pulsos periféricos registrada no prontuário.',
        categoriaAcao: 'Procedimento Clínico',
        perfilAlvo: 'Médicos e Enfermeiros',
        pendentes: semPe,
        total: linDiab.length,
        percentualPendente: Math.round((semPe / linDiab.length) * 1000) / 10,
        impactoPontos: '+15 pts no C4',
        pesoPratica: 15,
        prioridade: 'alta'
      });
    }

    const semGlicada = linDiab.filter((l) => !dentroDe(l.dataUltimaHemoglobinaGlicada, 365, ref)).length;
    if (semGlicada > 0) {
      prioridades.push({
        id: 'c4_hemoglobina_glicada',
        indicadorId: 4,
        indicadorCodigo: 'C4',
        indicadorTitulo: 'Cuidado da pessoa com diabetes',
        titulo: 'Solicitar ou avaliar exame de Hemoglobina Glicada',
        descricao: 'Registro do exame laboratorial de HbA1c solicitado ou avaliado nos últimos 12 meses.',
        categoriaAcao: 'Exames Laboratoriais',
        perfilAlvo: 'Médicos e Enfermeiros',
        pendentes: semGlicada,
        total: linDiab.length,
        percentualPendente: Math.round((semGlicada / linDiab.length) * 1000) / 10,
        impactoPontos: '+15 pts no C4',
        pesoPratica: 15,
        prioridade: 'alta'
      });
    }

    const semAcsDiab = linDiab.filter((l) => !l.visitasAcs30d).length;
    if (semAcsDiab > 0) {
      prioridades.push({
        id: 'c4_visitas_acs',
        indicadorId: 4,
        indicadorCodigo: 'C4',
        indicadorTitulo: 'Cuidado da pessoa com diabetes',
        titulo: '2 visitas domiciliares de ACS (intervalo de 30 dias) para diabéticos',
        descricao: 'Visitas domiciliares de acompanhamento pelo Agente Comunitário de Saúde registradas no e-SUS.',
        categoriaAcao: 'Visita Domiciliar',
        perfilAlvo: 'ACS / ACE',
        pendentes: semAcsDiab,
        total: linDiab.length,
        percentualPendente: Math.round((semAcsDiab / linDiab.length) * 1000) / 10,
        impactoPontos: '+20 pts no C4',
        pesoPratica: 20,
        prioridade: 'media'
      });
    }
  }

  // 2. Cuidado da pessoa com Hipertensão (C5)
  const linHas = extrairLinhas(fontes, 'listagemHipertensao');
  if (linHas.length) {
    const semPa = linHas.filter(
      (l) => !dentroDe(l.dataUltimaMedicaoPressaoArterial, 183, ref) || !l.ultimaMedicaoPressaoArterial
    ).length;
    if (semPa > 0) {
      prioridades.push({
        id: 'c5_afericao_pa',
        indicadorId: 5,
        indicadorCodigo: 'C5',
        indicadorTitulo: 'Cuidado da pessoa com hipertensão',
        titulo: 'Aferir e registrar Pressão Arterial de pessoas com hipertensão',
        descricao: 'Pelo menos 01 registro de PA nos últimos 06 meses para acompanhamento clínico adequado.',
        categoriaAcao: 'Procedimento Clínico',
        perfilAlvo: 'Médicos, Enfermeiros e Técnicos',
        pendentes: semPa,
        total: linHas.length,
        percentualPendente: Math.round((semPa / linHas.length) * 1000) / 10,
        impactoPontos: '+25 pts no C5',
        pesoPratica: 25,
        prioridade: 'alta'
      });
    }

    const semConsultaHas = linHas.filter((l) => !temConsultaRecente(l, 183, ref)).length;
    if (semConsultaHas > 0) {
      prioridades.push({
        id: 'c5_consulta_6m',
        indicadorId: 5,
        indicadorCodigo: 'C5',
        indicadorTitulo: 'Cuidado da pessoa com hipertensão',
        titulo: 'Consulta clínica semestral para hipertensos vinculados',
        descricao: 'Consulta médica ou de enfermagem nos últimos 6 meses para renovação de conduta e controle pressórico.',
        categoriaAcao: 'Consulta Clínica',
        perfilAlvo: 'Médicos e Enfermeiros',
        pendentes: semConsultaHas,
        total: linHas.length,
        percentualPendente: Math.round((semConsultaHas / linHas.length) * 1000) / 10,
        impactoPontos: '+25 pts no C5',
        pesoPratica: 25,
        prioridade: 'alta'
      });
    }
  }

  // 3. Gestantes e Puérperas (C3)
  const linGest = extrairLinhas(fontes, 'listagemGestante');
  if (linGest.length) {
    const semOdonto = linGest.filter((l) => !l.dataUltimoAtendimentoOdontologico).length;
    if (semOdonto > 0) {
      prioridades.push({
        id: 'c3_saude_bucal_gestante',
        indicadorId: 6,
        indicadorCodigo: 'C3',
        indicadorTitulo: 'Cuidado da gestante e do puerpério',
        titulo: 'Atendimento odontológico para gestantes no pré-natal',
        descricao: 'Consulta e orientação em saúde bucal realizada por Cirurgião-Dentista ou TSB durante o ciclo gestacional.',
        categoriaAcao: 'Saúde Bucal',
        perfilAlvo: 'Cirurgiões-Dentistas',
        pendentes: semOdonto,
        total: linGest.length,
        percentualPendente: Math.round((semOdonto / linGest.length) * 1000) / 10,
        impactoPontos: '+9 pts no C3',
        pesoPratica: 9,
        prioridade: 'alta'
      });
    }

    const semDtpa = linGest.filter((l) => !l.vacinaEmDia).length;
    if (semDtpa > 0) {
      prioridades.push({
        id: 'c3_vacina_dtpa',
        indicadorId: 6,
        indicadorCodigo: 'C3',
        indicadorTitulo: 'Cuidado da gestante e do puerpério',
        titulo: 'Aplicação da vacina dTpa a partir da 20ª semana gestacional',
        descricao: 'Imunização materna para proteção neonatal contra coqueluche, tétano e difteria.',
        categoriaAcao: 'Imunização',
        perfilAlvo: 'Enfermagem / Sala de Vacina',
        pendentes: semDtpa,
        total: linGest.length,
        percentualPendente: Math.round((semDtpa / linGest.length) * 1000) / 10,
        impactoPontos: '+9 pts no C3',
        pesoPratica: 9,
        prioridade: 'alta'
      });
    }

    const semPuerperio = linGest.filter((l) => !l.dataUltimoAtendimentoEnfermagem).length;
    if (semPuerperio > 0) {
      prioridades.push({
        id: 'c3_consulta_puerperio',
        indicadorId: 6,
        indicadorCodigo: 'C3',
        indicadorTitulo: 'Cuidado da gestante e do puerpério',
        titulo: 'Consulta de puerpério até o 42º dia pós-parto',
        descricao: 'Consulta presencial ou remota com médico ou enfermeiro para avaliação da puérpera e do recém-nascido.',
        categoriaAcao: 'Consulta Clínica',
        perfilAlvo: 'Médicos e Enfermeiros',
        pendentes: semPuerperio,
        total: linGest.length,
        percentualPendente: Math.round((semPuerperio / linGest.length) * 1000) / 10,
        impactoPontos: '+9 pts no C3',
        pesoPratica: 9,
        prioridade: 'alta'
      });
    }
  }

  // 4. Prevenção do Câncer na Mulher (C7)
  const linMulher = extrairLinhas(fontes, 'listagemSaudeMulher');
  if (linMulher.length) {
    const elegiveisColo = linMulher.filter((l) => {
      const id = idadeEm(l.dataNascimentoCidadao, ref);
      return id !== null && id >= 25 && id <= 64;
    });
    const semColo = elegiveisColo.filter((l) => !dentroDe(l.dataUltimoCitopatologico, 36 * 30.4, ref)).length;
    if (semColo > 0 && elegiveisColo.length > 0) {
      prioridades.push({
        id: 'c7_citopatologico_colo',
        indicadorId: 7,
        indicadorCodigo: 'C7',
        indicadorTitulo: 'Prevenção de câncer na mulher',
        titulo: 'Rastreamento de câncer do colo de útero (25 a 64 anos)',
        descricao: 'Mulheres na faixa alvo que não realizaram citopatológico nos últimos 36 meses (busca ativa prioritária).',
        categoriaAcao: 'Rastreamento Oncológico',
        perfilAlvo: 'Enfermeiros e Médicos',
        pendentes: semColo,
        total: elegiveisColo.length,
        percentualPendente: Math.round((semColo / elegiveisColo.length) * 1000) / 10,
        impactoPontos: '+20 pts no C7',
        pesoPratica: 20,
        prioridade: 'alta'
      });
    }

    const elegiveisMama = linMulher.filter((l) => {
      const id = idadeEm(l.dataNascimentoCidadao, ref);
      return id !== null && id >= 50 && id <= 69;
    });
    const semMama = elegiveisMama.filter((l) => !dentroDe(l.dataUltimaMamografia, 24 * 30.4, ref)).length;
    if (semMama > 0 && elegiveisMama.length > 0) {
      prioridades.push({
        id: 'c7_mamografia_rastreamento',
        indicadorId: 7,
        indicadorCodigo: 'C7',
        indicadorTitulo: 'Prevenção de câncer na mulher',
        titulo: 'Rastreamento bienal de câncer de mama (50 a 69 anos)',
        descricao: 'Solicitação ou realização de mamografia de rastreamento para mulheres de 50 a 69 anos.',
        categoriaAcao: 'Rastreamento Oncológico',
        perfilAlvo: 'Médicos e Enfermeiros',
        pendentes: semMama,
        total: elegiveisMama.length,
        percentualPendente: Math.round((semMama / elegiveisMama.length) * 1000) / 10,
        impactoPontos: '+20 pts no C7',
        pesoPratica: 20,
        prioridade: 'media'
      });
    }
  }

  // 5. Saúde Bucal (B1 e B3)
  const linBucal = extrairLinhas(fontes, 'listagemSaudeBucal');
  if (linBucal.length) {
    const semEscovacao = linBucal.filter((l) => {
      const id = idadeEm(l.dataNascimentoCidadao, ref);
      return id !== null && id >= 6 && id <= 14 && Number(l.escovacaoSupervisionada || 0) === 0;
    }).length;
    const totalEscolares = linBucal.filter((l) => {
      const id = idadeEm(l.dataNascimentoCidadao, ref);
      return id !== null && id >= 6 && id <= 14;
    }).length;

    if (semEscovacao > 0 && totalEscolares > 0) {
      prioridades.push({
        id: 'b1_escovacao_supervisionada',
        indicadorId: 10,
        indicadorCodigo: 'B1',
        indicadorTitulo: 'Escovação dental supervisionada',
        titulo: 'Ação coletiva de escovação supervisionada escolar (6 a 14 anos)',
        descricao: 'Atividade coletiva de saúde bucal com aplicação de flúor e escovação dental supervisionada registrada no e-SUS.',
        categoriaAcao: 'Saúde Bucal Coletiva',
        perfilAlvo: 'Cirurgiões-Dentistas e ASB/TSB',
        pendentes: semEscovacao,
        total: totalEscolares,
        percentualPendente: Math.round((semEscovacao / totalEscolares) * 1000) / 10,
        impactoPontos: 'Eleva indicador B1',
        pesoPratica: 25,
        prioridade: 'alta'
      });
    }
  }

  // 6. Idoso (C6)
  const linIdoso = extrairLinhas(fontes, 'listagemIdosa');
  if (linIdoso.length) {
    const semVacinaIdoso = linIdoso.filter((l) => !dentroDe(l.dataUltimaVacinaInfluenza, 365, ref)).length;
    if (semVacinaIdoso > 0) {
      prioridades.push({
        id: 'c6_vacina_influenza',
        indicadorId: 8,
        indicadorCodigo: 'C6',
        indicadorTitulo: 'Cuidado da pessoa idosa',
        titulo: 'Vacinação contra Influenza em idosos vinculados (60+ anos)',
        descricao: 'Registro da dose anual da vacina contra a gripe no prontuário eletrônico do idoso.',
        categoriaAcao: 'Imunização',
        perfilAlvo: 'Sala de Vacina e ACS',
        pendentes: semVacinaIdoso,
        total: linIdoso.length,
        percentualPendente: Math.round((semVacinaIdoso / linIdoso.length) * 1000) / 10,
        impactoPontos: '+25 pts no C6',
        pesoPratica: 25,
        prioridade: 'alta'
      });
    }
  }

  // Ordena prioridades pelo maior número de pacientes pendentes e maior impacto
  prioridades.sort((a, b) => {
    if (a.prioridade === 'alta' && b.prioridade !== 'alta') return -1;
    if (b.prioridade === 'alta' && a.prioridade !== 'alta') return 1;
    return (b.pesoPratica || 0) - (a.pesoPratica || 0);
  });

  return prioridades;
}

function gerarAnaliseDecisao(indicadores, isf, prioridades, deltas, ctx) {
  const criticos = (indicadores || []).filter(
    (i) => i.faixa && (i.faixa.cor === 'regular' || i.faixa.cor === 'suficiente')
  );
  const otimos = (indicadores || []).filter((i) => i.faixa && i.faixa.cor === 'otimo');

  const variacaoIsf = deltas && deltas.deltaIsf !== undefined ? deltas.deltaIsf : null;

  return {
    perguntas: [
      {
        numero: 1,
        pergunta: 'Como está o desempenho da minha equipe ou unidade?',
        respostaResumida: isf.nota10 !== null
          ? `Nota Sintética Final (ISF) atual é ${isf.nota10.toFixed(2)} (${isf.faixa ? isf.faixa.nome : 'Sem faixa'}), com ${otimos.length} indicador(es) na faixa Ótimo e ${criticos.length} necessitando de intervenção.`
          : 'Desempenho em apuração aguardando consolidação das fontes de dados.',
        fatos: [
          `ISF Geral: ${isf.nota10 !== null ? isf.nota10.toFixed(2) : '—'} / 10.0`,
          `Indicadores Ótimo: ${isf.distribuicao.otimo}`,
          `Indicadores Bom: ${isf.distribuicao.bom}`,
          `Indicadores Suficiente: ${isf.distribuicao.suficiente}`,
          `Indicadores Regular: ${isf.distribuicao.regular}`
        ]
      },
      {
        numero: 2,
        pergunta: 'Quais indicadores precisam de mais atenção?',
        respostaResumida: criticos.length
          ? `${criticos.length} indicador(es) estão nas faixas Regular ou Suficiente, exigindo atenção clínica e gerencial prioritária.`
          : 'Nenhum indicador em faixa crítica neste período.',
        indicadoresCriticos: criticos.map((c) => ({
          id: c.id,
          codigo: c.codigo || c.id,
          titulo: c.titulo,
          valor: c.valor,
          faixa: c.faixa ? c.faixa.nome : 'Sem faixa',
          cor: c.faixa ? c.faixa.cor : 'regular'
        }))
      },
      {
        numero: 3,
        pergunta: 'O que mudou em relação ao período anterior?',
        respostaResumida: variacaoIsf !== null
          ? `O ISF ${variacaoIsf > 0 ? 'subiu +' + variacaoIsf.toFixed(2) : variacaoIsf < 0 ? 'caiu ' + variacaoIsf.toFixed(2) : 'manteve-se estável'} em relação à competência anterior (${deltas.periodoAnteriorRotulo || 'anterior'}).`
          : 'Sem histórico anterior suficiente para cálculo de delta comparativo.',
        deltaIsf: variacaoIsf,
        periodoAnterior: deltas ? deltas.periodoAnteriorRotulo : null
      },
      {
        numero: 4,
        pergunta: 'Quais fatores podem explicar o resultado?',
        respostaResumida: 'A análise detalhada dos microdados identifica os gargalos específicos de boas práticas clínicas não registradas no e-SUS PEC.',
        gargalosIdentificados: prioridades.slice(0, 4).map((p) => ({
          indicador: p.indicadorTitulo,
          gargalo: `${p.pendentes} cidadãos (${p.percentualPendente}%) com pendência de: ${p.titulo}.`,
          impacto: p.impactoPontos
        }))
      },
      {
        numero: 5,
        pergunta: 'Quais ações práticas podem ser priorizadas?',
        respostaResumida: 'Priorizar a busca ativa e a convocação nominal dos usuários com práticas pendentes de alto peso na pontuação.',
        acoesImediatas: prioridades.slice(0, 5)
      },
      {
        numero: 6,
        pergunta: 'Como acompanhar se as ações produziram melhorias?',
        respostaResumida: 'Utilize a aba "Plano de Ação" para designar responsáveis, prazos e metas de busca ativa, acompanhando a evolução dos indicadores nos fechamentos quadrimestrais.',
        metodologia: 'Ciclos de Melhoria Contínua (PDCA) por Quadrimestre: Planejar na aba Plano de Ação -> Executar buscas ativas na lista nominal -> Verificar na evolução dos cards -> Ajustar a cada fechamento do SISAB.'
      }
    ]
  };
}

module.exports = {
  calcularPeriodoAnterior,
  calcularISF,
  gerarPrioridadesClinicas,
  gerarAnaliseDecisao
};
