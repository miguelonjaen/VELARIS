import { VesselState, TacticalAdvice } from '@shared/types';
import { BrowserWindow } from 'electron';

export class TacticalTicker {
  private interval: NodeJS.Timeout | null = null;
  private lastState: VesselState | null = null;

  constructor(private window: BrowserWindow) {}

  public start(frequencyMs: number = 500) {
    this.interval = setInterval(() => this.evaluateRules(), frequencyMs);
  }

  public updateState(state: VesselState) {
    this.lastState = state;
  }

  private evaluateRules() {
    if (!this.lastState) return;

    const advices: TacticalAdvice[] = [];

    if (this.lastState.depth < 2.5) {
      advices.push({
        id: Date.now().toString(),
        severity: 'critical',
        message: `¡Peligro! Profundidad crítica: ${this.lastState.depth}m`,
        rule: 'Safety Depth'
      });
    }

    if (advices.length > 0) {
      this.window.webContents.send('tactical-advice', advices);
    }
  }
}
