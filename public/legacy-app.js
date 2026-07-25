/* ============================= DADOS / ESTADO ============================= */
const CATEGORIAS_PADRAO = ["Peixes e Frutos do Mar","Grãos e Cereais","Hortifruti","Carnes","Laticínios","Outros"];
// Categorias agora são cadastráveis (aba Categorias) — esta função sempre lê a lista atual de db.categorias,
// então uma categoria nova cadastrada aparece automaticamente nos formulários de Produtos Brutos, Fracionados e Importar NF.
function compareText(a,b){ return String(a||'').localeCompare(String(b||''), 'pt-BR', {sensitivity:'base'}); }
function nomesOrdenados(items){ return (items||[]).map(x=>typeof x==='string'?x:x.nome).filter(Boolean).sort(compareText); }
function categoriaOptions(){ return nomesOrdenados(db.categorias); }
const UNIDADES = ["KG","G","L","ML","UN","CX","PCT"];
const TIPOS_LOCAL = ["Central","Consumidor","Fracionamento"];
// Estas listas NÃO são mais fixas: elas são recalculadas a partir da aba "Locais" a cada uso,
// então um novo local cadastrado passa a aparecer automaticamente nos formulários, relatórios,
// estoque atual e dashboard, sem precisar editar código nenhum.
function getCentralNome(){ const l = db.locais.find(x=>x.tipo==='Central'); return l ? l.nome : 'Central de Distribuição'; }
function getCozinhaNome(){ const l = db.locais.find(x=>x.tipo==='Fracionamento'); return l ? l.nome : 'Cozinha de Produção de Fracionados'; }
function destinosCentralOptions(){ return nomesOrdenados(db.locais.filter(l=>l.tipo!=='Central')); }
function destinosFracionadoOptions(){ return nomesOrdenados(db.locais.filter(l=>l.tipo==='Consumidor')); }
const STORAGE_KEY = "estoqueFranCasarinDB_v1";

const FRACIONADOS_TABS = new Set(['estoqueCentral','estoqueFracionados','producoes','saidasFracionado']);
const FRACIONADOS_EDIT_TABS = new Set(['producoes','saidasFracionado']);
const PERFIS_SIMULAVEIS = new Set(['master','administrador','controle_fracionados','visualizador']);
function previewSimulationAllowed(){
  const host = window.location.hostname;
  return host==='localhost' || host==='127.0.0.1' || host.endsWith('.github.io');
}
function previewSimulationRole(){
  try{
    if(!previewSimulationAllowed()) return '';
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('perfil') || params.get('papel_teste') || '';
    if(fromUrl && PERFIS_SIMULAVEIS.has(fromUrl)) return fromUrl;
    const fromStorage = localStorage.getItem('estoqueSimularPapel') || '';
    return PERFIS_SIMULAVEIS.has(fromStorage) ? fromStorage : '';
  }catch(e){ return ''; }
}
function accessProfile(){
  const profile = (window.__estoqueAccess && window.__estoqueAccess.profile) || {papel:'visualizador', email:''};
  const simulated = previewSimulationRole();
  return simulated ? {...profile, papel:simulated, email:profile.email||'simulado@local'} : profile;
}
function profileIsActive(){ return !(window.__estoqueAccess && window.__estoqueAccess.profile && window.__estoqueAccess.profile.ativo===false); }
function isFracionadosAccess(){ return accessProfile().papel === 'controle_fracionados'; }
function canEditSystem(){
  const papel = accessProfile().papel;
  return profileIsActive() && (papel==='master' || papel==='administrador');
}
function canManageUsers(){ return profileIsActive() && accessProfile().papel === 'master'; }
function canViewTab(tab){
  if(tab==='usuarios') return canManageUsers();
  if(isFracionadosAccess()) return FRACIONADOS_TABS.has(tab);
  return true;
}
function canEditTab(tab){
  if(canEditSystem()) return true;
  return profileIsActive() && isFracionadosAccess() && FRACIONADOS_EDIT_TABS.has(tab);
}
function roleLabel(papel){
  return papel==='master' ? 'Master' : papel==='administrador' ? 'Administrador' : papel==='controle_fracionados' ? 'Controle de Fracionados' : 'Visualizador';
}
function ensureCanEdit(){
  if(canEditTab(currentTab)) return true;
  alert('Seu acesso permite consulta nesta tela, mas não permite alterar estes dados.');
  return false;
}

function seedDB(){
  return {
    categorias: CATEGORIAS_PADRAO.map(nome=>({nome})),
    brutos:[
      {nome:"Salmão Fresco", categoria:"Peixes e Frutos do Mar", unidade:"KG", estoqueMinimo:5, fornecedor:"Fornecedor Mar Azul", precoMedio:42.00, validadeDias:3},
      {nome:"Arroz Japonês", categoria:"Grãos e Cereais", unidade:"KG", estoqueMinimo:10, fornecedor:"Fornecedor Grão Bom", precoMedio:8.50, validadeDias:180},
      {nome:"Alface Americana", categoria:"Hortifruti", unidade:"UN", estoqueMinimo:5, fornecedor:"Fornecedor Horta Feliz", precoMedio:3.50, validadeDias:5},
      {nome:"Filé de Frango", categoria:"Carnes", unidade:"KG", estoqueMinimo:8, fornecedor:"Fornecedor Avícola Sul", precoMedio:22.00, validadeDias:4},
      {nome:"Tomate", categoria:"Hortifruti", unidade:"KG", estoqueMinimo:5, fornecedor:"Fornecedor Horta Feliz", precoMedio:6.00, validadeDias:6},
      {nome:"Queijo Muçarela", categoria:"Laticínios", unidade:"KG", estoqueMinimo:5, fornecedor:"Fornecedor Laticínios Serra", precoMedio:32.00, validadeDias:20},
    ],
    fracionados:[
      {nome:"Salmão Fatiado para Sushi", categoria:"Peixes e Frutos do Mar", unidade:"KG", origem:"Salmão Fresco", rendimento:85, estoqueMinimo:2, validadeDias:2},
      {nome:"Arroz Temperado para Sushi", categoria:"Grãos e Cereais", unidade:"KG", origem:"Arroz Japonês", rendimento:110, estoqueMinimo:3, validadeDias:2},
      {nome:"Alface Higienizada e Cortada", categoria:"Hortifruti", unidade:"KG", origem:"Alface Americana", rendimento:80, estoqueMinimo:2, validadeDias:3},
      {nome:"Frango Grelhado em Cubos", categoria:"Carnes", unidade:"KG", origem:"Filé de Frango", rendimento:75, estoqueMinimo:2, validadeDias:3},
      {nome:"Tomate Picado", categoria:"Hortifruti", unidade:"KG", origem:"Tomate", rendimento:92, estoqueMinimo:2, validadeDias:2},
    ],
    locais:[
      {nome:"Central de Distribuição", tipo:"Central", responsavel:"Igor Morgado"},
      {nome:"Buffet Fran Casaria", tipo:"Consumidor", responsavel:""},
      {nome:"Sushi", tipo:"Consumidor", responsavel:""},
      {nome:"Restaurante Arboreto", tipo:"Consumidor", responsavel:""},
      {nome:"Cozinha de Produção de Fracionados", tipo:"Fracionamento", responsavel:""},
    ],
    entradasCentral:[
      {data:"2026-07-01", nf:"NF-1001", produto:"Salmão Fresco", fornecedor:"Fornecedor Mar Azul", quantidade:40, precoUnitario:42.00, validade:"2026-07-12"},
      {data:"2026-07-01", nf:"NF-1002", produto:"Arroz Japonês", fornecedor:"Fornecedor Grão Bom", quantidade:30, precoUnitario:8.50, validade:"2027-01-01"},
      {data:"2026-07-02", nf:"NF-1003", produto:"Filé de Frango", fornecedor:"Fornecedor Avícola Sul", quantidade:25, precoUnitario:22.00, validade:"2026-07-09"},
      {data:"2026-07-02", nf:"NF-1004", produto:"Tomate", fornecedor:"Fornecedor Horta Feliz", quantidade:20, precoUnitario:6.00, validade:"2026-07-10"},
      {data:"2026-07-03", nf:"NF-1005", produto:"Alface Americana", fornecedor:"Fornecedor Horta Feliz", quantidade:15, precoUnitario:3.50, validade:"2026-07-09"},
    ],
    saidasCentral:[
      {data:"2026-07-04", documento:"SC-001", produto:"Salmão Fresco", destino:"Cozinha de Produção de Fracionados", quantidade:25},
      {data:"2026-07-04", documento:"SC-002", produto:"Arroz Japonês", destino:"Cozinha de Produção de Fracionados", quantidade:20},
      {data:"2026-07-05", documento:"SC-003", produto:"Filé de Frango", destino:"Restaurante Arboreto", quantidade:15},
      {data:"2026-07-05", documento:"SC-004", produto:"Tomate", destino:"Cozinha de Produção de Fracionados", quantidade:12},
      {data:"2026-07-06", documento:"SC-005", produto:"Alface Americana", destino:"Cozinha de Produção de Fracionados", quantidade:10},
      {data:"2026-07-06", documento:"SC-006", produto:"Filé de Frango", destino:"Buffet Fran Casaria", quantidade:5},
    ],
    producoes:[
      {data:"2026-07-06", produtoBruto:"Salmão Fresco", quantidadeUtilizada:20, produtoFracionado:"Salmão Fatiado para Sushi", quantidadeProduzida:17},
      {data:"2026-07-06", produtoBruto:"Arroz Japonês", quantidadeUtilizada:18, produtoFracionado:"Arroz Temperado para Sushi", quantidadeProduzida:22},
      {data:"2026-07-06", produtoBruto:"Alface Americana", quantidadeUtilizada:10, produtoFracionado:"Alface Higienizada e Cortada", quantidadeProduzida:8},
      {data:"2026-07-06", produtoBruto:"Tomate", quantidadeUtilizada:12, produtoFracionado:"Tomate Picado", quantidadeProduzida:11},
    ],
    saidasFracionado:[
      {data:"2026-07-07", documento:"SF-001", produto:"Salmão Fatiado para Sushi", destino:"Sushi", quantidade:10},
      {data:"2026-07-07", documento:"SF-002", produto:"Arroz Temperado para Sushi", destino:"Sushi", quantidade:12},
      {data:"2026-07-07", documento:"SF-003", produto:"Alface Higienizada e Cortada", destino:"Buffet Fran Casaria", quantidade:5},
      {data:"2026-07-07", documento:"SF-004", produto:"Tomate Picado", destino:"Restaurante Arboreto", quantidade:6},
    ],
    pedidosFeitos:{},
    pedidosCompra:[],
    itensManuaisCompra:[],
    ajustesEstoque:[],
  };
}

let db = loadDB();
function loadDB(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw) return normalizeDB(JSON.parse(raw));
  }catch(e){}
  return seedDB();
}
// Garante que dados salvos por uma versão anterior do sistema (antes da aba Categorias existir) continuem funcionando.
function normalizeDB(data){
  if(!Array.isArray(data.categorias) || data.categorias.length===0){
    const nomes = new Set(CATEGORIAS_PADRAO);
    (data.brutos||[]).forEach(b=> b.categoria && nomes.add(b.categoria));
    (data.fracionados||[]).forEach(f=> f.categoria && nomes.add(f.categoria));
    data.categorias = [...nomes].map(nome=>({nome}));
  }
  data.pedidosFeitos = data.pedidosFeitos || {};
  data.pedidosCompra = data.pedidosCompra || [];
  data.itensManuaisCompra = data.itensManuaisCompra || [];
  data.ajustesEstoque = data.ajustesEstoque || [];
  return data;
}
function nameKey(value){
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleUpperCase('pt-BR').replace(/\s+/g,' ').trim();
}
function sameName(a,b){ return nameKey(a)===nameKey(b); }
function replaceExactName(value, oldName, newName){ return value===oldName ? newName : value; }
function renameBrutoReferences(oldName,newName){
  if(!oldName || oldName===newName) return;
  (db.entradasCentral||[]).forEach(x=>x.produto=replaceExactName(x.produto,oldName,newName));
  (db.saidasCentral||[]).forEach(x=>x.produto=replaceExactName(x.produto,oldName,newName));
  (db.producoes||[]).forEach(x=>x.produtoBruto=replaceExactName(x.produtoBruto,oldName,newName));
  (db.ajustesEstoque||[]).forEach(x=>x.produto=replaceExactName(x.produto,oldName,newName));
  (db.pedidosCompra||[]).forEach(x=>x.produto=replaceExactName(x.produto,oldName,newName));
  (db.fracionados||[]).forEach(x=>x.origem=replaceExactName(x.origem,oldName,newName));
  db.itensManuaisCompra=(db.itensManuaisCompra||[]).map(x=>replaceExactName(x,oldName,newName));
}
function renameFracionadoReferences(oldName,newName){
  if(!oldName || oldName===newName) return;
  (db.producoes||[]).forEach(x=>x.produtoFracionado=replaceExactName(x.produtoFracionado,oldName,newName));
  (db.saidasFracionado||[]).forEach(x=>x.produto=replaceExactName(x.produto,oldName,newName));
}
function captureCurrentDraft(){
  const form=document.querySelector(`#form-${currentTab}`);
  if(!form) return null;
  const values={};
  form.querySelectorAll('[name]').forEach(el=>values[el.name]=el.value);
  return {tab:currentTab,values,focusedName:document.activeElement && document.activeElement.name};
}
function restoreCurrentDraft(draft){
  if(!draft || draft.tab!==currentTab) return;
  const form=document.querySelector(`#form-${currentTab}`);
  if(!form) return;
  Object.entries(draft.values).forEach(([name,value])=>{
    const el=form.querySelector(`[name="${name}"]`);
    if(el){ el.value=value; el.dispatchEvent(new Event('change',{bubbles:true})); }
  });
  const focused=draft.focusedName && form.querySelector(`[name="${draft.focusedName}"]`);
  if(focused) focused.focus();
}
let storageAvailable = true;
function saveDB(){
  if(!canEditTab(currentTab)){
    db = loadDB();
    render();
    return false;
  }
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); }
  catch(e){
    if(storageAvailable){ storageAvailable = false; showStorageWarning(); }
  }
  if(window.__estoqueCloudSync && typeof window.__estoqueCloudSync.save === 'function'){
    window.__estoqueCloudSync.save(db);
  }
  return true;
}
window.__estoqueLegacy = {
  getDB(){ return db; },
  replaceDB(nextDB){
    const draft = captureCurrentDraft();
    db = normalizeDB(nextDB || seedDB());
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); }catch(e){}
    render();
    restoreCurrentDraft(draft);
  },
  render(){ render(); }
};
window.__simularPapelEstoque = function(papel){
  if(!previewSimulationAllowed()) return false;
  try{
    if(papel && PERFIS_SIMULAVEIS.has(papel)) localStorage.setItem('estoqueSimularPapel', papel);
    else localStorage.removeItem('estoqueSimularPapel');
    window.location.reload();
    return true;
  }catch(e){ return false; }
};
function showStorageWarning(){
  const w = document.createElement('div');
  w.style.cssText = "background:#fdf1d6;color:#8a5e00;padding:8px 24px;font-size:12.5px;border-bottom:1px solid #e7e2d8;";
  w.textContent = "Aviso: este navegador não permite salvar os dados localmente (localStorage bloqueado ao abrir o arquivo diretamente). Os lançamentos funcionam normalmente, mas serão perdidos ao fechar a página. Para manter os dados salvos, abra este arquivo por um servidor local ou use Chrome/Edge.";
  document.body.insertBefore(w, document.getElementById('layout'));
}
function resetDB(){
  if(confirm("Isso vai substituir todos os dados atuais pelos dados de exemplo. Continuar?")){
    db = seedDB(); saveDB(); render();
  }
}

/* ============================= HELPERS DE CÁLCULO ============================= */
function todayStr(){ return new Date().toISOString().slice(0,10); }
function fmtDate(d){ if(!d) return "—"; const [y,m,dd]=d.split("-"); return `${dd}/${m}/${y}`; }
function roundStock(n){ return Math.round((Number(n||0)+Number.EPSILON)*100)/100; }
function exceedsStock(requested,available){ return roundStock(requested)>roundStock(available); }
function fmtNum(n){ return roundStock(n).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function fmtMoney(n){ return "R$ " + fmtNum(n); }
function escapeHtml(s){
  return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function parseBRNumber(s){
  if(!s) return 0;
  return parseFloat(String(s).replace(/\./g,'').replace(',','.')) || 0;
}
function sumWhere(arr, field, val, sumField){
  return arr.reduce((acc,r)=> sameName(r[field],val) ? acc + Number(r[sumField]||0) : acc, 0);
}
function daysBetween(dateStr){
  const d = new Date(dateStr+"T00:00:00");
  const t = new Date(todayStr()+"T00:00:00");
  return Math.round((d-t)/86400000);
}

function saldoCentral(produto){
  const entradas = sumWhere(db.entradasCentral,'produto',produto,'quantidade');
  const saidas = sumWhere(db.saidasCentral,'produto',produto,'quantidade');
  const consumoDireto = db.producoes.reduce((a,p)=>sameName(p.produtoBruto,produto) ? a+Number(p.quantidadeUtilizada||0):a,0);
  const ajustes = sumWhere(db.ajustesEstoque,'produto',produto,'diferenca');
  return roundStock(entradas - saidas - consumoDireto + ajustes);
}
function saldoCozinhaBruto(produto){
  const recebido = db.saidasCentral.filter(s=>s.destino===getCozinhaNome()).reduce((a,r)=> sameName(r.produto,produto) ? a+Number(r.quantidade||0):a,0);
  const consumido = sumWhere(db.producoes,'produtoBruto',produto,'quantidadeUtilizada');
  return roundStock(recebido - consumido);
}
function saldoLocalBruto(produto, local){
  return roundStock(db.saidasCentral.filter(s=>s.destino===local).reduce((a,r)=> sameName(r.produto,produto) ? a+Number(r.quantidade||0):a,0));
}
function saldoCozinhaFracionado(produto){
  return roundStock(sumWhere(db.producoes,'produtoFracionado',produto,'quantidadeProduzida') - sumWhere(db.saidasFracionado,'produto',produto,'quantidade'));
}
function saldoLocalFracionado(produto, local){
  return roundStock(db.saidasFracionado.filter(s=>s.destino===local).reduce((a,r)=> sameName(r.produto,produto) ? a+Number(r.quantidade||0):a,0));
}
function statusBadge(saldo, minimo){
  if(saldo<=minimo) return `<span class="badge-status st-bad">⚠ ABAIXO DO MÍNIMO</span>`;
  return `<span class="badge-status st-ok">✓ NORMAL</span>`;
}
function validadeBadge(dias){
  if(dias<0) return `<span class="badge-status st-bad">✖ VENCIDO</span>`;
  if(dias<=3) return `<span class="badge-status st-bad">⚠ URGENTE</span>`;
  if(dias<=7) return `<span class="badge-status st-warn">⏳ ATENÇÃO</span>`;
  return `<span class="badge-status st-ok">✓ OK</span>`;
}

/* ============================= NAV ============================= */
let currentTab = "dashboard";
document.querySelectorAll('.navitem[data-tab]').forEach(btn=>{
  btn.addEventListener('click', ()=>{ currentTab = btn.dataset.tab; render(); closeMobileSidebar(); });
});
document.getElementById('resetBtn').addEventListener('click', resetDB);
const logoutBtn = document.getElementById('logoutBtn');
if(logoutBtn){
  logoutBtn.addEventListener('click', ()=>{
    window.dispatchEvent(new CustomEvent('estoque:logout'));
  });
}

// Menu hamburguer — em telas estreitas a barra lateral vira um painel deslizante.
const menuToggleBtn = document.getElementById('menuToggle');
const sidebarEl = document.getElementById('sidebar');
const sidebarOverlayEl = document.getElementById('sidebarOverlay');
function openMobileSidebar(){
  sidebarEl.classList.add('open');
  sidebarOverlayEl.classList.add('show');
}
function closeMobileSidebar(){
  sidebarEl.classList.remove('open');
  sidebarOverlayEl.classList.remove('show');
}
if(menuToggleBtn){
  menuToggleBtn.addEventListener('click', ()=>{
    sidebarEl.classList.contains('open') ? closeMobileSidebar() : openMobileSidebar();
  });
}
if(sidebarOverlayEl){
  sidebarOverlayEl.addEventListener('click', closeMobileSidebar);
}

// Grupos da barra lateral são retráteis: clicar no título abre/fecha as categorias abaixo dele.
let navCollapsed = {};
try{ navCollapsed = JSON.parse(localStorage.getItem('navCollapsedGroups')||'{}'); }catch(e){}
document.querySelectorAll('.navgroup-label[data-group]').forEach(header=>{
  const group = header.dataset.group;
  const items = document.querySelector(`.navgroup-items[data-group-items="${group}"]`);
  if(navCollapsed[group]){ header.classList.add('collapsed'); if(items) items.classList.add('collapsed'); }
  header.addEventListener('click', ()=>{
    if(!items) return;
    const isCollapsed = items.classList.toggle('collapsed');
    header.classList.toggle('collapsed', isCollapsed);
    navCollapsed[group] = isCollapsed;
    try{ localStorage.setItem('navCollapsedGroups', JSON.stringify(navCollapsed)); }catch(e){}
  });
});
function expandGroupFor(tab){
  const btn = document.querySelector(`.navitem[data-tab="${tab}"]`);
  if(!btn) return;
  const itemsContainer = btn.closest('.navgroup-items');
  if(itemsContainer && itemsContainer.classList.contains('collapsed')){
    itemsContainer.classList.remove('collapsed');
    const group = itemsContainer.dataset.groupItems;
    const header = document.querySelector(`.navgroup-label[data-group="${group}"]`);
    if(header) header.classList.remove('collapsed');
    navCollapsed[group] = false;
    try{ localStorage.setItem('navCollapsedGroups', JSON.stringify(navCollapsed)); }catch(e){}
  }
}

function setActiveNav(){
  document.querySelectorAll('.master-only').forEach(el=>{ el.style.display = canManageUsers() ? '' : 'none'; });
  document.querySelectorAll('.navitem[data-tab]').forEach(el=>{
    el.style.display = canViewTab(el.dataset.tab) ? '' : 'none';
  });
  document.querySelectorAll('.navgroup-label').forEach(label=>{
    const group = label.dataset.group;
    const items = document.querySelector(`[data-group-items="${group}"]`);
    const hasVisibleItem = !!(items && Array.from(items.querySelectorAll('.navitem[data-tab]')).some(item=>item.style.display !== 'none'));
    label.style.display = hasVisibleItem ? '' : 'none';
    if(items) items.style.display = hasVisibleItem ? '' : 'none';
  });
  expandGroupFor(currentTab);
  const resetBtn = document.getElementById('resetBtn');
  if(resetBtn) resetBtn.style.display = canEditSystem() ? '' : 'none';
  const logoutEmail = document.getElementById('logoutEmail');
  if(logoutEmail) logoutEmail.textContent = window.__estoqueSessionEmail || accessProfile().email || '';
  document.querySelectorAll('.navitem[data-tab]').forEach(b=> b.classList.toggle('active', b.dataset.tab===currentTab));
  const activeBtn = document.querySelector(`.navitem[data-tab="${currentTab}"]`);
  const topTitle = document.querySelector('#topbar .t1');
  if(activeBtn && topTitle) topTitle.textContent = activeBtn.childNodes[1]?.textContent?.trim() || activeBtn.textContent.trim();
}

/* ============================= RENDER ROOT ============================= */
function render(){
  if(!canViewTab(currentTab)) currentTab = isFracionadosAccess() ? 'estoqueCentral' : 'dashboard';
  document.getElementById('todayLabel').textContent = "Hoje: " + fmtDate(todayStr());
  setActiveNav();
  updateSidebarBadges();
  const c = document.getElementById('content');
  const renderers = {
    dashboard: renderDashboard, estoqueCentral: renderEstoqueCentral, estoqueFracionados: renderEstoqueFracionados, compras: renderCompras, alertas: renderAlertas,
    relatorios: renderRelatorios, backup: renderBackup, importarNF: renderImportarNF, importarXML: renderImportarXML,
    conferenciaPedidos: renderConferenciaPedidos, seguranca: renderSeguranca,
    usuarios: renderUsuarios,
    brutos: ()=>renderCrud(defBrutos), fracionados: ()=>renderCrud(defFracionados), locais: ()=>renderCrud(defLocais),
    categorias: ()=>renderCrud(defCategorias),
    entradasCentral: ()=>renderCrud(defEntradasCentral), saidasCentral: ()=>renderCrud(defSaidasCentral),
    producoes: ()=>renderCrud(defProducoes), saidasFracionado: ()=>renderCrud(defSaidasFracionado),
    ajustesEstoque: ()=>renderCrud(defAjustesEstoque),
  };
  c.innerHTML = "";
  (renderers[currentTab]||renderDashboard)();
}

function updateSidebarBadges(){
  const alertasMin = getAlertasMinimo().filter(a=>a.abaixo).length;
  const alertasVal = getAlertasValidade().filter(a=>a.dias<=3).length;
  const totalAlertas = alertasMin + alertasVal;
  const bC = document.getElementById('badgeCompras'), bA = document.getElementById('badgeAlertas');
  if(alertasMin>0){ bC.style.display='inline-block'; bC.textContent = alertasMin; } else bC.style.display='none';
  if(totalAlertas>0){ bA.style.display='inline-block'; bA.textContent = totalAlertas; } else bA.style.display='none';
  const bP = document.getElementById('badgeConferencia');
  const pendentes = db.pedidosCompra.filter(p=>p.status==='pendente').length;
  if(pendentes>0){ bP.style.display='inline-block'; bP.textContent = pendentes; } else bP.style.display='none';
}

/* ============================= DEFINIÇÕES DE MÓDULO (CRUD) ============================= */
const defBrutos = {
  key:'brutos', title:'Produtos Brutos', subtitle:'Cadastro-mestre de insumos comprados da Central de Distribuição.', searchableTable:true, sortRows:r=>r.nome,
  fields:[
    {name:'nome', label:'Nome do Produto', type:'text', required:true},
    {name:'categoria', label:'Categoria', type:'select', options:categoriaOptions},
    {name:'unidade', label:'Unidade', type:'select', options:()=>UNIDADES},
    {name:'estoqueMinimo', label:'Estoque Mínimo', type:'number', step:'0.01'},
    {name:'fornecedor', label:'Fornecedor Padrão', type:'text'},
    {name:'precoMedio', label:'Preço Médio (R$)', type:'number', step:'0.01'},
    {name:'validadeDias', label:'Validade Padrão (dias)', type:'number'},
  ],
  columns:[
    {label:'Produto', render:r=>`<strong>${r.nome}</strong>`},
    {label:'Categoria', render:r=>r.categoria},
    {label:'Unidade', render:r=>r.unidade},
    {label:'Estoque Mínimo', render:r=>fmtNum(r.estoqueMinimo)},
    {label:'Fornecedor', render:r=>r.fornecedor||"—"},
    {label:'Preço Médio', render:r=>fmtMoney(r.precoMedio||0)},
    {label:'Saldo na Central', render:r=>fmtNum(saldoCentral(r.nome))},
    {label:'Status', render:r=>statusBadge(saldoCentral(r.nome), r.estoqueMinimo||0)},
  ],
  validate:(row, editIdx)=>{
    if(!row.nome) return "Informe o nome do produto.";
    if(db.brutos.some((b,i)=>i!==editIdx && sameName(b.nome,row.nome))) return "Já existe um produto bruto com esse nome (considerando também acentos).";
    return null;
  },
  beforeSave:(row,editIdx)=>{
    if(editIdx!=null) renameBrutoReferences(db.brutos[editIdx] && db.brutos[editIdx].nome,row.nome);
  }
};

const defFracionados = {
  key:'fracionados', title:'Produtos Fracionados', subtitle:'Cadastro-mestre dos itens gerados na Cozinha de Produção de Fracionados.', searchableTable:true, sortRows:r=>r.nome,
  fields:[
    {name:'nome', label:'Nome do Produto Fracionado', type:'text', required:true},
    {name:'categoria', label:'Categoria', type:'select', options:categoriaOptions},
    {name:'unidade', label:'Unidade', type:'select', options:()=>UNIDADES},
    {name:'origem', label:'Produto Bruto de Origem', type:'select', options:()=>nomesOrdenados(db.brutos), searchable:true},
    {name:'rendimento', label:'Rendimento Padrão (%)', type:'number', step:'1'},
    {name:'estoqueMinimo', label:'Estoque Mínimo', type:'number', step:'0.01'},
    {name:'validadeDias', label:'Validade Após Fracionar (dias)', type:'number'},
  ],
  columns:[
    {label:'Produto Fracionado', render:r=>`<strong>${r.nome}</strong>`},
    {label:'Origem (Bruto)', render:r=>r.origem},
    {label:'Categoria', render:r=>r.categoria},
    {label:'Unidade', render:r=>r.unidade},
    {label:'Rendimento', render:r=>fmtNum(r.rendimento)+"%"},
    {label:'Estoque Mínimo', render:r=>fmtNum(r.estoqueMinimo)},
    {label:'Saldo na Cozinha', render:r=>fmtNum(saldoCozinhaFracionado(r.nome))},
    {label:'Status', render:r=>statusBadge(saldoCozinhaFracionado(r.nome), r.estoqueMinimo||0)},
  ],
  validate:(row, editIdx)=>{
    if(!row.nome) return "Informe o nome do produto fracionado.";
    if(db.fracionados.some((f,i)=>i!==editIdx && sameName(f.nome,row.nome))) return "Já existe um produto fracionado com esse nome (considerando também acentos).";
    if(!row.origem) return "Selecione o produto bruto de origem.";
    return null;
  },
  beforeSave:(row,editIdx)=>{
    if(editIdx!=null) renameFracionadoReferences(db.fracionados[editIdx] && db.fracionados[editIdx].nome,row.nome);
  }
};

const defLocais = {
  key:'locais', title:'Locais', subtitle:'Locais físicos e setores da operação.',
  fields:[
    {name:'nome', label:'Nome do Local', type:'text', required:true},
    {name:'tipo', label:'Tipo de Local', type:'select', options:()=>TIPOS_LOCAL},
    {name:'responsavel', label:'Responsável', type:'text'},
  ],
  columns:[
    {label:'Local', render:r=>`<strong>${r.nome}</strong>`},
    {label:'Tipo', render:r=>r.tipo},
    {label:'Responsável', render:r=>r.responsavel||"—"},
  ],
  validate:(row)=>{ if(!row.nome) return "Informe o nome do local."; return null; }
};

const defCategorias = {
  key:'categorias', title:'Categorias', subtitle:'Categorias usadas no cadastro de Produtos Brutos e Fracionados. Uma categoria nova cadastrada aqui já aparece nos formulários automaticamente.',
  fields:[
    {name:'nome', label:'Nome da Categoria', type:'text', required:true},
  ],
  columns:[
    {label:'Categoria', render:r=>`<strong>${r.nome}</strong>`},
    {label:'Produtos Brutos Usando', render:r=> db.brutos.filter(b=>b.categoria===r.nome).length},
    {label:'Produtos Fracionados Usando', render:r=> db.fracionados.filter(f=>f.categoria===r.nome).length},
  ],
  validate:(row, editIdx)=>{
    if(!row.nome) return "Informe o nome da categoria.";
    if(db.categorias.some((c,i)=>i!==editIdx && c.nome.toLowerCase()===row.nome.toLowerCase())) return "Já existe uma categoria com esse nome.";
    return null;
  },
  canDelete:(row)=>{
    const emUso = db.brutos.filter(b=>b.categoria===row.nome).length + db.fracionados.filter(f=>f.categoria===row.nome).length;
    if(emUso>0) return `Não é possível excluir: ${emUso} produto(s) ainda usam a categoria "${row.nome}". Troque a categoria desses produtos antes de excluir.`;
    return null;
  }
};

const defEntradasCentral = {
  key:'entradasCentral', title:'Entrada na Central de Distribuição', subtitle:'Toda mercadoria comprada entra aqui primeiro.', groupByDate:true,
  fields:[
    {name:'data', label:'Data', type:'date', default:todayStr},
    {name:'nf', label:'Nº NF / Documento', type:'text'},
    {name:'produto', label:'Produto', type:'select', options:()=>nomesOrdenados(db.brutos), searchable:true},
    {name:'fornecedor', label:'Fornecedor', type:'text'},
    {name:'quantidade', label:'Quantidade', type:'number', step:'0.01'},
    {name:'precoUnitario', label:'Preço Unitário (R$)', type:'number', step:'0.01'},
    {name:'validade', label:'Data de Validade', type:'date'},
  ],
  columns:[
    {label:'Data', render:r=>fmtDate(r.data)},
    {label:'NF', render:r=>r.nf||"—"},
    {label:'Produto', render:r=>`<strong>${r.produto}</strong>`},
    {label:'Fornecedor', render:r=>r.fornecedor||"—"},
    {label:'Quantidade', render:r=>fmtNum(r.quantidade)},
    {label:'Preço Pago', render:r=>fmtMoney(r.precoUnitario||0)},
    {label:'Preço Médio (Cadastro)', render:r=>{
      const b = db.brutos.find(x=>x.nome===r.produto);
      return b ? fmtMoney(b.precoMedio||0) : "—";
    }},
    {label:'Diferença', render:r=>{
      const b = db.brutos.find(x=>x.nome===r.produto);
      if(!b) return "—";
      const diff = (r.precoUnitario||0) - (b.precoMedio||0);
      const cls = diff>0 ? 'diff-pos' : (diff<0 ? 'diff-neg' : '');
      const sign = diff>0 ? '+' : '';
      return `<span class="${cls}">${sign}${fmtMoney(diff)}</span>`;
    }},
    {label:'Valor Total', render:r=>fmtMoney((r.quantidade||0)*(r.precoUnitario||0))},
    {label:'Validade', render:r=>fmtDate(r.validade)},
  ],
  validate:(row)=>{
    if(!row.produto) return "Selecione o produto.";
    if(!row.quantidade || row.quantidade<=0) return "Informe uma quantidade válida.";
    return null;
  },
  helper:(form)=>{
    const prodSel = form.querySelector('[name=produto]');
    const precoInput = form.querySelector('[name=precoUnitario]');
    const hint = document.createElement('div'); hint.className='hint'; hint.id='precoMedioHint';
    precoInput.closest('.field').appendChild(hint);
    function update(){
      const b = db.brutos.find(x=>x.nome===prodSel.value);
      if(!b){ hint.textContent=''; return; }
      hint.textContent = `Preço médio cadastrado: ${fmtMoney(b.precoMedio||0)}`;
      hint.className = 'hint' + (Number(precoInput.value||0) > (b.precoMedio||0) ? ' warn' : '');
    }
    prodSel.addEventListener('change', update); precoInput.addEventListener('input', update); update();
  },
  onSelectChange:(form)=>{
    const prodSel = form.querySelector('[name=produto]');
    const fornInput = form.querySelector('[name=fornecedor]');
    if(prodSel && fornInput){
      prodSel.addEventListener('change', ()=>{
        const b = db.brutos.find(x=>x.nome===prodSel.value);
        if(b && !fornInput.value) fornInput.value = b.fornecedor||"";
      });
    }
  }
};

const defSaidasCentral = {
  key:'saidasCentral', title:'Saída da Central de Distribuição', subtitle:'Envio para Buffet, Sushi, Restaurante ou Cozinha de Fracionamento.', groupByDate:true,
  fields:[
    {name:'data', label:'Data', type:'date', default:todayStr},
    {name:'documento', label:'Nº Documento', type:'text'},
    {name:'produto', label:'Produto', type:'select', options:()=>nomesOrdenados(db.brutos), searchable:true},
    {name:'destino', label:'Local de Destino', type:'select', options:destinosCentralOptions},
    {name:'quantidade', label:'Quantidade', type:'number', step:'0.01'},
  ],
  columns:[
    {label:'Data', render:r=>fmtDate(r.data)},
    {label:'Documento', render:r=>r.documento||"—"},
    {label:'Produto', render:r=>`<strong>${r.produto}</strong>`},
    {label:'Destino', render:r=>r.destino},
    {label:'Quantidade', render:r=>fmtNum(r.quantidade)},
  ],
  helper:(form)=>{
    const prodSel = form.querySelector('[name=produto]');
    const qtdInput = form.querySelector('[name=quantidade]');
    const hint = document.createElement('div'); hint.className='hint'; hint.id='saldoHint';
    qtdInput.closest('.field').appendChild(hint);
    function update(){
      if(!prodSel.value){ hint.textContent=''; return; }
      const s = saldoCentral(prodSel.value);
      hint.textContent = `Saldo disponível na Central: ${fmtNum(s)}`;
      hint.className = 'hint' + (exceedsStock(qtdInput.value,s) ? ' warn' : '');
    }
    prodSel.addEventListener('change', update); qtdInput.addEventListener('input', update); update();
  },
  validate:(row, editIdx)=>{
    if(!row.produto) return "Selecione o produto.";
    if(!row.destino) return "Selecione o destino.";
    if(!row.quantidade || row.quantidade<=0) return "Informe uma quantidade válida.";
    let s = saldoCentral(row.produto);
    if(editIdx!=null){
      const old = db.saidasCentral[editIdx];
      if(old && old.produto===row.produto) s += Number(old.quantidade||0);
    }
    if(exceedsStock(row.quantidade,s)) return `Saldo insuficiente na Central. Disponível: ${fmtNum(s)}.`;
    return null;
  }
};

const defProducoes = {
  key:'producoes', title:'Entrada de Fracionados', subtitle:'Selecione o fracionado: o bruto de origem e o saldo disponível na Central são preenchidos automaticamente. Apenas a quantidade utilizada será baixada.', groupByDate:true,
  fields:[
    {name:'data', label:'Data', type:'date', default:todayStr},
    {name:'produtoFracionado', label:'Produto Fracionado', type:'select', options:()=>nomesOrdenados(db.fracionados), searchable:true},
    {name:'produtoBruto', label:'Produto Bruto de Origem', type:'select', options:()=>nomesOrdenados(db.brutos), searchable:true},
    {name:'quantidadeUtilizada', label:'Quantidade Utilizada do Bruto', type:'number', step:'0.01'},
    {name:'quantidadeProduzida', label:'Rendimento (quantidade produzida)', type:'number', step:'0.01'},
    {name:'unidadeProduzida', label:'Unidade do Produzido', type:'select', options:()=>UNIDADES},
  ],
  columns:[
    {label:'Data', render:r=>fmtDate(r.data)},
    {label:'Bruto Utilizado', render:r=>r.produtoBruto},
    {label:'Qtd. Utilizada', render:r=>fmtNum(r.quantidadeUtilizada)},
    {label:'Fracionado Gerado', render:r=>`<strong>${r.produtoFracionado}</strong>`},
    {label:'Qtd. Produzida', render:r=>fmtNum(r.quantidadeProduzida)},
    {label:'Unidade', render:r=>r.unidadeProduzida || (db.fracionados.find(x=>x.nome===r.produtoFracionado)||{}).unidade || '—'},
    {label:'Validade do Fracionado', render:r=>{
      const f = db.fracionados.find(x=>x.nome===r.produtoFracionado);
      if(!f || !r.data) return "—";
      const d = new Date(r.data+"T00:00:00"); d.setDate(d.getDate() + Number(f.validadeDias||0));
      return fmtDate(d.toISOString().slice(0,10));
    }},
  ],
  helper:(form)=>{
    const prodSel = form.querySelector('[name=produtoFracionado]');
    const brutoSel = form.querySelector('[name=produtoBruto]'); brutoSel.disabled=true;
    const qtdInput = form.querySelector('[name=quantidadeUtilizada]');
    const hint = document.createElement('div'); hint.className='hint'; hint.id='saldoHintProd';
    qtdInput.closest('.field').appendChild(hint);
    function update(){
      const f=db.fracionados.find(x=>x.nome===prodSel.value);
      if(!f){hint.textContent='';brutoSel.value='';return;}
      brutoSel.value=f.origem||'';
      const s = saldoCentral(f.origem);
      hint.textContent = `Disponível na ${getCentralNome()}: ${fmtNum(s)} (${f.origem})`;
      hint.className = 'hint' + (exceedsStock(qtdInput.value,s) ? ' warn' : '');
    }
    prodSel.addEventListener('change', update); qtdInput.addEventListener('input', update); update();
  },
  validate:(row, editIdx)=>{
    if(!row.produtoFracionado) return "Selecione o produto fracionado.";
    const f=db.fracionados.find(x=>x.nome===row.produtoFracionado); if(!f) return "Produto fracionado inválido.";
    row.produtoBruto=f.origem; row.origemEstoque='central';
    if(!row.quantidadeUtilizada || row.quantidadeUtilizada<=0) return "Informe a quantidade utilizada.";
    if(!row.quantidadeProduzida || row.quantidadeProduzida<=0) return "Informe a quantidade produzida.";
    if(!row.unidadeProduzida) row.unidadeProduzida = f.unidade;
    let s = saldoCentral(row.produtoBruto);
    if(editIdx!=null){
      const old = db.producoes[editIdx];
      if(old && old.produtoBruto===row.produtoBruto) s += Number(old.quantidadeUtilizada||0);
    }
    if(exceedsStock(row.quantidadeUtilizada,s)) return `Bruto insuficiente na ${getCentralNome()}. Disponível: ${fmtNum(s)}.`;
    return null;
  }
};

const defSaidasFracionado = {
  key:'saidasFracionado', title:'Saída de Estoque Fracionado', subtitle:'Envio de fracionados da Cozinha para os setores consumidores.', groupByDate:true,
  fields:[
    {name:'data', label:'Data', type:'date', default:todayStr},
    {name:'documento', label:'Nº Documento', type:'text'},
    {name:'produto', label:'Produto Fracionado', type:'select', options:()=>nomesOrdenados(db.fracionados), searchable:true},
    {name:'destino', label:'Local de Destino', type:'select', options:destinosFracionadoOptions},
    {name:'quantidade', label:'Quantidade', type:'number', step:'0.01'},
  ],
  columns:[
    {label:'Data', render:r=>fmtDate(r.data)},
    {label:'Documento', render:r=>r.documento||"—"},
    {label:'Produto', render:r=>`<strong>${r.produto}</strong>`},
    {label:'Destino', render:r=>r.destino},
    {label:'Quantidade', render:r=>fmtNum(r.quantidade)},
  ],
  helper:(form)=>{
    const prodSel = form.querySelector('[name=produto]');
    const qtdInput = form.querySelector('[name=quantidade]');
    const hint = document.createElement('div'); hint.className='hint'; hint.id='saldoHintFrac';
    qtdInput.closest('.field').appendChild(hint);
    function update(){
      if(!prodSel.value){ hint.textContent=''; return; }
      const s = saldoCozinhaFracionado(prodSel.value);
      hint.textContent = `Disponível na Cozinha: ${fmtNum(s)}`;
      hint.className = 'hint' + (exceedsStock(qtdInput.value,s) ? ' warn' : '');
    }
    prodSel.addEventListener('change', update); qtdInput.addEventListener('input', update); update();
  },
  validate:(row, editIdx)=>{
    if(!row.produto) return "Selecione o produto fracionado.";
    if(!row.destino) return "Selecione o destino.";
    if(!row.quantidade || row.quantidade<=0) return "Informe uma quantidade válida.";
    let s = saldoCozinhaFracionado(row.produto);
    if(editIdx!=null){
      const old = db.saidasFracionado[editIdx];
      if(old && old.produto===row.produto) s += Number(old.quantidade||0);
    }
    if(exceedsStock(row.quantidade,s)) return `Saldo insuficiente de fracionado na Cozinha. Disponível: ${fmtNum(s)}.`;
    return null;
  }
};

const defAjustesEstoque = {
  key:'ajustesEstoque', title:'Ajuste de Estoque', groupByDate:true,
  subtitle:'Corrija o saldo de um produto após uma contagem física. Todo ajuste precisa de motivo e responsável.',
  fields:[
    {name:'data', label:'Data', type:'date', default:todayStr},
    {name:'produto', label:'Produto', type:'select', options:()=>nomesOrdenados(db.brutos), searchable:true},
    {name:'novoSaldo', label:'Novo Saldo (contagem física)', type:'number', step:'0.01'},
    {name:'motivo', label:'Motivo do Ajuste', type:'text'},
    {name:'responsavel', label:'Responsável pelo Ajuste', type:'text'},
  ],
  columns:[
    {label:'Data', render:r=>fmtDate(r.data)},
    {label:'Produto', render:r=>`<strong>${r.produto}</strong>`},
    {label:'Saldo Anterior', render:r=>fmtNum(r.saldoAnterior)},
    {label:'Novo Saldo', render:r=>fmtNum(r.novoSaldo)},
    {label:'Diferença', render:r=>{
      const dif = Number(r.diferenca||0);
      const cls = dif>0 ? 'diff-neg' : (dif<0 ? 'diff-pos' : ''); // verde = achou mais, vermelho = achou menos (perda)
      const sign = dif>0 ? '+' : '';
      return `<span class="${cls}">${sign}${fmtNum(dif)}</span>`;
    }},
    {label:'Motivo', render:r=>r.motivo},
    {label:'Responsável', render:r=>r.responsavel},
  ],
  helper:(form)=>{
    const prodSel = form.querySelector('[name=produto]');
    const novoSaldoInput = form.querySelector('[name=novoSaldo]');
    const hint = document.createElement('div'); hint.className='hint'; hint.id='ajusteSaldoHint';
    novoSaldoInput.closest('.field').appendChild(hint);
    function update(){
      if(!prodSel.value){ hint.textContent=''; return; }
      const atual = saldoCentral(prodSel.value);
      const novo = Number(novoSaldoInput.value||0);
      const dif = novo - atual;
      const sinal = dif>0 ? '+' : '';
      hint.textContent = `Saldo atual no sistema: ${fmtNum(atual)} → diferença do ajuste: ${sinal}${fmtNum(dif)}`;
    }
    prodSel.addEventListener('change', update); novoSaldoInput.addEventListener('input', update); update();
  },
  validate:(row, editIdx)=>{
    if(!row.produto) return "Selecione o produto.";
    if(row.novoSaldo==null || isNaN(row.novoSaldo) || row.novoSaldo<0) return "Informe o novo saldo (contagem física).";
    if(!row.motivo || !row.motivo.trim()) return "Informe o motivo do ajuste — todo ajuste precisa ser justificado.";
    if(!row.responsavel || !row.responsavel.trim()) return "Informe o responsável pelo ajuste.";
    return null;
  },
  beforeSave:(row, editIdx)=>{
    let atual = saldoCentral(row.produto);
    if(editIdx!=null){
      const old = db.ajustesEstoque[editIdx];
      if(old && old.produto===row.produto) atual -= Number(old.diferenca||0);
    }
    row.saldoAnterior = atual;
    row.diferenca = row.novoSaldo - atual;
  },
};

/* ============================= RENDER GENÉRICO CRUD ============================= */
let crudEdit = null; // {key, idx} — controla o modo de edição de um registro já lançado
let crudSearch = {};

function renderCrud(def){
  const c = document.getElementById('content');
  const editable = canEditTab(def.key);
  const editing = (crudEdit && crudEdit.key===def.key) ? crudEdit.idx : null;
  const editingRow = editing!=null ? db[def.key][editing] : null;
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <h1 class="pagetitle">${def.title}</h1>
    <p class="pagesub">${def.subtitle}</p>
    ${isFracionadosAccess() ? '<div class="msg-ok" style="margin-bottom:18px">Acesso Controle de Fracionados: este perfil opera apenas produções e saídas de fracionados, respeitando o saldo disponível no estoque.</div>' : ''}
    <div class="card">
      <h2>${editing!=null ? 'Editando Registro' : 'Novo Lançamento'}</h2>
      ${editing!=null ? '<p class="hint warn">Você está corrigindo um registro já lançado. Ajuste os campos e clique em Salvar Alterações.</p>' : ''}
      <form class="entryform" id="form-${def.key}"></form>
    </div>
    <div class="card">
      <h2>Registros (${db[def.key].length})</h2>
      ${def.searchableTable ? `<div class="tabletools"><input id="search-${def.key}" type="search" placeholder="Buscar por nome, categoria ou fornecedor…" autocomplete="off"><span class="hint">Produtos em ordem alfabética.</span></div>` : ''}
      <div id="table-${def.key}"></div>
    </div>
  `;
  c.appendChild(wrap);

  const form = wrap.querySelector(`#form-${def.key}`);
  if(!editable){
    const firstCard = wrap.querySelector('.card');
    if(firstCard){
      firstCard.outerHTML = `<div class="msg-ok" style="margin-bottom:18px">Acesso visualizador: os registros estÃ£o disponÃ­veis apenas para consulta.</div>`;
    }
    renderTable(def, wrap.querySelector(`#table-${def.key}`));
    return;
  }
  def.fields.forEach(f=>{
    const fieldDiv = document.createElement('div'); fieldDiv.className='field';
    const label = document.createElement('label'); label.textContent = f.label; fieldDiv.appendChild(label);
    let input;
    if(f.type==='select'){
      const options = [...(f.options()||[])].sort(compareText);
      if(f.searchable){
        const listId = `options-${def.key}-${f.name}`;
        input = document.createElement('input'); input.name=f.name; input.setAttribute('list',listId); input.autocomplete='off'; input.placeholder='Digite para buscar…';
        const list=document.createElement('datalist'); list.id=listId; options.forEach(opt=>{const o=document.createElement('option');o.value=opt;list.appendChild(o);});
        fieldDiv.appendChild(input); fieldDiv.appendChild(list);
      } else {
        input = document.createElement('select'); input.name = f.name;
      const optBlank = document.createElement('option'); optBlank.value=''; optBlank.textContent='Selecione...'; input.appendChild(optBlank);
        options.forEach(opt=>{ const o=document.createElement('option'); o.value=opt; o.textContent=opt; input.appendChild(o); });
        fieldDiv.appendChild(input);
      }
      if(editingRow) input.value = editingRow[f.name]!=null ? editingRow[f.name] : '';
    } else {
      input = document.createElement('input'); input.type = f.type; input.name = f.name;
      if(f.step) input.step = f.step;
      if(editingRow) input.value = editingRow[f.name]!=null ? editingRow[f.name] : '';
      else if(f.default) input.value = f.default();
    }
    if(f.type!=='select') fieldDiv.appendChild(input);
    form.appendChild(fieldDiv);
  });
  const btnField = document.createElement('div'); btnField.className='field';
  const btnLabel = document.createElement('label'); btnLabel.innerHTML='&nbsp;'; btnField.appendChild(btnLabel);
  const btnRow = document.createElement('div'); btnRow.style.cssText = 'display:flex;gap:8px';
  const btn = document.createElement('button'); btn.type='submit'; btn.className='btn';
  btn.textContent = editing!=null ? 'Salvar alterações' : '+ Adicionar';
  btnRow.appendChild(btn);
  if(editing!=null){
    const cancelBtn = document.createElement('button'); cancelBtn.type='button'; cancelBtn.className='btn secondary';
    cancelBtn.textContent = 'Cancelar';
    cancelBtn.addEventListener('click', ()=>{ crudEdit=null; render(); });
    btnRow.appendChild(cancelBtn);
  }
  btnField.appendChild(btnRow); form.appendChild(btnField);

  if(def.helper) def.helper(form);
  if(def.onSelectChange) def.onSelectChange(form);

  const errBox = document.createElement('div');
  form.appendChild(errBox);

  form.addEventListener('submit', (e)=>{
    e.preventDefault();
    const row = {};
    def.fields.forEach(f=>{
      const el = form.querySelector(`[name=${f.name}]`);
      row[f.name] = f.type==='number' ? parseFloat(el.value||0) : el.value;
    });
    const err = def.validate ? def.validate(row, editing) : null;
    if(err){ alert(err); return; }
    if(def.beforeSave) def.beforeSave(row, editing);
    if(editing!=null){ db[def.key][editing] = row; }
    else { db[def.key].push(row); }
    crudEdit = null;
    saveDB();
    render();
  });

  renderTable(def, wrap.querySelector(`#table-${def.key}`));
  if(def.searchableTable){ const search=wrap.querySelector(`#search-${def.key}`); search.value=crudSearch[def.key]||''; search.addEventListener('input',()=>{crudSearch[def.key]=search.value;renderTable(def,wrap.querySelector(`#table-${def.key}`));}); }
}

function renderTable(def, container){
  const rows = db[def.key];
  if(rows.length===0){ container.innerHTML = `<div class="empty">Nenhum registro lançado ainda.</div>`; return; }
  if(def.groupByDate){ renderTableGrouped(def, container, rows); return; }
  const query=String(crudSearch[def.key]||'').trim().toLocaleLowerCase('pt-BR');
  let indexedRows=rows.map((r,idx)=>({r,idx}));
  if(query) indexedRows=indexedRows.filter(({r})=>JSON.stringify(r).toLocaleLowerCase('pt-BR').includes(query));
  if(def.sortRows) indexedRows.sort((a,b)=>compareText(def.sortRows(a.r),def.sortRows(b.r)));
  if(indexedRows.length===0){ container.innerHTML=`<div class="empty">Nenhum registro encontrado para esta busca.</div>`; return; }
  let html = `<table><thead><tr>`;
  def.columns.forEach(c=> html += `<th>${c.label}</th>`);
  if(canEditTab(def.key)) html += `<th></th>`;
  html += `</tr></thead><tbody>`;
  indexedRows.forEach(({r, idx})=>{
    html += `<tr>`;
    def.columns.forEach(c=> html += `<td>${c.render(r)}</td>`);
    if(canEditTab(def.key)) html += `<td style="white-space:nowrap"><button class="editbtn" data-idx="${idx}" title="Editar">✎</button> <button class="delbtn" data-idx="${idx}" title="Excluir">✕</button></td>`;
    html += `</tr>`;
  });
  html += `</tbody></table>`;
  container.innerHTML = html;
  wireCrudButtons(def, container, rows);
}

function wireCrudButtons(def, container, rows){
  container.querySelectorAll('.editbtn').forEach(b=>{
    b.addEventListener('click', ()=>{
      crudEdit = { key: def.key, idx: parseInt(b.dataset.idx) };
      render();
      const cardTitle = document.querySelector('#content .card h2');
      if(cardTitle && typeof cardTitle.scrollIntoView === 'function') cardTitle.scrollIntoView({behavior:'smooth', block:'start'});
    });
  });
  container.querySelectorAll('.delbtn').forEach(b=>{
    b.addEventListener('click', ()=>{
      const idx = parseInt(b.dataset.idx);
      if(def.canDelete){
        const reason = def.canDelete(rows[idx]);
        if(reason){ alert(reason); return; }
      }
      if(confirm('Excluir este registro?')){
        if(crudEdit && crudEdit.key===def.key && crudEdit.idx===idx) crudEdit = null;
        rows.splice(idx,1);
        saveDB(); render();
      }
    });
  });
}

// Tabelas de movimentação (Entrada Central, Saída Central, Produção, Saída Fracionado) crescem todo dia.
// Por padrão mostramos só os últimos 3 dias, agrupados por data, com atalho pro histórico completo em Relatórios.
let historyExpanded = {};
const REPORT_TYPE_FOR_DEF = { entradasCentral:'compras', saidasCentral:'saidasCentral', producoes:'producao', saidasFracionado:'saidasFracionado', ajustesEstoque:'ajustes' };

function renderTableGrouped(def, container, rows){
  const expanded = !!historyExpanded[def.key];
  const limite = daysAgoStr(2); // hoje, ontem e anteontem = últimos 3 dias
  const indexed = rows.map((r, idx)=>({r, idx}));
  const visible = expanded ? indexed : indexed.filter(x=> !x.r.data || x.r.data>=limite);
  const hiddenCount = indexed.length - visible.length;

  let html = '';
  if(hiddenCount>0){
    html += `<div class="hint">Mostrando apenas os últimos 3 dias — ${hiddenCount} registro(s) mais antigo(s) oculto(s) aqui.
      <button type="button" class="linkbtn" id="btnExpandHist">Mostrar tudo</button> ·
      <button type="button" class="linkbtn" id="btnIrRelatorio">Ver histórico completo em Relatórios</button></div>`;
  } else if(expanded){
    html += `<div class="hint"><button type="button" class="linkbtn" id="btnCollapseHist">Mostrar só os últimos 3 dias</button></div>`;
  }

  const groups = {};
  visible.forEach(x=>{ const k = x.r.data || 'Sem data'; (groups[k]=groups[k]||[]).push(x); });
  const datas = Object.keys(groups).sort((a,b)=> b.localeCompare(a));

  if(datas.length===0){
    html += `<div class="empty">Nenhum registro nos últimos 3 dias.</div>`;
  }

  datas.forEach(dataKey=>{
    html += `<h3 class="daygroup-title">${dataKey==='Sem data' ? 'Sem data' : fmtDate(dataKey)}</h3>`;
    html += `<table><thead><tr>`;
    def.columns.forEach(c=> html += `<th>${c.label}</th>`);
    if(canEditTab(def.key)) html += `<th></th>`;
    html += `</tr></thead><tbody>`;
    groups[dataKey].forEach(x=>{
      html += `<tr>`;
      def.columns.forEach(c=> html += `<td>${c.render(x.r)}</td>`);
      if(canEditTab(def.key)) html += `<td style="white-space:nowrap"><button class="editbtn" data-idx="${x.idx}" title="Editar" aria-label="Editar">✎</button> <button class="delbtn" data-idx="${x.idx}" title="Excluir" aria-label="Excluir">✕</button></td>`;
      html += `</tr>`;
    });
    html += `</tbody></table>`;
  });

  container.innerHTML = html;
  wireCrudButtons(def, container, rows);

  const expandBtn = container.querySelector('#btnExpandHist');
  if(expandBtn) expandBtn.addEventListener('click', ()=>{ historyExpanded[def.key]=true; render(); });
  const collapseBtn = container.querySelector('#btnCollapseHist');
  if(collapseBtn) collapseBtn.addEventListener('click', ()=>{ historyExpanded[def.key]=false; render(); });
  const irRelBtn = container.querySelector('#btnIrRelatorio');
  if(irRelBtn) irRelBtn.addEventListener('click', ()=>{
    reportType = REPORT_TYPE_FOR_DEF[def.key] || 'compras';
    reportFilter = {inicio: earliestDateStr(), fim: todayStr()};
    currentTab = 'relatorios';
    render();
  });
}

/* ============================= ESTOQUE ATUAL ============================= */
function renderEstoque(){
  if(isFracionadosAccess()) renderEstoqueFracionados();
  else renderEstoqueCentral();
}
function renderEstoqueCentral(){
  const c = document.getElementById('content');
  let html = `<h1 class="pagetitle">Estoque Central</h1><p class="pagesub">Saldo dos produtos brutos na Central de Distribuição, calculado automaticamente.</p>`;
  html += `<div class="card"><h2>Produtos Brutos — Saldo na ${getCentralNome()}</h2><table><thead><tr>
    <th>Produto</th><th>Unidade</th><th>Saldo Atual</th><th>Estoque Mínimo</th><th>Status</th></tr></thead><tbody>`;
  [...db.brutos].sort((a,b)=>compareText(a.nome,b.nome)).forEach(b=>{
    const s = saldoCentral(b.nome);
    html += `<tr><td><strong>${b.nome}</strong></td><td>${b.unidade}</td><td>${fmtNum(s)}</td><td>${fmtNum(b.estoqueMinimo)}</td><td>${statusBadge(s,b.estoqueMinimo)}</td></tr>`;
  });
  html += `</tbody></table></div>`;
  c.innerHTML = html;
}
function renderEstoqueFracionados(){
  const c = document.getElementById('content');
  let html = `<h1 class="pagetitle">Estoque Fracionados</h1><p class="pagesub">Saldo dos produtos preparados e fracionados, calculado automaticamente.</p>`;
  html += `<div class="card"><h2>Produtos Fracionados - Saldo produzido</h2><table><thead><tr>
    <th>Produto</th><th>Unidade</th><th>Saldo Atual</th><th>Estoque Mínimo</th><th>Status</th></tr></thead><tbody>`;
  [...db.fracionados].sort((a,b)=>compareText(a.nome,b.nome)).forEach(f=>{
    const s = saldoCozinhaFracionado(f.nome);
    html += `<tr><td><strong>${f.nome}</strong></td><td>${f.unidade}</td><td>${fmtNum(s)}</td><td>${fmtNum(f.estoqueMinimo)}</td><td>${statusBadge(s,f.estoqueMinimo)}</td></tr>`;
  });
  html += `</tbody></table></div>`;
  c.innerHTML = html;
}

/* ============================= COMPRAS DO DIA ============================= */
function getComprasSugeridas(){
  return db.brutos.map(b=>{
    const saldo = saldoCentral(b.nome);
    const sugestao = Math.max(0, (b.estoqueMinimo||0) - saldo);
    return {produto:b.nome, categoria:b.categoria, fornecedor:b.fornecedor||"—", saldo, minimo:b.estoqueMinimo||0,
      sugestao, precoMedio:b.precoMedio||0, valorEstimado: sugestao*(b.precoMedio||0), abaixo: saldo<(b.estoqueMinimo||0), manual:false};
  }).filter(x=>x.abaixo);
}
// Itens que o usuário adicionou manualmente à lista de compras (mesmo sem estarem abaixo do mínimo).
function getItensManuaisCompra(){
  const sugeridosNomes = new Set(getComprasSugeridas().map(x=>x.produto));
  return db.itensManuaisCompra
    .filter(nome => !sugeridosNomes.has(nome)) // já aparece nas sugestões automáticas, não duplica
    .map(nome=>{
      const b = db.brutos.find(x=>x.nome===nome);
      if(!b) return null;
      const saldo = saldoCentral(b.nome);
      const sugestao = Math.max(1, (b.estoqueMinimo||0) - saldo);
      return {produto:b.nome, categoria:b.categoria, fornecedor:b.fornecedor||"—", saldo, minimo:b.estoqueMinimo||0,
        sugestao, precoMedio:b.precoMedio||0, valorEstimado: sugestao*(b.precoMedio||0), manual:true};
    }).filter(Boolean);
}
function adicionarItemManualCompra(produto){
  if(!produto) return;
  if(!db.itensManuaisCompra.includes(produto)) db.itensManuaisCompra.push(produto);
  saveDB();
  render();
}
function removerItemManualCompra(produto){
  db.itensManuaisCompra = db.itensManuaisCompra.filter(p=>p!==produto);
  saveDB();
  render();
}
function getProducaoSugerida(){
  return db.fracionados.map(f=>{
    const saldo = saldoCozinhaFracionado(f.nome);
    const sugestao = Math.max(0, (f.estoqueMinimo||0) - saldo);
    const brutoDisp = saldoCentral(f.origem);
    const brutoNecessario = f.rendimento>0 ? sugestao/(f.rendimento/100) : 0;
    return {produto:f.nome, origem:f.origem, saldo, minimo:f.estoqueMinimo||0, sugestao, brutoDisp, brutoNecessario,
      abaixo: saldo<(f.estoqueMinimo||0), brutoSuficiente: brutoDisp>=brutoNecessario};
  }).filter(x=>x.abaixo);
}
function getAlertasMinimo(){
  const a = db.brutos.map(b=>({produto:b.nome, tipo:"Bruto", saldo:saldoCentral(b.nome), minimo:b.estoqueMinimo||0}));
  const f = db.fracionados.map(x=>({produto:x.nome, tipo:"Fracionado", saldo:saldoCozinhaFracionado(x.nome), minimo:x.estoqueMinimo||0}));
  return [...a,...f].map(x=>({...x, abaixo: x.saldo<=x.minimo}));
}
function getAlertasValidade(){
  const a = db.entradasCentral.filter(e=>e.validade).map(e=>({tipo:"Bruto (Central)", produto:e.produto, validade:e.validade, dias:daysBetween(e.validade)}));
  const b = db.producoes.map(p=>{
    const f = db.fracionados.find(x=>x.nome===p.produtoFracionado);
    if(!f || !p.data) return null;
    const d = new Date(p.data+"T00:00:00"); d.setDate(d.getDate()+Number(f.validadeDias||0));
    const validade = d.toISOString().slice(0,10);
    return {tipo:"Fracionado", produto:p.produtoFracionado, validade, dias:daysBetween(validade)};
  }).filter(Boolean);
  return [...a,...b].sort((x,y)=>x.dias-y.dias);
}

function pedidoPendenteFor(produto){
  return db.pedidosCompra.find(p=>p.produto===produto && p.status==='pendente') || null;
}

let pedidoMensagens = []; // [{fornecedor, texto}] — mensagens geradas na última leva de pedidos

function gerarMensagemPedido(fornecedor, itens){
  let msg = `*Pedido de Cotação — Fran Casarin*\n`;
  msg += `Data: ${fmtDate(todayStr())}\n\n`;
  itens.forEach(it=>{ msg += `- ${it.produto}: ${fmtNum(it.quantidade)} ${it.unidade}\n`; });
  msg += `\nPor favor confirmar os valores e o prazo de entrega desses itens. Obrigado!`;
  return msg;
}

function fallbackCopy(texto){
  const ta = document.createElement('textarea');
  ta.value = texto; ta.style.position='fixed'; ta.style.opacity='0';
  document.body.appendChild(ta); ta.focus(); ta.select();
  try{ document.execCommand('copy'); }catch(e){}
  document.body.removeChild(ta);
}
function copiarTexto(texto, btnEl){
  const marcarCopiado = ()=>{
    const orig = btnEl.textContent;
    btnEl.textContent = '✓ Copiado!';
    setTimeout(()=>{ btnEl.textContent = orig; }, 1500);
  };
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(texto).then(marcarCopiado).catch(()=>{ fallbackCopy(texto); marcarCopiado(); });
  } else {
    fallbackCopy(texto); marcarCopiado();
  }
}

function renderCompras(){
  const c = document.getElementById('content');
  const compras = [...getComprasSugeridas(), ...getItensManuaisCompra()];
  const producao = getProducaoSugerida();
  const totalValorInicial = compras.reduce((a,x)=> pedidoPendenteFor(x.produto) ? a : a+x.valorEstimado, 0);

  let html = `<h1 class="pagetitle">Sugestão de Pedido</h1><p class="pagesub">Gerada automaticamente em ${fmtDate(todayStr())}, com base nos itens abaixo do estoque mínimo — mais os itens que você adicionar manualmente.</p>`;

  const produtosNaLista = new Set(compras.map(x=>x.produto));
  const opcoesParaAdicionar = db.brutos.filter(b=>!produtosNaLista.has(b.nome));
  html += `<div class="card"><h3 style="margin-top:0">Adicionar Item à Lista</h3>
    <p class="footnote" style="margin-top:-6px">Ache que deveria comprar um item mesmo sem estar abaixo do mínimo? Adicione aqui.</p>`;
  if(opcoesParaAdicionar.length===0){
    html += `<div class="footnote">Todos os produtos brutos cadastrados já estão na lista.</div>`;
  } else {
    html += `<div style="display:flex;gap:10px;align-items:end;flex-wrap:wrap">
      <div class="field" style="min-width:220px">
        <label>Produto</label>
        <select id="selItemManual">
          <option value="">Selecione...</option>
          ${opcoesParaAdicionar.map(b=>`<option value="${b.nome.replace(/"/g,'&quot;')}">${b.nome}</option>`).join('')}
        </select>
      </div>
      <button type="button" class="btn secondary" id="btnAdicionarItemManual">+ Adicionar à Lista</button>
    </div>`;
  }
  html += `</div>`;

  if(pedidoMensagens.length>0){
    html += `<div class="card"><h2>Mensagens de Cotação Geradas</h2>
      <p class="footnote" style="margin-top:-6px">Copie e envie para cada fornecedor (WhatsApp, e-mail, etc) pedindo confirmação dos valores. Os itens já foram para <strong>Pedido Feito — Conferência</strong>.</p>`;
    pedidoMensagens.forEach((m,i)=>{
      html += `<div style="margin-bottom:16px">
        <h3 style="margin-bottom:6px">${m.fornecedor}</h3>
        <textarea readonly id="msgPedido_${i}" style="width:100%;min-height:120px;font-family:inherit;font-size:13.5px;padding:10px;border:1px solid var(--border);border-radius:6px;resize:vertical">${m.texto}</textarea>
        <div style="margin-top:6px"><button type="button" class="btn secondary btnCopiarMsg" data-idx="${i}">📋 Copiar Mensagem</button></div>
      </div>`;
    });
    html += `<button type="button" class="btn secondary" id="btnFecharMensagens">✕ Fechar Mensagens</button></div>`;
  }

  html += `<div class="card"><h2>Compras Sugeridas — Produtos Brutos</h2>
    <p class="footnote" style="margin-top:-6px">Marque os itens que quer comprar e ajuste a quantidade se necessário. Ao clicar em "Fazer Pedido dos Selecionados", eles vão para <strong>Pedido Feito — Conferência</strong> (só entram no estoque quando você confirmar o recebimento) e uma mensagem pronta é gerada para cada fornecedor.</p>`;
  if(compras.length===0){
    html += `<div class="msg-ok">✓ Nenhum produto bruto abaixo do estoque mínimo hoje.</div>`;
  } else {
    const porFornecedor = {};
    compras.forEach(x=>{ (porFornecedor[x.fornecedor] = porFornecedor[x.fornecedor]||[]).push(x); });
    const temSelecionaveis = compras.some(x=>!pedidoPendenteFor(x.produto));
    if(temSelecionaveis){
      html += `<p class="footnote"><button type="button" class="linkbtn" id="btnSelecionarTodos">Selecionar todos</button> · <button type="button" class="linkbtn" id="btnLimparSelecao">Limpar seleção</button></p>`;
    }
    html += `<table><thead><tr><th></th><th>Produto</th><th>Categoria</th><th>Saldo Atual</th><th>Estoque Mínimo</th>
      <th>Sugestão</th><th>Qtd. a Pedir</th><th>Preço Médio</th><th>Valor Estimado</th><th></th></tr></thead><tbody>`;
    Object.keys(porFornecedor).forEach(forn=>{
      html += `<tr class="subheader"><td colspan="10">Fornecedor: ${forn}</td></tr>`;
      porFornecedor[forn].forEach(x=>{
        const pendente = pedidoPendenteFor(x.produto);
        const tagManual = x.manual ? ` <span class="badge-status st-warn" style="font-size:10px;vertical-align:middle">Manual</span>` : '';
        if(pendente){
          html += `<tr><td>—</td><td><strong>${x.produto}</strong>${tagManual}</td><td>${x.categoria}</td><td>${fmtNum(x.saldo)}</td>
            <td>${fmtNum(x.minimo)}</td><td>${fmtNum(x.sugestao)}</td>
            <td colspan="2"><span class="badge-status st-warn">📦 Pedido feito — ${fmtNum(pendente.quantidadePedida)} aguardando conferência</span></td>
            <td>—</td>
            <td><button class="btn secondary btnVerConferencia" style="white-space:nowrap">Ver na Conferência</button></td></tr>`;
        } else {
          const inputId = "qtdPedido_"+x.produto.replace(/[^a-zA-Z0-9]/g,'_');
          html += `<tr><td><input type="checkbox" class="itemCheckbox" data-produto="${x.produto.replace(/"/g,'&quot;')}" checked></td>
            <td><strong>${x.produto}</strong>${tagManual}</td><td>${x.categoria}</td><td>${fmtNum(x.saldo)}</td>
            <td>${fmtNum(x.minimo)}</td><td>${fmtNum(x.sugestao)}</td>
            <td><input type="number" step="0.01" min="0.01" class="qtdPedidoInput" id="${inputId}" data-produto="${x.produto.replace(/"/g,'&quot;')}" data-preco="${x.precoMedio}" value="${x.sugestao}" style="width:90px"></td>
            <td>${fmtMoney(x.precoMedio)}</td>
            <td class="valorEstimadoCell">${fmtMoney(x.valorEstimado)}</td>
            <td>${x.manual ? `<button class="btn secondary btnRemoverManual" data-produto="${x.produto.replace(/"/g,'&quot;')}" style="white-space:nowrap">✕ Remover</button>` : ''}</td></tr>`;
        }
      });
    });
    html += `</tbody></table><div class="total-line" id="totalCompraLine">Valor total estimado da compra: ${fmtMoney(totalValorInicial)}</div>`;
    if(temSelecionaveis){
      html += `<div style="margin-top:14px;text-align:right"><button type="button" class="btn" id="btnFazerPedidosSelecionados">📦 Fazer Pedido dos Selecionados</button></div>`;
    }
  }
  html += `</div>`;

  html += `<div class="card"><h3 style="margin-top:0">Produção Sugerida — Fracionados Abaixo do Mínimo</h3>`;
  if(producao.length===0){
    html += `<div class="msg-ok">✓ Nenhum fracionado abaixo do estoque mínimo hoje.</div>`;
  } else {
    html += `<table><thead><tr><th>Produto Fracionado</th><th>Origem (Bruto)</th><th>Saldo Atual</th><th>Estoque Mínimo</th>
      <th>Sugestão de Produção</th><th>Bruto Disponível na Central</th><th>Situação</th><th></th></tr></thead><tbody>`;
    producao.forEach(x=>{
      const sit = x.brutoSuficiente ? `<span class="badge-status st-ok">✓ Bruto suficiente</span>` : `<span class="badge-status st-bad">⚠ Falta bruto (necessário ≈ ${fmtNum(x.brutoNecessario)})</span>`;
      html += `<tr><td><strong>${x.produto}</strong></td><td>${x.origem}</td><td>${fmtNum(x.saldo)}</td><td>${fmtNum(x.minimo)}</td>
        <td>${fmtNum(x.sugestao)}</td><td>${fmtNum(x.brutoDisp)}</td><td>${sit}</td>
        <td><button class="btn secondary btnConcluirProducao" data-produto="${x.produto.replace(/"/g,'&quot;')}" style="white-space:nowrap" ${x.brutoSuficiente?'':'disabled title="Bruto insuficiente"'}>✓ Concluir</button></td></tr>`;
    });
    html += `</tbody></table><p class="footnote">Se o bruto disponível for insuficiente, registre antes uma Saída da Central para a Cozinha de Fracionamento.</p>`;
  }
  html += `</div>`;

  c.innerHTML = html;
  c.querySelectorAll('.btnConcluirProducao').forEach(btn=>{
    btn.addEventListener('click', ()=> concluirProducao(btn.dataset.produto));
  });
  c.querySelectorAll('.btnVerConferencia').forEach(btn=>{
    btn.addEventListener('click', ()=>{ currentTab = 'conferenciaPedidos'; render(); });
  });
  c.querySelectorAll('.btnCopiarMsg').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const idx = parseInt(btn.dataset.idx);
      copiarTexto(pedidoMensagens[idx].texto, btn);
    });
  });
  const btnFechar = c.querySelector('#btnFecharMensagens');
  if(btnFechar) btnFechar.addEventListener('click', ()=>{ pedidoMensagens = []; render(); });

  const btnSelTodos = c.querySelector('#btnSelecionarTodos');
  if(btnSelTodos) btnSelTodos.addEventListener('click', ()=>{ c.querySelectorAll('.itemCheckbox').forEach(chk=> chk.checked = true); });
  const btnLimparSel = c.querySelector('#btnLimparSelecao');
  if(btnLimparSel) btnLimparSel.addEventListener('click', ()=>{ c.querySelectorAll('.itemCheckbox').forEach(chk=> chk.checked = false); });

  const btnPedidosSel = c.querySelector('#btnFazerPedidosSelecionados');
  if(btnPedidosSel) btnPedidosSel.addEventListener('click', fazerPedidosSelecionados);

  const btnAddManual = c.querySelector('#btnAdicionarItemManual');
  if(btnAddManual) btnAddManual.addEventListener('click', ()=>{
    const sel = document.getElementById('selItemManual');
    if(!sel.value){ alert('Selecione um produto para adicionar.'); return; }
    adicionarItemManualCompra(sel.value);
  });
  c.querySelectorAll('.btnRemoverManual').forEach(btn=>{
    btn.addEventListener('click', ()=> removerItemManualCompra(btn.dataset.produto));
  });

  function recalcularTotalCompra(){
    let total = 0;
    c.querySelectorAll('.qtdPedidoInput').forEach(inp=>{
      const qtd = parseFloat(inp.value||0);
      const preco = parseFloat(inp.dataset.preco||0);
      total += qtd*preco;
      const cell = inp.closest('tr').querySelector('.valorEstimadoCell');
      if(cell) cell.textContent = fmtMoney(qtd*preco);
    });
    const totalLine = document.getElementById('totalCompraLine');
    if(totalLine) totalLine.textContent = `Valor total estimado da compra: ${fmtMoney(total)}`;
  }
  c.querySelectorAll('.qtdPedidoInput').forEach(inp=>{
    inp.addEventListener('input', recalcularTotalCompra);
  });
}

function fazerPedidosSelecionados(){
  const c = document.getElementById('content');
  const checked = [...c.querySelectorAll('.itemCheckbox:checked')];
  if(checked.length===0){ alert('Selecione ao menos um item para fazer o pedido.'); return; }

  const porFornecedor = {};
  checked.forEach(chk=>{
    const produto = chk.dataset.produto;
    const b = db.brutos.find(x=>x.nome===produto);
    if(!b) return;
    const inputId = "qtdPedido_"+produto.replace(/[^a-zA-Z0-9]/g,'_');
    const input = document.getElementById(inputId);
    const qtd = parseFloat(input ? input.value : 0);
    if(!qtd || qtd<=0) return;
    const fornecedor = (b.fornecedor && b.fornecedor!=='—') ? b.fornecedor : 'Fornecedor não informado';
    (porFornecedor[fornecedor] = porFornecedor[fornecedor]||[]).push({produto, quantidade:qtd, unidade:b.unidade, precoMedio:b.precoMedio||0});
  });

  const fornecedores = Object.keys(porFornecedor);
  if(fornecedores.length===0){ alert('Nenhum item válido selecionado (confira as quantidades).'); return; }

  const totalItens = fornecedores.reduce((a,f)=>a+porFornecedor[f].length,0);
  if(!confirm(`Confirmar pedido de ${totalItens} item(ns) em ${fornecedores.length} fornecedor(es)? Eles vão para a Conferência até você confirmar o recebimento, e uma mensagem de cotação será gerada para cada fornecedor.`)) return;

  pedidoMensagens = [];
  fornecedores.forEach(fornecedor=>{
    const itens = porFornecedor[fornecedor];
    itens.forEach(it=>{
      db.pedidosCompra.push({
        data: todayStr(),
        produto: it.produto,
        fornecedor: fornecedor==='Fornecedor não informado' ? '' : fornecedor,
        quantidadePedida: it.quantidade,
        precoEstimado: it.precoMedio,
        status: 'pendente',
      });
    });
    pedidoMensagens.push({ fornecedor, texto: gerarMensagemPedido(fornecedor, itens) });
  });
  saveDB();
  render();
}

function concluirProducao(produtoFracionado){
  const f = db.fracionados.find(x=>x.nome===produtoFracionado);
  if(!f) return;
  const saldo = saldoCozinhaFracionado(produtoFracionado);
  const sugestao = Math.max(0, (f.estoqueMinimo||0) - saldo);
  if(sugestao<=0){ alert('Este item já está acima do estoque mínimo — nada a concluir.'); render(); return; }
  const brutoNecessario = f.rendimento>0 ? sugestao/(f.rendimento/100) : 0;
  const brutoDisp = saldoCentral(f.origem);
  if(exceedsStock(brutoNecessario,brutoDisp)){
    alert(`Bruto insuficiente na ${getCentralNome()} para produzir. Necessário: ${fmtNum(brutoNecessario)}, disponível: ${fmtNum(brutoDisp)}.`);
    return;
  }
  if(!confirm(`Confirmar produção de ${fmtNum(sugestao)} ${f.unidade} de "${produtoFracionado}", consumindo ${fmtNum(brutoNecessario)} de "${f.origem}"?`)) return;
  db.producoes.push({
    data: todayStr(),
    produtoBruto: f.origem,
    quantidadeUtilizada: brutoNecessario,
    produtoFracionado,
    quantidadeProduzida: sugestao,
    unidadeProduzida: f.unidade,
    origemEstoque: 'central'
  });
  saveDB();
  render();
}

/* ============================= PEDIDO FEITO — CONFERÊNCIA ============================= */
function renderConferenciaPedidos(){
  const c = document.getElementById('content');
  const pendentes = db.pedidosCompra.map((p,idx)=>({...p, idx})).filter(p=>p.status==='pendente');
  const recebidosRecentes = db.pedidosCompra.map((p,idx)=>({...p, idx})).filter(p=>p.status==='recebido')
    .sort((a,b)=> (b.dataRecebimento||'').localeCompare(a.dataRecebimento||'')).slice(0,15);

  let html = `<h1 class="pagetitle">Pedido Feito — Conferência</h1>
    <p class="pagesub">Pedidos feitos em Sugestão de Pedido ficam aqui até a mercadoria chegar. Confirme a quantidade e o preço realmente recebidos — os campos são sempre editáveis — para dar entrada na Central de Distribuição.</p>`;

  html += `<div class="card"><h2>Pedidos Aguardando Recebimento (${pendentes.length})</h2>`;
  if(pendentes.length===0){
    html += `<div class="msg-ok">✓ Nenhum pedido pendente de conferência.</div>`;
  } else {
    html += `<table><thead><tr><th>Data do Pedido</th><th>Produto</th><th>Fornecedor</th><th>Qtd. Pedida</th>
      <th>Qtd. Recebida</th><th>Preço Unitário</th><th>Validade</th><th></th></tr></thead><tbody>`;
    pendentes.forEach(p=>{
      html += `<tr>
        <td>${fmtDate(p.data)}</td>
        <td><strong>${p.produto}</strong></td>
        <td><input type="text" class="confFornecedor" data-idx="${p.idx}" value="${(p.fornecedor||'').replace(/"/g,'&quot;')}" style="width:140px"></td>
        <td>${fmtNum(p.quantidadePedida)}</td>
        <td><input type="number" step="0.01" min="0.01" class="confQtd" data-idx="${p.idx}" value="${p.quantidadePedida}" style="width:90px"></td>
        <td><input type="number" step="0.01" min="0" class="confPreco" data-idx="${p.idx}" value="${p.precoEstimado||0}" style="width:90px"></td>
        <td><input type="date" class="confValidade" data-idx="${p.idx}"></td>
        <td style="white-space:nowrap">
          <button class="btn btnConfirmarEntrada" data-idx="${p.idx}">✓ Confirmar Entrada</button>
          <button class="btn secondary btnCancelarPedido" data-idx="${p.idx}">Cancelar</button>
        </td>
      </tr>`;
    });
    html += `</tbody></table>`;
  }
  html += `</div>`;

  html += `<div class="card"><h3 style="margin-top:0">Recebidos Recentemente</h3>`;
  if(recebidosRecentes.length===0){
    html += `<div class="empty">Nenhum pedido confirmado ainda.</div>`;
  } else {
    html += `<table><thead><tr><th>Recebido em</th><th>Produto</th><th>Qtd. Pedida</th><th>Qtd. Recebida</th><th>Preço Pago</th></tr></thead><tbody>`;
    recebidosRecentes.forEach(p=>{
      html += `<tr><td>${fmtDate(p.dataRecebimento)}</td><td>${p.produto}</td><td>${fmtNum(p.quantidadePedida)}</td>
        <td>${fmtNum(p.quantidadeRecebida)}</td><td>${fmtMoney(p.precoRecebido||0)}</td></tr>`;
    });
    html += `</tbody></table>`;
  }
  html += `</div>`;

  c.innerHTML = html;

  c.querySelectorAll('.btnConfirmarEntrada').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const idx = parseInt(btn.dataset.idx);
      const qtd = parseFloat(c.querySelector(`.confQtd[data-idx="${idx}"]`).value || 0);
      const preco = parseFloat(c.querySelector(`.confPreco[data-idx="${idx}"]`).value || 0);
      const fornecedor = c.querySelector(`.confFornecedor[data-idx="${idx}"]`).value;
      const validade = c.querySelector(`.confValidade[data-idx="${idx}"]`).value;
      confirmarEntradaPedido(idx, qtd, preco, fornecedor, validade);
    });
  });
  c.querySelectorAll('.btnCancelarPedido').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const idx = parseInt(btn.dataset.idx);
      if(confirm('Cancelar este pedido? Ele será removido da conferência.')){
        db.pedidosCompra.splice(idx,1);
        saveDB(); render();
      }
    });
  });
}

function confirmarEntradaPedido(idx, quantidadeRecebida, precoRecebido, fornecedor, validade){
  const pedido = db.pedidosCompra[idx];
  if(!pedido || pedido.status!=='pendente') return;
  if(!quantidadeRecebida || quantidadeRecebida<=0){ alert('Informe a quantidade recebida.'); return; }
  if(!confirm(`Confirmar entrada de ${fmtNum(quantidadeRecebida)} de "${pedido.produto}" na Central de Distribuição?`)) return;
  db.entradasCentral.push({
    data: todayStr(),
    nf: 'PEDIDO-'+(idx+1),
    produto: pedido.produto,
    fornecedor: fornecedor || pedido.fornecedor || '',
    quantidade: quantidadeRecebida,
    precoUnitario: precoRecebido||0,
    validade: validade || ''
  });
  pedido.status = 'recebido';
  pedido.dataRecebimento = todayStr();
  pedido.quantidadeRecebida = quantidadeRecebida;
  pedido.precoRecebido = precoRecebido||0;
  // se era um item adicionado manualmente à lista de compras, sai da lista agora que já entrou no estoque
  // (se ainda estiver abaixo do mínimo por algum motivo, ele reaparece sozinho via sugestão automática)
  db.itensManuaisCompra = db.itensManuaisCompra.filter(p=>p!==pedido.produto);
  saveDB();
  render();
}

/* ============================= USUÁRIOS E LOGS ============================= */
function actionLabel(acao){
  return acao === 'incluiu' ? 'Incluiu' : acao === 'alterou' ? 'Alterou' : acao === 'removeu' ? 'Removeu' : acao;
}
function renderChangeMap(logs){
  if(!logs.length) return `<div class="empty">Nenhum log encontrado.</div>`;
  return logs.map(log=>{
    const detalhes = Array.isArray(log.detalhes) ? log.detalhes : [];
    const detalhesHtml = detalhes.length ? detalhes.map(d=>{
      const itens = Array.isArray(d.itens) ? d.itens : [];
      const itemList = itens.length
        ? `<ul style="margin:6px 0 0 18px;padding:0">${itens.map(i=>`<li>${escapeHtml(i)}</li>`).join('')}</ul>`
        : '';
      return `<div style="padding:10px 0;border-top:1px solid var(--line)">
        <strong>${actionLabel(d.acao)} ${Number(d.quantidade||0)} em ${escapeHtml(d.secao||'Sistema')}</strong>
        ${itemList}
      </div>`;
    }).join('') : `<div class="footnote">${escapeHtml(log.resumo||'Alteracao registrada.')}</div>`;
    return `<div class="card" style="box-shadow:none;margin-top:12px;border-color:#eadfc5">
      <div style="display:grid;grid-template-columns:180px 1fr 130px;gap:12px;align-items:start">
        <div><strong>${new Date(log.criado_em).toLocaleString('pt-BR')}</strong></div>
        <div>
          <div><strong>${escapeHtml(log.email||'Sistema')}</strong></div>
          <div class="footnote">${escapeHtml(log.resumo||'Alteracao registrada.')}</div>
        </div>
        <div><span class="badge-status st-ok">${roleLabel(log.papel)}</span></div>
      </div>
      <div style="margin-top:10px">${detalhesHtml}</div>
    </div>`;
  }).join('');
}
async function renderUsuarios(){
  const c = document.getElementById('content');
  if(!canManageUsers()){
    c.innerHTML = `<h1 class="pagetitle">Acesso restrito</h1><p class="pagesub">Somente o acesso Master pode gerenciar usuários.</p>`;
    return;
  }
  c.innerHTML = `<h1 class="pagetitle">Usuários e Logs</h1><p class="pagesub">Crie acessos, defina permissões e acompanhe alterações feitas no sistema.</p><div class="card"><div class="empty">Carregando usuários...</div></div>`;
  try{
    const [usuarios, logs] = await Promise.all([
      window.__estoqueAccess.listUsers(),
      window.__estoqueAccess.listAudit()
    ]);
    let html = `<h1 class="pagetitle">Usuários e Logs</h1><p class="pagesub">Somente Master vê esta tela. Administrador edita o estoque, Visualizador apenas consulta.</p>`;
    html += `<div class="card"><h2>Novo Acesso</h2>
      <form class="entryform" id="userForm">
        <div class="field"><label>Nome</label><input type="text" name="nome" placeholder="Nome do usuário"></div>
        <div class="field"><label>E-mail</label><input type="email" name="email" required placeholder="usuario@empresa.com"></div>
        <div class="field"><label>Senha inicial</label><input type="password" name="senha" required minlength="6" placeholder="Senha segura"></div>
        <div class="field"><label>Nível</label><select name="papel"><option value="administrador">Administrador</option><option value="controle_fracionados">Controle de Fracionados</option><option value="visualizador">Visualizador</option></select></div>
        <div class="field"><label>&nbsp;</label><button class="btn" type="submit">Criar acesso</button></div>
      </form>
      <p class="footnote">Master cria acessos e gerencia usuários. Administrador altera todo o estoque, mas não vê esta tela. Visualizador só consulta.</p>
    </div>`;

    html += `<div class="card"><h2>Acessos (${usuarios.length})</h2><table><thead><tr><th>E-mail</th><th>Nome</th><th>Nível</th><th>Status</th><th></th></tr></thead><tbody>`;
    usuarios.forEach(u=>{
      const isMaster = u.papel === 'master';
      html += `<tr>
        <td><strong>${escapeHtml(u.email)}</strong></td>
        <td>${isMaster ? escapeHtml(u.nome||'') : `<input type="text" class="userNome" data-id="${u.user_id}" value="${escapeHtml(u.nome||'')}">`}</td>
        <td>${isMaster ? '<span class="badge-status st-ok">Master</span>' : `<select class="userPapel" data-id="${u.user_id}"><option value="administrador"${u.papel==='administrador'?' selected':''}>Administrador</option><option value="controle_fracionados"${u.papel==='controle_fracionados'?' selected':''}>Controle de Fracionados</option><option value="visualizador"${u.papel==='visualizador'?' selected':''}>Visualizador</option></select>`}</td>
        <td>${isMaster ? 'Ativo' : `<select class="userAtivo" data-id="${u.user_id}"><option value="true"${u.ativo?' selected':''}>Ativo</option><option value="false"${!u.ativo?' selected':''}>Bloqueado</option></select>`}</td>
        <td>${isMaster ? '—' : `<div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn secondary btnSalvarUsuario" data-id="${u.user_id}">Salvar</button>${u.ativo ? `<button class="btn secondary btnResetSenha" data-id="${u.user_id}" data-email="${escapeHtml(u.email)}">Senha</button>` : ''}<button class="btn secondary btnExcluirUsuario" data-id="${u.user_id}" data-email="${escapeHtml(u.email)}">Excluir</button></div>`}</td>
      </tr>`;
    });
    html += `</tbody></table></div>`;

    html += `<div class="card"><h2>Mapa de Alterações</h2><p class="footnote">Cada bloco representa um salvamento feito por um usuário, com o que foi incluído, alterado ou removido.</p>${renderChangeMap(logs)}</div>`;
    c.innerHTML = html;

    document.getElementById('userForm').addEventListener('submit', async (e)=>{
      e.preventDefault();
      const form = e.currentTarget;
      const payload = {
        nome: form.nome.value.trim(),
        email: form.email.value.trim(),
        senha: form.senha.value,
        papel: form.papel.value
      };
      if(!payload.email || !payload.senha){ alert('Informe e-mail e senha.'); return; }
      try{
        await window.__estoqueAccess.createUser(payload);
        alert('Acesso criado com sucesso.');
        renderUsuarios();
      }catch(err){
        alert('Não foi possível criar o acesso: ' + (err.message || err));
      }
    });

    c.querySelectorAll('.btnSalvarUsuario').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const id = btn.dataset.id;
        try{
          await window.__estoqueAccess.updateUser({
            user_id: id,
            nome: c.querySelector(`.userNome[data-id="${id}"]`).value.trim(),
            papel: c.querySelector(`.userPapel[data-id="${id}"]`).value,
            ativo: c.querySelector(`.userAtivo[data-id="${id}"]`).value === 'true'
          });
          alert('Usuário atualizado.');
          renderUsuarios();
        }catch(err){
          alert('Não foi possível atualizar: ' + (err.message || err));
        }
      });
    });
    c.querySelectorAll('.btnResetSenha').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const id = btn.dataset.id;
        const email = btn.dataset.email;
        const senha = prompt(`Digite a nova senha para ${email}:`);
        if(!senha) return;
        if(senha.length < 6){ alert('A senha precisa ter ao menos 6 caracteres.'); return; }
        if(!confirm(`Redefinir a senha de ${email}?`)) return;
        try{
          await window.__estoqueAccess.resetPassword({ user_id: id, senha });
          alert('Senha redefinida com sucesso.');
          renderUsuarios();
        }catch(err){
          alert('Não foi possível redefinir a senha: ' + (err.message || err));
        }
      });
    });
    c.querySelectorAll('.btnExcluirUsuario').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const id = btn.dataset.id;
        const email = btn.dataset.email;
        const motivo = prompt(`Motivo da exclusão/bloqueio de ${email}:`, 'Acesso removido pelo Master');
        if(motivo===null) return;
        if(!confirm(`Excluir o acesso de ${email}?\n\nA pessoa não conseguirá mais usar o sistema, mas o histórico e os logs serão preservados.`)) return;
        try{
          await window.__estoqueAccess.deleteUser({ user_id: id, motivo: motivo.trim() || 'Acesso removido pelo Master' });
          alert('Acesso excluído de forma segura.');
          renderUsuarios();
        }catch(err){
          alert('Não foi possível excluir o acesso: ' + (err.message || err));
        }
      });
    });
  }catch(err){
    c.innerHTML = `<h1 class="pagetitle">Usuários e Logs</h1><div class="card"><div class="msg-ok">Não foi possível carregar usuários/logs: ${escapeHtml(err.message || err)}</div></div>`;
  }
}

/* ============================= ALERTAS ============================= */
function renderAlertas(){
  const c = document.getElementById('content');
  const min = getAlertasMinimo();
  const val = getAlertasValidade();
  let html = `<h1 class="pagetitle">Alertas</h1><p class="pagesub">Estoque mínimo e validade próxima, atualizados automaticamente.</p>`;

  html += `<div class="card"><h2>Estoque Mínimo</h2><table><thead><tr>
    <th>Produto</th><th>Tipo</th><th>Saldo Atual</th><th>Estoque Mínimo</th><th>Status</th></tr></thead><tbody>`;
  min.forEach(x=>{
    html += `<tr><td><strong>${x.produto}</strong></td><td>${x.tipo}</td><td>${fmtNum(x.saldo)}</td><td>${fmtNum(x.minimo)}</td><td>${statusBadge(x.saldo,x.minimo)}</td></tr>`;
  });
  html += `</tbody></table></div>`;

  html += `<div class="card"><h2>Validade Próxima</h2><p class="footnote" style="margin-top:-10px">Limiares: até 3 dias = urgente · até 7 dias = atenção.</p><table><thead><tr>
    <th>Tipo</th><th>Produto</th><th>Data de Validade</th><th>Dias Para Vencer</th><th>Status</th></tr></thead><tbody>`;
  if(val.length===0){ html += `<tr><td colspan="5" class="empty">Nenhum lote com validade registrada.</td></tr>`; }
  val.forEach(x=>{
    html += `<tr><td>${x.tipo}</td><td><strong>${x.produto}</strong></td><td>${fmtDate(x.validade)}</td><td>${x.dias}</td><td>${validadeBadge(x.dias)}</td></tr>`;
  });
  html += `</tbody></table></div>`;
  c.innerHTML = html;
}

/* ============================= RELATÓRIOS ============================= */
function firstDayOfMonthStr(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`; }
function daysAgoStr(n){ const d=new Date(); d.setDate(d.getDate()-n); return d.toISOString().slice(0,10); }
function earliestDateStr(){
  const all = [...db.entradasCentral, ...db.saidasCentral, ...db.saidasFracionado].map(r=>r.data).filter(Boolean);
  if(all.length===0) return todayStr();
  return all.reduce((a,b)=> a<b ? a : b);
}
let reportFilter = { inicio: firstDayOfMonthStr(), fim: todayStr() };
let reportType = 'compras';
const REPORT_TYPES = [
  {key:'compras', label:'Compras no Período'},
  {key:'saidasCentral', label:'Saídas da Central por Destino'},
  {key:'producao', label:'Produção no Período'},
  {key:'saidasFracionado', label:'Saídas de Fracionados por Destino'},
  {key:'ajustes', label:'Ajustes de Estoque'},
];

function filterByDateRange(arr, inicio, fim){
  return arr.filter(r=> r.data && r.data>=inicio && r.data<=fim);
}

function renderReportBars(title, entries, formatValue){
  const rows = entries
    .map(([label,value])=>[label, Number(value||0)])
    .filter(([,value])=>Number.isFinite(value) && value!==0)
    .sort((a,b)=>Math.abs(b[1])-Math.abs(a[1]))
    .slice(0,8);
  if(rows.length===0) return '';
  const max = Math.max(1, ...rows.map(([,value])=>Math.abs(value)));
  const fmt = formatValue || fmtNum;
  return `<div class="report-visual">
    <div class="report-visual-head"><h3>${title}</h3><span>Top ${rows.length}</span></div>
    <div class="report-bars">
      ${rows.map(([label,value])=>`
        <div class="report-bar-row">
          <div class="report-bar-label" title="${label}">${label}</div>
          <div class="report-bar-track"><span class="report-bar-fill ${value<0?'negative':''}" style="width:${Math.max(4, Math.abs(value)/max*100)}%"></span></div>
          <div class="report-bar-value">${fmt(value)}</div>
        </div>`).join('')}
    </div>
  </div>`;
}

function renderRelatorios(){
  const c = document.getElementById('content');
  let html = `<h1 class="pagetitle">Relatórios</h1><p class="pagesub">Escolha o relatório e o período desejado.</p>`;

  html += `<div class="card">
    <h3 style="margin-top:0">Qual relatório você quer ver?</h3>
    <div class="presets" id="repTypeButtons">
      ${REPORT_TYPES.map(t=>`<button data-type="${t.key}" class="${t.key===reportType?'active':''}">${t.label}</button>`).join('')}
    </div>
    <h3>Período</h3>
    <div class="reportbar">
      <div class="field"><label>Data Início</label><input type="date" id="repInicio" value="${reportFilter.inicio}"></div>
      <div class="field"><label>Data Fim</label><input type="date" id="repFim" value="${reportFilter.fim}"></div>
      <button class="btn" id="repAplicar">Aplicar Período</button>
      <div class="presets">
        <button data-preset="hoje">Hoje</button>
        <button data-preset="7dias">Últimos 7 dias</button>
        <button data-preset="mes">Este Mês</button>
        <button data-preset="tudo">Tudo</button>
      </div>
    </div>
    <p class="period-label">Exibindo período de <strong>${fmtDate(reportFilter.inicio)}</strong> até <strong>${fmtDate(reportFilter.fim)}</strong>.</p>
  </div>`;

  const inicio = reportFilter.inicio, fim = reportFilter.fim;

  if(reportType==='compras'){
    const entradasP = filterByDateRange(db.entradasCentral, inicio, fim);
    html += `<div class="card"><h2>Compras no Período — Entrada na Central</h2>`;
    if(entradasP.length===0){
      html += `<div class="empty">Nenhuma compra registrada nesse período.</div>`;
    } else {
      const porProduto = {};
      entradasP.forEach(e=>{
        const k = e.produto;
        porProduto[k] = porProduto[k] || {quantidade:0, valor:0};
        porProduto[k].quantidade += Number(e.quantidade||0);
        porProduto[k].valor += Number(e.quantidade||0)*Number(e.precoUnitario||0);
      });
      let totalValor = 0, totalQtd = 0;
      html += `<table><thead><tr><th>Produto</th><th>Quantidade Comprada</th><th>Valor Total</th>
        <th>Preço Médio Pago no Período</th><th>Preço Médio Cadastrado</th></tr></thead><tbody>`;
      Object.keys(porProduto).sort().forEach(prod=>{
        const x = porProduto[prod];
        const b = db.brutos.find(y=>y.nome===prod);
        const precoPago = x.quantidade>0 ? x.valor/x.quantidade : 0;
        totalValor += x.valor; totalQtd += x.quantidade;
        html += `<tr><td><strong>${prod}</strong></td><td>${fmtNum(x.quantidade)}</td><td>${fmtMoney(x.valor)}</td>
          <td>${fmtMoney(precoPago)}</td><td>${b?fmtMoney(b.precoMedio||0):"—"}</td></tr>`;
      });
      html += `<tr class="subtotal-row"><td>Total</td><td>${fmtNum(totalQtd)}</td><td>${fmtMoney(totalValor)}</td><td colspan="2"></td></tr>`;
      html += `</tbody></table>`;
      html += renderReportBars('Quantidade comprada por produto', Object.entries(porProduto).map(([prod,x])=>[prod,x.quantidade]), fmtNum);
    }
    html += `</div>`;
  } else if(reportType==='saidasCentral'){
    const saidasCentralP = filterByDateRange(db.saidasCentral, inicio, fim);
    html += `<div class="card"><h2>Saídas da Central por Destino</h2>`;
    if(saidasCentralP.length===0){
      html += `<div class="empty">Nenhuma saída da Central registrada nesse período.</div>`;
    } else {
      html += renderSaidasCentralPorDestino(saidasCentralP, destinosCentralOptions());
      const porDestinoChart = {};
      saidasCentralP.forEach(r=>{ porDestinoChart[r.destino] = (porDestinoChart[r.destino]||0) + Number(r.quantidade||0); });
      html += renderReportBars('Total por destino', Object.entries(porDestinoChart), fmtNum);
    }
    html += `</div>`;
  } else if(reportType==='producao'){
    const producoesP = filterByDateRange(db.producoes, inicio, fim);
    html += `<div class="card"><h2>Produção no Período</h2>`;
    if(producoesP.length===0){
      html += `<div class="empty">Nenhuma produção registrada nesse período.</div>`;
    } else {
      const porProduto = {};
      producoesP.forEach(p=>{
        const k = p.produtoFracionado;
        porProduto[k] = porProduto[k] || {produzida:0, brutoUtilizado:0};
        porProduto[k].produzida += Number(p.quantidadeProduzida||0);
        porProduto[k].brutoUtilizado += Number(p.quantidadeUtilizada||0);
      });
      let totalProduzida = 0, totalBruto = 0;
      html += `<table><thead><tr><th>Produto Fracionado</th><th>Qtd. Produzida</th><th>Bruto Utilizado</th></tr></thead><tbody>`;
      Object.keys(porProduto).sort().forEach(prod=>{
        const x = porProduto[prod];
        totalProduzida += x.produzida; totalBruto += x.brutoUtilizado;
        html += `<tr><td><strong>${prod}</strong></td><td>${fmtNum(x.produzida)}</td><td>${fmtNum(x.brutoUtilizado)}</td></tr>`;
      });
      html += `<tr class="subtotal-row"><td>Total</td><td>${fmtNum(totalProduzida)}</td><td>${fmtNum(totalBruto)}</td></tr>`;
      html += `</tbody></table>`;
      html += renderReportBars('Quantidade produzida por produto', Object.entries(porProduto).map(([prod,x])=>[prod,x.produzida]), fmtNum);
    }
    html += `</div>`;
  } else if(reportType==='saidasFracionado'){
    const saidasFracP = filterByDateRange(db.saidasFracionado, inicio, fim);
    html += `<div class="card"><h2>Saídas de Fracionados por Destino</h2>`;
    if(saidasFracP.length===0){
      html += `<div class="empty">Nenhuma saída de fracionados registrada nesse período.</div>`;
    } else {
      html += renderSaidasPorDestino(saidasFracP, destinosFracionadoOptions());
      const porDestinoFracChart = {};
      saidasFracP.forEach(r=>{ porDestinoFracChart[r.destino] = (porDestinoFracChart[r.destino]||0) + Number(r.quantidade||0); });
      html += renderReportBars('Total por destino', Object.entries(porDestinoFracChart), fmtNum);
    }
    html += `</div>`;
  } else if(reportType==='ajustes'){
    const ajustesP = filterByDateRange(db.ajustesEstoque, inicio, fim);
    html += `<div class="card"><h2>Ajustes de Estoque no Período</h2>`;
    if(ajustesP.length===0){
      html += `<div class="empty">Nenhum ajuste de estoque registrado nesse período.</div>`;
    } else {
      let totalDiferenca = 0;
      html += `<table><thead><tr><th>Data</th><th>Produto</th><th>Saldo Anterior</th><th>Novo Saldo</th><th>Diferença</th><th>Motivo</th><th>Responsável</th></tr></thead><tbody>`;
      [...ajustesP].sort((a,b)=> a.data < b.data ? 1 : -1).forEach(a=>{
        const dif = Number(a.diferenca||0);
        totalDiferenca += dif;
        const cor = dif>0 ? 'var(--ok, #1a7a3c)' : (dif<0 ? 'var(--danger, #b3261e)' : 'inherit');
        html += `<tr><td>${fmtDate(a.data)}</td><td><strong>${a.produto}</strong></td><td>${fmtNum(a.saldoAnterior)}</td><td>${fmtNum(a.novoSaldo)}</td>
          <td style="color:${cor}">${dif>0?'+':''}${fmtNum(dif)}</td><td>${a.motivo||''}</td><td>${a.responsavel||''}</td></tr>`;
      });
      const corTotal = totalDiferenca>0 ? 'var(--ok, #1a7a3c)' : (totalDiferenca<0 ? 'var(--danger, #b3261e)' : 'inherit');
      html += `<tr class="subtotal-row"><td colspan="4">Total (ajuste líquido no período)</td><td style="color:${corTotal}">${totalDiferenca>0?'+':''}${fmtNum(totalDiferenca)}</td><td colspan="2"></td></tr>`;
      html += `</tbody></table>`;
      const porProdutoAjuste = {};
      ajustesP.forEach(a=>{ porProdutoAjuste[a.produto] = (porProdutoAjuste[a.produto]||0) + Number(a.diferenca||0); });
      html += renderReportBars('Diferença por produto', Object.entries(porProdutoAjuste), fmtNum);
    }
    html += `</div>`;
  }

  c.innerHTML = html;

  // gráfico do relatório atual (carregado sob demanda)
  const chartCanvas = c.querySelector('#reportChartCanvas');
  if(chartCanvas){
    if(reportType==='compras'){
      const entradasP = filterByDateRange(db.entradasCentral, inicio, fim);
      const porProduto = {};
      entradasP.forEach(e=>{ porProduto[e.produto] = (porProduto[e.produto]||0) + Number(e.quantidade||0); });
      const sorted = Object.entries(porProduto).sort((a,b)=>b[1]-a[1]).slice(0,10);
      loadChartJS(()=> drawReportChart('reportChartCanvas', sorted.map(x=>x[0]), sorted.map(x=>x[1]), 'Quantidade Comprada'));
    } else if(reportType==='saidasCentral'){
      const saidasCentralP = filterByDateRange(db.saidasCentral, inicio, fim);
      const porDestino = {};
      saidasCentralP.forEach(r=>{ porDestino[r.destino] = (porDestino[r.destino]||0) + Number(r.quantidade||0); });
      const sorted = Object.entries(porDestino).sort((a,b)=>b[1]-a[1]);
      loadChartJS(()=> drawReportChart('reportChartCanvas', sorted.map(x=>x[0]), sorted.map(x=>x[1]), 'Quantidade Enviada'));
    } else if(reportType==='producao'){
      const producoesP = filterByDateRange(db.producoes, inicio, fim);
      const porProduto = {};
      producoesP.forEach(p=>{ porProduto[p.produtoFracionado] = (porProduto[p.produtoFracionado]||0) + Number(p.quantidadeProduzida||0); });
      const sorted = Object.entries(porProduto).sort((a,b)=>b[1]-a[1]).slice(0,10);
      loadChartJS(()=> drawReportChart('reportChartCanvas', sorted.map(x=>x[0]), sorted.map(x=>x[1]), 'Quantidade Produzida'));
    } else if(reportType==='saidasFracionado'){
      const saidasFracP = filterByDateRange(db.saidasFracionado, inicio, fim);
      const porDestino = {};
      saidasFracP.forEach(r=>{ porDestino[r.destino] = (porDestino[r.destino]||0) + Number(r.quantidade||0); });
      const sorted = Object.entries(porDestino).sort((a,b)=>b[1]-a[1]);
      loadChartJS(()=> drawReportChart('reportChartCanvas', sorted.map(x=>x[0]), sorted.map(x=>x[1]), 'Quantidade Enviada'));
    } else if(reportType==='ajustes'){
      const ajustesP = filterByDateRange(db.ajustesEstoque, inicio, fim);
      const porProduto = {};
      ajustesP.forEach(a=>{ porProduto[a.produto] = (porProduto[a.produto]||0) + Number(a.diferenca||0); });
      const sorted = Object.entries(porProduto).sort((a,b)=> Math.abs(b[1])-Math.abs(a[1])).slice(0,10);
      loadChartJS(()=> drawReportChart('reportChartCanvas', sorted.map(x=>x[0]), sorted.map(x=>x[1]), 'Diferença no Ajuste'));
    }
  }

  function applyPreset(p){
    if(p==='hoje'){ reportFilter = {inicio: todayStr(), fim: todayStr()}; }
    else if(p==='7dias'){ reportFilter = {inicio: daysAgoStr(6), fim: todayStr()}; }
    else if(p==='mes'){ reportFilter = {inicio: firstDayOfMonthStr(), fim: todayStr()}; }
    else if(p==='tudo'){ reportFilter = {inicio: earliestDateStr(), fim: todayStr()}; }
    render();
  }
  c.querySelector('#repAplicar').addEventListener('click', ()=>{
    const ini = c.querySelector('#repInicio').value, fimv = c.querySelector('#repFim').value;
    if(!ini || !fimv){ alert('Selecione as duas datas.'); return; }
    if(ini > fimv){ alert('A data de início deve ser anterior ou igual à data de fim.'); return; }
    reportFilter = {inicio:ini, fim:fimv};
    render();
  });
  c.querySelectorAll('#repTypeButtons button').forEach(btn=>{
    btn.addEventListener('click', ()=>{ reportType = btn.dataset.type; render(); });
  });
  c.querySelectorAll('.reportbar .presets button').forEach(btn=>{
    btn.addEventListener('click', ()=> applyPreset(btn.dataset.preset));
  });
}

function renderSaidasPorDestino(rows, destinosOrdenados){
  let html = `<table><thead><tr><th>Destino</th><th>Produto</th><th>Quantidade</th></tr></thead><tbody>`;
  let grandTotal = 0;
  // inclui também destinos que aparecem nos lançamentos mas não estão mais em "Locais" (ex.: local excluído depois do lançamento)
  const todosDestinos = [...destinosOrdenados];
  [...new Set(rows.map(r=>r.destino))].forEach(d=>{ if(!todosDestinos.includes(d)) todosDestinos.push(d); });
  todosDestinos.forEach(dest=>{
    const rowsDest = rows.filter(r=>r.destino===dest);
    if(rowsDest.length===0) return;
    const porProduto = {};
    rowsDest.forEach(r=>{ porProduto[r.produto] = (porProduto[r.produto]||0) + Number(r.quantidade||0); });
    let subtotal = 0;
    html += `<tr class="subheader"><td colspan="3">${dest}</td></tr>`;
    Object.keys(porProduto).sort().forEach(prod=>{
      html += `<tr><td></td><td>${prod}</td><td>${fmtNum(porProduto[prod])}</td></tr>`;
      subtotal += porProduto[prod];
    });
    html += `<tr class="subtotal-row"><td></td><td>Subtotal ${dest}</td><td>${fmtNum(subtotal)}</td></tr>`;
    grandTotal += subtotal;
  });
  html += `</tbody></table>`;
  return html;
}

function precoUnitarioBruto(produto){
  const bruto = db.brutos.find(b=>b.nome===produto);
  if(bruto && Number(bruto.precoMedio||0)>0) return Number(bruto.precoMedio||0);
  const entradas = db.entradasCentral.filter(e=>e.produto===produto && Number(e.precoUnitario||0)>0);
  if(entradas.length===0) return 0;
  const totalQtd = entradas.reduce((a,e)=>a+Number(e.quantidade||0),0);
  const totalValor = entradas.reduce((a,e)=>a+Number(e.quantidade||0)*Number(e.precoUnitario||0),0);
  return totalQtd>0 ? totalValor/totalQtd : 0;
}

function renderSaidasCentralPorDestino(rows, destinosOrdenados){
  const todosDestinos = [...destinosOrdenados];
  [...new Set(rows.map(r=>r.destino).filter(Boolean))].forEach(d=>{ if(!todosDestinos.includes(d)) todosDestinos.push(d); });
  const grupos = [];
  todosDestinos.forEach(destino=>{
    const rowsDestino = rows.filter(r=>r.destino===destino);
    if(rowsDestino.length===0) return;
    const porProduto = {};
    rowsDestino.forEach(r=>{
      const produto = r.produto || 'Produto sem nome';
      porProduto[produto] = porProduto[produto] || {produto, quantidade:0, precoUnitario:precoUnitarioBruto(produto)};
      porProduto[produto].quantidade += Number(r.quantidade||0);
    });
    const itens = Object.values(porProduto).sort((a,b)=>a.produto.localeCompare(b.produto,'pt-BR'));
    const totalQuantidade = itens.reduce((a,item)=>a+Number(item.quantidade||0),0);
    const totalValor = itens.reduce((a,item)=>a+Number(item.quantidade||0)*Number(item.precoUnitario||0),0);
    grupos.push({destino, itens, totalQuantidade, totalValor});
  });
  if(grupos.length===0) return `<div class="empty">Nenhuma saída da Central registrada nesse período.</div>`;

  let html = `<div class="report-note"><strong>Resumo por unidade:</strong> cada destino possui seu próprio subtotal de quantidade e valor. Os valores de unidades diferentes não são misturados.</div>`;
  html += `<div class="destination-report-wrap"><table class="destination-report"><thead><tr>
    <th>Unidade que recebeu</th><th>Produto</th><th class="num">Quantidade</th><th class="num">Preço unitário</th><th class="num">Valor recebido pela unidade</th>
  </tr></thead><tbody>`;
  grupos.forEach(grupo=>{
    html += `<tr class="destination-row"><td colspan="5">${escapeHtml(grupo.destino)}</td></tr>`;
    grupo.itens.forEach(item=>{
      const valor = item.quantidade * item.precoUnitario;
      html += `<tr>
        <td></td>
        <td class="product-name">${escapeHtml(item.produto)}</td>
        <td class="num">${fmtNum(item.quantidade)}</td>
        <td class="num ${item.precoUnitario<=0?'price-missing':''}">${item.precoUnitario>0?fmtMoney(item.precoUnitario):'Sem preço'}</td>
        <td class="num"><strong>${fmtMoney(valor)}</strong></td>
      </tr>`;
    });
    html += `<tr class="destination-subtotal">
      <td></td>
      <td>Subtotal recebido por ${escapeHtml(grupo.destino)}</td>
      <td class="num">${fmtNum(grupo.totalQuantidade)}</td>
      <td class="num">—</td>
      <td class="num">${fmtMoney(grupo.totalValor)}</td>
    </tr>`;
  });
  html += `</tbody></table></div>`;
  html += `<div class="unit-summary-title">Totais separados por unidade</div><div class="destination-summary-grid">`;
  grupos.forEach(grupo=>{
    html += `<div class="destination-summary-card">
      <div class="name">${escapeHtml(grupo.destino)}</div>
      <div class="line"><span>Quantidade recebida</span><strong>${fmtNum(grupo.totalQuantidade)}</strong></div>
      <div class="line"><span>Valor recebido</span><strong>${fmtMoney(grupo.totalValor)}</strong></div>
    </div>`;
  });
  html += `</div>`;
  html += `<p class="hint">Os preços vêm do preço médio cadastrado em Produtos Brutos. Quando não houver preço cadastrado, o valor aparece como sem preço para conferência.</p>`;
  return html;
}

/* ============================= DASHBOARD ============================= */
function renderDashboard(){
  const c = document.getElementById('content');
  const valorCentral = db.brutos.reduce((a,b)=> a + saldoCentral(b.nome)*(b.precoMedio||0), 0);
  const valorRecebido = db.entradasCentral.reduce((a,e)=> a + (e.quantidade||0)*(e.precoUnitario||0), 0);
  const alertasMin = getAlertasMinimo().filter(x=>x.abaixo).length;
  const alertasVal = getAlertasValidade();
  const vencidosUrgentes = alertasVal.filter(x=>x.dias<=3).length;
  const atencao = alertasVal.filter(x=>x.dias>3 && x.dias<=7).length;
  const hoje = todayStr();
  const entradasHoje = db.entradasCentral.filter(e=>e.data===hoje);
  const saidasHojeCount = db.saidasCentral.filter(s=>s.data===hoje).length + db.saidasFracionado.filter(s=>s.data===hoje).length;
  const valorEntradasHoje = entradasHoje.reduce((a,e)=>a+(e.quantidade||0)*(e.precoUnitario||0),0);
  const topMinimos = getAlertasMinimo().filter(x=>x.abaixo).slice(0,5);

  let html = `<div class="dash-head"><div><h1 class="pagetitle">Olá, Administrador</h1><p class="pagesub">Aqui está um resumo da sua gestão de estoque hoje.</p></div><button class="btn secondary" type="button" onclick="render()">Atualizar</button></div>`;

  html += `<div class="kpi-grid">
    ${kpi(db.brutos.length,"Produtos Brutos Cadastrados")}
    ${kpi(db.fracionados.length,"Produtos Fracionados Cadastrados")}
    ${kpi(db.locais.length,"Locais Cadastrados")}
    ${kpi(fmtMoney(valorRecebido),"Valor Total Recebido na Central")}
    ${kpi(fmtMoney(valorCentral),"Valor em Estoque na Central")}
  </div>`;

  html += `<div class="alert-strip">
    <div class="alert-card danger"><strong>${alertasMin}</strong><span>itens abaixo do mínimo</span></div>
    <div class="alert-card warn"><strong>${vencidosUrgentes}</strong><span>lotes vencidos ou urgentes (≤ 3 dias)</span></div>
    <div class="alert-card neutral"><strong>${atencao}</strong><span>lotes em atenção (≤ 7 dias)</span></div>
  </div>`;

  html += `<div class="dashboard-grid"><div class="card"><h2>Itens em estoque por local</h2>`;
  const counts = db.locais.map(l=>{
    let n=0;
    if(l.tipo==='Central') n = db.brutos.filter(b=>saldoCentral(b.nome)>0).length;
    else if(l.tipo==='Fracionamento') n = db.brutos.filter(b=>saldoCozinhaBruto(b.nome)>0).length + db.fracionados.filter(f=>saldoCozinhaFracionado(f.nome)>0).length;
    else n = db.brutos.filter(b=>saldoLocalBruto(b.nome,l.nome)>0).length + db.fracionados.filter(f=>saldoLocalFracionado(f.nome,l.nome)>0).length;
    return {loc:l.nome,n};
  });
  const maxN = Math.max(1, ...counts.map(x=>x.n));
  counts.forEach(x=>{
    html += `<div class="barrow"><div class="barlabel">${x.loc}</div><div class="bartrack"><div class="barfill" style="width:${(x.n/maxN*100)}%"></div></div><div class="barval">${x.n}</div></div>`;
  });
  html += `</div>`;

  html += `<div><div class="card"><h2>Movimentações de hoje</h2><div class="today-moves"><div><small>Entradas</small><strong>${entradasHoje.length}</strong><span>${fmtMoney(valorEntradasHoje)}</span></div><div><small>Saídas</small><strong>${saidasHojeCount}</strong><span>registros</span></div></div></div>`;
  html += `<div class="card"><h2>Top 5 itens abaixo do mínimo</h2><table><thead><tr><th>Produto</th><th>Local</th><th>Atual</th><th>Mínimo</th></tr></thead><tbody>`;
  if(topMinimos.length===0){ html += `<tr><td colspan="4" class="empty">Nenhum item abaixo do mínimo.</td></tr>`; }
  topMinimos.forEach(x=>{
    html += `<tr><td><strong>${x.produto}</strong></td><td>${x.local||'Central'}</td><td>${fmtNum(x.saldo)}</td><td>${fmtNum(x.minimo)}</td></tr>`;
  });
  html += `</tbody></table></div></div></div>`;

  c.innerHTML = html;
}function kpi(val,lbl,alert){
  return `<div class="kpi${alert?' alert':''}"><div class="val">${val}</div><div class="lbl">${lbl}</div></div>`;
}

/* ============================= BACKUP ============================= */
function backupFileName(){
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`;
  return `backup_estoque_fran_casarin_${stamp}.json`;
}
function exportBackup(){
  const payload = { ...db, _exportadoEm: new Date().toISOString(), _sistema: "Sistema de Estoque Fran Casarin" };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = backupFileName();
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function importBackupFile(file){
  const reader = new FileReader();
  reader.onload = (e)=>{
    let parsed;
    try{ parsed = JSON.parse(e.target.result); }
    catch(err){ alert('Não foi possível ler o arquivo. Verifique se é um backup válido (.json) gerado por este sistema.'); return; }
    const requiredKeys = ['brutos','fracionados','locais','entradasCentral','saidasCentral','producoes','saidasFracionado'];
    const missing = requiredKeys.filter(k=>!Array.isArray(parsed[k]));
    if(missing.length){ alert('Arquivo inválido: faltam os dados de ' + missing.join(', ') + '.'); return; }
    if(!confirm('Isso vai substituir TODOS os dados atuais pelos dados deste backup. Essa ação não pode ser desfeita. Continuar?')) return;
    db = normalizeDB(parsed);
    saveDB();
    currentTab = 'backup';
    render();
    alert('Backup importado com sucesso!');
  };
  reader.onerror = ()=> alert('Erro ao ler o arquivo selecionado.');
  reader.readAsText(file);
}
let currentReportChart = null;
function loadChartJS(callback){
  if(window.Chart){ callback(); return; }
  const existing = document.getElementById('chartjs-lib');
  if(existing){ existing.addEventListener('load', callback); return; }
  const script = document.createElement('script');
  script.id = 'chartjs-lib';
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.4/chart.umd.min.js';
  script.onload = callback;
  script.onerror = ()=> console.error('Não foi possível carregar a biblioteca de gráficos — é necessária conexão com a internet só para esta função (o resto do sistema funciona offline normalmente).');
  document.head.appendChild(script);
}
function drawReportChart(canvasId, labels, data, label, color){
  const canvas = document.getElementById(canvasId);
  if(!canvas) return;
  try{
    if(currentReportChart){ currentReportChart.destroy(); currentReportChart = null; }
    if(!labels.length) return;
    const ctx = canvas.getContext('2d');
    currentReportChart = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets: [{ label, data, backgroundColor: color || '#C28F2C' }] },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } }
      }
    });
  } catch(e){
    console.error('Erro ao desenhar gráfico:', e.message);
  }
}

function loadSheetJS(callback){
  if(window.XLSX){ callback(); return; }
  const existing = document.getElementById('sheetjs-lib');
  if(existing){ existing.addEventListener('load', callback); return; }
  const script = document.createElement('script');
  script.id = 'sheetjs-lib';
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  script.onload = callback;
  script.onerror = ()=> alert('Não foi possível carregar o gerador de Excel — é necessária conexão com a internet só para esta função (o resto do sistema funciona offline normalmente). Tente novamente.');
  document.head.appendChild(script);
}
function xlsxStamp(){
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`;
}
function sheetRows(rows, fallbackMsg){
  return rows.length ? rows : [{"Aviso": fallbackMsg || "Nenhum registro lançado ainda."}];
}
function buildExcelWorkbook(){
  const wb = XLSX.utils.book_new();
  const add = (name, rows) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name.substring(0,31));

  add('Produtos Brutos', sheetRows(db.brutos.map(b=>({
    'Produto': b.nome, 'Categoria': b.categoria, 'Unidade': b.unidade, 'Estoque Mínimo': b.estoqueMinimo,
    'Fornecedor': b.fornecedor, 'Preço Médio (R$)': b.precoMedio, 'Validade Padrão (dias)': b.validadeDias,
    'Saldo Atual (Central)': saldoCentral(b.nome),
  }))));

  add('Produtos Fracionados', sheetRows(db.fracionados.map(f=>({
    'Produto': f.nome, 'Categoria': f.categoria, 'Unidade': f.unidade, 'Origem (Bruto)': f.origem,
    'Rendimento (%)': f.rendimento, 'Estoque Mínimo': f.estoqueMinimo, 'Validade Após Fracionar (dias)': f.validadeDias,
    'Saldo Atual (Cozinha)': saldoCozinhaFracionado(f.nome),
  }))));

  add('Locais', sheetRows(db.locais.map(l=>({ 'Local': l.nome, 'Tipo': l.tipo, 'Responsável': l.responsavel }))));

  add('Entrada na Central', sheetRows(db.entradasCentral.map(e=>{
    const b = db.brutos.find(x=>x.nome===e.produto);
    return { 'Data': fmtDate(e.data), 'NF': e.nf, 'Produto': e.produto, 'Fornecedor': e.fornecedor,
      'Quantidade': e.quantidade, 'Preço Pago (R$)': e.precoUnitario, 'Preço Médio Cadastrado (R$)': b?b.precoMedio:'',
      'Valor Total (R$)': (e.quantidade||0)*(e.precoUnitario||0), 'Validade': fmtDate(e.validade) };
  })));

  add('Saída da Central', sheetRows(db.saidasCentral.map(s=>({
    'Data': fmtDate(s.data), 'Documento': s.documento, 'Produto': s.produto, 'Destino': s.destino, 'Quantidade': s.quantidade,
  }))));

  add('Produção de Fracionados', sheetRows(db.producoes.map(p=>{
    const f = db.fracionados.find(x=>x.nome===p.produtoFracionado);
    let validade = '';
    if(f && p.data){ const d = new Date(p.data+'T00:00:00'); d.setDate(d.getDate()+Number(f.validadeDias||0)); validade = fmtDate(d.toISOString().slice(0,10)); }
    return { 'Data': fmtDate(p.data), 'Bruto Utilizado': p.produtoBruto, 'Quantidade Utilizada': p.quantidadeUtilizada,
      'Fracionado Gerado': p.produtoFracionado, 'Quantidade Produzida': p.quantidadeProduzida, 'Validade do Fracionado': validade };
  })));

  add('Saída de Fracionados', sheetRows(db.saidasFracionado.map(s=>({
    'Data': fmtDate(s.data), 'Documento': s.documento, 'Produto': s.produto, 'Destino': s.destino, 'Quantidade': s.quantidade,
  }))));

  add('Alertas Estoque Mínimo', sheetRows(getAlertasMinimo().map(x=>({
    'Produto': x.produto, 'Tipo': x.tipo, 'Saldo Atual': x.saldo, 'Estoque Mínimo': x.minimo,
    'Status': x.abaixo ? 'ABAIXO DO MÍNIMO' : 'NORMAL',
  }))));

  add('Alertas de Validade', sheetRows(getAlertasValidade().map(x=>({
    'Tipo': x.tipo, 'Produto': x.produto, 'Validade': fmtDate(x.validade), 'Dias Para Vencer': x.dias,
    'Status': x.dias<0?'VENCIDO':(x.dias<=3?'URGENTE':(x.dias<=7?'ATENÇÃO':'OK')),
  }))));

  add('Pedidos de Compra', sheetRows(db.pedidosCompra.map(p=>({
    'Data do Pedido': fmtDate(p.data), 'Produto': p.produto, 'Fornecedor': p.fornecedor,
    'Qtd. Pedida': p.quantidadePedida, 'Preço Estimado (R$)': p.precoEstimado,
    'Status': p.status==='recebido' ? 'Recebido' : 'Pendente',
    'Recebido em': p.dataRecebimento ? fmtDate(p.dataRecebimento) : '—',
    'Qtd. Recebida': p.quantidadeRecebida||'', 'Preço Recebido (R$)': p.precoRecebido||'',
  })), 'Nenhum pedido de compra lançado ainda.'));

  add('Ajustes de Estoque', sheetRows(db.ajustesEstoque.map(a=>({
    'Data': fmtDate(a.data), 'Produto': a.produto, 'Saldo Anterior': a.saldoAnterior, 'Novo Saldo': a.novoSaldo,
    'Diferença': a.diferenca, 'Motivo': a.motivo, 'Responsável': a.responsavel,
  })), 'Nenhum ajuste de estoque lançado ainda.'));

  return wb;
}
function exportExcel(){
  loadSheetJS(()=>{
    try{
      const wb = buildExcelWorkbook();
      XLSX.writeFile(wb, `estoque_fran_casarin_${xlsxStamp()}.xlsx`);
    }catch(e){
      alert('Erro ao gerar o Excel: ' + e.message);
    }
  });
}
function renderBackup(){
  const c = document.getElementById('content');
  const totalLancamentos = db.entradasCentral.length + db.saidasCentral.length + db.producoes.length + db.saidasFracionado.length;
  let html = `<h1 class="pagetitle">Backup</h1><p class="pagesub">Salve uma cópia de segurança dos dados ou restaure a partir de um backup anterior.</p>`;

  html += `<div class="card"><h2>O que está salvo agora</h2>
    <div class="kpi-grid">
      ${kpi(db.brutos.length,"Produtos Brutos")}
      ${kpi(db.fracionados.length,"Produtos Fracionados")}
      ${kpi(db.locais.length,"Locais")}
      ${kpi(totalLancamentos,"Lançamentos no Total")}
    </div>
  </div>`;

  html += `<div class="card"><h2>Exportar Backup</h2>
    <p class="pagesub" style="margin-bottom:16px">Baixa um arquivo .json com todos os cadastros e lançamentos até agora. Guarde esse arquivo em um lugar seguro (e-mail, Google Drive, pendrive) — recomendamos fazer isso pelo menos uma vez por semana.</p>
    <button class="btn" id="btnExportBackup">⬇ Baixar Backup Agora</button>
  </div>`;

  html += `<div class="card"><h2>Importar Backup</h2>
    <p class="pagesub" style="margin-bottom:16px">Restaura os dados a partir de um arquivo de backup exportado anteriormente. <strong>Atenção:</strong> isso substitui todos os dados atuais do sistema — use apenas se precisar recuperar de um problema (computador trocado, dados perdidos, etc.).</p>
    <div class="field" style="max-width:360px">
      <label>Selecione o arquivo de backup (.json)</label>
      <input type="file" id="inputImportBackup" accept="application/json,.json">
    </div>
  </div>`;

  html += `<div class="card"><h2>Exportar para Excel</h2>
    <p class="pagesub" style="margin-bottom:16px">Gera um arquivo .xlsx com cadastros, lançamentos, estoque atual e alertas — uma aba para cada tabela. Serve para abrir no Excel, imprimir ou enviar para o contador. É só uma cópia para consulta: para <strong>restaurar</strong> dados no sistema, use o backup .json acima, não o Excel. Requer internet só nesse momento, para carregar o gerador de planilha.</p>
    <button class="btn secondary" id="btnExportExcel">⬇ Baixar Planilha Excel (.xlsx)</button>
  </div>`;

  c.innerHTML = html;
  c.querySelector('#btnExportBackup').addEventListener('click', exportBackup);
  c.querySelector('#btnExportExcel').addEventListener('click', exportExcel);
  c.querySelector('#inputImportBackup').addEventListener('change', (e)=>{
    const file = e.target.files[0];
    if(file) importBackupFile(file);
    e.target.value = '';
  });
}

/* ============================= IMPORTAR NOTA FISCAL (PDF) ============================= */
let nfImport = null; // {fileName, rawText, header:{fornecedor,nf,data}, itens:[...]}

function loadPdfJS(callback){
  if(window.pdfjsLib){ callback(); return; }
  const existing = document.getElementById('pdfjs-lib');
  if(existing){ existing.addEventListener('load', callback); return; }
  const script = document.createElement('script');
  script.id = 'pdfjs-lib';
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  script.onload = ()=>{
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    callback();
  };
  script.onerror = ()=> alert('Não foi possível carregar o leitor de PDF — é necessária conexão com a internet só para esta função. Tente novamente.');
  document.head.appendChild(script);
}

async function extractPdfText(pdfjsLib, arrayBuffer){
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = "";
  for(let p=1; p<=pdf.numPages; p++){
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const items = content.items.map(it=>({ str: it.str, x: it.transform[4], y: it.transform[5] }));
    items.sort((a,b)=> b.y - a.y || a.x - b.x);
    let lines = [], currentLine = [], lastY = null;
    const TOL = 2;
    items.forEach(it=>{
      if(lastY===null || Math.abs(it.y - lastY) <= TOL){ currentLine.push(it); }
      else { lines.push(currentLine); currentLine = [it]; }
      lastY = it.y;
    });
    if(currentLine.length) lines.push(currentLine);
    const pageText = lines.map(line => line.map(x=>x.str).join(' ').replace(/\s+/g,' ').trim()).join('\n');
    fullText += pageText + '\n';
  }
  return fullText;
}

function brDateToIso(d){ const p = d.split('/'); return p.length===3 ? `${p[2]}-${p[1]}-${p[0]}` : ''; }

function extractHeaderInfo(text){
  const fornecedorMatch = text.match(/RECEBEMOS DE\s+([\s\S]+?)\s+OS PRODUTOS/i)
    || text.match(/IDENTIFICA[ÇC][ÃA]O DO EMITENTE\s*\n\s*([^\n]+)/i);
  const nfMatch = text.match(/N[ºo]\.?\s*([\d.]{6,15})/i);
  const dataMatch = text.match(/EMISS[ÃA]O:?\s*(\d{2}\/\d{2}\/\d{4})/i) || text.match(/DATA DA EMISS[ÃA]O\s*\n?\s*(\d{2}\/\d{2}\/\d{4})/i);
  const valorMatch = text.match(/VALOR TOTAL:?\s*R\$\s*([\d.,]+)/i);
  return {
    fornecedor: fornecedorMatch ? fornecedorMatch[1].replace(/\s+/g,' ').trim() : '',
    nf: nfMatch ? nfMatch[1].trim() : '',
    data: dataMatch ? brDateToIso(dataMatch[1]) : '',
    valorTotal: valorMatch ? parseBRNumber(valorMatch[1]) : null,
  };
}

function mapUnidadeNF(u){
  const map = {UN:'UN', KG:'KG', KGM:'KG', CX:'CX', LT:'L', LITRO:'L', L:'L', G:'G', GR:'G', PCT:'PCT', PC:'UN', PC1:'UN'};
  return map[(u||'').toUpperCase()] || 'UN';
}

function parseNFItems(text){
  const sectionMatch = text.match(/DADOS DOS PRODUTOS[\s\S]*?(?=DADOS ADICIONAIS|INFORMA[ÇC][ÕO]ES COMPLEMENTARES|RESERVADO AO FISCO|$)/i);
  const section = sectionMatch ? sectionMatch[0] : text;
  // Cada item: [texto livre com descrição+código] NCM(8díg) CST CFOP(4díg) UN QUANT VALOR_UNIT VALOR_TOTAL
  const itemRegex = /([\s\S]*?)(\d{8})\s+(\d\/\d{2}|\d{2,3})\s+(\d{4})\s+([A-Z]{1,4}\d{0,1})\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/g;
  const items = [];
  let m;
  while((m = itemRegex.exec(section)) !== null){
    let preChunk = m[1].replace(/V?BCFCP:[\s\S]*?VFCP:\s*[\d.,]+/gi, '\n');
    const lines = preChunk.split(/\n/).map(l=>l.trim()).filter(Boolean);
    const lastLine = lines.length ? lines[lines.length-1] : '';
    let codigo = '', descricao = lastLine;
    const mTrail = lastLine.match(/^(.*\D)?(\d{3,8})\s*$/);
    const mLead = lastLine.match(/^(\d{3,8})\s+(.*)$/);
    if(mTrail && mTrail[2] && mTrail[1] && mTrail[1].trim()){
      codigo = mTrail[2]; descricao = mTrail[1].trim();
    } else if(mLead){
      codigo = mLead[1]; descricao = mLead[2].trim();
    }
    descricao = descricao.replace(/\s+/g,' ').trim();
    if(!descricao || descricao.length<3) continue; // provavelmente sobra de cabeçalho, não um item de verdade
    items.push({
      codigoNF: codigo, descricao,
      unidade: m[5], quantidade: parseBRNumber(m[6]), valorUnitario: parseBRNumber(m[7]), valorTotal: parseBRNumber(m[8]),
    });
  }
  return items;
}

function normalizeName(s){
  return (s||'').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^A-Z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
}
function findMatchingProduto(desc){
  const norm = normalizeName(desc);
  if(!norm) return null;
  let exact = db.brutos.find(b=>normalizeName(b.nome)===norm);
  if(exact) return {produto:exact, score:100};
  let partial = db.brutos.find(b=>{
    const bn = normalizeName(b.nome);
    return bn.length>2 && (norm.includes(bn) || bn.includes(norm));
  });
  return partial ? {produto:partial, score:60} : null;
}

function handleNFFile(file){
  const statusEl = document.getElementById('nfStatus');
  if(statusEl){ statusEl.textContent = 'Carregando leitor de PDF...'; statusEl.className='hint'; }
  loadPdfJS(async ()=>{
    try{
      if(statusEl) statusEl.textContent = 'Lendo o PDF...';
      const arrayBuffer = await file.arrayBuffer();
      const text = await extractPdfText(window.pdfjsLib, arrayBuffer);
      const header = extractHeaderInfo(text);
      const itensRaw = parseNFItems(text);
      const itens = itensRaw.map(it=>{
        const match = findMatchingProduto(it.descricao);
        return {
          descricao: it.descricao, quantidade: it.quantidade, valorUnitario: it.valorUnitario,
          incluir: true, matchProdutoNome: match ? match.produto.nome : '', novoProduto: !match,
          novaCategoria: 'Outros', novaUnidade: mapUnidadeNF(it.unidade), novoMinimo: 0, novaValidadeDias: 0,
        };
      });
      nfImport = { fileName: file.name, rawText: text, header, itens };
      render();
    }catch(err){
      if(statusEl){ statusEl.textContent = 'Erro ao ler o PDF: ' + err.message; statusEl.className='hint warn'; }
      else alert('Erro ao ler o PDF: ' + err.message);
    }
  });
}

function updateNFRowTotal(i){
  const cell = document.querySelector(`.nfTotalCell[data-i="${i}"]`);
  if(cell) cell.textContent = fmtMoney(nfImport.itens[i].quantidade * nfImport.itens[i].valorUnitario);
}

function renderImportarNF(){
  const c = document.getElementById('content');
  let html = `<h1 class="pagetitle">Importar Nota Fiscal (PDF)</h1><p class="pagesub">Envie o PDF da nota fiscal eletrônica (NF-e/DANFE) para ler os produtos automaticamente e lançar a entrada na Central.</p>`;

  html += `<div class="card"><h2>1. Selecione o PDF</h2>
    <div class="field" style="max-width:420px">
      <label>Arquivo da Nota Fiscal (.pdf)</label>
      <input type="file" id="inputNF" accept="application/pdf,.pdf">
    </div>
    <div id="nfStatus" class="hint">${nfImport ? `Nota lida: <strong>${escapeHtml(nfImport.fileName)}</strong> — ${nfImport.itens.length} item(ns) encontrado(s).` : ''}</div>
  </div>`;

  if(nfImport){
    html += `<div class="card"><h2>2. Confira os dados da nota</h2>
      <div class="entryform">
        <div class="field"><label>Fornecedor</label><input type="text" id="nfFornecedor" value="${escapeHtml(nfImport.header.fornecedor)}"></div>
        <div class="field"><label>Nº da NF</label><input type="text" id="nfNumero" value="${escapeHtml(nfImport.header.nf)}"></div>
        <div class="field"><label>Data de Emissão</label><input type="date" id="nfData" value="${nfImport.header.data||''}"></div>
      </div>
    </div>`;

    html += `<div class="card"><h2>3. Itens Encontrados (${nfImport.itens.length})</h2>`;
    if(nfImport.itens.length===0){
      html += `<div class="empty">Não conseguimos identificar os itens automaticamente nesta nota. Veja o texto extraído abaixo e lance manualmente na aba Entrada na Central.</div>`;
    } else {
      html += `<table><thead><tr><th></th><th>Descrição (da nota)</th><th>Quantidade</th><th>Valor Unit.</th><th>Valor Total</th><th>Produto no Cadastro</th></tr></thead><tbody>`;
      nfImport.itens.forEach((item, i)=>{
        html += `<tr>
          <td><input type="checkbox" class="nfIncluir" data-i="${i}" ${item.incluir?'checked':''}></td>
          <td><input type="text" class="nfDesc" data-i="${i}" value="${escapeHtml(item.descricao)}" style="width:220px"></td>
          <td><input type="number" step="0.01" class="nfQtd" data-i="${i}" value="${item.quantidade}" style="width:80px"></td>
          <td><input type="number" step="0.01" class="nfPreco" data-i="${i}" value="${item.valorUnitario}" style="width:90px"></td>
          <td class="nfTotalCell" data-i="${i}">${fmtMoney(item.quantidade*item.valorUnitario)}</td>
          <td>
            <select class="nfProduto" data-i="${i}">
              ${nomesOrdenados(db.brutos).map(nome=>`<option value="${escapeHtml(nome)}" ${item.matchProdutoNome===nome && !item.novoProduto?'selected':''}>${escapeHtml(nome)}</option>`).join('')}
              <option value="__novo__" ${item.novoProduto?'selected':''}>+ Cadastrar como novo produto</option>
            </select>
          </td>
        </tr>`;
        if(item.novoProduto){
          html += `<tr><td></td><td colspan="5">
            <div class="entryform" style="background:var(--gold-lighter);padding:10px;border-radius:6px">
              <div class="field"><label>Categoria</label><select class="nfNovaCategoria" data-i="${i}">${categoriaOptions().map(cat=>`<option ${item.novaCategoria===cat?'selected':''}>${cat}</option>`).join('')}</select></div>
              <div class="field"><label>Unidade</label><select class="nfNovaUnidade" data-i="${i}">${UNIDADES.map(u=>`<option ${item.novaUnidade===u?'selected':''}>${u}</option>`).join('')}</select></div>
              <div class="field"><label>Estoque Mínimo</label><input type="number" step="0.01" class="nfNovoMinimo" data-i="${i}" value="${item.novoMinimo}"></div>
              <div class="field"><label>Validade Padrão (dias)</label><input type="number" class="nfNovaValidade" data-i="${i}" value="${item.novaValidadeDias}"></div>
            </div>
          </td></tr>`;
        }
      });
      html += `</tbody></table>`;
      html += `<div style="margin-top:16px"><button class="btn" id="btnConfirmarNF">✓ Confirmar e Lançar no Estoque</button></div>`;
    }
    html += `</div>`;

    html += `<div class="card"><h3 style="margin-top:0">Texto extraído do PDF (conferência)</h3>
      <button class="btn secondary" id="btnToggleRaw">Mostrar/Ocultar texto extraído</button>
      <pre id="nfRawText" style="display:none;white-space:pre-wrap;font-size:11.5px;background:var(--gray-bg);padding:12px;border-radius:6px;margin-top:10px;max-height:400px;overflow:auto">${escapeHtml(nfImport.rawText)}</pre>
    </div>`;
  }

  c.innerHTML = html;

  const inputNF = c.querySelector('#inputNF');
  if(inputNF) inputNF.addEventListener('change', (e)=>{ const f=e.target.files[0]; if(f) handleNFFile(f); });
  if(!nfImport) return;

  c.querySelector('#nfFornecedor')?.addEventListener('input', e=> nfImport.header.fornecedor = e.target.value);
  c.querySelector('#nfNumero')?.addEventListener('input', e=> nfImport.header.nf = e.target.value);
  c.querySelector('#nfData')?.addEventListener('input', e=> nfImport.header.data = e.target.value);
  c.querySelector('#btnToggleRaw')?.addEventListener('click', ()=>{
    const pre = c.querySelector('#nfRawText'); pre.style.display = pre.style.display==='none' ? 'block' : 'none';
  });

  c.querySelectorAll('.nfIncluir').forEach(el=> el.addEventListener('change', e=>{ nfImport.itens[+e.target.dataset.i].incluir = e.target.checked; }));
  c.querySelectorAll('.nfDesc').forEach(el=> el.addEventListener('input', e=>{ nfImport.itens[+e.target.dataset.i].descricao = e.target.value; }));
  c.querySelectorAll('.nfQtd').forEach(el=> el.addEventListener('input', e=>{
    const i=+e.target.dataset.i; nfImport.itens[i].quantidade = parseFloat(e.target.value)||0; updateNFRowTotal(i);
  }));
  c.querySelectorAll('.nfPreco').forEach(el=> el.addEventListener('input', e=>{
    const i=+e.target.dataset.i; nfImport.itens[i].valorUnitario = parseFloat(e.target.value)||0; updateNFRowTotal(i);
  }));
  c.querySelectorAll('.nfProduto').forEach(el=> el.addEventListener('change', e=>{
    const i=+e.target.dataset.i; const v = e.target.value;
    if(v==='__novo__'){ nfImport.itens[i].novoProduto = true; nfImport.itens[i].matchProdutoNome=''; }
    else { nfImport.itens[i].novoProduto = false; nfImport.itens[i].matchProdutoNome = v; }
    render();
  }));
  c.querySelectorAll('.nfNovaCategoria').forEach(el=> el.addEventListener('change', e=>{ nfImport.itens[+e.target.dataset.i].novaCategoria = e.target.value; }));
  c.querySelectorAll('.nfNovaUnidade').forEach(el=> el.addEventListener('change', e=>{ nfImport.itens[+e.target.dataset.i].novaUnidade = e.target.value; }));
  c.querySelectorAll('.nfNovoMinimo').forEach(el=> el.addEventListener('input', e=>{ nfImport.itens[+e.target.dataset.i].novoMinimo = parseFloat(e.target.value)||0; }));
  c.querySelectorAll('.nfNovaValidade').forEach(el=> el.addEventListener('input', e=>{ nfImport.itens[+e.target.dataset.i].novaValidadeDias = parseFloat(e.target.value)||0; }));

  c.querySelector('#btnConfirmarNF')?.addEventListener('click', ()=>{
    const header = nfImport.header;
    if(!header.data){ alert('Informe a data de emissão da nota.'); return; }
    let count = 0;
    nfImport.itens.forEach(item=>{
      if(!item.incluir) return;
      let nomeProduto = item.novoProduto ? item.descricao.trim() : item.matchProdutoNome;
      if(!nomeProduto) return;
      if(item.novoProduto && !db.brutos.some(b=>b.nome.toLowerCase()===nomeProduto.toLowerCase())){
        db.brutos.push({
          nome: nomeProduto, categoria: item.novaCategoria||'Outros', unidade: item.novaUnidade||'UN',
          estoqueMinimo: item.novoMinimo||0, fornecedor: header.fornecedor||'', precoMedio: item.valorUnitario||0,
          validadeDias: item.novaValidadeDias||0,
        });
      }
      const prodCad = db.brutos.find(b=>b.nome===nomeProduto);
      let validade = '';
      if(prodCad && header.data){
        const d = new Date(header.data+'T00:00:00'); d.setDate(d.getDate()+Number(prodCad.validadeDias||0));
        validade = d.toISOString().slice(0,10);
      }
      db.entradasCentral.push({
        data: header.data, nf: header.nf||'', produto: nomeProduto, fornecedor: header.fornecedor||'',
        quantidade: item.quantidade, precoUnitario: item.valorUnitario, validade,
      });
      count++;
    });
    saveDB();
    alert(count>0 ? `${count} item(ns) lançado(s) na Entrada da Central com sucesso!` : 'Nenhum item marcado para lançamento.');
    if(count>0){ nfImport = null; currentTab = 'entradasCentral'; }
    render();
  });
}

/* ============================= IMPORTAR NOTA FISCAL (XML) ============================= */
let xmlImport = null; // {fileName, rawText, header:{fornecedor,nf,data}, itens:[...]}

function xmlNum(value){
  if(value==null || value==='') return 0;
  const s = String(value).trim();
  if(s.includes(',') && s.includes('.')) return parseBRNumber(s);
  return Number(s.replace(',','.')) || 0;
}
function xmlTagText(parent, tag){
  const el = parent ? parent.getElementsByTagName(tag)[0] : null;
  return el ? (el.textContent || '').trim() : '';
}
function parseXmlDate(value){
  if(!value) return '';
  const m = String(value).match(/\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : '';
}
function parseNFeXml(text){
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const parseError = doc.getElementsByTagName('parsererror')[0];
  if(parseError) throw new Error('XML inválido ou mal formatado.');
  const inf = doc.getElementsByTagName('infNFe')[0] || doc;
  const ide = inf.getElementsByTagName('ide')[0];
  const emit = inf.getElementsByTagName('emit')[0];
  const header = {
    fornecedor: xmlTagText(emit, 'xNome') || xmlTagText(emit, 'xFant'),
    nf: xmlTagText(ide, 'nNF'),
    data: parseXmlDate(xmlTagText(ide, 'dhEmi') || xmlTagText(ide, 'dEmi')),
  };
  const itens = Array.from(inf.getElementsByTagName('det')).map(det=>{
    const prod = det.getElementsByTagName('prod')[0];
    const descricao = xmlTagText(prod, 'xProd');
    const quantidade = xmlNum(xmlTagText(prod, 'qCom') || xmlTagText(prod, 'qTrib'));
    const valorUnitario = xmlNum(xmlTagText(prod, 'vUnCom') || xmlTagText(prod, 'vUnTrib'));
    return {
      codigoNF: xmlTagText(prod, 'cProd'),
      descricao,
      unidade: xmlTagText(prod, 'uCom') || xmlTagText(prod, 'uTrib') || 'UN',
      quantidade,
      valorUnitario,
      valorTotal: xmlNum(xmlTagText(prod, 'vProd')),
    };
  }).filter(item=>item.descricao && item.quantidade>0);
  return { header, itens };
}
function xmlImportItemFromRaw(it){
  const match = findMatchingProduto(it.descricao);
  return {
    descricao: it.descricao,
    quantidade: it.quantidade,
    valorUnitario: it.valorUnitario,
    incluir: true,
    matchProdutoNome: match ? match.produto.nome : '',
    novoProduto: !match,
    novaCategoria: 'Outros',
    novaUnidade: mapUnidadeNF(it.unidade),
    novoMinimo: 0,
    novaValidadeDias: 0,
  };
}
async function handleXMLFile(file){
  const statusEl = document.getElementById('xmlStatus');
  try{
    if(statusEl){ statusEl.textContent = 'Lendo o XML...'; statusEl.className='hint'; }
    const text = await file.text();
    const parsed = parseNFeXml(text);
    xmlImport = {
      fileName: file.name,
      rawText: text,
      header: parsed.header,
      itens: parsed.itens.map(xmlImportItemFromRaw),
    };
    render();
  }catch(err){
    if(statusEl){ statusEl.textContent = 'Erro ao ler o XML: ' + err.message; statusEl.className='hint warn'; }
    else alert('Erro ao ler o XML: ' + err.message);
  }
}
function updateXMLRowTotal(i){
  const cell = document.querySelector(`.xmlTotalCell[data-i="${i}"]`);
  if(cell) cell.textContent = fmtMoney(xmlImport.itens[i].quantidade * xmlImport.itens[i].valorUnitario);
}
function notaFiscalKey(nf){
  const raw = String(nf||'').trim();
  const digits = raw.replace(/\D/g,'').replace(/^0+/,'');
  return digits || normalizeName(raw);
}
function findNotaJaLancada(header){
  const key = notaFiscalKey(header && header.nf);
  if(!key) return null;
  const fornecedorKey = normalizeName(header && header.fornecedor);
  const rows = (db.entradasCentral||[]).filter(e=>{
    if(notaFiscalKey(e.nf) !== key) return false;
    const entradaFornecedor = normalizeName(e.fornecedor);
    return fornecedorKey && entradaFornecedor ? entradaFornecedor === fornecedorKey : true;
  });
  if(rows.length===0) return null;
  const ordenadas = [...rows].sort((a,b)=>String(a.data||'').localeCompare(String(b.data||'')));
  const first = ordenadas[0];
  const produtos = [...new Set(rows.map(r=>r.produto).filter(Boolean))].slice(0,4);
  return {
    nf: first.nf || (header && header.nf) || '',
    fornecedor: first.fornecedor || (header && header.fornecedor) || '',
    data: first.data || '',
    itens: rows.length,
    produtos,
  };
}
function avisoNotaDuplicadaHtml(duplicada){
  if(!duplicada) return '';
  const produtos = duplicada.produtos.length ? ` Produtos encontrados: ${duplicada.produtos.map(escapeHtml).join(', ')}${duplicada.itens>duplicada.produtos.length?'...':''}` : '';
  return `<div class="msg-ok" style="margin:0 0 18px;background:var(--amber-bg);color:var(--amber);border-color:rgba(138,94,0,.22)">
    Nota fiscal já importada e concluída no sistema. NF <strong>${escapeHtml(duplicada.nf||'sem número')}</strong>${duplicada.fornecedor ? ` de <strong>${escapeHtml(duplicada.fornecedor)}</strong>` : ''} já consta na Entrada da Central${duplicada.data ? ` em <strong>${fmtDate(duplicada.data)}</strong>` : ''}. Esta importação foi bloqueada para evitar duplicidade.${produtos}
  </div>`;
}
function renderImportarXML(){
  const c = document.getElementById('content');
  const notaDuplicada = xmlImport ? findNotaJaLancada(xmlImport.header) : null;
  let html = `<h1 class="pagetitle">Importar Nota Fiscal (XML) <span class="beta-note">BETA EM TESTES</span></h1>
    <p class="pagesub">Envie o XML da NF-e para testar a leitura automática de itens, quantidade e preço de custo. A parte financeira/fiscal completa ainda não entra neste fluxo.</p>`;

  html += `<div class="card"><h2>1. Selecione o XML</h2>
    <div class="field" style="max-width:420px">
      <label>Arquivo da Nota Fiscal (.xml)</label>
      <input type="file" id="inputXML" accept="text/xml,application/xml,.xml">
    </div>
    <div id="xmlStatus" class="hint">${xmlImport ? `XML lido: <strong>${escapeHtml(xmlImport.fileName)}</strong> — ${xmlImport.itens.length} item(ns) encontrado(s).` : 'Campo em beta: confira os itens antes de lançar.'}</div>
  </div>`;

  if(xmlImport){
    html += `<div class="card"><h2>2. Confira os dados da nota</h2>
      <div class="entryform">
        <div class="field"><label>Fornecedor</label><input type="text" id="xmlFornecedor" value="${escapeHtml(xmlImport.header.fornecedor)}"></div>
        <div class="field"><label>Nº da NF</label><input type="text" id="xmlNumero" value="${escapeHtml(xmlImport.header.nf)}"></div>
        <div class="field"><label>Data de Emissão</label><input type="date" id="xmlData" value="${xmlImport.header.data||''}"></div>
      </div>
    </div>`;
    html += avisoNotaDuplicadaHtml(notaDuplicada);

    html += `<div class="card"><h2>3. Itens Encontrados (${xmlImport.itens.length})</h2>`;
    if(xmlImport.itens.length===0){
      html += `<div class="empty">Não encontramos itens compatíveis com NF-e neste XML. Confira o arquivo e tente novamente.</div>`;
    } else {
      html += `<table><thead><tr><th></th><th>Item no XML</th><th>Quantidade</th><th>Preço de Custo</th><th>Total</th><th>Produto no Cadastro</th></tr></thead><tbody>`;
      xmlImport.itens.forEach((item, i)=>{
        html += `<tr>
          <td><input type="checkbox" class="xmlIncluir" data-i="${i}" ${item.incluir?'checked':''}></td>
          <td><input type="text" class="xmlDesc" data-i="${i}" value="${escapeHtml(item.descricao)}" style="width:220px"></td>
          <td><input type="number" step="0.01" class="xmlQtd" data-i="${i}" value="${item.quantidade}" style="width:80px"></td>
          <td><input type="number" step="0.01" class="xmlPreco" data-i="${i}" value="${item.valorUnitario}" style="width:90px"></td>
          <td class="xmlTotalCell" data-i="${i}">${fmtMoney(item.quantidade*item.valorUnitario)}</td>
          <td>
            <select class="xmlProduto" data-i="${i}">
              ${nomesOrdenados(db.brutos).map(nome=>`<option value="${escapeHtml(nome)}" ${item.matchProdutoNome===nome && !item.novoProduto?'selected':''}>${escapeHtml(nome)}</option>`).join('')}
              <option value="__novo__" ${item.novoProduto?'selected':''}>+ Cadastrar como novo produto</option>
            </select>
          </td>
        </tr>`;
        if(item.novoProduto){
          html += `<tr><td></td><td colspan="5">
            <div class="entryform" style="background:var(--gold-lighter);padding:10px;border-radius:6px">
              <div class="field"><label>Categoria</label><select class="xmlNovaCategoria" data-i="${i}">${categoriaOptions().map(cat=>`<option ${item.novaCategoria===cat?'selected':''}>${cat}</option>`).join('')}</select></div>
              <div class="field"><label>Unidade</label><select class="xmlNovaUnidade" data-i="${i}">${UNIDADES.map(u=>`<option ${item.novaUnidade===u?'selected':''}>${u}</option>`).join('')}</select></div>
              <div class="field"><label>Estoque Mínimo</label><input type="number" step="0.01" class="xmlNovoMinimo" data-i="${i}" value="${item.novoMinimo}"></div>
              <div class="field"><label>Validade Padrão (dias)</label><input type="number" class="xmlNovaValidade" data-i="${i}" value="${item.novaValidadeDias}"></div>
            </div>
          </td></tr>`;
        }
      });
      html += `</tbody></table>`;
      html += `<div style="margin-top:16px"><button class="btn" id="btnConfirmarXML" ${notaDuplicada?'disabled title="Nota já importada"':''}>Confirmar e Lançar no Estoque</button></div>`;
    }
    html += `</div>`;

    html += `<div class="card"><h3 style="margin-top:0">XML lido (conferência)</h3>
      <button class="btn secondary" id="btnToggleXMLRaw">Mostrar/Ocultar XML</button>
      <pre id="xmlRawText" style="display:none;white-space:pre-wrap;font-size:11.5px;background:var(--gray-bg);padding:12px;border-radius:6px;margin-top:10px;max-height:400px;overflow:auto">${escapeHtml(xmlImport.rawText)}</pre>
    </div>`;
  }

  c.innerHTML = html;
  const inputXML = c.querySelector('#inputXML');
  if(inputXML) inputXML.addEventListener('change', (e)=>{ const f=e.target.files[0]; if(f) handleXMLFile(f); });
  if(!xmlImport) return;

  c.querySelector('#xmlFornecedor')?.addEventListener('change', e=>{ xmlImport.header.fornecedor = e.target.value; render(); });
  c.querySelector('#xmlNumero')?.addEventListener('change', e=>{ xmlImport.header.nf = e.target.value; render(); });
  c.querySelector('#xmlData')?.addEventListener('input', e=> xmlImport.header.data = e.target.value);
  c.querySelector('#btnToggleXMLRaw')?.addEventListener('click', ()=>{
    const pre = c.querySelector('#xmlRawText'); pre.style.display = pre.style.display==='none' ? 'block' : 'none';
  });
  c.querySelectorAll('.xmlIncluir').forEach(el=> el.addEventListener('change', e=>{ xmlImport.itens[+e.target.dataset.i].incluir = e.target.checked; }));
  c.querySelectorAll('.xmlDesc').forEach(el=> el.addEventListener('input', e=>{ xmlImport.itens[+e.target.dataset.i].descricao = e.target.value; }));
  c.querySelectorAll('.xmlQtd').forEach(el=> el.addEventListener('input', e=>{ const i=+e.target.dataset.i; xmlImport.itens[i].quantidade = parseFloat(e.target.value)||0; updateXMLRowTotal(i); }));
  c.querySelectorAll('.xmlPreco').forEach(el=> el.addEventListener('input', e=>{ const i=+e.target.dataset.i; xmlImport.itens[i].valorUnitario = parseFloat(e.target.value)||0; updateXMLRowTotal(i); }));
  c.querySelectorAll('.xmlProduto').forEach(el=> el.addEventListener('change', e=>{
    const i=+e.target.dataset.i; const v = e.target.value;
    if(v==='__novo__'){ xmlImport.itens[i].novoProduto = true; xmlImport.itens[i].matchProdutoNome=''; }
    else { xmlImport.itens[i].novoProduto = false; xmlImport.itens[i].matchProdutoNome = v; }
    render();
  }));
  c.querySelectorAll('.xmlNovaCategoria').forEach(el=> el.addEventListener('change', e=>{ xmlImport.itens[+e.target.dataset.i].novaCategoria = e.target.value; }));
  c.querySelectorAll('.xmlNovaUnidade').forEach(el=> el.addEventListener('change', e=>{ xmlImport.itens[+e.target.dataset.i].novaUnidade = e.target.value; }));
  c.querySelectorAll('.xmlNovoMinimo').forEach(el=> el.addEventListener('input', e=>{ xmlImport.itens[+e.target.dataset.i].novoMinimo = parseFloat(e.target.value)||0; }));
  c.querySelectorAll('.xmlNovaValidade').forEach(el=> el.addEventListener('input', e=>{ xmlImport.itens[+e.target.dataset.i].novaValidadeDias = parseFloat(e.target.value)||0; }));

  c.querySelector('#btnConfirmarXML')?.addEventListener('click', ()=>{
    if(!ensureCanEdit()) return;
    const header = xmlImport.header;
    if(!header.data){ alert('Informe a data de emissão da nota.'); return; }
    const duplicada = findNotaJaLancada(header);
    if(duplicada){
      alert(`Importação bloqueada: a NF ${duplicada.nf || header.nf} já foi importada e concluída no sistema${duplicada.data ? ` em ${fmtDate(duplicada.data)}` : ''}.`);
      render();
      return;
    }
    let count = 0;
    xmlImport.itens.forEach(item=>{
      if(!item.incluir) return;
      let nomeProduto = item.novoProduto ? item.descricao.trim() : item.matchProdutoNome;
      if(!nomeProduto) return;
      if(item.novoProduto && !db.brutos.some(b=>b.nome.toLowerCase()===nomeProduto.toLowerCase())){
        db.brutos.push({
          nome: nomeProduto, categoria: item.novaCategoria||'Outros', unidade: item.novaUnidade||'UN',
          estoqueMinimo: item.novoMinimo||0, fornecedor: header.fornecedor||'', precoMedio: item.valorUnitario||0,
          validadeDias: item.novaValidadeDias||0,
        });
      }
      const prodCad = db.brutos.find(b=>b.nome===nomeProduto);
      let validade = '';
      if(prodCad && header.data){
        const d = new Date(header.data+'T00:00:00'); d.setDate(d.getDate()+Number(prodCad.validadeDias||0));
        validade = d.toISOString().slice(0,10);
      }
      db.entradasCentral.push({
        data: header.data, nf: header.nf||'', produto: nomeProduto, fornecedor: header.fornecedor||'',
        quantidade: item.quantidade, precoUnitario: item.valorUnitario, validade,
      });
      count++;
    });
    saveDB();
    alert(count>0 ? `${count} item(ns) lançado(s) na Entrada da Central com sucesso!` : 'Nenhum item marcado para lançamento.');
    if(count>0){ xmlImport = null; currentTab = 'entradasCentral'; }
    render();
  });
}

/* ============================= SEGURANÇA (SENHA LOCAL) =============================
   Isso é um filtro simples contra acesso casual/curioso, feito só de HTML+JS local — não é
   criptografia nem controle de acesso de verdade. Qualquer pessoa com conhecimento técnico
   (abrir o F12 e olhar o localStorage) ainda consegue ver os dados. Deixamos isso bem claro
   pro usuário na tela de configuração. */
const LOCK_KEY = "estoqueFranCasarinDB_v1_lock";

async function hashText(t){
  try{
    if(window.crypto && window.crypto.subtle && window.TextEncoder){
      const enc = new TextEncoder().encode(t);
      const buf = await window.crypto.subtle.digest('SHA-256', enc);
      return 'sha256_' + Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
    }
  }catch(e){}
  // Fallback simples para navegadores/contextos sem Web Crypto disponível — ainda funciona
  // como filtro básico, só não usa um hash criptográfico de verdade.
  let h = 0;
  for(let i=0;i<t.length;i++){ h = ((h<<5)-h+t.charCodeAt(i))|0; }
  return 'fallback_' + h;
}

function getLockConfig(){
  try{ return JSON.parse(localStorage.getItem(LOCK_KEY) || 'null'); }catch(e){ return null; }
}
function setLockConfig(cfg){
  try{
    if(cfg) localStorage.setItem(LOCK_KEY, JSON.stringify(cfg));
    else localStorage.removeItem(LOCK_KEY);
  }catch(e){}
}

let appUnlocked = false;

function showLockScreen(){
  document.getElementById('lockScreen').classList.add('show');
  const input = document.getElementById('lockPasswordInput');
  setTimeout(()=> input && input.focus(), 50);
}
function hideLockScreen(){
  document.getElementById('lockScreen').classList.remove('show');
}

async function initLock(){
  const cfg = getLockConfig();
  if(!cfg || !cfg.hash){ appUnlocked = true; render(); return; }
  showLockScreen();
}

document.getElementById('lockForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const input = document.getElementById('lockPasswordInput');
  const errBox = document.getElementById('lockError');
  const cfg = getLockConfig();
  const typedHash = await hashText(input.value);
  if(cfg && typedHash === cfg.hash){
    appUnlocked = true;
    hideLockScreen();
    input.value = '';
    errBox.textContent = '';
    render();
  } else {
    errBox.textContent = 'Senha incorreta. Tente novamente.';
    input.value = '';
    input.focus();
  }
});

document.getElementById('lockForgotBtn').addEventListener('click', ()=>{
  const ok = confirm(
    "Isso remove a senha atual sem precisar dela. Use só se for você mesmo (dono/responsável) — " +
    "essa senha é apenas um filtro contra acesso casual, então recuperar assim é esperado. " +
    "Depois de entrar, você pode cadastrar uma senha nova em Sistema > Segurança.\n\nRemover a senha e continuar?"
  );
  if(!ok) return;
  setLockConfig(null);
  appUnlocked = true;
  hideLockScreen();
  render();
});

function renderSeguranca(){
  const c = document.getElementById('content');
  const cfg = getLockConfig();
  const temSenha = !!(cfg && cfg.hash);

  let html = `<h1 class="pagetitle">Segurança</h1><p class="pagesub">Filtro de senha local para abrir o sistema neste navegador.</p>`;

  html += `<div class="card"><h2>Como isso funciona</h2>
    <p class="footnote" style="font-size:12.5px">
      Essa senha é um filtro simples para evitar que alguém abra o sistema por acaso — ela <strong>não</strong> criptografa
      os dados nem impede acesso técnico avançado (qualquer pessoa que souber usar as ferramentas do navegador ainda
      consegue ver os dados salvos). Ela vale só para este navegador/computador — não é enviada a nenhum servidor e
      não viaja junto com os arquivos de Backup. Configure uma senha por computador, se quiser.
    </p>
  </div>`;

  if(temSenha){
    html += `<div class="card"><h2>Senha ativada ✓</h2>
      <p class="pagesub" style="margin-bottom:16px">O sistema vai pedir essa senha toda vez que for aberto neste navegador.</p>
      <form class="entryform" id="formTrocarSenha">
        <div class="field"><label>Nova senha</label><input type="password" name="novaSenha" autocomplete="off"></div>
        <div class="field"><label>Confirmar nova senha</label><input type="password" name="confirmarSenha" autocomplete="off"></div>
        <div class="field"><label>&nbsp;</label><button type="submit" class="btn">Trocar Senha</button></div>
      </form>
      <div id="segErro" class="hint warn" style="margin-top:8px"></div>
      <p class="footnote"><button type="button" class="linkbtn" id="btnRemoverSenha">Remover senha e deixar o acesso livre</button></p>
    </div>`;
  } else {
    html += `<div class="card"><h2>Nenhuma senha configurada</h2>
      <p class="pagesub" style="margin-bottom:16px">O sistema abre direto, sem pedir nada. Cadastre uma senha abaixo se quiser um filtro básico contra acesso casual.</p>
      <form class="entryform" id="formTrocarSenha">
        <div class="field"><label>Nova senha</label><input type="password" name="novaSenha" autocomplete="off"></div>
        <div class="field"><label>Confirmar nova senha</label><input type="password" name="confirmarSenha" autocomplete="off"></div>
        <div class="field"><label>&nbsp;</label><button type="submit" class="btn">Ativar Senha</button></div>
      </form>
      <div id="segErro" class="hint warn" style="margin-top:8px"></div>
    </div>`;
  }

  c.innerHTML = html;

  c.querySelector('#formTrocarSenha').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const form = e.target;
    const nova = form.querySelector('[name=novaSenha]').value;
    const confirmar = form.querySelector('[name=confirmarSenha]').value;
    const errBox = document.getElementById('segErro');
    if(!nova || nova.length < 4){ errBox.textContent = 'Use uma senha com pelo menos 4 caracteres.'; return; }
    if(nova !== confirmar){ errBox.textContent = 'As senhas não coincidem.'; return; }
    const hash = await hashText(nova);
    setLockConfig({ hash });
    errBox.textContent = '';
    alert('Senha salva com sucesso.');
    render();
  });

  const btnRemover = c.querySelector('#btnRemoverSenha');
  if(btnRemover){
    btnRemover.addEventListener('click', ()=>{
      if(confirm('Remover a senha? O sistema vai abrir direto, sem pedir nada, neste navegador.')){
        setLockConfig(null);
        render();
      }
    });
  }
}

/* ============================= INIT ============================= */
initLock();
