// Math Question Engine for 3D Track Racing Game
// Supports 2 selectable Question Banks (10 questions per lap, 2 wrong direct inputs -> 4-option multiple choice):
//
// [Question Bank 1: 'pos_neg' - 正負數加減法]
// 1. 負減負: (-a) - (-b)
// 2. 負加負: (-a) + (-b)
// 3. 負加正: (-a) + b
// 4. 負減正: (-a) - b
// 5. 正減負: a - (-b)
// 6. 正加負: a + (-b)
// 7. 小減大: a - b (where 0 < a < b, so the answer is always a negative integer)
//
// [Question Bank 2: 'square_root' - 平方與開根號]
// 1. 單位數平方: 2×2 ~ 9×9 (answers 4 ~ 81)
// 2. 雙位數平方: 10×10 ~ 20×20 (answers 100 ~ 400)
// 3. 完全平方數開根號: 根號4=？ ~ 根號400=？ (√4 ~ √400, answers 2 ~ 20)

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

    generateQuestionSet(totalCount = 10, seed = null, bankMode = 'pos_neg') {
        if (bankMode === 'square_root') {
            return this.generateSquareAndRootSet(totalCount, seed);
        }

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
            const options = this.buildFourOptions(built.answer, built.commonMistakes, rng, true);

            questions.push({
                index: i + 1,
                bankMode: 'pos_neg',
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

    // Question Bank 2:
    // - 2×2 ~ 9×9 單位數平方
    // - 10×10 ~ 20×20 雙位數平方
    // - √4 ~ √400 完全平方數開根號（例如：根號144=？）
    generateSquareAndRootSet(totalCount = 10, seed = null) {
        const rng = this.createRng(seed);

        const shufflePool = (arr) => {
            const copy = arr.slice();
            for (let i = copy.length - 1; i > 0; i--) {
                const j = Math.floor(rng() * (i + 1));
                [copy[i], copy[j]] = [copy[j], copy[i]];
            }
            return copy;
        };

        // 1. Pool of single-digit squares: 2..9 (8 items)
        const singlePool = shufflePool([2, 3, 4, 5, 6, 7, 8, 9]);
        // 2. Pool of double-digit squares: 10..20 (11 items)
        const doublePool = shufflePool([10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
        // 3. Pool of square roots: 2..20 (19 items, e.g. 根號4 ~ 根號400)
        const rootPool = shufflePool([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);

        // Balanced category schedule across 10 questions:
        // 3 single-digit squares, 3 double-digit squares, 4 square roots (or 3/4/3)
        const categories = ['SINGLE_SQ', 'SINGLE_SQ', 'SINGLE_SQ', 'DOUBLE_SQ', 'DOUBLE_SQ', 'DOUBLE_SQ', 'SQ_ROOT', 'SQ_ROOT', 'SQ_ROOT', 'SQ_ROOT'];
        while (categories.length < totalCount) {
            categories.push(['SINGLE_SQ', 'DOUBLE_SQ', 'SQ_ROOT'][categories.length % 3]);
        }
        const scheduledCats = shufflePool(categories.slice(0, totalCount));

        const rawItems = [];
        let sIdx = 0;
        let dIdx = 0;
        let rIdx = 0;

        for (let i = 0; i < totalCount; i++) {
            const cat = scheduledCats[i];
            if (cat === 'SINGLE_SQ') {
                const n = singlePool[sIdx % singlePool.length];
                sIdx++;
                const ans = n * n;
                const mistakes = [
                    n === 2 ? 6 : n * 2,
                    n * (n - 1),
                    n * (n + 1),
                    (n - 1) * (n - 1) > 0 ? (n - 1) * (n - 1) : ans + 4,
                    (n + 1) * (n + 1)
                ];
                rawItems.push({
                    typeKey: 'SINGLE_DIGIT_SQUARE',
                    typeName: '單位數平方',
                    badgeColor: '#1565c0',
                    expression: `${n} × ${n}`,
                    answer: ans,
                    hint: `💡 觀念提示：${n} 的平方就是「${n} 乘以自己」（${n} × ${n}），用九九乘法表就能算出答案囉！`,
                    mistakes
                });
            } else if (cat === 'DOUBLE_SQ') {
                const n = doublePool[dIdx % doublePool.length];
                dIdx++;
                const ans = n * n;
                const swappedMistake = n === 13 ? 196 : (n === 14 ? 169 : ans + 20);
                const mistakes = [
                    swappedMistake,
                    (n - 1) * (n - 1),
                    (n + 1) * (n + 1),
                    ans - 10,
                    ans + 10,
                    n * 20
                ];
                const hintText = (n === 10 || n === 20)
                    ? `💡 觀念提示：${n} × ${n} 可以先算 ${n / 10} × ${n / 10} = ${(n / 10) * (n / 10)}，後面再補上兩個 0 喔！`
                    : `💡 觀念提示：${n} × ${n} 可拆成 ${n} × 10 + ${n} × ${n - 10} = ${n * 10} + ${n * (n - 10)}（個位數 ${n % 10} × ${n % 10} 的尾數是 ${(n * n) % 10}）！`;
                rawItems.push({
                    typeKey: 'DOUBLE_DIGIT_SQUARE',
                    typeName: '雙位數平方',
                    badgeColor: '#6a1b9a',
                    expression: `${n} × ${n}`,
                    answer: ans,
                    hint: hintText,
                    mistakes
                });
            } else {
                const n = rootPool[rIdx % rootPool.length];
                rIdx++;
                const sq = n * n;
                const mistakes = [
                    n > 2 ? n - 1 : n + 3,
                    n + 1,
                    n > 3 ? n - 2 : n + 4,
                    n + 2,
                    sq <= 36 ? Math.floor(sq / 2) : n + 10
                ];
                rawItems.push({
                    typeKey: 'SQUARE_ROOT',
                    typeName: '開根號',
                    badgeColor: '#00838f',
                    expression: `√${sq}`,
                    radicand: sq,
                    answer: n,
                    hint: `💡 觀念提示：√${sq} 代表「哪一個正整數乘以自己會等於 ${sq}」？\n想想看：幾乘以幾會等於 ${sq} 呢？`,
                    mistakes
                });
            }
        }

        return rawItems.map((item, idx) => ({
            index: idx + 1,
            bankMode: 'square_root',
            typeKey: item.typeKey,
            typeName: item.typeName,
            badgeColor: item.badgeColor,
            expression: item.expression,
            radicand: item.radicand || null,
            answer: item.answer,
            hint: item.hint,
            options: this.buildFourOptions(item.answer, item.mistakes, rng, false)
        }));
    }

    buildFourOptions(correctAnswer, mistakes, rng, allowNegative = true) {
        const set = new Set([correctAnswer]);

        for (const m of mistakes) {
            if (typeof m === 'number' && !Number.isNaN(m) && m !== correctAnswer) {
                if (allowNegative || m > 0) {
                    set.add(m);
                    if (set.size >= 4) break;
                }
            }
        }

        // Fill up to 4 unique options if some mistakes overlapped
        const offsets = allowNegative ? [-2, 2, -1, 1, -4, 4, -3, 3] : [1, -1, 2, -2, 3, -3, 4, 5, 10];
        for (const off of offsets) {
            if (set.size >= 4) break;
            let candidate;
            if (allowNegative) {
                candidate = correctAnswer === 0 ? off : (off % 2 === 0 ? -correctAnswer : correctAnswer + off);
            } else {
                candidate = Math.max(1, correctAnswer + off);
            }
            if (!set.has(candidate) && candidate !== correctAnswer) {
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
