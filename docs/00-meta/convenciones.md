# Convenciones de la base de conocimiento

> **Actualizado:** 2026-09-18 · **Estado:** estable
> **En una frase:** cómo escribimos aquí para que un agente o un humano encuentre lo que
> necesita en 30 segundos y sepa si puede fiarse.

## Plantilla de documento

```markdown
# <Título>

> **Actualizado:** YYYY-MM-DD · **Estado:** borrador | estable | obsoleto
> **En una frase:** <resumen de una línea>

## <contenido>

## Preguntas abiertas
- [ ] ...

## Fuentes
- <título> — <URL> (consultado YYYY-MM-DD)
```

## Reglas

1. **Conclusión primero.** El primer párrafo debe servir aunque no se lea el resto.
2. **Hecho ≠ opinión.** Los hechos llevan fuente; las opiniones del equipo van con
   `> HIPÓTESIS:`; lo no verificado con `[SIN VERIFICAR]`.
3. **Fechas en todo.** Cifras de financiación, número de clientes, plazos regulatorios…
   todo envejece. Sin fecha no vale.
4. **Un tema, un documento.** Si un doc necesita índice interno de más de 8 secciones,
   pártelo.
5. **No duplicar.** Enlaza con rutas relativas.
6. **Nada se borra.** Lo que deja de ser cierto se marca `Estado: obsoleto` con una nota
   de qué lo sustituye.

## Nombres de fichero

- Docs de conocimiento: `NN-slug-kebab-case.md` (el número ordena la lectura).
- Notas de investigación: `YYYY-MM-DD-tema.md`.
- Material crudo en `_inbox/`: `YYYY-MM-DD-origen-tema.ext`
  (ej. `2026-09-18-happyrobot-brief-track.pdf`).
- Decisiones: `NNN-decision-en-una-frase.md`.

## Idioma

Prosa en español. Términos técnicos y de producto en inglés, sin traducir:
*workflow, node, agent, carrier, dispatch, tool call, FDE, track-and-trace, eval*.
