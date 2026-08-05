# Renuncias Tracker

Sitio estatico de La Metafora para registrar renuncias, remociones y nombramientos no concretados del gobierno de Jose Antonio Kast.

Este prototipo usa los cinco casos mas recientes del registro publico original. La version completa debe reemplazar `data/cases.json` con la base final.

## Publicacion

El repo esta preparado para GitHub Pages.

1. Subir estos archivos al repo publico de La Metafora.
2. Ir a `Settings > Pages`.
3. Elegir `GitHub Actions` como fuente.
4. Esperar el deploy.

La URL quedara:

```text
https://lametafora.github.io/renuncias-tracker/
```

Para preservar anonimato operativo, los commits publicos deberian hacerse desde la cuenta `LaMetafora`, no desde una cuenta personal.

## Actualizar datos

Editar `data/cases.json` y hacer commit. El sitio recalcula conteos, graficos y registro automaticamente.
