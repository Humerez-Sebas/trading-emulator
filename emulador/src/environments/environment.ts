/** Dev environment. The backend URL is the docker-compose default. */
export const environment = {
  backendUrl: 'http://localhost:8000',
  // shows/hides the "create account" link; mirrors the backend registration gate
  registrationEnabled: true,
};
