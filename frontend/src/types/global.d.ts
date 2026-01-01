export {};

declare global {
  interface Window {
    __DEBUG_MODE__?: boolean;
    __toggleDebugMode__?: () => void;
  }
}
