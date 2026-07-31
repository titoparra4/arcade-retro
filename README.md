## Arcade Vault

Es una plataforma para jugar online y competir por la mayor cantidad de puntos.

## Usa Spec Driven Design

Basado en /spec y /spec-impl

Siguiendo las buenas practicas recomendadas aquí:
https://github.com/Klerith/fernando-skills

## Skills usadas

```bash
npx skills@latest add Klerith/fernando-skills
```

## Commands

```bash
npm run dev      # Dev server (Turbopack, default in Next 16)
npm run build    # Production build — no longer runs ESLint automatically
npm run lint     # ESLint (flat config, eslint.config.mjs)
npm start        # Serve production build
```

## Entorno

Copia `.env.template` a `.env.local` y rellena los valores. `.env.local` está ignorado por git;
`.env.template` **no** lo está, así que solo puede contener marcadores.

## Despliegue

Hay dos proyectos de Supabase: uno de desarrollo y uno de producción. Todo lo necesario para llevar
el esquema, los datos y la configuración de uno a otro está en **[`references/produccion/`](references/produccion/)**:

| Archivo               | Qué es                                                     |
| --------------------- | ---------------------------------------------------------- |
| `RUNBOOK.md`          | La guía. **Empieza aquí.**                                 |
| `01-esquema.sql`      | Esquema completo: tablas, RLS, policies, grants, funciones |
| `02-datos-games.sql`  | Catálogo de juegos (8 filas)                               |
| `03-verificacion.sql` | Comprobaciones de solo lectura post-despliegue             |

La configuración de autenticación (Site URL, Redirect URLs, plantillas de email y OAuth) **no se
migra por SQL**: es un checklist manual en el dashboard, detallado en el runbook.
