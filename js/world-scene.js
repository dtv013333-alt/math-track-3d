// 3D Track & Campus World Scene + Live Weather System (Three.js)
// Builds the 4-lane terracotta oval running track, 10 math question checkpoints,
// central soccer field with animated NPCs, school buildings, trees, and 4 weather modes.

class WorldScene {
    constructor(container) {
        this.container = container;
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(
            50,
            window.innerWidth / window.innerHeight,
            0.5,
            450
        );

        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);

        // Track geometry parameters (Stadium Oval)
        this.straightLength = 42;             // Straightaway length
        this.halfStraight = this.straightLength / 2; // 21
        this.innerRadius = 17.5;              // Inner curve radius
        this.laneWidth = 1.65;                // Width of each of the 4 lanes
        this.numLanes = 4;
        this.totalTrackWidth = this.laneWidth * this.numLanes; // 6.6

        // Question checkpoint progress positions (10 questions evenly spaced along 1 lap)
        this.checkpointProgresses = [
            0.08, 0.17, 0.26, 0.35, 0.44,
            0.53, 0.62, 0.71, 0.80, 0.89
        ];

        this.checkpointMeshes = [];
        this.clouds = [];
        this.soccerNPCs = [];
        this.soccerBall = null;
        this.rainSystem = null;
        this.sunGroup = null;
        this.weatherMode = 'clear_clouds'; // 'clear_clouds' | 'sunny' | 'overcast' | 'rainy'
        this.campusLandmarks = [];

        this.setupLights();
        this.buildEnvironment();
        this.buildOvalTrack();
        this.buildCheckpoints();
        this.buildSoccerFieldAndNPCs();
        this.buildCampusBuildingsAndTrees();
        this.buildWeatherObjects();
        this.applyWeather('clear_clouds');

        window.addEventListener('resize', () => this.onResize());
    }

    setupLights() {
        this.hemiLight = new THREE.HemisphereLight(0xffffff, 0xd8f0c8, 0.88);
        this.hemiLight.position.set(0, 60, 0);
        this.scene.add(this.hemiLight);

        this.dirLight = new THREE.DirectionalLight(0xfff8e7, 0.95);
        this.dirLight.position.set(35, 58, 30);
        this.dirLight.castShadow = true;
        this.dirLight.shadow.mapSize.width = 2048;
        this.dirLight.shadow.mapSize.height = 2048;
        this.dirLight.shadow.camera.near = 5;
        this.dirLight.shadow.camera.far = 160;
        const d = 55;
        this.dirLight.shadow.camera.left = -d;
        this.dirLight.shadow.camera.right = d;
        this.dirLight.shadow.camera.top = d;
        this.dirLight.shadow.camera.bottom = -d;
        this.dirLight.shadow.bias = -0.0005;
        this.scene.add(this.dirLight);
    }

    buildEnvironment() {
        // Soft pastel campus ground plane (matching Reference Image 2 & 3)
        const groundGeo = new THREE.PlaneGeometry(360, 360);
        this.groundMat = new THREE.MeshLambertMaterial({ color: '#eef7e6' });
        const ground = new THREE.Mesh(groundGeo, this.groundMat);
        ground.rotation.x = -Math.PI * 0.5;
        ground.position.y = -0.05;
        ground.receiveShadow = true;
        this.scene.add(ground);

        // Blue semi-circular pond/court area at bottom-right of track (seen in Ref Image 2 & 3)
        const blueZone = new THREE.Mesh(
            new THREE.CircleGeometry(9.5, 32),
            new THREE.MeshLambertMaterial({ color: '#bce0f0' })
        );
        blueZone.rotation.x = -Math.PI * 0.5;
        blueZone.position.set(-8, 0.01, this.halfStraight - 1.5);
        this.scene.add(blueZone);
    }

    // Compute exact (x, z, angle) for any lane (0..3) and lap progress (0..1+)
    // Lane 0 is innermost, Lane 3 is outermost.
    // Progress 0.0 starts on the West straightaway (x < 0) heading North (-Z), matching Reference Image 2!
    getPointOnLane(laneIndex, progress) {
        const p = ((progress % 1) + 1) % 1;
        const R = this.innerRadius + (laneIndex + 0.5) * this.laneWidth;
        const L = this.straightLength;
        const curveLen = Math.PI * R;
        const totalPerimeter = 2 * L + 2 * curveLen;

        // Start 6 meters after the south-west curve entry so start/finish line is clearly on the straightaway
        let dist = p * totalPerimeter;

        // Segment 1: West straightaway going from South (+halfStraight) to North (-halfStraight)
        if (dist <= L) {
            const z = this.halfStraight - dist;
            const x = -R;
            const angle = Math.PI; // Facing -Z (North)
            return { x, z, angle };
        }
        dist -= L;

        // Segment 2: North semicircle turn from West (-R, -halfStraight) to East (+R, -halfStraight)
        if (dist <= curveLen) {
            const phi = dist / R; // 0 to PI
            const x = -Math.cos(phi) * R;
            const z = -this.halfStraight - Math.sin(phi) * R;
            // Tangent direction: dx/dphi = sin(phi), dz/dphi = -cos(phi)
            const angle = Math.atan2(Math.sin(phi), -Math.cos(phi));
            return { x, z, angle };
        }
        dist -= curveLen;

        // Segment 3: East straightaway going from North (-halfStraight) to South (+halfStraight)
        if (dist <= L) {
            const z = -this.halfStraight + dist;
            const x = R;
            const angle = 0; // Facing +Z (South)
            return { x, z, angle };
        }
        dist -= L;

        // Segment 4: South semicircle turn from East (+R, +halfStraight) to West (-R, +halfStraight)
        const phi = dist / R; // 0 to PI
        const x = Math.cos(phi) * R;
        const z = this.halfStraight + Math.sin(phi) * R;
        // Tangent direction: dx/dphi = -sin(phi), dz/dphi = cos(phi)
        const angle = Math.atan2(-Math.sin(phi), Math.cos(phi));
        return { x, z, angle };
    }

    buildOvalTrack() {
        const trackGroup = new THREE.Group();

        // Build high-resolution stadium ribbon mesh for the terracotta red track surface
        const rIn = this.innerRadius;
        const rOut = this.innerRadius + this.totalTrackWidth;

        this.trackSurfaceMat = new THREE.MeshStandardMaterial({
            color: '#e8a588', // Warm terracotta salmon-red matching Reference Image 2 & 3
            roughness: 0.78,
            metalness: 0.04
        });

        const surfaceMesh = this.createOvalRibbon(rIn - 0.25, rOut + 0.25, 0.02, this.trackSurfaceMat);
        surfaceMesh.receiveShadow = true;
        trackGroup.add(surfaceMesh);

        // White lane boundary lines (5 lines for 4 lanes)
        const lineMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
        for (let i = 0; i <= this.numLanes; i++) {
            const rLine = this.innerRadius + i * this.laneWidth;
            const halfW = (i === 0 || i === this.numLanes) ? 0.09 : 0.055;
            const lineRibbon = this.createOvalRibbon(rLine - halfW, rLine + halfW, 0.032, lineMat);
            trackGroup.add(lineRibbon);
        }

        // Checkered Start / Finish Line at progress = 0.0 (and 1.0) on West straightaway
        const checkerGroup = new THREE.Group();
        const rows = 2;
        const cols = 16;
        const cellW = this.totalTrackWidth / cols;
        const cellD = 0.42;
        const blackMat = new THREE.MeshBasicMaterial({ color: '#222222' });
        const whiteMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const isWhite = (r + c) % 2 === 0;
                const tile = new THREE.Mesh(
                    new THREE.PlaneGeometry(cellW, cellD),
                    isWhite ? whiteMat : blackMat
                );
                tile.rotation.x = -Math.PI * 0.5;
                const xPos = -(this.innerRadius + (c + 0.5) * cellW);
                const zPos = this.halfStraight - (r - 0.5) * cellD;
                tile.position.set(xPos, 0.04, zPos);
                checkerGroup.add(tile);
            }
        }
        trackGroup.add(checkerGroup);

        // Start/Finish side posts
        const postMat = new THREE.MeshLambertMaterial({ color: '#ff6b35' });
        [-this.innerRadius + 0.2, -(this.innerRadius + this.totalTrackWidth + 0.2)].forEach((xPos) => {
            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 2.2, 12), postMat);
            post.position.set(xPos, 1.1, this.halfStraight);
            post.castShadow = true;
            trackGroup.add(post);

            const orb = new THREE.Mesh(
                new THREE.SphereGeometry(0.26, 12, 12),
                new THREE.MeshBasicMaterial({ color: '#ffd166' })
            );
            orb.position.set(xPos, 2.3, this.halfStraight);
            trackGroup.add(orb);
        });

        this.scene.add(trackGroup);
    }

    // Helper to build a continuous closed stadium oval ribbon between r1 and r2
    createOvalRibbon(r1, r2, yHeight, material) {
        const segments = 160;
        const positions = [];
        const normals = [];
        const indices = [];

        const sampleOvalPoint = (radius, t) => {
            const L = this.straightLength;
            const curveLen = Math.PI * radius;
            const total = 2 * L + 2 * curveLen;
            let d = t * total;

            if (d <= L) {
                return [-radius, this.halfStraight - d];
            }
            d -= L;
            if (d <= curveLen) {
                const phi = d / radius;
                return [-Math.cos(phi) * radius, -this.halfStraight - Math.sin(phi) * radius];
            }
            d -= curveLen;
            if (d <= L) {
                return [radius, -this.halfStraight + d];
            }
            d -= L;
            const phi = d / radius;
            return [Math.cos(phi) * radius, this.halfStraight + Math.sin(phi) * radius];
        };

        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const [x1, z1] = sampleOvalPoint(r1, t);
            const [x2, z2] = sampleOvalPoint(r2, t);
            positions.push(x1, yHeight, z1);
            positions.push(x2, yHeight, z2);
            normals.push(0, 1, 0, 0, 1, 0);
        }

        for (let i = 0; i < segments; i++) {
            const a = i * 2;
            const b = a + 1;
            const c = a + 2;
            const d = a + 3;
            indices.push(a, b, c);
            indices.push(b, d, c);
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geo.setIndex(indices);
        return new THREE.Mesh(geo, material);
    }

    // Build 10 visual question gates/markers along the oval track
    buildCheckpoints() {
        this.checkpointMeshes.forEach((m) => this.scene.remove(m));
        this.checkpointMeshes = [];

        const gateColors = ['#ff7043', '#42a5f5', '#66bb6a', '#ab47bc', '#ffa726'];

        this.checkpointProgresses.forEach((prog, idx) => {
            const group = new THREE.Group();
            const innerPt = this.getPointOnLane(-0.4, prog);
            const outerPt = this.getPointOnLane(3.4, prog);
            const centerPt = this.getPointOnLane(1.5, prog);

            // Glowing stripe on the track across all 4 lanes
            const colorHex = gateColors[idx % gateColors.length];
            const stripe = new THREE.Mesh(
                new THREE.PlaneGeometry(this.totalTrackWidth, 0.55),
                new THREE.MeshBasicMaterial({
                    color: colorHex,
                    transparent: true,
                    opacity: 0.55,
                    side: THREE.DoubleSide
                })
            );
            stripe.rotation.x = -Math.PI * 0.5;
            stripe.rotation.z = -centerPt.angle + Math.PI;
            stripe.position.set(centerPt.x, 0.038, centerPt.z);
            group.add(stripe);

            // Cute side question pillars on inner & outer track edge
            [innerPt, outerPt].forEach((pt) => {
                const cone = new THREE.Mesh(
                    new THREE.ConeGeometry(0.28, 0.85, 12),
                    new THREE.MeshLambertMaterial({ color: colorHex })
                );
                cone.position.set(pt.x, 0.42, pt.z);
                group.add(cone);
            });

            // Floating Question Number Sign above the inner edge
            const badgeTex = this.createBadgeTexture(`第 ${idx + 1} 題`, colorHex);
            const spriteMat = new THREE.SpriteMaterial({ map: badgeTex, transparent: true });
            const sprite = new THREE.Sprite(spriteMat);
            sprite.position.set(innerPt.x, 1.65, innerPt.z);
            sprite.scale.set(2.2, 0.95, 1);
            group.add(sprite);

            group.userData = { index: idx, sprite, stripe };
            this.scene.add(group);
            this.checkpointMeshes.push(group);
        });
    }

    drawRoundedRectPath(ctx, x, y, w, h, r) {
        if (ctx.roundRect) {
            ctx.beginPath();
            ctx.roundRect(x, y, w, h, r);
        } else {
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.arcTo(x + w, y, x + w, y + h, r);
            ctx.arcTo(x + w, y + h, x, y + h, r);
            ctx.arcTo(x, y + h, x, y, r);
            ctx.arcTo(x, y, x + w, y, r);
            ctx.closePath();
        }
    }

    createBadgeTexture(text, bgColor) {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 112;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = bgColor;
        this.drawRoundedRectPath(ctx, 12, 12, 232, 88, 44);
        ctx.fill();

        ctx.lineWidth = 6;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 42px "Microsoft JhengHei", "PingFang TC", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 128, 57);

        const tex = new THREE.CanvasTexture(canvas);
        tex.needsUpdate = true;
        return tex;
    }

    buildSoccerFieldAndNPCs() {
        const fieldGroup = new THREE.Group();
        const fieldW = 24;
        const fieldL = 38;

        // Striped green soccer pitch (like Reference Image 2 & 3)
        const numStripes = 10;
        const stripeL = fieldL / numStripes;
        for (let i = 0; i < numStripes; i++) {
            const mat = new THREE.MeshLambertMaterial({
                color: i % 2 === 0 ? '#bae884' : '#a8de72'
            });
            const stripe = new THREE.Mesh(new THREE.PlaneGeometry(fieldW, stripeL), mat);
            stripe.rotation.x = -Math.PI * 0.5;
            stripe.position.set(0, 0.015, -fieldL * 0.5 + (i + 0.5) * stripeL);
            stripe.receiveShadow = true;
            fieldGroup.add(stripe);
        }

        // White pitch lines
        const lineMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
        const addLine = (w, h, x, z) => {
            const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), lineMat);
            m.rotation.x = -Math.PI * 0.5;
            m.position.set(x, 0.025, z);
            fieldGroup.add(m);
        };
        // Outer boundary
        addLine(fieldW, 0.16, 0, -fieldL * 0.5);
        addLine(fieldW, 0.16, 0, fieldL * 0.5);
        addLine(0.16, fieldL, -fieldW * 0.5, 0);
        addLine(0.16, fieldL, fieldW * 0.5, 0);
        // Center line
        addLine(fieldW, 0.16, 0, 0);

        // Center circle
        const centerRing = new THREE.Mesh(
            new THREE.RingGeometry(4.2, 4.38, 36),
            lineMat
        );
        centerRing.rotation.x = -Math.PI * 0.5;
        centerRing.position.set(0, 0.026, 0);
        fieldGroup.add(centerRing);

        // Penalty boxes & Soccer goals at North and South ends
        [-1, 1].forEach((dir) => {
            const zGoal = dir * (fieldL * 0.5);
            const zBox = dir * (fieldL * 0.5 - 3.5);
            addLine(11, 0.14, 0, zBox - dir * 3.5);
            addLine(0.14, 7.0, -5.5, zBox);
            addLine(0.14, 7.0, 5.5, zBox);

            // 3D White Goalposts
            const goalGroup = new THREE.Group();
            const postMat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
            const postL = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.2, 8), postMat);
            postL.position.set(-2.4, 1.1, zGoal);
            const postR = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.2, 8), postMat);
            postR.position.set(2.4, 1.1, zGoal);
            const crossbar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4.96, 8), postMat);
            crossbar.rotation.z = Math.PI * 0.5;
            crossbar.position.set(0, 2.2, zGoal);
            goalGroup.add(postL, postR, crossbar);
            fieldGroup.add(goalGroup);
        });

        // Pink floating location pin on the field (seen in Ref Image 2 & 3)
        const pinGroup = new THREE.Group();
        const pinCone = new THREE.Mesh(
            new THREE.ConeGeometry(0.45, 0.9, 14),
            new THREE.MeshLambertMaterial({ color: '#f48fb1' })
        );
        pinCone.rotation.x = Math.PI;
        pinCone.position.y = 0.6;
        const pinTop = new THREE.Mesh(
            new THREE.SphereGeometry(0.45, 14, 12),
            new THREE.MeshLambertMaterial({ color: '#f8bbd0' })
        );
        pinTop.position.y = 1.05;
        pinGroup.add(pinCone, pinTop);
        pinGroup.position.set(-6.5, 0.4, -5.0);
        this.fieldPin = pinGroup;
        fieldGroup.add(pinGroup);

        // Soccer ball + 4 cute background NPC students playing soccer on the field
        this.soccerBall = new THREE.Mesh(
            new THREE.SphereGeometry(0.28, 14, 14),
            new THREE.MeshLambertMaterial({ color: '#ffffff' })
        );
        this.soccerBall.position.set(2.5, 0.28, -2.0);
        this.soccerBall.castShadow = true;
        fieldGroup.add(this.soccerBall);

        const npcSpecs = [
            { x: -2.0, z: -2.2, shirt: '#64b5f6', hair: '#5d4037' },
            { x: 3.2, z: -1.8, shirt: '#ff8a65', hair: '#212121' },
            { x: 4.0, z: -3.2, shirt: '#81c784', hair: '#3e2723' },
            { x: -0.5, z: 5.5, shirt: '#f06292', hair: '#4e342e' }
        ];

        npcSpecs.forEach((spec, idx) => {
            const npc = new THREE.Group();
            const torso = new THREE.Mesh(
                new THREE.CylinderGeometry(0.24, 0.28, 0.65, 12),
                new THREE.MeshLambertMaterial({ color: spec.shirt })
            );
            torso.position.y = 0.55;
            const head = new THREE.Mesh(
                new THREE.SphereGeometry(0.38, 14, 14),
                new THREE.MeshLambertMaterial({ color: '#fde2c4' })
            );
            head.position.y = 1.15;
            const hair = new THREE.Mesh(
                new THREE.SphereGeometry(0.40, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
                new THREE.MeshLambertMaterial({ color: spec.hair })
            );
            hair.position.y = 1.20;
            npc.add(torso, head, hair);
            npc.position.set(spec.x, 0, spec.z);
            fieldGroup.add(npc);
            this.soccerNPCs.push({ mesh: npc, baseX: spec.x, baseZ: spec.z, phase: idx * 1.7 });
        });

        this.scene.add(fieldGroup);
    }

    buildCampusBuildingsAndTrees() {
        const campusGroup = new THREE.Group();

        // Low-poly cute trees on the West side (matching Reference Image 2)
        const treePositions = [
            [-30, 14], [-32, 6], [-29, -2], [-34, -12], [-31, -22],
            [-36, 22], [32, 18], [35, 8], [33, -15]
        ];
        const trunkMat = new THREE.MeshLambertMaterial({ color: '#c8a97e' });
        const foliageMat1 = new THREE.MeshLambertMaterial({ color: '#b8e292' });
        const foliageMat2 = new THREE.MeshLambertMaterial({ color: '#a3d977' });

        treePositions.forEach(([x, z], i) => {
            const tree = new THREE.Group();
            const scale = 0.85 + (i % 3) * 0.18;
            const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 3.6, 8), trunkMat);
            trunk.position.y = 1.8;
            trunk.castShadow = true;

            const crown1 = new THREE.Mesh(new THREE.DodecahedronGeometry(2.2, 1), i % 2 === 0 ? foliageMat1 : foliageMat2);
            crown1.position.set(0, 4.2, 0);
            crown1.castShadow = true;

            const crown2 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.6, 1), foliageMat1);
            crown2.position.set(1.1, 3.6, 0.6);

            tree.add(trunk, crown1, crown2);
            tree.position.set(x, 0, z);
            tree.scale.set(scale, scale, scale);
            campusGroup.add(tree);
        });

        // School Buildings in the South/East background (matching Reference Image 3)
        // 1. Main Classroom Building (Cream walls, blue-tinted windows, pitched roof)
        const mainBldg = this.createSchoolBuilding(28, 14, 12, '#e6e2cf', '#6eb5c0', '#c83e37');
        mainBldg.position.set(-4, 0, -48);
        campusGroup.add(mainBldg);

        // 2. Science & Computer Building (Greyish-blue facade on the left)
        const sciBldg = this.createSchoolBuilding(16, 12, 10, '#c5c9c7', '#4a7c9b', '#8d99ae');
        sciBldg.position.set(-28, 0, -46);
        campusGroup.add(sciBldg);

        // 3. Covered Walkway & Basketball Court Pavilion (Right side in Ref Image 3)
        const pavilion = new THREE.Group();
        const roofMat = new THREE.MeshLambertMaterial({ color: '#5c7672' });
        const pillarMat = new THREE.MeshLambertMaterial({ color: '#78909c' });
        const roof = new THREE.Mesh(new THREE.BoxGeometry(18, 0.6, 28), roofMat);
        roof.position.set(36, 8.5, -18);
        pavilion.add(roof);

        for (let z = -30; z <= -6; z += 8) {
            [-7.5, 7.5].forEach((dx) => {
                const col = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 8.5, 10), pillarMat);
                col.position.set(36 + dx, 4.25, z);
                pavilion.add(col);
            });
        }
        // Green basketball court floor under pavilion
        const courtFloor = new THREE.Mesh(
            new THREE.PlaneGeometry(16, 26),
            new THREE.MeshLambertMaterial({ color: '#2e8b57' })
        );
        courtFloor.rotation.x = -Math.PI * 0.5;
        courtFloor.position.set(36, 0.02, -18);
        pavilion.add(courtFloor);
        campusGroup.add(pavilion);

        // Floating Campus Landmark Sprites (like Reference Image 3)
        const landmarks = [
            { code: '05', title: '自然・電腦教室', x: -28, y: 16.5, z: -46, color: '#ef9a9a' },
            { code: '13', title: '運動場', x: -20, y: 12.0, z: -36, color: '#ffcc80' },
            { code: '04', title: '中高年級教室', x: -4, y: 17.5, z: -48, color: '#ce93d8' },
            { code: '06', title: '低年級教室', x: 0, y: 14.5, z: -46, color: '#90caf9' },
            { code: '08', title: '活動室', x: 24, y: 13.5, z: -36, color: '#a5d6a7' },
            { code: '02', title: '穿堂', x: 30, y: 10.5, z: -24, color: '#80cbc4' }
        ];

        landmarks.forEach((lm) => {
            const tex = this.createLandmarkPillTexture(lm.code, lm.title, lm.color);
            const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
            sp.position.set(lm.x, lm.y, lm.z);
            sp.scale.set(7.5, 2.0, 1);
            campusGroup.add(sp);
        });

        this.scene.add(campusGroup);
    }

    createSchoolBuilding(w, h, d, wallHex, winHex, accentHex) {
        const group = new THREE.Group();
        const wallMat = new THREE.MeshLambertMaterial({ color: wallHex });
        const winMat = new THREE.MeshLambertMaterial({ color: winHex });
        const accentMat = new THREE.MeshLambertMaterial({ color: accentHex });

        const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
        body.position.y = h * 0.5;
        body.castShadow = true;
        body.receiveShadow = true;
        group.add(body);

        // Roof
        const roof = new THREE.Mesh(
            new THREE.ConeGeometry(w * 0.62, 4.2, 4),
            new THREE.MeshLambertMaterial({ color: '#cfd8dc' })
        );
        roof.rotation.y = Math.PI * 0.25;
        roof.position.y = h + 2.1;
        group.add(roof);

        // Windows on front & back
        const cols = Math.floor(w / 4);
        const rows = 2;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const wx = -w * 0.5 + (c + 0.5) * (w / cols);
                const wy = 3.2 + r * 4.5;
                [d * 0.5 + 0.06, -d * 0.5 - 0.06].forEach((wz) => {
                    const win = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.2), winMat);
                    if (wz < 0) win.rotation.y = Math.PI;
                    win.position.set(wx, wy, wz);
                    group.add(win);
                });
            }
        }

        // Center red accent frame
        const accent = new THREE.Mesh(new THREE.BoxGeometry(4.2, h, d + 0.15), accentMat);
        accent.position.y = h * 0.5;
        group.add(accent);

        return group;
    }

    createLandmarkPillTexture(code, title, badgeColor) {
        const canvas = document.createElement('canvas');
        canvas.width = 360;
        canvas.height = 96;
        const ctx = canvas.getContext('2d');

        // White rounded capsule with soft border
        ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
        this.drawRoundedRectPath(ctx, 8, 12, 344, 72, 36);
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.12)';
        ctx.stroke();

        // Number circle
        ctx.fillStyle = badgeColor;
        ctx.beginPath();
        ctx.arc(46, 48, 24, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(code, 46, 49);

        ctx.fillStyle = '#37474f';
        ctx.font = 'bold 30px "Microsoft JhengHei", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(title, 84, 49);

        const tex = new THREE.CanvasTexture(canvas);
        tex.needsUpdate = true;
        return tex;
    }

    buildWeatherObjects() {
        // 1. 3D Fluffy Clouds Group
        this.cloudGroup = new THREE.Group();
        this.cloudMat = new THREE.MeshLambertMaterial({ color: '#ffffff' });

        for (let i = 0; i < 18; i++) {
            const c = new THREE.Group();
            const puffs = 3 + (i % 3);
            for (let p = 0; p < puffs; p++) {
                const puff = new THREE.Mesh(
                    new THREE.SphereGeometry(2.6 + (p % 2) * 0.9, 12, 10),
                    this.cloudMat
                );
                puff.position.set((p - 1) * 2.2, (p % 2) * 0.6, (p % 2) * 0.8);
                puff.scale.y = 0.68;
                c.add(puff);
            }
            const angle = (i / 18) * Math.PI * 2;
            const dist = 45 + (i % 3) * 25;
            c.position.set(Math.cos(angle) * dist, 28 + (i % 4) * 5, Math.sin(angle) * dist);
            this.cloudGroup.add(c);
            this.clouds.push({ mesh: c, speed: 0.6 + (i % 4) * 0.25 });
        }
        this.scene.add(this.cloudGroup);

        // 2. Blazing Sun & Glow Halo for "艷陽高照" (Sunny)
        this.sunGroup = new THREE.Group();
        const sunCore = new THREE.Mesh(
            new THREE.SphereGeometry(5.5, 20, 20),
            new THREE.MeshBasicMaterial({ color: '#fff176' })
        );
        const sunHalo = new THREE.Mesh(
            new THREE.SphereGeometry(9.0, 20, 20),
            new THREE.MeshBasicMaterial({ color: '#ffd54f', transparent: true, opacity: 0.35 })
        );
        this.sunGroup.add(sunCore, sunHalo);
        this.sunGroup.position.set(42, 46, -55);
        this.scene.add(this.sunGroup);

        // 3. 3D Rain Particle System for "下雨天" (Rainy)
        const rainCount = 2200;
        const rainGeo = new THREE.BufferGeometry();
        const rainPositions = new Float32Array(rainCount * 6); // 2 vertices per raindrop streak
        for (let i = 0; i < rainCount; i++) {
            const x = (Math.random() - 0.5) * 110;
            const y = Math.random() * 45;
            const z = (Math.random() - 0.5) * 110;
            const idx = i * 6;
            rainPositions[idx] = x;
            rainPositions[idx + 1] = y;
            rainPositions[idx + 2] = z;
            rainPositions[idx + 3] = x - 0.15;
            rainPositions[idx + 4] = y - 1.35;
            rainPositions[idx + 5] = z;
        }
        rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
        const rainMat = new THREE.LineBasicMaterial({
            color: '#b3e5fc',
            transparent: true,
            opacity: 0.68
        });
        this.rainSystem = new THREE.LineSegments(rainGeo, rainMat);
        this.rainSystem.visible = false;
        this.scene.add(this.rainSystem);
    }

    // Switch among the 4 weather modes:
    // - 'clear_clouds' : 藍天白雲
    // - 'sunny'        : 艷陽高照
    // - 'overcast'     : 陰天
    // - 'rainy'        : 下雨天
    applyWeather(mode) {
        this.weatherMode = mode;

        if (mode === 'clear_clouds') {
            // 藍天白雲
            this.scene.background = new THREE.Color('#9cd3f7');
            this.scene.fog = new THREE.FogExp2('#bce3fa', 0.0045);
            this.hemiLight.color.set('#ffffff');
            this.hemiLight.groundColor.set('#d8f0c8');
            this.hemiLight.intensity = 0.88;
            this.dirLight.color.set('#fff8e7');
            this.dirLight.intensity = 0.92;
            this.cloudMat.color.set('#ffffff');
            this.cloudGroup.visible = true;
            this.sunGroup.visible = false;
            this.rainSystem.visible = false;
            this.trackSurfaceMat.roughness = 0.78;
            if (window.soundManager) window.soundManager.stopRainAmbience();
        } else if (mode === 'sunny') {
            // 艷陽高照
            this.scene.background = new THREE.Color('#6ec6ff');
            this.scene.fog = new THREE.FogExp2('#fff8e1', 0.0032);
            this.hemiLight.color.set('#fffde7');
            this.hemiLight.groundColor.set('#ffe0b2');
            this.hemiLight.intensity = 1.02;
            this.dirLight.color.set('#ffecb3');
            this.dirLight.intensity = 1.28;
            this.cloudMat.color.set('#fffef5');
            this.cloudGroup.visible = true;
            this.sunGroup.visible = true;
            this.rainSystem.visible = false;
            this.trackSurfaceMat.roughness = 0.82;
            if (window.soundManager) window.soundManager.stopRainAmbience();
        } else if (mode === 'overcast') {
            // 陰天
            this.scene.background = new THREE.Color('#b0bec5');
            this.scene.fog = new THREE.FogExp2('#b0bec5', 0.0085);
            this.hemiLight.color.set('#cfd8dc');
            this.hemiLight.groundColor.set('#90a4ae');
            this.hemiLight.intensity = 0.78;
            this.dirLight.color.set('#eceff1');
            this.dirLight.intensity = 0.42;
            this.cloudMat.color.set('#90a4ae');
            this.cloudGroup.visible = true;
            this.sunGroup.visible = false;
            this.rainSystem.visible = false;
            this.trackSurfaceMat.roughness = 0.75;
            if (window.soundManager) window.soundManager.stopRainAmbience();
        } else if (mode === 'rainy') {
            // 下雨天
            this.scene.background = new THREE.Color('#607d8b');
            this.scene.fog = new THREE.FogExp2('#607d8b', 0.011);
            this.hemiLight.color.set('#90a4ae');
            this.hemiLight.groundColor.set('#546e7a');
            this.hemiLight.intensity = 0.65;
            this.dirLight.color.set('#b0bec5');
            this.dirLight.intensity = 0.35;
            this.cloudMat.color.set('#607d8b');
            this.cloudGroup.visible = true;
            this.sunGroup.visible = false;
            this.rainSystem.visible = true;
            // Wet reflective track surface
            this.trackSurfaceMat.roughness = 0.25;
            if (window.soundManager) window.soundManager.startRainAmbience();
        }
    }

    // Fetch real-time weather using Open-Meteo API
    async syncRealTimeWeather(onWeatherDetected) {
        const fetchByCoords = async (lat, lon, cityLabel) => {
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&current_weather=true`;
            const res = await fetch(url);
            if (!res.ok) throw new Error('Weather API failed');
            const data = await res.json();
            const cw = data.current_weather;
            const code = cw ? cw.weathercode : 1;
            const temp = cw ? cw.temperature : 25;

            let mode = 'clear_clouds';
            if (code === 0) {
                mode = temp >= 26 ? 'sunny' : 'clear_clouds';
            } else if (code === 1 || code === 2) {
                mode = 'clear_clouds';
            } else if (code === 3 || code === 45 || code === 48) {
                mode = 'overcast';
            } else if (code >= 51) {
                mode = 'rainy';
            }

            this.applyWeather(mode);
            if (onWeatherDetected) {
                onWeatherDetected({ mode, temp, code, cityLabel });
            }
        };

        try {
            // Try browser geolocation with 3.5s timeout, fallback to Taipei (25.0330, 121.5654)
            const pos = await new Promise((resolve, reject) => {
                if (!navigator.geolocation) return reject(new Error('No geolocation'));
                const timer = setTimeout(() => reject(new Error('Geo timeout')), 3500);
                navigator.geolocation.getCurrentPosition(
                    (p) => { clearTimeout(timer); resolve(p); },
                    (e) => { clearTimeout(timer); reject(e); }
                );
            });
            await fetchByCoords(pos.coords.latitude, pos.coords.longitude, '即時定位天氣');
        } catch (err) {
            try {
                await fetchByCoords(25.0330, 121.5654, '即時天氣');
            } catch (e) {
                // Offline fallback
                this.applyWeather('clear_clouds');
                if (onWeatherDetected) {
                    onWeatherDetected({ mode: 'clear_clouds', temp: 24, code: 1, cityLabel: '預設天氣' });
                }
            }
        }
    }

    update(dt, elapsed, focusPosition = null) {
        // Animate clouds drifting slowly
        for (const c of this.clouds) {
            c.mesh.position.x += c.speed * dt;
            if (c.mesh.position.x > 85) c.mesh.position.x = -85;
        }

        // Bobbing field location pin & checkpoint sprites
        if (this.fieldPin) {
            this.fieldPin.position.y = 0.4 + Math.sin(elapsed * 3.0) * 0.18;
            this.fieldPin.rotation.y += dt * 1.2;
        }
        this.checkpointMeshes.forEach((cp, idx) => {
            if (cp.userData.sprite) {
                cp.userData.sprite.position.y = 1.65 + Math.sin(elapsed * 3.5 + idx) * 0.12;
            }
        });

        // Animate background NPCs playing soccer
        this.soccerNPCs.forEach((npc) => {
            const t = elapsed * 1.8 + npc.phase;
            npc.mesh.position.x = npc.baseX + Math.sin(t) * 1.6;
            npc.mesh.position.z = npc.baseZ + Math.cos(t * 0.8) * 1.2;
            npc.mesh.position.y = Math.abs(Math.sin(t * 4)) * 0.18;
            npc.mesh.rotation.y = Math.atan2(Math.cos(t), -Math.sin(t * 0.8));
        });
        if (this.soccerBall) {
            this.soccerBall.position.x = 1.2 + Math.sin(elapsed * 2.2) * 3.2;
            this.soccerBall.position.z = -2.0 + Math.cos(elapsed * 1.7) * 2.4;
            this.soccerBall.position.y = 0.28 + Math.abs(Math.sin(elapsed * 6.5)) * 0.35;
        }

        // Animate rain falling around the camera / player
        if (this.rainSystem && this.rainSystem.visible) {
            const posAttr = this.rainSystem.geometry.attributes.position;
            const arr = posAttr.array;
            const centerX = focusPosition ? focusPosition.x : 0;
            const centerZ = focusPosition ? focusPosition.z : 0;
            const fallSpeed = 34 * dt;

            for (let i = 0; i < arr.length; i += 6) {
                arr[i + 1] -= fallSpeed;
                arr[i + 4] -= fallSpeed;
                if (arr[i + 1] < 0) {
                    const rx = centerX + (Math.random() - 0.5) * 90;
                    const ry = 36 + Math.random() * 10;
                    const rz = centerZ + (Math.random() - 0.5) * 90;
                    arr[i] = rx;
                    arr[i + 1] = ry;
                    arr[i + 2] = rz;
                    arr[i + 3] = rx - 0.15;
                    arr[i + 4] = ry - 1.35;
                    arr[i + 5] = rz;
                }
            }
            posAttr.needsUpdate = true;
        }
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    render() {
        this.renderer.render(this.scene, this.camera);
    }
}

window.WorldScene = WorldScene;
