// El teclado virtual puede no informar CapsLock. No se infiere ese estado del texto.
const selector = 'input[type="password"], .dc-password-wrap input[type="text"]';
const bound = new WeakSet();
let counter = 0;
function bind(input) {
  if (bound.has(input)) return;
  bound.add(input);
  input.autocapitalize = "none";
  input.spellcheck = false;
  const note = document.createElement("p");
  note.id = "dc-password-feedback-" + (++counter);
  note.setAttribute("role", "status");
  note.hidden = true;
  note.style.cssText = "margin:8px 0 0;font-size:12px;line-height:1.45;color:inherit";
  const wrap = input.closest(".dc-password-wrap") || input;
  wrap.insertAdjacentElement("afterend", note);
  const described = input.getAttribute("aria-describedby") || "";
  input.setAttribute("aria-describedby", (described + " " + note.id).trim());
  let caps = false;
  let upper = false;
  const render = () => {
    note.textContent = caps ? "¡OJO! Bloq Mayús activado."
      : upper ? "¡OJO! Escribiste una mayúscula."
      : "La contraseña distingue entre mayúsculas y minúsculas. Usa el ojo para revisarla.";
    note.hidden = document.activeElement !== input;
  };
  const keyboard = event => {
    caps = event.getModifierState?.("CapsLock") === true;
    if (event.key === "CapsLock") upper = false;
    render();
  };
  input.addEventListener("focus", () => { caps = false; upper = false; render(); });
  input.addEventListener("keydown", keyboard);
  input.addEventListener("keyup", keyboard);
  input.addEventListener("input", event => {
    // Solo se examina el texto recién insertado; no se guarda ni transmite la contraseña.
    upper = typeof event.data === "string" && /\p{Lu}/u.test(event.data);
    render();
  });
  input.addEventListener("blur", () => { caps = false; upper = false; note.hidden = true; });
}
function scan() { document.querySelectorAll(selector).forEach(bind); }
function start() {
  // Sustituye los avisos antiguos por uno accesible por campo.
  const style = document.createElement("style");
  style.textContent = "#dc-caps-warning { display:none!important }";
  document.head.append(style);
  scan();
  new MutationObserver(records => {
    if (records.some(record => [...record.addedNodes].some(node =>
      node.nodeType === 1 && (node.matches(selector) || node.querySelector(selector))
    ))) scan();
  }).observe(document.body, { childList: true, subtree: true });
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
else start();

