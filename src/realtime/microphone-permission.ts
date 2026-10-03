export type MicrophonePermissionStatus = "unknown" | "requesting" | "granted" | "denied" | "unavailable" | "error";

export type MicrophoneErrorCode =
  | "INSECURE_CONTEXT"
  | "UNSUPPORTED"
  | "PERMISSION_DENIED"
  | "NO_DEVICE"
  | "DEVICE_BUSY"
  | "CONSTRAINTS"
  | "UNKNOWN";

export type MicrophoneRequestResult = {
  status: Exclude<MicrophonePermissionStatus, "unknown" | "requesting">;
  stream: MediaStream | null;
  errorCode?: MicrophoneErrorCode;
  message?: string;
  secureContext: boolean;
  permissionsState: PermissionState | "unavailable";
};

async function permissionState(): Promise<PermissionState | "unavailable"> {
  if (typeof navigator === "undefined" || !navigator.permissions?.query) return "unavailable";
  try {
    const result = await navigator.permissions.query({ name: "microphone" as PermissionName });
    return result.state;
  } catch {
    return "unavailable";
  }
}

export class MicrophonePermissionManager {
  private grantedInSession = false;

  getSessionGranted() {
    return this.grantedInSession;
  }

  async request(constraints: MediaStreamConstraints = { audio: true }): Promise<MicrophoneRequestResult> {
    const secureContext = typeof window !== "undefined" && window.isSecureContext;
    const getUserMedia = typeof navigator !== "undefined" ? navigator.mediaDevices?.getUserMedia : undefined;
    if (!secureContext) return { status: "error", stream: null, errorCode: "INSECURE_CONTEXT", message: "当前页面不是安全连接，手机浏览器不会开放麦克风。请使用 HTTPS。", secureContext: false, permissionsState: await permissionState() };
    if (!getUserMedia) return { status: "unavailable", stream: null, errorCode: "UNSUPPORTED", message: "当前浏览器不支持网页麦克风。", secureContext: true, permissionsState: await permissionState() };
    const permissionsState = await permissionState();

    try {
      const stream = await getUserMedia.call(navigator.mediaDevices, constraints);
      const track = stream.getAudioTracks()[0];
      if (!track || track.readyState !== "live") {
        stream.getTracks().forEach((item) => item.stop());
        return { status: "error", stream: null, errorCode: "NO_DEVICE", message: "没有找到正在工作的麦克风。", secureContext: true, permissionsState };
      }
      this.grantedInSession = true;
      return { status: "granted", stream, secureContext: true, permissionsState: "granted" };
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") return { status: "denied", stream: null, errorCode: "PERMISSION_DENIED", message: "麦克风权限被拒绝，请在浏览器设置里允许当前网站使用麦克风。", secureContext: true, permissionsState: "denied" };
      if (name === "NotFoundError") return { status: "unavailable", stream: null, errorCode: "NO_DEVICE", message: "没有找到可用的麦克风设备。", secureContext: true, permissionsState };
      if (name === "NotReadableError") return { status: "error", stream: null, errorCode: "DEVICE_BUSY", message: "麦克风暂时无法使用，可能正被其他应用占用。请关闭占用麦克风的应用后重试。", secureContext: true, permissionsState: "granted" };
      if (name === "OverconstrainedError") return { status: "error", stream: null, errorCode: "CONSTRAINTS", message: "当前麦克风不支持这组音频设置，正在等待重新尝试。", secureContext: true, permissionsState };
      return { status: "error", stream: null, errorCode: "UNKNOWN", message: "麦克风暂时无法使用，请重新尝试。", secureContext: true, permissionsState };
    }
  }

  watchDeviceChanges(onChange: () => void) {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.addEventListener) return () => undefined;
    navigator.mediaDevices.addEventListener("devicechange", onChange);
    return () => navigator.mediaDevices.removeEventListener("devicechange", onChange);
  }
}
