import "@testing-library/jest-dom";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});


/**
 * O navegador de mentira (jsdom) nao tem eventos de PONTEIRO, e os menus e
 * seletores do sistema dependem deles: o menu suspenso abre no `pointerdown`,
 * nao no clique. Sem isto, todo teste que abre um menu falha com
 * "PointerEvent is not defined" -- parecendo que o menu esta quebrado, quando
 * e o ambiente de teste que nao sabe abrir.
 */
if (typeof window.PointerEvent === "undefined") {
  class PointerEventFalso extends MouseEvent {
    public pointerId = 1;
    public pointerType = "mouse";
    public isPrimary = true;
    public width = 1;
    public height = 1;
    public pressure = 0.5;
    public tiltX = 0;
    public tiltY = 0;
  }
  // @ts-expect-error -- dublê suficiente para o que as bibliotecas usam.
  window.PointerEvent = PointerEventFalso;
  // @ts-expect-error -- mesmo dublê, no escopo global.
  global.PointerEvent = PointerEventFalso;
}

// Métodos que o jsdom não implementa e as bibliotecas de menu chamam sem
// perguntar. Sem eles o teste quebra por um detalhe que não é o assunto dele.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
