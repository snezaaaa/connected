/**
 * Navigacija nakon prijave/odjave. Ekran koji je poziva se tada demontira
 * (mijenja se skup ruta), pa React Router `navigate` iz njega ne bi uspio.
 */
export function go(path: string) {
  setTimeout(() => {
    window.location.hash = '#' + path
  }, 30)
}
