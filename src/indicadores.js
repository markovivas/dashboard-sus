'use strict';

const DIA = 86400000;

function paraData(v) {
  if (!v) return null;
  if (typeof v === 'number') return new Date(v);
  const s = String(v);
  const d = new Date(s.length === 10 ? s + 'T00:00:00' : s);
  return isNaN(d.getTime()) ? null : d;
}

function dentroDe(v, dias, ref) {
  const d = paraData(v);
  if (!d) return false;
  const base = ref || new Date();
  const delta = base.getTime() - d.getTime();
  return delta >= 0 && delta <= dias * DIA;
}

const HABILITADOS = 'implementada';
const PENDENTE = 'pendente';

function pratica(id, descricao, peso, avaliar, opcoes = {}) {
  return {
    id,
    descricao,
    peso,
    oficial: opcoes.oficial !== false,
    status: avaliar ? HABILITADOS : PENDENTE,
    avaliar: avaliar || null,
    fonte: opcoes.fonte || null
  };
}

function temConsultaRecente(linha, dias, ref) {
  return (
    dentroDe(linha.dataUltimoAtendimentoMedico, dias, ref) ||
    dentroDe(linha.dataUltimoAtendimentoEnfermagem, dias, ref)
  );
}

function temQualquerAtendimento(linha, dias, ref) {
  return (
    temConsultaRecente(linha, dias, ref) ||
    dentroDe(linha.dataUltimoAtendimentoOdontologico, dias, ref) ||
    dentroDe(linha.dataUltimaVisitaDomiciliar, dias, ref)
  );
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

function taxa(numerador, denominador) {
  if (!denominador) return { numerador, denominador, valor: null };
  return {
    numerador,
    denominador,
    valor: Math.round((numerador / denominador) * 1000) / 10
  };
}

function calcularPessoa(linhas, praticas) {
  const implementadas = praticas.filter((p) => p.status === HABILITADOS);
  if (!linhas.length || !implementadas.length) {
    return { numerador: 0, denominador: linhas.length, valor: null, pessoas: linhas.length };
  }
  let somaFracao = 0;
  let somaPesoTotal = 0;
  for (const linha of linhas) {
    let executado = 0;
    let total = 0;
    for (const p of implementadas) {
      total += p.peso;
      if (p.avaliar(linha)) executado += p.peso;
    }
    somaFracao += total ? executado / total : 0;
    somaPesoTotal += total;
  }
  const media = somaFracao / linhas.length;
  return {
    numerador: Math.round(media * implementadas.length * linhas.length * 100) / 100,
    denominador: linhas.length,
    valor: Math.round(media * 1000) / 10,
    pessoas: linhas.length,
    somaPesoTotal
  };
}

function calcularPopulacao(linhas, praticas) {
  const implementadas = praticas.filter((p) => p.status === HABILITADOS && (p.calcular || p.avaliar));
  if (!implementadas.length) return { numerador: 0, denominador: 0, valor: null };
  let soma = 0;
  let pesos = 0;
  for (const p of implementadas) {
    let razao = null;
    if (p.calcular) {
      razao = p.calcular(linhas);
    } else if (linhas && linhas.length) {
      razao = linhas.filter((l) => p.avaliar(l)).length / linhas.length;
    }
    if (razao === null || razao === undefined) continue;
    soma += p.peso * razao;
    pesos += p.peso;
  }
  if (!pesos) return { numerador: 0, denominador: 0, valor: null };
  return {
    numerador: Math.round(soma * 100) / 100,
    denominador: pesos,
    valor: Math.round((soma / pesos) * 1000) / 10
  };
}

function linhasDe(fontes, id) {
  const f = fontes[id];
  if (!f || f.status !== 'ok' || !f.dados) return null;
  return f.dados.linhas || null;
}

const FAIXAS = [
  { min: 75, max: 100, nome: 'Otimo', cor: 'otimo' },
  { min: 50.000001, max: 75, nome: 'Bom', cor: 'bom' },
  { min: 25.000001, max: 50, nome: 'Suficiente', cor: 'suficiente' },
  { min: -1, max: 25, nome: 'Regular', cor: 'regular' }
];

function faixaDe(valor, ind) {
  if (valor === null || valor === undefined) return null;
  const id = typeof ind === 'object' ? (ind && ind.id) : ind;
  if (id === 3 || id === 'C1' || id === '3') {
    if (valor > 50 && valor <= 70) return { min: 50, max: 70, nome: 'Otimo', cor: 'otimo' };
    if (valor > 30 && valor <= 50) return { min: 30, max: 50, nome: 'Bom', cor: 'bom' };
    if (valor > 10 && valor <= 30) return { min: 10, max: 30, nome: 'Suficiente', cor: 'suficiente' };
    return { min: 0, max: 10, nome: 'Regular', cor: 'regular' };
  }
  // Indicador 15 (B6 - Taxa de exodontias) sentido inverso
  if (id === 15 || id === 'B6' || id === '15') {
    if (valor <= 8) return { min: 0, max: 8, nome: 'Otimo', cor: 'otimo' };
    if (valor <= 12) return { min: 8, max: 12, nome: 'Bom', cor: 'bom' };
    if (valor <= 20) return { min: 12, max: 20, nome: 'Suficiente', cor: 'suficiente' };
    return { min: 20, max: 100, nome: 'Regular', cor: 'regular' };
  }
  return FAIXAS.find((f) => valor > f.min - 0.000001 && valor <= f.max) || null;
}

const INDICADORES = [
  {
    id: 1,
    bloco: 'eMulti',
    titulo: 'Acoes interprofissionais realizadas pela eMulti',
    fontes: ['emulti', 'atendimentos'],
    estilo: 'pendente',
    formula:
      'Nao confirmada na ficha tecnica. Espera-se: acoes interprofissionais registradas pela eMulti no periodo / equipes eMulti (ou populacao assistida).',
    proximosPassos: [
      'Confirmar formula na ficha tecnica do indicador C1',
      'Liberar acesso municipal para consultar atendimentos das equipes eMulti'
    ],
    calcular: (fontes) => ({ numerador: null, denominador: null, valor: null })
  },
  {
    id: 2,
    bloco: 'eMulti',
    titulo: 'Media de atendimentos por pessoa assistida pela eMulti',
    fontes: ['emulti', 'atendimentos', 'listagemGeral'],
    estilo: 'pendente',
    formula: 'Nao confirmada. Espera-se: atendimentos da eMulti / pessoas distintas assistidas pela eMulti.',
    proximosPassos: [
      'Confirmar formula na ficha tecnica do indicador C2',
      'Obter contagem distinta de pessoas assistidas (relatorio gerencial de atendimento)'
    ],
    calcular: (fontes) => ({ numerador: null, denominador: null, valor: null })
  },
  {
    id: 3,
    bloco: 'eSF/eAP',
    titulo: 'Mais acesso a APS',
    fontes: ['demandaAcesso'],
    estilo: 'agregado',
    formula:
      'Nº total de atendimentos por demanda programada (consulta agendada programada, cuidado continuado e consulta agendada) / total de atendimentos por todos os tipos de demanda (programada + espontânea) x 100.',
    formulaOficial: 'confirmada',
    calcularAgregado: (linhas) => {
      const prog = linhas.reduce((s, l) => s + (Number(l.programada) || 0), 0);
      const total = linhas.reduce((s, l) => s + (Number(l.total) || 0), 0);
      return taxa(prog, total);
    },
    proximosPassos: []
  },
  {
    id: 4,
    bloco: 'eSF/eAP',
    titulo: 'Cuidado da pessoa com diabetes',
    fontes: ['listagemDiabetes'],
    estilo: 'pessoa',
    formula:
      'Somatório das boas práticas pontuadas para pessoas com diabetes / total de pessoas com diabetes vinculadas x 100.',
    formulaOficial: 'confirmada',
    novasPraticas: (ctx) => [
      pratica(
        'consulta-6m',
        '(A) Pelo menos 01 consulta com médico(a) ou enfermeiro(a) nos últimos 06 meses (20 pts)',
        20,
        (linha) => temConsultaRecente(linha, 183, ctx.ref),
        { fonte: 'listagemDiabetes' }
      ),
      pratica(
        'pa-6m',
        '(B) Pelo menos 01 registro de aferição da pressão arterial nos últimos 06 meses (15 pts)',
        15,
        (linha) => dentroDe(linha.dataUltimaMedicaoPressaoArterial, 183, ctx.ref) && !!linha.ultimaMedicaoPressaoArterial,
        { fonte: 'listagemDiabetes' }
      ),
      pratica(
        'peso-altura-12m',
        '(C) Pelo menos 01 registro simultâneo de peso e altura nos últimos 12 meses (15 pts)',
        15,
        (linha) => dentroDe(linha.dataUltimaMedicaoPesoAltura, 365, ctx.ref) && !!(linha.ultimaMedicaoPeso && linha.ultimaMedicaoAltura),
        { fonte: 'listagemDiabetes' }
      ),
      pratica(
        'visitas-acs-30d',
        '(D) Pelo menos 02 visitas domiciliares de ACS (intervalo mín. 30 dias) nos últimos 12 meses (20 pts)',
        20,
        (linha) => !!linha.visitasAcs30d,
        { fonte: 'listagemDiabetes' }
      ),
      pratica(
        'hemoglobina-glicada',
        '(E) Pelo menos 01 registro de Hemoglobina Glicada solicitada ou avaliada nos últimos 12 meses (15 pts)',
        15,
        (linha) => dentroDe(linha.dataUltimaHemoglobinaGlicada, 365, ctx.ref),
        { fonte: 'listagemDiabetes' }
      ),
      pratica(
        'pe-diabetico',
        '(F) Exame do pé diabético (03.01.04.009-5) registrado nos últimos 12 meses (15 pts)',
        15,
        (linha) => dentroDe(linha.dataUltimoPeDiabetico, 365, ctx.ref),
        { fonte: 'listagemDiabetes' }
      )
    ],
    proximosPassos: []
  },
  {
    id: 5,
    bloco: 'eSF/eAP',
    titulo: 'Cuidado da pessoa com hipertensao',
    fontes: ['listagemHipertensao'],
    estilo: 'pessoa',
    formula:
      'Somatório das boas práticas pontuadas para pessoas com HAS / total de pessoas com HAS vinculadas x 100.',
    formulaOficial: 'confirmada',
    novasPraticas: (ctx) => [
      pratica(
        'consulta-6m',
        '(A) Pelo menos 01 consulta com médico(a) ou enfermeiro(a) nos últimos 06 meses (25 pts)',
        25,
        (linha) => temConsultaRecente(linha, 183, ctx.ref),
        { fonte: 'listagemHipertensao' }
      ),
      pratica(
        'pa-6m',
        '(B) Pelo menos 01 registro de aferição da pressão arterial nos últimos 06 meses (25 pts)',
        25,
        (linha) => dentroDe(linha.dataUltimaMedicaoPressaoArterial, 183, ctx.ref) && !!linha.ultimaMedicaoPressaoArterial,
        { fonte: 'listagemHipertensao' }
      ),
      pratica(
        'peso-altura-12m',
        '(C) Pelo menos 01 registro simultâneo de peso e altura nos últimos 12 meses (25 pts)',
        25,
        (linha) => dentroDe(linha.dataUltimaMedicaoPesoAltura, 365, ctx.ref) && !!(linha.ultimaMedicaoPeso && linha.ultimaMedicaoAltura),
        { fonte: 'listagemHipertensao' }
      ),
      pratica(
        'visitas-acs-30d',
        '(D) Pelo menos 02 visitas domiciliares de ACS (intervalo mín. 30 dias) nos últimos 12 meses (25 pts)',
        25,
        (linha) => !!linha.visitasAcs30d,
        { fonte: 'listagemHipertensao' }
      )
    ],
    proximosPassos: []
  },
  {
    id: 6,
    bloco: 'eSF/eAP',
    titulo: 'Cuidado da gestante e do puerperio',
    fontes: ['listagemGestante'],
    estilo: 'pessoa',
    formula:
      'Somatório das boas práticas pontuadas para gestantes e puérperas / total de gestantes e puérperas vinculadas x 100.',
    formulaOficial: 'confirmada',
    novasPraticas: (ctx) => [
      pratica(
        'pre-natal-12s',
        '(A) 1ª consulta de pré-natal realizada até a 12ª semana de gestação (10 pts)',
        10,
        (linha) => linha.idadeGestacionalPrimeiraConsulta !== null && linha.idadeGestacionalPrimeiraConsulta !== undefined && Number(linha.idadeGestacionalPrimeiraConsulta) <= 12,
        { fonte: 'listagemGestante' }
      ),
      pratica(
        'consultas-prenatal',
        '(B) Pelo menos 07 consultas presenciais ou remotas durante o pré-natal (9 pts)',
        9,
        (linha) => Number(linha.qtdConsultas) >= 7,
        { fonte: 'listagemGestante' }
      ),
      pratica(
        'pa-prenatal',
        '(C) Pelo menos 07 registros de aferição de pressão arterial durante a gestação (9 pts)',
        9,
        (linha) => Number(linha.qtdAfericoesPa) >= 7,
        { fonte: 'listagemGestante' }
      ),
      pratica(
        'peso-altura-prenatal',
        '(D) Pelo menos 07 registros simultâneos de peso e altura durante a gestação (9 pts)',
        9,
        (linha) => Number(linha.qtdMedicoesPesoAltura) >= 7,
        { fonte: 'listagemGestante' }
      ),
      pratica(
        'visitas-acs-3',
        '(E) Pelo menos 03 visitas domiciliares de ACS após 1ª consulta de pré-natal (9 pts)',
        9,
        (linha) => Number(linha.qtdVisitasAcsGestacao) >= 3 || !!linha.dataUltimaVisitaDomiciliar,
        { fonte: 'listagemGestante' }
      ),
      pratica(
        'vacina-dtpa',
        '(F) Vacina dTpa registrada a partir da 20ª semana de gestação (9 pts)',
        9,
        (linha) => !!linha.vacinaEmDia,
        { fonte: 'listagemGestante' }
      ),
      pratica(
        'exames-1tri',
        '(G) Testes rápidos ou exames avaliados para sífilis, HIV e hepatites B e C no 1º trimestre (9 pts)',
        9,
        (linha) => !!(linha.solicitacaoVdrl || linha.avaliacaoVdrl),
        { fonte: 'listagemGestante' }
      ),
      pratica(
        'exames-3tri',
        '(H) Testes rápidos ou exames avaliados para sífilis e HIV no 3º trimestre (9 pts)',
        9,
        (linha) => !!linha.avaliacaoVdrl,
        { fonte: 'listagemGestante' }
      ),
      pratica(
        'consulta-puerperio',
        '(I) Pelo menos 01 consulta presencial ou remota médica ou enfermagem no puerpério (9 pts)',
        9,
        (linha) => !!linha.dataUltimoAtendimentoEnfermagem,
        { fonte: 'listagemGestante' }
      ),
      pratica(
        'visita-puerperio',
        '(J) Pelo menos 01 visita domiciliar de ACS durante o puerpério (9 pts)',
        9,
        (linha) => Number(linha.qtdVisitasAcsPuerperio) >= 1 || (!!linha.dataUltimaVisitaDomiciliar && !!linha.inicioPuerperio),
        { fonte: 'listagemGestante' }
      ),
      pratica(
        'saude-bucal',
        '(K) Atividade em saúde bucal realizada por dentista ou TSB durante a gestação (9 pts)',
        9,
        (linha) => !!linha.dataUltimoAtendimentoOdontologico,
        { fonte: 'listagemGestante' }
      )
    ],
    proximosPassos: []
  },
  {
    id: 7,
    bloco: 'eSF/eAP',
    titulo: 'Cuidado da mulher na prevencao do cancer',
    fontes: ['listagemSaudeMulher'],
    estilo: 'populacao',
    formula:
      '(A x 20 + B x 30 + C x 30 + D x 20) / 100, onde A = rastreamento colo de útero (25-64 anos, 36m ou HPV molecular 60m), B = vacina HPV (9-14 anos), C = atenção à saúde sexual e reprodutiva (14-69 anos, 12m), D = rastreamento câncer de mama (50-69 anos, 24m).',
    formulaOficial: 'confirmada',
    novasPraticas: (ctx) => [
      {
        ...pratica(
          'colo-36m',
          'A: rastreamento do câncer do colo de útero em mulheres de 25 a 64 anos (peso 20)',
          20,
          (linha) => {
            const i = idadeEm(linha.dataNascimentoCidadao, ctx.ref);
            if (i === null || i < 25 || i > 64) return false;
            return dentroDe(linha.dataUltimoCitopatologico, 36 * 30.4, ctx.ref);
          },
          { fonte: 'listagemSaudeMulher' }
        ),
        calcular: (linhas) => {
          const elegiveis = (linhas || []).filter((l) => {
            const i = idadeEm(l.dataNascimentoCidadao, ctx.ref);
            return i !== null && i >= 25 && i <= 64;
          });
          if (!elegiveis.length) return null;
          const feitos = elegiveis.filter((l) => dentroDe(l.dataUltimoCitopatologico, 36 * 30.4, ctx.ref));
          return feitos.length / elegiveis.length;
        }
      },
      {
        ...pratica(
          'hpv',
          'B: vacina HPV em crianças/adolescentes de 9 a 14 anos (peso 30)',
          30,
          (linha) => {
            const i = idadeEm(linha.dataNascimentoCidadao, ctx.ref);
            if (i === null || i < 9 || i > 14) return false;
            return !!linha.dataUltimaVacinaHpv;
          },
          { fonte: 'listagemSaudeMulher' }
        ),
        calcular: (linhas) => {
          const elegiveis = (linhas || []).filter((l) => {
            const i = idadeEm(l.dataNascimentoCidadao, ctx.ref);
            return i !== null && i >= 9 && i <= 14;
          });
          if (!elegiveis.length) return null;
          const feitos = elegiveis.filter((l) => !!l.dataUltimaVacinaHpv);
          return feitos.length / elegiveis.length;
        }
      },
      {
        ...pratica(
          'saude-sexual-reprodutiva',
          'C: atendimento de saúde sexual e reprodutiva nos últimos 12 meses (14 a 69 anos) (peso 30)',
          30,
          (linha) => {
            const i = idadeEm(linha.dataNascimentoCidadao, ctx.ref);
            if (i === null || i < 14 || i > 69) return false;
            return dentroDe(linha.dataUltimoAtendimentoSaudeSexual, 365, ctx.ref);
          },
          { fonte: 'listagemSaudeMulher' }
        ),
        calcular: (linhas) => {
          const elegiveis = (linhas || []).filter((l) => {
            const i = idadeEm(l.dataNascimentoCidadao, ctx.ref);
            return i !== null && i >= 14 && i <= 69;
          });
          if (!elegiveis.length) return null;
          const feitos = elegiveis.filter((l) => dentroDe(l.dataUltimoAtendimentoSaudeSexual, 365, ctx.ref));
          return feitos.length / elegiveis.length;
        }
      },
      {
        ...pratica(
          'mama-24m',
          'D: rastreamento de câncer de mama em mulheres de 50 a 69 anos nos últimos 24 meses (peso 20)',
          20,
          (linha) => {
            const i = idadeEm(linha.dataNascimentoCidadao, ctx.ref);
            if (i === null || i < 50 || i > 69) return false;
            return dentroDe(linha.dataUltimaMamografia, 24 * 30.4, ctx.ref);
          },
          { fonte: 'listagemSaudeMulher' }
        ),
        calcular: (linhas) => {
          const elegiveis = (linhas || []).filter((l) => {
            const i = idadeEm(l.dataNascimentoCidadao, ctx.ref);
            return i !== null && i >= 50 && i <= 69;
          });
          if (!elegiveis.length) return null;
          const feitos = elegiveis.filter((l) => dentroDe(l.dataUltimaMamografia, 24 * 30.4, ctx.ref));
          return feitos.length / elegiveis.length;
        }
      }
    ],
    proximosPassos: []
  },
  {
    id: 8,
    bloco: 'eSF/eAP',
    titulo: 'Cuidado da pessoa idosa',
    fontes: ['listagemIdosa'],
    estilo: 'pessoa',
    formula:
      'Somatório das boas práticas pontuadas para pessoas idosas (60+) / total de pessoas idosas vinculadas x 100.',
    formulaOficial: 'confirmada',
    novasPraticas: (ctx) => [
      pratica(
        'consulta-12m',
        '(A) Pelo menos 01 consulta presencial ou remota com médico(a) ou enfermeiro(a) nos últimos 12 meses (25 pts)',
        25,
        (linha) => temConsultaRecente(linha, 365, ctx.ref),
        { fonte: 'listagemIdosa' }
      ),
      pratica(
        'peso-altura-12m',
        '(B) Pelo menos 01 registro simultâneo de peso e altura nos últimos 12 meses (25 pts)',
        25,
        (linha) => dentroDe(linha.dataUltimaMedicaoPesoAltura, 365, ctx.ref) && !!(linha.ultimaMedicaoPeso && linha.ultimaMedicaoAltura),
        { fonte: 'listagemIdosa' }
      ),
      pratica(
        'visitas-acs-30d',
        '(C) Pelo menos 02 visitas domiciliares de ACS (intervalo mín. 30 dias) nos últimos 12 meses (25 pts)',
        25,
        (linha) => !!linha.visitasAcs30d,
        { fonte: 'listagemIdosa' }
      ),
      pratica(
        'vacina-influenza',
        '(D) Registro de 01 dose da vacina contra Influenza nos últimos 12 meses (25 pts)',
        25,
        (linha) => dentroDe(linha.dataUltimaVacinaInfluenza, 365, ctx.ref),
        { fonte: 'listagemIdosa' }
      )
    ],
    proximosPassos: []
  },
  {
    id: 9,
    bloco: 'eSF/eAP',
    titulo: 'Cuidado no desenvolvimento infantil',
    fontes: ['listagemDesenvolvimento'],
    estilo: 'pessoa',
    formula:
      'Somatório das boas práticas pontuadas para cada criança com até 02 anos de vida / total de crianças com até 02 anos vinculadas x 100.',
    formulaOficial: 'confirmada',
    novasPraticas: (ctx) => [
      pratica(
        'consulta-30d',
        '(A) 1ª consulta presencial realizada por médico(a) ou enfermeiro(a) até o 30º dia de vida (20 pts)',
        20,
        (linha) => !!linha.primeiraConsulta30d,
        { fonte: 'listagemDesenvolvimento' }
      ),
      pratica(
        'consultas-9',
        '(B) Pelo menos 09 consultas presenciais ou remotas realizadas até dois anos de vida (20 pts)',
        20,
        (linha) => Number(linha.qtdConsultas) >= 9,
        { fonte: 'listagemDesenvolvimento' }
      ),
      pratica(
        'antropometria-9',
        '(C) Pelo menos 09 registros simultâneos de peso e altura até dois anos de vida (20 pts)',
        20,
        (linha) => Number(linha.qtdPesoAltura) >= 9,
        { fonte: 'listagemDesenvolvimento' }
      ),
      pratica(
        'visitas-acs-2',
        '(D) Pelo menos 02 visitas domiciliares de ACS: 1ª até 30 dias e 2ª até 6 meses de vida (20 pts)',
        20,
        (linha) => Number(linha.qtdVisitasAcs) >= 2,
        { fonte: 'listagemDesenvolvimento' }
      ),
      pratica(
        'vacinas',
        '(E) Vacinas recomendadas (Penta/DTP, VIP/VOP, Tríplice Viral, Pneumocócica) registradas (20 pts)',
        20,
        (linha) => !!linha.dataUltimaVacina,
        { fonte: 'listagemDesenvolvimento' }
      )
    ],
    proximosPassos: []
  },
  {
    id: 10,
    bloco: 'eSB',
    titulo: 'Escovacao dentaria supervisionada em faixa etaria escolar',
    fontes: ['listagemSaudeBucal'],
    estilo: 'agregado',
    formula:
      'Pessoas de 6 a 14 anos com acao coletiva de escovacao dental supervisionada (0101020031) / pessoas de 6 a 14 anos atendidas na unidade odontologica x 100.',
    formulaOficial: 'aproximada',
    calcularAgregado: (linhas, ctx) => {
      const escolares = linhas.filter((l) => {
        const i = idadeEm(l.dataNascimentoCidadao, ctx && ctx.ref);
        return i !== null && i >= 6 && i <= 14;
      });
      const comEscovacao = escolares.filter((l) => Number(l.escovacaoSupervisionada) > 0);
      return taxa(comEscovacao.length, escolares.length);
    },
    proximosPassos: [
      'Confirmar faixa etaria exata na ficha tecnica e-sB',
      'Considerar escovacao supervisionada registrada fora da atendimento odontologico (acao coletiva)'
    ]
  },
  {
    id: 11,
    bloco: 'eSB',
    titulo: 'Primeira consulta odontologica programada',
    fontes: ['listagemSaudeBucal'],
    estilo: 'agregado',
    formula:
      'Pessoas com primeira consulta odontologica programada (0301010153) / pessoas atendidas na unidade odontologica x 100.',
    formulaOficial: 'aproximada',
    calcularAgregado: (linhas) => {
      const atendidos = linhas.filter((l) => Number(l.atendimentos) > 0);
      const comPrimeira = atendidos.filter((l) => Number(l.primeiraConsultaProgramada) > 0);
      return taxa(comPrimeira.length, atendidos.length);
    },
    proximosPassos: ['Confirmar se a primeira consulta vale por atendimento ou por pessoa no periodo']
  },
  {
    id: 12,
    bloco: 'eSB',
    titulo: 'Tratamento odontologico concluido',
    fontes: ['listagemSaudeBucal'],
    estilo: 'agregado',
    formula:
      'Pessoas com conduta de tratamento odontologico concluido / pessoas com atendimento odontologico registrado x 100.',
    formulaOficial: 'aproximada',
    calcularAgregado: (linhas) => {
      const atendidos = linhas.filter((l) => Number(l.atendimentos) > 0);
      const concluidos = atendidos.filter((l) => Number(l.tratamentoConcluido) > 0);
      return taxa(concluidos.length, atendidos.length);
    },
    proximosPassos: ['Usar campo st_conduta_tratamento_concluid do DW odontologico']
  },
  {
    id: 13,
    bloco: 'eSB',
    titulo: 'Tratamento restaurador atraumatico',
    fontes: ['listagemSaudeBucal'],
    estilo: 'agregado',
    formula:
      'Pessoas com restauracao por tecnica atraumatica (0307010074 - ART) / pessoas com restauracao registrada x 100.',
    formulaOficial: 'aproximada',
    calcularAgregado: (linhas) => {
      const comRestauracao = linhas.filter((l) => Number(l.restauracoes) > 0);
      const comArt = comRestauracao.filter((l) => Number(l.restauracoesArt) > 0);
      return taxa(comArt.length, comRestauracao.length);
    },
    proximosPassos: ['Validar codigo 0307010074 como unico procedimento de ART no municipio']
  },
  {
    id: 14,
    bloco: 'eSB',
    titulo: 'Procedimentos odontologicos preventivos',
    fontes: ['listagemSaudeBucal'],
    estilo: 'agregado',
    formula:
      'Pessoas com procedimentos preventivos (fluor, selante, profilaxia, orientacao de higiene) / pessoas atendidas na unidade odontologica x 100.',
    formulaOficial: 'aproximada',
    calcularAgregado: (linhas) => {
      const atendidos = linhas.filter((l) => Number(l.atendimentos) > 0);
      const comPrevencao = atendidos.filter(
        (l) => Number(l.procedimentosPreventivos) > 0 || Number(l.selantes) > 0
      );
      return taxa(comPrevencao.length, atendidos.length);
    },
    proximosPassos: ['Confirmar se orientacao de higiene bucal entra no denominador do indicador']
  },
  {
    id: 15,
    bloco: 'eSB',
    titulo: 'Taxa de exodontias realizadas',
    fontes: ['listagemSaudeBucal'],
    estilo: 'agregado',
    formula:
      'Pessoas com exodontia / pessoas atendidas na unidade odontologica x 100. Sentido inverso: quanto menor, melhor.',
    formulaOficial: 'aproximada',
    calcularAgregado: (linhas) => {
      const atendidos = linhas.filter((l) => Number(l.atendimentos) > 0);
      const comExodontia = atendidos.filter((l) => Number(l.exodontias) > 0);
      return taxa(comExodontia.length, atendidos.length);
    },
    proximosPassos: [
      'Sentido inverso: a faixa de nota deve ser invertida para este indicador',
      'Considerar apenas exodontias evitaveis na leitura de qualidade'
    ]
  }
];

// ---------------------------------------------------------------------------
// Filtro e comparação por unidade de saúde
// ---------------------------------------------------------------------------
function valorUnidade(linha) {
  if (!linha) return undefined;
  if (linha.unidadeId !== undefined) return linha.unidadeId;
  if (linha.unidade_id !== undefined) return linha.unidade_id;
  return undefined;
}

function bateUnidade(valor, unidade) {
  if (unidade === null || unidade === undefined || unidade === 'todas' || unidade === '') return true;
  if (unidade === 'sem_unidade') return valor === null || valor === undefined;
  if (valor === null || valor === undefined) return false;
  return String(valor) === String(unidade);
}

function valorEquipe(linha) {
  if (!linha) return undefined;
  if (linha.equipe !== undefined) return linha.equipe;
  if (linha.ine !== undefined) return linha.ine;
  if (linha.equipeIne !== undefined) return linha.equipeIne;
  return undefined;
}

function bateEquipe(valor, equipe) {
  if (equipe === null || equipe === undefined || equipe === 'todas' || equipe === '') return true;
  if (valor === null || valor === undefined) return false;
  return String(valor) === String(equipe);
}

function filtrarPorEquipe(fontes, equipe) {
  if (equipe === null || equipe === undefined || equipe === 'todas' || equipe === '') return fontes;
  const saida = {};
  for (const [id, f] of Object.entries(fontes)) {
    if (!f || !f.dados || !Array.isArray(f.dados.linhas)) {
      saida[id] = f;
      continue;
    }
    const linhas = f.dados.linhas.filter((l) => bateEquipe(valorEquipe(l), equipe));
    const somaTotais = linhas.length > 0 && linhas.every((l) => typeof l.total === 'number')
      ? linhas.reduce((s, l) => s + l.total, 0)
      : linhas.length;
    const vazio = linhas.length === 0;
    saida[id] = {
      ...f,
      status: vazio && f.status === 'ok' ? 'sem_dados' : f.status,
      detalhe: vazio && f.status === 'ok' ? 'nenhum registro para a equipe selecionada' : f.detalhe,
      dados: f.dados ? { ...f.dados, linhas, total: somaTotais } : f.dados
    };
  }
  return saida;
}

function filtrarPorUnidade(fontes, unidade) {
  if (unidade === null || unidade === undefined || unidade === 'todas' || unidade === '') return fontes;
  const saida = {};
  for (const [id, f] of Object.entries(fontes)) {
    if (!f || !f.dados || !Array.isArray(f.dados.linhas)) {
      saida[id] = f;
      continue;
    }
    const linhas = f.dados.linhas.filter((l) => bateUnidade(valorUnidade(l), unidade));
    const somaTotais = linhas.length > 0 && linhas.every((l) => typeof l.total === 'number')
      ? linhas.reduce((s, l) => s + l.total, 0)
      : linhas.length;
    const vazio = linhas.length === 0;
    saida[id] = {
      ...f,
      status: vazio && f.status === 'ok' ? 'sem_dados' : f.status,
      detalhe: vazio && f.status === 'ok' ? 'nenhum registro para a unidade selecionada' : f.detalhe,
      dados: f.dados ? { ...f.dados, linhas, total: somaTotais } : f.dados
    };
  }
  return saida;
}

function avaliarPorUnidade(fontes, unidades, ctx) {
  return unidades.map((u) => ({
    unidade: u,
    indicadores: avaliarIndicadores(fontes, ctx, u.id)
  }));
}

function avaliarIndicadores(fontes, ctx, unidade) {
  if (unidade !== null && unidade !== undefined && unidade !== 'todas') {
    fontes = filtrarPorUnidade(fontes, unidade);
  }
  return INDICADORES.map((ind) => {
    const fontesDoIndicador = ind.fontes.map((id) => fontes[id]).filter(Boolean);
    const bloqueio = fontesDoIndicador.find((f) => f.status === 'sem_acesso');
    const pendenteEntrada = fontesDoIndicador.find((f) => f.status === 'entrada_invalida');
    const erro = fontesDoIndicador.find((f) => f.status === 'erro');

    let praticas = [];
    let resultado = { numerador: null, denominador: null, valor: null };
    let falhaCalculo = null;

    if (ind.estilo !== 'pendente' && ind.estilo !== 'agregado' && !bloqueio && !pendenteEntrada && !erro) {
      praticas = ind.novasPraticas ? ind.novasPraticas(ctx) : [];
      const linhas = ind.fontes.map((id) => linhasDe(fontes, id)).find((l) => l && l.length) ||
        (ind.fontes.map((id) => linhasDe(fontes, id)).find((l) => l !== null) || []);
      if (ind.estilo === 'pessoa') {
        resultado = calcularPessoa(linhas, praticas);
      } else if (ind.estilo === 'populacao') {
        resultado = calcularPopulacao(linhas, praticas);
      }
    } else if (ind.estilo === 'agregado' && !bloqueio && !pendenteEntrada && !erro) {
      const linhas = ind.fontes.map((id) => linhasDe(fontes, id)).find((l) => l && l.length) ||
        (ind.fontes.map((id) => linhasDe(fontes, id)).find((l) => l !== null) || []);
      try {
        resultado = ind.calcularAgregado(linhas || [], ctx) || { numerador: null, denominador: null, valor: null };
      } catch (e) {
        falhaCalculo = String((e && e.message) || e);
        resultado = { numerador: null, denominador: null, valor: null };
      }
    }

    const implementadas = praticas.filter((p) => p.status === HABILITADOS);
    const total = praticas.length;
    let status = 'ok';
    if (bloqueio) status = 'sem_acesso';
    else if (pendenteEntrada) status = 'entrada_invalida';
    else if (erro) status = 'erro';
    else if (falhaCalculo) status = 'erro';
    else if (ind.estilo === 'pendente') status = 'formula_pendente';
    else if (resultado.valor === null) status = 'sem_dados';
    else if (total && implementadas.length < total) status = 'parcial';

    return {
      id: ind.id,
      bloco: ind.bloco,
      titulo: ind.titulo,
      formula: ind.formula,
      formulaOficial: ind.formulaOficial || 'parametrizada',
      estilo: ind.estilo,
      fontes: ind.fontes,
      status,
      valor: resultado.valor,
      numerador: resultado.numerador,
      denominador: resultado.denominador,
      faixa: faixaDe(resultado.valor, ind),
      praticas: praticas.map((p) => ({
        id: p.id,
        descricao: p.descricao,
        peso: p.peso,
        status: p.status,
        fonte: p.fonte
      })),
      cobertura: total ? { implementadas: implementadas.length, total } : null,
      detalhe: bloqueio
        ? bloqueio.detalhe
        : pendenteEntrada
          ? pendenteEntrada.detalhe
          : erro
            ? erro.detalhe
            : falhaCalculo || null,
      proximosPassos: ind.proximosPassos || []
    };
  });
}

// ---------------------------------------------------------------------------
// Detalhe por indicador: práticas por pessoa, ranking por equipe e lista nominal
// ---------------------------------------------------------------------------
const DETALHE_AGREGADO = {
  10: {
    elegivel: (l, ctx) => {
      const i = idadeEm(l.dataNascimentoCidadao, ctx && ctx.ref);
      return i !== null && i >= 6 && i <= 14;
    },
    praticas: [{
      id: 'escovacao',
      descricao: 'Ação coletiva de escovação dental supervisionada (0101020031)',
      peso: 1,
      avaliar: (l) => Number(l.escovacaoSupervisionada) > 0
    }]
  },
  11: {
    elegivel: (l) => Number(l.atendimentos) > 0,
    praticas: [{
      id: 'primeira',
      descricao: 'Primeira consulta odontológica programada (0301010153)',
      peso: 1,
      avaliar: (l) => Number(l.primeiraConsultaProgramada) > 0
    }]
  },
  12: {
    elegivel: (l) => Number(l.atendimentos) > 0,
    praticas: [{
      id: 'concluido',
      descricao: 'Conduta de tratamento odontológico concluído registrada',
      peso: 1,
      avaliar: (l) => Number(l.tratamentoConcluido) > 0
    }]
  },
  13: {
    elegivel: (l) => Number(l.restauracoes) > 0,
    praticas: [{
      id: 'art',
      descricao: 'Restauração por técnica atraumática (ART — 0307010074)',
      peso: 1,
      avaliar: (l) => Number(l.restauracoesArt) > 0
    }]
  },
  14: {
    elegivel: (l) => Number(l.atendimentos) > 0,
    praticas: [{
      id: 'prevencao',
      descricao: 'Procedimentos preventivos (flúor, selante, profilaxia, orientação de higiene)',
      peso: 1,
      avaliar: (l) => Number(l.procedimentosPreventivos) > 0 || Number(l.selantes) > 0
    }]
  },
  15: {
    elegivel: (l) => Number(l.atendimentos) > 0,
    inverso: true,
    praticas: [{
      id: 'exodontia',
      descricao: 'Pessoa com exodontia registrada no período (sentido inverso)',
      peso: 1,
      avaliar: (l) => Number(l.exodontias) > 0
    }]
  }
};

function avaliarPraticasPessoa(linha, praticas) {
  const itens = praticas.map((p) => ({
    id: p.id,
    descricao: p.descricao,
    peso: p.peso,
    status: p.avaliar ? (p.avaliar(linha) ? 'sim' : 'nao') : 'na'
  }));
  const comPeso = itens.filter((i) => i.peso);
  const total = comPeso.reduce((s, i) => s + i.peso, 0);
  const atingidos = comPeso.filter((i) => i.status === 'sim').reduce((s, i) => s + i.peso, 0);
  const pontos = total ? Math.round((atingidos / total) * 100) : null;
  return { itens, pontos };
}

function linhasAgrupadasPorEquipe(linhas) {
  const mapa = new Map();
  for (const l of linhas) {
    const chave = l.equipe || 'sem_equipe';
    if (!mapa.has(chave)) mapa.set(chave, []);
    mapa.get(chave).push(l);
  }
  return mapa;
}

function rotuloCurto(id) {
  return String(id)
    .split(/[-_]/)
    .map((p, i) => (i === 0 ? p.charAt(0).toUpperCase() + p.slice(1) : p))
    .join(' ');
}

function detalheIndicador(fontes, id, ctx) {
  const ind = INDICADORES.find((i) => i.id === Number(id));
  if (!ind) return { erro: 'indicador não encontrado' };

  const fonteStatus = ind.fontes.map((fid) => fontes[fid]).filter(Boolean);
  const bloqueio = fonteStatus.find(
    (f) => f.status === 'sem_acesso' || f.status === 'erro' || f.status === 'entrada_invalida'
  );
  const candidatas = ind.fontes.map((fid) => linhasDe(fontes, fid));
  let linhas = candidatas.find((l) => l && l.length) ||
    (candidatas.find((l) => l !== null) || []);
  if (ctx && ctx.unidade) {
    linhas = linhas.filter((l) => bateUnidade(valorUnidade(l), ctx.unidade));
  }
  if (ctx && ctx.equipe) {
    linhas = linhas.filter((l) => bateEquipe(valorEquipe(l), ctx.equipe));
  }

  const praticas = ind.novasPraticas ? ind.novasPraticas(ctx) : [];
  const cfgAgregado = ind.estilo === 'agregado' ? DETALHE_AGREGADO[ind.id] : null;

  let elegiveis = [];
  let avaliarLinha = null;
  if (ind.estilo === 'pessoa' || ind.estilo === 'populacao') {
    elegiveis = linhas;
    avaliarLinha = (l) => avaliarPraticasPessoa(l, praticas);
  } else if (cfgAgregado) {
    elegiveis = linhas.filter((l) => cfgAgregado.elegivel(l, ctx));
    avaliarLinha = (l) => avaliarPraticasPessoa(l, cfgAgregado.praticas);
  } else if (ind.id === 3) {
    elegiveis = linhas;
  }

  let municipio = { numerador: null, denominador: null, valor: null };
  if (ind.estilo === 'pessoa') {
    municipio = calcularPessoa(linhas, praticas);
  } else if (ind.estilo === 'agregado' && ind.calcularAgregado) {
    try { municipio = ind.calcularAgregado(linhas, ctx) || municipio; } catch (e) { /* mantém null */ }
  } else if (ind.estilo === 'populacao') {
    municipio = calcularPopulacao(linhas, praticas);
  }

  const porEquipe = [];
  const pessoas = [];
  if (ind.id === 3) {
    const mapa = new Map();
    for (const l of linhas) {
      const chave = l.ine || l.equipe || 'sem_equipe';
      if (!mapa.has(chave)) {
        mapa.set(chave, {
          ine: l.ine || null,
          nome: l.equipe || 'Equipe sem identificação',
          linhas: []
        });
      }
      mapa.get(chave).linhas.push(l);
    }
    for (const [chave, g] of mapa) {
      const r = ind.calcularAgregado(g.linhas, ctx) || {};
      porEquipe.push({
        ine: g.ine,
        nome: g.nome,
        elegiveis: r.denominador || 0,
        numerador: r.numerador || 0,
        denominador: r.denominador || 0,
        valor: r.valor !== undefined ? r.valor : null,
        faixa: faixaDe(r.valor, ind)
      });
    }
    porEquipe.sort((a, b) => (b.valor === null ? -1 : b.valor) - (a.valor === null ? -1 : a.valor));
  } else if (avaliarLinha) {
    const grupos = linhasAgrupadasPorEquipe(elegiveis);
    for (const [ine, grupo] of grupos) {
      let valor = null;
      let numerador = null;
      let denominador = grupo.length;
      if (ind.estilo === 'pessoa') {
        const r = calcularPessoa(grupo, praticas);
        valor = r.valor;
        numerador = r.numerador;
        denominador = r.denominador;
      } else if (ind.estilo === 'populacao') {
        const r = calcularPopulacao(grupo, praticas);
        valor = r.valor;
        numerador = r.numerador;
        denominador = r.denominador;
      } else if (ind.estilo === 'agregado' && ind.calcularAgregado) {
        try {
          const r = ind.calcularAgregado(grupo, ctx) || {};
          valor = r.valor !== undefined ? r.valor : null;
          numerador = r.numerador !== undefined ? r.numerador : null;
          denominador = r.denominador !== undefined ? r.denominador : grupo.length;
        } catch (e) { /* mantém null */ }
      }
      porEquipe.push({
        ine: ine === 'sem_equipe' ? null : ine,
        elegiveis: grupo.length,
        numerador,
        denominador,
        valor,
        faixa: faixaDe(valor, ind)
      });
    }
    porEquipe.sort((a, b) => (b.valor === null ? -1 : b.valor) - (a.valor === null ? -1 : a.valor));

    for (const l of elegiveis) {
      const a = avaliarLinha(l);
      pessoas.push({
        nome: l.nomeCidadao || null,
        nascimento: l.dataNascimentoCidadao || null,
        equipe: l.equipe || null,
        unidade: l.unidade || null,
        praticas: a.itens,
        pontos: a.pontos
      });
    }
    pessoas.sort((x, y) => (y.pontos || 0) - (x.pontos || 0));
  }

  let praticasMeta = [];
  if (ind.id === 3) {
    praticasMeta = [
      {
        id: 'programada',
        descricao: 'Atendimentos por demanda programada (agendada programada, cuidado continuado e agendada)',
        rotulo: 'Demanda programada',
        peso: 1,
        habilitada: true
      },
      {
        id: 'espontanea',
        descricao: 'Atendimentos por demanda espontânea (escuta inicial, urgência etc.)',
        rotulo: 'Demanda espontânea',
        peso: 0,
        habilitada: true
      }
    ];
  } else {
    praticasMeta = (cfgAgregado ? cfgAgregado.praticas : praticas).map((p) => ({
      id: p.id,
      descricao: p.descricao,
      rotulo: rotuloCurto(p.id),
      peso: p.peso,
      habilitada: !!p.avaliar
    }));
  }

  const temFormula = ind.estilo !== 'pendente';
  let status = 'ok';
  if (bloqueio) status = bloqueio.status;
  else if (!elegiveis.length) status = temFormula ? 'sem_dados' : 'formula_pendente';

  return {
    indicador: {
      id: ind.id,
      bloco: ind.bloco,
      titulo: ind.titulo,
      formula: ind.formula,
      formulaOficial: ind.formulaOficial || 'parametrizada',
      estilo: ind.estilo,
      inverso: !!(cfgAgregado && cfgAgregado.inverso),
      proximosPassos: ind.proximosPassos || []
    },
    status,
    detalhe: bloqueio ? bloqueio.detalhe : null,
    municipio: { ...municipio, faixa: faixaDe(municipio.valor, ind) },
    elegiveis: ind.id === 3 ? (municipio.denominador || 0) : elegiveis.length,
    praticas: praticasMeta,
    porEquipe,
    pessoas,
    totalPessoas: pessoas.length
  };
}

module.exports = {
  INDICADORES,
  avaliarIndicadores,
  avaliarPorUnidade,
  filtrarPorUnidade,
  filtrarPorEquipe,
  detalheIndicador,
  faixaDe,
  dentroDe,
  temQualquerAtendimento
};
