#!/usr/bin/env node

import { scanProject } from "./commands/scan";
import { generateContext } from "./commands/context";
import { search } from "./commands/search";
import { doctor } from "./commands/doctor";
import { build } from "./commands/build";
import { docs } from "./commands/docs";

const command = process.argv[2];

switch (command) {

    case "scan":
        scanProject();
        break;

    case "init":
        console.log("DevKit inicializado.");
        break;

    case "context":
    generateContext();
    break;

    case "search":
    search(process.argv[3]);
    break;

    case "doctor":
    doctor();
    break;

    case "build":
    build();
    break;

    case "docs":
    docs();
    break;

    default:
        console.log(`
Velaris DevKit

Comandos disponibles

npm run devkit:init
npm run devkit:scan
npm run devkit:context
`);
}