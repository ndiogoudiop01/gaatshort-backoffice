/** Modèle CSV proposé au téléchargement (BO-17) : en-têtes exacts attendus par l'API + exemple. */
export const IMPORT_TEMPLATE = [
  'series_slug;series_title;synopsis;genres;maturity_rating;release_year;free_episodes;episode_price_coins;poster_url;banner_url;episode_number;episode_title;episode_price_override;video_url',
  ';Ma nouvelle série;Résumé de la série.;drame|romance;13+;2026;5;15;https://cdn.exemple.com/affiche.jpg;;1;Le commencement;;https://serveur.exemple.com/videos/ep1.mp4',
  ';Ma nouvelle série;;;;;;;;;2;;;https://serveur.exemple.com/videos/ep2.mp4',
].join('\r\n');

/** Taille maximale acceptée par l'API (corps JSON à 1 Mo, marge pour l'enveloppe). */
export const MAX_IMPORT_BYTES = 900_000;
