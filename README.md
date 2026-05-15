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
- Eliminación de rutinas.
- Editor de rutina con lista de ejercicios disponibles filtrada y scrollable.
- Configuración de descanso por minutos y segundos.
- Editor de rutina con ejercicios plegables y tipo de serie editable.
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
