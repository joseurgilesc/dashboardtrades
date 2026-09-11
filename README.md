# Diario de Trading

Aplicación web **estática** para registrar y analizar operaciones de trading. Reemplaza la antigua hoja de cálculo con macros por una interfaz clara, rápida y sin dependencias externas.

- HTML, CSS y JavaScript puros (vanilla). Sin frameworks, sin proceso de compilación, sin backend y sin llamadas de red.
- Los gráficos usan [Chart.js](https://www.chartjs.org/) 4.4.4, ya incluido localmente en `vendor/chart.umd.js`.
- Funciona tanto al abrirla directamente desde el disco como publicada en GitHub Pages.

## Cómo abrirla en local

1. Descarga o clona esta carpeta.
2. Haz doble clic en `index.html` (o arrástralo a tu navegador).

No necesitas servidor, Node ni ninguna herramienta adicional. La aplicación funciona directamente con el protocolo `file://`.

> Consejo: para una experiencia óptima usa un navegador moderno (Chrome, Edge, Firefox o Safari actualizados).

## Dónde se guardan los datos

Todos los datos (trades, saldos iniciales y ajustes) se guardan **únicamente en tu navegador**, en el `localStorage` con la clave `bpt.journal.v1`.

- Son **privados**: no se envían a ningún servidor.
- Son **por dispositivo y por navegador**: si abres la app en otro equipo o en otro navegador, verás datos distintos.
- Si borras los datos del navegador (caché/almacenamiento del sitio), se perderá la información.

## Cómo hacer copias de seguridad

En la pestaña **Ajustes** tienes:

- **Exportar JSON**: descarga un archivo con todos los trades, saldos y ajustes. Es el formato recomendado para respaldos completos y para restaurar exactamente el mismo estado.
- **Importar JSON**: carga un respaldo previo (reemplaza los datos actuales).
- **Exportar CSV**: descarga los trades en formato de hoja de cálculo, útil para análisis externo.
- **Cargar datos de ejemplo**: inserta 8 trades de demostración.
- **Borrar todo**: elimina todos los trades y restablece los saldos iniciales (pide confirmación).

**Recomendación:** exporta un JSON con regularidad. Para mover tus datos entre dispositivos, exporta el JSON en el equipo de origen e impórtalo en el equipo de destino.

## Publicar en GitHub Pages

1. Crea un repositorio nuevo en GitHub, por ejemplo `trading-journal`.

2. En una terminal, dentro de esta carpeta, ejecuta:

   ```bash
   git init
   git add .
   git commit -m "feat: trading journal"
   git branch -M main
   git remote add origin https://github.com/<usuario>/trading-journal.git
   git push -u origin main
   ```

3. En GitHub, entra en el repositorio y ve a **Settings → Pages**.

4. En **Source**, selecciona **Deploy from a branch**. En **Branch** elige `main` y la carpeta `/ (root)`. Pulsa **Save**.

5. Espera uno o dos minutos. La web quedará publicada en:

   ```
   https://<usuario>.github.io/trading-journal/
   ```

## Privacidad al publicar

El sitio es público (cualquiera puede abrir la página), pero **tus datos no se suben a GitHub**: viven en el `localStorage` de tu navegador. Cada persona que entre verá su propio diario vacío. Para trasladar tu diario entre dispositivos usa **Exportar / Importar JSON**.

## Estructura del proyecto

```
trading-journal/
├── index.html
├── css/
│   └── styles.css
├── js/
│   ├── instruments.js   # Datos de referencia (instrumentos, cuentas, estrategias, emociones...)
│   ├── store.js         # Persistencia, cálculos, KPIs e importación/exportación
│   ├── charts.js        # Gráficos del dashboard (Chart.js)
│   └── app.js           # Interfaz: formulario, tabla, filtros, pestañas
├── vendor/
│   └── chart.umd.js     # Chart.js 4.4.4 (incluido localmente)
└── README.md
```

## Reglas de cálculo

Para cada trade:

- `puntos = (Largo) ? salida − entrada : entrada − salida`
- `bruto = puntos × contratos × valor del punto`
- `comisión = comisión del instrumento × contratos`
- `neto = bruto − comisión`
- El **acumulado** es la suma corrida del neto, ordenada por fecha/hora de entrada ascendente.
- El **saldo** de cada cuenta es el saldo inicial más la suma del neto de sus trades.
- Se considera **ganador** cuando `neto > 0` y **perdedor** cuando `neto <= 0`.
