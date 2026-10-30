// Web Audio API Synthesizer for 3D Math Track Game
// Provides zero-dependency sound effects & weather ambience

class SoundManager {
    constructor() {
        this.ctx = null;
        this.enabled = true;
        this.rainNode = null;
        this.rainGain = null;
    }

    init() {
        if (!this.ctx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) {
                this.ctx = new AudioCtx();
            }
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    toggle() {
        this.enabled = !this.enabled;
        if (!this.enabled) {
            this.stopRainAmbience();
        }
        return this.enabled;
    }

    playTone(freq, type = 'sine', duration = 0.15, volume = 0.18, slideTo = null, delay = 0) {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime + delay;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, now);
        if (slideTo) {
            osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), now + duration);
        }

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(volume, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + duration + 0.02);
    }

    playClick() {
        this.playTone(620, 'triangle', 0.06, 0.12, 780);
    }

    playCountdown(isGo = false) {
        if (isGo) {
            this.playTone(523.25, 'triangle', 0.12, 0.22, null, 0);
            this.playTone(659.25, 'triangle', 0.12, 0.22, null, 0.08);
            this.playTone(1046.5, 'triangle', 0.35, 0.28, null, 0.16);
        } else {
            this.playTone(440, 'sine', 0.18, 0.20);
        }
    }

    playQuestionPop() {
        this.playTone(480, 'sine', 0.1, 0.15, 680, 0);
        this.playTone(720, 'sine', 0.14, 0.15, 880, 0.07);
    }

    playCorrectSprint() {
        // Cheerful chime + sprint boost whoosh
        this.playTone(523.25, 'triangle', 0.12, 0.22, null, 0);
        this.playTone(659.25, 'triangle', 0.12, 0.22, null, 0.08);
        this.playTone(783.99, 'triangle', 0.14, 0.22, null, 0.16);
        this.playTone(1046.5, 'triangle', 0.30, 0.26, 1180, 0.24);
    }

    playWrongFall() {
        // Cartoon slip & thud sound
        this.playTone(360, 'sawtooth', 0.22, 0.18, 130, 0);
        this.playTone(150, 'triangle', 0.28, 0.22, 65, 0.18);
    }

    playRecover() {
        this.playTone(330, 'sine', 0.12, 0.16, 494, 0);
        this.playTone(494, 'sine', 0.16, 0.18, 659, 0.10);
    }

    playFinishFanfare() {
        const notes = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5];
        const times = [0, 0.12, 0.24, 0.36, 0.52, 0.66];
        const durs  = [0.11, 0.11, 0.11, 0.15, 0.12, 0.45];
        for (let i = 0; i < notes.length; i++) {
            this.playTone(notes[i], 'triangle', durs[i], 0.24, null, times[i]);
        }
    }

    startRainAmbience() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx || this.rainNode) return;

        try {
            const bufferSize = this.ctx.sampleRate * 2;
            const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }
            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;
            noise.loop = true;

            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.value = 950;
            filter.Q.value = 0.7;

            const gain = this.ctx.createGain();
            gain.gain.value = 0.035;

            noise.connect(filter);
            filter.connect(gain);
            gain.connect(this.ctx.destination);
            noise.start();

            this.rainNode = noise;
            this.rainGain = gain;
        } catch (e) {
            // Ignore audio context autoplay errors
        }
    }

    stopRainAmbience() {
        if (this.rainNode) {
            try {
                this.rainNode.stop();
                this.rainNode.disconnect();
            } catch (e) {}
            this.rainNode = null;
            this.rainGain = null;
        }
    }
}

window.soundManager = new SoundManager();
