import './style.css'
import { db } from './lib/db';
import { FileProcessor } from './lib/FileProcessor';
import { EtlGenerator } from './lib/generators/EtlGenerator';
import { DataModelGenerator } from './lib/generators/DataModelGenerator';
import { DocxGenerator } from './lib/generators/DocxGenerator';
import { OfflineVerifier } from './lib/ux/OfflineVerifier';

const app = document.querySelector<HTMLDivElement>('#app')!;

const registerServiceWorker = async () => {
  if ('serviceWorker' in navigator) {
    try {
      // Use sw.js for production, sw.ts for development
      const swUrl = import.meta.env.PROD ? '/sw.js' : '/sw.ts';
      await navigator.serviceWorker.register(swUrl, {
        scope: '/',
      });
      console.log('SW registration successful');
    } catch (error) {
      console.error('SW: Registration failed:', error);
    }
  }
};

registerServiceWorker();

// --- Routing State ---
let currentView: 'dashboard' | 'detail' = 'dashboard';
let currentReportId: number | null = null;
let currentType: 'report' | 'datamodel' = 'report';
let currentMode: 'business' | 'technical' = 'business';

// --- HTML Template Helpers ---
function header() {
  return `
    <header class="bg-slate-800 text-white p-4 shadow-md z-10 transition-transform duration-300">
        <div class="max-w-4xl mx-auto flex justify-between items-center">
            <div class="flex items-center gap-3 cursor-pointer group" onclick="window.navigateTo('dashboard')">
                <div class="h-8 w-8 bg-white" style="mask: url(/t1analyserlogo.svg) no-repeat center / contain; -webkit-mask: url(/t1analyserlogo.svg) no-repeat center / contain;"></div>
                <h1 class="text-xl font-bold tracking-tight hover:text-blue-300">TechnologyOne Analyser</h1>
            </div>
            <div class="flex items-center">
                <span class="text-xs text-slate-400 mr-4">v0.1.0 (Testing)</span>

                <div id="header-controls" class="flex items-center gap-2">
                    <button onclick="window.verifyOffline()" title="Verify Privacy" class="group bg-emerald-600 hover:bg-emerald-700 text-white p-2 rounded-full font-medium transition-all duration-300 ease-in-out border border-emerald-700 flex items-center shadow-sm">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        <span class="max-w-0 overflow-hidden opacity-0 group-hover:max-w-xs group-hover:opacity-100 group-hover:ml-2 transition-all duration-300 ease-in-out whitespace-nowrap text-xs">Verify Privacy</span>
                    </button>

                    <button onclick="window.openFeedback()" title="Feedback" class="group bg-indigo-500 hover:bg-indigo-600 text-white p-2 rounded-full font-medium transition-all duration-300 ease-in-out border border-indigo-600 flex items-center shadow-sm">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        <span class="max-w-0 overflow-hidden opacity-0 group-hover:max-w-xs group-hover:opacity-100 group-hover:ml-2 transition-all duration-300 ease-in-out whitespace-nowrap text-xs">Feedback</span>
                    </button>

                    <button onclick="window.exportJson()" title="Backup Library" class="group bg-slate-700 hover:bg-slate-600 text-slate-200 p-2 rounded-full font-medium transition-all duration-300 ease-in-out border border-slate-600 flex items-center shadow-sm">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                        <span class="max-w-0 overflow-hidden opacity-0 group-hover:max-w-xs group-hover:opacity-100 group-hover:ml-2 transition-all duration-300 ease-in-out whitespace-nowrap text-xs">Backup Library</span>
                    </button>
                </div>
            </div>
        </div>
    </header>
    `;
}

function formatDate(date: Date) {
  const d = new Date(date);
  const day = d.getDate();
  const month = d.toLocaleString('en-US', { month: 'short' });
  const year = d.getFullYear();
  const currentYear = new Date().getFullYear();
  return year === currentYear ? `${day} ${month}` : `${day} ${month} ${year}`;
}

function dashboardLayout(items: any[]) {
  const list = items.map(r => `
        <div class="bg-white p-4 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition flex justify-between items-center group relative">
            <div class="cursor-pointer grow" onclick="window.navigateTo('detail', ${r.id}, '${r.type}')">
                <div class="flex items-center space-x-2 mb-1">
                    <span class="text-[0.65rem] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded border ${r.type === 'report' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-purple-50 text-purple-700 border-purple-200'}">
                        ${r.type === 'report' ? 'ETL' : 'Data Model'}
                    </span>
                    ${r.type === 'datamodel' && r.metadata?.processMode ? `
                        <span class="text-[0.65rem] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded border ${r.metadata.processMode === 'Stored' ? 'bg-cyan-50 text-cyan-700 border-cyan-200' : 'bg-gray-50 text-gray-500 border-gray-200'}">
                            ${r.metadata.processMode}
                        </span>
                    ` : ''}
                    <h3 class="font-bold text-gray-800 group-hover:text-blue-600">${r.metadata.name}</h3>
                </div>
                <p class="text-xs text-gray-500">Publisher: ${r.metadata.owner} • Ver: ${r.metadata.version}</p>
                <p class="text-xs text-gray-400 mt-1 truncate max-w-md">${r.metadata.description}</p>
            </div>
             <div class="flex items-center space-x-4">
                <div class="text-xs text-gray-400">
                    ${formatDate(r.dateAdded)}
                </div>
                <button onclick="event.stopPropagation(); window.deleteEntity(${r.id}, '${r.type}')" class="text-gray-300 hover:text-red-500 transition p-1" title="Delete">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                </button>
            </div>
        </div>
    `).join('');

  return `
    <main class="grow p-6 bg-gray-100 w-full">
        <div class="max-w-4xl mx-auto space-y-6">
            <!-- Upload -->
            <div id="dropZone" class="bg-white p-10 rounded-xl shadow-sm border-2 border-dashed border-gray-300 text-center transition-all hover:border-blue-500 hover:bg-blue-50">
                <div class="space-y-3 pointer-events-none">
                    <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-50 text-blue-600 mb-2">
                        <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
                    </div>
                    <h2 class="text-xl font-bold text-gray-900">Upload Definitions</h2>
                    <p class="text-sm text-gray-500">Drag & drop <code>.t1etlp</code> or <code>.t1dm</code> files here</p>
                </div>
                 <input type="file" id="fileInput" multiple accept=".t1etlp,.t1dm" class="hidden">
            </div>

            <!-- List -->
            <div>
                <h2 class="text-lg font-bold text-gray-700 mb-3">Library (${items.length})</h2>
                <div class="space-y-3">
                    ${list}
                </div>
            </div>
        </div>
    </main>
    `;
}

async function render() {
  let content = header();

  if (currentView === 'dashboard') {
    const reports = await db.reports.toArray();
    const dms = await db.dataModels.toArray();
    const allItems = [
      ...reports.map(r => ({ ...r, type: 'report' })),
      ...dms.map(d => ({ ...d, type: 'datamodel' }))
    ];
    allItems.sort((a, b) => b.dateAdded.getTime() - a.dateAdded.getTime());
    content += dashboardLayout(allItems);
  } else if (currentView === 'detail' && currentReportId) {
    content += `
        <main class="grow p-6 bg-gray-100 w-full animate-fade-in">
             <div class="w-full">
                 <div class="sticky top-0 z-30 glass-toolbar flex flex-col md:flex-row md:items-center justify-between gap-4 py-4 mb-2">
                    <button onclick="window.navigateTo('dashboard')" class="text-sm text-gray-500 hover:text-gray-900 flex items-center">
                        <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
                        Back to Library
                    </button>

                    <div class="bg-white p-1 rounded-xl shadow-sm border border-gray-200 flex text-xs font-medium self-center">
                        <button class="mode-btn ${currentMode === 'business' ? 'active' : ''} px-6 py-2 rounded-lg transition-all duration-200 text-gray-500 hover:text-gray-900" onclick="window.setMode('business')">Business View</button>
                        <button class="mode-btn ${currentMode === 'technical' ? 'active' : ''} px-6 py-2 rounded-lg transition-all duration-200 text-gray-500 hover:text-gray-900" onclick="window.setMode('technical')">Technical View</button>
                    </div>
                    <button onclick="window.exportDocx()" class="text-sm bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-bold transition-all shadow-sm flex items-center justify-center">
                         <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                         Export
                    </button>
                 </div>
                 <div id="detailContainer" class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden w-full flex flex-col max-w-4xl mx-auto">
                    <div class="p-12 text-center text-gray-400">
                        <div class="animate-pulse flex flex-col items-center">
                            <div class="h-4 w-48 bg-gray-200 rounded mb-4"></div>
                            <div class="h-4 w-64 bg-gray-200 rounded"></div>
                        </div>
                    </div>
                 </div>
             </div>
        </main>
        `;
  }

  app.className = "flex flex-col min-h-screen text-left";
  app.innerHTML = content;

  if (currentView === 'detail' && currentReportId) {
    try {
      let html = '';
      if (currentType === 'report') {
        html = await EtlGenerator.generateHtmlView(currentReportId, currentMode);
      } else {
        html = await DataModelGenerator.generateHtmlView(currentReportId, currentMode);
      }
      const container = document.getElementById('detailContainer');
      if (container) container.innerHTML = html;
    } catch (e: any) {
      const container = document.getElementById('detailContainer');
      if (container) container.innerHTML = `<div class="p-4 bg-red-50 text-red-700 rounded border border-red-200">
                <h3 class="font-bold">Error Loading Item</h3>
                <pre class="mt-2 text-xs overflow-auto">${e.message}\n${e.stack}</pre>
             </div>`;
      console.error(e);
    }
  }

  if (currentView === 'dashboard') {
    setupDragAndDrop();
  }
}

function setupDragAndDrop() {
  const dropZone = document.getElementById('dropZone');
  if (!dropZone) return;

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('border-blue-500', 'bg-blue-50');
  });

  dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropZone.classList.remove('border-blue-500', 'bg-blue-50');
  });

  dropZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropZone.classList.remove('border-blue-500', 'bg-blue-50');
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length === 0) return;
    dropZone.innerHTML = `<div class="text-blue-600 font-bold animate-pulse">Processing ${files.length} file(s)...</div>`;
    for (const file of files) {
      try {
        await FileProcessor.processAndSave(file);
      } catch (err) {
        console.error(err);
        alert(`Failed to process ${file.name}`);
      }
    }
    render();
  });

  dropZone.addEventListener('click', () => {
    const input = document.getElementById('fileInput') as HTMLInputElement;
    if (input) input.click();
  });

  const input = document.getElementById('fileInput') as HTMLInputElement;
  if (input) {
    input.addEventListener('change', async (e: any) => {
      const files = Array.from(e.target.files || []) as File[];
      if (files.length === 0) return;
      dropZone.innerHTML = `<div class="text-blue-600 font-bold animate-pulse">Processing ${files.length} file(s)...</div>`;
      for (const file of files) {
        try {
          await FileProcessor.processAndSave(file);
        } catch (err) {
          console.error(err);
          alert(`Failed to process ${file.name}`);
        }
      }
      render();
    });
  }
}

// --- Global Actions ---
declare global {
  interface Window {
    navigateTo: (view: 'dashboard' | 'detail', id?: number, type?: 'report' | 'datamodel') => void;
    setMode: (mode: 'business' | 'technical') => void;
    exportDocx: () => void;
    deleteEntity: (id: number, type: 'report' | 'datamodel') => void;
    editStepNote: (reportId: string, stepId: string) => void;
    saveStepNote: (reportId: string, stepId: string) => void;
    cancelNote: (stepId: string) => void;
    exportJson: () => void;
    verifyOffline: () => void;
    openFeedback: () => void;
  }
}

window.navigateTo = (view, id, type) => {
  currentView = view;
  if (id) currentReportId = id;
  if (type) currentType = type;
  render();
};

window.setMode = (mode) => {
  currentMode = mode;
  render();
};

window.exportDocx = async () => {
  if (currentReportId) {
    try {
      if (currentType === 'report') {
        await DocxGenerator.downloadDocx(currentReportId, currentMode);
      } else {
        await DocxGenerator.downloadDataModelDocx(currentReportId, currentMode);
      }
    } catch (e) {
      console.error(e);
      alert('Export failed');
    }
  }
};

window.exportJson = async () => {
  try {
    const reports = await db.reports.toArray();
    const dataModels = await db.dataModels.toArray();
    const exportData = {
      generated: new Date().toISOString(),
      version: '1.0',
      appVersion: '3.1',
      library: { reports, dataModels }
    };
    const filename = `t1guru-library-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error(e);
    alert('Library backup failed');
  }
};

window.verifyOffline = () => {
  new OfflineVerifier();
};

window.deleteEntity = async (id: number, type: 'report' | 'datamodel') => {
  if (confirm(`Are you sure you want to delete this ${type === 'report' ? 'Report' : 'Data Model'}?`)) {
    if (type === 'report') await db.reports.delete(id);
    else await db.dataModels.delete(id);
    render();
  }
};

window.editStepNote = (_reportId: string, stepId: string) => {
  const editor = document.getElementById(`note-editor-${stepId}`);
  if (editor) {
    editor.classList.remove('hidden');
    const textarea = editor.querySelector('textarea');
    if (textarea) textarea.focus();
  }
};

window.cancelNote = (stepId: string) => {
  const editor = document.getElementById(`note-editor-${stepId}`);
  if (editor) editor.classList.add('hidden');
};

window.saveStepNote = async (reportId: string, stepId: string) => {
  const rid = parseInt(reportId);
  const editor = document.getElementById(`note-editor-${stepId}`);
  const textarea = editor?.querySelector('textarea');
  if (!textarea) return;
  const text = textarea.value.trim();
  if (currentType === 'report') {
    const report = await db.reports.get(rid);
    if (report) {
      const stepNotes = report.stepNotes || {};
      if (text) stepNotes[stepId] = text; else delete stepNotes[stepId];
      await db.reports.update(rid, { stepNotes });
      render();
    }
  } else {
    const dm = await db.dataModels.get(rid);
    if (dm) {
      const stepNotes = dm.stepNotes || {};
      if (text) stepNotes[stepId] = text; else delete stepNotes[stepId];
      await db.dataModels.update(rid, { stepNotes });
      render();
    }
  }
};

// --- Feedback Integration ---
const FORM_ID = "1FAIpQLSd6QUXK9Rk2zBi_HFSA-freeSqQMRbKPxkaNndL_QczQ1nbUQ";
const ENTRY_BROWSER = "entry.924115014";
const ENTRY_OS = "entry.495502239";

function getOS(): string {
  const n = window.navigator;
  const ua = n.userAgent;
  // @ts-ignore
  const platform = n.userAgentData?.platform || n.platform || 'Unknown';
  if (platform.toLowerCase().startsWith('win')) return 'Windows';
  if (platform.toLowerCase().startsWith('mac')) return 'MacOS';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('Linux')) return 'Linux';
  if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
  return platform;
}

window.openFeedback = () => {
  const browserInfo = `${navigator.userAgent} (v3.1 Local)`;
  const osInfo = getOS();
  const params = new URLSearchParams();
  params.append(ENTRY_BROWSER, browserInfo);
  params.append(ENTRY_OS, osInfo);
  params.append("embedded", "true");
  const formUrl = `https://docs.google.com/forms/d/e/${FORM_ID}/viewform?${params.toString()}`;

  const modal = document.createElement('div');
  modal.id = 'feedback-modal';
  modal.className = "fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in";
  modal.innerHTML = `
    <div class="bg-white rounded-xl shadow-2xl w-full max-w-2xl h-[80vh] flex flex-col overflow-hidden relative animate-scale-in">
        <div class="bg-slate-800 text-white px-4 py-3 flex justify-between items-center shrink-0">
            <h3 class="font-bold text-lg flex items-center">
                <svg class="w-5 h-5 mr-2 text-yellow-400" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" /></svg>
                Send Feedback
            </h3>
            <button id="close-feedback" class="text-slate-400 hover:text-white transition-colors p-1 rounded hover:bg-slate-700">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
        </div>
        <div class="grow bg-slate-50 relative">
             <div class="absolute inset-0 flex items-center justify-center z-0 text-slate-400">
                <svg class="animate-spin h-8 w-8 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
             </div>
            <iframe src="${formUrl}" class="absolute inset-0 w-full h-full z-10" frameborder="0" marginheight="0" marginwidth="0">Just a moment...</iframe>
        </div>
        <div class="bg-gray-100 px-4 py-2 text-[10px] text-gray-500 border-t border-gray-200 text-center">
            Operating System: <span class="font-mono text-gray-600">${osInfo}</span> • 
            Browser: <span class="font-mono text-gray-600">${navigator.userAgent.substring(0, 30)}...</span>
        </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector('#close-feedback')?.addEventListener('click', () => document.body.removeChild(modal));
  modal.addEventListener('click', (e) => { if (e.target === modal) document.body.removeChild(modal); });
};

// --- Tour Logic ---
function checkAndShowTour() {
  if (localStorage.getItem('t1guru_tour_seen')) return;

  const controls = document.getElementById('header-controls');
  if (!controls) return;

  // Create Overlay
  const overlay = document.createElement('div');
  overlay.className = "fixed inset-0 bg-black/30 z-40 animate-fade-in"; // Reduced opacity, no blur
  overlay.id = "tour-overlay";

  // Highlight Controls
  controls.classList.add('z-50', 'relative', 'bg-slate-800', 'px-3', 'py-2', 'rounded-full', '-mr-2', 'ring-4', 'ring-blue-500/30');

  // Create Popup
  const popup = document.createElement('div');
  popup.className = "fixed max-w-sm bg-white p-6 rounded-xl shadow-2xl z-50 animate-scale-in text-slate-800 border border-blue-500/20";

  // Calculate Position
  const rect = controls.getBoundingClientRect();
  popup.style.top = `${rect.bottom + 16}px`;
  popup.style.right = `${window.innerWidth - rect.right}px`;

  popup.innerHTML = `
        <div class="absolute -top-2 right-4 w-4 h-4 bg-white transform rotate-45 border-l border-t border-blue-500/20"></div>
        <div class="flex items-center mb-3">
             <span class="text-2xl mr-3">👋</span>
             <h3 class="font-bold text-lg text-slate-900">Welcome to the Analyser!</h3>
        </div>
        <p class="text-sm text-gray-600 mb-4 leading-relaxed">It looks like you're new here. We've equipped your workspace with some essential tools to keep your data safe and your library organised:</p>
        <div class="bg-slate-50 rounded-lg p-3 mb-5 border border-slate-100">
            <ul class="text-xs space-y-3 text-gray-600">
                <li class="flex items-start"><div class="w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mr-2 shrink-0">🛡️</div> <div><b>Privacy Guard:</b> Run a quick check to verify your session is 100% offline and secure.</div></li>
                <li class="flex items-start"><div class="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mr-2 shrink-0">💬</div> <div><b>Feedback:</b> Spotted a bug or have an idea? We'd love to hear from you.</div></li>
                <li class="flex items-start"><div class="w-6 h-6 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center mr-2 shrink-0">💾</div> <div><b>Library Backup:</b> Export your offline database as a JSON file at any time.</div></li>
            </ul>
        </div>
        <div class="text-right">
            <button id="close-tour" class="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-bold shadow-md transition-all transform active:scale-95 flex items-center ml-auto">
                Start Exploring
                <svg class="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6"></path></svg>
            </button>
        </div>
    `;

  document.body.appendChild(overlay);
  document.body.appendChild(popup);

  // Close Handler
  const close = () => {
    localStorage.setItem('t1guru_tour_seen', 'true');
    overlay.classList.add('opacity-0');
    popup.classList.add('opacity-0', 'translate-y-4');
    setTimeout(() => {
      if (document.body.contains(overlay)) document.body.removeChild(overlay);
      if (document.body.contains(popup)) document.body.removeChild(popup);
      controls.classList.remove('z-50', 'relative', 'bg-slate-800', 'px-3', 'py-2', 'rounded-full', '-mr-2', 'ring-4', 'ring-blue-500/30');
    }, 300);
  };

  document.getElementById('close-tour')?.addEventListener('click', close);
  overlay.addEventListener('click', close);
}

// Start App
render().then(() => {
  setTimeout(checkAndShowTour, 1000);
});
