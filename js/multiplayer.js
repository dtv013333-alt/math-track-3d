// Cross-Device Multiplayer Manager (PeerJS WebRTC + Local LAN Server Relay + BroadcastChannel)
// Supports 4-digit Room Code & QR Code joining so another device (tablet/phone/PC)
// can join the exact same 4-lane race, with AI bots filling any empty lanes.

class MultiplayerManager {
    constructor() {
        this.playerId = 'p_' + Math.random().toString(36).substring(2, 9);
        this.roomCode = null;
        this.isHost = false;
        this.peer = null;
        this.connections = new Map(); // peerId -> DataConnection (for Host)
        this.hostConn = null;         // DataConnection to Host (for Guest)
        this.bc = null;               // BroadcastChannel for instant local multi-tab sync
        this.lanPollTimer = null;
        this.useLanRelay = false;

        this.players = [];            // Up to 4 slot entries
        this.roomSeed = Math.floor(Math.random() * 899999 + 100000);

        // Callbacks
        this.onRoomUpdated = null;
        this.onRaceStart = null;
        this.onRunnerSync = null;
        this.onConnectionStatus = null;

        this.initBroadcastChannel();
    }

    initBroadcastChannel() {
        if ('BroadcastChannel' in window) {
            this.bc = new BroadcastChannel('mathtrack3d_sync_v1');
            this.bc.onmessage = (ev) => {
                const msg = ev.data;
                if (!msg || msg.roomCode !== this.roomCode) return;
                if (msg.senderId === this.playerId) return;
                this.handleIncomingMessage(msg);
            };
        }
    }

    notifyStatus(text, type = 'info') {
        if (this.onConnectionStatus) {
            this.onConnectionStatus(text, type);
        }
    }

    // Create a new room as Host
    async createRoom(hostProfile) {
        this.cleanup();
        this.isHost = true;
        this.roomCode = String(Math.floor(1000 + Math.random() * 9000));
        this.roomSeed = Math.floor(Math.random() * 899999 + 100000);

        this.players = [
            {
                id: this.playerId,
                lane: 0,
                isHost: true,
                isAI: false,
                config: hostProfile,
                progress: 0,
                anim: 'Idle',
                correctCount: 0,
                finishTime: null
            }
        ];

        this.notifyStatus(`已建立房間（房號：${this.roomCode}），等待其他載具加入...`, 'success');
        if (this.onRoomUpdated) this.onRoomUpdated(this.getLobbySlots());

        // 1. Setup PeerJS WebRTC Host
        if (window.Peer) {
            try {
                const peerId = `mathtrack3d-room-${this.roomCode}`;
                this.peer = new Peer(peerId, { debug: 0 });
                this.peer.on('open', () => {
                    this.notifyStatus(`跨載具連線就緒！房號：${this.roomCode}`, 'success');
                });
                this.peer.on('connection', (conn) => {
                    conn.on('open', () => {
                        this.connections.set(conn.peer, conn);
                    });
                    conn.on('data', (data) => {
                        this.handleIncomingMessage(data, conn);
                    });
                    conn.on('close', () => {
                        this.connections.delete(conn.peer);
                    });
                });
                this.peer.on('error', (err) => {
                    console.warn('[Multiplayer] PeerJS notice:', err.type || err);
                });
            } catch (e) {
                console.warn('[Multiplayer] PeerJS init skipped:', e);
            }
        }

        // 2. Also register with local LAN relay if running via server.ps1
        this.startLanPolling();
        return this.roomCode;
    }

    // Join an existing room as Guest from another device
    async joinRoom(code, guestProfile) {
        const cleanCode = String(code || '').trim();
        if (!/^\d{4}$/.test(cleanCode)) {
            this.notifyStatus('請輸入 4 位數字房間代碼！', 'error');
            return false;
        }

        this.cleanup();
        this.isHost = false;
        this.roomCode = cleanCode;
        this.guestProfile = guestProfile;

        this.notifyStatus(`正在連線至房間 ${this.roomCode}...`, 'info');

        const joinMsg = {
            type: 'JOIN_REQUEST',
            roomCode: this.roomCode,
            senderId: this.playerId,
            profile: guestProfile
        };

        // Broadcast via BroadcastChannel (same device tabs)
        if (this.bc) {
            this.bc.postMessage(joinMsg);
        }

        // Send via Local LAN relay if available
        this.startLanPolling(joinMsg);

        // Connect via PeerJS WebRTC (cross-device over network)
        if (window.Peer) {
            try {
                this.peer = new Peer(undefined, { debug: 0 });
                this.peer.on('open', () => {
                    const hostPeerId = `mathtrack3d-room-${this.roomCode}`;
                    const conn = this.peer.connect(hostPeerId, { reliable: true });
                    this.hostConn = conn;
                    conn.on('open', () => {
                        this.notifyStatus(`已成功連上房號 ${this.roomCode}！`, 'success');
                        conn.send(joinMsg);
                    });
                    conn.on('data', (data) => {
                        this.handleIncomingMessage(data);
                    });
                    conn.on('error', (err) => {
                        console.warn('[Multiplayer] Conn error:', err);
                    });
                });
            } catch (e) {
                console.warn('[Multiplayer] PeerJS guest error:', e);
            }
        }

        return true;
    }

    startLanPolling(initialMsg = null) {
        if (window.location.protocol === 'file:') return;

        if (initialMsg) {
            this.postLanMessage(initialMsg);
        }

        this.lanPollTimer = setInterval(async () => {
            if (!this.roomCode) return;
            try {
                const res = await fetch(`/api/room?room=${this.roomCode}&client=${this.playerId}`, {
                    cache: 'no-store'
                });
                if (!res.ok) return;
                const data = await res.json();
                if (Array.isArray(data.messages)) {
                    for (const m of data.messages) {
                        if (m.senderId !== this.playerId) {
                            this.handleIncomingMessage(m);
                        }
                    }
                }
            } catch (e) {
                // LAN endpoint not running (e.g., static hosting), ignore silently
            }
        }, 450);
    }

    async postLanMessage(msg) {
        if (window.location.protocol === 'file:' || !this.roomCode) return;
        try {
            await fetch(`/api/room?room=${this.roomCode}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(msg)
            });
        } catch (e) {}
    }

    broadcast(msg) {
        msg.roomCode = this.roomCode;
        msg.senderId = this.playerId;

        if (this.bc) {
            this.bc.postMessage(msg);
        }
        if (this.isHost) {
            for (const conn of this.connections.values()) {
                if (conn.open) conn.send(msg);
            }
        } else if (this.hostConn && this.hostConn.open) {
            this.hostConn.send(msg);
        }
        this.postLanMessage(msg);
    }

    handleIncomingMessage(msg, sourceConn = null) {
        if (!msg || !msg.type) return;

        if (msg.type === 'JOIN_REQUEST' && this.isHost) {
            let existing = this.players.find(p => p.id === msg.senderId);
            if (!existing) {
                if (this.players.length >= 4) return;
                existing = {
                    id: msg.senderId,
                    lane: this.players.length,
                    isHost: false,
                    isAI: false,
                    config: msg.profile,
                    progress: 0,
                    anim: 'Idle',
                    correctCount: 0,
                    finishTime: null
                };
                this.players.push(existing);
                this.notifyStatus(`玩家「${msg.profile.nickname}」已加入房間！`, 'success');
            } else {
                existing.config = msg.profile;
            }

            const stateMsg = {
                type: 'ROOM_STATE',
                players: this.players,
                roomSeed: this.roomSeed
            };
            this.broadcast(stateMsg);
            if (sourceConn && sourceConn.open) {
                sourceConn.send(stateMsg);
            }
            if (this.onRoomUpdated) this.onRoomUpdated(this.getLobbySlots());
        } else if (msg.type === 'ROOM_STATE' && !this.isHost) {
            this.players = msg.players || [];
            this.roomSeed = msg.roomSeed || this.roomSeed;
            this.notifyStatus(`已同步房間（目前 ${this.players.length} 位真人玩家）`, 'success');
            if (this.onRoomUpdated) this.onRoomUpdated(this.getLobbySlots());
        } else if (msg.type === 'START_RACE') {
            this.players = msg.players || this.players;
            this.roomSeed = msg.roomSeed || this.roomSeed;
            if (this.onRaceStart) {
                this.onRaceStart({
                    players: this.players,
                    roomSeed: this.roomSeed,
                    weatherMode: msg.weatherMode
                });
            }
        } else if (msg.type === 'RUNNER_SYNC') {
            // Relay if host so all guests also see each other
            if (this.isHost) {
                for (const conn of this.connections.values()) {
                    if (conn.open) conn.send(msg);
                }
            }
            if (this.onRunnerSync) {
                this.onRunnerSync(msg);
            }
        }
    }

    // Fill remaining slots up to 4 with the 3 AI opponents (柯老師、阿維老師、Lisa)
    getLobbySlots() {
        const aiDefaults = window.characterBuilder.getAIPresetConfigs();

        const slots = [];
        for (let i = 0; i < 4; i++) {
            if (i < this.players.length) {
                slots.push(Object.assign({}, this.players[i], { lane: i }));
            } else {
                const aiSpec = aiDefaults[i - this.players.length] || aiDefaults[0];
                slots.push({
                    id: aiSpec.id,
                    lane: i,
                    isHost: false,
                    isAI: true,
                    aiSpec,
                    config: Object.assign({}, aiSpec.config),
                    progress: 0,
                    anim: 'Idle',
                    correctCount: 0,
                    finishTime: null
                });
            }
        }
        return slots;
    }

    hostTriggerStart(weatherMode) {
        if (!this.isHost) return;
        const fullRoster = this.getLobbySlots();
        this.players = fullRoster;
        this.roomSeed = Math.floor(Math.random() * 899999 + 100000);

        const startMsg = {
            type: 'START_RACE',
            players: fullRoster,
            roomSeed: this.roomSeed,
            weatherMode
        };
        this.broadcast(startMsg);
        if (this.onRaceStart) {
            this.onRaceStart({
                players: fullRoster,
                roomSeed: this.roomSeed,
                weatherMode
            });
        }
    }

    sendRunnerState(state) {
        if (!this.roomCode) return;
        this.broadcast({
            type: 'RUNNER_SYNC',
            playerId: this.playerId,
            progress: state.progress,
            anim: state.anim,
            sprint: state.sprint,
            dizzy: state.dizzy,
            correctCount: state.correctCount,
            finishTime: state.finishTime
        });
    }

    cleanup() {
        if (this.lanPollTimer) {
            clearInterval(this.lanPollTimer);
            this.lanPollTimer = null;
        }
        if (this.peer) {
            try { this.peer.destroy(); } catch (e) {}
            this.peer = null;
        }
        this.connections.clear();
        this.hostConn = null;
        this.roomCode = null;
    }
}

window.multiplayerManager = new MultiplayerManager();
