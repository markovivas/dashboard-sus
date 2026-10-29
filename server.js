'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');

const banco = require('./src/banco');
const { executar, detalhar } = require('./src/avaliar');
const demo = require('./src/demo');
const auth = require('./src/auth');
const planoAcao = require('./src/planoAcao');

const RAIZ = __dirname;
const PUBLICO = path.join(RAIZ, 'public');

function carregarConfig() {
  const arquivo = path.join(RAIZ, 'config.json');
  const config = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  if (process.env.PORTA) config.porta = Number(process.env.PORTA);
  return config;
}

const config = carregarConfig();

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function extrairCookieSessao(req) {
  const cookie = req.headers.cookie || '';
  const m = cookie.match(/(?:^|;\s*)esus_sessao=([^;]+)/);
  return m ? decodeURIComponent(m[1].trim()) : null;
}

function responderComSessao(res, status, corpo, token = null) {
  const dados = Buffer.isBuffer(corpo) ? corpo : Buffer.from(corpo, 'utf8');
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': dados.length,
    'Cache-Control': 'no-store'
  };
  if (token) {
    headers['Set-Cookie'] = `esus_sessao=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`;
  } else if (token === '') {
    headers['Set-Cookie'] = 'esus_sessao=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax';
  }
  res.writeHead(status, headers);
  res.end(dados);
}

function redirecionar(res, urlDestino) {
  res.writeHead(302, { Location: urlDestino });
  res.end();
}

function responder(res, status, corpo, tipo = 'application/json; charset=utf-8') {
  const dados = Buffer.isBuffer(corpo) ? corpo : Buffer.from(corpo, 'utf8');
  res.writeHead(status, {
    'Content-Type': tipo,
    'Content-Length': dados.length,
    'Cache-Control': 'no-store'
  });
  res.end(dados);
}

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    const partes = [];
    req.on('data', (c) => partes.push(c));
    req.on('end', () => resolve(Buffer.concat(partes).toString('utf8')));
    req.on('error', reject);
  });
}

function jsonCorpo(texto) {
  try {
    return JSON.parse(texto || '{}');
  } catch (e) {
    return null;
  }
}

async function rotasApi(req, res, url) {
  const m = req.method;

  // ---------------- AUTENTICAÇÃO E CATEGORIAS ----------------
  if (m === 'GET' && url.pathname === '/api/auth/categorias') {
    try {
      const cats = await auth.listarCategorias();
      return responder(res, 200, JSON.stringify(cats));
    } catch (e) {
      return responder(res, 500, JSON.stringify({ erro: String(e.message || e) }));
    }
  }

  if (m === 'GET' && url.pathname === '/api/auth/usuarios') {
    try {
      const cat = url.searchParams.get('categoria');
      const q = url.searchParams.get('q');
      const users = await auth.listarUsuarios(cat, q);
      return responder(res, 200, JSON.stringify(users));
    } catch (e) {
      return responder(res, 500, JSON.stringify({ erro: String(e.message || e) }));
    }
  }

  if (m === 'POST' && url.pathname === '/api/auth/login') {
    try {
      const corpo = jsonCorpo(await lerCorpo(req)) || {};
      const r = await auth.autenticar(corpo.login, corpo.categoria, corpo.senha);
      if (!r.ok) {
        return responder(res, 401, JSON.stringify({ ok: false, erro: r.erro }));
      }
      return responderComSessao(res, 200, JSON.stringify({ ok: true, usuario: r.sessao }), r.sessao.token);
    } catch (e) {
      return responder(res, 500, JSON.stringify({ ok: false, erro: String(e.message || e) }));
    }
  }

  if (m === 'GET' && url.pathname === '/api/auth/sessao') {
    const token = extrairCookieSessao(req);
    const sessao = auth.obterSessao(token);
    return responder(res, 200, JSON.stringify({ autenticado: !!sessao, usuario: sessao || null }));
  }

  if (m === 'POST' && url.pathname === '/api/auth/logout') {
    const token = extrairCookieSessao(req);
    auth.destruirSessao(token);
    return responderComSessao(res, 200, JSON.stringify({ ok: true }), '');
  }

  // ---------------- status (público para monitoramento) ----------------
  if (m === 'GET' && url.pathname === '/api/status') {
    const cfg = carregarConfig();
    const t = await banco.testar();
    const cfgBanco = banco.montarConexao(cfg.banco);
    return responder(res, 200, JSON.stringify({
      ok: true,
      alvo: 'banco de dados (PostgreSQL)',
      periodo: cfg.periodo,
      banco: {
        ...banco.statusConfig(),
        alvoConectado: t.ok ? t.alvo : null,
        usuario: t.ok ? t.usuario : null,
        versao: t.ok ? t.versao : null,
        tabelas: t.ok ? t.tabelas : null,
        latenciaMs: t.ok ? t.latenciaMs : null,
        erro: t.ok ? null : t.erro,
        host: cfgBanco.host,
        porta: cfgBanco.port,
        database: cfgBanco.database
      },
      fonte: 'banco_dados'
    }, null, 2));
  }

  // Validação de sessão para endpoints protegidos
  const token = extrairCookieSessao(req);
  const sessao = auth.obterSessao(token);
  const ehDemo = url.searchParams.get('demo') === '1';

  if (!sessao && !ehDemo) {
    return responder(res, 401, JSON.stringify({ erro: 'Sessão expirada ou não autenticado', redirecionar: '/login.html' }));
  }

  // ---------------- controle de acesso administrativo ----------------
  if (url.pathname.startsWith('/api/banco/')) {
    if (!sessao || !sessao.permissoes || !sessao.permissoes.podeAcessarAdmin) {
      return responder(res, 403, JSON.stringify({ erro: 'Acesso restrito a administradores e gestores do sistema.' }));
    }
  }

  // ---------------- teste de conexão ----------------
  if (m === 'POST' && url.pathname === '/api/banco/testar') {
    const corpo = jsonCorpo(await lerCorpo(req));
    let resultado;
    if (corpo && (corpo.host || corpo.url)) {
      // testa a configuração ainda não salva (preview)
      const temp = { ...banco.carregarConfig(), banco: corpo };
      const cfg = banco.montarConexao(temp.banco);
      const { Client } = require('pg');
      const cli = new Client({
        host: cfg.host, port: cfg.port, database: cfg.database,
        user: cfg.user, password: cfg.password, ssl: cfg.ssl,
        connectionTimeoutMillis: 8000
      });
      const t0 = Date.now();
      try {
        await cli.connect();
        const r = await cli.query('select current_database() db, current_user u, version() v');
        const tb = await cli.query(
          "select count(*)::int n from information_schema.tables where table_schema='public'"
        ).catch(() => ({ rows: [{ n: null }] }));
        resultado = {
          ok: true,
          alvo: `${cfg.host}:${cfg.port}/${cfg.database}`,
          usuario: r.rows[0].u,
          versao: (r.rows[0].v || '').split(',')[0],
          tabelas: tb.rows[0].n,
          latenciaMs: Date.now() - t0
        };
      } catch (e) {
        resultado = { ok: false, alvo: `${cfg.host}:${cfg.port}/${cfg.database}`, erro: String(e.message || e) };
      } finally {
        await cli.end().catch(() => {});
      }
    } else {
      resultado = await banco.testar();
    }
    return responder(res, 200, JSON.stringify(resultado, null, 2));
  }

  // ---------------- salvar credenciais do banco ----------------
  if (m === 'POST' && url.pathname === '/api/banco/salvar') {
    const corpo = jsonCorpo(await lerCorpo(req));
    if (!corpo) return responder(res, 400, JSON.stringify({ erro: 'JSON inválido' }));
    if (!corpo.host && !corpo.url) {
      return responder(res, 400, JSON.stringify({ erro: 'Informe a URL ou o host do banco.' }));
    }
    banco.salvarBanco({
      url: corpo.url || '',
      host: corpo.host || '',
      porta: corpo.porta || '',
      database: corpo.database || '',
      usuario: corpo.usuario || '',
      senha: corpo.senha || '',
      ssl: !!corpo.ssl
    });
    const teste = await banco.testar();
    return responder(res, 200, JSON.stringify({ salvo: true, teste }, null, 2));
  }

  // ---------------- unidades ----------------
  if (m === 'GET' && url.pathname === '/api/unidades') {
    try {
      const cfg = carregarConfig();
      const r = await executar(cfg, { unidade: null, comparar: false });
      let lista = r.unidades || [];
      if (sessao && sessao.permissoes && !sessao.permissoes.podeVerTodasUnidades) {
        const permitidas = new Set(sessao.permissoes.unidadesPermitidas || []);
        if (sessao.unidadeId) permitidas.add(String(sessao.unidadeId));
        if (permitidas.size > 0) {
          lista = lista.filter((u) => permitidas.has(String(u.id)));
        }
      }
      return responder(res, 200, JSON.stringify({ ok: true, unidades: lista }, null, 2));
    } catch (e) {
      return responder(res, 500, JSON.stringify({ erro: String(e.message || e) }));
    }
  }

  // ---------------- detalhe de um indicador ----------------
  if (m === 'POST' && url.pathname === '/api/detalhe') {
    const params = jsonCorpo(await lerCorpo(req));
    if (params === null) return responder(res, 400, JSON.stringify({ erro: 'JSON inválido' }));
    if (!params.indicador) return responder(res, 400, JSON.stringify({ erro: 'Informe o indicador.' }));
    if (url.searchParams.get('demo') === '1') {
      return responder(res, 200, JSON.stringify(demo.detalhar(carregarConfig(), params)));
    }
    try {
      const cfg = carregarConfig();

      // Aplica escopo obrigatório do usuário logado se não for gestor/admin total
      if (sessao && sessao.permissoes && !sessao.permissoes.podeVerTodasUnidades) {
        if (sessao.unidadeId) params.unidade = sessao.unidadeId;
        if (sessao.equipeIne) params.equipe = sessao.equipeIne;
      }

      const resultado = await detalhar(cfg, params);
      if (resultado.erro) return responder(res, 404, JSON.stringify(resultado));

      // Proteção LGPD da lista nominal: se o usuário for de equipe/unidade restrita, filtra cidadãos
      if (sessao && sessao.permissoes && sessao.permissoes.restringirListaNominal) {
        if (sessao.equipeIne && Array.isArray(resultado.pessoas)) {
          resultado.pessoas = resultado.pessoas.filter((p) => String(p.equipe) === String(sessao.equipeIne));
          resultado.totalPessoas = resultado.pessoas.length;
        } else if (sessao.unidadeId && Array.isArray(resultado.pessoas)) {
          resultado.pessoas = resultado.pessoas.filter((p) => String(p.unidadeId) === String(sessao.unidadeId));
          resultado.totalPessoas = resultado.pessoas.length;
        }
      }

      return responder(res, 200, JSON.stringify(resultado));
    } catch (e) {
      return responder(res, 500, JSON.stringify({ erro: String(e.message || e) }));
    }
  }

  // ---------------- avaliação ----------------
  if (m === 'POST' && url.pathname === '/api/avaliar') {
    try {
      const texto = await lerCorpo(req);
      const params = jsonCorpo(texto) || {};
      if (url.searchParams.get('demo') === '1') {
        return responder(res, 200, JSON.stringify(demo.gerar(carregarConfig(), params)));
      }
      const cfg = carregarConfig();

      // Aplica escopo obrigatório do usuário logado se não for gestor/admin total
      if (sessao && sessao.permissoes && !sessao.permissoes.podeVerTodasUnidades) {
        if (sessao.unidadeId) params.unidade = sessao.unidadeId;
        if (sessao.equipeIne) params.equipe = sessao.equipeIne;
      }

      const resultado = await executar(cfg, params);

      // Adiciona metadados de escopo do usuário na resposta
      if (sessao && sessao.permissoes) {
        resultado.escopoUsuario = {
          nivelAcesso: sessao.permissoes.nivelAcesso,
          descricaoEscopo: sessao.permissoes.descricaoEscopo,
          unidadeId: sessao.unidadeId,
          unidadeNome: sessao.unidadeNome,
          equipeIne: sessao.equipeIne,
          equipeNome: sessao.equipeNome,
          blocosPadrao: sessao.permissoes.blocosPadrao,
          podeVerTodasUnidades: sessao.permissoes.podeVerTodasUnidades,
          podeAcessarAdmin: sessao.permissoes.podeAcessarAdmin
        };
      }

      return responder(res, 200, JSON.stringify(resultado));
    } catch (e) {
      return responder(res, 500, JSON.stringify({ erro: String(e.message || e) }));
    }
  }

  // ---------------- PLANOS DE AÇÃO ----------------
  if (m === 'GET' && url.pathname === '/api/plano-acao') {
    try {
      const filtro = {};
      if (sessao && sessao.permissoes && !sessao.permissoes.podeVerTodasUnidades) {
        if (sessao.unidadeId) filtro.unidadeId = sessao.unidadeId;
        if (sessao.equipeIne) filtro.equipeIne = sessao.equipeIne;
      }
      const planos = planoAcao.listarPlanos(filtro);
      return responder(res, 200, JSON.stringify({ ok: true, planos }));
    } catch (e) {
      return responder(res, 500, JSON.stringify({ erro: String(e.message || e) }));
    }
  }

  if (m === 'POST' && url.pathname === '/api/plano-acao') {
    try {
      const corpo = jsonCorpo(await lerCorpo(req)) || {};
      if (corpo.id) {
        const atualizado = planoAcao.atualizarPlano(corpo.id, corpo, sessao || {});
        if (!atualizado) return responder(res, 404, JSON.stringify({ erro: 'Plano não encontrado' }));
        return responder(res, 200, JSON.stringify({ ok: true, plano: atualizado }));
      }
      const criado = planoAcao.criarPlano(corpo, sessao || {});
      return responder(res, 201, JSON.stringify({ ok: true, plano: criado }));
    } catch (e) {
      return responder(res, 500, JSON.stringify({ erro: String(e.message || e) }));
    }
  }

  if (m === 'DELETE' && url.pathname === '/api/plano-acao') {
    try {
      const id = url.searchParams.get('id');
      if (!id) return responder(res, 400, JSON.stringify({ erro: 'Informe o ID da ação' }));
      const excluido = planoAcao.excluirPlano(id);
      return responder(res, 200, JSON.stringify({ ok: excluido }));
    } catch (e) {
      return responder(res, 500, JSON.stringify({ erro: String(e.message || e) }));
    }
  }

  return responder(res, 404, JSON.stringify({ erro: 'rota nao encontrada' }));
}

function servirEstatico(req, res, url) {
  let caminho = url.pathname === '/' ? '/index.html' : url.pathname;
  caminho = path.normalize(caminho).replace(/^(\.\.[/\\])+/, '');
  const rotaLimpa = caminho.replace(/\\/g, '/');

  const token = extrairCookieSessao(req);
  const sessao = auth.obterSessao(token);

  // Redireciona para login se tentar acessar home ou admin sem autenticação
  if ((rotaLimpa === '/index.html' || rotaLimpa === '/admin.html') && !sessao) {
    return redirecionar(res, '/login.html');
  }

  // Se tentar acessar admin sem permissão administrativa, redireciona para a home
  if (rotaLimpa === '/admin.html' && sessao && (!sessao.permissoes || !sessao.permissoes.podeAcessarAdmin)) {
    return redirecionar(res, '/?aviso=sem_permissao_admin');
  }

  // Se já estiver logado e tentar abrir /login.html, vai para o painel principal
  if (rotaLimpa === '/login.html' && sessao) {
    return redirecionar(res, '/');
  }

  if (url.pathname.startsWith('/img/')) {
    const alvoImg = path.join(RAIZ, caminho);
    if (fs.existsSync(alvoImg)) {
      const ext = path.extname(alvoImg).toLowerCase();
      return fs.readFile(alvoImg, (erro, dados) => {
        if (erro) return responder(res, 404, 'Nao encontrado', 'text/plain; charset=utf-8');
        responder(res, 200, dados, TIPOS[ext] || 'application/octet-stream');
      });
    }
  }

  const alvo = path.join(PUBLICO, caminho);
  if (!alvo.startsWith(PUBLICO)) return responder(res, 403, 'Forbidden', 'text/plain');
  fs.readFile(alvo, (erro, dados) => {
    if (erro) return responder(res, 404, 'Nao encontrado', 'text/plain; charset=utf-8');
    const ext = path.extname(alvo).toLowerCase();
    responder(res, 200, dados, TIPOS[ext] || 'application/octet-stream');
  });
}

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) return await rotasApi(req, res, url);
    return servirEstatico(req, res, url);
  } catch (e) {
    return responder(res, 500, JSON.stringify({ erro: String(e.message || e) }));
  }
});

servidor.listen(config.porta, config.host, async () => {
  console.log(`Painel e-SUS APS em http://${config.host}:${config.porta}`);
  const t = await banco.testar().catch((e) => ({ ok: false, erro: e.message }));
  console.log(
    t.ok
      ? `Banco: OK — ${t.alvo} (${t.usuario}, ${t.versao}, ${t.tabelas} tabelas, ${t.latenciaMs}ms)`
      : `Banco: FALHA — ${t.alvo} — ${t.erro}`
  );
});
