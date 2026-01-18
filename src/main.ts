import './style.css'
import { db } from './lib/db';
import { FileProcessor } from './lib/FileProcessor';
import { EtlGenerator } from './lib/generators/EtlGenerator';
import { DataModelGenerator } from './lib/generators/DataModelGenerator';
import { DocxGenerator } from './lib/generators/DocxGenerator';
import { OfflineVerifier } from './lib/ux/OfflineVerifier';
// Not using react hooks in vanilla, but querying directly

// --- Subscribable State Implementation for Vanilla ---
// We'll just re-render when needed for simplicity in Vanilla JS
// In a real app we might use signals or observables.

const app = document.querySelector<HTMLDivElement>('#app')!;

// main.ts

const registerServiceWorker = async () => {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.ts', {
        scope: '/',
      });

      if (registration.installing) {
        console.log('SW: Installing');
      } else if (registration.waiting) {
        console.log('SW: Installed and waiting');
      } else if (registration.active) {
        console.log('SW: Active');
      }
    } catch (error) {
      console.error('SW: Registration failed:', error);
    }
  } else {
    console.warn('SW: Not supported in this browser');
  }
};

// Execute
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
                <div class="h-8 w-8 bg-white" style="mask: url(/t1gurulogo.svg) no-repeat center / contain; -webkit-mask: url(/t1gurulogo.svg) no-repeat center / contain;"></div>
                <h1 class="text-xl font-bold tracking-tight hover:text-blue-300">TechnologyOne Analyser</h1>
            </div>
            <div class="flex items-center space-x-4">
                <span class="text-xs text-slate-400 mr-4">v3.1 (Local)</span>
                <button onclick="window.verifyOffline()" class="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-md font-medium transition-colors border border-emerald-700 flex items-center shadow-sm">
                    <svg class="w-3 h-3 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    Verify Privacy
                </button>
                <button onclick="window.exportJson()" class="text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-1.5 rounded-md font-medium transition-colors border border-slate-600 flex items-center">
                    <svg class="w-3 h-3 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                    Backup Library
                </button>
            </div>
        </div>
    </header>
    `;
}

const formatDate = (date: Date) => {
  const d = new Date(date);
  const day = d.getDate();
  const month = d.toLocaleString('en-US', { month: 'short' });
  const year = d.getFullYear();
  const currentYear = new Date().getFullYear();

  return year === currentYear ? `${day} ${month}` : `${day} ${month} ${year}`;
};

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
  // 1. Header
  let content = header();

  // 2. Body
  if (currentView === 'dashboard') {
    const reports = await db.reports.toArray();
    const dms = await db.dataModels.toArray();

    const allItems = [
      ...reports.map(r => ({ ...r, type: 'report' })),
      ...dms.map(d => ({ ...d, type: 'datamodel' }))
    ];

    // Sort by date desc
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
                    
                    ${currentType === 'report' ? `
                    <div class="bg-white p-1 rounded-xl shadow-sm border border-gray-200 flex text-xs font-medium self-center">
                        <button class="mode-btn ${currentMode === 'business' ? 'active' : ''} px-6 py-2 rounded-lg transition-all duration-200 text-gray-500 hover:text-gray-900" onclick="window.setMode('business')">Business View</button>
                        <button class="mode-btn ${currentMode === 'technical' ? 'active' : ''} px-6 py-2 rounded-lg transition-all duration-200 text-gray-500 hover:text-gray-900" onclick="window.setMode('technical')">Technical View</button>
                    </div>

                    <button onclick="window.exportDocx()" class="text-sm bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-bold transition-all shadow-sm flex items-center justify-center">
                         <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                         Export
                    </button>
                    ` : '<div></div>'}
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

  app.className = "flex flex-col min-h-screen text-left"; // Tailwind classes
  app.innerHTML = content;

  // Post-render logic
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
    render(); // Refresh list
  });

  // Click to upload
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

// --- Global Actions (attached to window for HTML onclicks) ---
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
      library: {
        reports,
        dataModels
      }
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
    if (type === 'report') {
      await db.reports.delete(id);
    } else {
      await db.dataModels.delete(id);
    }
    render(); // Refresh list
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
      if (text) stepNotes[stepId] = text;
      else delete stepNotes[stepId];

      await db.reports.update(rid, { stepNotes });
      render();
    }
  } else {
    const dm = await db.dataModels.get(rid);
    if (dm) {
      const stepNotes = dm.stepNotes || {};
      if (text) stepNotes[stepId] = text;
      else delete stepNotes[stepId];

      await db.dataModels.update(rid, { stepNotes });
      render();
    }
  }
};

// Initial Render
// Initial Render
render();

// Service Worker Registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.ts').then(registration => {
      console.log('SW registered: ', registration);
    }).catch(registrationError => {
      console.log('SW registration failed: ', registrationError);
    });
  });
}
