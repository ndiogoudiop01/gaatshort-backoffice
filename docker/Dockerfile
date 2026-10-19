# syntax=docker/dockerfile:1.7
# ==============================================================================
#  Back-office Gaatshort — image de production
#
#  Deux étages : on compile avec Node, on sert avec nginx. L'image finale ne
#  contient ni Node, ni pnpm, ni les sources — seulement des fichiers statiques.
#  Ce n'est pas qu'une question de taille : tout ce qui n'est pas dans l'image
#  ne peut pas être exploité depuis l'image.
# ==============================================================================

# ------------------------------- build ---------------------------------------
FROM node:22-alpine AS build

WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
ENV CI=true

RUN corepack enable

# Les manifestes d'abord : tant qu'ils ne changent pas, Docker réutilise la
# couche d'installation, qui est de loin la plus lente.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prefer-offline

COPY . .

# `pnpm build` lance `vue-tsc` avant `vite build` : une erreur de types arrête
# la construction de l'image. Une image ne doit pas pouvoir être plus laxiste
# que la CI.
RUN pnpm build

# ------------------------------- runtime -------------------------------------
FROM nginx:1.27-alpine AS runtime

# `tini` : nginx n'est pas PID 1 ici (l'entrypoint l'est). Sans initialiseur,
# les signaux d'arrêt de Docker Swarm ne lui parviendraient pas proprement et
# CapRover attendrait le délai de grâce à chaque déploiement.
RUN apk add --no-cache tini

# Gabarit, pas configuration finale : l'entrypoint en dérive
# /etc/nginx/conf.d/default.conf à CHAQUE démarrage (origine de l'API dans la
# CSP). Partir d'un gabarit intact rend le redémarrage idempotent.
COPY docker/nginx.conf /etc/nginx/templates/backoffice.conf.tpl
COPY docker/security-headers.conf /etc/nginx/templates/security-headers.conf.tpl
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

COPY --from=build /app/dist /usr/share/nginx/html

# La sonde est déclarée sur le SERVICE, pas dans l'image — même raison que
# côté backend : une image partagée entre plusieurs usages ne doit pas imposer
# sa sonde à chacun d'eux (cf. docker-compose.yml).

EXPOSE 80

ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
