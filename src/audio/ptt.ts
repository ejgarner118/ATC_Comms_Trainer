export interface PttControl {
  setEnabled: (enabled: boolean) => void;
}

/** Hold Spacebar or the on-screen button. Key repeat does not open a second transmission. */
export function bindPtt(button: HTMLButtonElement, onStart: () => void, onEnd: () => void): PttControl {
  let holding = false;
  let enabled = true;

  const start = () => {
    if (!enabled || holding) return;
    holding = true;
    button.classList.add("is-hot");
    button.setAttribute("aria-pressed", "true");
    onStart();
  };

  const end = () => {
    if (!holding) return;
    holding = false;
    button.classList.remove("is-hot");
    button.setAttribute("aria-pressed", "false");
    onEnd();
  };

  button.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    start();
  });
  button.addEventListener("pointerup", end);
  button.addEventListener("pointercancel", end);
  button.addEventListener("contextmenu", (event) => event.preventDefault());

  window.addEventListener("keydown", (event) => {
    if (event.code !== "Space" || event.repeat) return;
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
    event.preventDefault();
    start();
  });
  window.addEventListener("keyup", (event) => {
    if (event.code !== "Space") return;
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
    event.preventDefault();
    end();
  });
  window.addEventListener("blur", end);

  return {
    setEnabled(next) {
      enabled = next;
      button.disabled = !next;
      if (!next) end();
    },
  };
}
