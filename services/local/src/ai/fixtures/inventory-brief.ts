/** Fixture brief for the inventory vertical slice (used by `npm run ai:smoke`). */
export const INVENTORY_BRIEF = `# Inventario del jugador

El inventario muestra los objetos del jugador en una cuadrícula de 5 columnas por 4 filas.
Los objetos se organizan en pestañas por categoría: Armas, Armaduras, Consumibles y Materiales.
Los objetos iguales se apilan hasta 99 unidades y la casilla muestra la cantidad.
El jugador puede arrastrar un objeto a otra casilla para moverlo, y soltarlo sobre una pila igual para fusionarlas.
Con clic derecho sobre un objeto se abre un menú contextual con las acciones Usar, Equipar y Tirar.
Una pila se puede dividir en dos con la acción Dividir.
El equipamiento (cabeza, pecho, piernas, arma y mano izquierda) se ve a la derecha de la cuadrícula.
Pasar el cursor sobre un objeto muestra un tooltip con su nombre, rareza y descripción.
El diseño debe funcionar con ratón y con mando.
`;
