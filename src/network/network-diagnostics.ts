export type NetworkDiagnostics = {
  online: boolean;
  effectiveType: string;
  downlink: number | null;
  rtt: number | null;
  saveData: boolean | null;
  type: string;
};

type NetworkInformationLike = { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean; type?: string };

export function readNetworkDiagnostics(): NetworkDiagnostics {
  if (typeof navigator === "undefined") return { online: false, effectiveType: "unknown", downlink: null, rtt: null, saveData: null, type: "unknown" };
  const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
  return {
    online: navigator.onLine,
    effectiveType: connection?.effectiveType || "unknown",
    downlink: typeof connection?.downlink === "number" ? connection.downlink : null,
    rtt: typeof connection?.rtt === "number" ? connection.rtt : null,
    saveData: typeof connection?.saveData === "boolean" ? connection.saveData : null,
    type: connection?.type || "unknown",
  };
}

