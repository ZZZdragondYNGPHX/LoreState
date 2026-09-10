import 'https://testingcf.jsdelivr.net/gh/ZZZdragondYNGPHX/LoreState@0.10.0/artifact/bundle.js';

(() => {
  const id = 'lorestate-checkbox-padding-fix';
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = `
#lorestate-state-manager label input[type="checkbox"] {
  padding: 0 !important;
}
`;
  (document.head || document.documentElement).append(style);
})();
