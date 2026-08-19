export function calculateVMG(
    sog: number,
    cog: number,
    btw: number
): number {

    let angle = cog - btw;

    while (angle > 180) angle -= 360;
    while (angle < -180) angle += 360;

    return sog * Math.cos(angle * Math.PI / 180);

}