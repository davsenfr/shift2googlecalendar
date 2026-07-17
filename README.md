# Shift to Google Calendar

Application mobile web NestJS + React pour enregistrer un horaire dans un agenda Google en un clic.

- **Matin court** : 6 h 45 → 13 h 45
- **Matin long** : 6 h 45 → 14 h 45
- **RH, RC ou RF** : événement sur toute la journée
- **Après midi** : 13 h 30 → 21 h 30

Un changement de choix met à jour l’événement créé par l’application, sans doublon. Les changements et suppressions effectués dans Google Calendar sont relus à l’ouverture d’un jour, au retour sur l’onglet et toutes les 15 secondes tant que l’application est visible.

## Installation

Prérequis : Node.js 22 ou plus récent.

```bash
npm install
copy .env.example .env
```

Dans [Google Cloud Console](https://console.cloud.google.com/) :

1. Créez ou sélectionnez un projet.
2. Activez **Google Calendar API**.
3. Configurez l’écran de consentement OAuth. En mode test, ajoutez votre adresse Google comme utilisateur test.
4. Créez un identifiant OAuth de type **Application Web**.
5. Ajoutez `http://localhost:3000/api/auth/google/callback` aux URI de redirection autorisés.
6. Copiez le Client ID et le Client Secret dans `.env`.

L’agenda principal du compte connecté est utilisé par défaut. Pour un autre agenda, renseignez son identifiant dans `GOOGLE_CALENDAR_ID`.

## Lancement local

```bash
npm run dev
```

Ouvrez ensuite `http://localhost:5173`, puis utilisez le bouton **Connecter Google Calendar**. Le backend écoute sur le port 3000 et Vite lui transmet les requêtes `/api`.

## Production

```bash
npm run build
npm start
```

NestJS sert alors le frontend compilé et l’API sur le port `API_PORT`. Adaptez en production :

- `GOOGLE_REDIRECT_URI=https://votre-domaine/api/auth/google/callback`
- `WEB_URL=https://votre-domaine`
- un volume persistant et non public pour `GOOGLE_TOKEN_PATH`
- HTTPS obligatoire

Le jeton OAuth est stocké côté serveur dans `.data/google-tokens.json`, ignoré par Git. Cette version est volontairement mono-utilisateur. Pour plusieurs comptes, remplacez ce stockage fichier par une base chiffrée et associez chaque jeton à une session authentifiée.

## Synchronisation

L’application écrit directement dans Google Calendar et relit Google régulièrement : c’est une synchronisation bidirectionnelle par interrogation. Les événements créés portent une propriété Google privée `shiftToGc=v1`, qui permet de les retrouver même si leur titre ou leurs heures sont ensuite modifiés dans Google.

Les notifications push Google ne sont pas activées ici : elles demandent un endpoint HTTPS public, le renouvellement périodique des canaux et un canal temps réel entre le serveur et le navigateur. Le rafraîchissement de 15 secondes fonctionne aussi en local et ne nécessite aucune infrastructure supplémentaire.
