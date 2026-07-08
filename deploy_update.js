import { sshManager } from './server/sshClient.js';

async function updateServer() {
  try {
    console.log('🔌 Conectando al servidor...');

    // Buscar el directorio del proyecto
    const findOutput = await sshManager.exec('find ~ -maxdepth 4 -name "RupertaServer" -type d | head -n 1');
    const remotePath = findOutput.trim();
    if (!remotePath) throw new Error('No se encontró el directorio en el servidor.');

    console.log(`📂 Ejecutando deploy en: ${remotePath}`);

    // Pull de cambios
    console.log('⬇️  Descargando código (git pull)...');
    const pullOut = await sshManager.exec(`cd ${remotePath} && git pull origin main`);
    console.log(pullOut);

    // Build y restart con Docker Compose
    console.log('🐳 Reconstruyendo contenedores (docker compose build)...');
    const buildOut = await sshManager.exec(`cd ${remotePath} && docker compose build 2>&1`);
    console.log(buildOut.slice(-500)); // últimas líneas

    console.log('🚀 Levantando contenedores (docker compose up -d)...');
    const upOut = await sshManager.exec(`cd ${remotePath} && docker compose up -d 2>&1`);
    console.log(upOut);

    console.log('✅ Servidor actualizado exitosamente!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error actualizando el servidor:', err.message);
    process.exit(1);
  }
}

updateServer();
