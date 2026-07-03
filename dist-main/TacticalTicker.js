"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TacticalTicker = void 0;
class TacticalTicker {
    window;
    interval = null;
    lastState = null;
    constructor(window) {
        this.window = window;
    }
    start(frequencyMs = 500) {
        this.interval = setInterval(() => this.evaluateRules(), frequencyMs);
    }
    updateState(state) {
        this.lastState = state;
    }
    evaluateRules() {
        if (!this.lastState)
            return;
        const advices = [];
        // Ejemplo de Regla COLREG: Profundidad Crítica
        if (this.lastState.depth < 2.5) {
            advices.push({
                id: Date.now().toString(),
                severity: 'critical',
                message: `¡Peligro! Profundidad crítica: ${this.lastState.depth}m`,
                rule: 'Safety Depth'
            });
        }
        if (advices.length > 0) {
            // Despacho reactivo a la UI
            this.window.webContents.send('tactical-advice', advices);
        }
    }
}
exports.TacticalTicker = TacticalTicker;
