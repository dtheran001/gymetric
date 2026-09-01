# Gymetric

App personal para planificar rutinas de gimnasio, ejecutar sesiones guiadas y seguir progresos por ejercicio.

## Stack

- Expo SDK 54
- React Native 0.81
- React 19.1
- TypeScript

## Estado actual

- Dashboard inicial.
- Rutinas base.
- Biblioteca de ejercicios base y personalizados.
- Creación y edición de ejercicios con grupo muscular, equipo, agarre y foco opcional.
- Eliminación de ejercicios de la biblioteca.
- Creación y edición de rutinas con días sugeridos, ejercicios, orden, descansos y series.
- Colecciones persistentes de rutinas, con creación, asignación, filtros y archivo/restauración del bloque completo sin perder el histórico.
- Notas contextuales por ejercicio dentro de cada rutina, visibles durante el entrenamiento.
- Búsqueda, filtros por grupo muscular y archivo de ejercicios.
- Importación y exportación acumulativa de rutinas en formato JSON de Gymetric.
- Pestaña de dieta actual e histórico, con importación, exportación y selección de dieta activa.
- Eliminación de rutinas.
- Editor de rutina con lista de ejercicios disponibles filtrada y scrollable.
- Configuración de descanso por minutos y segundos.
- Editor de rutina con ejercicios plegables y tipo de serie editable.
- Drag & drop para reordenar ejercicios en el editor de rutinas.
- Manejo del botón atrás en Android para cerrar flujos, volver a Hoy o salir con doble pulsación.
- Ejecución de rutina con series, peso, repeticiones, tipo de serie y descanso.
- Resumen final de entrenamiento con guardar o descartar.
- Actualización de pesos/reps de la rutina al guardar un entrenamiento.
- Temporizador automático tras completar una serie.
- Notificación local con sonido al finalizar el descanso en APK/dev build.
- Controles para sumar, restar o saltar el descanso.
- Vista concentrada y vista general dentro de una sesión activa.
- Registro de repeticiones y peso reales antes de completar cada serie.
- Edicion de peso y repeticiones desde la vista general de rutina.
- Marcado y desmarcado de series completadas desde el tick.
- Temporizador visible tambien en la vista general de rutina.
- Agregado, eliminado y cambio de tipo de serie durante la rutina activa.
- Colores especificos para series warmup, fallo y drop.
- Temporizador fijado en pantalla durante la vista general de rutina.
- Botón para finalizar una rutina antes de tiempo.
- Ajuste de safe area para status bar y navegación inferior.
- Historico de series en memoria.
- Deteccion de record personal por peso y medallas.
- Persistencia local con SQLite para ejercicios, rutinas, sesiones y medallas.

## Comandos

```bash
npm run start
npm run android
npm run web
npx tsc --noEmit
npx eas-cli build -p android --profile preview
```

Para abrir el proyecto en el development build instalado en el móvil:

```bash
npm run dev-client
```

El móvil y el ordenador deben poder comunicarse por la misma red. Los cambios de JavaScript/TypeScript se actualizan sin generar otro APK; solo hace falta reconstruir el development build cuando cambian dependencias o configuración nativa.

## Intercambio de rutinas

La pestaña Rutinas permite exportar la biblioteca a un archivo `gymetric-routines-AAAA-MM-DD.json` e importar archivos del mismo formato sin reemplazar los datos existentes. Los ejercicios coincidentes por nombre y tipo de equipamiento se reutilizan; las rutinas importadas se añaden como nuevas y quedan activas.

La pestaña Dieta utiliza archivos `gymetric-diets-AAAA-MM-DD.json`. Las dietas importadas se añaden al histórico y deben marcarse explícitamente como actuales. Hay un ejemplo completo en `docs/gymetric-diets.example.json` que sirve como contrato para convertir documentos del entrenador.

Los formatos aceptan pesos y repeticiones sin definir, drops al fallo, secuencias intercaladas de series y grupos de alternativas alimentarias. Los planes convertidos del 31-08-26 están disponibles en `docs/generated/`.

## APK de prueba

El proyecto incluye `eas.json` con un perfil `preview` que genera un APK instalable.

```bash
npx eas-cli login
npx eas-cli build -p android --profile preview
```

Al terminar, EAS mostrara un enlace para descargar la APK en el movil.

## Proximos pasos

1. Normalizar el esquema SQLite si el modelo crece.
2. Pulir constructor de rutinas con creación rápida de ejercicio y auto-añadido.
3. Edición de series, descansos y pesos durante la sesión.
4. Estadísticas por ejercicio y semana.
5. Generación de APK con EAS Build.
6. Pulir temporizador en segundo plano con comportamiento nativo completo.
7. Recuperar notificaciones con sonido mediante development build, fuera de Expo Go.
8. Evaluar notificaciones interactivas de entrenamiento con acciones nativas.

## Nota de compatibilidad

El proyecto usa SDK 54 para poder ejecutarse directamente con la version actual de Expo Go disponible en Android. Cuando Expo Go soporte SDK 55 en tu dispositivo, podremos actualizar de nuevo.
