module.exports = {
  apps: [
    {
      name: 'edudev',
      cwd: '/var/www/edudev/backend',
      script: 'src/server.js',
      exec_mode: 'cluster',
      instances: 2,
      watch: false,
      max_memory_restart: '350M',
      kill_timeout: 10000,
      listen_timeout: 10000,
      env: {
        NODE_ENV: 'production',
      },
      env_production: {
        NODE_ENV: 'production',
      },
      error_file: '/var/log/edudev/backend-error.log',
      out_file: '/var/log/edudev/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },
  ],
};
