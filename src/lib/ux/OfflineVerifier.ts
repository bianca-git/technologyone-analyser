export class OfflineVerifier {
    private container: HTMLElement;
    private overlay: HTMLElement;
    private confirmed: boolean = false;

    constructor() {
        this.container = document.createElement('div');
        this.overlay = document.createElement('div');
        this.mount();
        this.bindEvents();
        this.render(); // Initial render
    }

    private intervalId: number | null = null;
    private isOnline: boolean = navigator.onLine;
    private lastPingResult: string = 'Unknown';

    private mount(): void {
        // 1. Create Styles
        const styleId = 'offline-verifier-styles';
        if (!document.getElementById(styleId)) {
            const styleSheet = document.createElement('style');
            styleSheet.id = styleId;
            styleSheet.textContent = `
          #secure-overlay {
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background-color: rgba(0, 0, 0, 0.9);
            display: flex; justify-content: center; align-items: center;
            z-index: 99999; font-family: system-ui, sans-serif;
          }
          #secure-modal {
             background-color: #1a1a1a; color: #e5e5e5;
             padding: 2rem; border-radius: 8px; max-width: 480px;
             text-align: center; border: 1px solid #333;
             box-shadow: 0 4px 6px rgba(0,0,0,0.3);
             position: relative;
          }
          .status-icon { font-size: 3rem; display: block; margin-bottom: 1rem; }
          .secure-btn {
             margin-top: 1.5rem; padding: 12px 24px;
             font-size: 1rem; cursor: pointer;
             background-color: #22c55e; color: white;
             border: none; border-radius: 4px; transition: background 0.2s;
          }
          .secure-btn:hover { background-color: #16a34a; }
          .highlight-danger { color: #ef4444; font-weight: bold; }
          .highlight-info { color: #3b82f6; font-weight: bold; }
          .faded { opacity: 0.7; font-size: 0.9rem; margin-top: 1rem; }
          .link { color: #3b82f6; text-decoration: underline; cursor: pointer; }
          .close-btn {
            position: absolute; top: 0.5rem; right: 1rem;
            background: none; border: none; color: #666;
            font-size: 2rem; cursor: pointer; line-height: 1;
            padding: 0;
          }
          .close-btn:hover { color: #fff; }
        `;
            document.head.appendChild(styleSheet);
        }

        // 2. Setup Container
        this.overlay.id = 'secure-overlay';
        this.container.id = 'secure-modal';
        this.overlay.appendChild(this.container);
        document.body.appendChild(this.overlay);
    }

    private bindEvents(): void {
        window.addEventListener('online', this.handleNetworkChange);
        window.addEventListener('offline', this.handleNetworkChange);

        // Polling fallback (every 2s) to catch state changes if events fail
        this.intervalId = window.setInterval(this.handleNetworkChange, 2000);

        // Initial Check
        this.handleNetworkChange();
    }

    private async checkConnectivity(): Promise<boolean> {
        // 1. Hardware/OS Check
        if (!navigator.onLine) return false;

        // 2. Active Ping Check (for cases where LAN is up but Internet is down)
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1500); // 1.5s timeout for snappy UI

            // Using a reliable, no-cors endpoint with cache-busting
            await fetch(`https://www.google.com/generate_204?t=${Date.now()}`, {
                method: 'HEAD',
                mode: 'no-cors',
                cache: 'no-store',
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            this.lastPingResult = 'Success (204)';
            return true; // Fetch started -> Connection exists
        } catch (e) {
            this.lastPingResult = `Fail (${(e as Error).message || 'Network Error'})`;
            return false; // Fetch failed -> Offline
        }
    }

    private handleNetworkChange = async (): Promise<void> => {
        const currentStatus = await this.checkConnectivity();
        if (this.isOnline !== currentStatus) {
            this.isOnline = currentStatus;
            this.render();
        } else {
            // Re-render anyway to ensure UI is in sync if called manually
            this.render();
        }
    };

    public destroy(): void {
        window.removeEventListener('online', this.handleNetworkChange);
        window.removeEventListener('offline', this.handleNetworkChange);
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        if (this.overlay.parentNode) {
            this.overlay.parentNode.removeChild(this.overlay);
        }
    }

    private handleConfirm = (): void => {
        this.confirmed = true;
        this.destroy();
        // Optional: Trigger a callback here if your app needs to know security is verified
        console.log('Security Audit: User confirmed offline session.');
    };

    private getConnectionType(): string {
        const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
        return (conn && conn.type) ? conn.type : 'unknown';
    }

    private render(): void {
        if (this.confirmed) return;

        if (this.isOnline) {
            const connType = this.getConnectionType();
            let specificInstruction = "";

            // Connection Type Logic
            if (connType === 'wifi') {
                specificInstruction = `Please turn off Wi-Fi.`;
            } else if (connType === 'ethernet') {
                specificInstruction = `Please unplug your <strong>Ethernet cable</strong> (don't forget your <strong>Docking Station</strong>!).`;
            } else if (connType === 'bluetooth') {
                // Explicitly reassure user we don't mean their mouse
                specificInstruction = `Bluetooth detected. Please ensure <strong>Wi-Fi</strong> and <strong>Ethernet</strong> are disconnected.`;
            } else {
                // Generic fallback
                specificInstruction = `Please turn off <strong>Wi-Fi</strong> or unplug your <strong>Ethernet cable</strong> (check your <strong>Docking Station</strong>).`;
            }

            // STATE 1: THE CHALLENGE
            this.container.innerHTML = `
          <button id="verifier-close-btn" class="close-btn" title="Close">&times;</button>
          <span class="status-icon">⚠️</span>
          <h2>Verify Your Privacy</h2>
          <p>
            This app runs 100% on your device. To prove we cannot steal your data, 
            we require you to go offline.
          </p>
          <div class="mt-4 p-3 bg-gray-800 rounded border border-gray-700">
             <p class="text-lg mb-1">${specificInstruction}</p>
             <div class="text-xs text-gray-400 font-mono mt-2">
                 <div>Status: <strong>${this.isOnline ? 'ONLINE' : 'OFFLINE'}</strong></div>
                 <div>Interface: ${connType === 'unknown' ? 'Unknown' : connType.toUpperCase()}</div>
                 <div class="text-gray-500 mt-1">Debug: nav.onLine=${navigator.onLine}, ping=${this.lastPingResult}</div>
             </div>
          </div>
        `;
        } else {
            // STATE 2: THE PROOF
            this.container.innerHTML = `
          <button id="verifier-close-btn" class="close-btn" title="Close">&times;</button>
          <span class="status-icon">🟢</span>
          <h2>Connection Severed: Secure</h2>
          <p>
            You are now offline. Because there is no internet connection, it is 
            physically impossible for your data to leave this device.
          </p>
        `;

            // Create button programmatically to handle the event listener cleanly
            const btn = document.createElement('button');
            btn.className = 'secure-btn';
            btn.textContent = 'Start Secure Session';
            btn.onclick = this.handleConfirm;
            this.container.appendChild(btn);
        }

        // Bind Close Button
        const closeBtn = this.container.querySelector('#verifier-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.destroy());
        }
    }
}