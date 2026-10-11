/**
 * Compatibilidade com iPhones de iOS mais antigo (Safari < 15.4): pequenas funções que o app usa
 * e que esses aparelhos ainda não tinham. Sem elas, uma tela inteira poderia quebrar.
 */
if (!Array.prototype.at) {
  Object.defineProperty(Array.prototype, 'at', {
    configurable: true, writable: true,
    value: function at<T>(this: T[], i: number) { const n = Math.trunc(i) || 0; return this[n < 0 ? this.length + n : n]; },
  });
}
if (typeof crypto !== 'undefined' && !crypto.randomUUID) {
  (crypto as unknown as { randomUUID: () => string }).randomUUID = () => {
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  };
}
export {};
