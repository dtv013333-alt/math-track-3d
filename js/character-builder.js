// 3D Character Builder & GLB Skeletal Animation Controller
// Loads assets/character_rigged.glb via THREE.GLTFLoader and attaches customizable
// hairstyles, outfits, accessories, facial expressions, andTHREE.AnimationMixer actions.

const CHARACTER_PALETTES = {
    skinColors: ['#fde2c4', '#f5cfa0', '#e5b578', '#c48c52', '#825634'],
    eyeColors: ['#4e2a14', '#1c1c1c', '#2364d2', '#1f8b4c', '#717982', '#7b42bc'],
    hairColors: ['#181818', '#3b2516', '#7a4722', '#c99838', '#dcdde1', '#a8241c', '#1c64a8', '#e078a8'],
    topColors: ['#e84a27', '#f39c12', '#f1c40f', '#43a047', '#26a69a', '#2b6cb0', '#7e57c2', '#ec87c0', '#f8f9fa', '#2d3136'],
    bottomColors: ['#234782', '#2f353b', '#5d4037', '#688233', '#b8332a', '#e8dec8'],
    hairStyles: [
        { id: 'short', label: '短髮' },
        { id: 'long', label: '長髮' },
        { id: 'ponytail', label: '馬尾' },
        { id: 'cap', label: '棒球帽' },
        { id: 'bald', label: '光頭' },
        { id: 'twintails', label: '雙馬尾' },
        { id: 'buns', label: '包子頭' },
        { id: 'bob', label: '鮑伯頭' },
        { id: 'spiky', label: '刺蝟頭' }
    ],
    bottomStyles: [
        { id: 'pants', label: '長褲' },
        { id: 'shorts', label: '短褲' },
        { id: 'skirt', label: '裙子' },
        { id: 'dress', label: '洋裝' }
    ],
    accessories: [
        { id: 'none', label: '無' },
        { id: 'glasses', label: '眼鏡' },
        { id: 'backpack', label: '背包' },
        { id: 'scarf', label: '圍巾' }
    ],
    roles: [
        { id: 'student', label: '學生', icon: '🎒' },
        { id: 'parent', label: '家長', icon: '👨‍👩‍👧' },
        { id: 'teacher', label: '老師', icon: '📚' },
        { id: 'visitor', label: '訪客', icon: '👋' }
    ]
};

class CharacterBuilder {
    constructor() {
        this.baseGltf = null;
        this.isLoaded = false;
    }

    async init() {
        if (this.isLoaded) return;

        // Load assets/character_rigged.glb using THREE.GLTFLoader (with Base64 fallback for file://)
        const loader = new THREE.GLTFLoader();

        const parseBase64Fallback = () => new Promise((resolve, reject) => {
            if (!window.CHARACTER_GLB_BASE64) {
                reject(new Error('No GLB fallback data'));
                return;
            }
            const binaryStr = atob(window.CHARACTER_GLB_BASE64);
            const len = binaryStr.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryStr.charCodeAt(i);
            }
            loader.parse(bytes.buffer, '', (gltf) => resolve(gltf), (err) => reject(err));
        });

        try {
            if (window.location.protocol === 'file:') {
                this.baseGltf = await parseBase64Fallback();
            } else {
                this.baseGltf = await new Promise((resolve, reject) => {
                    loader.load(
                        './assets/character_rigged.glb',
                        (gltf) => resolve(gltf),
                        undefined,
                        async () => {
                            try {
                                const fallback = await parseBase64Fallback();
                                resolve(fallback);
                            } catch (e) {
                                reject(e);
                            }
                        }
                    );
                });
            }
            this.isLoaded = true;
            console.log('[CharacterBuilder] Loaded Blender GLB model with animations:',
                this.baseGltf.animations.map(a => a.name).join(', '));
        } catch (err) {
            console.warn('[CharacterBuilder] Fallback to procedural rig:', err);
            this.isLoaded = true;
        }
    }

    getDefaultConfig() {
        const randId = Math.floor(Math.random() * 89) + 10;
        return {
            nickname: `訪客${randId}`,
            age: 'adult',
            gender: 'female',   // 'male' | 'female'
            role: 'student',
            roleIcon: '🎒',
            skinColor: '#fde2c4',
            eyeColor: '#4e2a14',
            hairColor: '#7a4722',
            hairStyle: 'long',
            topColor: '#e84a27',
            bottomStyle: 'dress',
            bottomColor: '#234782',
            accessory: 'none'
        };
    }

    getRandomConfig(keepName = true, currentName = '訪客42') {
        const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
        const gender = pick(['male', 'female']);
        const bottomPool = gender === 'male' ? ['pants', 'shorts'] : ['pants', 'shorts', 'skirt', 'dress'];
        return {
            nickname: keepName ? currentName : `選手${Math.floor(Math.random() * 90 + 10)}`,
            age: 'adult',
            gender,
            role: 'student',
            roleIcon: '🎒',
            skinColor: pick(CHARACTER_PALETTES.skinColors),
            eyeColor: pick(CHARACTER_PALETTES.eyeColors),
            hairColor: pick(CHARACTER_PALETTES.hairColors),
            hairStyle: pick(CHARACTER_PALETTES.hairStyles).id,
            topColor: pick(CHARACTER_PALETTES.topColors),
            bottomStyle: pick(bottomPool),
            bottomColor: pick(CHARACTER_PALETTES.bottomColors),
            accessory: pick(CHARACTER_PALETTES.accessories).id
        };
    }

    getAIPresetConfigs() {
        return [
            {
                id: 'ai_ko',
                name: '柯老師',
                baseSpeed: 0.0216,
                accuracy: 0.85,
                config: {
                    nickname: '柯老師',
                    age: 'adult',
                    gender: 'female',
                    skinColor: '#fde2c4',
                    eyeColor: '#4e2a14',
                    hairColor: '#7a4722',       // 棕色
                    hairStyle: 'long_curly',    // 長捲髮
                    topColor: '#1e3a8a',        // 深藍上衣
                    bottomStyle: 'pants',       // 長褲
                    bottomColor: '#7dd3fc',     // 淺藍長褲
                    accessory: 'none'
                }
            },
            {
                id: 'ai_awei',
                name: '阿維老師',
                baseSpeed: 0.0208,
                accuracy: 0.80,
                config: {
                    nickname: '阿維老師',
                    age: 'adult',
                    gender: 'female',
                    skinColor: '#f5cfa0',
                    eyeColor: '#1c1c1c',
                    hairColor: '#181818',       // 黑色
                    hairStyle: 'long',          // 長直髮
                    topColor: '#e53935',        // 紅色上衣
                    bottomStyle: 'shorts',      // 短褲
                    bottomColor: '#1f2428',     // 黑色短褲
                    accessory: 'none'
                }
            },
            {
                id: 'ai_lisa',
                name: 'Lisa',
                baseSpeed: 0.0196,
                accuracy: 0.76,
                config: {
                    nickname: 'Lisa',
                    age: 'adult',
                    gender: 'female',
                    skinColor: '#fde2c4',
                    eyeColor: '#4e2a14',
                    hairColor: '#3b2516',       // 深棕色
                    hairStyle: 'shoulder',      // 及肩頭髮
                    topColor: '#81c784',        // 淺綠色上衣
                    bottomStyle: 'long_skirt',  // 長裙
                    bottomColor: '#1b5e20',     // 深綠色長裙
                    accessory: 'none'
                }
            }
        ];
    }

    // Create a textured canvas face for the cute Q-version character (like Reference Image 1)
    createFaceTexture(skinHex, eyeHex, expression = 'happy') {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        // Base skin fill
        ctx.fillStyle = skinHex;
        ctx.fillRect(0, 0, 512, 512);

        // In UV sphere mapping, front center of face is around x=256, y=260
        // Soft rosy cheeks
        const drawBlush = (cx, cy) => {
            const grad = ctx.createRadialGradient(cx, cy, 4, cx, cy, 34);
            grad.addColorStop(0, 'rgba(255, 115, 125, 0.58)');
            grad.addColorStop(1, 'rgba(255, 115, 125, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(cx, cy, 34, 0, Math.PI * 2);
            ctx.fill();
        };
        drawBlush(188, 290);
        drawBlush(324, 290);

        // Cute eyebrows
        ctx.strokeStyle = '#3a2210';
        ctx.lineWidth = 7;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(204, 232, 22, Math.PI * 1.15, Math.PI * 1.75);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(308, 232, 22, Math.PI * 1.25, Math.PI * 1.85);
        ctx.stroke();

        // Eyes: either happy curved eyes + iris or big cute eyes
        if (expression === 'dizzy') {
            ctx.strokeStyle = '#2d1e12';
            ctx.lineWidth = 8;
            const drawX = (x, y) => {
                ctx.beginPath();
                ctx.moveTo(x - 14, y - 14); ctx.lineTo(x + 14, y + 14);
                ctx.moveTo(x + 14, y - 14); ctx.lineTo(x - 14, y + 14);
                ctx.stroke();
            };
            drawX(204, 258);
            drawX(308, 258);
        } else {
            // Happy arch upper lid + iris below so eyeColor is clearly visible!
            const drawEye = (x, y) => {
                // White sclera oval
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.ellipse(x, y + 4, 18, 16, 0, 0, Math.PI * 2);
                ctx.fill();

                // Colored iris
                ctx.fillStyle = eyeHex;
                ctx.beginPath();
                ctx.ellipse(x, y + 5, 12, 13, 0, 0, Math.PI * 2);
                ctx.fill();

                // Dark pupil
                ctx.fillStyle = '#141414';
                ctx.beginPath();
                ctx.arc(x, y + 6, 6, 0, Math.PI * 2);
                ctx.fill();

                // Eye sparkle highlight
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(x - 5, y, 4.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.arc(x + 5, y + 9, 2.2, 0, Math.PI * 2);
                ctx.fill();

                // Cute curved upper eyelash (like Ref Image 1)
                ctx.strokeStyle = '#2b1708';
                ctx.lineWidth = 7;
                ctx.beginPath();
                ctx.arc(x, y + 6, 17, Math.PI * 1.08, Math.PI * 1.92);
                ctx.stroke();
            };
            drawEye(204, 255);
            drawEye(308, 255);
        }

        // Cute tiny nose highlight
        ctx.fillStyle = 'rgba(210, 130, 100, 0.45)';
        ctx.beginPath();
        ctx.ellipse(256, 282, 6, 4.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Cute smile mouth
        ctx.fillStyle = '#e0534c';
        ctx.beginPath();
        ctx.arc(256, 304, 16, 0.08 * Math.PI, 0.92 * Math.PI, false);
        ctx.closePath();
        ctx.fill();

        const tex = new THREE.CanvasTexture(canvas);
        tex.needsUpdate = true;
        return tex;
    }

    // Clone the loaded .glb hierarchy and attach customizable 3D parts
    createCharacter(config) {
        const cfg = Object.assign(this.getDefaultConfig(), config || {});
        const wrapper = new THREE.Group();
        wrapper.name = 'CharacterWrapper';

        let rootNode;
        if (this.baseGltf && this.baseGltf.scene) {
            rootNode = this.baseGltf.scene.clone(true);
        } else {
            rootNode = this.createFallbackHierarchy();
        }
        wrapper.add(rootNode);

        // Locate skeleton nodes from the GLB scene
        const nodes = {
            Root: rootNode.getObjectByName('Root') || rootNode,
            Hips: rootNode.getObjectByName('Hips'),
            Torso: rootNode.getObjectByName('Torso'),
            Head: rootNode.getObjectByName('Head'),
            ArmL: rootNode.getObjectByName('ArmL'),
            ArmR: rootNode.getObjectByName('ArmR'),
            LegL: rootNode.getObjectByName('LegL'),
            LegR: rootNode.getObjectByName('LegR')
        };

        // Materials
        const skinMat = new THREE.MeshLambertMaterial({ color: cfg.skinColor });
        const faceTex = this.createFaceTexture(cfg.skinColor, cfg.eyeColor, 'happy');
        const headMat = new THREE.MeshLambertMaterial({ map: faceTex });
        const hairMat = new THREE.MeshLambertMaterial({ color: cfg.hairColor });
        const topMat = new THREE.MeshLambertMaterial({ color: cfg.topColor });
        const bottomMat = new THREE.MeshLambertMaterial({ color: cfg.bottomColor });
        const shoeMat = new THREE.MeshLambertMaterial({ color: '#ffffff' });

        // Apply skin material to HeadMesh and attach 3D facial features (eyes, brows, nose, blush, mouth)
        let faceController = null;
        if (nodes.Head) {
            nodes.Head.traverse((child) => {
                if (child.isMesh) {
                    child.material = skinMat;
                    child.castShadow = true;
                }
            });
            faceController = this.attachFaceFeatures(nodes.Head, cfg);
        }

        if (nodes.Torso) {
            nodes.Torso.traverse((child) => {
                if (child.isMesh) {
                    child.material = topMat;
                    child.castShadow = true;
                }
            });
        }

        [nodes.ArmL, nodes.ArmR].forEach((arm) => {
            if (!arm) return;
            arm.traverse((child) => {
                if (child.isMesh) {
                    child.material = skinMat;
                    child.castShadow = true;
                }
            });
            // Add cute short sleeve on top of arm
            const sleeve = new THREE.Mesh(
                new THREE.CylinderGeometry(0.12, 0.135, 0.18, 14),
                topMat
            );
            sleeve.position.set(0, -0.06, 0);
            arm.add(sleeve);
        });

        [nodes.LegL, nodes.LegR].forEach((leg) => {
            if (!leg) return;
            leg.traverse((child) => {
                if (child.isMesh) {
                    child.material = (cfg.bottomStyle === 'pants') ? bottomMat : skinMat;
                    child.castShadow = true;
                }
            });
            // Cute white rounded shoe
            const shoe = new THREE.Mesh(
                new THREE.SphereGeometry(0.14, 14, 12),
                shoeMat
            );
            shoe.scale.set(1.0, 0.65, 1.35);
            shoe.position.set(0, -0.40, 0.04);
            leg.add(shoe);
        });

        // Build Bottom Style (dress, skirt, shorts, pants)
        if (nodes.Torso) {
            this.attachBottomStyle(nodes.Torso, nodes.LegL, nodes.LegR, cfg.bottomStyle, topMat, bottomMat);
        }

        // Build Hair Style (9 options from Reference Image 1)
        if (nodes.Head) {
            this.attachHairStyle(nodes.Head, cfg.hairStyle, hairMat, topMat);
        }

        // Build Accessories (none, glasses, backpack, scarf)
        this.attachAccessory(nodes.Head, nodes.Torso, cfg.accessory);

        // Add Sprint Effect & Dizzy Stars Group
        const fxGroup = this.createEffectsGroup();
        wrapper.add(fxGroup);

        // Age scaling (小孩比較矮 vs 大人)
        const ageScale = cfg.age === 'child' ? 0.78 : 1.0;
        wrapper.scale.set(ageScale, ageScale, ageScale);

        // Bind THREE.AnimationMixer to the GLB animations
        const mixer = new THREE.AnimationMixer(rootNode);
        const actions = {};
        if (this.baseGltf && this.baseGltf.animations) {
            for (const clip of this.baseGltf.animations) {
                const action = mixer.clipAction(clip);
                if (clip.name === 'Fall' || clip.name === 'Recover') {
                    action.setLoop(THREE.LoopOnce);
                    action.clampWhenFinished = true;
                }
                actions[clip.name] = action;
            }
        }

        const controller = {
            group: wrapper,
            rootNode,
            nodes,
            mixer,
            actions,
            currentActionName: null,
            fxGroup,
            config: cfg,
            ageScale,
            playAnimation(name, fadeDuration = 0.18) {
                if (!actions[name] || this.currentActionName === name) return;
                const nextAction = actions[name];
                if (this.currentActionName && actions[this.currentActionName]) {
                    actions[this.currentActionName].fadeOut(fadeDuration);
                }
                nextAction.reset().fadeIn(fadeDuration).play();
                this.currentActionName = name;
            },
            setSprintEffect(active) {
                fxGroup.userData.sprintRing.visible = active;
            },
            setDizzyEffect(active) {
                fxGroup.userData.dizzyGroup.visible = active;
                if (faceController) {
                    faceController.setDizzy(active);
                }
            },
            update(dt, elapsed) {
                mixer.update(dt);
                if (fxGroup.userData.dizzyGroup.visible) {
                    fxGroup.userData.dizzyGroup.rotation.y += dt * 4.5;
                }
                if (fxGroup.userData.sprintRing.visible) {
                    fxGroup.userData.sprintRing.rotation.z += dt * 6.0;
                    const pulse = 1 + Math.sin(elapsed * 18) * 0.12;
                    fxGroup.userData.sprintRing.scale.set(pulse, pulse, pulse);
                }
            }
        };

        controller.playAnimation('Idle', 0.01);
        return controller;
    }

    // Build 3D expressive facial features (eyebrows, colored eyes, highlights, blush, nose, smile)
    // directly on the front (+Z) of Head node (center y=0.36, front z=0.44)
    attachFaceFeatures(headNode, cfg) {
        const faceGroup = new THREE.Group();
        faceGroup.name = 'FaceFeatures3D';

        const browMat = new THREE.MeshBasicMaterial({ color: '#3b2314' });
        const scleraMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
        const irisMat = new THREE.MeshBasicMaterial({ color: cfg.eyeColor || '#4e2a14' });
        const pupilMat = new THREE.MeshBasicMaterial({ color: '#111111' });
        const blushMat = new THREE.MeshBasicMaterial({ color: '#ff8a95', transparent: true, opacity: 0.65 });
        const noseMat = new THREE.MeshLambertMaterial({ color: cfg.skinColor || '#fde2c4' });
        const mouthMat = new THREE.MeshBasicMaterial({ color: '#e04f44', side: THREE.DoubleSide });

        const normalEyesGroup = new THREE.Group();
        const dizzyEyesGroup = new THREE.Group();
        dizzyEyesGroup.visible = false;

        [-1, 1].forEach((side) => {
            const xEye = side * 0.155;

            // 1. Eyebrow (curved arch above eye)
            const brow = new THREE.Mesh(
                new THREE.BoxGeometry(0.11, 0.024, 0.025),
                browMat
            );
            brow.position.set(xEye, 0.48, 0.415);
            brow.rotation.z = -side * 0.10;
            brow.rotation.y = side * 0.22;
            faceGroup.add(brow);

            // 2. Normal Eye (White sclera + Colored iris + Pupil + Sparkle + Upper lash)
            const eyeUnit = new THREE.Group();
            eyeUnit.position.set(xEye, 0.365, 0.425);
            eyeUnit.rotation.y = side * 0.20;

            const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.068, 14, 12), scleraMat);
            sclera.scale.set(1.05, 1.12, 0.35);
            eyeUnit.add(sclera);

            const iris = new THREE.Mesh(new THREE.SphereGeometry(0.048, 14, 12), irisMat);
            iris.scale.set(1.0, 1.08, 0.35);
            iris.position.set(0, -0.004, 0.012);
            eyeUnit.add(iris);

            const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 10), pupilMat);
            pupil.scale.set(1.0, 1.05, 0.35);
            pupil.position.set(0, -0.004, 0.020);
            eyeUnit.add(pupil);

            // White eye sparkle highlight
            const shine1 = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 8), scleraMat);
            shine1.position.set(-0.016, 0.018, 0.026);
            eyeUnit.add(shine1);

            const shine2 = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 8), scleraMat);
            shine2.position.set(0.016, -0.016, 0.026);
            eyeUnit.add(shine2);

            // Upper eyelash bar
            const lash = new THREE.Mesh(new THREE.BoxGeometry(0.125, 0.022, 0.025), browMat);
            lash.position.set(0, 0.058, 0.012);
            lash.rotation.z = -side * 0.06;
            eyeUnit.add(lash);

            normalEyesGroup.add(eyeUnit);

            // 3. Dizzy X-Eye (shown when character falls)
            const xGroup = new THREE.Group();
            xGroup.position.set(xEye, 0.365, 0.44);
            xGroup.rotation.y = side * 0.20;
            const bar1 = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.024, 0.02), browMat);
            bar1.rotation.z = Math.PI * 0.25;
            const bar2 = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.024, 0.02), browMat);
            bar2.rotation.z = -Math.PI * 0.25;
            xGroup.add(bar1, bar2);
            dizzyEyesGroup.add(xGroup);

            // 4. Rosy Cheek Blush
            const blush = new THREE.Mesh(new THREE.SphereGeometry(0.058, 12, 10), blushMat);
            blush.scale.set(1.25, 0.72, 0.32);
            blush.position.set(side * 0.245, 0.285, 0.39);
            blush.rotation.y = side * 0.38;
            faceGroup.add(blush);
        });

        faceGroup.add(normalEyesGroup);
        faceGroup.add(dizzyEyesGroup);

        // 5. Cute 3D Button Nose
        const nose = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 10), noseMat);
        nose.scale.set(1.0, 0.85, 1.15);
        nose.position.set(0, 0.31, 0.455);
        faceGroup.add(nose);

        // 6. Cute Happy Smile Mouth (half-circle D-shape smile)
        const smileMouth = new THREE.Mesh(
            new THREE.CircleGeometry(0.062, 16, Math.PI, Math.PI),
            mouthMat
        );
        smileMouth.position.set(0, 0.245, 0.438);
        smileMouth.rotation.x = -0.12;
        faceGroup.add(smileMouth);

        // Surprised O-mouth when dizzy/falling
        const dizzyMouth = new THREE.Mesh(
            new THREE.CircleGeometry(0.042, 16),
            mouthMat
        );
        dizzyMouth.position.set(0, 0.22, 0.438);
        dizzyMouth.rotation.x = -0.12;
        dizzyMouth.visible = false;
        faceGroup.add(dizzyMouth);

        headNode.add(faceGroup);

        return {
            setDizzy(isDizzy) {
                normalEyesGroup.visible = !isDizzy;
                smileMouth.visible = !isDizzy;
                dizzyEyesGroup.visible = Boolean(isDizzy);
                dizzyMouth.visible = Boolean(isDizzy);
            }
        };
    }

    attachBottomStyle(torsoNode, legL, legR, style, topMat, bottomMat) {
        if (style === 'dress') {
            // Cute A-line flared dress like Reference Image 1
            const dressCone = new THREE.Mesh(
                new THREE.ConeGeometry(0.54, 0.72, 24, 1, false),
                topMat
            );
            dressCone.position.set(0, 0.12, 0);
            dressCone.castShadow = true;
            torsoNode.add(dressCone);
        } else if (style === 'long_skirt') {
            // Long skirt (top remains topMat, skirt flows down to ankles in bottomMat)
            const longSkirtCone = new THREE.Mesh(
                new THREE.ConeGeometry(0.54, 0.66, 24),
                bottomMat
            );
            longSkirtCone.position.set(0, -0.08, 0);
            longSkirtCone.castShadow = true;
            torsoNode.add(longSkirtCone);
        } else if (style === 'skirt') {
            const skirtCone = new THREE.Mesh(
                new THREE.ConeGeometry(0.50, 0.44, 24),
                bottomMat
            );
            skirtCone.position.set(0, 0.02, 0);
            skirtCone.castShadow = true;
            torsoNode.add(skirtCone);
        } else if (style === 'shorts') {
            const hipShorts = new THREE.Mesh(
                new THREE.CylinderGeometry(0.33, 0.36, 0.22, 18),
                bottomMat
            );
            hipShorts.position.set(0, 0.02, 0);
            torsoNode.add(hipShorts);
            [legL, legR].forEach((leg) => {
                if (!leg) return;
                const cuff = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.135, 0.135, 0.18, 14),
                    bottomMat
                );
                cuff.position.set(0, -0.08, 0);
                leg.add(cuff);
            });
        } else {
            // 'pants'
            const hipPants = new THREE.Mesh(
                new THREE.CylinderGeometry(0.32, 0.35, 0.22, 18),
                bottomMat
            );
            hipPants.position.set(0, 0.02, 0);
            torsoNode.add(hipPants);
        }
    }

    attachHairStyle(headNode, style, hairMat, topMat) {
        if (style === 'bald') return;

        const hairGroup = new THREE.Group();
        hairGroup.position.set(0, 0.36, 0);

        // Top crown hair cap tilted toward the back (-Z) so the front face (+Z) is 100% uncovered!
        const capMesh = new THREE.Mesh(
            new THREE.SphereGeometry(0.48, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.42),
            hairMat
        );
        capMesh.rotation.x = -0.46;
        capMesh.position.set(0, 0.04, -0.03);
        hairGroup.add(capMesh);

        // Cute sculpted forehead bangs high above the eyebrows (y = +0.24 in hairGroup => y = 0.60 in headNode)
        [-0.18, 0, 0.18].forEach((bx, idx) => {
            const bangPuff = new THREE.Mesh(
                new THREE.SphereGeometry(idx === 1 ? 0.16 : 0.14, 12, 10),
                hairMat
            );
            bangPuff.scale.set(1.25, 0.68, 0.72);
            bangPuff.position.set(bx, 0.24, 0.34);
            bangPuff.rotation.x = 0.22;
            hairGroup.add(bangPuff);
        });

        if (style === 'long') {
            // Long straight hair down back and sides (behind ears, never blocking front face)
            const backHair = new THREE.Mesh(
                new THREE.CylinderGeometry(0.42, 0.50, 0.68, 18),
                hairMat
            );
            backHair.position.set(0, -0.22, -0.15);
            hairGroup.add(backHair);

            [-0.38, 0.38].forEach((xPos) => {
                const sideLock = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.11, 0.14, 0.58, 12),
                    hairMat
                );
                sideLock.position.set(xPos, -0.18, -0.02);
                sideLock.rotation.z = xPos > 0 ? -0.12 : 0.12;
                hairGroup.add(sideLock);
            });
        } else if (style === 'long_curly') {
            // Voluminous wavy/curly long hair (長捲髮 for 柯老師)
            const backHair = new THREE.Mesh(
                new THREE.CylinderGeometry(0.43, 0.54, 0.68, 18),
                hairMat
            );
            backHair.position.set(0, -0.22, -0.16);
            hairGroup.add(backHair);

            // Curly wave puffs along back and sides (z <= 0.0 so face is completely clear)
            const curlPositions = [
                [-0.40, -0.08, -0.02, 0.18], [-0.43, -0.26, -0.02, 0.20], [-0.39, -0.44, -0.04, 0.18],
                [0.40, -0.08, -0.02, 0.18],  [0.43, -0.26, -0.02, 0.20],  [0.39, -0.44, -0.04, 0.18],
                [-0.24, -0.35, -0.34, 0.22], [0.0, -0.38, -0.38, 0.23], [0.24, -0.35, -0.34, 0.22],
                [-0.18, -0.52, -0.30, 0.19], [0.18, -0.52, -0.30, 0.19]
            ];
            curlPositions.forEach(([cx, cy, cz, r]) => {
                const curl = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 12), hairMat);
                curl.position.set(cx, cy, cz);
                hairGroup.add(curl);
            });
        } else if (style === 'shoulder') {
            // Shoulder-length hair (及肩髮型 for Lisa)
            const shoulderBack = new THREE.Mesh(
                new THREE.CylinderGeometry(0.43, 0.48, 0.44, 18),
                hairMat
            );
            shoulderBack.position.set(0, -0.12, -0.14);
            hairGroup.add(shoulderBack);

            [-0.38, 0.38].forEach((xPos) => {
                const sideLock = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.11, 0.14, 0.38, 12),
                    hairMat
                );
                sideLock.position.set(xPos, -0.10, -0.02);
                hairGroup.add(sideLock);
            });
        } else if (style === 'ponytail') {
            const tail = new THREE.Mesh(
                new THREE.ConeGeometry(0.20, 0.52, 14),
                hairMat
            );
            tail.position.set(0, -0.05, -0.52);
            tail.rotation.x = -0.85;
            hairGroup.add(tail);
        } else if (style === 'twintails') {
            [-0.48, 0.48].forEach((xPos) => {
                const tail = new THREE.Mesh(
                    new THREE.ConeGeometry(0.17, 0.52, 14),
                    hairMat
                );
                tail.position.set(xPos, -0.12, -0.08);
                tail.rotation.z = xPos > 0 ? 0.45 : -0.45;
                tail.rotation.x = 0.25;
                hairGroup.add(tail);
            });
        } else if (style === 'buns') {
            [-0.38, 0.38].forEach((xPos) => {
                const bun = new THREE.Mesh(
                    new THREE.SphereGeometry(0.18, 14, 14),
                    hairMat
                );
                bun.position.set(xPos, 0.32, -0.08);
                hairGroup.add(bun);
            });
        } else if (style === 'bob') {
            const bobBack = new THREE.Mesh(
                new THREE.CylinderGeometry(0.44, 0.47, 0.36, 18),
                hairMat
            );
            bobBack.position.set(0, -0.08, -0.13);
            hairGroup.add(bobBack);

            [-0.38, 0.38].forEach((xPos) => {
                const sideBob = new THREE.Mesh(
                    new THREE.SphereGeometry(0.15, 12, 12),
                    hairMat
                );
                sideBob.scale.set(0.75, 1.35, 1.1);
                sideBob.position.set(xPos, -0.08, -0.02);
                hairGroup.add(sideBob);
            });
        } else if (style === 'spiky') {
            const angles = [
                [0, 0.48, 0.1, 0.2, 0],
                [-0.25, 0.44, 0.0, 0.1, 0.45],
                [0.25, 0.44, 0.0, 0.1, -0.45],
                [0, 0.44, -0.22, -0.4, 0],
                [-0.2, 0.40, -0.2, -0.3, 0.35],
                [0.2, 0.40, -0.2, -0.3, -0.35]
            ];
            angles.forEach(([x, y, z, rx, rz]) => {
                const spike = new THREE.Mesh(
                    new THREE.ConeGeometry(0.14, 0.32, 10),
                    hairMat
                );
                spike.position.set(x, y, z);
                spike.rotation.set(rx, 0, rz);
                hairGroup.add(spike);
            });
        } else if (style === 'cap') {
            const dome = new THREE.Mesh(
                new THREE.SphereGeometry(0.49, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.38),
                topMat
            );
            dome.rotation.x = -0.18;
            dome.position.set(0, 0.10, -0.02);
            hairGroup.add(dome);

            const visor = new THREE.Mesh(
                new THREE.CylinderGeometry(0.46, 0.46, 0.045, 18, 1, false, -Math.PI * 0.35, Math.PI * 0.70),
                topMat
            );
            visor.position.set(0, 0.20, 0.24);
            visor.rotation.x = 0.12;
            hairGroup.add(visor);
        }

        headNode.add(hairGroup);
    }

    attachAccessory(headNode, torsoNode, accessory) {
        if (!accessory || accessory === 'none') return;

        if (accessory === 'glasses' && headNode) {
            const frameMat = new THREE.MeshLambertMaterial({ color: '#222629' });
            const glassGroup = new THREE.Group();
            glassGroup.position.set(0, 0.38, 0.43);

            [-0.17, 0.17].forEach((xPos) => {
                const rim = new THREE.Mesh(
                    new THREE.TorusGeometry(0.11, 0.022, 10, 20),
                    frameMat
                );
                rim.position.set(xPos, 0, 0);
                glassGroup.add(rim);
            });
            const bridge = new THREE.Mesh(
                new THREE.CylinderGeometry(0.018, 0.018, 0.14, 8),
                frameMat
            );
            bridge.rotation.z = Math.PI * 0.5;
            glassGroup.add(bridge);
            headNode.add(glassGroup);
        } else if (accessory === 'backpack' && torsoNode) {
            const packMat = new THREE.MeshLambertMaterial({ color: '#e67e22' });
            const pack = new THREE.Mesh(
                new THREE.BoxGeometry(0.44, 0.46, 0.24),
                packMat
            );
            pack.position.set(0, 0.34, -0.30);
            torsoNode.add(pack);
        } else if (accessory === 'scarf' && torsoNode) {
            const scarfMat = new THREE.MeshLambertMaterial({ color: '#d63031' });
            const ring = new THREE.Mesh(
                new THREE.TorusGeometry(0.28, 0.09, 12, 20),
                scarfMat
            );
            ring.rotation.x = Math.PI * 0.5;
            ring.position.set(0, 0.62, 0);
            torsoNode.add(ring);

            const tail = new THREE.Mesh(
                new THREE.BoxGeometry(0.14, 0.34, 0.06),
                scarfMat
            );
            tail.position.set(0.14, 0.45, 0.26);
            tail.rotation.z = -0.15;
            torsoNode.add(tail);
        }
    }

    // Create the 3 Call Duck Mascot Opponents (牛奶・八月・阿麥) from Reference Images 1, 2, 4!
    createCallDuckMascot(mascotSpec) {
        // Uses the same GLB animation rig so the mascot waddles/runs, sprints, and falls!
        const wrapper = new THREE.Group();
        let rootNode;
        if (this.baseGltf && this.baseGltf.scene) {
            rootNode = this.baseGltf.scene.clone(true);
        } else {
            rootNode = this.createFallbackHierarchy();
        }
        wrapper.add(rootNode);

        const nodes = {
            Root: rootNode.getObjectByName('Root') || rootNode,
            Hips: rootNode.getObjectByName('Hips'),
            Torso: rootNode.getObjectByName('Torso'),
            Head: rootNode.getObjectByName('Head'),
            ArmL: rootNode.getObjectByName('ArmL'),
            ArmR: rootNode.getObjectByName('ArmR'),
            LegL: rootNode.getObjectByName('LegL'),
            LegR: rootNode.getObjectByName('LegR')
        };

        const bodyMat = new THREE.MeshLambertMaterial({ color: mascotSpec.bodyColor || '#ffffff' });
        const beakMat = new THREE.MeshLambertMaterial({ color: '#ff9f1a' });
        const eyeMat = new THREE.MeshLambertMaterial({ color: '#1e272e' });
        const blushMat = new THREE.MeshLambertMaterial({ color: '#ff8a80' });

        // Style Head as cute plump Call Duck head
        if (nodes.Head) {
            nodes.Head.traverse((c) => {
                if (c.isMesh) {
                    c.material = bodyMat;
                    c.scale.set(1.05, 0.96, 1.05);
                }
            });
            // Duck bill / beak
            const beak = new THREE.Mesh(new THREE.SphereGeometry(0.20, 14, 10), beakMat);
            beak.scale.set(1.1, 0.45, 1.15);
            beak.position.set(0, 0.30, 0.44);
            nodes.Head.add(beak);

            // Cute dark bead eyes
            [-0.20, 0.20].forEach((x) => {
                const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 12), eyeMat);
                eye.position.set(x, 0.40, 0.40);
                nodes.Head.add(eye);

                const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 10), blushMat);
                cheek.scale.set(1.2, 0.7, 0.5);
                cheek.position.set(x * 1.35, 0.31, 0.38);
                nodes.Head.add(cheek);
            });

            // Distinctive mascot hat/item (e.g. 阿麥 has a cute green leaf/hat, 八月 has a yellow sprout, 牛奶 has a blue ribbon)
            if (mascotSpec.hatColor) {
                const hat = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.28, 0.38, 0.16, 16),
                    new THREE.MeshLambertMaterial({ color: mascotSpec.hatColor })
                );
                hat.position.set(0, 0.78, 0);
                nodes.Head.add(hat);
            }
        }

        if (nodes.Torso) {
            nodes.Torso.traverse((c) => {
                if (c.isMesh) {
                    c.material = bodyMat;
                    c.scale.set(1.22, 1.05, 1.32);
                }
            });
            // Cute duck tail
            const tail = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.28, 12), bodyMat);
            tail.position.set(0, 0.28, -0.38);
            tail.rotation.x = -1.1;
            nodes.Torso.add(tail);
        }

        [nodes.ArmL, nodes.ArmR].forEach((wing) => {
            if (!wing) return;
            wing.traverse((c) => {
                if (c.isMesh) {
                    c.material = bodyMat;
                    c.scale.set(0.8, 1.0, 1.4);
                }
            });
        });

        [nodes.LegL, nodes.LegR].forEach((leg) => {
            if (!leg) return;
            leg.traverse((c) => {
                if (c.isMesh) c.material = beakMat;
            });
            const foot = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), beakMat);
            foot.scale.set(1.1, 0.45, 1.4);
            foot.position.set(0, -0.38, 0.06);
            leg.add(foot);
        });

        wrapper.scale.set(0.82, 0.82, 0.82);

        const fxGroup = this.createEffectsGroup();
        wrapper.add(fxGroup);

        const mixer = new THREE.AnimationMixer(rootNode);
        const actions = {};
        if (this.baseGltf && this.baseGltf.animations) {
            for (const clip of this.baseGltf.animations) {
                const action = mixer.clipAction(clip);
                if (clip.name === 'Fall' || clip.name === 'Recover') {
                    action.setLoop(THREE.LoopOnce);
                    action.clampWhenFinished = true;
                }
                actions[clip.name] = action;
            }
        }

        const controller = {
            group: wrapper,
            rootNode,
            nodes,
            mixer,
            actions,
            currentActionName: null,
            fxGroup,
            config: { nickname: mascotSpec.name, role: 'Mascot', isAI: true },
            playAnimation(name, fadeDuration = 0.18) {
                if (!actions[name] || this.currentActionName === name) return;
                const nextAction = actions[name];
                if (this.currentActionName && actions[this.currentActionName]) {
                    actions[this.currentActionName].fadeOut(fadeDuration);
                }
                nextAction.reset().fadeIn(fadeDuration).play();
                this.currentActionName = name;
            },
            setSprintEffect(active) {
                fxGroup.userData.sprintRing.visible = active;
            },
            setDizzyEffect(active) {
                fxGroup.userData.dizzyGroup.visible = active;
            },
            update(dt, elapsed) {
                mixer.update(dt);
                if (fxGroup.userData.dizzyGroup.visible) {
                    fxGroup.userData.dizzyGroup.rotation.y += dt * 4.5;
                }
                if (fxGroup.userData.sprintRing.visible) {
                    fxGroup.userData.sprintRing.rotation.z += dt * 6.0;
                }
            }
        };

        controller.playAnimation('Idle', 0.01);
        return controller;
    }

    createEffectsGroup() {
        const fxGroup = new THREE.Group();

        // Dizzy stars when falling
        const dizzyGroup = new THREE.Group();
        dizzyGroup.position.set(0, 1.95, 0.35);
        dizzyGroup.visible = false;
        const starMat = new THREE.MeshBasicMaterial({ color: '#ffd32a' });
        for (let i = 0; i < 4; i++) {
            const angle = (i / 4) * Math.PI * 2;
            const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), starMat);
            star.position.set(Math.cos(angle) * 0.45, 0, Math.sin(angle) * 0.45);
            dizzyGroup.add(star);
        }
        fxGroup.add(dizzyGroup);

        // Sprint golden wind aura when boosting
        const sprintRing = new THREE.Mesh(
            new THREE.RingGeometry(0.55, 0.72, 24),
            new THREE.MeshBasicMaterial({ color: '#00e5ff', side: THREE.DoubleSide, transparent: true, opacity: 0.75 })
        );
        sprintRing.rotation.x = Math.PI * 0.5;
        sprintRing.position.set(0, 0.15, 0);
        sprintRing.visible = false;
        fxGroup.add(sprintRing);

        fxGroup.userData = { dizzyGroup, sprintRing };
        return fxGroup;
    }

    createFallbackHierarchy() {
        const root = new THREE.Group(); root.name = 'Root';
        const hips = new THREE.Group(); hips.name = 'Hips'; hips.position.set(0, 0.48, 0);
        const torso = new THREE.Group(); torso.name = 'Torso'; torso.position.set(0, 0.05, 0);
        const head = new THREE.Group(); head.name = 'Head'; head.position.set(0, 0.68, 0);
        const armL = new THREE.Group(); armL.name = 'ArmL'; armL.position.set(0.36, 0.56, 0);
        const armR = new THREE.Group(); armR.name = 'ArmR'; armR.position.set(-0.36, 0.56, 0);
        const legL = new THREE.Group(); legL.name = 'LegL'; legL.position.set(0.16, 0, 0);
        const legR = new THREE.Group(); legR.name = 'LegR'; legR.position.set(-0.16, 0, 0);

        head.add(new THREE.Mesh(new THREE.SphereGeometry(0.45, 18, 16)));
        torso.add(new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 14)));
        armL.add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.42)));
        armR.add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.42)));
        legL.add(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.42)));
        legR.add(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.42)));

        torso.add(head, armL, armR);
        hips.add(torso, legL, legR);
        root.add(hips);
        return root;
    }
}

window.CHARACTER_PALETTES = CHARACTER_PALETTES;
window.characterBuilder = new CharacterBuilder();
