'use strict';

(function () {
  const form = document.getElementById('formLogin');
  const selCategoria = document.getElementById('selectCategoria');
  const campoUsuarioWrapper = document.getElementById('campoUsuarioWrapper');
  const inputBusca = document.getElementById('inputBuscaUsuario');
  const btnClearUsuario = document.getElementById('btnClearUsuario');
  const listaDropdown = document.getElementById('listaDropdownUsuarios');
  const loginUsuarioSelecionado = document.getElementById('loginUsuarioSelecionado');
  const inputSenha = document.getElementById('inputSenha');
  const btnToggleSenha = document.getElementById('btnToggleSenha');
  const btnSenhaPadrao = document.getElementById('btnSenhaPadrao');
  const btnEntrar = document.getElementById('btnEntrar');
  const aviso = document.getElementById('loginAviso');

  let todosUsuariosCategoria = [];

  function mostrarAviso(msg, tipo = 'erro') {
    aviso.hidden = false;
    aviso.className = 'login-aviso ' + tipo;
    aviso.innerHTML = `
      <svg style="width:18px;height:18px;fill:currentColor;flex-shrink:0" viewBox="0 0 24 24">
        ${tipo === 'erro' 
          ? '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>'
          : '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>'}
      </svg>
      <span>${msg}</span>
    `;
  }

  function limparAviso() {
    aviso.hidden = true;
    aviso.innerHTML = '';
  }

  // Verifica se já existe sessão ativa
  fetch('/api/auth/sessao')
    .then((r) => r.json())
    .then((d) => {
      if (d.autenticado) {
        window.location.href = '/';
      }
    })
    .catch(() => {});

  // Alternar visibilidade da senha
  btnToggleSenha.addEventListener('click', () => {
    const ehSenha = inputSenha.type === 'password';
    inputSenha.type = ehSenha ? 'text' : 'password';
    btnToggleSenha.setAttribute('aria-label', ehSenha ? 'Ocultar senha' : 'Exibir senha');
  });

  // Preencher rapidamente a senha padrão
  btnSenhaPadrao.addEventListener('click', () => {
    inputSenha.value = 'Senha@2026';
    inputSenha.focus();
  });

  // Carrega categorias do backend
  fetch('/api/auth/categorias')
    .then((r) => r.json())
    .then((categorias) => {
      selCategoria.innerHTML = '<option value="" disabled selected>Selecione sua categoria…</option>';
      for (const cat of categorias) {
        const opt = document.createElement('option');
        opt.value = cat.id;
        opt.textContent = `${cat.nome} (${cat.totalUsuarios} profissionais)`;
        selCategoria.appendChild(opt);
      }
    })
    .catch((err) => {
      mostrarAviso('Falha ao conectar com o serviço de autenticação: ' + err.message);
    });

  // Renderiza a lista suspensa com os profissionais
  function renderizarSugestoes(lista) {
    listaDropdown.innerHTML = '';

    if (!lista || !lista.length) {
      listaDropdown.innerHTML = `
        <div class="sugestao-vazio">
          Nenhum profissional encontrado com este nome ou CPF.
        </div>
      `;
      listaDropdown.hidden = false;
      return;
    }

    lista.forEach((u) => {
      const item = document.createElement('div');
      item.className = 'item-usuario-sugestao';
      item.dataset.login = u.login;

      const detalheLocal = u.equipeNome || u.unidadeNome || '';

      item.innerHTML = `
        <span class="sugestao-nome">${u.nome}</span>
        <span class="sugestao-detalhe">${u.cargo || 'Profissional'}${detalheLocal ? ' • ' + detalheLocal : ''}</span>
      `;

      // 1. Ao clicar no nome, preenche o campo e fecha a lista suspensa
      item.addEventListener('click', (ev) => {
        ev.stopPropagation();
        selecionarProfissional(u);
      });

      listaDropdown.appendChild(item);
    });

    listaDropdown.hidden = false;
  }

  // Preenche automaticamente e fecha a lista suspensa
  function selecionarProfissional(u) {
    inputBusca.value = u.nome;
    loginUsuarioSelecionado.value = u.login;
    btnClearUsuario.hidden = false;
    listaDropdown.hidden = true;
    limparAviso();

    // Avança o foco diretamente para a senha
    inputSenha.focus();
  }

  // Ao trocar de categoria
  selCategoria.addEventListener('change', () => {
    limparAviso();
    const catId = selCategoria.value;
    if (!catId) return;

    inputBusca.disabled = false;
    inputBusca.value = '';
    loginUsuarioSelecionado.value = '';
    btnClearUsuario.hidden = true;
    inputBusca.placeholder = 'Clique para escolher ou digite para buscar…';

    listaDropdown.innerHTML = `
      <div class="sugestao-vazio">
        Carregando profissionais do banco de dados…
      </div>
    `;
    listaDropdown.hidden = false;

    fetch(`/api/auth/usuarios?categoria=${encodeURIComponent(catId)}`)
      .then((r) => r.json())
      .then((usuarios) => {
        todosUsuariosCategoria = usuarios;
        renderizarSugestoes(usuarios);
        inputBusca.focus();
      })
      .catch((err) => {
        mostrarAviso('Erro ao carregar usuários: ' + err.message);
        listaDropdown.hidden = true;
      });
  });

  // Reabrir lista suspensa ao clicar no campo de busca
  inputBusca.addEventListener('click', () => {
    if (todosUsuariosCategoria.length) {
      const termo = inputBusca.value.toLowerCase().trim();
      if (!termo) {
        renderizarSugestoes(todosUsuariosCategoria);
      } else {
        filtrarSugestoes(termo);
      }
    }
  });

  // Busca instantânea
  inputBusca.addEventListener('input', () => {
    const termo = inputBusca.value.toLowerCase().trim();
    btnClearUsuario.hidden = !inputBusca.value;

    if (!termo) {
      loginUsuarioSelecionado.value = '';
      renderizarSugestoes(todosUsuariosCategoria);
      return;
    }

    filtrarSugestoes(termo);
  });

  function filtrarSugestoes(termo) {
    const filtrados = todosUsuariosCategoria.filter((u) => {
      const nome = (u.nome || '').toLowerCase();
      const login = (u.login || '').toLowerCase();
      const cargo = (u.cargo || '').toLowerCase();
      const local = ((u.equipeNome || '') + ' ' + (u.unidadeNome || '')).toLowerCase();
      return nome.includes(termo) || login.includes(termo) || cargo.includes(termo) || local.includes(termo);
    });

    renderizarSugestoes(filtrados);
  }

  // Botão para limpar e escolher outro
  btnClearUsuario.addEventListener('click', (ev) => {
    ev.stopPropagation();
    inputBusca.value = '';
    loginUsuarioSelecionado.value = '';
    btnClearUsuario.hidden = true;
    renderizarSugestoes(todosUsuariosCategoria);
    inputBusca.focus();
  });

  // Fechar dropdown ao clicar fora do campo
  document.addEventListener('click', (ev) => {
    if (!ev.target.closest('#campoUsuarioWrapper')) {
      listaDropdown.hidden = true;
    }
  });

  // Envio do formulário
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    limparAviso();

    const categoria = selCategoria.value;
    let login = loginUsuarioSelecionado.value;
    const senha = inputSenha.value;

    // Se o usuário digitou mas não clicou na lista, tenta achar o primeiro que combina
    if (!login && inputBusca.value) {
      const termo = inputBusca.value.toLowerCase().trim();
      const match = todosUsuariosCategoria.find((u) => (u.nome || '').toLowerCase().includes(termo));
      if (match) {
        login = match.login;
        loginUsuarioSelecionado.value = login;
        inputBusca.value = match.nome;
      }
    }

    if (!categoria) {
      mostrarAviso('Por favor, selecione uma Categoria.');
      selCategoria.focus();
      return;
    }

    if (!login) {
      mostrarAviso('Por favor, selecione um Profissional / Usuário da lista.');
      inputBusca.focus();
      listaDropdown.hidden = false;
      renderizarSugestoes(todosUsuariosCategoria);
      return;
    }

    if (!senha) {
      mostrarAviso('Por favor, informe a senha de acesso.');
      inputSenha.focus();
      return;
    }

    // Feedback visual no botão
    btnEntrar.disabled = true;
    const rotulo = btnEntrar.querySelector('.btn-rotulo');
    const spinner = btnEntrar.querySelector('.spinner-btn');
    if (rotulo) rotulo.textContent = 'Entrando…';
    if (spinner) spinner.hidden = false;

    fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoria, login, senha })
    })
      .then((r) => r.json().then((dados) => ({ status: r.status, dados })))
      .then(({ status, dados }) => {
        if (status === 200 && dados.ok) {
          mostrarAviso(`Bem-vindo, ${dados.usuario.nome}! Redirecionando…`, 'sucesso');
          setTimeout(() => {
            window.location.href = '/';
          }, 350);
        } else {
          mostrarAviso(dados.erro || 'Falha na autenticação. Verifique sua senha.');
          resetarBotao();
        }
      })
      .catch((err) => {
        mostrarAviso('Erro de conexão com o servidor: ' + err.message);
        resetarBotao();
      });
  });

  function resetarBotao() {
    btnEntrar.disabled = false;
    const rotulo = btnEntrar.querySelector('.btn-rotulo');
    const spinner = btnEntrar.querySelector('.spinner-btn');
    if (rotulo) rotulo.textContent = 'Entrar';
    if (spinner) spinner.hidden = true;
  }
})();
