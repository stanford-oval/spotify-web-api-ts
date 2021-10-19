export type OnOff = "on" | "off";

export function isOnOff(x: any): x is OnOff {
    return x === "on" || x === "off";
}
