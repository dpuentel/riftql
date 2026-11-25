**RiftQL** es una elección sólida: corto, memorable, fácil de teclear en la terminal y con una carga visual muy clara para construir identidad.

---

## 1. Origen y narrativa del nombre

El nombre combina dos conceptos técnicos en una sola palabra:

* **Rift (Brecha / Portal):** En física y ciencia ficción, un *rift* es una apertura que conecta dos puntos distantes de forma instantánea. En tu app tiene una doble lectura:
1. **Velocidad sin fricción:** Un acceso directo desde tu teclado hasta tus endpoints, sin la pesadez de clientes tradicionales basados en Electron.
2. **Puente entre dos mundos:** Unifica la brecha histórica entre herramientas **REST** (Postman) y **GraphQL** (Altair) en un solo espacio de trabajo.


* **QL (Query Language):** Referencia directa a GraphQL, pero extendida a la acción universal de consultar (*query*) cualquier API.

**Uso tipográfico del nombre:**

* **Marca y marketing:** `RiftQL` (la `R` y `QL` en mayúscula equilibran la lectura y refuerzan el carácter técnico).
* **CLI, repositorios, URLs y paquetes:** `riftql` (siempre en minúsculas).

---

## 2. Identidad visual (Estética Linear / Raycast)

La regla de oro es que **la interfaz desaparezca para que el código y los datos sean los protagonistas**.

### Concepto de logotipo (Icono)

Evita iconos literales (cohetes, sobres, rayos genéricos). El concepto de *Rift* funciona muy bien con geometría minimalista:

* **Idea principal:** Dos formas geométricas limpias (un cuadrado redondeado o un hexágono) separadas por un **corte diagonal fino** que deja pasar un haz de luz (el color de acento).
* **Requisitos técnicos:** Debe leerse perfectamente a `16×16px` (favicon y barra de menú) y funcionar en blanco puro o negro puro (monocromo).

### Paleta de colores (Dark-first)

Diseña primero en Modo Oscuro usando grises pizarra fríos (evitando el negro puro `#000000` para reducir fatiga visual) y reserva el color únicamente para acciones primarias y semántica HTTP.

| Rol | Modo Oscuro (Hex) | Modo Claro (Hex) | Uso |
| --- | --- | --- | --- |
| **Fondo base** | `#09090B` | `#FAFAFA` | Lienzo principal y sidebar |
| **Superficie elevada** | `#121316` | `#FFFFFF` | Editores, modales, pestañas activas |
| **Bordes sutiles** | `#27272A` | `#E4E4E7` | Separadores de `1px` (sin sombras pesadas) |
| **Acento (El "Rift")** | `#8B5CF6` (Violeta) | `#7C3AED` | Botón *Send*, *focus rings*, pestaña activa |
| **Texto primario** | `#F4F4F5` | `#09090B` | Títulos, código principal |
| **Texto secundario** | `#A1A1AA` | `#71717A` | Labels, placeholders, atajos de teclado |

**Semántica de métodos (colores desaturados para no saturar la vista):**

* `GET`: Verde esmeralda (`#34D399`)
* `POST`: Ámbar (`#FBBF24`)
* `PUT` / `PATCH`: Azul cielo (`#60A5FA`)
* `DELETE`: Rojo coral (`#F87171`)
* `GQL`: Magenta (`#E879F9`)

### Tipografía

* **Interfaz (UI):** `Inter` o `Geist Sans`. Alta legibilidad en tamaños compactos (`12px`–`13px`) para lograr alta densidad de información sin ruido.
* **Código, URLs y métricas:** `JetBrains Mono` o `Geist Mono`. Activa `font-variant-numeric: tabular-nums` en los indicadores de tiempo (`ms`) y tamaño (`KB`) para que los números no "salten" al actualizarse.

---

## 3. Tono de voz y personalidad

RiftQL debe sentirse como una herramienta construida por ingenieros para ingenieros: **rápida, silenciosa y respetuosa con tu tiempo**.

* **Sí es:** Directo, técnico, preciso, minimalista.
* **No es:** Corporativo, ruidoso, lleno de pop-ups promocionales ni con mascotas animadas.
* **Microcopy (UI):** Corto y funcional. En lugar de *"¡Vaya! Parece que aún no has creado ninguna colección"*, usa *"No collections yet. Press `Cmd+N` to create one."*

**Ejemplos de tagline (para GitHub / web):**

* *"The local-first API client for REST & GraphQL."*
* *"Instant launch. Zero bloat. Built for keyboard-first workflows."*
* *"One fast workspace for REST and GraphQL."*