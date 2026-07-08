import { sshManager } from './server/sshClient.js';

async function updateServer() {
  try {
    console.log('🔌 Conectando al servidor...');
    
    // Buscar carpeta
    const findOutput = await sshManager.exec('find ~ -maxdepth 4 -name "RupertaServer" -type d | head -n 1');
    const remotePath = findOutput.trim();
    if (!remotePath) throw new Error('No se encontró el directorio en el servidor.');
    
    console.log(`📂 Ejecutando deploy en: ${remotePath}`);
    
    // Buscar npm
    console.log('🔍 Buscando Node.js (npm)...');
    const npmPathOutput = await sshManager.exec(`bash -lc 'which npm || find ~/.nvm/versions/node -name npm -type f -executable | head -n 1'`);
    const npmPath = npmPathOutput.trim();
    if (!npmPath) throw new Error('No se encontró npm en el servidor.');
    
    // Pull changes
    console.log('⬇️ Descargando código (git pull)...');
    await sshManager.exec(`cd ${remotePath} && git pull origin main`);

    // Install deps
    console.log('📦 Instalando dependencias (npm install)...');
    await sshManager.exec(`cd ${remotePath} && ${npmPath} install`);

    // Build frontend
    console.log('🏗️ Compilando frontend (npm run build)...');
    await sshManager.exec(`cd ${remotePath} && ${npmPath} run build`);

    // Restart pm2
    console.log('♻️ Reiniciando servidor en PM2...');
    await sshManager.exec(`cd ${remotePath} && pm2 restart ruperta-monitor || pm2 restart server/server.js || pm2 restart all`);
    
    console.log('✅ Servidor actualizado exitosamente!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error actualizando el servidor:', err.message);
    process.exit(1);
  }
}

updateServer();
