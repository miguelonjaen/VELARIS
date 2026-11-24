import fs from "node:fs";
import path from "node:path";

export function scanProject() {

    const root = process.cwd();

    const outputDir = path.join(root, "devkit", "output");

    fs.mkdirSync(outputDir, { recursive: true });

    const scan = scanFolder(root);

    fs.writeFileSync(
        path.join(outputDir, "project-index.json"),
        JSON.stringify(scan, null, 2),
        "utf8"
    );

    console.log("✅ Proyecto escaneado.");
    console.log("📄 devkit/output/project-index.json");
}

function scanFolder(folder: string): any {

    const result: any = {};

    const ignored = new Set([
        ".git",
        "node_modules",
        "dist",
        "dist-main",
        "dist_electron",
        "dist-electron",
        ".cursor",
        ".vscode"
    ]);

    const entries = fs.readdirSync(folder, {
        withFileTypes: true
    });

    for (const entry of entries) {

        if (ignored.has(entry.name))
            continue;

        const fullPath = path.join(folder, entry.name);

        if (entry.isDirectory()) {

            result[entry.name] = scanFolder(fullPath);

        } else {

            result[entry.name] = "file";

        }

    }

    return result;
}