/** Dev environment. The backend URL is the docker-compose default. */
export const environment = {
  backendUrl: 'http://localhost:8000',
  // shows/hides the "create account" link; mirrors the backend registration gate
  registrationEnabled: true,
  // build-time mode flags (see environment.offline.ts for the static build)
  offlineOnly: false,
  guestModeEnabled: true,
};
