import { spawnSync } from "node:child_process";

export function build() {

    console.log("");
    console.log("🏗️ Construyendo Velaris...");
    console.log("");

    const result = spawnSync("npm", ["run", "build"], {
        stdio: "inherit",
        shell: true
    });

    if (result.status === 0) {
        console.log("");
        console.log("✅ Build finalizado correctamente.");
    } else {
        console.log("");
        console.log("❌ El build ha fallado.");
    }
}