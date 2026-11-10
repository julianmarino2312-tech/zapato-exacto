# Zapato Exacto

App de celular para contar cartas de baccarat. Calcula la probabilidad exacta de la próxima mano con las cartas que quedan en el zapato, sugiere apuestas solo cuando tienen ventaja matemática y dice cuánto apostar (método Kelly).

Funciona sin internet una vez instalada.

## Qué hay en esta carpeta

| Archivo | Para qué sirve |
|---|---|
| `index.html` | La app (lo que se publica). **No editar a mano**: se genera desde `src/app.html`. |
| `sw.js` | Hace que la app funcione sin internet. Se genera solo. |
| `manifest.webmanifest` | Nombre, ícono y modo pantalla completa de la app. |
| `icons/` | Íconos de la app (incluye el de iPhone). |
| `src/app.html` | El código de la app. Aquí se hacen los cambios. |
| `tools/` | Motor de cálculo, simuladores y sus resultados. |

## Publicarla en GitHub Pages (una sola vez)

1. Entra a [github.com](https://github.com) y crea una cuenta si no tienes.
2. Arriba a la derecha: **+ → New repository**. Nombre: `zapato-exacto`. Elige **Public** y pulsa **Create repository**.
3. En la página del repositorio nuevo, pulsa **uploading an existing file**.
4. Arrastra a la página **todo el contenido** de esta carpeta (`index.html`, `sw.js`, `manifest.webmanifest`, `README.md` y las carpetas `icons`, `src` y `tools`). Pulsa **Commit changes**.
5. Ve a **Settings → Pages**. En *Branch* elige `main` y carpeta `/ (root)`, y pulsa **Save**.
6. Espera 1–2 minutos. Arriba de esa misma página aparece la dirección, algo como `https://TU-USUARIO.github.io/zapato-exacto/`.

## Instalarla en el iPhone

1. Abre esa dirección en **Safari** (no en Chrome).
2. Toca el botón **Compartir** (el cuadrado con la flecha hacia arriba).
3. Baja y toca **Agregar a pantalla de inicio** → **Agregar**.
4. Abre la app desde el ícono nuevo. La primera vez necesita internet; después funciona sin conexión.

Nota: lo que guardes en la app (tu mesa, el zapato en curso) se queda en ese iPhone. Si la abres en Safari normal en vez de desde el ícono, verás datos separados.

## Hacer cambios después

1. Edita `src/app.html`.
2. En la Terminal, dentro de esta carpeta: `node tools/build.js` (regenera `index.html` y `sw.js`).
3. Sube a GitHub los archivos que cambiaron (`index.html`, `sw.js`, `src/app.html`).
4. En el iPhone, abre la app con internet. Se actualiza sola (a veces hace falta cerrarla y abrirla una segunda vez).

## Volver a correr las simulaciones

```bash
node tools/simulator.js --hands 2500000 --cuts 14,52,104,156 --out tools/results.json
node tools/bankroll-sim.js --pool 20000 --players 2000 --shoes 300 --cuts 14,52 --out tools/bankroll.json
```

## Aviso

La ventaja que encuentra la app es pequeña, poco frecuente y con mucha varianza, y depende de dónde corte el casino el zapato. No garantiza ganancias. En muchas jurisdicciones está prohibido usar dispositivos de conteo en la mesa de un casino.
