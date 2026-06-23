function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    throw new Error(`${name} environment variable is required`);
  }
  return v;
}

function optional(name: string, fallback = ''): string {
  return process.env[name]?.trim() || fallback;
}

export const env = {
  port: Number(optional('PORT', '3001')),
  jwtSecret: required('JWT_SECRET'),
  supabaseUrl: required('SUPABASE_URL'),
  supabaseServiceKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  internalSecret: required('INTERNAL_API_SECRET'),
  redisUrl: optional('REDIS_URL'),
  allowedOrigins: optional('ALLOWED_ORIGINS')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  nodeEnv: optional('NODE_ENV', 'development'),
};

export const isProd = env.nodeEnv === 'production';
