# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS base

WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

FROM base AS build

COPY . .
RUN pnpm install --frozen-lockfile

ARG NEXT_PUBLIC_PRIVY_APP_ID
ARG NEXT_PUBLIC_MORTEM_SERVER_URL
ARG NEXT_PUBLIC_MORTEM_INGEST_URL
ARG NEXT_PUBLIC_MORTEM_SITE_URL
ENV NEXT_PUBLIC_PRIVY_APP_ID=$NEXT_PUBLIC_PRIVY_APP_ID
ENV NEXT_PUBLIC_MORTEM_SERVER_URL=$NEXT_PUBLIC_MORTEM_SERVER_URL
ENV NEXT_PUBLIC_MORTEM_INGEST_URL=$NEXT_PUBLIC_MORTEM_INGEST_URL
ENV NEXT_PUBLIC_MORTEM_SITE_URL=$NEXT_PUBLIC_MORTEM_SITE_URL

RUN pnpm build

FROM base AS runtime

ENV NODE_ENV=production

# The build outputs and workspace dependencies are kept together so each service can
# resolve internal @mortemlabs/* packages at runtime.
COPY --from=build /app /app

FROM runtime AS dashboard

EXPOSE 3000
CMD ["pnpm", "--filter", "@mortemlabs/dashboard", "start"]

FROM runtime AS server

EXPOSE 3001
CMD ["pnpm", "--filter", "@mortemlabs/server", "start"]

FROM runtime AS ingest

EXPOSE 4001
CMD ["pnpm", "--filter", "@mortemlabs/ingest", "start"]

FROM runtime AS enrichment-worker

EXPOSE 4002
CMD ["pnpm", "--filter", "@mortemlabs/enrichment-worker", "start"]
