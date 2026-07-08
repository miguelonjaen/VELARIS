import fs from "node:fs";
import path from "node:path";

export function doctor() {

    const root = process.cwd();

    console.log("");
    console.log("🩺 Velaris Doctor");
    console.log("");

    check(root, "package.json");
    check(root, "tsconfig.json");
    check(root, "vite.config.ts");
    check(root, "electron-main.js");
    check(root, "src");

    console.log("");
    console.log("✅ Comprobación finalizada.");
}

function check(root: string, item: string) {

    const exists = fs.existsSync(path.join(root, item));

    if (exists)
        console.log(`✔ ${item}`);
    else
        console.log(`✖ ${item}`);

}