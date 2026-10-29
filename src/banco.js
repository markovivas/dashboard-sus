'use strict';

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const ARQUIVO_CONFIG = path.join(__dirname, '..', 'config.json');

// Aceita tanto a URL JDBC quanto parsolos avulsos:
//   jdbc:postgresql://host:5433/esus
//   postgresql://user:senha@host:5433/esus
function montarConexao(banco = {}) {
  const url = (banco.url || '').trim();
  let host = banco.host;
  let port = banco.porta;
  let database = banco.database;
  let user = banco.usuario;
  let password = banco.senha;
  let ssl = banco.ssl;

  if (url) {
    const limpa = url.replace(/^jdbc:/i, '');
    try {
      const u = new URL(limpa);
      host = host || u.hostname;
      port = port || (u.port ? Number(u.port) : 5432);
      database = database || (u.pathname && u.pathname.replace(/^\//, '')) || database;
      if (u.username) user = user || decodeURIComponent(u.username);
      if (u.password) password = password || decodeURIComponent(u.password);
    } catch (e) {
      // URL malformada: tenta extrair host:porta/banco manualmente
      const m = limpa.match(/^(?:postgresql|postgres):\/\/([^/:?]+)(?::(\d+))?\/([^?]+)/);
      if (m) {
        host = host || m[1];
        port = port || (m[2] ? Number(m[2]) : 5432);
        database = database || m[3];
      }
    }
  }

  return {
    host: host || '127.0.0.1',
    port: Number(port) || 5432,
    database: database || 'esus',
    user: user || 'postgres',
    password: password || '',
    ssl: ssl ? { rejectUnauthorized: false } : false
  };
}

function mascaraSenha(config) {
  const tem = config.senha || config.password;
  return {
    ...config,
    senha: tem ? '••••••••' : '',
    usuario: config.usuario || config.user || '',
    testado: false
  };
}

let pool = null;
let poolAssinatura = null;

function assinar(cfg) {
  return [cfg.host, cfg.port, cfg.database, cfg.user, cfg.password, cfg.ssl].join('|');
}

function obterPool() {
  const cfg = montarConexao(carregarConfig().banco);
  const chave = assinar(cfg);
  if (pool && poolAssinatura === chave) return pool;
  if (pool) {
    pool.end().catch(() => {});
    pool = null;
  }
  pool = new Pool({
    host: cfg.host,
    port: cfg.port,
    database: cfg.database,
    user: cfg.user,
    password: cfg.password,
    ssl: cfg.ssl,
    max: 6,
    connectionTimeoutMillis: 8000,
    idleTimeoutMillis: 30000
  });
  pool.on('error', () => {});
  poolAssinatura = chave;
  return pool;
}

function carregarConfig() {
  try {
    return JSON.parse(fs.readFileSync(ARQUIVO_CONFIG, 'utf8'));
  } catch (e) {
    return {};
  }
}

function salvarBanco(banco) {
  const config = carregarConfig();
  config.banco = banco;
  fs.writeFileSync(ARQUIVO_CONFIG, JSON.stringify(config, null, 2) + '\n', 'utf8');
  if (pool) {
    pool.end().catch(() => {});
    pool = null;
    poolAssinatura = null;
  }
  return config;
}

// Converte parâmetros nomeados (:inicio, :fim) para o formato posicional do pg ($1, $2).
// Respeita casts '::date' e não altera SQL que já use arrays posicionais.
function converterParametros(sql, params) {
  if (Array.isArray(params) || params == null) return [sql, params || []];
  const nomes = [];
  const valores = [];
  const out = sql.replace(/(::\s*[A-Za-z_][A-Za-z0-9_ ]*)|:([A-Za-z_][A-Za-z0-9_]*)/g, (m, cast, nome) => {
    if (cast) return cast;
    let i = nomes.indexOf(nome);
    if (i < 0) {
      if (!(nome in params)) throw new Error(`Parâmetro ausente na query: ${nome}`);
      i = nomes.length;
      nomes.push(nome);
      valores.push(params[nome]);
    }
    return '$' + (i + 1);
  });
  return [out, valores];
}

async function consultar(sql, params = []) {
  const p = obterPool();
  const [q, valores] = converterParametros(sql, params);
  const r = await p.query(q, valores);
  return r.rows;
}

async function um(sql, params = []) {
  const linhas = await consultar(sql, params);
  return linhas[0] || null;
}

async function testar() {
  const cfg = montarConexao(carregarConfig().banco);
  const cliente = new (require('pg').Client)({
    host: cfg.host,
    port: cfg.port,
    database: cfg.database,
    user: cfg.user,
    password: cfg.password,
    ssl: cfg.ssl,
    connectionTimeoutMillis: 8000
  });
  const inicio = Date.now();
  try {
    await cliente.connect();
    const r = await cliente.query(
      'select current_database() as db, current_user as usuario, version() as versao'
    );
    const t = r.rows[0];
    let tabelas = 0;
    try {
      const c = await cliente.query(
        "select count(*)::int as n from information_schema.tables where table_schema='public'"
      );
      tabelas = c.rows[0].n;
    } catch (e) {
      /* sem permissão de catálogo */
    }
    return {
      ok: true,
      alvo: `${cfg.host}:${cfg.port}/${cfg.database}`,
      usuario: t.usuario,
      versao: (t.versao || '').split(',')[0],
      tabelas,
      latenciaMs: Date.now() - inicio
    };
  } catch (e) {
    return { ok: false, alvo: `${cfg.host}:${cfg.port}/${cfg.database}`, erro: String(e.message || e) };
  } finally {
    await cliente.end().catch(() => {});
  }
}

function statusConfig() {
  const cfg = montarConexao(carregarConfig().banco);
  const bruto = carregarConfig().banco || {};
  const limpo = mascaraSenha({ ...cfg, url: bruto.url || '', ssl: !!cfg.ssl });
  delete limpo.password;
  return limpo;
}

module.exports = { consultar, um, testar, salvarBanco, montarConexao, carregarConfig, statusConfig, ARQUIVO_CONFIG };
