'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const ARQUIVO_PLANOS = path.join(DATA_DIR, 'planos_acao.json');

function garantirDiretorio() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(ARQUIVO_PLANOS)) {
    fs.writeFileSync(ARQUIVO_PLANOS, JSON.stringify([], null, 2), 'utf8');
  }
}

function carregarPlanos() {
  garantirDiretorio();
  try {
    const texto = fs.readFileSync(ARQUIVO_PLANOS, 'utf8');
    return JSON.parse(texto || '[]');
  } catch (e) {
    console.error('Erro ao ler planos_acao.json:', e);
    return [];
  }
}

function salvarPlanos(planos) {
  garantirDiretorio();
  fs.writeFileSync(ARQUIVO_PLANOS, JSON.stringify(planos, null, 2), 'utf8');
}

function listarPlanos(filtro = {}) {
  const planos = carregarPlanos();
  return planos.filter((p) => {
    if (filtro.unidadeId && p.unidadeId && String(p.unidadeId) !== String(filtro.unidadeId)) {
      return false;
    }
    if (filtro.equipeIne && p.equipeIne && String(p.equipeIne) !== String(filtro.equipeIne)) {
      return false;
    }
    if (filtro.indicadorId && String(p.indicadorId) !== String(filtro.indicadorId)) {
      return false;
    }
    if (filtro.status && p.status !== filtro.status) {
      return false;
    }
    return true;
  });
}

function criarPlano(dados, usuario = {}) {
  const planos = carregarPlanos();
  const novo = {
    id: 'plano_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'),
    titulo: String(dados.titulo || '').trim() || 'Ação de Melhoria',
    descricao: String(dados.descricao || '').trim(),
    indicadorId: dados.indicadorId ? Number(dados.indicadorId) : null,
    indicadorCodigo: dados.indicadorCodigo || null,
    indicadorTitulo: dados.indicadorTitulo || null,
    responsavel: String(dados.responsavel || usuario.nome || 'Equipe de Saúde').trim(),
    categoriaAcao: dados.categoriaAcao || 'Busca Ativa',
    impactoEsperado: dados.impactoEsperado || '+10 pts na nota do indicador',
    metaPacientes: dados.metaPacientes ? Number(dados.metaPacientes) : null,
    pacientesAlcancados: dados.pacientesAlcancados ? Number(dados.pacientesAlcancados) : 0,
    prazo: dados.prazo || null,
    status: dados.status || 'planejado', // 'planejado' | 'em_andamento' | 'concluido'
    unidadeId: dados.unidadeId || usuario.unidadeId || null,
    unidadeNome: dados.unidadeNome || usuario.unidadeNome || null,
    equipeIne: dados.equipeIne || usuario.equipeIne || null,
    equipeNome: dados.equipeNome || usuario.equipeNome || null,
    criadoPor: usuario.nome || 'Sistema',
    criadoEm: new Date().toISOString(),
    atualizadoEm: new Date().toISOString()
  };

  planos.unshift(novo);
  salvarPlanos(planos);
  return novo;
}

function atualizarPlano(id, dados, usuario = {}) {
  const planos = carregarPlanos();
  const idx = planos.findIndex((p) => p.id === String(id));
  if (idx === -1) return null;

  const atual = planos[idx];
  const atualizado = {
    ...atual,
    titulo: dados.titulo !== undefined ? String(dados.titulo).trim() : atual.titulo,
    descricao: dados.descricao !== undefined ? String(dados.descricao).trim() : atual.descricao,
    responsavel: dados.responsavel !== undefined ? String(dados.responsavel).trim() : atual.responsavel,
    prazo: dados.prazo !== undefined ? dados.prazo : atual.prazo,
    status: dados.status !== undefined ? dados.status : atual.status,
    pacientesAlcancados: dados.pacientesAlcancados !== undefined ? Number(dados.pacientesAlcancados) : atual.pacientesAlcancados,
    atualizadoPor: usuario.nome || atual.atualizadoPor || null,
    atualizadoEm: new Date().toISOString()
  };

  planos[idx] = atualizado;
  salvarPlanos(planos);
  return atualizado;
}

function excluirPlano(id) {
  const planos = carregarPlanos();
  const filtrados = planos.filter((p) => p.id !== String(id));
  if (filtrados.length === planos.length) return false;
  salvarPlanos(filtrados);
  return true;
}

module.exports = {
  listarPlanos,
  criarPlano,
  atualizarPlano,
  excluirPlano
};
