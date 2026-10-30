// Positive & Negative Integer Addition/Subtraction Engine
// Covers all 7 required types (10 questions per lap):
// 1. 負減負: (-a) - (-b)
// 2. 負加負: (-a) + (-b)
// 3. 負加正: (-a) + b
// 4. 負減正: (-a) - b
// 5. 正減負: a - (-b)
// 6. 正加負: a + (-b)
// 7. 小減大: a - b (where 0 < a < b, so the answer is always a negative integer)

class MathQuestionEngine {
    constructor() {
        this.types = [
            {
                key: 'NEG_SUB_NEG',
                name: '負減負',
                badgeColor: '#e65100',
                build: (a, b) => ({
                    expression: `(-${a}) - (-${b})`,
                    answer: (-a) - (-b),
                    hint: `💡 觀念提示：減去一個負數，等於「加上」對應的正數喔！\n也就是 (-${a}) - (-${b}) = (-${a}) + ${b}`,
                    commonMistakes: [
                        -(a + b),
                        a - b,
                        (-a) - (-b) === 0 ? a + b : -((-a) - (-b))
                    ]
                })
            },
            {
                key: 'NEG_ADD_NEG',
                name: '負加負',
                badgeColor: '#c62828',
                build: (a, b) => ({
                    expression: `(-${a}) + (-${b})`,
                    answer: (-a) + (-b),
                    hint: `💡 觀念提示：兩個負數相加，結果還是負數，把數字大小加起來再冠上負號！\n也就是 -(${a} + ${b})`,
                    commonMistakes: [
                        a + b,
                        -(Math.abs(a - b)),
                        Math.abs(a - b)
                    ]
                })
            },
            {
                key: 'NEG_ADD_POS',
                name: '負加正',
                badgeColor: '#1565c0',
                build: (a, b) => ({
                    expression: `(-${a}) + ${b}`,
                    answer: (-a) + b,
                    hint: `💡 觀念提示：一負一正相加，先看誰的數字（絕對值）比較大，結果就跟它同號，再用大減小！`,
                    commonMistakes: [
                        -(a + b),
                        a + b,
                        a - b
                    ]
                })
            },
            {
                key: 'NEG_SUB_POS',
                name: '負減正',
                badgeColor: '#6a1b9a',
                build: (a, b) => ({
                    expression: `(-${a}) - ${b}`,
                    answer: (-a) - b,
                    hint: `💡 觀念提示：負數再減去正數，等於往數線左邊越走越遠：(-${a}) + (-${b}) = -(${a} + ${b})`,
                    commonMistakes: [
                        (-a) + b,
                        a - b,
                        a + b
                    ]
                })
            },
            {
                key: 'POS_SUB_NEG',
                name: '正減負',
                badgeColor: '#2e7d32',
                build: (a, b) => ({
                    expression: `${a} - (-${b})`,
                    answer: a - (-b),
                    hint: `💡 觀念提示：「負負得正」！減去一個負數 (-${b})，就等於加上 ${b} 喔！\n也就是 ${a} + ${b}`,
                    commonMistakes: [
                        a - b,
                        b - a,
                        -(a + b)
                    ]
                })
            },
            {
                key: 'POS_ADD_NEG',
                name: '正加負',
                badgeColor: '#00838f',
                build: (a, b) => ({
                    expression: `${a} + (-${b})`,
                    answer: a + (-b),
                    hint: `💡 觀念提示：加上一個負數 (-${b})，就相當於減去 ${b} 喔！\n也就是 ${a} - ${b}`,
                    commonMistakes: [
                        a + b,
                        b - a,
                        -(a + b)
                    ]
                })
            },
            {
                key: 'POS_SUB_POS_NEG',
                name: '小減大',
                badgeColor: '#ad1457',
                build: (a, b) => {
                    // Ensure small minus large (small < large) so result is always negative
                    const small = Math.min(a, b);
                    const large = Math.max(a, b) === small ? small + 1 : Math.max(a, b);
                    return {
                        expression: `${small} - ${large}`,
                        answer: small - large,
                        hint: `💡 觀念提示：小數減大數不夠減，結果會是「負數」！\n先算大減小（${large} - ${small} = ${large - small}），前面再加上負號變成 -${large - small} 喔！`,
                        commonMistakes: [
                            large - small,   // Forgot the negative sign (computed large - small)
                            -(small + large),
                            small + large
                        ]
                    };
                }
            }
        ];
    }

    // Seeded pseudo-random generator so multiplayer rooms can share identical question sets
    createRng(seed) {
        let s = seed ? Number(seed) : Math.floor(Math.random() * 999999) + 1;
        return () => {
            s = (s * 1664525 + 1013904223) % 4294967296;
            return s / 4294967296;
        };
    }

    generateQuestionSet(totalCount = 10, seed = null) {
        const rng = this.createRng(seed);
        const randInt = (min, max) => Math.floor(rng() * (max - min + 1)) + min;

        const numTypes = this.types.length; // 7 types
        // Ensure all 7 types appear at least once, then fill remaining 3 balanced from the 7 types
        const typeIndices = Array.from({ length: numTypes }, (_, i) => i);
        const extraPool = Array.from({ length: numTypes }, (_, i) => i);
        while (typeIndices.length < totalCount) {
            const pickIdx = Math.floor(rng() * extraPool.length);
            typeIndices.push(extraPool.splice(pickIdx, 1)[0]);
            if (extraPool.length === 0) {
                for (let k = 0; k < numTypes; k++) extraPool.push(k);
            }
        }

        // Shuffle type order
        for (let i = typeIndices.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [typeIndices[i], typeIndices[j]] = [typeIndices[j], typeIndices[i]];
        }

        const usedExpressions = new Set();
        const questions = [];

        for (let i = 0; i < totalCount; i++) {
            const tDef = this.types[typeIndices[i]];
            let a = randInt(1, 9);
            let b = randInt(1, 10);
            let guard = 0;

            while (guard < 30) {
                if (tDef.key === 'POS_SUB_POS_NEG') {
                    a = randInt(1, 8);
                    b = randInt(a + 1, 10);
                }
                const candidate = tDef.build(a, b);
                if (!usedExpressions.has(candidate.expression) && a !== b) {
                    usedExpressions.add(candidate.expression);
                    break;
                }
                a = randInt(1, 9);
                b = randInt(1, 10);
                guard++;
            }

            const built = tDef.build(a, b);
            const options = this.buildFourOptions(built.answer, built.commonMistakes, rng);

            questions.push({
                index: i + 1,
                typeKey: tDef.key,
                typeName: tDef.name,
                badgeColor: tDef.badgeColor,
                expression: built.expression,
                answer: built.answer,
                hint: built.hint,
                options
            });
        }

        return questions;
    }

    buildFourOptions(correctAnswer, mistakes, rng) {
        const set = new Set([correctAnswer]);

        for (const m of mistakes) {
            if (typeof m === 'number' && !Number.isNaN(m) && m !== correctAnswer) {
                set.add(m);
                if (set.size >= 4) break;
            }
        }

        // Fill up to 4 unique options if some mistakes overlapped
        const offsets = [-2, 2, -1, 1, -4, 4, -3, 3];
        for (const off of offsets) {
            if (set.size >= 4) break;
            const candidate = correctAnswer === 0 ? off : (off % 2 === 0 ? -correctAnswer : correctAnswer + off);
            if (!set.has(candidate)) {
                set.add(candidate);
            }
        }

        while (set.size < 4) {
            set.add(correctAnswer + set.size + 1);
        }

        const arr = Array.from(set).slice(0, 4);
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }
}

window.mathEngine = new MathQuestionEngine();
