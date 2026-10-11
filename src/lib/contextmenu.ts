export function suppressContextMenu() {
  document.addEventListener("contextmenu", (e) => e.preventDefault());
}
