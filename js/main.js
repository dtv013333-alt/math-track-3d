// Main Game Controller for 3D Positive/Negative Math Track Game
// Coordinates Character Creator, 3D Preview, Live Weather, Multiplayer Lobby,
// 10-Question Oval Track Race, 2-Attempt Input -> 4-Option Fallback, and Leaderboard.

class MathTrackGame {
    constructor() {
        this.state = 'CREATOR'; // 'CREATOR' | 'LOBBY' | 'CAMPUS_ROAM' | 'COUNTDOWN' | 'RACING' | 'FINISHED'
        this.playerConfig = window.characterBuilder.getDefaultConfig();

        // Main 3D World
        this.world = null;
        // 3D Character Preview Renderer (for Reference Image 1 Creator left panel)
        this.previewScene = null;
        this.previewCamera = null;
        this.previewRenderer = null;
        this.previewChar = null;
        this.isDraggingPreview = false;
        this.previewDragX = 0;

        // Race state
        this.runners = []; // 4 runners (lane 0..3)
        this.localRunner = null;
        this.questions = [];
        this.totalQuestions = 10; // Fixed 10 questions per lap as requested
        this.currentQuestionIdx = 0;
        this.wrongAttemptCount = 0;
        this.isQuizOpen = false;
        this.quizMode = 'INPUT'; // 'INPUT' | 'OPTIONS'
        this.raceElapsed = 0;
        this.cameraViewMode = 'BACK'; // 'BACK' (Ref Image 2) | 'FRONT' (Ref Image 3)

        this.clock = new THREE.Clock();
        this.elapsedTotal = 0;
    }

    async start() {
        await window.characterBuilder.init();

        const worldContainer = document.getElementById('world-canvas-container');
        this.world = new WorldScene(worldContainer);

        this.initPreviewScene();
        this.initCreatorUI();
        this.initWeatherUI();
        this.initQuizUI();
        this.initLobbyUI();
        this.initResultsUI();

        // Setup initial 4 runners at start line for background visual
        this.setupIdleTrackRunners();

        // Check if URL has ?room=XXXX from QR code scan
        const params = new URLSearchParams(window.location.search);
        const roomParam = params.get('room');
        if (roomParam && /^\d{4}$/.test(roomParam)) {
            document.getElementById('join-room-input').value = roomParam;
        }

        // Start animation loop
        this.animate();
    }

    // =========================================================================
    // 1. 3D Character Preview (Reference Image 1 Left Card)
    // =========================================================================
    initPreviewScene() {
        const container = document.getElementById('char-preview-canvas-wrap');
        if (!container) return;

        this.previewScene = new THREE.Scene();
        this.previewCamera = new THREE.PerspectiveCamera(38, 220 / 290, 0.1, 50);
        this.previewCamera.position.set(0, 1.15, 3.65);
        this.previewCamera.lookAt(0, 0.98, 0);

        this.previewRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.previewRenderer.setSize(220, 290);
        this.previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        container.appendChild(this.previewRenderer.domElement);

        const hemi = new THREE.HemisphereLight(0xffffff, 0xe8f5e9, 0.95);
        this.previewScene.add(hemi);
        const dir = new THREE.DirectionalLight(0xfffef5, 0.75);
        dir.position.set(3, 5, 4);
        this.previewScene.add(dir);

        // Soft circular shadow plate under character
        const shadowPlate = new THREE.Mesh(
            new THREE.CircleGeometry(0.55, 24),
            new THREE.MeshBasicMaterial({ color: '#c5d9b8', transparent: true, opacity: 0.55 })
        );
        shadowPlate.rotation.x = -Math.PI * 0.5;
        shadowPlate.position.y = 0.01;
        this.previewScene.add(shadowPlate);

        // Drag to rotate preview character
        const dom = this.previewRenderer.domElement;
        dom.addEventListener('pointerdown', (e) => {
            this.isDraggingPreview = true;
            this.previewDragX = e.clientX;
        });
        window.addEventListener('pointermove', (e) => {
            if (!this.isDraggingPreview || !this.previewChar) return;
            const dx = e.clientX - this.previewDragX;
            this.previewDragX = e.clientX;
            this.previewChar.group.rotation.y += dx * 0.015;
        });
        window.addEventListener('pointerup', () => {
            this.isDraggingPreview = false;
        });

        this.rebuildPreviewCharacter();
    }

    rebuildPreviewCharacter() {
        if (!this.previewScene) return;
        const prevRotY = this.previewChar ? this.previewChar.group.rotation.y : 0.22;
        if (this.previewChar) {
            this.previewScene.remove(this.previewChar.group);
        }
        this.previewChar = window.characterBuilder.createCharacter(this.playerConfig);
        this.previewChar.group.rotation.y = prevRotY;
        this.previewScene.add(this.previewChar.group);

        // Update badge above preview character (nickname only)
        const badgeName = document.getElementById('preview-nickname-text');
        if (badgeName) badgeName.textContent = this.playerConfig.nickname || '訪客42';
    }

    // =========================================================================
    // 2. Character Creator UI (Simplified per User Specification)
    // =========================================================================
    initCreatorUI() {
        const cfg = this.playerConfig;
        const P = window.CHARACTER_PALETTES;

        const nickInput = document.getElementById('input-nickname');
        nickInput.value = cfg.nickname;

        nickInput.addEventListener('input', () => {
            cfg.nickname = nickInput.value.trim().slice(0, 8) || '訪客42';
            this.rebuildPreviewCharacter();
        });

        // Helper for pill buttons
        const setupPillGroup = (containerId, items, currentVal, onSelect) => {
            const container = document.getElementById(containerId);
            if (!container) return;
            container.innerHTML = '';
            items.forEach((item) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'pill-btn' + (item.id === currentVal ? ' active' : '');
                btn.innerHTML = item.icon ? `<span class="pill-icon">${item.icon}</span>${item.label}` : item.label;
                btn.addEventListener('click', () => {
                    window.soundManager.playClick();
                    Array.from(container.children).forEach(c => c.classList.remove('active'));
                    btn.classList.add('active');
                    onSelect(item.id);
                    this.rebuildPreviewCharacter();
                });
                container.appendChild(btn);
            });
        };

        // Helper for color swatches
        const setupColorSwatches = (containerId, colors, currentHex, onSelect) => {
            const container = document.getElementById(containerId);
            if (!container) return;
            container.innerHTML = '';
            colors.forEach((hex) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'swatch-btn' + (hex.toLowerCase() === currentHex.toLowerCase() ? ' active' : '');
                const inner = document.createElement('span');
                inner.className = 'swatch-color';
                inner.style.backgroundColor = hex;
                btn.appendChild(inner);
                btn.addEventListener('click', () => {
                    window.soundManager.playClick();
                    Array.from(container.children).forEach(c => c.classList.remove('active'));
                    btn.classList.add('active');
                    onSelect(hex);
                    this.rebuildPreviewCharacter();
                });
                container.appendChild(btn);
            });
        };

        const renderAllControls = () => {
            nickInput.value = this.playerConfig.nickname;

            setupPillGroup('group-gender', [
                { id: 'male', label: '男生' },
                { id: 'female', label: '女生' }
            ], this.playerConfig.gender, (v) => { this.playerConfig.gender = v; });

            setupColorSwatches('group-skin', P.skinColors, this.playerConfig.skinColor, (v) => { this.playerConfig.skinColor = v; });
            setupColorSwatches('group-eye', P.eyeColors, this.playerConfig.eyeColor, (v) => { this.playerConfig.eyeColor = v; });
            setupColorSwatches('group-hair-color', P.hairColors, this.playerConfig.hairColor, (v) => { this.playerConfig.hairColor = v; });
            setupPillGroup('group-hair-style', P.hairStyles, this.playerConfig.hairStyle, (v) => { this.playerConfig.hairStyle = v; });
            setupColorSwatches('group-top-color', P.topColors, this.playerConfig.topColor, (v) => { this.playerConfig.topColor = v; });
            setupPillGroup('group-bottom-style', P.bottomStyles, this.playerConfig.bottomStyle, (v) => { this.playerConfig.bottomStyle = v; });
            setupColorSwatches('group-bottom-color', P.bottomColors, this.playerConfig.bottomColor, (v) => { this.playerConfig.bottomColor = v; });
            setupPillGroup('group-accessory', P.accessories, this.playerConfig.accessory, (v) => { this.playerConfig.accessory = v; });
        };

        renderAllControls();

        // Random Appearance Button (🎲 隨機外觀)
        document.getElementById('btn-random-look').addEventListener('click', () => {
            window.soundManager.playClick();
            this.playerConfig = window.characterBuilder.getRandomConfig(
                true,
                this.playerConfig.nickname
            );
            renderAllControls();
            this.rebuildPreviewCharacter();
        });

        // Start Singleplayer Race vs AI (進入校園 / 單人比賽)
        document.getElementById('btn-start-single').addEventListener('click', () => {
            window.soundManager.playClick();
            this.startSinglePlayerRace();
        });

        // Open Multiplayer Co-op / Cross-Device Modal (與他人聯動比賽)
        document.getElementById('btn-open-multiplayer').addEventListener('click', () => {
            window.soundManager.playClick();
            this.openMultiplayerLobby();
        });

        // Free Campus Roam Preview (先隨意看看)
        document.getElementById('btn-roam-campus').addEventListener('click', () => {
            window.soundManager.playClick();
            this.enterCampusRoam();
        });
    }

    // =========================================================================
    // 3. Weather System UI & Live Sync
    // =========================================================================
    initWeatherUI() {
        const toggleBtn = document.getElementById('btn-env-menu-toggle');
        const itemsBox = document.getElementById('env-bar-items');
        if (toggleBtn && itemsBox) {
            toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                window.soundManager.playClick();
                const isOpen = itemsBox.classList.toggle('open');
                toggleBtn.textContent = isOpen ? '🌤️ 收起設定 ▴' : '🌤️ 天氣・視角・音效 ▾';
            });
            document.addEventListener('pointerdown', (e) => {
                const bar = document.getElementById('top-env-bar');
                if (bar && !bar.contains(e.target) && itemsBox.classList.contains('open')) {
                    itemsBox.classList.remove('open');
                    toggleBtn.textContent = '🌤️ 天氣・視角・音效 ▾';
                }
            });
        }

        const weatherButtons = document.querySelectorAll('.weather-btn');
        const setWeatherUI = (mode) => {
            weatherButtons.forEach((btn) => {
                btn.classList.toggle('active', btn.dataset.weather === mode);
            });
        };

        weatherButtons.forEach((btn) => {
            btn.addEventListener('click', () => {
                window.soundManager.playClick();
                const mode = btn.dataset.weather;
                this.world.applyWeather(mode);
                setWeatherUI(mode);
                const statusEl = document.getElementById('weather-live-label');
                if (statusEl) statusEl.textContent = '手動天氣';
            });
        });

        // Toggle Camera Angle Button (Back view Ref Image 2 vs Front Campus view Ref Image 3)
        const camBtn = document.getElementById('btn-toggle-camera');
        if (camBtn) {
            camBtn.addEventListener('click', () => {
                window.soundManager.playClick();
                this.cameraViewMode = this.cameraViewMode === 'BACK' ? 'FRONT' : 'BACK';
                camBtn.textContent = this.cameraViewMode === 'BACK' ? '🎥 視角：背後跟隨' : '🎥 視角：正面校園';
            });
        }

        // Sound Toggle Button
        const soundBtn = document.getElementById('btn-toggle-sound');
        if (soundBtn) {
            soundBtn.addEventListener('click', () => {
                const on = window.soundManager.toggle();
                soundBtn.textContent = on ? '🔊 音效：開' : '🔇 音效：關';
                if (on && this.world.weatherMode === 'rainy') {
                    window.soundManager.startRainAmbience();
                }
            });
        }

        // Auto detect current weather on startup
        this.world.syncRealTimeWeather((info) => {
            setWeatherUI(info.mode);
            const statusEl = document.getElementById('weather-live-label');
            if (statusEl) {
                statusEl.textContent = `${info.cityLabel} ${info.temp}°C`;
            }
        });
    }

    // =========================================================================
    // 4. Multiplayer Lobby UI (Cross-Device Room Code + QR Code)
    // =========================================================================
    initLobbyUI() {
        const mp = window.multiplayerManager;

        mp.onConnectionStatus = (text, type) => {
            const el = document.getElementById('lobby-status-msg');
            if (el) {
                el.textContent = text;
                el.className = `lobby-status ${type}`;
            }
        };

        mp.onRoomUpdated = (slots) => {
            this.renderLobbySlots(slots);
        };

        mp.onRaceStart = ({ players, roomSeed, weatherMode }) => {
            if (weatherMode) {
                this.world.applyWeather(weatherMode);
            }
            document.getElementById('multiplayer-modal').classList.add('hidden');
            document.getElementById('creator-overlay').classList.add('hidden');
            this.beginRaceWithRoster(players, roomSeed);
        };

        mp.onRunnerSync = (syncData) => {
            const runner = this.runners.find(r => r.id === syncData.playerId);
            if (runner && !runner.isLocal) {
                runner.progress = syncData.progress;
                runner.correctCount = syncData.correctCount;
                runner.charCtrl.playAnimation(syncData.anim || 'Run');
                runner.charCtrl.setSprintEffect(Boolean(syncData.sprint));
                runner.charCtrl.setDizzyEffect(Boolean(syncData.dizzy));
                if (syncData.finishTime && !runner.finished) {
                    runner.finished = true;
                    runner.finishTime = syncData.finishTime;
                    this.checkAllRunnersFinished();
                }
            }
        };

        document.getElementById('btn-create-room').addEventListener('click', async () => {
            window.soundManager.playClick();
            const code = await mp.createRoom(this.playerConfig);
            document.getElementById('room-code-display').textContent = code;
            document.getElementById('host-room-panel').classList.remove('hidden');
            document.getElementById('btn-host-start-race').disabled = false;
            this.updateRoomQRCode(code);
        });

        document.getElementById('btn-join-room').addEventListener('click', async () => {
            window.soundManager.playClick();
            const code = document.getElementById('join-room-input').value.trim();
            const ok = await mp.joinRoom(code, this.playerConfig);
            if (ok) {
                document.getElementById('room-code-display').textContent = code;
                document.getElementById('host-room-panel').classList.remove('hidden');
                document.getElementById('btn-host-start-race').disabled = true;
                document.getElementById('btn-host-start-race').textContent = '等待房主開始比賽...';
                this.updateRoomQRCode(code);
            }
        });

        document.getElementById('btn-host-start-race').addEventListener('click', () => {
            window.soundManager.playClick();
            mp.hostTriggerStart(this.world.weatherMode);
        });

        document.getElementById('btn-close-lobby').addEventListener('click', () => {
            window.soundManager.playClick();
            mp.cleanup();
            document.getElementById('multiplayer-modal').classList.add('hidden');
        });
    }

    openMultiplayerLobby() {
        document.getElementById('multiplayer-modal').classList.remove('hidden');
        document.getElementById('btn-host-start-race').textContent = '🏁 開始聯動比賽（不足 4 人由電腦補齊）';
        // Automatically create a room if no room code was typed in URL
        const joinVal = document.getElementById('join-room-input').value.trim();
        if (!joinVal) {
            document.getElementById('btn-create-room').click();
        }
    }

    updateRoomQRCode(code) {
        const url = new URL(window.location.href);
        url.searchParams.set('room', code);
        const shareUrl = url.toString();

        const linkEl = document.getElementById('room-share-url');
        if (linkEl) linkEl.textContent = shareUrl;

        const qrContainer = document.getElementById('room-qr-box');
        if (qrContainer) {
            qrContainer.innerHTML = '';
            if (window.QRCode) {
                new QRCode(qrContainer, {
                    text: shareUrl,
                    width: 116,
                    height: 116,
                    colorDark: '#2c3e50',
                    colorLight: '#ffffff'
                });
            }
        }
    }

    renderLobbySlots(slots) {
        const container = document.getElementById('lobby-slots-grid');
        if (!container) return;
        container.innerHTML = '';

        slots.forEach((slot, idx) => {
            const card = document.createElement('div');
            card.className = 'lobby-slot-card' + (slot.isAI ? ' is-ai' : ' is-human');
            const badge = slot.isAI ? '🤖 電腦對手' : (slot.isHost ? '👑 房主玩家' : '📱 聯動玩家');
            card.innerHTML = `
                <div class="slot-lane-tag">第 ${idx + 1} 跑道</div>
                <div class="slot-player-name">${slot.config.nickname}</div>
                <div class="slot-player-type">${badge}</div>
            `;
            container.appendChild(card);
        });
    }

    // =========================================================================
    // 5. Track Runners Setup & Race Loop
    // =========================================================================
    setupIdleTrackRunners() {
        const aiPresets = window.characterBuilder.getAIPresetConfigs();
        const defaultSlots = [
            { id: aiPresets[2].id, lane: 0, isAI: true, aiSpec: aiPresets[2], config: aiPresets[2].config },
            { id: aiPresets[1].id, lane: 1, isAI: true, aiSpec: aiPresets[1], config: aiPresets[1].config },
            { id: aiPresets[0].id, lane: 2, isAI: true, aiSpec: aiPresets[0], config: aiPresets[0].config },
            { id: 'local',         lane: 3, isAI: false, config: this.playerConfig }
        ];
        this.spawnRunners(defaultSlots);
    }

    spawnRunners(slotConfigs) {
        // Clear existing 3D runner models & HTML floating labels
        this.runners.forEach((r) => {
            if (r.charCtrl && r.charCtrl.group) {
                this.world.scene.remove(r.charCtrl.group);
            }
            if (r.labelEl && r.labelEl.parentNode) {
                r.labelEl.parentNode.removeChild(r.labelEl);
            }
        });
        this.runners = [];

        const labelContainer = document.getElementById('floating-labels-layer');

        slotConfigs.forEach((slot, idx) => {
            const laneIndex = slot.lane !== undefined ? slot.lane : idx;
            const charCtrl = window.characterBuilder.createCharacter(slot.config);

            this.world.scene.add(charCtrl.group);

            // Create floating HTML name tag above runner's head (nickname only)
            const labelEl = document.createElement('div');
            const isLocal = (slot.id === 'local' || slot.id === window.multiplayerManager.playerId);
            labelEl.className = 'runner-floating-tag' + (isLocal ? ' is-self' : '');
            labelEl.innerHTML = `<span class="tag-name">${slot.config.nickname}</span>`;
            labelContainer.appendChild(labelEl);

            const runnerObj = {
                id: slot.id,
                name: slot.config.nickname,
                lane: laneIndex,
                isLocal,
                isAI: Boolean(slot.isAI),
                aiSpec: slot.aiSpec || { baseSpeed: 0.0205, accuracy: 0.80 },
                charCtrl,
                labelEl,
                progress: 0,
                baseSpeed: slot.isAI ? (slot.aiSpec ? slot.aiSpec.baseSpeed : 0.0205) : 0.0212,
                currentSpeed: 0,
                sprintTimer: 0,
                fallTimer: 0,
                aiPauseTimer: 0,
                nextCheckpointIdx: 0,
                correctCount: 0,
                finished: false,
                finishTime: null
            };

            this.updateRunnerTransform(runnerObj);
            this.runners.push(runnerObj);
            if (isLocal) {
                this.localRunner = runnerObj;
            }
        });

        if (!this.localRunner && this.runners.length > 0) {
            this.localRunner = this.runners[this.runners.length - 1];
            this.localRunner.isLocal = true;
        }
    }

    updateRunnerTransform(runner) {
        const pt = this.world.getPointOnLane(runner.lane, runner.progress);
        runner.charCtrl.group.position.set(pt.x, 0, pt.z);
        runner.charCtrl.group.rotation.y = pt.angle;
    }

    enterCampusRoam() {
        document.getElementById('creator-overlay').classList.add('hidden');
        document.getElementById('roam-banner').classList.remove('hidden');
        this.setupIdleTrackRunners();
        // Position local player slightly behind start line like Reference Image 2!
        if (this.localRunner) {
            this.localRunner.progress = 0.965;
            this.updateRunnerTransform(this.localRunner);
        }
        this.state = 'CAMPUS_ROAM';

        document.getElementById('btn-roam-start-race').onclick = () => {
            window.soundManager.playClick();
            document.getElementById('roam-banner').classList.add('hidden');
            this.startSinglePlayerRace();
        };
        document.getElementById('btn-roam-edit-char').onclick = () => {
            window.soundManager.playClick();
            document.getElementById('roam-banner').classList.add('hidden');
            document.getElementById('creator-overlay').classList.remove('hidden');
            this.state = 'CREATOR';
        };
    }

    startSinglePlayerRace() {
        window.multiplayerManager.cleanup();
        document.getElementById('creator-overlay').classList.add('hidden');
        document.getElementById('roam-banner').classList.add('hidden');
        document.getElementById('results-modal').classList.add('hidden');

        // 3 AI Opponents (柯老師、阿維老師、Lisa) in Lanes 1-3 + Player in Lane 4
        const aiPresets = window.characterBuilder.getAIPresetConfigs();
        const singleRoster = [
            { id: aiPresets[2].id, lane: 0, isAI: true, aiSpec: aiPresets[2], config: aiPresets[2].config },
            { id: aiPresets[1].id, lane: 1, isAI: true, aiSpec: aiPresets[1], config: aiPresets[1].config },
            { id: aiPresets[0].id, lane: 2, isAI: true, aiSpec: aiPresets[0], config: aiPresets[0].config },
            { id: 'local',         lane: 3, isAI: false, config: this.playerConfig }
        ];

        this.beginRaceWithRoster(singleRoster, null);
    }

    beginRaceWithRoster(roster, seed = null) {
        this.spawnRunners(roster);
        this.questions = window.mathEngine.generateQuestionSet(this.totalQuestions, seed);
        this.currentQuestionIdx = 0;
        this.wrongAttemptCount = 0;
        this.isQuizOpen = false;
        this.raceElapsed = 0;

        // Reset checkpoint gate visuals
        this.world.checkpointMeshes.forEach((cp) => {
            if (cp.userData.stripe) cp.userData.stripe.material.opacity = 0.55;
        });

        document.getElementById('race-hud').classList.remove('hidden');
        this.updateHud();

        // Run 3-2-1-GO Countdown
        this.state = 'COUNTDOWN';
        const cdOverlay = document.getElementById('countdown-overlay');
        const cdText = document.getElementById('countdown-number');
        cdOverlay.classList.remove('hidden');

        let count = 3;
        cdText.textContent = '3';
        window.soundManager.playCountdown(false);

        const timer = setInterval(() => {
            count--;
            if (count > 0) {
                cdText.textContent = String(count);
                window.soundManager.playCountdown(false);
            } else if (count === 0) {
                cdText.textContent = 'GO!';
                window.soundManager.playCountdown(true);
                this.state = 'RACING';
                this.runners.forEach((r) => {
                    r.charCtrl.playAnimation('Run');
                });
            } else {
                clearInterval(timer);
                cdOverlay.classList.add('hidden');
            }
        }, 850);
    }

    // =========================================================================
    // 6. 10-Question Positive/Negative Math Quiz Modal
    //    (Direct Input -> 2nd Wrong Triggers 4-Option Fallback)
    // =========================================================================
    initQuizUI() {
        const answerInput = document.getElementById('quiz-answer-input');
        const submitBtn = document.getElementById('btn-submit-answer');

        submitBtn.addEventListener('click', () => {
            this.submitDirectAnswer();
        });

        // Apply a virtual or physical key input without focusing the input element
        // (prevents mobile/tablet OS virtual keyboard from ever popping up!)
        const applyKeyInput = (key) => {
            if (!this.isQuizOpen || this.quizMode !== 'INPUT') return;
            let cur = answerInput.value.trim();

            if (key === 'clear') {
                answerInput.value = '';
            } else if (key === 'back') {
                answerInput.value = cur.slice(0, -1);
            } else if (key === 'sign') {
                if (cur.startsWith('-')) {
                    answerInput.value = cur.slice(1);
                } else {
                    answerInput.value = '-' + cur;
                }
            } else {
                if (cur.replace('-', '').length < 4) {
                    answerInput.value = cur + key;
                }
            }
        };

        // Global physical keyboard listener for desktop convenience (no input focus needed)
        window.addEventListener('keydown', (e) => {
            if (!this.isQuizOpen || this.quizMode !== 'INPUT') return;
            if (e.key === 'Enter') {
                e.preventDefault();
                this.submitDirectAnswer();
            } else if (e.key === 'Backspace') {
                e.preventDefault();
                window.soundManager.playClick();
                applyKeyInput('back');
            } else if (e.key === 'Escape' || e.key === 'Delete') {
                e.preventDefault();
                window.soundManager.playClick();
                applyKeyInput('clear');
            } else if (e.key === '-') {
                e.preventDefault();
                window.soundManager.playClick();
                applyKeyInput('sign');
            } else if (/^[0-9]$/.test(e.key)) {
                e.preventDefault();
                window.soundManager.playClick();
                applyKeyInput(e.key);
            }
        });

        // Virtual Keypad buttons (for touch / tablet / mouse convenience)
        document.querySelectorAll('.keypad-btn').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                if (!this.isQuizOpen || this.quizMode !== 'INPUT') return;
                window.soundManager.playClick();
                applyKeyInput(btn.dataset.key);
            });
        });
    }

    triggerQuestionModal(qIndex) {
        const q = this.questions[qIndex];
        if (!q) return;

        this.isQuizOpen = true;
        this.wrongAttemptCount = 0;
        this.quizMode = 'INPUT';

        window.soundManager.playQuestionPop();

        // Pause local runner in Idle pose while thinking
        if (this.localRunner) {
            this.localRunner.charCtrl.playAnimation('Idle');
            this.localRunner.charCtrl.setSprintEffect(false);
        }

        const modal = document.getElementById('quiz-modal');
        const progressBadge = document.getElementById('quiz-progress-badge');
        const typeBadge = document.getElementById('quiz-type-badge');
        const exprEl = document.getElementById('quiz-expression');
        const feedbackEl = document.getElementById('quiz-feedback-msg');
        const hintEl = document.getElementById('quiz-hint-box');
        const inputSection = document.getElementById('quiz-input-section');
        const optionsSection = document.getElementById('quiz-options-section');
        const answerInput = document.getElementById('quiz-answer-input');

        progressBadge.textContent = `第 ${q.index} / ${this.totalQuestions} 題`;
        typeBadge.textContent = q.typeName;
        typeBadge.style.backgroundColor = q.badgeColor;
        exprEl.textContent = `${q.expression} = ?`;

        feedbackEl.textContent = '請直接輸入正負數答案（答對可加速衝刺 ⚡）';
        feedbackEl.className = 'quiz-feedback info';
        hintEl.classList.add('hidden');
        hintEl.textContent = q.hint;

        inputSection.classList.remove('hidden');
        optionsSection.classList.add('hidden');
        answerInput.value = '';
        modal.classList.remove('fall-peek-hidden');
        modal.classList.remove('hidden');
    }

    // Temporarily hide the quiz card & focus camera on the runner falling on the track
    playFallShowcase(afterCallback) {
        const modal = document.getElementById('quiz-modal');
        if (this.localRunner) {
            // Reset and replay Fall animation clearly
            if (this.localRunner.charCtrl.actions['Fall']) {
                this.localRunner.charCtrl.actions['Fall'].reset().play();
                this.localRunner.charCtrl.currentActionName = 'Fall';
            } else {
                this.localRunner.charCtrl.playAnimation('Fall', 0.08);
            }
            this.localRunner.charCtrl.setDizzyEffect(true);
            this.localRunner.fallTimer = 1.6;
            this.syncLocalRunner();
        }

        this.fallCameraTimer = 1.55;
        this.showFloatingToast('💥 答錯跌倒了！', 'fall');

        if (modal) {
            modal.classList.add('fall-peek-hidden');
        }

        clearTimeout(this.fallPeekTimeout);
        this.fallPeekTimeout = setTimeout(() => {
            if (modal && this.isQuizOpen) {
                modal.classList.remove('fall-peek-hidden');
            }
            if (afterCallback) afterCallback();
        }, 1450);
    }

    submitDirectAnswer() {
        if (!this.isQuizOpen || this.quizMode !== 'INPUT') return;

        const q = this.questions[this.currentQuestionIdx];
        const answerInput = document.getElementById('quiz-answer-input');
        const raw = answerInput.value.trim();

        if (raw === '' || raw === '-') {
            const feedbackEl = document.getElementById('quiz-feedback-msg');
            feedbackEl.textContent = '⚠️ 請先輸入數字答案喔！';
            feedbackEl.className = 'quiz-feedback warn';
            return;
        }

        const userVal = Number(raw);
        if (userVal === q.answer) {
            // Correct in Direct Input stage!
            this.handleQuestionCorrect(true);
        } else {
            // Wrong answer -> Runner falls down with unobstructed camera view!
            this.wrongAttemptCount++;
            window.soundManager.playWrongFall();

            const feedbackEl = document.getElementById('quiz-feedback-msg');
            const hintEl = document.getElementById('quiz-hint-box');
            hintEl.classList.remove('hidden');

            if (this.wrongAttemptCount === 1) {
                // First wrong attempt: show fall animation first, then prompt for 2nd input
                feedbackEl.textContent = `❌「${raw}」不對喔，角色跌倒了！請再輸入一次試試看（第 2 次機會）`;
                feedbackEl.className = 'quiz-feedback error';
                answerInput.value = '';
                this.playFallShowcase();
            } else {
                // Second wrong attempt: show fall animation first, then switch to 4-Option Fallback Mode!
                this.switchToFourOptionsMode(q, raw);
                this.playFallShowcase();
            }
        }
    }

    switchToFourOptionsMode(q, lastWrongVal) {
        this.quizMode = 'OPTIONS';
        const feedbackEl = document.getElementById('quiz-feedback-msg');
        const inputSection = document.getElementById('quiz-input-section');
        const optionsSection = document.getElementById('quiz-options-section');
        const optionsGrid = document.getElementById('quiz-options-grid');

        feedbackEl.textContent = `⚠️ 第二次輸入「${lastWrongVal}」仍錯誤！已開啟四選一救援，請選出正確答案才能爬起來繼續跑：`;
        feedbackEl.className = 'quiz-feedback error';

        inputSection.classList.add('hidden');
        optionsSection.classList.remove('hidden');
        optionsGrid.innerHTML = '';

        q.options.forEach((optVal) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'quiz-option-btn';
            btn.textContent = String(optVal);
            btn.addEventListener('click', () => {
                if (optVal === q.answer) {
                    btn.classList.add('correct');
                    // Passed via 4-option rescue (recovers & continues running, no sprint boost)
                    this.handleQuestionCorrect(false);
                } else {
                    window.soundManager.playWrongFall();
                    btn.classList.add('wrong');
                    btn.disabled = true;
                    feedbackEl.textContent = `❌「${optVal}」還是不對喔！請看下方觀念提示，再選選看！`;
                }
            });
            optionsGrid.appendChild(btn);
        });
    }

    handleQuestionCorrect(earnedSprintBoost) {
        this.isQuizOpen = false;
        document.getElementById('quiz-modal').classList.add('hidden');

        // Dim passed checkpoint stripe
        const cp = this.world.checkpointMeshes[this.currentQuestionIdx];
        if (cp && cp.userData.stripe) {
            cp.userData.stripe.material.opacity = 0.18;
        }

        this.currentQuestionIdx++;

        if (this.localRunner) {
            this.localRunner.charCtrl.setDizzyEffect(false);
            if (earnedSprintBoost) {
                // Answered correctly on 1st or 2nd direct input -> Sprint Boost!
                this.localRunner.correctCount++;
                this.localRunner.sprintTimer = 2.6;
                this.localRunner.charCtrl.playAnimation('Sprint', 0.15);
                this.localRunner.charCtrl.setSprintEffect(true);
                window.soundManager.playCorrectSprint();
                this.showFloatingToast('⚡ 答對了！加速衝刺！', 'boost');
            } else {
                // Rescued via 4 options -> Recover and resume normal running
                this.localRunner.charCtrl.playAnimation('Recover', 0.12);
                window.soundManager.playRecover();
                this.showFloatingToast('💪 選對了！爬起來繼續往前跑！', 'recover');
                setTimeout(() => {
                    if (this.state === 'RACING' && !this.isQuizOpen && this.localRunner && !this.localRunner.finished) {
                        this.localRunner.charCtrl.playAnimation('Run', 0.18);
                    }
                }, 480);
            }
            this.syncLocalRunner();
        }

        this.updateHud();
    }

    showFloatingToast(text, styleType) {
        const toast = document.getElementById('race-toast');
        if (!toast) return;
        toast.textContent = text;
        toast.className = `race-toast ${styleType} show`;
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => {
            toast.classList.remove('show');
        }, 1900);
    }

    // =========================================================================
    // 7. Race Physics, AI Opponents & Finish Leaderboard (Reference Image 4)
    // =========================================================================
    updateRace(dt) {
        this.raceElapsed += dt;
        const checkpoints = this.world.checkpointProgresses;

        // Check if local human runner has already finished so slow AI bots speed up slightly
        const localFinished = this.localRunner && this.localRunner.finished;

        for (const r of this.runners) {
            if (r.finished) continue;

            if (r.isLocal) {
                // Local player logic
                if (this.isQuizOpen) {
                    // Paused at question checkpoint while answering
                    r.currentSpeed = 0;
                } else {
                    let speed = r.baseSpeed;
                    if (r.sprintTimer > 0) {
                        r.sprintTimer -= dt;
                        speed *= 1.85; // Sprint boost multiplier!
                        if (r.sprintTimer <= 0) {
                            r.charCtrl.setSprintEffect(false);
                            r.charCtrl.playAnimation('Run', 0.2);
                        }
                    } else if (r.charCtrl.currentActionName !== 'Run' && r.charCtrl.currentActionName !== 'Recover') {
                        r.charCtrl.playAnimation('Run', 0.2);
                    }

                    r.currentSpeed = speed;
                    r.progress += speed * dt;

                    // Check if reached the next question checkpoint (Q1..Q10)
                    if (this.currentQuestionIdx < checkpoints.length) {
                        const targetProg = checkpoints[this.currentQuestionIdx];
                        if (r.progress >= targetProg) {
                            r.progress = targetProg;
                            this.triggerQuestionModal(this.currentQuestionIdx);
                        }
                    }

                    // Check if crossed Finish Line (progress >= 1.0)
                    if (r.progress >= 1.0) {
                        r.progress = 1.0;
                        r.finished = true;
                        r.finishTime = Number(this.raceElapsed.toFixed(1));
                        r.charCtrl.setSprintEffect(false);
                        r.charCtrl.playAnimation('Cheer', 0.2);
                        window.soundManager.playFinishFanfare();
                        this.showFloatingToast(`🎉 衝過終點！用時 ${r.finishTime.toFixed(1)} 秒`, 'boost');
                        this.syncLocalRunner();
                        this.checkAllRunnersFinished();
                    }
                }
                this.updateRunnerTransform(r);
            } else if (r.isAI) {
                // AI Runner (牛奶、八月、阿麥) simulation along their lane
                if (r.aiPauseTimer > 0) {
                    r.aiPauseTimer -= dt;
                    if (r.aiPauseTimer <= 0) {
                        r.charCtrl.setDizzyEffect(false);
                        if (r.sprintTimer > 0) {
                            r.charCtrl.playAnimation('Sprint', 0.15);
                            r.charCtrl.setSprintEffect(true);
                        } else {
                            r.charCtrl.playAnimation('Run', 0.18);
                        }
                    }
                } else {
                    let aiSpeed = r.baseSpeed;
                    if (r.sprintTimer > 0) {
                        r.sprintTimer -= dt;
                        aiSpeed *= 1.55;
                        if (r.sprintTimer <= 0) {
                            r.charCtrl.setSprintEffect(false);
                            r.charCtrl.playAnimation('Run', 0.2);
                        }
                    }
                    // If local player already finished, speed up remaining AI so player doesn't wait long
                    if (localFinished) {
                        aiSpeed *= 2.8;
                    }

                    r.progress += aiSpeed * dt;

                    // AI encounters each of the 10 checkpoints
                    if (r.nextCheckpointIdx < checkpoints.length) {
                        const cpProg = checkpoints[r.nextCheckpointIdx];
                        if (r.progress >= cpProg) {
                            r.progress = cpProg;
                            r.nextCheckpointIdx++;

                            if (!localFinished) {
                                const hitCorrect = Math.random() < (r.aiSpec.accuracy || 0.8);
                                if (hitCorrect) {
                                    r.correctCount++;
                                    r.aiPauseTimer = 0.65 + Math.random() * 0.5;
                                    r.sprintTimer = 1.8;
                                    r.charCtrl.playAnimation('Idle', 0.12);
                                } else {
                                    // AI stumbles & falls!
                                    r.aiPauseTimer = 1.55 + Math.random() * 0.6;
                                    r.charCtrl.playAnimation('Fall', 0.12);
                                    r.charCtrl.setDizzyEffect(true);
                                }
                            }
                        }
                    }

                    if (r.progress >= 1.0) {
                        r.progress = 1.0;
                        r.finished = true;
                        r.finishTime = Number(this.raceElapsed.toFixed(1));
                        r.charCtrl.setSprintEffect(false);
                        r.charCtrl.setDizzyEffect(false);
                        r.charCtrl.playAnimation('Cheer', 0.2);
                        this.checkAllRunnersFinished();
                    }
                }
                this.updateRunnerTransform(r);
            } else {
                // Remote human player (updated via network events)
                this.updateRunnerTransform(r);
            }
        }

        // Periodically broadcast local runner state in multiplayer
        this.syncAccumulator = (this.syncAccumulator || 0) + dt;
        if (this.syncAccumulator >= 0.12) {
            this.syncAccumulator = 0;
            this.syncLocalRunner();
        }

        this.updateHud();
    }

    syncLocalRunner() {
        if (!this.localRunner) return;
        window.multiplayerManager.sendRunnerState({
            progress: this.localRunner.progress,
            anim: this.localRunner.charCtrl.currentActionName,
            sprint: this.localRunner.sprintTimer > 0,
            dizzy: this.localRunner.fallTimer > 0,
            correctCount: this.localRunner.correctCount,
            finishTime: this.localRunner.finishTime
        });
    }

    updateHud() {
        const timerEl = document.getElementById('hud-timer');
        const qCountEl = document.getElementById('hud-question-count');
        const correctEl = document.getElementById('hud-correct-count');

        if (timerEl) timerEl.textContent = `${this.raceElapsed.toFixed(1)} 秒`;
        if (qCountEl) qCountEl.textContent = `${Math.min(this.currentQuestionIdx + 1, this.totalQuestions)} / ${this.totalQuestions}`;
        if (correctEl && this.localRunner) {
            correctEl.textContent = `${this.localRunner.correctCount} / ${this.totalQuestions}`;
        }

        // Update mini live progress track bar
        const trackBar = document.getElementById('hud-runners-bar');
        if (trackBar) {
            this.runners.forEach((r) => {
                let dot = trackBar.querySelector(`[data-runner-id="${r.id}"]`);
                if (!dot) {
                    dot = document.createElement('div');
                    dot.className = 'hud-runner-dot' + (r.isLocal ? ' is-self' : '');
                    dot.dataset.runnerId = r.id;
                    dot.title = r.name;
                    trackBar.appendChild(dot);
                }
                const pct = Math.min(100, Math.max(0, r.progress * 100));
                dot.style.left = `${pct}%`;
            });
        }
    }

    checkAllRunnersFinished() {
        if (this.state !== 'RACING') return;
        const allDone = this.runners.every(r => r.finished);
        if (allDone) {
            this.state = 'FINISHED';
            setTimeout(() => {
                this.showResultsModal();
            }, 650);
        }
    }

    // Show Final Leaderboard Card matching Reference Image 4!
    showResultsModal() {
        const modal = document.getElementById('results-modal');
        const titleEl = document.getElementById('results-rank-title');
        const subEl = document.getElementById('results-summary-sub');
        const listEl = document.getElementById('results-ranking-list');

        // Sort all 4 runners by finishTime ascending
        const sorted = [...this.runners].sort((a, b) => (a.finishTime || 999) - (b.finishTime || 999));
        const myRank = sorted.findIndex(r => r.isLocal) + 1;
        const myRunner = this.localRunner || sorted[0];

        const rankMessages = {
            1: '第 1 名　完賽！太神啦，金牌得主！',
            2: '第 2 名　完賽！表現超棒，只差一點點！',
            3: '第 3 名　完賽！穩扎穩打，繼續加油！',
            4: '第 4 名　完賽！下次一定更快！'
        };
        titleEl.textContent = rankMessages[myRank] || `第 ${myRank} 名　完賽！`;
        subEl.textContent = `答對 ${myRunner.correctCount} / ${this.totalQuestions} 題　用時 ${(myRunner.finishTime || 0).toFixed(1)} 秒`;

        listEl.innerHTML = '';
        sorted.forEach((r, idx) => {
            const row = document.createElement('div');
            row.className = 'result-row' + (r.isLocal ? ' is-self' : '');
            row.innerHTML = `
                <span class="result-name">${idx + 1}. ${r.name}</span>
                <span class="result-time">${(r.finishTime || 0).toFixed(1)} 秒</span>
            `;
            listEl.appendChild(row);
        });

        modal.classList.remove('hidden');
    }

    initResultsUI() {
        // "再跑一次" button
        document.getElementById('btn-race-again').addEventListener('click', () => {
            window.soundManager.playClick();
            document.getElementById('results-modal').classList.add('hidden');
            if (window.multiplayerManager.roomCode && window.multiplayerManager.isHost) {
                window.multiplayerManager.hostTriggerStart(this.world.weatherMode);
            } else {
                this.startSinglePlayerRace();
            }
        });

        // "回到校園" (Edit character / return to campus) button
        document.getElementById('btn-back-campus').addEventListener('click', () => {
            window.soundManager.playClick();
            document.getElementById('results-modal').classList.add('hidden');
            document.getElementById('race-hud').classList.add('hidden');
            document.getElementById('creator-overlay').classList.remove('hidden');
            this.state = 'CREATOR';
        });
    }

    // =========================================================================
    // 8. Camera Follow & Projected 3D-to-2D Floating Name Tags
    // =========================================================================
    updateCamera(dt) {
        const targetRunner = this.localRunner || this.runners[0];
        if (!targetRunner) return;

        if (this.fallCameraTimer > 0) {
            this.fallCameraTimer = Math.max(0, this.fallCameraTimer - dt);
        }

        const charPos = targetRunner.charCtrl.group.position;
        const heading = targetRunner.charCtrl.group.rotation.y;

        // Forward unit vector (fx, fz) and Right unit vector (rx, rz) relative to runner
        const fx = Math.sin(heading);
        const fz = Math.cos(heading);
        const rx = -fz;
        const rz = fx;

        let desiredCamPos;
        let lookAtPos;

        if (this.fallCameraTimer > 0) {
            // Close-up 3/4 front-side showcase view when the character stumbles and falls!
            desiredCamPos = new THREE.Vector3(
                charPos.x + fx * 3.8 + rx * 2.6,
                charPos.y + 2.2,
                charPos.z + fz * 3.8 + rz * 2.6
            );
            lookAtPos = new THREE.Vector3(charPos.x, charPos.y + 0.65, charPos.z);
        } else if (this.isQuizOpen && window.innerWidth > 680) {
            // While answering a question on desktop/tablet: place character on the LEFT half of the screen
            // so the right-aligned Quiz Card never covers the character or their fallen pose!
            desiredCamPos = new THREE.Vector3(
                charPos.x + fx * 4.8 + rx * 2.2,
                charPos.y + 2.6,
                charPos.z + fz * 4.8 + rz * 2.2
            );
            lookAtPos = new THREE.Vector3(
                charPos.x - rx * 1.35,
                charPos.y + 0.85,
                charPos.z - rz * 1.35
            );
        } else if (this.cameraViewMode === 'FRONT' || this.state === 'FINISHED') {
            // Front Campus View (like Reference Image 3: looking at the front of the character with campus buildings behind)
            desiredCamPos = new THREE.Vector3(
                charPos.x + fx * 6.8 + 1.2,
                charPos.y + 3.4,
                charPos.z + fz * 6.8
            );
            lookAtPos = new THREE.Vector3(charPos.x, charPos.y + 1.3, charPos.z);
        } else {
            // Back Follow View (like Reference Image 2: elevated behind the runner looking down the track)
            desiredCamPos = new THREE.Vector3(
                charPos.x - fx * 7.8,
                charPos.y + 5.2,
                charPos.z - fz * 7.8
            );
            lookAtPos = new THREE.Vector3(
                charPos.x + fx * 5.5,
                charPos.y + 1.0,
                charPos.z + fz * 5.5
            );
        }

        this.world.camera.position.lerp(desiredCamPos, Math.min(1, dt * 6.5));
        this.world.camera.lookAt(lookAtPos);
    }

    updateFloatingLabels() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const widthHalf = width * 0.5;
        const heightHalf = height * 0.5;

        for (const r of this.runners) {
            if (!r.labelEl) continue;
            const pos = r.charCtrl.group.position.clone();
            pos.y += (r.charCtrl.ageScale || 0.9) * 2.15;
            pos.project(this.world.camera);

            if (pos.z > 1.0) {
                r.labelEl.style.display = 'none';
            } else {
                const x = (pos.x * widthHalf) + widthHalf;
                const y = -(pos.y * heightHalf) + heightHalf;
                r.labelEl.style.display = 'inline-flex';
                r.labelEl.style.transform = `translate(-50%, -100%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
            }
        }
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        const dt = Math.min(this.clock.getDelta(), 0.1);
        this.elapsedTotal += dt;

        // Update 3D Creator Preview if visible
        if (this.state === 'CREATOR' && this.previewChar && this.previewRenderer) {
            this.previewChar.update(dt, this.elapsedTotal);
            if (!this.isDraggingPreview) {
                this.previewChar.group.rotation.y = Math.sin(this.elapsedTotal * 0.9) * 0.28;
            }
            this.previewRenderer.render(this.previewScene, this.previewCamera);
        }

        // Update Race if active
        if (this.state === 'RACING') {
            this.updateRace(dt);
        }

        // Update all runners' skeletal animations
        for (const r of this.runners) {
            r.charCtrl.update(dt, this.elapsedTotal);
        }

        // Update world & weather particles
        const focusPos = this.localRunner ? this.localRunner.charCtrl.group.position : null;
        this.world.update(dt, this.elapsedTotal, focusPos);
        this.updateCamera(dt);
        this.updateFloatingLabels();
        this.world.render();
    }
}

window.addEventListener('DOMContentLoaded', () => {
    const game = new MathTrackGame();
    game.start();
    window.mathTrackGame = game;
});
