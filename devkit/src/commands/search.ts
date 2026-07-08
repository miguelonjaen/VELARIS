import fs from "node:fs";
import path from "node:path";

const ignored = new Set([
    ".git",
    ".cursor",
    ".vscode",
    "node_modules",
    "dist",
    "dist-main",
    "dist_electron",
    "dist-electron",
    "coverage"
]);

export function search(term: string) {

    if (!term) {
        console.log("Uso:");
        console.log("npm run devkit:search <texto>");
        return;
    }

    const root = process.cwd();

    console.log("");
    console.log(`🔍 Buscando "${term}"...`);
    console.log("");

    visit(root, term);

    console.log("");
    console.log("✅ Búsqueda terminada.");
}

function visit(folder: string, term: string) {

    const entries = fs.readdirSync(folder, { withFileTypes: true });

    for (const entry of entries) {

        if (ignored.has(entry.name))
            continue;

        const fullPath = path.join(folder, entry.name);

        if (entry.isDirectory()) {

            visit(fullPath, term);
            continue;
        }

        if (!/\.(ts|tsx|js|jsx|json|md)$/i.test(entry.name))
            continue;

        const text = fs.readFileSync(fullPath, "utf8");

        if (text.includes(term)) {

            const relative = path.relative(process.cwd(), fullPath);

            console.log(relative);
        }
    }
}