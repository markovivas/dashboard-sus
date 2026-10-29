'use strict';

const crypto = require('crypto');
const banco = require('./banco');

const SENHA_PADRAO = 'Senha@2026';

const CATEGORIAS = [
  {
    id: 'admin_instalacao',
    nome: 'Administrador da Instalação',
    descricao: 'Administradores municipais e técnicos de instalação e infraestrutura',
    icone: 'admin'
  },
  {
    id: 'coordenador',
    nome: 'Coordenador',
    descricao: 'Coordenadores de UBS, CEO, atenção domiciliar e coordenação geral',
    icone: 'coord'
  },
  {
    id: 'gestor',
    nome: 'Gestor Municipal / Estadual / Federal',
    descricao: 'Gestores de saúde pública municipal, estadual e federal',
    icone: 'gestor'
  },
  {
    id: 'medico',
    nome: 'Médicos',
    descricao: 'Médicos de família e comunidade, generalistas e especialistas',
    icone: 'medico'
  },
  {
    id: 'enfermeiro',
    nome: 'Enfermeiros',
    descricao: 'Enfermeiros de saúde da família e atenção primária',
    icone: 'enfermeiro'
  },
  {
    id: 'dentista',
    nome: 'Cirurgiões Dentistas',
    descricao: 'Cirurgiões-dentistas da ESF, CEO e clínico geral',
    icone: 'odonto'
  },
  {
    id: 'auxiliar_enfermagem_bucal',
    nome: 'Auxiliares de Enfermagem e de Saúde Bucal',
    descricao: 'Auxiliares de enfermagem e auxiliares em saúde bucal (ASB)',
    icone: 'auxiliar'
  },
  {
    id: 'tecnico_enfermagem_bucal',
    nome: 'Técnicos de Enfermagem e de Saúde Bucal',
    descricao: 'Técnicos de enfermagem e técnicos em saúde bucal (TSB)',
    icone: 'tecnico'
  },
  {
    id: 'nivel_superior',
    nome: 'Outros Profissionais de Nivel Superior',
    descricao: 'Psicólogos, assistentes sociais, fisioterapeutas, farmacêuticos, nutricionistas (eMulti)',
    icone: 'superior'
  },
  {
    id: 'acs',
    nome: 'Agente Comunitário de Saúde (ACS)',
    descricao: 'Agentes comunitários de saúde e visitas domiciliares',
    icone: 'acs'
  },
  {
    id: 'ace',
    nome: 'Agente de Combate a Endemias (ACE)',
    descricao: 'Agentes de combate às endemias e vigilância em saúde',
    icone: 'ace'
  },
  {
    id: 'recepcao',
    nome: 'Profissional da Recepção',
    descricao: 'Recepcionistas, atendentes e digitadores da unidade',
    icone: 'recepcao'
  }
];

function classificarUsuario(u) {
  const p = (u.perfis || '').toUpperCase();
  const tp = (u.tipos_perfil || '').toUpperCase();
  const c = String(u.cbos_cod || '');
  const cboNome = (u.cbos_nome || '').toUpperCase();

  const cats = [];

  // 1. Administrador da Instalação
  if (tp.includes('ADMINISTRADOR') || p.includes('ADMINISTRADOR') || p.includes('INSTALADOR')) {
    cats.push('admin_instalacao');
  }

  // 2. Coordenador
  if (p.includes('COORDENADOR') || c.includes('1312') || cboNome.includes('COORDENADOR') || cboNome.includes('DIRETOR')) {
    cats.push('coordenador');
  }

  // 3. Gestor Municipal / Estadual / Federal
  if (tp.includes('GESTOR') || p.includes('GESTOR') || cboNome.includes('GESTOR')) {
    cats.push('gestor');
  }

  // 4. Médicos
  if (p.includes('MÉDICO') || p.includes('MEDICO') || c.split(' | ').some((cod) => cod.startsWith('225')) || cboNome.includes('MEDIC')) {
    cats.push('medico');
  }

  // 5. Enfermeiros
  if (
    (p.includes('ENFERMEIRO') || c.split(' | ').some((cod) => cod.startsWith('2235')) || cboNome.includes('ENFERMEIR')) &&
    !cboNome.includes('TECNIC') &&
    !cboNome.includes('AUXILIAR')
  ) {
    cats.push('enfermeiro');
  }

  // 6. Cirurgiões Dentistas
  if (
    p.includes('CIRURGIÃO DENTISTA') ||
    p.includes('CIRURGIAO DENTISTA') ||
    p.includes('DENTISTA') ||
    c.split(' | ').some((cod) => cod.startsWith('2232')) ||
    cboNome.includes('ODONT') ||
    cboNome.includes('DENTISTA')
  ) {
    cats.push('dentista');
  }

  // 7. Auxiliares de Enfermagem e de Saúde Bucal
  if (
    p.includes('AUXILIAR DE ENFERMAGEM') ||
    p.includes('ASB') ||
    p.includes('AUXILIAR DE SAÚDE BUCAL') ||
    p.includes('AUXILIAR EM SAUDE BUCAL') ||
    c.split(' | ').some((cod) => cod.startsWith('322230') || cod.startsWith('322415')) ||
    cboNome.includes('AUXILIAR DE ENFERMAGEM') ||
    cboNome.includes('AUXILIAR EM SAUDE BUCAL') ||
    cboNome.includes('AUXILIAR DE SAUDE BUCAL')
  ) {
    cats.push('auxiliar_enfermagem_bucal');
  }

  // 8. Técnicos de Enfermagem e de Saúde Bucal
  if (
    p.includes('TÉCNICO DE ENFERMAGEM') ||
    p.includes('TECNICO DE ENFERMAGEM') ||
    p.includes('TSB') ||
    p.includes('TÉCNICO DE SAÚDE BUCAL') ||
    p.includes('TECNICO EM SAUDE BUCAL') ||
    c.split(' | ').some((cod) => cod.startsWith('322205') || cod.startsWith('322405')) ||
    cboNome.includes('TECNICO DE ENFERMAGEM') ||
    cboNome.includes('TECNICO EM SAUDE BUCAL') ||
    cboNome.includes('TECNICO DE SAUDE BUCAL')
  ) {
    cats.push('tecnico_enfermagem_bucal');
  }

  // 9. Outros Profissionais de Nivel Superior
  if (
    p.includes('NÍVEL SUPERIOR') ||
    p.includes('NIVEL SUPERIOR') ||
    p.includes('FARMACÊUTICO') ||
    p.includes('FARMACEUTICO') ||
    p.includes('NASF') ||
    /2515|2516|2236|2234|2237|2238|2239|2241/.test(c) ||
    /PSIC|SOCIAL|FISIO|NUTRI|FONOAUD|EDUC.*FISIC/.test(cboNome)
  ) {
    cats.push('nivel_superior');
  }

  // 10. Agente Comunitário de Saúde (ACS)
  if (
    p.includes('COMUNITÁRIO') ||
    p.includes('COMUNITARIO') ||
    p.includes('ACS') ||
    c.split(' | ').some((cod) => cod.startsWith('515105')) ||
    cboNome.includes('AGENTE COMUNITARIO')
  ) {
    cats.push('acs');
  }

  // 11. Agente de Combate a Endemias (ACE)
  if (
    p.includes('ENDEMIA') ||
    p.includes('ACE') ||
    c.split(' | ').some((cod) => cod.startsWith('515140') || cod.startsWith('515120')) ||
    cboNome.includes('ENDEMIA')
  ) {
    cats.push('ace');
  }

  // 12. Profissional da Recepção
  if (
    p.includes('RECEP') ||
    p.includes('DIGITADOR') ||
    p.includes('ATENDENTE') ||
    /4221|4110/.test(c) ||
    /RECEPC|ATENDENTE|DIGITADOR|ESCRIT|AUXILIAR ADMINISTRATIVO/.test(cboNome)
  ) {
    cats.push('recepcao');
  }

  return cats.length ? cats : ['recepcao'];
}

// Cache de usuários por 5 minutos para performance instantânea
let cacheUsuarios = null;
let ultimaCarga = 0;
const CACHE_TTL = 5 * 60 * 1000;

async function carregarTodosUsuarios(forcar = false) {
  const agora = Date.now();
  if (cacheUsuarios && !forcar && agora - ultimaCarga < CACHE_TTL) {
    return cacheUsuarios;
  }

  const query = `
    with base as (
      select 
        u.co_seq_usuario as usuario_id,
        u.ds_login,
        u.st_bloqueado,
        pr.co_seq_prof as prof_id,
        coalesce(pr.no_social_profissional, pr.no_civil_profissional, pr.no_profissional_filtro, u.ds_login) as nome,
        pr.nu_cpf as cpf,
        string_agg(distinct coalesce(p.no_perfil, ''), ' | ') as perfis,
        string_agg(distinct coalesce(p.no_tipo_perfil, ''), ' | ') as tipos_perfil,
        string_agg(distinct coalesce(c.co_cbo_2002, ''), ' | ') as cbos_cod,
        string_agg(distinct coalesce(c.no_cbo, ''), ' | ') as cbos_nome,
        max(du.co_seq_dim_unidade_saude) as unidade_id,
        max(du.no_unidade_saude) as unidade_nome,
        max(de.nu_ine) as equipe_ine,
        max(de.no_equipe) as equipe_nome,
        coalesce(
          json_agg(distinct jsonb_build_object(
            'unidadeId', du.co_seq_dim_unidade_saude,
            'unidadeNome', du.no_unidade_saude,
            'equipeIne', de.nu_ine,
            'equipeNome', de.no_equipe,
            'cbo', c.no_cbo
          )) filter (where du.co_seq_dim_unidade_saude is not null or de.nu_ine is not null),
          '[]'::json
        ) as lotacoes
      from tb_usuario u
      left join tb_prof pr on pr.co_usuario = u.co_seq_usuario
      left join tb_ator_papel ap on ap.co_prof = pr.co_seq_prof or ap.co_seq_ator_papel = u.co_ator
      left join rl_ator_papel_perfil app on app.co_ator_papel = ap.co_seq_ator_papel
      left join tb_perfil p on p.co_seq_perfil = app.co_perfil
      left join tb_lotacao l on l.co_prof = pr.co_seq_prof and l.dt_desativacao_lotacao is null
      left join tb_cbo c on c.co_cbo = l.co_cbo
      left join tb_unidade_saude us on us.co_seq_unidade_saude = l.co_unidade_saude
      left join tb_dim_unidade_saude du on du.nu_cnes = us.nu_cnes
      left join tb_equipe eq on eq.co_seq_equipe = l.co_equipe
      left join tb_dim_equipe de on de.nu_ine = eq.nu_ine
      where coalesce(u.st_bloqueado, 0) = 0
      group by 1, 2, 3, 4, 5, 6
    )
    select * from base
    order by nome
  `;

  const rows = await banco.consultar(query);
  const mapeados = rows.map((r) => {
    const cats = classificarUsuario(r);
    const lotacoes = Array.isArray(r.lotacoes) ? r.lotacoes : [];
    const lotacaoPrincipal = lotacoes.find((l) => l.equipeIne || l.unidadeId) || lotacoes[0] || {};
    return {
      id: String(r.usuario_id),
      login: r.ds_login,
      nome: r.nome || r.ds_login,
      cpf: r.cpf,
      categorias: cats,
      perfis: r.perfis,
      cbos: r.cbos_nome,
      unidadeId: (lotacaoPrincipal.unidadeId ? String(lotacaoPrincipal.unidadeId) : null) || (r.unidade_id ? String(r.unidade_id) : null),
      unidadeNome: lotacaoPrincipal.unidadeNome || r.unidade_nome || null,
      equipeIne: lotacaoPrincipal.equipeIne || r.equipe_ine || null,
      equipeNome: lotacaoPrincipal.equipeNome || r.equipe_nome || null,
      lotacoes
    };
  });

  cacheUsuarios = mapeados;
  ultimaCarga = agora;
  return mapeados;
}

async function listarCategorias() {
  const usuarios = await carregarTodosUsuarios();
  const contagens = {};
  for (const u of usuarios) {
    for (const c of u.categorias) {
      contagens[c] = (contagens[c] || 0) + 1;
    }
  }

  return CATEGORIAS.map((c) => ({
    ...c,
    totalUsuarios: contagens[c.id] || 0
  }));
}

async function listarUsuarios(categoriaId, termoBusca = '') {
  const usuarios = await carregarTodosUsuarios();
  const termo = String(termoBusca || '').toLowerCase().trim();

  return usuarios
    .filter((u) => {
      if (categoriaId && !u.categorias.includes(categoriaId)) return false;
      if (termo) {
        const bateNome = u.nome.toLowerCase().includes(termo);
        const bateLogin = u.login.toLowerCase().includes(termo);
        const bateCpf = u.cpf && u.cpf.includes(termo);
        const bateCbo = u.cbos && u.cbos.toLowerCase().includes(termo);
        return bateNome || bateLogin || bateCpf || bateCbo;
      }
      return true;
    })
    .map((u) => ({
      id: u.id,
      login: u.login,
      nome: u.nome,
      cpf: u.cpf ? u.cpf.slice(0, 3) + '.***.***-' + u.cpf.slice(-2) : null,
      categorias: u.categorias,
      unidadeId: u.unidadeId,
      unidadeNome: u.unidadeNome,
      equipeIne: u.equipeIne,
      equipeNome: u.equipeNome,
      cargo: u.cbos ? u.cbos.split(' | ')[0] : u.perfis ? u.perfis.split(' | ')[0] : 'Profissional'
    }));
}

// Sessões em memória (válidas por 24 horas)
const SESSOES = new Map();
const SESSAO_DURACAO_MS = 24 * 60 * 60 * 1000;

function definirPermissoes(usuario, categoriaId) {
  const p = (usuario.perfis || '').toUpperCase();
  const tp = (usuario.tipos_perfil || '').toUpperCase();
  const cbos = (usuario.cbos || '').toUpperCase();
  const cat = categoriaId || (usuario.categorias && usuario.categorias[0]) || 'recepcao';

  const ehAdminGeral = tp.includes('ADMINISTRADOR') || p.includes('ADMINISTRADOR') || p.includes('INSTALADOR') || cat === 'admin_instalacao' || cat === 'gestor';
  const ehCoordenadorUbs = p.includes('COORDENADOR DA UBS') || p.includes('COORDENADOR DO CEO');

  let nivelAcesso = 'equipe'; // 'total' | 'unidade' | 'equipe'
  let podeVerTodasUnidades = false;
  let podeAcessarAdmin = false;
  let blocosPadrao = ['eSF/eAP'];
  let destacarPraticasAcs = false;
  let restringirListaNominal = true;

  if (cat === 'admin_instalacao') {
    nivelAcesso = 'total';
    podeVerTodasUnidades = true;
    podeAcessarAdmin = true;
    blocosPadrao = ['eSF/eAP', 'eSB', 'eMulti'];
    restringirListaNominal = false;
  } else if (cat === 'gestor') {
    nivelAcesso = 'total';
    podeVerTodasUnidades = true;
    podeAcessarAdmin = true;
    blocosPadrao = ['eSF/eAP', 'eSB', 'eMulti'];
    restringirListaNominal = false;
  } else if (cat === 'coordenador') {
    if (ehCoordenadorUbs) {
      nivelAcesso = 'unidade';
      podeVerTodasUnidades = false;
      podeAcessarAdmin = true;
      blocosPadrao = ['eSF/eAP', 'eSB'];
      restringirListaNominal = true;
    } else {
      nivelAcesso = 'total';
      podeVerTodasUnidades = true;
      podeAcessarAdmin = true;
      blocosPadrao = ['eSF/eAP', 'eSB', 'eMulti'];
      restringirListaNominal = false;
    }
  } else if (cat === 'medico' || cat === 'enfermeiro') {
    nivelAcesso = 'equipe';
    podeVerTodasUnidades = false;
    podeAcessarAdmin = false;
    blocosPadrao = ['eSF/eAP'];
    restringirListaNominal = true;
  } else if (cat === 'dentista') {
    nivelAcesso = 'equipe';
    podeVerTodasUnidades = false;
    podeAcessarAdmin = false;
    blocosPadrao = ['eSB'];
    restringirListaNominal = true;
  } else if (cat === 'auxiliar_enfermagem_bucal' || cat === 'tecnico_enfermagem_bucal') {
    nivelAcesso = 'equipe';
    podeVerTodasUnidades = false;
    podeAcessarAdmin = false;
    blocosPadrao = cbos.includes('BUCAL') || cbos.includes('ASB') || cbos.includes('TSB') ? ['eSB'] : ['eSF/eAP'];
    restringirListaNominal = true;
  } else if (cat === 'nivel_superior') {
    nivelAcesso = 'unidade';
    podeVerTodasUnidades = false;
    podeAcessarAdmin = false;
    blocosPadrao = ['eMulti', 'eSF/eAP'];
    restringirListaNominal = true;
  } else if (cat === 'acs') {
    nivelAcesso = 'equipe';
    podeVerTodasUnidades = false;
    podeAcessarAdmin = false;
    blocosPadrao = ['eSF/eAP'];
    destacarPraticasAcs = true;
    restringirListaNominal = true;
  } else if (cat === 'ace') {
    nivelAcesso = 'equipe';
    podeVerTodasUnidades = false;
    podeAcessarAdmin = false;
    blocosPadrao = ['eSF/eAP'];
    restringirListaNominal = true;
  } else {
    // recepcao e outros
    nivelAcesso = 'unidade';
    podeVerTodasUnidades = false;
    podeAcessarAdmin = false;
    blocosPadrao = ['eSF/eAP', 'eSB'];
    restringirListaNominal = true;
  }

  const lotacoes = Array.isArray(usuario.lotacoes) ? usuario.lotacoes : [];
  const unidadesPermitidas = [...new Set(lotacoes.map((l) => l.unidadeId ? String(l.unidadeId) : null).filter(Boolean))];
  if (usuario.unidadeId && !unidadesPermitidas.includes(String(usuario.unidadeId))) {
    unidadesPermitidas.push(String(usuario.unidadeId));
  }

  const equipesPermitidas = [...new Set(lotacoes.map((l) => l.equipeIne ? String(l.equipeIne) : null).filter(Boolean))];
  if (usuario.equipeIne && !equipesPermitidas.includes(String(usuario.equipeIne))) {
    equipesPermitidas.push(String(usuario.equipeIne));
  }

  let descricaoEscopo = 'Visão Municipal Consolidada';
  if (nivelAcesso === 'equipe') {
    descricaoEscopo = usuario.equipeNome ? `Equipe ${usuario.equipeNome}` : 'Sua Equipe';
    if (usuario.unidadeNome) descricaoEscopo += ` (${usuario.unidadeNome})`;
  } else if (nivelAcesso === 'unidade') {
    descricaoEscopo = usuario.unidadeNome ? `Unidade ${usuario.unidadeNome}` : 'Sua Unidade de Saúde';
  }

  return {
    nivelAcesso,
    podeVerTodasUnidades,
    podeAcessarAdmin,
    blocosPadrao,
    destacarPraticasAcs,
    restringirListaNominal,
    descricaoEscopo,
    unidadesPermitidas,
    equipesPermitidas
  };
}

function criarSessao(usuario, categoriaIdEscolhida) {
  const token = crypto.randomBytes(32).toString('hex');
  const catObj = CATEGORIAS.find((c) => c.id === categoriaIdEscolhida) ||
    CATEGORIAS.find((c) => usuario.categorias.includes(c.id)) ||
    CATEGORIAS[0];

  const permissoes = definirPermissoes(usuario, catObj.id);

  const sessao = {
    token,
    usuarioId: usuario.id,
    login: usuario.login,
    nome: usuario.nome,
    cpf: usuario.cpf,
    categoriaId: catObj.id,
    categoriaNome: catObj.nome,
    perfis: usuario.perfis,
    cbos: usuario.cbos,
    unidadeId: usuario.unidadeId,
    unidadeNome: usuario.unidadeNome,
    equipeIne: usuario.equipeIne,
    equipeNome: usuario.equipeNome,
    lotacoes: usuario.lotacoes || [],
    permissoes,
    criadoEm: Date.now(),
    expiraEm: Date.now() + SESSAO_DURACAO_MS
  };

  SESSOES.set(token, sessao);
  return sessao;
}

function obterSessao(token) {
  if (!token) return null;
  const sessao = SESSOES.get(token);
  if (!sessao) return null;
  if (Date.now() > sessao.expiraEm) {
    SESSOES.delete(token);
    return null;
  }
  return sessao;
}

function destruirSessao(token) {
  if (token) SESSOES.delete(token);
}

async function autenticar(loginOuId, categoriaId, senha) {
  if (!senha || senha !== SENHA_PADRAO) {
    return { ok: false, erro: 'Senha incorreta. A senha padrão do sistema é Senha@2026.' };
  }

  const usuarios = await carregarTodosUsuarios();
  const alvo = String(loginOuId || '').trim().toLowerCase();

  const usuario = usuarios.find(
    (u) =>
      u.id === alvo ||
      u.login.toLowerCase() === alvo ||
      (u.cpf && u.cpf === alvo) ||
      u.nome.toLowerCase() === alvo
  );

  if (!usuario) {
    return { ok: false, erro: 'Usuário não localizado no banco de dados do e-SUS APS.' };
  }

  const sessao = criarSessao(usuario, categoriaId);
  return { ok: true, sessao };
}

module.exports = {
  SENHA_PADRAO,
  CATEGORIAS,
  listarCategorias,
  listarUsuarios,
  autenticar,
  criarSessao,
  obterSessao,
  destruirSessao
};
