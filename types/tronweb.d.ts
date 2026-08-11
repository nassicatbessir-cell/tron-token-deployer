interface Window {
  tronWeb?: any;
  tronLink?: {
    request: (args: { method: string }) => Promise<unknown>;
  };
}
