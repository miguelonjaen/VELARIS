import fs from "node:fs";
import path from "node:path";

export function docs() {

    const root = process.cwd();

    const indexFile = path.join(
        root,
        "devkit",
        "output",
        "project-index.json"
    );

    if (!fs.existsSync(indexFile)) {

        console.log("❌ Ejecuta primero:");
        console.log("npm run devkit:scan");
        return;
    }

    const project = JSON.parse(
        fs.readFileSync(indexFile, "utf8")
    );

    let folders = 0;
    let files = 0;

    count(project);

    function count(node: any) {

        for (const key of Object.keys(node)) {

            if (node[key] === "file") {

                files++;

            } else {

                folders++;
                count(node[key]);

            }

        }

    }

    const summary = `# VELARIS

Generado: ${new Date().toLocaleString()}

## Resumen

- Carpetas: ${folders}
- Archivos: ${files}
`;

    const output = path.join(
        root,
        "devkit",
        "output",
        "summary.md"
    );

    fs.writeFileSync(output, summary, "utf8");

    console.log("✅ Resumen generado.");
    console.log("📄 devkit/output/summary.md");
}