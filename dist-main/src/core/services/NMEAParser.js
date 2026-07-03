"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NMEAParser = void 0;
class NMEAParser {
    parse(line) {
        return {
            type: "RAW",
            line
        };
    }
}
exports.NMEAParser = NMEAParser;
