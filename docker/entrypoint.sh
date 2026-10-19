#!/bin/sh
set -eu

# ==============================================================================
#  Configuration d'exécution du back-office.
#
#  Vite remplace `import.meta.env.VITE_*` par des littéraux AU BUILD. Sans ce
#  fichier, il faudrait une image par environnement — donc déployer en
#  production un artefact différent de celui qu'on a validé en recette. Ici,
#  l'image est unique et c'est le conteneur qui dit où est l'API.
#
#  Seules les variables REELLEMENT definies sont ecrites : une variable absente
#  laisse le schema zod appliquer son defaut, au lieu d'injecter une chaine
#  vide qui passerait pour une valeur choisie.
# ==============================================================================

CONFIG_FILE="/usr/share/nginx/html/config.js"

escape() {
  # Une apostrophe ou un antislash dans une valeur casserait le littéral JS.
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e "s/'/\\\\'/g"
}

{
  printf 'window.__APP_CONFIG__ = {\n'
  for name in VITE_API_BASE_URL VITE_APP_NAME VITE_APP_ENV VITE_DEV_TENANT_SLUG VITE_SHOW_ERROR_DETAILS; do
    value=$(printenv "$name" 2>/dev/null || true)
    [ -n "$value" ] && printf "  %s: '%s',\n" "$name" "$(escape "$value")"
  done
  printf '};\n'
} > "$CONFIG_FILE"

# ------------------------------------------------------------------------------
#  CSP : autoriser l'origine de l'API quand elle est sur un autre domaine.
#
#  `VITE_API_BASE_URL=https://impact-api.dev.zeroeau.sn/api/v1` → on ajoute
#  `https://impact-api.dev.zeroeau.sn` à `connect-src`. Une URL relative
#  (`/api/v1`, même origine) n'ajoute rien. Seuls schéma + hôte + port sont
#  retenus : on n'ouvre pas plus que nécessaire.
# ------------------------------------------------------------------------------
TEMPLATES="/etc/nginx/templates"

API_ORIGIN=""
api_url=$(printenv VITE_API_BASE_URL 2>/dev/null || true)
case "$api_url" in
  http://*|https://*)
    API_ORIGIN=$(printf '%s' "$api_url" | sed -E 's#^(https?://[^/]+).*#\1#')
    ;;
esac

# Une origine ne contient ni espace, ni `;`, ni `#` : on refuse plutôt que
# d'injecter n'importe quoi dans un en-tête de sécurité.
case "$API_ORIGIN" in
  *[\ \;\#\'\"]*) echo "[entrypoint] VITE_API_BASE_URL invalide : $api_url" >&2; exit 1 ;;
esac

render() {
  sed "s#__API_ORIGIN__#${API_ORIGIN}#g" "$1" > "$2"
}

if [ -d "$TEMPLATES" ]; then
  mkdir -p /etc/nginx/snippets
  render "$TEMPLATES/security-headers.conf.tpl" /etc/nginx/snippets/security-headers.conf
  render "$TEMPLATES/backoffice.conf.tpl" /etc/nginx/conf.d/default.conf
  echo "[entrypoint] CSP connect-src : 'self' ${API_ORIGIN}"
  nginx -t
fi

echo "[entrypoint] config.js écrit :"
cat "$CONFIG_FILE"

exec "$@"
