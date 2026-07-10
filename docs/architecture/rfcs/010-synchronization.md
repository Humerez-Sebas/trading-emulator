# RFC 010: Synchronization

## Objetivo
Implementar la sincronizacion tactica entre paneles agrupados: grupos de enlace
(`LinkGroup`), sincronizacion de crosshair y de rango visible de tiempo, y el fan-out del
reloj de replay unificado hacia todos los paneles de la Sesion. Completar el `ChartSyncBus`
introducido como esqueleto en RFC-008, enrutando eventos acotados por `linkGroupId`.

## Motivacion
Con el host de paneles (RFC-008) y el ciclo de vida dinamico (RFC-009) en su lugar, la
Sesion puede mostrar N paneles simultaneos, pero sin sincronizacion cada panel es una isla:
mover el crosshair en uno no se refleja en los demas, y el avance del replay no tiene una
nocion unificada entre paneles de distinto simbolo/timeframe. El Documento de Vision exige
un unico reloj de replay global (no N relojes independientes) con proyeccion por panel, y
grupos de enlace opcionales para crosshair y rango de tiempo. El riesgo central de cualquier
sistema de sincronizacion bidireccional entre N observadores es el bucle de
retroalimentacion (panel A mueve a B, B mueve a A, A vuelve a moverse...); este RFC dedica su
seccion de decision principalmente a prevenir ese bucle mediante etiquetado de origen y
aplicacion idempotente, en vez de asumir que "no volver a emitir hacia el emisor original" es
suficiente (no lo es en topologias de grupo con 3+ paneles).

## Decision Arquitectonica
1. **Reducer de `LinkGroup`.**
   - Estado runtime/persistido (`SessionPayloadV2.linkGroups`, ver RFC-011): lista de
     `LinkGroup { id, color, syncCrosshair, syncTimeRange, syncPriceScale? }`.
   - Operaciones: crear grupo, eliminar grupo, asignar/desasignar un panel a un grupo
     (actualiza `PanelDescriptor.linkGroupId`, ya transportado por `PanelRegistry` desde
     RFC-009), togglear `syncCrosshair`/`syncTimeRange` por grupo.
   - Un panel pertenece a lo sumo a un `LinkGroup` (`linkGroupId: string | null`); no hay
     membresia multiple. Esto simplifica el enrutado del bus (punto 2) al evitar que un evento
     deba propagarse a traves de multiples grupos superpuestos.

2. **`syncPriceScale` es un campo RESERVADO, explicitamente NO implementado (R3).**
   - La interfaz `LinkGroup` incluye `syncPriceScale?: boolean` para no requerir una migracion
     de esquema futura cuando se decida implementarlo, pero RFC-010 no le da ningun
     comportamiento: el reducer puede aceptar el campo (para no romper la forma del tipo) pero
     ningun componente lo lee ni lo aplica. Esto es una decision de alcance explicita del
     Documento de Vision, no un olvido — debe quedar asi de claro en cualquier code review de
     este RFC: si alguien implementa `syncPriceScale` como parte de este RFC, esta fuera de
     alcance y debe extraerse a un RFC futuro dedicado.

3. **Enrutado de `ChartSyncBus` acotado por grupo.**
   - El `ChartSyncBus` (esqueleto de RFC-008) gana su primera logica real: al recibir un
     evento de un panel (`crosshairMove`, `visibleRangeChange`) con un `panelId` dado, el bus
     resuelve el `linkGroupId` de ese panel via `PanelRegistry`/`LinkGroup` state, y reenvia el
     evento unicamente a los demas paneles con el mismo `linkGroupId` (nunca a paneles sin
     grupo, nunca a paneles de otro grupo).
   - Paneles sin `linkGroupId` (`null`) no participan en ningun enrutado de sync; se comportan
     exactamente como en RFC-008/009, de forma aislada.

4. **Sincronizacion de crosshair y de rango visible de tiempo.**
   - `syncCrosshair`: al mover el crosshair en un panel del grupo, los demas paneles del mismo
     grupo reciben la posicion temporal (timestamp) y proyectan su propio crosshair al punto
     mas cercano en su propia serie (que puede tener distinto timeframe); no se asume indices
     de vela compartidos entre paneles de distinto timeframe.
   - `syncTimeRange`: al hacer pan/zoom en un panel del grupo, los demas paneles del mismo
     grupo ajustan su `visibleRange` (`PanelRuntime.visibleRange`, D4) al mismo rango temporal
     absoluto, cada uno proyectandolo a su propia escala/timeframe.

5. **Fan-out del reloj de replay unificado sobre `selectReplayIndex` (D5).**
   - El reloj de replay sigue siendo unico y global a nivel de Sesion (no hay N relojes
     independientes): el cursor de replay existente y `selectReplayIndex` (busqueda binaria
     at-or-before-T, ya auditado) se reutilizan sin modificacion como fuente de verdad del
     tiempo actual.
   - Cada panel proyecta el cursor global hacia su propia serie invocando
     `selectReplayIndex` parametrizado por su propio `symbol`/`timeframe`, obteniendo el indice
     at-or-before-T correspondiente a SU serie. Esto es fan-out por proyeccion, no
     replicacion de un indice compartido: dos paneles con distinto timeframe del mismo simbolo
     tendran, en general, distintos indices de vela para el mismo instante T.
   - **Freeze-on-last para simbolos con gap (D5):** si el instante T del reloj global cae fuera
     del rango de datos disponible de un panel (el simbolo secundario de ese panel tiene un gap
     o no tiene datos hasta T, p. ej. una sesion de mercado distinta), ese panel congela su
     render en la ultima vela valida at-or-before-T conocida, en vez de mostrar un estado vacio
     o extrapolar. El panel se descongela automaticamente cuando T vuelve a caer dentro de su
     rango de datos.

6. **Prevencion de bucles de retroalimentacion: eventos con origen etiquetado + aplicacion
   idempotente.**
   - Todo evento que viaja por `ChartSyncBus` lleva un `originPanelId` (el panel que disparo la
     interaccion del usuario) ademas del payload de sync.
   - Un panel que recibe un evento de sync **nunca reemite** un evento de sync equivalente hacia
     el bus como reaccion a haber aplicado ese cambio (aplicar un rango sincronizado no dispara
     un nuevo `visibleRangeChange` saliente); solo las interacciones directas del usuario
     (drag, scroll, click) originan nuevos eventos hacia el bus.
   - Adicionalmente, la aplicacion del cambio en cada panel receptor es idempotente: aplicar el
     mismo `visibleRange`/timestamp de crosshair dos veces seguidas no produce un segundo
     evento ni un segundo re-render (short-circuit referencial, reutilizando el mismo principio
     que la suite de regresion P1 ya valida sobre el short-circuit de `chartStyle$`). La
     combinacion de "no reemitir tras recibir" + "aplicacion idempotente" cierra el bucle de
     retroalimentacion incluso en grupos de 3 o mas paneles, donde depender unicamente de "no
     reenviar al emisor original" no es suficiente (A mueve B, B no reenvia a A, pero si C esta
     en el mismo grupo y algo reenvia a C sin idempotencia, C podria re-disparar hacia A y B).

7. **Alcance explicitamente fuera de RFC-010:** implementacion real de `syncPriceScale`
   (reservado, punto 2); persistencia de `LinkGroup[]` en `SessionPayloadV2` (RFC-011, aunque
   el reducer de este RFC ya produce la forma de estado que RFC-011 serializara);
   optimizaciones de rendimiento del fan-out a 8 paneles (RFC-012 perfila y optimiza solo
   brechas medidas).

## Impacto
- **Positivo:** Habilita el caso de uso central del bloque multi-chart — analizar un simbolo
  en varios timeframes sincronizados, o comparar simbolos correlacionados con crosshair
  compartido — sin tocar el motor `ChartEngine` ni el cursor de replay ya auditados.
- **Riesgo:** Bucles de retroalimentacion de sync en grupos de 3+ paneles. Mitigacion: ver
  punto 6 (origen etiquetado + idempotencia), con tests dedicados que arment grupos de 3+
  paneles enlazados y verifiquen, via contador de eventos emitidos al bus, que una unica
  interaccion de usuario produce exactamente un evento de sync saliente y N-1 aplicaciones
  entrantes, sin ciclos.
- **Riesgo:** Simbolos con datos discontinuos (gaps) rompiendo la proyeccion del reloj global.
  Mitigacion: freeze-on-last (punto 5), verificado con series de test que contengan gaps
  deliberados.

## Estado Esperado
Al finalizar, el emulador compilara con `npx tsc -p tsconfig.app.json --noEmit` sin errores;
un grupo de enlace con `syncCrosshair`/`syncTimeRange` activos propagara correctamente
crosshair y rango visible entre sus paneles miembro (verificable con tests de integracion
sobre el reducer de `LinkGroup` + `ChartSyncBus`); el avance del reloj de replay global
actualizara todos los paneles via `selectReplayIndex` proyectado por panel, con los paneles de
simbolos con gap congelados correctamente en freeze-on-last; y un test de regresion
demostrara ausencia de bucles infinitos/re-render en cascada en un grupo de al menos 3
paneles enlazados tras una unica interaccion de usuario.
