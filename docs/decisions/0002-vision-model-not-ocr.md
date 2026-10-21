# 0002 – Send the image to a vision model, no separate OCR step

Status: accepted

## Context
An OCR-then-LLM pipeline was considered. OCR returns lines of text without column boundaries,
so empty cells disappear and values shift columns. OCR also confuses 0/O and 8/B in codes, and the
LLM cannot check the image. Tesseract-style OCR is too heavy for the Workers free plan.

## Decision
Send the image directly to a vision model and ask for JSON matching a fixed schema
(`EXTRACTION_SCHEMA`). Default model is a free Workers AI vision model set by `VISION_MODEL`.

## Consequences
- One model call per image, table structure preserved.
- Accuracy depends on the chosen model. Changing it requires the accuracy check in testing.md.
