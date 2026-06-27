/**
 * UPSTAKE (Montante Neon)
 * Application logic - Vanilla JS, IndexedDB, SPA Router
 */

// ==========================================
// 1. INDEXED DB WRAPPER
// ==========================================
const DB_NAME = 'upstake_db';
const DB_VERSION = 1;
let dbInstance = null;

const initDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = (e) => reject('IndexedDB error: ' + e.target.error);
    
    request.onsuccess = (e) => {
      dbInstance = e.target.result;
      resolve(dbInstance);
    };
    
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('montantes')) {
        db.createObjectStore('montantes', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };
  });
};

const dbGetAll = (storeName) => {
  return new Promise((resolve, reject) => {
    const tx = dbInstance.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const dbGet = (storeName, key) => {
  return new Promise((resolve, reject) => {
    const tx = dbInstance.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const dbPut = (storeName, item) => {
  return new Promise((resolve, reject) => {
    const tx = dbInstance.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.put(item);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const dbClear = (storeName) => {
  return new Promise((resolve, reject) => {
    const tx = dbInstance.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

// ==========================================
// 2. SPA ROUTER
// ==========================================
const views = ['view-montantes', 'view-analyse', 'view-stats', 'view-settings'];

function showView(viewId) {
  // Update nav items
  document.querySelectorAll('.nav-item').forEach(nav => {
    if (nav.dataset.target === viewId) {
      nav.classList.add('active');
    } else {
      nav.classList.remove('active');
    }
  });

  // Update views
  views.forEach(v => {
    document.getElementById(v).classList.add('hidden');
  });
  document.getElementById(viewId).classList.remove('hidden');

  // Trigger view specific logic
  if (viewId === 'view-montantes') {
    showMontantesList();
  } else if (viewId === 'view-stats') {
    renderStats();
  } else if (viewId === 'view-settings') {
    loadSettings();
  }
}

document.querySelectorAll('.nav-item').forEach(nav => {
  nav.addEventListener('click', (e) => {
    const target = e.currentTarget.dataset.target;
    showView(target);
  });
});

// ==========================================
// 3. PWA INSTALL PROMPT
// ==========================================
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  
  // Show if not already installed/dismissed in this session
  if (!sessionStorage.getItem('installPromptDismissed')) {
    document.getElementById('install-modal').classList.remove('hidden');
  }
});

document.getElementById('btn-close-install').addEventListener('click', () => {
  document.getElementById('install-modal').classList.add('hidden');
  sessionStorage.setItem('installPromptDismissed', 'true');
});

document.getElementById('btn-install').addEventListener('click', async () => {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      document.getElementById('install-modal').classList.add('hidden');
    }
    deferredPrompt = null;
  }
});

// Register Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js');
  });
}

// ==========================================
// 4. MONTANTES LOGIC
// ==========================================
let currentMontanteId = null;

async function showMontantesList() {
  document.getElementById('montante-create-container').classList.add('hidden');
  document.getElementById('montante-detail-container').classList.add('hidden');
  document.getElementById('montantes-list-container').classList.remove('hidden');
  
  const listEl = document.getElementById('montantes-list');
  listEl.innerHTML = '<div class="text-center text-muted">Chargement...</div>';
  
  const montantes = await dbGetAll('montantes');
  
  if (montantes.length === 0) {
    listEl.innerHTML = `
      <div class="card glass-panel text-center text-muted py-8">
        <div class="icon-wrapper small mx-auto mb-4 opacity-50">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
        </div>
        <p class="font-outfit font-medium">Aucune stratégie active.</p>
        <p class="text-sm mt-2 opacity-70">Créez votre première montante pour commencer !</p>
      </div>`;
    return;
  }

  // Sort by date desc
  montantes.sort((a, b) => b.createdAt - a.createdAt);

  listEl.innerHTML = '';
  montantes.forEach(m => {
    const item = document.createElement('div');
    item.className = `list-item status-${m.status}`;
    
    // Calculate progress
    const wonSteps = m.steps.filter(s => s.status === 'won').length;
    const totalSteps = m.steps.length;
    
    let statusText = "En cours";
    if (m.status === 'won') statusText = "Réussie 🎉";
    if (m.status === 'lost') statusText = "Échouée ❌";

    item.innerHTML = `
      <div>
        <div class="font-outfit font-bold text-lg">Objectif: ${m.goal.toLocaleString()} CDF</div>
        <div class="text-sm text-muted mt-1">Capital actuel: <span class="text-white">${m.currentCapital.toLocaleString()} CDF</span></div>
        <div class="text-xs text-muted mt-2 uppercase tracking-wide">Étape ${wonSteps}/${totalSteps} • <span class="${m.status === 'won' ? 'text-neon' : m.status === 'lost' ? 'text-danger' : 'text-white'}">${statusText}</span></div>
      </div>
      <div class="text-muted opacity-50">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
      </div>
    `;
    item.addEventListener('click', () => showMontanteDetail(m.id));
    listEl.appendChild(item);
  });
}

document.getElementById('btn-new-montante').addEventListener('click', () => {
  document.getElementById('montantes-list-container').classList.add('hidden');
  document.getElementById('montante-create-container').classList.remove('hidden');
});

document.getElementById('btn-back-montantes').addEventListener('click', () => {
  showMontantesList();
});

document.getElementById('btn-save-montante').addEventListener('click', async () => {
  const start = parseFloat(document.getElementById('input-start-capital').value);
  const goal = parseFloat(document.getElementById('input-goal').value);
  const odds = parseFloat(document.getElementById('input-odds').value);

  if (!start || !goal || !odds || start >= goal || odds <= 1.0) {
    alert("Veuillez entrer des valeurs valides. L'objectif doit être supérieur au départ et la cote > 1.0");
    return;
  }

  // Calculate steps theoretically
  let steps = [];
  let current = start;
  let stepNum = 1;
  
  while(current < goal && stepNum <= 50) {
    let expectedReturn = current * odds;
    // Cap at goal
    if (expectedReturn > goal && current < goal) {
      expectedReturn = goal;
      const requiredOdds = goal / current;
      steps.push({
        step: stepNum,
        stake: current,
        odds: requiredOdds.toFixed(2),
        expectedReturn: expectedReturn,
        status: 'pending'
      });
      break;
    }

    steps.push({
      step: stepNum,
      stake: current,
      odds: odds,
      expectedReturn: expectedReturn,
      status: 'pending'
    });
    current = expectedReturn;
    stepNum++;
  }

  const montante = {
    id: Date.now().toString(),
    startCapital: start,
    goal: goal,
    targetOdds: odds,
    currentCapital: start,
    status: 'active', // active, won, lost
    steps: steps,
    createdAt: Date.now()
  };

  await dbPut('montantes', montante);
  
  // Clear form
  document.getElementById('input-start-capital').value = '';
  document.getElementById('input-goal').value = '';
  document.getElementById('input-odds').value = '';

  showMontantesList();
});

async function showMontanteDetail(id) {
  currentMontanteId = id;
  document.getElementById('montantes-list-container').classList.add('hidden');
  document.getElementById('montante-create-container').classList.add('hidden');
  document.getElementById('montante-detail-container').classList.remove('hidden');
  
  await renderMontanteDetail();
}

async function renderMontanteDetail() {
  const m = await dbGet('montantes', currentMontanteId);
  const container = document.getElementById('montante-detail-content');
  
  if (!m) {
    container.innerHTML = "Introuvable.";
    return;
  }

  let html = `
    <div class="card glass-panel mb-6 text-center py-6">
      <div class="text-sm text-muted uppercase tracking-widest font-medium mb-2">Progression</div>
      <h2 class="font-outfit text-2xl font-bold text-neon drop-shadow-neon">${m.currentCapital.toLocaleString()} <span class="text-muted text-lg font-normal">/ ${m.goal.toLocaleString()} CDF</span></h2>
      <div class="text-xs text-muted mt-2 bg-black bg-opacity-40 inline-block px-3 py-1 rounded-full border border-gray-800">Cote moyenne : ${m.targetOdds}</div>
    </div>
    
    <h3 class="font-outfit font-semibold text-lg mb-4 flex items-center gap-2">
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-neon"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/></svg>
      Étapes
    </h3>
  `;

  let activeStepFound = false;

  m.steps.forEach((s, index) => {
    let cardClass = "step-card";
    if (s.status === 'won') cardClass += " won";
    if (s.status === 'lost') cardClass += " lost";
    
    let isCurrentStep = false;
    if (s.status === 'pending' && !activeStepFound && m.status === 'active') {
      isCurrentStep = true;
      activeStepFound = true;
      cardClass += " current";
    }

    html += `
      <div class="${cardClass}">
        <div class="flex justify-between items-center mb-2">
          <div class="font-outfit font-semibold">Palier ${s.step}</div>
          <div class="text-sm text-muted">Mise: <span class="text-white font-bold">${s.stake.toLocaleString()} CDF</span></div>
        </div>
        <div class="text-xs text-muted bg-black bg-opacity-20 p-2 rounded-lg mb-3">
          Cote: <strong class="text-white">${s.odds}</strong> <span class="mx-2 opacity-50">|</span> 
          Retour: <strong class="text-white">${s.expectedReturn.toLocaleString()} CDF</strong>
        </div>
        
        ${isCurrentStep ? `
          <div class="flex gap-3 mt-3">
            <button class="btn-step-action btn-step-win flex-1 flex items-center justify-center gap-2" onclick="validateStep(${index}, 'won')">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
              Gagné
            </button>
            <button class="btn-step-action btn-step-loss flex-1 flex items-center justify-center gap-2" onclick="validateStep(${index}, 'lost')">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              Perdu
            </button>
          </div>
        ` : ''}
        
        ${s.status !== 'pending' ? `
           <div class="text-xs mt-2 text-right font-medium uppercase tracking-wider ${s.status === 'won' ? 'text-neon' : 'text-danger'}">
              ${s.status === 'won' ? '✓ Validé' : '✗ Échoué'}
           </div>
        ` : ''}
      </div>
    `;
  });

  if (m.status === 'won') {
    html += `<div class="card glass-panel text-center text-neon font-outfit font-bold mt-6 py-6 border-neon drop-shadow-neon">Montante Complétée ! Objectif Atteint 🏆</div>`;
  } else if (m.status === 'lost') {
    html += `<div class="card glass-panel text-center text-danger font-outfit font-bold mt-6 py-6 border-danger-glass">Montante Échouée 💥</div>`;
  }

  html += `<button class="btn-danger w-full mt-6" onclick="deleteMontante('${m.id}')">Supprimer la stratégie</button>`;

  container.innerHTML = html;
}

window.validateStep = async function(stepIndex, outcome) {
  const m = await dbGet('montantes', currentMontanteId);
  const step = m.steps[stepIndex];
  
  step.status = outcome;
  
  if (outcome === 'won') {
    m.currentCapital = step.expectedReturn;
    // Check if it's the last step
    if (stepIndex === m.steps.length - 1 || m.currentCapital >= m.goal) {
      m.status = 'won';
    }
  } else {
    m.status = 'lost';
    // Current capital goes to 0 logically for this strategy branch
    m.currentCapital = 0;
  }

  await dbPut('montantes', m);
  renderMontanteDetail();
};

window.deleteMontante = async function(id) {
  if(confirm('Supprimer cette montante ?')) {
    const tx = dbInstance.transaction('montantes', 'readwrite');
    tx.objectStore('montantes').delete(id);
    tx.oncomplete = () => showMontantesList();
  }
}

document.getElementById('btn-back-detail').addEventListener('click', () => {
  currentMontanteId = null;
  showMontantesList();
});

// ==========================================
// 5. IA ANALYSE LOGIC (Gemini REST)
// ==========================================
const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = () => resolve(reader.result);
  reader.onerror = error => reject(error);
});

document.getElementById('btn-analyze').addEventListener('click', async () => {
  // Check connection
  if (!navigator.onLine) {
    alert("❌ L'analyse IA nécessite une connexion internet. Vous êtes hors-ligne.");
    return;
  }

  const textInput = document.getElementById('input-coupon-text').value;
  const fileInput = document.getElementById('input-coupon-img');
  
  if (!textInput && fileInput.files.length === 0) {
    alert("Veuillez fournir les détails du coupon ou une image.");
    return;
  }

  const apiKeySetting = await dbGet('settings', 'gemini_api_key');
  if (!apiKeySetting || !apiKeySetting.value) {
    alert("Clé API manquante. Allez dans l'onglet Paramètres pour la configurer.");
    showView('view-settings');
    return;
  }

  const modelSetting = await dbGet('settings', 'ai_model');
  const model = modelSetting ? modelSetting.value : 'gemini-1.5-flash';

  const btn = document.getElementById('btn-analyze');
  btn.disabled = true;
  btn.textContent = "Analyse en cours...";

  const resultContainer = document.getElementById('analyse-result-container');
  const resultContent = document.getElementById('analyse-result-content');
  resultContainer.classList.add('hidden');

  try {
    const promptText = `Tu es un expert mondial en paris sportifs et stratégies de bankroll. Analyse ce coupon de pari.
Fournis :
1. Une analyse rapide des matchs/sélections.
2. Le niveau de risque (Faible, Moyen, Élevé, Suicidaire).
3. Ton conseil (Faut-il valider ce coupon dans le cadre d'une montante ?).
Voici les détails : ${textInput}`;

    let parts = [{ text: promptText }];

    if (fileInput.files.length > 0) {
      const file = fileInput.files[0];
      const base64Full = await fileToBase64(file);
      const base64Data = base64Full.split(',')[1];
      parts.push({
        inlineData: {
          mimeType: file.type,
          data: base64Data
        }
      });
    }

    const payload = {
      contents: [{ parts }]
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKeySetting.value}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Erreur API: ${response.status}`);
    }

    const data = await response.json();
    const aiText = data.candidates[0].content.parts[0].text;
    
    // Simple markdown to HTML
    const formattedHtml = aiText
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');

    resultContent.innerHTML = `<div class="ai-result">${formattedHtml}</div>`;
    resultContainer.classList.remove('hidden');

  } catch (error) {
    console.error(error);
    alert("Erreur lors de l'analyse : " + error.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Analyser avec l'IA";
  }
});


// ==========================================
// 6. STATS LOGIC
// ==========================================
async function renderStats() {
  const montantes = await dbGetAll('montantes');
  
  let totalWon = 0;
  let totalLost = 0;
  let netProfit = 0;

  montantes.forEach(m => {
    if (m.status === 'won') {
      totalWon++;
      netProfit += (m.goal - m.startCapital);
    } else if (m.status === 'lost') {
      totalLost++;
      netProfit -= m.startCapital;
    }
  });

  document.getElementById('stat-won').textContent = totalWon;
  document.getElementById('stat-lost').textContent = totalLost;
  
  const profitEl = document.getElementById('stat-profit');
  profitEl.textContent = `${netProfit > 0 ? '+' : ''}${netProfit.toLocaleString()} CDF`;
  if(netProfit < 0) {
    profitEl.classList.remove('neon-text');
    profitEl.classList.add('text-danger');
  } else {
    profitEl.classList.add('neon-text');
    profitEl.classList.remove('text-danger');
  }

  const totalCompleted = totalWon + totalLost;
  const winRate = totalCompleted > 0 ? Math.round((totalWon / totalCompleted) * 100) : 0;
  
  document.getElementById('stat-success-bar').style.width = `${winRate}%`;
  document.getElementById('stat-success-text').textContent = `${winRate}%`;
}


// ==========================================
// 7. SETTINGS LOGIC
// ==========================================
async function loadSettings() {
  const apiKey = await dbGet('settings', 'gemini_api_key');
  if (apiKey) document.getElementById('input-api-key').value = apiKey.value;
  
  const model = await dbGet('settings', 'ai_model');
  if (model) document.getElementById('select-ai-model').value = model.value;
}

document.getElementById('btn-save-settings').addEventListener('click', async () => {
  const key = document.getElementById('input-api-key').value.trim();
  const model = document.getElementById('select-ai-model').value;
  
  if(key) await dbPut('settings', { key: 'gemini_api_key', value: key });
  await dbPut('settings', { key: 'ai_model', value: model });
  
  alert('Paramètres sauvegardés localement.');
});

document.getElementById('btn-reset-data').addEventListener('click', async () => {
  if (confirm("⚠️ Êtes-vous sûr de vouloir tout supprimer ? Cette action est irréversible.")) {
    await dbClear('montantes');
    alert("Toutes les données ont été réinitialisées.");
    renderStats();
  }
});


// ==========================================
// BOOTSTRAP
// ==========================================
window.addEventListener('DOMContentLoaded', async () => {
  try {
    await initDB();
    // Default view
    showView('view-montantes');
  } catch (error) {
    console.error("DB Initialization failed", error);
    alert("Erreur lors de l'initialisation de la base de données locale.");
  }
});
