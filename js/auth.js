import { enhanceMobileAccount } from "./mobile-account.js";
import { supabase } from "./core/supabaseClient.js";
import { createProductAuth } from "./core/account-auth.js";
const SUITE_URL = "https://suite.digitalcarmelo.com/";
function injectStyles() {
  if (document.getElementById("dc-auth-v2-styles")) return;

  const style = document.createElement("style");

  style.id = "dc-auth-v2-styles";

  style.textContent = `
    .dc-auth-screen {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 32px 20px;
      background:
        radial-gradient(
          circle at top left,
          rgba(110,74,142,.14),
          transparent 35%
        ),
        linear-gradient(
          135deg,
          #090a28 0%,
          #111336 55%,
          #0b0c2b 100%
        );
      color: #fff;
      box-sizing: border-box;
      font-family: Inter, Arial, sans-serif;
    }

    .dc-auth-card {
      width: min(100%, 570px);
      padding: 42px 40px;
      border-radius: 24px;
      border: 1px solid rgba(212,162,76,.48);
      background: rgba(20,22,53,.97);
      box-shadow: 0 30px 80px rgba(0,0,0,.28);
      box-sizing: border-box;
    }

    .dc-auth-center {
      text-align: center;
    }

    .dc-auth-lock {
      display: block;
      margin-bottom: 16px;
      font-size: 32px;
      text-align: center;
    }

    .dc-auth-eyebrow {
      margin: 0 0 14px;
      color: #e8ba55;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: .17em;
      text-transform: uppercase;
      text-align: center;
    }

    .dc-product-chip {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 18px;
      padding: 7px 12px;
      border: 1px solid rgba(212,162,76,.28);
      border-radius: 999px;
      background: rgba(212,162,76,.08);
      color: #d9b85f;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: .12em;
      text-transform: uppercase;
    }

    .dc-auth-title {
      margin: 0 auto 18px;
      max-width: 470px;
      color: #f2d188;
      font-family: Georgia, "Times New Roman", serif;
      font-size: clamp(32px, 5vw, 44px);
      line-height: 1.08;
      font-weight: 500;
      text-transform: uppercase;
      text-align: center;
    }

    .dc-auth-copy {
      max-width: 440px;
      margin: 0 auto 26px;
      color: #e4e4ec;
      font-size: 16px;
      line-height: 1.6;
      text-align: center;
    }

    .dc-auth-label {
      display: block;
      margin: 18px 0 8px;
      color: #fff;
      font-size: 13px;
      font-weight: 800;
      text-transform: uppercase;
      text-align: left;
    }

    .dc-auth-input {
      width: 100%;
      min-height: 52px;
      padding: 0 15px;
      border: 1px solid rgba(255,255,255,.2);
      border-radius: 14px;
      outline: none;
      background: #0e102e;
      color: #fff;
      font: inherit;
      box-sizing: border-box;
    }

    .dc-auth-input:focus {
      border-color: #d4a24c;
      box-shadow: 0 0 0 3px rgba(212,162,76,.12);
    }

    .dc-auth-button {
      width: 100%;
      min-height: 52px;
      margin-top: 22px;
      border: 0;
      border-radius: 14px;
      cursor: pointer;
      background: linear-gradient(135deg, #f2d188, #d4a24c);
      color: #090a28;
      font-size: 16px;
      font-weight: 800;
      box-sizing: border-box;
    }

    .dc-auth-button:hover {
      filter: brightness(1.05);
    }

    .dc-auth-button:disabled {
      opacity: .65;
      cursor: wait;
    }

    .dc-auth-cta,
    .dc-auth-cta:visited {
      display: flex;
      width: 100%;
      min-height: 54px;
      align-items: center;
      justify-content: center;
      margin-top: 28px;
      border-radius: 14px;
      background: linear-gradient(135deg, #f2d188, #d4a24c);
      color: #090a28 !important;
      font-size: 16px;
      font-weight: 800;
      text-decoration: none !important;
      box-sizing: border-box;
      box-shadow: 0 14px 34px rgba(212,162,76,.16);
      transition: transform .15s ease, filter .15s ease;
    }

    .dc-auth-cta:hover {
      transform: translateY(-1px);
      filter: brightness(1.05);
    }

    .dc-auth-link,
    .dc-auth-link:visited {
      display: block;
      margin-top: 18px;
      color: #f0c75e !important;
      text-decoration: none !important;
      font-weight: 700;
      text-align: center;
      cursor: pointer;
    }

    .dc-auth-link:hover {
      text-decoration: underline !important;
    }

    .dc-auth-error {
      margin-top: 16px;
      padding: 12px 14px;
      border-radius: 12px;
      background: rgba(190,50,50,.13);
      border: 1px solid rgba(255,120,120,.22);
      color: #ffd2d2;
      font-size: 14px;
      line-height: 1.4;
    }

    .dc-auth-account {
      margin: 18px 0 0;
      color: #aeb1c8;
      font-size: 13px;
      word-break: break-word;
      text-align: center;
    }

    /* =========================================================
   SIDEBAR DIGITAL CARMELO
========================================================= */

.dc-account {
  position: fixed;
  inset: 0 auto 0 0;
  z-index: 100000;
  width: 64px;
  background: linear-gradient(
    180deg,
    #0b0d27 0%,
    #111336 100%
  );
  border-right: 1px solid rgba(212,162,76,.24);
  box-shadow: 8px 0 30px rgba(0,0,0,.16);
  font-family: Inter, system-ui, sans-serif;
  overflow: hidden;
  transition: width .22s ease;
}

.dc-account.is-open {
  width: 280px;
}

body.dc-sidebar-active #app {
  width: calc(100% - 64px);
  margin-left: 64px;
  transition:
    width .22s ease,
    margin-left .22s ease;
  box-sizing: border-box;
}

body.dc-sidebar-active.dc-sidebar-expanded #app {
  width: calc(100% - 280px);
  margin-left: 280px;
}

.dc-account__button {
  width: 100%;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 0;
  border: 0;
  border-bottom: 1px solid rgba(255,255,255,.08);
  background: transparent;
  color: #f2d188;
  cursor: pointer;
  font: inherit;
  font-weight: 800;
}

.dc-account__button:hover {
  background: rgba(212,162,76,.08);
}

.dc-account__brand {
  flex: 0 0 auto;
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(212,162,76,.42);
  border-radius: 12px;
  background: rgba(212,162,76,.10);
  color: #f2d188;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 15px;
  font-weight: 800;
}

.dc-account__button-text {
  display: none;
  white-space: nowrap;
  color: #f2d188;
  font-size: 14px;
}

.dc-account.is-open .dc-account__button {
  justify-content: flex-start;
  padding: 0 13px;
}

.dc-account.is-open .dc-account__button-text {
  display: inline;
}

.dc-account__panel {
  height: calc(100vh - 64px);
  display: flex;
  flex-direction: column;
  padding: 18px 12px;
  box-sizing: border-box;
  opacity: 0;
  visibility: hidden;
  transition: opacity .15s ease;
}

.dc-account__close {
  position: absolute;
  top: 76px;
  right: 12px;
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(255,255,255,.12);
  border-radius: 50%;
  background: rgba(255,255,255,.04);
  color: #f2d188;
  font: inherit;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}

.dc-account__close:hover,
.dc-account__close:focus-visible {
  background: rgba(212,162,76,.12);
  outline: none;
}

.dc-account.is-open .dc-account__panel {
  opacity: 1;
  visibility: visible;
}

.dc-account__product {
  margin: 0 0 18px;
  padding: 0 8px 16px;
  border-bottom: 1px solid rgba(255,255,255,.08);
}

.dc-account__product-kicker {
  margin: 0 0 5px;
  color: #d4a24c;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: .13em;
  text-transform: uppercase;
}

.dc-account__product-name {
  margin: 0;
  color: #fff;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 17px;
  line-height: 1.25;
}

.dc-account__label {
  margin: 0 8px 5px;
  color: #aeb1c8;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .08em;
}

.dc-account__email {
  margin: 0 8px 16px;
  color: #fff;
  font-size: 12px;
  line-height: 1.45;
  word-break: break-word;
}

.dc-account__link,
.dc-account__logout {
  width: 100%;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 9px;
  margin-top: 8px;
  padding: 0 12px;
  border-radius: 11px;
  box-sizing: border-box;
  font-family: inherit;
  font-size: 13px;
  font-weight: 700;
  text-decoration: none;
  cursor: pointer;
}

.dc-account__link {
  border: 1px solid rgba(255,255,255,.10);
  background: rgba(255,255,255,.035);
  color: #f2d188;
}

.dc-account__link:hover {
  background: rgba(212,162,76,.10);
}

.dc-account__logout {
  margin-top: auto;
  border: 1px solid rgba(255,255,255,.10);
  background: transparent;
  color: #c7c9d8;
}

.dc-account__logout:hover {
  border-color: rgba(212,162,76,.35);
  color: #f2d188;
}

.dc-account__logout:disabled {
  opacity: .6;
  cursor: wait;
}

@media (max-width: 700px) {
  .dc-account {
    width: 52px;
  }

  .dc-account.is-open {
    width: min(86vw, 300px);
  }

  body.dc-sidebar-active #app,
  body.dc-sidebar-active.dc-sidebar-expanded #app {
    width: calc(100% - 52px);
    margin-left: 52px;
  }

  .dc-account__button {
    height: 56px;
  }

  .dc-account__panel {
    height: calc(100vh - 56px);
  }

  .dc-account__brand {
    width: 34px;
    height: 34px;
  }
}

    .dc-password-wrap {
      position: relative;
    }

    .dc-password-wrap .dc-auth-input {
      padding-right: 54px;
    }

    .dc-password-toggle {
      position: absolute;
      top: 50%;
      right: 8px;
      width: 42px;
      height: 42px;
      display: flex;
      align-items: center;
      justify-content: center;
      transform: translateY(-50%);
      border: 0;
      border-radius: 10px;
      background: transparent;
      color: #bfc2d5;
      cursor: pointer;
      z-index: 2;
      padding: 0;
      line-height: 0;
      touch-action: manipulation;
    }

    .dc-password-toggle:hover {
      color: #f2d188;
      background: rgba(255,255,255,.05);
    }

    .dc-password-toggle svg {
      width: 21px;
      height: 21px;
      pointer-events: none;
    }

   @media (max-width: 600px) {
  .dc-auth-card {
    padding: 30px 22px;
    border-radius: 20px;
  }

  .dc-auth-title {
    font-size: clamp(30px, 10vw, 38px);
  }
}
`;

  document.head.appendChild(style);
}

/* =========================================================
   MI CUENTA
========================================================= */


function mountAccountMenu(email = "") {
  if (document.getElementById("dc-account")) return;

  document.body.classList.add("dc-sidebar-active");

  const wrapper = document.createElement("aside");

  wrapper.id = "dc-account";
  wrapper.className = "dc-account";

  wrapper.innerHTML = `
    <button
      type="button"
      class="dc-account__button"
      id="dc-account-toggle"
      aria-label="Abrir menú Digital Carmelo"
      aria-expanded="false"
      aria-controls="dc-account-panel"
      title="Menú Digital Carmelo"
    >
      <span class="dc-account__brand">DC</span>

      <span class="dc-account__button-text">
        Mi cuenta
      </span>
    </button>

    <div class="dc-account__panel" id="dc-account-panel">

      <button
        type="button"
        class="dc-account__close"
        id="dc-account-close"
        aria-label="Cerrar menú Digital Carmelo"
        title="Cerrar"
      >×</button>

      <div class="dc-account__product">
        <p class="dc-account__product-kicker">
          DIGITAL CARMELO
        </p>

        <p class="dc-account__product-name">
          Revelado DC
        </p>
      </div>

      <p class="dc-account__label">
        Sesión iniciada como
      </p>

      <p
        class="dc-account__email"
        id="dc-account-email"
      ></p>

      <a
        class="dc-account__link"
        href="${SUITE_URL}"
      >
        ← Volver a la Suite
      </a>

      <button
        type="button"
        class="dc-account__link"
        id="dc-recover-legacy"
        hidden
      >Recuperar mis ajustes anteriores</button>

      <button
        type="button"
        class="dc-account__logout"
        id="dc-account-logout"
      >
        Cerrar sesión
      </button>

    </div>
  `;

  document.body.appendChild(wrapper);

  const emailElement =
    document.getElementById("dc-account-email");

  if (emailElement) {
    emailElement.textContent =
      email || "Usuario Digital Carmelo";
  }

  const toggle =
    document.getElementById("dc-account-toggle");

  const logout =
    document.getElementById("dc-account-logout");

  const close =
    document.getElementById("dc-account-close");

  function setMenuOpen(opening) {
    wrapper.classList.toggle("is-open", opening);
    document.body.classList.toggle("dc-sidebar-expanded", opening);
    toggle?.setAttribute("aria-expanded", String(opening));
    toggle?.setAttribute(
      "aria-label",
      opening
        ? "Cerrar menú Digital Carmelo"
        : "Abrir menú Digital Carmelo"
    );
  }

  toggle?.addEventListener("click", () => {
    setMenuOpen(!wrapper.classList.contains("is-open"));
  });

  close?.addEventListener("click", () => {
    setMenuOpen(false);
    toggle?.focus();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && wrapper.classList.contains("is-open")) {
      setMenuOpen(false);
      toggle?.focus();
    }
  });

  logout?.addEventListener("click", async () => {
    logout.disabled = true;
    logout.textContent = "Cerrando...";

    const { error } =
      await supabase.auth.signOut();

    if (error) {
      console.error(
        "Error cerrando sesión:",
        error
      );

      logout.disabled = false;
      logout.textContent = "Cerrar sesión";

      alert(
        "No pudimos cerrar la sesión. Intenta nuevamente."
      );

      return;
    }

    window.location.reload();
  });

  enhanceMobileAccount();
  window.dispatchEvent(new Event('dc:account-mounted'));
}

/* =========================================================
   LOGIN
========================================================= */


export function startAuth(onAuthorized) {
const auth = createProductAuth({
  onAuthorized,
  supabase,
  productSlug: "editor-fotos-dc",
  returnUrl: "https://editor-fotos-dc.netlify.app/",
  authTitle: "Revelado DC",
  whatsappUrl: "https://wa.me/5491176508119?text=" + encodeURIComponent("Hola Digital Carmelo, quiero conocer las opciones de Revelado DC."),
  injectStyles,
  mountAccountMenu,
  
});
return auth;
}


import "./password-feedback.js";

