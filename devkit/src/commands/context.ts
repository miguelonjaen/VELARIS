import fs from "node:fs";
import path from "node:path";

export function generateContext() {

    const root = process.cwd();

    const input = path.join(
        root,
        "devkit",
        "output",
        "project-index.json"
    );

    if (!fs.existsSync(input)) {

        console.log("❌ No existe project-index.json");
        console.log("Ejecuta primero:");
        console.log("npm run devkit:scan");

        return;
    }

    const project = JSON.parse(
        fs.readFileSync(input, "utf8")
    );

    const context = {
        project: "VELARIS",
        generated: new Date().toISOString(),
        structure: project
    };

    const output = path.join(
        root,
        "devkit",
        "output",
        "context.json"
    );

    fs.writeFileSync(
        output,
        JSON.stringify(context, null, 2),
        "utf8"
    );

    console.log("✅ Contexto generado.");
    console.log("📄 devkit/output/context.json");
}