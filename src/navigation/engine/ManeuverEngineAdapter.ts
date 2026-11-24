import {
    ManeuverEngine,
    ManeuverEvent,
    NavigationSample
} from "./ManeuverEngine";

export class ManeuverEngineAdapter {
    private readonly engine: ManeuverEngine;

    constructor(engine = new ManeuverEngine()) {
        this.engine = engine;
    }

    public process(sample: NavigationSample): ManeuverEvent | null {
        return this.engine.process(sample);
    }

    public reset(): void {
        this.engine.reset();
    }
}
