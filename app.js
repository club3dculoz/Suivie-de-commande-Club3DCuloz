const SUPABASE_URL = 'https://filsjhmddwnckqelkrum.supabase.co';
const SUPABASE_KEY = 'sb_publishable_JoynKbQ-C8Zia60gXVMXXw_65-8adFk';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

// NAVIGATION
document.querySelectorAll('.tab').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
    button.classList.add('active');
    $(button.dataset.page).classList.add('active');
  });
});

// STOCK
const stockList = $('stock-list');
const stockModal = $('modal');
const stockForm = $('stockForm');
const sf = {id:$('editId'),type:$('type'),carac:$('caracteristique'),couleur:$('couleur'),grammes:$('grammes'),prix:$('prix')};
let stockCache = [];

async function chargerStock() {
  const {data,error} = await db.from('Stock').select('*').order('id');
  if (error) { stockList.innerHTML = `<tr><td colspan="6" class="empty-cell">Erreur : ${esc(error.message)}</td></tr>`; return; }
  stockCache = data || [];
  stockList.innerHTML = stockCache.length ? stockCache.map(f => `
    <tr>
      <td><strong>${esc(f.Type)}</strong></td>
      <td>${esc(f.Caracteristique)}</td>
      <td><span class="color-name">${esc(f.Couleur)}</span></td>
      <td><span class="stock-grams ${Number(f.Grammes)<0?'negative-stock':''}">${esc(f.Grammes)} g</span></td>
      <td>${f.PrixParBobine == null ? '<span class="muted">Non renseigné</span>' : `${esc(f.PrixParBobine)} €`}</td>
      <td class="actions-cell"><button class="secondary" onclick="modifierStock(${f.id})">Modifier</button> <button class="danger" onclick="supprimerStock(${f.id})">Supprimer</button></td>
    </tr>`).join('') : '<tr><td colspan="6" class="empty-cell">Aucun filament dans le stock.</td></tr>';
}
function fermerStock(){ stockModal.classList.add('hidden'); stockForm.reset(); sf.id.value=''; }
$('addBtn').onclick = () => { fermerStock(); $('modalTitle').textContent='Ajouter un filament'; stockModal.classList.remove('hidden'); };
$('closeBtn').onclick = $('cancelBtn').onclick = fermerStock;
stockForm.onsubmit = async e => {
  e.preventDefault();
  const p={Type:sf.type.value.trim(),Caracteristique:sf.carac.value.trim(),Couleur:sf.couleur.value.trim(),Grammes:Number(sf.grammes.value),PrixParBobine:sf.prix.value===''?null:Number(sf.prix.value)};
  const {error}=await(sf.id.value?db.from('Stock').update(p).eq('id',sf.id.value):db.from('Stock').insert(p));
  if(error)return alert('Erreur : '+error.message); fermerStock(); await chargerStock();
};
window.modifierStock=async id=>{const {data,error}=await db.from('Stock').select('*').eq('id',id).single();if(error)return alert(error.message);sf.id.value=data.id;sf.type.value=data.Type??'';sf.carac.value=data.Caracteristique??'';sf.couleur.value=data.Couleur??'';sf.grammes.value=data.Grammes??'';sf.prix.value=data.PrixParBobine??'';$('modalTitle').textContent='Modifier le filament';stockModal.classList.remove('hidden');};
window.supprimerStock=async id=>{if(!confirm('Supprimer ce filament du stock ?'))return;const {error}=await db.from('Stock').delete().eq('id',id);if(error)return alert(error.message);await chargerStock();};

// COMMANDES
const orderList=$('order-list'), orderModal=$('orderModal'), orderForm=$('orderForm'), materialsList=$('materials-list');
const of={id:$('orderEditId'),commande:$('commande'),client:$('pourQui'),date:$('dateCommande'),lien:$('lienFichier'),taille:$('taille'),tempsHeures:$('tempsHeures'),tempsMinutes:$('tempsMinutes'),quantite:$('quantite'),prix:$('orderPrix'),statut:$('statut'),paye:$('paye')};
let materials=[];
let currentStockDeduit=false;

function tempsVersMinutes(){
  const h=Math.max(0,Number(of.tempsHeures.value)||0);
  const m=Math.max(0,Math.min(59,Number(of.tempsMinutes.value)||0));
  return h*60+m;
}
function afficherTemps(minutes){
  if(minutes==null || Number(minutes)<=0) return '-';
  const total=Number(minutes);
  const h=Math.floor(total/60);
  const m=total%60;
  if(h && m) return `${h} h ${m.toString().padStart(2,'0')}`;
  if(h) return `${h} h`;
  return `${m} min`;
}

function classeStatut(s){return s==='Imprimé'?'status-imprime':s==='Livré'?'status-livre':'status-faire';}
function stockLabel(s){return `${s.Type} · ${s.Caracteristique} · ${s.Couleur}`;}
function coutMatiere(m){if(m.mode!=='stock')return 0;const s=stockCache.find(x=>Number(x.id)===Number(m.stockId));if(!s||m.grammes===''||s.PrixParBobine==null)return 0;return Number(m.grammes)/1000*Number(s.PrixParBobine);}
function prixMatiere(){const brut=materials.reduce((a,m)=>a+coutMatiere(m),0);return brut>0?Math.max(0.50,brut):0;}
function refreshPrix(updateFinal=true){const p=prixMatiere();$('calculatedPrice').value=`${p.toFixed(2)} EUR`;if(updateFinal)of.prix.value=p.toFixed(2);const target=materialsList.querySelector('.material-summary .material-line strong:last-child');if(target)target.textContent=`${p.toFixed(2)} EUR`;}

function renderMaterials(){
  if(!materials.length){materialsList.innerHTML='<div class="material-empty">Aucune couleur ajoutée.</div>';refreshPrix(false);return;}
  materialsList.innerHTML=materials.map((m,i)=>m.mode==='text'?`
    <div class="material-row text-row"><input type="text" placeholder="Ex. détails en blanc" value="${esc(m.texte)}" oninput="updateMaterialText(${i},this.value)"><button type="button" class="material-remove" onclick="removeMaterial(${i})">Supprimer</button></div>`:`
    <div class="material-row"><select onchange="updateMaterialStock(${i},this.value)"><option value="">Choisir dans le stock</option>${stockCache.map(s=>`<option value="${s.id}" ${Number(s.id)===Number(m.stockId)?'selected':''}>${esc(stockLabel(s))}</option>`).join('')}</select><input type="number" step="1" placeholder="Grammes" value="${esc(m.grammes)}" oninput="updateMaterialGrams(${i},this.value)"><button type="button" class="material-remove" onclick="removeMaterial(${i})">Supprimer</button></div>`).join('')+`<div class="material-summary"><div class="material-line"><strong>Prix matière estimé</strong><strong>${prixMatiere().toFixed(2)} EUR</strong></div><div class="readonly-note">Calcul : grammes / 1000 × prix de la bobine, minimum 0,50 €.</div></div>`;
  refreshPrix(false);
}
window.updateMaterialText=(i,v)=>{materials[i].texte=v;};
window.updateMaterialStock=(i,v)=>{materials[i].stockId=v===''?null:Number(v);refreshPrix(true);};
window.updateMaterialGrams=(i,v)=>{materials[i].grammes=v;refreshPrix(true);};
window.removeMaterial=i=>{materials.splice(i,1);renderMaterials();refreshPrix(true);};
$('addStockMaterialBtn').onclick=async()=>{await chargerStock();materials.push({mode:'stock',stockId:null,grammes:''});renderMaterials();};
$('addTextMaterialBtn').onclick=()=>{materials.push({mode:'text',texte:''});renderMaterials();};

function reglerStatuts(){const opt=Array.from(of.statut.options).find(o=>o.value==='À faire');if(opt)opt.disabled=currentStockDeduit;}
function fermerCommande(){orderModal.classList.add('hidden');orderForm.reset();of.id.value='';of.tempsHeures.value=0;of.tempsMinutes.value=0;of.quantite.value=1;of.statut.value='À faire';materials=[];currentStockDeduit=false;reglerStatuts();}
$('addOrderBtn').onclick=async()=>{fermerCommande();await chargerStock();renderMaterials();$('orderModalTitle').textContent='Nouvelle commande';of.date.value=new Date().toISOString().slice(0,10);orderModal.classList.remove('hidden');};
$('orderCloseBtn').onclick=$('orderCancelBtn').onclick=fermerCommande;

async function chargerCommandes(){
  const {data,error}=await db.from('Commande').select('*').order('id',{ascending:false});
  if(error){orderList.innerHTML=`<tr><td colspan="11" class="empty-cell">Erreur : ${esc(error.message)}</td></tr>`;return;}
  if(!data?.length){orderList.innerHTML='<tr><td colspan="11" class="empty-cell">Aucune commande pour le moment.</td></tr>';return;}

  const ids=data.map(c=>c.id);
  const {data:couleurs,error:couleurError}=await db.from('CouleurCommande').select('*').in('CommandeID',ids).order('id');
  if(couleurError){orderList.innerHTML=`<tr><td colspan="11" class="empty-cell">Erreur couleurs : ${esc(couleurError.message)}</td></tr>`;return;}

  const byOrder={};
  (couleurs||[]).forEach(l=>{(byOrder[l.CommandeID]??=[]).push(l);});

  orderList.innerHTML=data.map(c=>{
    const lignes=(byOrder[c.id]||[]).map(l=>{
      if(l.StockID!=null){
        const st=stockCache.find(x=>Number(x.id)===Number(l.StockID));
        return `<span class="filament-display">${st?esc(stockLabel(st)):'Stock #'+esc(l.StockID)}${l.Grammes!=null?' · '+esc(l.Grammes)+' g':''}</span>`;
      }
      return l.TexteLibre?`<span class="filament-display">${esc(l.TexteLibre)}</span>`:'';
    }).join('') || '<span class="filament-display">-</span>';
    const source=c.LienFichier ? (/^https?:\/\//i.test(c.LienFichier)?`<a class="file-link" href="${esc(c.LienFichier)}" target="_blank" rel="noopener">Ouvrir</a>`:esc(c.LienFichier)) : '-';
    return `<tr>
      <td><strong>${esc(c.Commande)}</strong><span class="file-source">${source}</span></td>
      <td>${esc(c.Client)}</td><td>${esc(c.DateCommande)}</td><td>${esc(c.Taille||'-')}</td><td>${esc(c.Quantite)}</td>
      <td class="filaments-cell">${lignes}</td><td>${c.Prix==null?'-':esc(c.Prix)+' €'}</td>
      <td><span class="badge ${classeStatut(c.Statut==='À imprimer'?'Imprimé':c.Statut==='À livrer'?'Livré':c.Statut)}">${esc(c.Statut==='À imprimer'?'Imprimé':c.Statut==='À livrer'?'Livré':(c.Statut||'À faire'))}</span></td>
      <td><span class="badge ${c.Paye?'paid':'unpaid'}">${c.Paye?'Oui':'Non'}</span></td>
      <td class="actions-cell"><button class="secondary" onclick="modifierCommande(${c.id})">Modifier</button> <button class="danger" onclick="supprimerCommande(${c.id})">Supprimer</button></td>
    </tr>`;
  }).join('');
}

async function loadMaterials(id){const {data,error}=await db.from('CouleurCommande').select('*').eq('CommandeID',id).order('id');if(error)throw error;materials=(data||[]).map(r=>r.StockID!=null?{mode:'stock',stockId:r.StockID,grammes:r.Grammes??''}:{mode:'text',texte:r.TexteLibre??''});renderMaterials();}
async function saveMaterials(id){const {error:delErr}=await db.from('CouleurCommande').delete().eq('CommandeID',id);if(delErr)throw delErr;const rows=materials.filter(m=>m.mode==='text'?m.texte.trim():m.stockId!=null).map(m=>m.mode==='stock'?{CommandeID:id,StockID:m.stockId,TexteLibre:null,Grammes:m.grammes===''?null:Number(m.grammes)}:{CommandeID:id,StockID:null,TexteLibre:m.texte.trim(),Grammes:null});if(rows.length){const {error}=await db.from('CouleurCommande').insert(rows);if(error)throw error;}}

window.modifierCommande=async id=>{await chargerStock();const {data,error}=await db.from('Commande').select('*').eq('id',id).single();if(error)return alert(error.message);of.id.value=data.id;of.commande.value=data.Commande??'';of.client.value=data.Client??'';of.date.value=data.DateCommande??'';of.lien.value=data.LienFichier??'';of.taille.value=data.Taille??'';const totalMinutes=Number(data.TempsImpression)||0;of.tempsHeures.value=Math.floor(totalMinutes/60);of.tempsMinutes.value=totalMinutes%60;of.quantite.value=data.Quantite??1;of.prix.value=data.Prix??'';of.statut.value=data.Statut==='À imprimer'?'Imprimé':data.Statut==='À livrer'?'Livré':(data.Statut||'À faire');of.paye.checked=!!data.Paye;currentStockDeduit=!!data.StockDeduit;reglerStatuts();try{await loadMaterials(id);}catch(e){return alert('Erreur couleurs : '+e.message);}$('orderModalTitle').textContent='Modifier la commande';orderModal.classList.remove('hidden');};

async function deduireStock(id){const {data:rows,error}=await db.from('CouleurCommande').select('*').eq('CommandeID',id);if(error)throw error;for(const r of rows||[]){if(r.StockID==null||r.Grammes==null)continue;const {data:s,error:e}=await db.from('Stock').select('Grammes').eq('id',r.StockID).single();if(e)throw e;const {error:u}=await db.from('Stock').update({Grammes:Number(s.Grammes)-Number(r.Grammes)}).eq('id',r.StockID);if(u)throw u;}const {error:f}=await db.from('Commande').update({StockDeduit:true}).eq('id',id);if(f)throw f;}

orderForm.onsubmit=async e=>{e.preventDefault();if(currentStockDeduit&&of.statut.value==='À faire')return alert("Impossible de remettre cette commande à 'À faire' : le stock a déjà été déduit.");const doitDeduire=of.statut.value==='Imprimé'&&!currentStockDeduit;if(doitDeduire&&!confirm("Valider l'impression ?\n\nLes grammes utilisés seront retirés du stock."))return;let prix=of.prix.value===''?prixMatiere():Number(of.prix.value);if(prixMatiere()>0&&prix<0.50)prix=0.50;const p={Commande:of.commande.value.trim(),Client:of.client.value.trim(),DateCommande:of.date.value,LienFichier:of.lien.value.trim()||null,Taille:of.taille.value.trim()||null,TempsImpression:tempsVersMinutes()||null,Quantite:Number(of.quantite.value),Prix:prix,Statut:of.statut.value,Paye:of.paye.checked};let id=of.id.value;if(id){const {error}=await db.from('Commande').update(p).eq('id',id);if(error)return alert(error.message);}else{const {data,error}=await db.from('Commande').insert({...p,StockDeduit:false}).select('id').single();if(error)return alert(error.message);id=data.id;}try{await saveMaterials(id);if(doitDeduire)await deduireStock(id);}catch(err){return alert('Erreur : '+err.message);}fermerCommande();await chargerStock();await chargerCommandes();};

window.supprimerCommande=async id=>{if(!confirm('Supprimer cette commande ?'))return;const {error:e1}=await db.from('CouleurCommande').delete().eq('CommandeID',id);if(e1)return alert(e1.message);const {error:e2}=await db.from('Commande').delete().eq('id',id);if(e2)return alert(e2.message);await chargerCommandes();};

chargerStock();
chargerCommandes();

// ==================================================
// V9 - SUGGESTIONS STOCK + FILTRES/RECHERCHE + COMPTEURS
// ==================================================
let commandesCache = [];
let couleursCommandeCache = [];
let filtreCommandeActif = 'Toutes';
let rechercheCommande = '';

function mettreAJourSuggestionsStock() {
  const types = [...new Set(stockCache.map(x => (x.Type || '').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'fr'));
  const caracs = [...new Set(stockCache.map(x => (x.Caracteristique || '').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'fr'));
  const typeList = $('typeSuggestions');
  const caracList = $('caracSuggestions');
  if(typeList) typeList.innerHTML = types.map(v => `<option value="${esc(v)}"></option>`).join('');
  if(caracList) caracList.innerHTML = caracs.map(v => `<option value="${esc(v)}"></option>`).join('');
}

const chargerStockV9 = chargerStock;
chargerStock = async function(){
  await chargerStockV9();
  mettreAJourSuggestionsStock();
};

function statutNormalise(s){ return s==='À imprimer'?'Imprimé':s==='À livrer'?'Livré':(s||'À faire'); }

function couleursTextePourCommande(id){
  return couleursCommandeCache.filter(x=>Number(x.CommandeID)===Number(id)).map(l=>{
    if(l.StockID!=null){ const st=stockCache.find(x=>Number(x.id)===Number(l.StockID)); return st?stockLabel(st):''; }
    return l.TexteLibre||'';
  }).join(' ');
}

function commandeVisible(c){
  const statut=statutNormalise(c.Statut);
  const filtreOK = filtreCommandeActif==='Toutes' || (filtreCommandeActif==='Non payé' ? !c.Paye : statut===filtreCommandeActif);
  if(!filtreOK) return false;
  if(!rechercheCommande) return true;
  const haystack=[c.Commande,c.Client,c.DateCommande,c.Taille,afficherTemps(c.TempsImpression),c.LienFichier,c.Prix,statut,couleursTextePourCommande(c.id)].join(' ').toLocaleLowerCase('fr');
  return haystack.includes(rechercheCommande);
}

function mettreAJourCompteurs(){
  $('countAll').textContent=commandesCache.length;
  $('countTodo').textContent=commandesCache.filter(c=>statutNormalise(c.Statut)==='À faire').length;
  $('countPrinted').textContent=commandesCache.filter(c=>statutNormalise(c.Statut)==='Imprimé').length;
  $('countDelivered').textContent=commandesCache.filter(c=>statutNormalise(c.Statut)==='Livré').length;
  $('countUnpaid').textContent=commandesCache.filter(c=>!c.Paye).length;
}

function appliquerFiltres(){
  document.querySelectorAll('#order-list tr[data-order-id]').forEach(row=>{
    const c=commandesCache.find(x=>Number(x.id)===Number(row.dataset.orderId));
    row.classList.toggle('hidden-order',!c||!commandeVisible(c));
  });
  document.querySelectorAll('.filter-pill,.summary-filter').forEach(b=>b.classList.toggle('active',b.dataset.filter===filtreCommandeActif));
}

document.querySelectorAll('.filter-pill,.summary-filter').forEach(button=>{
  button.addEventListener('click',()=>{filtreCommandeActif=button.dataset.filter;appliquerFiltres();});
});
$('orderSearch').addEventListener('input',e=>{rechercheCommande=e.target.value.trim().toLocaleLowerCase('fr');appliquerFiltres();});

// Remplace uniquement l'affichage des commandes par une version qui garde un cache pour filtres/compteurs.
chargerCommandes = async function(){
  const {data,error}=await db.from('Commande').select('*').order('id',{ascending:false});
  if(error){orderList.innerHTML=`<tr><td colspan="11" class="empty-cell">Erreur : ${esc(error.message)}</td></tr>`;return;}
  commandesCache=data||[];
  if(!commandesCache.length){couleursCommandeCache=[];mettreAJourCompteurs();orderList.innerHTML='<tr><td colspan="11" class="empty-cell">Aucune commande pour le moment.</td></tr>';return;}
  const ids=commandesCache.map(c=>c.id);
  const {data:couleurs,error:couleurError}=await db.from('CouleurCommande').select('*').in('CommandeID',ids).order('id');
  if(couleurError){orderList.innerHTML=`<tr><td colspan="11" class="empty-cell">Erreur couleurs : ${esc(couleurError.message)}</td></tr>`;return;}
  couleursCommandeCache=couleurs||[];
  orderList.innerHTML=commandesCache.map(c=>{
    const lignes=couleursCommandeCache.filter(l=>Number(l.CommandeID)===Number(c.id)).map(l=>{
      if(l.StockID!=null){const st=stockCache.find(x=>Number(x.id)===Number(l.StockID));return `<span class="filament-display">${st?esc(stockLabel(st)):'Stock #'+esc(l.StockID)}${l.Grammes!=null?' · '+esc(l.Grammes)+' g':''}</span>`;}
      return l.TexteLibre?`<span class="filament-display">${esc(l.TexteLibre)}</span>`:'';
    }).join('')||'<span class="filament-display">-</span>';
    const src=c.LienFichier?(/^https?:\/\//i.test(c.LienFichier)?`<a class="file-link" href="${esc(c.LienFichier)}" target="_blank" rel="noopener">Ouvrir</a>`:esc(c.LienFichier)):'-';
    const statut=statutNormalise(c.Statut);
    return `<tr data-order-id="${c.id}"><td><strong>${esc(c.Commande)}</strong><span class="file-source">${src}</span></td><td>${esc(c.Client)}</td><td>${esc(c.DateCommande)}</td><td>${esc(c.Taille||'-')}</td><td><span class="print-time">${esc(afficherTemps(c.TempsImpression))}</span></td><td>${esc(c.Quantite)}</td><td class="filaments-cell">${lignes}</td><td>${c.Prix==null?'-':esc(c.Prix)+' €'}</td><td><span class="badge ${classeStatut(statut)}">${esc(statut)}</span></td><td><span class="badge ${c.Paye?'paid':'unpaid'}">${c.Paye?'Oui':'Non'}</span></td><td class="actions-cell"><button class="secondary" onclick="modifierCommande(${c.id})">Modifier</button> <button class="danger" onclick="supprimerCommande(${c.id})">Supprimer</button></td></tr>`;
  }).join('');
  mettreAJourCompteurs();
  appliquerFiltres();
};

// Recharge avec les fonctions V9 fraichement installees.
chargerStock().then(()=>chargerCommandes());

// ==================================================
// V9.2 - TRI METIER DES COMMANDES
// Priorite : A faire, Imprime non livre, Livre non paye, Livre + paye
// Puis les plus anciennes en premier dans chaque groupe.
// ==================================================
function prioriteCommande(c) {
  const statut = statutNormalise(c.Statut);
  if (statut === 'À faire') return 1;
  if (statut === 'Imprimé') return 2;
  if (statut === 'Livré' && !c.Paye) return 3;
  if (statut === 'Livré' && c.Paye) return 4;
  return 5;
}

function trierCommandesMetier(commandes) {
  return [...commandes].sort((a, b) => {
    const diff = prioriteCommande(a) - prioriteCommande(b);
    if (diff !== 0) return diff;

    const dateA = a.DateCommande || '';
    const dateB = b.DateCommande || '';
    const dateDiff = dateA.localeCompare(dateB);
    if (dateDiff !== 0) return dateDiff;

    return Number(a.id) - Number(b.id);
  });
}

// Encapsule le chargement V9 pour imposer le tri metier au cache,
// puis replace les lignes du DOM dans ce meme ordre.
const chargerCommandesV92Base = chargerCommandes;
chargerCommandes = async function() {
  await chargerCommandesV92Base();
  commandesCache = trierCommandesMetier(commandesCache);

  const tbody = $('order-list');
  commandesCache.forEach(c => {
    const row = tbody.querySelector(`tr[data-order-id="${c.id}"]`);
    if (row) tbody.appendChild(row);
  });

  appliquerFiltres();
};

// Applique immediatement le tri sur les donnees deja affichees au demarrage.
chargerCommandes();

// ==================================================
// V11 - PLANNING HEBDOMADAIRE P2S / H2C
// ==================================================
const planningGrid=$('planningGrid'), planningModal=$('planningModal'), planningForm=$('planningForm');
let planningWeekStart=startOfWeek(new Date());
let planningOrders=[];
const DAY_START=7, DAY_END=22, DAY_MINUTES=(DAY_END-DAY_START)*60;

function startOfWeek(d){const x=new Date(d);x.setHours(0,0,0,0);const day=(x.getDay()+6)%7;x.setDate(x.getDate()-day);return x;}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x;}
function isoDateLocal(d){const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${day}`;}
function formatDay(d){return d.toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short'});}
function formatWeek(a){const b=addDays(a,6);return `Semaine du ${a.toLocaleDateString('fr-FR',{day:'numeric',month:'long'})} au ${b.toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'})}`;}
function minutesToLabel(m){return afficherTemps(m);}
function dateTimeLocal(date,time){return new Date(`${date}T${time}:00`);}
function eventTop(d){return (((d.getHours()*60+d.getMinutes())-DAY_START*60)/DAY_MINUTES)*100;}
function eventHeight(mins){return Math.max(12,(Number(mins||30)/DAY_MINUTES)*100);}
function overlaps(startA,durA,startB,durB){return startA < new Date(startB.getTime()+durB*60000) && startB < new Date(startA.getTime()+durA*60000);}

async function chargerPlanning(){
  const end=addDays(planningWeekStart,7);
  const {data,error}=await db.from('Commande').select('*').gte('DateImpression',planningWeekStart.toISOString()).lt('DateImpression',end.toISOString()).order('DateImpression');
  if(error){planningGrid.innerHTML=`<div class="empty">Erreur planning : ${esc(error.message)}</div>`;return;}
  planningOrders=data||[];
  renderPlanning();
}

function renderPlanning(){
  $('weekTitle').textContent=formatWeek(planningWeekStart);
  const today=isoDateLocal(new Date());
  let html='<div class="planning-corner"></div>';
  for(let i=0;i<7;i++){const d=addDays(planningWeekStart,i);html+=`<div class="planning-day ${isoDateLocal(d)===today?'today':''}"><strong>${esc(formatDay(d))}</strong><small>${isoDateLocal(d)}</small></div>`;}
  for(const printer of ['P2S','H2C']){
    html+=`<div class="printer-label ${printer.toLowerCase()}">${printer}</div>`;
    for(let i=0;i<7;i++){
      const d=addDays(planningWeekStart,i), dateStr=isoDateLocal(d);
      html+=`<div class="planning-cell" data-printer="${printer}" data-date="${dateStr}">`;
      for(let h=DAY_START;h<=DAY_END;h+=2){const top=((h-DAY_START)/(DAY_END-DAY_START))*100;html+=`<span class="planning-hour" style="top:${top}%">${String(h).padStart(2,'0')}:00</span>`;}
      const dayEvents=planningOrders.filter(c=>c.Imprimante===printer && isoDateLocal(new Date(c.DateImpression))===dateStr);
      for(const c of dayEvents){const start=new Date(c.DateImpression),duration=Number(c.TempsImpression)||30;const conflict=dayEvents.some(o=>o.id!==c.id&&overlaps(start,duration,new Date(o.DateImpression),Number(o.TempsImpression)||30));html+=`<div class="planning-event ${printer.toLowerCase()} ${conflict?'conflict':''}" data-order-id="${c.id}" style="top:${Math.max(0,eventTop(start))}%;height:${Math.min(100-Math.max(0,eventTop(start)),eventHeight(duration))}%"><strong>${esc(c.Commande)}</strong><span>${String(start.getHours()).padStart(2,'0')}:${String(start.getMinutes()).padStart(2,'0')} · ${esc(c.Client||'')} · ${esc(minutesToLabel(duration))}</span></div>`;}
      html+='</div>';
    }
  }
  planningGrid.innerHTML=html;
  planningGrid.querySelectorAll('.planning-cell').forEach(cell=>cell.addEventListener('click',e=>{if(e.target.closest('.planning-event'))return;const rect=cell.getBoundingClientRect();const ratio=Math.max(0,Math.min(1,(e.clientY-rect.top)/rect.height));let minutes=Math.round((DAY_START*60+ratio*DAY_MINUTES)/15)*15;const hh=String(Math.floor(minutes/60)).padStart(2,'0'),mm=String(minutes%60).padStart(2,'0');ouvrirPlanification(null,cell.dataset.printer,cell.dataset.date,`${hh}:${mm}`);}));
  planningGrid.querySelectorAll('.planning-event').forEach(ev=>ev.addEventListener('click',e=>{e.stopPropagation();const c=planningOrders.find(x=>Number(x.id)===Number(ev.dataset.orderId));if(c)ouvrirPlanification(c);}));
}

async function remplirCommandesPlanning(selectedId=null){
  const {data,error}=await db.from('Commande').select('*').order('DateCommande',{ascending:true});if(error)throw error;
  const eligible=(data||[]).filter(c=>statutNormalise(c.Statut)==='À faire'||Number(c.id)===Number(selectedId));
  $('planningCommande').innerHTML=eligible.length?eligible.map(c=>`<option value="${c.id}" ${Number(c.id)===Number(selectedId)?'selected':''}>${esc(c.Commande)} · ${esc(c.Client||'')} · ${esc(afficherTemps(c.TempsImpression))}</option>`).join(''):'<option value="">Aucune commande à faire</option>';
  updatePlanningDuration();
}
async function updatePlanningDuration(){const id=Number($('planningCommande').value);if(!id){$('planningDuration').textContent='Aucune commande sélectionnée.';return;}const {data}=await db.from('Commande').select('TempsImpression').eq('id',id).single();$('planningDuration').textContent=`Durée prévue : ${afficherTemps(data?.TempsImpression)}`;checkPlanningConflict();}
async function checkPlanningConflict(){
  const id=Number($('planningCommande').value), printer=$('planningPrinter').value,date=$('planningDate').value,time=$('planningTime').value;if(!id||!date||!time)return;
  const {data:c}=await db.from('Commande').select('TempsImpression').eq('id',id).single();const dur=Number(c?.TempsImpression)||30,start=dateTimeLocal(date,time);
  const conflict=planningOrders.find(o=>Number(o.id)!==id&&o.Imprimante===printer&&overlaps(start,dur,new Date(o.DateImpression),Number(o.TempsImpression)||30));
  const box=$('planningConflict');if(conflict){box.textContent=`⚠ Conflit avec ${conflict.Commande} (${conflict.Client||''}). La planification reste autorisée.`;box.classList.remove('hidden');}else box.classList.add('hidden');
}
async function ouvrirPlanification(order=null,printer='P2S',date=isoDateLocal(new Date()),time='09:00'){
  $('planningOrderId').value=order?.id||'';await remplirCommandesPlanning(order?.id||null);$('planningPrinter').value=order?.Imprimante||printer;
  if(order?.DateImpression){const d=new Date(order.DateImpression);$('planningDate').value=isoDateLocal(d);$('planningTime').value=`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;}else{$('planningDate').value=date;$('planningTime').value=time;}
  $('planningDeleteBtn').classList.toggle('hidden',!order);$('planningModalTitle').textContent=order?'Modifier la planification':'Planifier une impression';await updatePlanningDuration();planningModal.classList.remove('hidden');
}
$('planningCommande').onchange=updatePlanningDuration;$('planningPrinter').onchange=checkPlanningConflict;$('planningDate').onchange=checkPlanningConflict;$('planningTime').onchange=checkPlanningConflict;
$('planningCloseBtn').onclick=$('planningCancelBtn').onclick=()=>planningModal.classList.add('hidden');
planningForm.onsubmit=async e=>{e.preventDefault();const id=Number($('planningCommande').value);if(!id)return alert('Choisis une commande.');const local=dateTimeLocal($('planningDate').value,$('planningTime').value);const {error}=await db.from('Commande').update({DateImpression:local.toISOString(),Imprimante:$('planningPrinter').value}).eq('id',id);if(error)return alert(error.message);planningModal.classList.add('hidden');await chargerPlanning();};
$('planningDeleteBtn').onclick=async()=>{const id=Number($('planningOrderId').value||$('planningCommande').value);if(!id)return;const {error}=await db.from('Commande').update({DateImpression:null,Imprimante:null}).eq('id',id);if(error)return alert(error.message);planningModal.classList.add('hidden');await chargerPlanning();};
$('prevWeek').onclick=()=>{planningWeekStart=addDays(planningWeekStart,-7);chargerPlanning();};$('nextWeek').onclick=()=>{planningWeekStart=addDays(planningWeekStart,7);chargerPlanning();};$('todayWeek').onclick=()=>{planningWeekStart=startOfWeek(new Date());chargerPlanning();};
document.querySelector('[data-page="planning"]').addEventListener('click',chargerPlanning);
chargerPlanning();

// ==================================================
// V12 - PLANNING UNIQUE + IMPRESSIONS MULTI-JOURS
// ==================================================
function v12DayStart(d){const x=new Date(d);x.setHours(0,0,0,0);return x;}
function v12NextDay(d){return addDays(v12DayStart(d),1);}
function v12Segments(order){
  const start=new Date(order.DateImpression);
  const end=new Date(start.getTime()+(Number(order.TempsImpression)||30)*60000);
  const weekEnd=addDays(planningWeekStart,7);
  let cursor=start<planningWeekStart?new Date(planningWeekStart):new Date(start);
  const visibleEnd=end>weekEnd?weekEnd:end;
  const out=[];
  while(cursor<visibleEnd){
    const boundary=v12NextDay(cursor);
    const segEnd=boundary<visibleEnd?boundary:visibleEnd;
    const idx=Math.round((v12DayStart(cursor)-planningWeekStart)/86400000);
    if(idx>=0&&idx<7)out.push({idx,start:new Date(cursor),end:new Date(segEnd),first:cursor.getTime()===start.getTime(),last:segEnd.getTime()===end.getTime()});
    cursor=new Date(segEnd);
  }
  return out;
}
async function chargerPlanningV12(){
  const weekEnd=addDays(planningWeekStart,7);
  const lookback=new Date(planningWeekStart.getTime()-14*86400000);
  const {data,error}=await db.from('Commande').select('*').not('DateImpression','is',null).gte('DateImpression',lookback.toISOString()).lt('DateImpression',weekEnd.toISOString()).order('DateImpression');
  if(error){planningGrid.innerHTML=`<div class="empty">Erreur planning : ${esc(error.message)}</div>`;return;}
  planningOrders=(data||[]).filter(c=>new Date(new Date(c.DateImpression).getTime()+(Number(c.TempsImpression)||30)*60000)>planningWeekStart);
  renderPlanningV12();
}
function renderPlanningV12(){
  $('weekTitle').textContent=formatWeek(planningWeekStart);
  planningGrid.className='planning-grid v12';
  const today=isoDateLocal(new Date());
  let html='<div class="planning-corner"></div>';
  for(let i=0;i<7;i++){const d=addDays(planningWeekStart,i);html+=`<div class="planning-day ${isoDateLocal(d)===today?'today':''}"><strong>${esc(formatDay(d))}</strong><small>${isoDateLocal(d)}</small></div>`;}
  html+='<div class="planning-time-axis">';
  for(let h=0;h<24;h+=2)html+=`<span class="planning-time-label" style="top:${h/24*100}%">${String(h).padStart(2,'0')}:00</span>`;
  html+='</div>';
  for(let i=0;i<7;i++){
    const d=addDays(planningWeekStart,i);
    html+=`<div class="planning-day-column ${isoDateLocal(d)===today?'today-column':''}" data-date="${isoDateLocal(d)}">`;
    for(const c of planningOrders){
      for(const seg of v12Segments(c)){
        if(seg.idx!==i)continue;
        const sm=seg.start.getHours()*60+seg.start.getMinutes();
        const midnight=seg.end.getHours()===0&&seg.end.getMinutes()===0&&seg.end>seg.start;
        const em=midnight?1440:seg.end.getHours()*60+seg.end.getMinutes();
        const top=sm/1440*100;
        const height=Math.max(1.7,(em-sm)/1440*100);
        const cls=`${seg.first?'segment-start':''} ${seg.last?'segment-end':''} ${!seg.first&&!seg.last?'segment-middle':''}`;
        html+=`<div class="planning-event ${String(c.Imprimante||'P2S').toLowerCase()} ${cls}" data-order-id="${c.id}" style="top:${top}%;height:${height}%"><span class="printer-tag">${esc(c.Imprimante||'?')}</span><strong>${esc(c.Commande)}</strong>${height>5?`<span>${esc(c.Client||'')} · ${esc(afficherTemps(c.TempsImpression))}</span>`:''}</div>`;
      }
    }
    html+='</div>';
  }
  planningGrid.innerHTML=html;
  planningGrid.querySelectorAll('.planning-day-column').forEach(cell=>cell.onclick=e=>{
    if(e.target.closest('.planning-event'))return;
    const r=cell.getBoundingClientRect();
    const ratio=Math.max(0,Math.min(1,(e.clientY-r.top)/r.height));
    let mins=Math.min(1425,Math.round(ratio*1440/15)*15);
    ouvrirPlanification(null,'P2S',cell.dataset.date,`${String(Math.floor(mins/60)).padStart(2,'0')}:${String(mins%60).padStart(2,'0')}`);
  });
  planningGrid.querySelectorAll('.planning-event').forEach(ev=>ev.onclick=e=>{e.stopPropagation();const c=planningOrders.find(x=>Number(x.id)===Number(ev.dataset.orderId));if(c)ouvrirPlanification(c);});
}
chargerPlanning=chargerPlanningV12;
$('prevWeek').onclick=()=>{planningWeekStart=addDays(planningWeekStart,-7);chargerPlanningV12();};
$('nextWeek').onclick=()=>{planningWeekStart=addDays(planningWeekStart,7);chargerPlanningV12();};
$('todayWeek').onclick=()=>{planningWeekStart=startOfWeek(new Date());chargerPlanningV12();};
document.querySelector('[data-page="planning"]').onclick=chargerPlanningV12;
chargerPlanningV12();
