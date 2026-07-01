# RFC 005: Drawings Capability

## Objetivo
Aislar la visualización e interacciones de las herramientas de dibujo (líneas, rectángulos, niveles de Fibonacci, reglas de medición) en un plugin nativo del `ChartEngine` implementando la interfaz `Capability` de RFC-003.

## Motivación
Actualmente, las lógicas de dibujado de dibujos y hit-testing (`drawings-primitive.ts`) se invocan de forma imperativa desde el `ChartComponent` o están acopladas a estados de visualización locales. Mover esta lógica a un plugin modular e independiente mantiene al `ChartEngine` limpio, simplifica la lógica del `ChartComponent`, y cumple con el principio Abierto/Cerrado (OCP).

## Decisión Arquitectónica
1. **Migración a Capability**: Crear `DrawingsCapability` en `emulador/src/app/domain/chart/capabilities/drawings-capability.ts` implementando la interfaz `Capability` (`emulador/src/app/domain/chart/capability.ts`).
2. **Inyección por Constructor**: Al igual que `TradingCapability`, la `DrawingsCapability` recibirá la serie principal (`ISeriesApi<'Candlestick'>`) a través de su constructor al instanciarse en el `ChartComponent`.
3. **Ciclo de Vida**:
   * Su método `init(chart: IChartApi, bus: ChartEventBus)` se invocará al registrar la capability con `engine.registerCapability(...)`. Adjuntará el `DrawingsPrimitive` a la serie de velas.
   * Su método `render(model: Partial<RenderModel>)` recibirá las actualizaciones. La capability actualizará el source del `DrawingsPrimitive` basándose en `model.drawings` (de tipo `DrawingsModel`), realizando comparaciones superficiales antes de disparar re-renderizados.
   * Su método `destroy()` removerá de la serie el `DrawingsPrimitive` y marcará la capability como destruida empleando una bandera de idempotencia (`destroyed`).
4. **Expansión del RenderModel**: Ampliar `RenderModel` (`emulador/src/app/domain/chart/render-model.ts`) con una propiedad opcional `drawings?: DrawingsModel` que agrupe los dibujos del estado, la herramienta activa (`activeTool`), el dibujo seleccionado (`selectedId`), el borrador (`draft`), y los datos de anclaje temporal (`shift`, `times`, `barSpacing`, `pointSize`) necesarios para proyectar coordenadas en pantalla.
5. **Delegación de Hit-Testing y Conversión Temporal**:
   * Para evitar acoplamiento directo entre el componente y la primitiva, la `DrawingsCapability` expondrá métodos públicos puente:
     * `hitTestDrawing(x: number, y: number): string | null`
     * `hitTestHandle(x: number, y: number): 'p1' | 'p2' | null`
     * `timeForX(x: number): number | null`
     * `xForTime(timeUtc: number): number | null`
   * El `ChartComponent` obtendrá la capability desde el motor mediante `engine.getCapability<DrawingsCapability>('drawings')` para invocar estos métodos durante los eventos de click, hover y arrastre.

## Impacto
- **Positivo**: Desacoplamiento total de la capa de dibujo, permitiendo tests unitarios aislados sobre la proyección e interactividad de herramientas de análisis gráfico.

## Riesgos y Mitigaciones
- **Latencia percibida**: Las interacciones de arrastre de coordenadas y previsualización de trazos (draft) se despachan síncronamente al store local y se renderizan a través del pipeline del `ChartEngine` de forma eficiente, mitigando cualquier desfase visual.
