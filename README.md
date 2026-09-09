# EDITIO

Creator editing platform — choose AI, Human, or AI + Human editing.

## Product direction

- Simple account-based login, no creator profile setup required.
- Creator selects AI Edit, Human Edit, or AI + Human.
- Creator answers a structured editing brief and uploads raw footage/reference material.
- Human orders are managed through an admin workflow and assigned to trusted editors.
- AI editing is designed as an assisted pipeline first: brief + footage analysis → editing plan → deterministic render.
- Payments and ad/reward systems will be added incrementally after the core workflow is stable.

## Initial stack

- Next.js + TypeScript for web
- Prisma + PostgreSQL for application data
- Object storage for raw/final video files
- FFmpeg-based rendering worker for deterministic video operations
- Pluggable AI provider for brief/footage analysis and captions

## Development

The repository is intentionally initialized from a clean base. We will add functionality one slice at a time and keep production-sensitive integrations behind environment variables.
