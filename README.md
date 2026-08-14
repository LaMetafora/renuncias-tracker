# Renuncias Tracker

Sitio estatico de La Metafora para registrar renuncias, remociones y nombramientos no concretados del gobierno de Jose Antonio Kast.

El sitio usa `data/cases.json`, generado desde la pestaña `Master` del archivo editorial más reciente en `data/`. La descarga pública apunta a `data/base_renuncias_descarga_publica.xlsx`.

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

Actualizar la pestaña `Master` del archivo editorial, ejecutar:

```text
python scripts/build_cases_from_master.py
```

Luego hacer commit de `data/cases.json`, `data/base_renuncias_descarga_publica.xlsx` y de los cambios del sitio. El archivo editorial fuente no necesita publicarse.
