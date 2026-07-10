# RFC 011: Workspace Layout Persistence

## Objetivo
Persistir y restaurar el estado completo del workspace multi-panel — pestañas, grids,
paneles, dibujos por simbolo y grupos de enlace — extendiendo el ciclo de sincronizacion LWW
existente (Supabase + IndexedDB) sin duplicarlo. Introducir `SessionPayloadV2` y su migracion
versionada desde `SessionPayloadV1`.

## Motivacion
RFC-008 a RFC-010 construyen el sistema multi-panel completo en memoria/runtime: layout,
ciclo de vida de paneles y sincronizacion entre ellos. Ninguno de esos RFCs persiste su
estado. Sin persistencia, cerrar la aplicacion o cambiar de dispositivo pierde todo el
workspace configurado, lo cual es inaceptable para una herramienta de uso diario. El sistema
de persistencia de Sesion ya existente (`SessionPayloadV1`, Supabase JSONB + IndexedDB como
cache + resolucion LWW) fue disenado y probado para un modelo mono-core (un simbolo activo,
dibujos como array plano). RFC-011 extiende ese payload a V2 en vez de crear un segundo
mecanismo de persistencia paralelo — el Documento de Vision es explicito en que el riesgo
principal a evitar es la desincronizacion entre dos ciclos de sync independientes (p. ej. uno
para trading/dibujos y otro para layout), que abriria una ventana de inconsistencia entre
"la sesion dice que el panel X existe" y "el layout todavia referencia al panel X ya
eliminado". Por eso la decision arquitectonica central de este RFC es la atomicidad de un
unico payload.

## Decision Arquitectonica
1. **`SessionPayloadV2`: un unico payload extendido, no un payload paralelo.**
   ```ts
   interface SessionPayloadV2 {
     schemaVersion: 2;
     primarySymbol: string;                                   // unico simbolo operable (D1)
     // ...todos los campos V1: trading, currentTime, activeTf, replayResolution, ranges...
     drawings: Record<string /*symbol*/, DrawingCollection>;   // (R2)(D3) antes Drawing[]
     layout: WorkspaceLayout;                                  // (D2)
     linkGroups: LinkGroup[];                                  // (D4)
   }
   ```
   - `primarySymbol` reemplaza cualquier nocion de "simbolo activo por panel" a nivel de
     persistencia de trading: la Sesion sigue operando un unico simbolo (D1); los paneles de
     simbolo secundario (vistos en otros `PanelDescriptor.symbol`) son estrictamente
     view-only y no participan en `trading`/`positions`/`orders`/`balance`, que permanecen
     ligados exclusivamente a `primarySymbol`.
   - Todos los campos de trading, tiempo actual, timeframe activo, resolucion de replay y
     rangos que ya existen en V1 se preservan sin cambios de forma en V2.

2. **Dibujos como `Record<symbol, DrawingCollection>` (R2/D3), no array plano.**
   - `DrawingCollection { version: number; items: Drawing[] }` reemplaza el `Drawing[]` plano
     de V1. La clave del record es el simbolo al que pertenecen los dibujos (session-scoped
     por simbolo, no por panel: dos paneles distintos que muestren el mismo simbolo comparten
     los mismos dibujos, consistente con que las velas tambien se comparten por simbolo).
   - El campo `version` dentro de `DrawingCollection` existe para permitir evolucion futura del
     formato de un dibujo individual sin requerir un nuevo `schemaVersion` a nivel de Sesion
     completa.
   - Los dibujos permanecen estrictamente session-scoped (non-goal explicito: no hay
     comparticion de dibujos entre sesiones distintas, incluso si ambas muestran el mismo
     simbolo).

3. **Migracion versionada V1 -> V2.**
   - Funcion pura de migracion `migrateV1ToV2(v1: SessionPayloadV1): SessionPayloadV2` ejecutada
     al leer un payload persistido con `schemaVersion` ausente o `1`.
   - Reglas de migracion:
     - `primarySymbol` se deriva del simbolo activo unico que V1 ya manejaba implicitamente
       (V1 es mono-simbolo por diseño, por lo que no hay ambiguedad).
     - `drawings: Drawing[]` (V1) se convierte en `{ [primarySymbol]: { version: 1, items: V1.drawings } }`
       — todos los dibujos existentes se asignan al `primarySymbol`, ya que en V1 no existia
       nocion de dibujos por simbolo distinto del activo.
     - `layout` se sintetiza como un `WorkspaceLayout` de una unica pestaña, una unica celda,
       `GridTemplate: '1'`, con un unico `PanelDescriptor` cuyo `symbol`/`timeframe` son los que
       V1 tenia activos y `linkGroupId: null` (layout de un solo panel = el simbolo activo
       actual, tal como especifica el Documento de Vision).
     - `linkGroups` se inicializa como `[]` (no hay grupos de enlace en V1 por definicion).
   - La migracion es un mapeo puro sin efectos secundarios (no accede a red/IndexedDB
     directamente), para poder testearse de forma aislada.

4. **Tests de round-trip (ida y vuelta).**
   - Para todo `v1: SessionPayloadV1` valido generado en tests, `migrateV1ToV2(v1)` debe
     producir un `SessionPayloadV2` que preserve semanticamente el estado de V1 (mismos
     dibujos bajo `primarySymbol`, mismo simbolo/timeframe activo reflejado en el layout de un
     panel, mismos campos de trading sin alteracion).
   - Adicionalmente, un test de "no regresion tras migracion + guardado": migrar un V1 a V2,
     persistirlo, releerlo, y verificar que el V2 releido es estructuralmente identico al V2
     recien migrado (round-trip de serializacion, no solo de migracion de esquema). Esto cubre
     el riesgo de perdida de datos durante el propio ciclo de sync, no solo durante la
     migracion en memoria.

5. **Extension de `workspace-db` (IndexedDB) y del mapping de `session-sync`.**
   - El esquema de IndexedDB usado como cache local (`workspace-db`) extiende su store de
     Sesion para aceptar la forma V2 completa (incluyendo `layout` y `linkGroups`), manteniendo
     compatibilidad de lectura con registros V1 preexistentes via la migracion del punto 3
     aplicada en el momento de lectura (lazy migration), no mediante un script de migracion
     masiva de la base local.
   - El mapping de `session-sync` (la capa que traduce entre el modelo de Sesion en NgRx y el
     JSONB de Supabase) se extiende para incluir `layout` y `linkGroups` en la serializacion
     hacia/desde Supabase, y para mapear `drawings` en su nueva forma de record. No se crean
     tablas ni columnas Supabase adicionales para layout/linkGroups: viajan dentro del mismo
     campo JSONB de payload que ya existia para V1, preservando el modelo de un unico
     documento JSONB por Sesion.

6. **LWW atomico de un unico payload (D9) — un solo ciclo de sync, no dos.**
   - Esta es la decision central del RFC: `layout`, `linkGroups` y `drawings` NO tienen su
     propio timestamp de LWW ni su propio ciclo de sincronizacion independiente del resto de la
     Sesion. Viajan dentro del mismo `SessionPayloadV2` que se resuelve con la misma logica LWW
     (last-write-wins por timestamp de Sesion completa) ya existente y auditada para V1.
   - La alternativa descartada — sincronizar layout/dibujos en un documento o ciclo separado
     del resto de la Sesion — se rechaza explicitamente porque abre una ventana donde dos
     dispositivos podrian resolver el LWW de "datos de trading" y el LWW de "layout" en
     direcciones distintas, produciendo un estado combinado que nunca existio en ningun
     dispositivo (p. ej. el layout del dispositivo A con los dibujos del dispositivo B, cuando
     en realidad el dispositivo A habia borrado esos dibujos junto con ese layout). Con un
     unico payload y un unico timestamp, el resultado de la resolucion LWW es siempre un estado
     que efectivamente existio integro en algun dispositivo en algun momento.

## Impacto
- **Positivo:** El layout multi-panel, los grupos de enlace y los dibujos por simbolo
  sobreviven a cierre de sesion/cambio de dispositivo, reutilizando integramente la
  infraestructura LWW ya validada en produccion para V1.
- **Riesgo:** Perdida de datos durante la migracion V1 -> V2 si algun campo se omite.
  Mitigacion: tests de round-trip (punto 4) cubren explicitamente la preservacion semantica
  campo por campo.
- **Riesgo:** Desincronizacion entre layout y dibujos si se hubiera optado por dos ciclos de
  sync. Mitigacion: atomicidad de un unico payload (punto 6), decision D9 no negociable dentro
  de este RFC.
- **Compatibilidad:** Lectura de registros V1 preexistentes sigue funcionando indefinidamente
  via migracion lazy; no se requiere una ventana de "todos los usuarios migrados" antes de
  desplegar RFC-011.

## Estado Esperado
Al finalizar, el emulador compilara con `npx tsc -p tsconfig.app.json --noEmit` sin errores;
`migrateV1ToV2` contara con tests de round-trip en verde cubriendo dibujos, layout sintetizado
de un panel, y preservacion de campos de trading; guardar y releer una Sesion con multiples
pestañas/paneles/grupos de enlace producira un `SessionPayloadV2` estructuralmente identico
antes y despues del ciclo completo de persistencia (IndexedDB + Supabase); y una inspeccion
del codigo de `session-sync` confirmara un unico punto de resolucion LWW para el payload
completo, sin un segundo timestamp o ciclo de sincronizacion independiente para
`layout`/`linkGroups`/`drawings`.
