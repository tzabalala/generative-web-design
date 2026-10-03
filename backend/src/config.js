// Which Claude model the backend talks to.
//
//   MODEL_PROFILE=dev   (default)  ->  CLAUDE_MODEL_DEV   (Haiku: cheap and fast, for development)
//   MODEL_PROFILE=demo             ->  CLAUDE_MODEL_DEMO  (Sonnet: stronger, for the final demo)
//
// Built-in defaults are used when the matching variable is missing from .env, so the
// app still starts. An unknown profile name is an error on purpose: silently falling
// back to the cheap model during a demo would be easy to miss.
const DEFAULT_MODELS = {
  dev: 'claude-haiku-4-5-20251001',
  demo: 'claude-sonnet-5',
};

export function modelProfile() {
  const raw = (process.env.MODEL_PROFILE || 'dev').trim().toLowerCase();
  if (raw !== 'dev' && raw !== 'demo') {
    throw new Error(`MODEL_PROFILE must be "dev" or "demo" (got "${process.env.MODEL_PROFILE}")`);
  }
  return raw;
}

export function resolveModel() {
  const profile = modelProfile();
  const fromEnv = profile === 'demo' ? process.env.CLAUDE_MODEL_DEMO : process.env.CLAUDE_MODEL_DEV;
  return (fromEnv && fromEnv.trim()) || DEFAULT_MODELS[profile];
}
