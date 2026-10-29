'use strict';

const $ = (id) => document.getElementById(id);

function mostrar(tipo, texto) {
  const m = $('mensagem');
  m.hidden = false;
  m.className = 'mensagem ' + tipo;
  m.textContent = texto;
  if (tipo === 'ok') setTimeout(() => { m.hidden = true; }, 6000);
}

function chip(topo) {
  const ponto = $('pontoSessao');
  const txt = $('txtSessao');
  if (topo && topo.ok) {
    ponto.className = 'ponto ok';
    txt.textContent = `${topo.alvo || ''}${topo.tabelas ? ` · ${topo.tabelas} tabelas` : ''}`;
  } else {
    ponto.className = 'ponto erro';
    txt.textContent = (topo && (topo.erro || topo.alvo)) || 'banco indisponível';
  }
}

async function api(caminho, opcoes = {}) {
  const r = await fetch(caminho, {
    headers: { 'Content-Type': 'application/json' },
    ...opcoes
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro || `HTTP ${r.status}`);
  return j;
}

function preencher(cfg) {
  $('url').value = cfg.url || '';
  $('host').value = cfg.host || '';
  $('porta').value = cfg.porta || '';
  $('database').value = cfg.database || '';
  $('usuario').value = cfg.usuario || '';
  $('senha').value = cfg.senha || '';
  $('ssl').checked = !!cfg.ssl;
}

function lerFormulario() {
  return {
    url: $('url').value.trim(),
    host: $('host').value.trim(),
    porta: $('porta').value.trim(),
    database: $('database').value.trim(),
    usuario: $('usuario').value.trim(),
    senha: $('senha').value,
    ssl: $('ssl').checked
  };
}

function preencherStatus(t) {
  const el = $('statusAtual');
  chip(t);
  $('tabelaStatus').hidden = !t || !t.ok;
  if (!t) {
    el.className = 'status-atual';
    el.textContent = 'carregando…';
    return;
  }
  if (t.ok) {
    el.className = 'status-atual ok';
    el.textContent = 'Conexão ativa';
    $('stAlvo').textContent = t.alvo || '—';
    $('stUsuario').textContent = t.usuario || '—';
    $('stVersao').textContent = t.versao || '—';
    $('stTabelas').textContent = t.tabelas === null || t.tabelas === undefined ? '—' : t.tabelas;
    $('stLatencia').textContent = t.latenciaMs !== undefined ? t.latenciaMs + ' ms' : '—';
  } else {
    el.className = 'status-atual erro';
    el.textContent = 'Sem conexão — ' + (t.erro || t.alvo || '');
  }
}

async function carregarStatus() {
  try {
    const j = await api('/api/status');
    preencher(j.banco || {});
    try {
      const t = await api('/api/banco/testar', { method: 'POST', body: '{}' });
      preencherStatus(t);
    } catch (e) {
      preencherStatus({ ok: false, erro: e.message });
    }
  } catch (e) {
    preencherStatus({ ok: false, erro: e.message });
  }
}

async function testar() {
  const btn = $('btnTestar');
  btn.disabled = true;
  btn.textContent = 'Testando…';
  mostrar('info', 'Testando a conexão…');
  try {
    const t = await api('/api/banco/testar', { method: 'POST', body: JSON.stringify(lerFormulario()) });
    preencherStatus(t);
    if (t.ok) {
      mostrar('ok', `Conexão OK — ${t.alvo} · ${t.usuario} · ${t.versao}` +
        (t.tabelas !== null && t.tabelas !== undefined ? ` · ${t.tabelas} tabelas` : '') +
        ` · ${t.latenciaMs} ms`);
    } else {
      mostrar('erro', 'Falha: ' + t.erro);
    }
  } catch (e) {
    mostrar('erro', 'Falha: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Testar conexão';
  }
}

async function salvar(ev) {
  ev.preventDefault();
  const btn = $('btnSalvar');
  const dados = lerFormulario();
  if (!dados.url && !dados.host) {
    mostrar('erro', 'Informe a URL de conexão ou o host do banco.');
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Salvando…';
  try {
    const r = await api('/api/banco/salvar', { method: 'POST', body: JSON.stringify(dados) });
    if (r.teste && r.teste.ok) {
      mostrar('ok', `Configuração salva e conexão confirmada — ${r.teste.alvo} (${r.teste.tabelas} tabelas)`);
    } else if (r.teste) {
      mostrar('erro', 'Configuração salva, mas a conexão falhou: ' + r.teste.erro);
    } else {
      mostrar('ok', 'Configuração salva.');
    }
    preencher(dados);
    try { preencherStatus(r.teste); } catch (e) { /* ignore */ }
  } catch (e) {
    mostrar('erro', 'Falha ao salvar: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Salvar configuração';
  }
}

function carregarSessao() {
  fetch('/api/auth/sessao')
    .then((r) => r.json())
    .then((d) => {
      if (!d.autenticado) {
        window.location.href = '/login.html';
        return;
      }
      const u = d.usuario;
      if (!u.permissoes || !u.permissoes.podeAcessarAdmin) {
        window.location.href = '/?aviso=sem_permissao_admin';
        return;
      }
      const elNome = $('usuarioNome');
      const elCat = $('usuarioCategoria');
      const elAvatar = $('usuarioAvatar');
      const elBloco = $('usuarioBloco');

      if (elNome) elNome.textContent = u.nome;
      if (elCat) elCat.textContent = u.categoriaNome || 'Usuário';
      if (elAvatar) {
        const partes = (u.nome || 'US').trim().split(/\s+/);
        elAvatar.textContent = (partes[0][0] + (partes[1] ? partes[1][0] : '')).toUpperCase();
        elAvatar.title = `${u.nome} (${u.categoriaNome})`;
      }
      if (elBloco) elBloco.title = `${u.nome} — ${u.categoriaNome}`;

      const btnSair = $('btnSair');
      if (btnSair) {
        btnSair.addEventListener('click', () => {
          fetch('/api/auth/logout', { method: 'POST' })
            .then(() => { window.location.href = '/login.html'; })
            .catch(() => { window.location.href = '/login.html'; });
        });
      }
    })
    .catch(() => {});
}

$('btnTestar').addEventListener('click', testar);
$('formBanco').addEventListener('submit', salvar);
carregarSessao();
carregarStatus();
