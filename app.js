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

// ==================================================
// V14 - PLANNING IMPRESSION + COULEURS (moteur unique)
// ==================================================
const planningGrid=$('planningGrid'),planningModal=$('planningModal'),planningForm=$('planningForm');
let planningWeekStart=v14StartWeek(new Date()),planningSlots=[],planningCommands=[],planningLinks=[],planningColors=[];
function v14StartWeek(d){const x=new Date(d);x.setHours(0,0,0,0);x.setDate(x.getDate()-((x.getDay()+6)%7));return x;}
function v14AddDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x;}
function v14DayStart(d){const x=new Date(d);x.setHours(0,0,0,0);return x;}
function v14IsoDate(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function v14Local(date,time){return new Date(`${date}T${time}:00`);}
function v14Duration(a,b){return Math.max(0,Math.round((b-a)/60000));}
function v14FmtDuration(m){const h=Math.floor(m/60),r=m%60;return h?(r?`${h} h ${String(r).padStart(2,'0')}`:`${h} h`):`${r} min`;}
function v14WeekTitle(a){const b=v14AddDays(a,6);return `Semaine du ${a.toLocaleDateString('fr-FR',{day:'numeric',month:'long'})} au ${b.toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'})}`;}
function v14Overlap(a1,a2,b1,b2){return a1<b2&&b1<a2;}
function v14ColorLabel(id){const row=planningColors.find(x=>Number(x.id)===Number(id));if(!row)return `Couleur #${id}`;if(row.StockID!=null){const st=stockCache.find(x=>Number(x.id)===Number(row.StockID));return `${st?stockLabel(st):'Stock #'+row.StockID}${row.Grammes!=null?' · '+row.Grammes+' g':''}`;}return row.TexteLibre||'Texte libre';}
function v14Segments(slot){const start=new Date(slot.DateDebut),end=new Date(slot.DateFin),weekEnd=v14AddDays(planningWeekStart,7);let cur=start<planningWeekStart?new Date(planningWeekStart):new Date(start),visEnd=end>weekEnd?weekEnd:end,out=[];while(cur<visEnd){const boundary=v14AddDays(v14DayStart(cur),1),segEnd=boundary<visEnd?boundary:visEnd,idx=Math.round((v14DayStart(cur)-planningWeekStart)/86400000);if(idx>=0&&idx<7)out.push({idx,start:new Date(cur),end:new Date(segEnd),first:cur.getTime()===start.getTime(),last:segEnd.getTime()===end.getTime()});cur=new Date(segEnd);}return out;}
async function chargerPlanning(){const end=v14AddDays(planningWeekStart,7);const results=await Promise.all([db.from('PlanningImpression').select('*').lt('DateDebut',end.toISOString()).gt('DateFin',planningWeekStart.toISOString()).order('DateDebut'),db.from('Commande').select('id,Commande,Client,Statut,TempsImpression').order('DateCommande'),db.from('PlanningCouleur').select('*'),db.from('CouleurCommande').select('*')]);const err=results.find(x=>x.error)?.error;if(err){planningGrid.innerHTML=`<div class="empty">Erreur planning : ${esc(err.message)}</div>`;return;}planningSlots=results[0].data||[];planningCommands=results[1].data||[];planningLinks=results[2].data||[];planningColors=results[3].data||[];renderPlanning();}
function renderPlanning(){$('weekTitle').textContent=v14WeekTitle(planningWeekStart);planningGrid.className='planning-grid v14';const today=v14IsoDate(new Date());let html='<div class="planning-corner"></div>';for(let i=0;i<7;i++){const d=v14AddDays(planningWeekStart,i);html+=`<div class="planning-day ${v14IsoDate(d)===today?'today':''}"><strong>${esc(d.toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short'}))}</strong><small>${v14IsoDate(d)}</small></div>`;}html+='<div class="planning-time-axis">';for(let h=0;h<24;h+=2)html+=`<span class="planning-time-label" style="top:${h/24*100}%">${String(h).padStart(2,'0')}:00</span>`;html+='</div>';for(let i=0;i<7;i++){const d=v14AddDays(planningWeekStart,i);html+=`<div class="planning-day-column ${v14IsoDate(d)===today?'today-column':''}" data-date="${v14IsoDate(d)}">`;for(const slot of planningSlots)for(const seg of v14Segments(slot)){if(seg.idx!==i)continue;const cmd=planningCommands.find(c=>Number(c.id)===Number(slot.CommandeID)),sm=seg.start.getHours()*60+seg.start.getMinutes(),mid=seg.end.getHours()===0&&seg.end.getMinutes()===0&&seg.end>seg.start,em=mid?1440:seg.end.getHours()*60+seg.end.getMinutes(),top=sm/1440*100,height=Math.max(1.7,(em-sm)/1440*100),conflict=planningSlots.some(o=>o.id!==slot.id&&o.Imprimante===slot.Imprimante&&v14Overlap(new Date(slot.DateDebut),new Date(slot.DateFin),new Date(o.DateDebut),new Date(o.DateFin))),cls=`${seg.first?'segment-start':''} ${seg.last?'segment-end':''} ${!seg.first&&!seg.last?'segment-middle':''}`,colors=planningLinks.filter(x=>Number(x.PlanningID)===Number(slot.id)).map(x=>v14ColorLabel(x.CouleurCommandeID));html+=`<div class="planning-event ${slot.Imprimante.toLowerCase()} ${cls} ${conflict?'conflict':''}" data-slot-id="${slot.id}" style="top:${top}%;height:${height}%"><span class="printer-tag">${esc(slot.Imprimante)}</span><strong>${esc(cmd?.Commande||'Commande')}</strong>${slot.Commentaire?`<span>${esc(slot.Commentaire)}</span>`:''}${colors.length?`<span class="event-colors">${esc(colors.join(' · '))}</span>`:''}${height>6?`<span>${esc(cmd?.Client||'')} · ${v14FmtDuration(v14Duration(new Date(slot.DateDebut),new Date(slot.DateFin)))}</span>`:''}</div>`;}html+='</div>';}planningGrid.innerHTML=html;planningGrid.querySelectorAll('.planning-day-column').forEach(cell=>cell.onclick=e=>{if(e.target.closest('.planning-event'))return;const r=cell.getBoundingClientRect(),ratio=Math.max(0,Math.min(1,(e.clientY-r.top)/r.height)),mins=Math.min(1425,Math.round(ratio*1440/15)*15);ouvrirPlanning(null,'P2S',cell.dataset.date,`${String(Math.floor(mins/60)).padStart(2,'0')}:${String(mins%60).padStart(2,'0')}`);});planningGrid.querySelectorAll('.planning-event').forEach(el=>el.onclick=e=>{e.stopPropagation();ouvrirPlanning(planningSlots.find(x=>Number(x.id)===Number(el.dataset.slotId)));});}
function remplirCommandes(selected){const allowed=planningCommands.filter(c=>statutNormalise(c.Statut)==='À faire'||Number(c.id)===Number(selected));$('planningCommande').innerHTML=allowed.map(c=>`<option value="${c.id}" ${Number(c.id)===Number(selected)?'selected':''}>${esc(c.Commande)} · ${esc(c.Client||'')}</option>`).join('');}
function renderPlanningColors(commandId,slotId=null){const rows=planningColors.filter(x=>Number(x.CommandeID)===Number(commandId)),selected=new Set(planningLinks.filter(x=>Number(x.PlanningID)===Number(slotId)).map(x=>Number(x.CouleurCommandeID)));$('planningColors').innerHTML=rows.length?rows.map(row=>`<label class="planning-color-option"><input type="checkbox" value="${row.id}" ${selected.has(Number(row.id))?'checked':''}><span>${esc(v14ColorLabel(row.id))}</span></label>`).join(''):'<span class="muted">Cette commande n’a aucune couleur renseignée.</span>';}
function selectedPlanningColors(){return Array.from(document.querySelectorAll('#planningColors input:checked')).map(x=>Number(x.value));}
async function savePlanningColors(id){const {error:de}=await db.from('PlanningCouleur').delete().eq('PlanningID',id);if(de)throw de;const ids=selectedPlanningColors();if(ids.length){const {error}=await db.from('PlanningCouleur').insert(ids.map(color=>({PlanningID:Number(id),CouleurCommandeID:color})));if(error)throw error;}}
function majDureeEtConflit(){const a=v14Local($('planningStartDate').value,$('planningStartTime').value),b=v14Local($('planningEndDate').value,$('planningEndTime').value),ok=b>a;$('planningDuration').textContent=ok?`Durée du créneau : ${v14FmtDuration(v14Duration(a,b))}`:'La fin doit être après le début.';const id=Number($('planningSlotId').value),conf=ok&&planningSlots.find(x=>Number(x.id)!==id&&x.Imprimante===$('planningPrinter').value&&v14Overlap(a,b,new Date(x.DateDebut),new Date(x.DateFin)));$('planningConflict').classList.toggle('hidden',!conf);$('planningConflict').textContent=conf?'⚠ Ce créneau chevauche une autre impression sur cette imprimante. La sauvegarde reste autorisée.':'';}
function ouvrirPlanning(slot=null,printer='P2S',date=v14IsoDate(new Date()),time='09:00'){$('planningSlotId').value=slot?.id||'';remplirCommandes(slot?.CommandeID);$('planningCommande').value=slot?.CommandeID||$('planningCommande').value;$('planningCommentaire').value=slot?.Commentaire||'';$('planningPrinter').value=slot?.Imprimante||printer;const start=slot?new Date(slot.DateDebut):v14Local(date,time),cmd=planningCommands.find(c=>Number(c.id)===Number($('planningCommande').value)),end=slot?new Date(slot.DateFin):new Date(start.getTime()+(Number(cmd?.TempsImpression)||60)*60000);$('planningStartDate').value=v14IsoDate(start);$('planningStartTime').value=`${String(start.getHours()).padStart(2,'0')}:${String(start.getMinutes()).padStart(2,'0')}`;$('planningEndDate').value=v14IsoDate(end);$('planningEndTime').value=`${String(end.getHours()).padStart(2,'0')}:${String(end.getMinutes()).padStart(2,'0')}`;renderPlanningColors(Number($('planningCommande').value),slot?.id||null);$('planningDeleteBtn').classList.toggle('hidden',!slot);$('planningModalTitle').textContent=slot?'Modifier le créneau':'Planifier une impression';majDureeEtConflit();planningModal.classList.remove('hidden');}
$('planningCommande').onchange=()=>{renderPlanningColors(Number($('planningCommande').value),null);const cmd=planningCommands.find(c=>Number(c.id)===Number($('planningCommande').value)),a=v14Local($('planningStartDate').value,$('planningStartTime').value),b=new Date(a.getTime()+(Number(cmd?.TempsImpression)||60)*60000);$('planningEndDate').value=v14IsoDate(b);$('planningEndTime').value=`${String(b.getHours()).padStart(2,'0')}:${String(b.getMinutes()).padStart(2,'0')}`;majDureeEtConflit();};
['planningPrinter','planningStartDate','planningStartTime','planningEndDate','planningEndTime'].forEach(id=>$(id).onchange=majDureeEtConflit);$('planningCloseBtn').onclick=$('planningCancelBtn').onclick=()=>planningModal.classList.add('hidden');
planningForm.onsubmit=async e=>{e.preventDefault();const a=v14Local($('planningStartDate').value,$('planningStartTime').value),b=v14Local($('planningEndDate').value,$('planningEndTime').value);if(b<=a)return alert('La fin doit être après le début.');const payload={CommandeID:Number($('planningCommande').value),Imprimante:$('planningPrinter').value,DateDebut:a.toISOString(),DateFin:b.toISOString(),Commentaire:$('planningCommentaire').value.trim()||null};let id=$('planningSlotId').value;if(id){const {error}=await db.from('PlanningImpression').update(payload).eq('id',id);if(error)return alert(error.message);}else{const {data,error}=await db.from('PlanningImpression').insert(payload).select('id').single();if(error)return alert(error.message);id=data.id;}try{await savePlanningColors(id);}catch(error){return alert('Créneau enregistré, mais erreur couleurs : '+error.message);}planningModal.classList.add('hidden');chargerPlanning();};
$('planningDeleteBtn').onclick=async()=>{const id=$('planningSlotId').value;if(!id)return;const {error}=await db.from('PlanningImpression').delete().eq('id',id);if(error)return alert(error.message);planningModal.classList.add('hidden');chargerPlanning();};$('prevWeek').onclick=()=>{planningWeekStart=v14AddDays(planningWeekStart,-7);chargerPlanning();};$('nextWeek').onclick=()=>{planningWeekStart=v14AddDays(planningWeekStart,7);chargerPlanning();};$('todayWeek').onclick=()=>{planningWeekStart=v14StartWeek(new Date());chargerPlanning();};document.querySelector('[data-page="planning"]').onclick=chargerPlanning;
