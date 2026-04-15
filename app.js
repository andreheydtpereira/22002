import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword, updateProfile } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, doc, getDoc, setDoc, query, where } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCEq8AFWDsJTlJgyGxDP0lKHlpwk-kgjqM",
  authDomain: "gestaopendencias-5a5cc.firebaseapp.com",
  projectId: "gestaopendencias-5a5cc",
  storageBucket: "gestaopendencias-5a5cc.firebasestorage.app",
  messagingSenderId: "657893063824",
  appId: "1:657893063824:web:9c5d960c3cd51011ab6c15"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let empresaId = "";
let currentUser = null;
let currentTab = "visao";
let pendencias = [];
let materiais = [];
let users = [];
let planoDia = [];
let selectedMaterial = null;
let materiaisPendencia = [];
let pendingProfileCreate = null;

const topoMap = {visao:"top_visao.svg",pendencias:"top_pendencias.svg",materiais:"top_materiais.svg",planejamento:"top_planejamento.svg",equipe:"top_equipe.svg",gestor:"top_gestor.svg",config:"top_config.svg"};
const menuManutentor = [["visao","Visão","icon_dashboard.svg"],["pendencias","Pend.","icon_tools.svg"],["materiais","Materiais","icon_box.svg"],["equipe","Meu Dia","icon_team.svg"],["config","Config","icon_gear.svg"]];
const menuGestor = [["visao","Visão","icon_dashboard.svg"],["pendencias","Pend.","icon_tools.svg"],["materiais","Materiais","icon_box.svg"],["planejamento","Planej.","icon_calendar.svg"],["equipe","Equipe","icon_team.svg"],["gestor","Gestão","icon_gestor.svg"],["config","Config","icon_gear.svg"]];

window.showAuthTab = function(tab){
  document.getElementById("loginPane").classList.toggle("hidden", tab !== "login");
  document.getElementById("cadastroPane").classList.toggle("hidden", tab !== "cadastro");
  document.getElementById("tabLogin").classList.toggle("active", tab === "login");
  document.getElementById("tabCadastro").classList.toggle("active", tab === "cadastro");
  setMsg("");
};

function setMsg(t){ document.getElementById("authMsg").textContent = t || ""; }

window.registrar = async function(){
  try{
    setMsg("Cadastrando...");
    const empresa = document.getElementById("cadEmpresa").value.trim();
    const nome = document.getElementById("cadNome").value.trim();
    const email = document.getElementById("cadEmail").value.trim();
    const senha = document.getElementById("cadSenha").value;
    const role = document.getElementById("cadRole").value;
    const setor = document.getElementById("cadSetor").value.trim();
    const area = document.getElementById("cadArea").value.trim();
    if(!empresa || !nome || !email || !senha) throw new Error("Preencha empresa, nome, email e senha.");
    if(role === "manutentor" && (!setor || !area)) throw new Error("Manutentor precisa de setor e área.");

    pendingProfileCreate = { empresaId:empresa, nome, email, role, setor:setor || "", area:area || "" };

    const empRef = doc(db, "empresas", empresa);
    const empSnap = await getDoc(empRef);
    if(!empSnap.exists()) await setDoc(empRef, { nome:empresa, createdAt:new Date().toISOString() });

    const licRef = doc(db, "licencas", empresa);
    const licSnap = await getDoc(licRef);
    if(!licSnap.exists()){
      const exp = new Date(); exp.setDate(exp.getDate() + 30);
      await setDoc(licRef, { expira:exp.toISOString(), status:"ativa" });
    }

    const cred = await createUserWithEmailAndPassword(auth, email, senha);
    await updateProfile(cred.user, { displayName:nome });
    setMsg("Usuário criado. Finalizando perfil...");
  }catch(e){ setMsg(e.message || "Falha no cadastro."); }
};

window.login = async function(){
  try{
    empresaId = document.getElementById("loginEmpresa").value.trim();
    const email = document.getElementById("loginEmail").value.trim();
    const senha = document.getElementById("loginSenha").value;
    if(!empresaId || !email || !senha) throw new Error("Preencha empresa, email e senha.");
    setMsg("Entrando...");
    await signInWithEmailAndPassword(auth, email, senha);
  }catch(e){ setMsg(e.message || "Falha no login."); }
};

window.logout = async function(){ await signOut(auth); };

onAuthStateChanged(auth, async (user) => {
  if(!user){
    document.getElementById("authView").classList.remove("hidden");
    document.getElementById("appView").classList.add("hidden");
    currentUser = null;
    return;
  }
  try{
    if(pendingProfileCreate && pendingProfileCreate.email === user.email){
      const ref = doc(db, "users", user.uid);
      const snap = await getDoc(ref);
      if(!snap.exists()){
        await setDoc(ref, {
          uid:user.uid, empresaId:pendingProfileCreate.empresaId, nome:pendingProfileCreate.nome, email:pendingProfileCreate.email,
          role:pendingProfileCreate.role, setor:pendingProfileCreate.setor, area:pendingProfileCreate.area, ativo:true, createdAt:new Date().toISOString()
        });
      }
      empresaId = pendingProfileCreate.empresaId;
      pendingProfileCreate = null;
    }

    const userSnap = await getDoc(doc(db, "users", user.uid));
    if(!userSnap.exists()) throw new Error("Usuário sem cadastro.");
    currentUser = userSnap.data();

    if(empresaId && currentUser.empresaId !== empresaId){
      await signOut(auth);
      setMsg("Usuário não pertence à empresa informada.");
      return;
    }

    empresaId = currentUser.empresaId;
    const licSnap = await getDoc(doc(db, "licencas", empresaId));
    if(!licSnap.exists()) throw new Error("Empresa sem licença.");
    const lic = licSnap.data();
    if(lic.status !== "ativa") throw new Error("Licença inativa.");
    if(new Date() > new Date(lic.expira)) throw new Error("Licença expirada.");

    document.getElementById("authView").classList.add("hidden");
    document.getElementById("appView").classList.remove("hidden");
    document.getElementById("empresaLabel").textContent = `Empresa: ${empresaId}`;
    document.getElementById("usuarioLabel").textContent = `${currentUser.nome} • ${currentUser.role}`;
    buildMenu();
    await preload();
    render();
  }catch(e){
    await signOut(auth);
    setMsg(e.message || "Falha ao carregar usuário.");
  }
});

function buildMenu(){
  const items = (currentUser.role === "gestor" || currentUser.role === "admin") ? menuGestor : menuManutentor;
  const menu = document.getElementById("menuCarousel");
  menu.innerHTML = items.map(([key,label,icon]) => `<div class="item ${key===currentTab ? "active" : ""}" onclick="openTab('${key}')"><img src="${icon}" alt="${label}"><span>${label}</span></div>`).join("") + `<div class="item" onclick="logout()"><img src="icon_exit.svg" alt="Sair"><span>Sair</span></div>`;
}

window.openTab = function(tab){ currentTab = tab; buildMenu(); render(); };

async function preload(){ await Promise.all([loadPendencias(), loadMateriais(), loadUsers()]); }
async function loadPendencias(){ pendencias=[]; const snap=await getDocs(collection(db,"empresas",empresaId,"pendencias")); snap.forEach(d=>pendencias.push({id:d.id,...d.data()})); }
async function loadMateriais(){ materiais=[]; const snap=await getDocs(collection(db,"empresas",empresaId,"materiais")); snap.forEach(d=>materiais.push({id:d.id,...d.data()})); }
async function loadUsers(){ users=[]; const snap=await getDocs(query(collection(db,"users"),where("empresaId","==",empresaId))); snap.forEach(d=>users.push({id:d.id,...d.data()})); }

function esc(v){ return String(v ?? "").replace(/[&<>"]/g, s => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[s])); }
function badge(v){ return `<span class="badge">${esc(v)}</span>`; }
function criticidadePeso(v){ if(v==="alta") return 3; if(v==="media") return 2; return 1; }
function tipoPeso(v){ if(v==="seguranca") return 6; if(v==="qualidade") return 5; if(v==="producao") return 4; return 0; }
function esforcoPeso(v){ if(v==="pesado") return 1.5; if(v==="medio") return 1.2; return 1; }
function statusSafe(v){ const map={aberta:"Aberta",aguardando_material:"Aguardando material",em_atendimento:"Em atendimento",aguardando_parada:"Aguardando parada",maquina_parada:"Máquina parada",nao_iniciada:"Não iniciada",em_andamento:"Em andamento",concluido:"Concluído"}; return map[v] || v || "-"; }
function statusBloqueado(v){ return ["aguardando_material","aguardando_parada"].includes(v); }
function tempoReal(p){ const exec=Number(p.tempoExec||1); const prep=Number(p.tempoPrep||0); return (exec+prep) * esforcoPeso(p.esforco || "leve"); }
function prioridadeTotal(p){ let x = criticidadePeso(p.criticidade || "baixa") + tipoPeso(p.tipo || ""); if(p.maquinaParada || p.status==="maquina_parada") x += 10; return x; }
function pendenciasPorPerfil(){ if(currentUser.role==="gestor" || currentUser.role==="admin") return pendencias; return pendencias.filter(p=>p.setor===currentUser.setor && p.area===currentUser.area); }

function render(){
  document.getElementById("topImage").src = topoMap[currentTab] || "top_visao.svg";
  if(currentTab==="visao") return renderVisao();
  if(currentTab==="pendencias") return renderPendencias();
  if(currentTab==="materiais") return renderMateriais();
  if(currentTab==="planejamento") return renderPlanejamento();
  if(currentTab==="equipe") return renderEquipe();
  if(currentTab==="gestor") return renderGestor();
  if(currentTab==="config") return renderConfig();
}

function renderVisao(){
  const list = pendenciasPorPerfil();
  const abertas = list.filter(x=>x.status==="aberta").length;
  const agMat = list.filter(x=>x.status==="aguardando_material").length;
  const emAt = list.filter(x=>x.status==="em_atendimento").length;
  document.getElementById("cardCentral").innerHTML = `<div class="kpis"><div class="kpi"><div class="num">${list.length}</div><div>Pendências</div></div><div class="kpi"><div class="num">${abertas}</div><div>Abertas</div></div><div class="kpi"><div class="num">${agMat}</div><div>Aguardando material</div></div><div class="kpi"><div class="num">${emAt}</div><div>Em atendimento</div></div></div><div class="module-panel"><h3>Visão Geral</h3>${list.length ? list.map(p=>`<div class="list-item"><strong>${esc(p.titulo)}</strong><br>${badge(p.setor || "-")} ${badge(p.area || "-")} ${badge(p.maquina || "-")} ${badge(statusSafe(p.status))}<div class="muted">Criticidade: ${esc(p.criticidade || "-")} • Tipo: ${esc(p.tipo || "-")} • Tempo real: ${tempoReal(p).toFixed(1)}h</div></div>`).join("") : `<div class="list-item">Sem pendências.</div>`}</div>`;
}

function renderPendencias(){
  materiaisPendencia=[]; selectedMaterial=null;
  document.getElementById("cardCentral").innerHTML = `<div class="module-panel"><h3>Criar Pendência</h3><div class="grid"><input id="pTitulo" placeholder="Título"><input id="pMaquina" placeholder="Máquina"><select id="pSetor"><option value="">Setor</option><option value="UPA">UPA</option><option value="UPGR">UPGR</option></select><select id="pArea"><option value="">Área</option><option value="Confecção">Confecção</option><option value="Cortadeiras">Cortadeiras</option><option value="Frisos">Frisos</option></select><select id="pCriticidade"><option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option></select><select id="pTipo"><option value="seguranca">Segurança</option><option value="qualidade">Qualidade</option><option value="producao">Produção</option><option value="outra">Outra</option></select><input id="pTempoExec" placeholder="Tempo execução (h)"><input id="pTempoPrep" placeholder="Tempo preparação (h)"><select id="pEsforco"><option value="leve">Leve</option><option value="medio">Médio</option><option value="pesado">Pesado</option></select><select id="pStatus"><option value="aberta">Aberta</option><option value="aguardando_material">Aguardando material</option><option value="em_atendimento">Em atendimento</option><option value="aguardando_parada">Aguardando parada</option><option value="maquina_parada">Máquina parada</option></select></div><textarea id="pDesc" placeholder="Descrição"></textarea><div class="module-panel"><h4>Materiais da pendência</h4><input id="mBuscaPend" placeholder="Buscar material por nome"><div id="mBuscaPendRes"></div><div class="row"><button class="small-btn" id="btnAddMaterial">Adicionar material selecionado</button></div><div id="listaMateriaisPendencia"></div></div><button id="btnSalvarPendencia">Salvar pendência</button></div>`;
  document.getElementById("mBuscaPend").addEventListener("input", renderBuscaMaterialPendencia);
  document.getElementById("btnAddMaterial").addEventListener("click", addMaterialNaPendencia);
  document.getElementById("btnSalvarPendencia").addEventListener("click", salvarPendencia);
  renderBuscaMaterialPendencia();
  renderListaMateriaisPendencia();
}

function renderBuscaMaterialPendencia(){
  const q=(document.getElementById("mBuscaPend").value || "").toLowerCase().trim();
  const filtrados = materiais.filter(m => !q || (m.nome || "").toLowerCase().includes(q));
  document.getElementById("mBuscaPendRes").innerHTML = filtrados.length ? filtrados.map(m=>`<div class="list-item" data-mid="${m.id}"><strong>${esc(m.nome)}</strong></div>`).join("") : `<div class="list-item">Sem materiais cadastrados.</div>`;
  document.querySelectorAll("[data-mid]").forEach(el => el.addEventListener("click", ()=>{ document.querySelectorAll("[data-mid]").forEach(x=>x.style.outline="none"); el.style.outline="2px solid #7ab0ff"; selectedMaterial = materiais.find(m=>m.id===el.getAttribute("data-mid")) || null; }));
}

function addMaterialNaPendencia(){ if(!selectedMaterial) return alert("Selecione um material."); materiaisPendencia.push({id:selectedMaterial.id,nome:selectedMaterial.nome}); renderListaMateriaisPendencia(); }
function renderListaMateriaisPendencia(){ const box=document.getElementById("listaMateriaisPendencia"); if(!box) return; box.innerHTML = materiaisPendencia.length ? materiaisPendencia.map((m,i)=>`<div class="list-item">${esc(m.nome)}<div class="row"><button class="small-btn" onclick="remMatPend(${i})">Remover</button></div></div>`).join("") : `<div class="list-item">Nenhum material adicionado.</div>`; }
window.remMatPend = function(i){ materiaisPendencia.splice(i,1); renderListaMateriaisPendencia(); };

async function salvarPendencia(){
  const payload = {
    titulo:document.getElementById("pTitulo").value.trim(),
    maquina:document.getElementById("pMaquina").value.trim(),
    setor:document.getElementById("pSetor").value,
    area:document.getElementById("pArea").value,
    criticidade:document.getElementById("pCriticidade").value,
    tipo:document.getElementById("pTipo").value,
    tempoExec:Number(document.getElementById("pTempoExec").value || 1),
    tempoPrep:Number(document.getElementById("pTempoPrep").value || 0),
    esforco:document.getElementById("pEsforco").value,
    status:document.getElementById("pStatus").value,
    maquinaParada:document.getElementById("pStatus").value === "maquina_parada",
    descricao:document.getElementById("pDesc").value.trim(),
    materiais:materiaisPendencia,
    execucao:"nao_iniciada",
    createdBy:currentUser.uid,
    createdAt:new Date().toISOString()
  };
  if(!payload.titulo || !payload.setor || !payload.area) return alert("Título, setor e área são obrigatórios.");
  await addDoc(collection(db,"empresas",empresaId,"pendencias"), payload);
  await loadPendencias();
  currentTab="visao"; buildMenu(); render();
}

function renderMateriais(){
  document.getElementById("cardCentral").innerHTML = `<div class="module-panel"><h3>Materiais</h3>${(currentUser.role==="gestor" || currentUser.role==="admin") ? `<div class="row"><input id="novoMaterial" placeholder="Novo material"><button class="small-btn" id="btnNovoMaterial">Cadastrar</button></div>` : ""}${materiais.length ? materiais.map(m=>`<div class="list-item"><strong>${esc(m.nome)}</strong></div>`).join("") : `<div class="list-item">Sem materiais cadastrados.</div>`}</div>`;
  document.getElementById("btnNovoMaterial")?.addEventListener("click", salvarMaterial);
}
async function salvarMaterial(){ const nome=document.getElementById("novoMaterial").value.trim(); if(!nome) return alert("Informe o nome do material."); await addDoc(collection(db,"empresas",empresaId,"materiais"), {nome, createdAt:new Date().toISOString()}); await loadMateriais(); renderMateriais(); }

function gerarPlano(){
  const tarefas=[...pendencias].filter(p=>!statusBloqueado(p.status)).sort((a,b)=>prioridadeTotal(b)-prioridadeTotal(a));
  const manutentores = users.filter(u=>u.role==="manutentor");
  const base=(manutentores.length ? manutentores : [{nome:"João",setor:"UPA",area:"Confecção"},{nome:"Carlos",setor:"UPGR",area:"Cortadeiras"},{nome:"Marcos",setor:"UPGR",area:"Frisos"}]).map(u=>({nome:u.nome,setor:u.setor,area:u.area,horas:0,tarefas:[]}));
  tarefas.forEach(t=>{ const needed=Number(t.quantidadeManutentores || 1); const horas=tempoReal(t); const candidatos=base.filter(b=>b.setor===t.setor && b.area===t.area).sort((a,b)=>a.horas-b.horas); for(let i=0;i<needed;i++){ const alvo=candidatos[i] || candidatos[0]; if(!alvo) continue; if(alvo.horas + horas <= 8){ alvo.tarefas.push({titulo:t.titulo,horas,prioridade:prioridadeTotal(t),status:t.status}); alvo.horas += horas; } } });
  planoDia=base;
}

function renderPlanejamento(){
  gerarPlano();
  document.getElementById("cardCentral").innerHTML = `<div class="module-panel"><h3>Planejamento do Dia</h3><div class="muted">Motor real: prioridade por segurança/qualidade/produção + criticidade + máquina parada, bloqueio por status, limite de 8h e esforço.</div>${planoDia.map(p=>`<div class="list-item"><strong>${esc(p.nome)}</strong><br>${badge(p.setor)} ${badge(p.area)}<div class="muted">Carga: ${p.horas.toFixed(1)}h / 8h</div><div style="margin-top:8px">${p.tarefas.length ? p.tarefas.map(t=>`${esc(t.titulo)} • ${t.horas.toFixed(1)}h • prioridade ${t.prioridade}`).join("<br>") : "Sem tarefas"}</div></div>`).join("")}</div>`;
}

function renderEquipe(){
  if(!planoDia.length) gerarPlano();
  const minha = currentUser.role==="manutentor" ? planoDia.filter(p=>p.nome===currentUser.nome) : planoDia;
  document.getElementById("cardCentral").innerHTML = `<div class="module-panel"><h3>${currentUser.role==="manutentor" ? "Minha Programação" : "Equipe"}</h3>${minha.length ? minha.map(p=>`<div class="list-item"><strong>${esc(p.nome)}</strong><br>${badge(p.setor)} ${badge(p.area)}<div class="muted">Carga atual: ${p.horas.toFixed(1)}h</div><div style="margin-top:8px">${p.tarefas.length ? p.tarefas.map(t=>`${esc(t.titulo)} • ${t.horas.toFixed(1)}h`).join("<br>") : "Sem tarefas"}</div></div>`).join("") : `<div class="list-item">Sem programação.</div>`}</div>`;
}

function renderGestor(){
  const manutentores=users.filter(u=>u.role==="manutentor").length;
  const gestores=users.filter(u=>u.role==="gestor").length;
  document.getElementById("cardCentral").innerHTML = `<div class="kpis"><div class="kpi"><div class="num">${users.length}</div><div>Usuários</div></div><div class="kpi"><div class="num">${manutentores}</div><div>Manutentores</div></div><div class="kpi"><div class="num">${gestores}</div><div>Gestores</div></div><div class="kpi"><div class="num">${pendencias.length}</div><div>Pendências</div></div></div><div class="module-panel"><h3>Painel Gestor</h3>${users.map(u=>`<div class="list-item"><strong>${esc(u.nome)}</strong><br>${badge(u.role)} ${badge(u.setor || "-")} ${badge(u.area || "-")}<div class="muted">${esc(u.email || "-")}</div></div>`).join("")}</div>`;
}

function renderConfig(){
  document.getElementById("cardCentral").innerHTML = `<div class="module-panel"><h3>Config</h3><div class="muted">Fluxo de cadastro corrigido: cria no Auth primeiro e só grava perfil no Firestore depois que a sessão estiver válida.</div></div>`;
}
