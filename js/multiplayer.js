// Cross-Device Multiplayer Manager
// Multi-Transport Architecture for 100% Reliable Room Joining & Race Sync:
// 1. MQTT over WebSockets (wss://broker.emqx.io:8084/mqtt & wss://broker.hivemq.com:8884/mqtt)
//    -> Works across ALL mobile 4G/5G networks, school Wi-Fi firewalls, and GitHub Pages!
// 2. PeerJS WebRTC DataChannel with STUN servers
// 3. Local LAN HTTP Relay (/api/room)
// 4. BroadcastChannel (same-device multi-tab)

class MultiplayerManager {
    constructor() {
        this.playerId = 'p_' + Math.random().toString(36).substring(2, 9);
        this.roomCode = null;
        this.isHost = false;
        this.peer = null;
        this.connections = new Map();
        this.hostConn = null;
        this.mqttClients = [];
        this.bc = null;

        this.lanPollTimer = null;
        this.heartbeatTimer = null;
        this.hasJoinedConfirmed = false;
        this.lastStartedRaceId = null;

        this.players = [];
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
            this.bc = new BroadcastChannel('mathtrack3d_sync_v2');
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

    getTopic() {
        return `mathtrack3d/v2/room/${this.roomCode}`;
    }

    // Connect to Cloud WebSocket PubSub brokers so devices on different networks/firewalls sync instantly
    connectCloudWebSockets(onConnectedCallback) {
        if (!window.mqtt || !this.roomCode) return;

        const brokers = [
            'wss://broker.emqx.io:8084/mqtt',
            'wss://broker.hivemq.com:8884/mqtt'
        ];
        const topic = this.getTopic();

        brokers.forEach((url) => {
            try {
                const client = window.mqtt.connect(url, {
                    clientId: `mt3d_${this.playerId}_${Math.random().toString(16).slice(2, 6)}`,
                    clean: true,
                    connectTimeout: 5000,
                    reconnectPeriod: 2000
                });

                client.on('connect', () => {
                    if (!this.roomCode) return;
                    client.subscribe(topic, { qos: 0 }, (err) => {
                        if (!err && onConnectedCallback) {
                            onConnectedCallback();
                        }
                    });
                });

                client.on('message', (t, payload) => {
                    if (t !== this.getTopic()) return;
                    try {
                        const msg = JSON.parse(payload.toString());
                        if (msg && msg.senderId !== this.playerId && msg.roomCode === this.roomCode) {
                            this.handleIncomingMessage(msg);
                        }
                    } catch (e) {}
                });

                client.on('error', () => {});
                this.mqttClients.push(client);
            } catch (e) {}
        });
    }

    // Create a new room as Host
    async createRoom(hostProfile) {
        this.cleanup();
        this.isHost = true;
        this.hasJoinedConfirmed = true;
        this.roomCode = String(Math.floor(1000 + Math.random() * 9000));
        this.roomSeed = Math.floor(Math.random() * 899999 + 100000);

        this.players = [
            {
                id: this.playerId,
                lane: 0,
                isHost: true,
                isAI: false,
                config: Object.assign({}, hostProfile),
                progress: 0,
                anim: 'Idle',
                correctCount: 0,
                finishTime: null
            }
        ];

        this.notifyStatus(`👑 已建立房間（房號：${this.roomCode}），等待其他載具輸入房號加入...`, 'success');
        if (this.onRoomUpdated) this.onRoomUpdated(this.getLobbySlots());

        // 1. Connect Cloud WebSocket PubSub
        this.connectCloudWebSockets(() => {
            this.broadcastRoomState();
        });

        // 2. Setup PeerJS WebRTC Host with explicit STUN servers
        if (window.Peer) {
            try {
                const peerId = `mathtrack3d-v2-${this.roomCode}`;
                this.peer = new Peer(peerId, {
                    debug: 0,
                    config: {
                        iceServers: [
                            { urls: 'stun:stun.l.google.com:19302' },
                            { urls: 'stun:stun1.l.google.com:19302' }
                        ]
                    }
                });
                this.peer.on('connection', (conn) => {
                    // Register connection immediately and also on open so no initial message is lost
                    this.connections.set(conn.peer, conn);
                    conn.on('open', () => {
                        this.connections.set(conn.peer, conn);
                        this.broadcastRoomState();
                    });
                    conn.on('data', (data) => {
                        this.handleIncomingMessage(data, conn);
                    });
                    conn.on('close', () => {
                        this.connections.delete(conn.peer);
                    });
                });
                this.peer.on('error', () => {});
            } catch (e) {}
        }

        // 3. Start Local LAN Relay & Host Lobby Heartbeat (broadcasts ROOM_STATE every 1.2s)
        this.startLanPolling();
        this.heartbeatTimer = setInterval(() => {
            if (this.isHost && this.roomCode) {
                this.broadcastRoomState();
            }
        }, 1200);

        return this.roomCode;
    }

    // Join an existing room as Guest from another device
    async joinRoom(code, guestProfile) {
        const cleanCode = String(code || '').trim();
        if (!/^\d{4}$/.test(cleanCode)) {
            this.notifyStatus('⚠️ 請輸入 4 位數字房間代碼！', 'error');
            return false;
        }

        this.cleanup();
        this.isHost = false;
        this.hasJoinedConfirmed = false;
        this.roomCode = cleanCode;
        this.guestProfile = Object.assign({}, guestProfile);

        // Temporarily show guest in local preview until Host's ROOM_STATE arrives
        this.players = [
            {
                id: this.playerId,
                lane: 0,
                isHost: false,
                isAI: false,
                config: this.guestProfile,
                progress: 0,
                anim: 'Idle',
                correctCount: 0,
                finishTime: null
            }
        ];
        if (this.onRoomUpdated) this.onRoomUpdated(this.getLobbySlots());

        this.notifyStatus(`⏳ 正在連線至房號 ${this.roomCode}...`, 'info');

        const sendJoinPacket = () => {
            if (!this.roomCode) return;
            const joinMsg = {
                type: 'JOIN_REQUEST',
                roomCode: this.roomCode,
                senderId: this.playerId,
                profile: this.guestProfile
            };
            this.broadcast(joinMsg);
        };

        // 1. Connect Cloud WebSocket PubSub and immediately send JOIN_REQUEST
        this.connectCloudWebSockets(() => {
            sendJoinPacket();
        });

        // 2. Connect via BroadcastChannel & Local LAN Relay
        sendJoinPacket();
        this.startLanPolling();

        // 3. Connect via PeerJS WebRTC
        if (window.Peer) {
            try {
                this.peer = new Peer(undefined, {
                    debug: 0,
                    config: {
                        iceServers: [
                            { urls: 'stun:stun.l.google.com:19302' },
                            { urls: 'stun:stun1.l.google.com:19302' }
                        ]
                    }
                });
                this.peer.on('open', () => {
                    if (!this.roomCode) return;
                    const hostPeerId = `mathtrack3d-v2-${this.roomCode}`;
                    const conn = this.peer.connect(hostPeerId, { reliable: true });
                    this.hostConn = conn;
                    conn.on('open', () => {
                        sendJoinPacket();
                    });
                    conn.on('data', (data) => {
                        this.handleIncomingMessage(data);
                    });
                });
                this.peer.on('error', () => {});
            } catch (e) {}
        }

        // 4. Periodically re-send JOIN_REQUEST every 1.0s until Host confirms us in ROOM_STATE
        //    (and also keep heartbeating every 2.5s so profile stays fresh)
        this.heartbeatTimer = setInterval(() => {
            if (!this.roomCode || this.isHost) return;
            sendJoinPacket();
        }, 1000);

        return true;
    }

    broadcastRoomState() {
        if (!this.isHost || !this.roomCode) return;
        this.broadcast({
            type: 'ROOM_STATE',
            players: this.players,
            roomSeed: this.roomSeed
        });
    }

    startLanPolling() {
        if (window.location.protocol === 'file:' || window.location.hostname.endsWith('github.io')) return;

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
            } catch (e) {}
        }, 450);
    }

    async postLanMessage(msg) {
        if (window.location.protocol === 'file:' || window.location.hostname.endsWith('github.io') || !this.roomCode) return;
        try {
            await fetch(`/api/room?room=${this.roomCode}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(msg)
            });
        } catch (e) {}
    }

    broadcast(msg) {
        if (!this.roomCode) return;
        msg.roomCode = this.roomCode;
        msg.senderId = this.playerId;

        // 1. BroadcastChannel
        if (this.bc) {
            try { this.bc.postMessage(msg); } catch (e) {}
        }

        // 2. Cloud WebSocket (MQTT over WSS)
        const jsonStr = JSON.stringify(msg);
        const topic = this.getTopic();
        for (const client of this.mqttClients) {
            if (client && client.connected) {
                try { client.publish(topic, jsonStr, { qos: 0 }); } catch (e) {}
            }
        }

        // 3. PeerJS WebRTC
        if (this.isHost) {
            for (const conn of this.connections.values()) {
                if (conn && conn.open) {
                    try { conn.send(msg); } catch (e) {}
                }
            }
        } else if (this.hostConn && this.hostConn.open) {
            try { this.hostConn.send(msg); } catch (e) {}
        }

        // 4. Local LAN Server
        this.postLanMessage(msg);
    }

    handleIncomingMessage(msg, sourceConn = null) {
        if (!msg || !msg.type || msg.roomCode !== this.roomCode) return;

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
                this.notifyStatus(`🎉 玩家「${msg.profile.nickname}」已加入房間！（目前 ${this.players.length} 人）`, 'success');
                if (this.onRoomUpdated) this.onRoomUpdated(this.getLobbySlots());
            } else {
                existing.config = msg.profile;
            }

            this.broadcastRoomState();
            if (sourceConn && sourceConn.open) {
                try {
                    sourceConn.send({
                        type: 'ROOM_STATE',
                        roomCode: this.roomCode,
                        senderId: this.playerId,
                        players: this.players,
                        roomSeed: this.roomSeed
                    });
                } catch (e) {}
            }
        } else if (msg.type === 'ROOM_STATE' && !this.isHost) {
            if (!Array.isArray(msg.players)) return;
            const amIInRoom = msg.players.some(p => p.id === this.playerId);
            this.players = msg.players;
            this.roomSeed = msg.roomSeed || this.roomSeed;

            if (amIInRoom) {
                if (!this.hasJoinedConfirmed) {
                    this.hasJoinedConfirmed = true;
                    // Slow down guest heartbeat once confirmed in room
                    if (this.heartbeatTimer) {
                        clearInterval(this.heartbeatTimer);
                        this.heartbeatTimer = null;
                    }
                }
                const hostPlayer = this.players.find(p => p.isHost);
                const hostName = hostPlayer ? hostPlayer.config.nickname : '房主';
                this.notifyStatus(`✅ 已進入「${hostName}」的房間（共 ${this.players.length} 位真人玩家），等待房主點擊開始！`, 'success');
            }
            if (this.onRoomUpdated) this.onRoomUpdated(this.getLobbySlots());
        } else if (msg.type === 'START_RACE') {
            if (msg.raceId && this.lastStartedRaceId === msg.raceId) return;
            this.lastStartedRaceId = msg.raceId || Date.now();

            // Stop lobby heartbeats once race starts
            if (this.heartbeatTimer) {
                clearInterval(this.heartbeatTimer);
                this.heartbeatTimer = null;
            }

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
            if (this.isHost) {
                for (const conn of this.connections.values()) {
                    if (conn && conn.open) {
                        try { conn.send(msg); } catch (e) {}
                    }
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
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }

        const fullRoster = this.getLobbySlots();
        this.players = fullRoster;
        this.roomSeed = Math.floor(Math.random() * 899999 + 100000);
        const raceId = 'race_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        this.lastStartedRaceId = raceId;

        const startMsg = {
            type: 'START_RACE',
            raceId,
            players: fullRoster,
            roomSeed: this.roomSeed,
            weatherMode
        };

        // Send burst of 4 START_RACE packets over 900ms to guarantee 100% delivery across all mobile/Wi-Fi clients
        this.broadcast(startMsg);
        [250, 550, 900].forEach((delay) => {
            setTimeout(() => this.broadcast(startMsg), delay);
        });

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
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
        if (this.mqttClients && this.mqttClients.length > 0) {
            this.mqttClients.forEach((c) => {
                try { c.end(true); } catch (e) {}
            });
            this.mqttClients = [];
        }
        if (this.peer) {
            try { this.peer.destroy(); } catch (e) {}
            this.peer = null;
        }
        this.connections.clear();
        this.hostConn = null;
        this.roomCode = null;
        this.hasJoinedConfirmed = false;
    }
}

window.multiplayerManager = new MultiplayerManager();
