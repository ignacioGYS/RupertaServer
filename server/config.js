export const config = {
  ssh: {
    host: '192.168.1.63',
    port: 22,
    username: 'nacho',
    password: 'igna2606',
    // We can add a timeout to prevent hanging connections
    readyTimeout: 10000
  },
  port: 3001
};
