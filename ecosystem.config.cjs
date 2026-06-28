module.exports = {
  apps: [{
    name: 'ruperta-monitor',
    script: 'server/server.js',
    instances: 1,
    autorestart: true,
    watch: false,
  }],
};
